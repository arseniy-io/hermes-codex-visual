import assert from 'node:assert/strict'

const timingMetrics = ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration']

export async function measureSidebarScope({ app, page, expect, navigation }) {
  await page.bringToFront()
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' })
  await navigation('new-session').click()
  const rows = ['new-session', 'capabilities', 'messaging', 'artifacts', 'cron'].map(name => navigation(name).first())
  const points = await Promise.all(rows.map(async row => {
    const box = await row.boundingBox()
    assert(box, 'Expected a visible navigation row')
    return [box.x + box.width * .65, box.y + box.height / 2]
  }))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  const settle = () => page.evaluate(() => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The benchmark needs a rendering foreground window')), 1000)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(timeout)
      resolve()
    }))
  }))
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function sample(action) {
    await page.mouse.move(points[0][0] + 650, points[0][1])
    await pause(180)
    await settle()
    await page.evaluate(() => {
      const frames = []
      window.hcvSampleFrames = frames
      let previous
      function collect(time) {
        if (window.hcvSampleFrames !== frames) return
        if (previous !== undefined) frames.push(time - previous)
        previous = time
        requestAnimationFrame(collect)
      }
      requestAnimationFrame(collect)
    })
    const start = await metrics()
    await action()
    await settle()
    const end = await metrics()
    const frames = await page.evaluate(() => {
      const result = window.hcvSampleFrames
      delete window.hcvSampleFrames
      return result.sort((a, b) => a - b)
    })
    return {
      frames: frames.length,
      p95FrameMs: Number(frames.at(Math.floor(frames.length * .95))?.toFixed(1)),
      framesOver32ms: frames.filter(ms => ms > 32).length,
      ...Object.fromEntries(timingMetrics.map(key => [key + 'Ms', Math.round((end[key] - start[key]) * 1000)])),
    }
  }
  try {
    const sweeps = async () => {
      const pass = [...points, ...points.slice(0, -1).reverse()]
      for (let run = 0; run < 7; run++) {
        for (const [x, y] of pass) {
          await page.mouse.move(x, y)
          await pause(18)
        }
      }
    }
    const hover = [await sample(sweeps), await sample(sweeps)]
    console.log('Sidebar sweeps finished')
    const switches = await sample(async () => {
      for (let run = 0; run < 3; run++) {
        for (const name of ['messaging', 'artifacts']) {
          await navigation(name).click()
          await expect(page).toHaveURL(new RegExp('#/' + name))
        }
        await navigation('new-session').click()
        await expect(page.locator('[data-slot="composer-rich-input"]:visible').first()).toBeVisible()
      }
    })
    console.log('Screen switches finished')
    const idle = await sample(() => pause(1000))
    const { JSHeapUsedSize } = await metrics()
    const memory = await app.evaluate(({ app }) => app.getAppMetrics()
      .filter(metric => ['Tab', 'GPU'].includes(metric.type))
      .map(metric => ({ type: metric.type, workingSetMiB: Math.round(metric.memory.workingSetSize / 1024) })))
    const sheets = await page.evaluate(() => Array.from(document.querySelectorAll('head style')).flatMap(el =>
      el.getAttributeNames().filter(name => name.startsWith('data-hcv-') || name === 'data-hermes-codex-visual')))
    return { hover, switches, idle, memory, jsHeapMiB: Math.round(JSHeapUsedSize / 1048576), sheets }
  } finally {
    await cdp.detach()
  }
}

export async function sidebarMasks(page, navigation) {
  const masks = []
  for (const name of ['new-session', 'capabilities', 'messaging', 'artifacts', 'cron']) {
    masks.push(await navigation(name).first().evaluate(el => getComputedStyle(el, '::before').maskImage))
  }
  const project = page.locator('[data-hcv-project-row] :is(.codicon-folder-library, .codicon-repo):visible').first()
  masks.push(await project.evaluate(el => getComputedStyle(el, '::before').maskImage))
  assert(masks.every(mask => mask.startsWith('url(')), 'Expected local sidebar icon masks')
  return masks
}

export async function verifyStyleScope({ page, expect, navigation, openThemeSettings, closeSettings, themeCard }) {
  const has = marker => page.locator('head style[' + marker + ']')
  const scoped = [
    'data-hcv-settings-providers', 'data-hcv-settings-special', 'data-hcv-interface-catalog',
    'data-hcv-interface-popups', 'data-hcv-turn-styles',
  ]
  await navigation('new-session').click()
  for (const marker of scoped) await expect(has(marker)).toHaveCount(0)
  await expect(has('data-hcv-composer')).toHaveCount(1)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const row = navigation('artifacts')
  await row.hover()
  const fill = row.locator('[data-hcv-sidebar-fill]')
  await expect(row).toHaveCSS('transition-property', 'none')
  await expect(fill).toHaveCSS('transition-property', 'opacity')
  await expect(fill).toHaveCSS('transition-duration', '0.15s')
  await expect(fill).toHaveCSS('background-color', 'rgb(41, 41, 41)')
  await expect(fill).toHaveCSS('opacity', '1')
  await expect(row).toHaveAttribute('data-state', 'closed')
  await expect(row).not.toHaveAttribute('aria-describedby', /.+/)
  const project = page.locator('[data-hcv-project-name]:visible').first()
  await project.hover()
  await expect(page.locator('[data-hcv-project-preview]:visible')).toBeVisible()
  const projectRow = project.locator('xpath=ancestor::*[@data-hcv-project-row][1]')
  await expect(projectRow).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.08)')
  const actions = projectRow.locator('[data-row-actions] button[aria-haspopup="menu"]').first()
  await actions.press('Enter')
  await expect(actions).toHaveAttribute('aria-expanded', 'true')
  await expect(has('data-hcv-interface-popups')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(has('data-hcv-interface-popups')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await row.hover()
  await expect(row).toHaveCSS('transition-property', 'none')
  await expect(fill).toHaveCSS('transition-property', 'none')
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/artifacts/)
  await expect(has('data-hcv-desktop-pages')).toHaveCount(1)
  await expect(has('data-hcv-interface-catalog')).toHaveCount(0)
  await navigation('capabilities').click()
  await expect(has('data-hcv-interface-catalog')).toHaveCount(1)
  await expect(has('data-hcv-desktop-pages')).toHaveCount(1)
  await navigation('new-session').click()
  await openThemeSettings()
  await expect(has('data-hcv-settings')).toHaveCount(1)
  await expect(has('data-hcv-interface-overlays')).toHaveCount(1)
  await expect(has('data-hcv-settings-providers')).toHaveCount(0)
  await page.evaluate(() => { location.hash = '/settings?tab=providers' })
  await expect(has('data-hcv-settings-providers')).toHaveCount(1)
  await closeSettings()
  await expect(has('data-hcv-settings-providers')).toHaveCount(0)
  await expect(has('data-hcv-settings')).toHaveCount(1)
  await expect(has('data-hcv-interface-overlays')).toHaveCount(1)
  await openThemeSettings()
  await themeCard('Nous').click()
  await expect(has('data-hermes-codex-visual')).toHaveCount(0)
  await expect(page.locator('head style[data-hcv-interface], head style[data-hcv-settings], head style[data-hcv-composer]')).toHaveCount(0)
  await themeCard('Codex').click()
  await expect(has('data-hcv-settings')).toHaveCount(1)
  await closeSettings()
  await expect(has('data-hcv-settings')).toHaveCount(1)
  await expect(has('data-hcv-interface-overlays')).toHaveCount(1)
}
