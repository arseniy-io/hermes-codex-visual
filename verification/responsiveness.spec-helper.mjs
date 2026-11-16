import assert from 'node:assert/strict'

const metrics = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount']

export async function installCatalogFixture(page, { withArtwork = false } = {}) {
  const plugins = Array.from({ length: 180 }, (_, index) => ({
    name: 'Fixture plugin ' + index, identifier: 'fixture-' + index, tier: 'community',
    category: index % 2 === 0 ? 'Automation' : 'General',
    description: 'Catalog entry for measuring layout and navigation. '.repeat(3),
  }))
  const skills = Array.from({ length: 1800 }, (_, index) => ({
    name: 'Fixture skill ' + index, identifier: 'fixture-' + index, source: 'fixture',
    category: 'General', description: 'Catalog entry for measuring search and navigation. '.repeat(2),
  }))
  if (withArtwork) {
    const image = 'https://raw.githubusercontent.com/hermes-codex-visual-fixture/catalog/main/example.png'
    plugins[0].image = image
    await page.route(image, route => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmf0AAAAASUVORK5CYII=', 'base64'),
    }))
  }
  await page.addInitScript(catalogs => {
    const request = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href)
      const match = url.pathname.match(/^(?:\/hermes-agent)?\/docs\/api\/(plugins|skills)\.json$/)
      if (match && ['hermes-agent.nousresearch.com', 'nousresearch.github.io'].includes(url.hostname)) {
        return Promise.resolve(Response.json(catalogs[match[1]]))
      }
      return request(input, init)
    }
  }, { plugins, skills })
}

function summarizeProfile({ nodes, samples, timeDeltas }) {
  const byId = new Map(nodes.map(node => [node.id, node.callFrame]))
  const times = new Map()
  for (const [index, id] of samples.entries()) {
    const frame = byId.get(id)
    if (!frame || frame.functionName === '(idle)') continue
    const source = frame.url.startsWith('blob:') ? 'plugin'
      : frame.url.startsWith('file:') ? 'desktop' : frame.url ? 'script' : 'engine'
    const key = source + '/' + (frame.functionName || '(anonymous)') + ':' + (frame.lineNumber + 1)
    times.set(key, (times.get(key) || 0) + timeDeltas[index] / 1000)
  }
  return [...times.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([name, ms]) => [name, Math.round(ms)])
}

async function traceSelectors(cdp, action) {
  const totals = new Map()
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      for (const row of event.args?.selector_stats?.selector_timings || []) {
        const prior = totals.get(row.selector) || { ms: 0, attempts: 0 }
        prior.ms += row['elapsed (us)'] / 1000
        prior.attempts += row.match_attempts
        totals.set(row.selector, prior)
      }
    }
  })
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-blink.debug',
  })
  const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
  try {
    await action()
  } finally {
    await cdp.send('Tracing.end')
    await done
  }
  return [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 16)
}

async function toggleInterfaceRules(page, group, restore = false) {
  await page.evaluate(({ group, restore }) => {
    if (restore) {
      for (const [rule, selector] of window.hcvMutedRules) rule.selectorText = selector
      delete window.hcvMutedRules
      return
    }
    const matches = {
      catalog: selector => selector.includes('data-hcv-screen="capabilities"'),
      underline: selector => selector.includes("[class*=\":underline\"]"),
      hover: selector => selector.includes(':hover'),
    }[group]
    const muted = []
    function visit(rules) {
      for (const rule of rules) {
        if (rule.selectorText && matches(rule.selectorText)) {
          muted.push([rule, rule.selectorText])
          rule.selectorText = ':not(*)'
        }
        if (rule.cssRules) visit(rule.cssRules)
      }
    }
    visit(document.querySelector('style[data-hcv-interface]').sheet.cssRules)
    window.hcvMutedRules = muted
  }, { group, restore })
}

export async function measureResponsiveness({ page, expect, navigation, selectors, ablate }) {
  await page.bringToFront()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const pluginTab = page.locator('[data-tour="tab-plugins"]:visible')
  const catalog = page.locator('[data-catalog-card]:visible')
  const fixtureCard = catalog.filter({ hasText: 'Fixture plugin' }).first()
  const composer = page.locator('[data-slot="composer-rich-input"]:visible')
  const readFrames = async () => {
    const painted = await page.evaluate(() => new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), 2000)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(timeout)
        resolve(true)
      }))
    }))
    assert(painted, 'The benchmark window must render frames in the foreground')
  }
  const openCatalog = async () => {
    await navigation('capabilities').click()
    if (await pluginTab.getAttribute('data-active') !== 'true') await pluginTab.click()
    const search = page.getByPlaceholder(/^(Поиск плагинов|Search plugins)/i).first()
    if (await search.inputValue()) await search.clear()
    await expect(fixtureCard).toBeVisible()
  }
  const openChat = async () => {
    await navigation('new-session').click()
    await expect(composer.first()).toBeVisible()
  }
  await openCatalog()
  await openChat()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
  const readMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(row => [row.name, row.value]))
  const measure = async (action) => {
    const start = await readMetrics()
    await cdp.send('Profiler.start')
    await page.evaluate(() => {
      const frames = []
      window.hcvPerfFrames = frames
      let last
      function record(now) {
        if (window.hcvPerfFrames !== frames) return
        if (last !== undefined) frames.push(now - last)
        last = now
        requestAnimationFrame(record)
      }
      requestAnimationFrame(record)
    })
    await action()
    await readFrames()
    const frames = await page.evaluate(() => {
      const frames = window.hcvPerfFrames
      delete window.hcvPerfFrames
      return frames
    })
    const { profile } = await cdp.send('Profiler.stop')
    const end = await readMetrics()
    const ordered = [...frames].sort((a, b) => a - b)
    return {
      frames: frames.length,
      p95FrameMs: ordered[Math.floor(ordered.length * .95)],
      framesOver32ms: frames.filter(ms => ms > 32).length,
      metrics: Object.fromEntries(metrics.map(key => [key, Math.round((end[key] - start[key]) * (key.endsWith('Duration') ? 1000 : 1))])),
      hot: summarizeProfile(profile),
    }
  }
  try {
    const hover = await measure(async () => {
      for (let run = 0; run < 3; run++) {
        await page.mouse.move(160, 125)
        await page.mouse.move(160, 480, { steps: 26 })
        await page.mouse.move(300, 500, { steps: 8 })
      }
    })
    const cycle = async () => {
      await openCatalog()
      await page.mouse.move(440, 480)
      await page.mouse.move(1100, 520, { steps: 18 })
      await navigation('artifacts').click()
      await expect(page).toHaveURL(/#\/artifacts(?:[/?#]|$)/)
      await openChat()
    }
    const switchTabs = async () => {
      for (let run = 0; run < 4; run++) await cycle()
    }
    const tabs = await measure(switchTabs)
    const ablation = {}
    if (ablate === 'sheets') {
      for (const marker of ['hcv-interface', 'hcv-chrome-styles', 'hermes-codex-visual']) {
        const sheet = page.locator(`style[data-${marker}]`)
        await sheet.evaluate(node => { node.sheet.disabled = true })
        try {
          await readFrames()
          ablation[marker] = (await measure(switchTabs)).metrics
        } finally {
          await sheet.evaluate(node => { node.sheet.disabled = false })
          await readFrames()
        }
      }
    } else if (ablate === 'rules') {
      for (const group of ['catalog', 'underline', 'hover']) {
        await toggleInterfaceRules(page, group)
        try {
          await readFrames()
          ablation[group] = (await measure(switchTabs)).metrics
        } finally {
          await toggleInterfaceRules(page, group, true)
          await readFrames()
        }
      }
    }
    let selectorStats
    if (selectors) {
      await openCatalog()
      await readFrames()
      selectorStats = await traceSelectors(cdp, async () => {
        await page.mouse.move(430, 480)
        await page.mouse.move(1080, 480, { steps: 3 })
        await readFrames()
      })
    }
    return { hover, tabs, selectorStats, ablation: ablate ? ablation : undefined }
  } finally {
    await cdp.detach()
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
}
