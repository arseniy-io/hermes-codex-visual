import assert from 'node:assert/strict'
import { verifyThreadTimeline } from './thread-timeline.spec-helper.mjs'

const longTitle = 'Длинное название чата для проверки плавного затухания в проекте и верхней вкладке'
const longReply = 'Ответ 60. Контрольный текст'
const shortReply = 'Тестовый чат готов к проверке.'
const tabStrip = '[data-zone-tabstrip="grp-main"]'
const chatSurface = '[data-chat-surface]:not([data-pane-hidden] *, [hidden] *)'
const rowOf = button => button.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," row-hover ")][1]')
const idleDot = 'span[aria-hidden="true"][class~="size-1"][class~="rounded-full"]'

async function sampleMarquee(label) {
  return label.evaluate((node) => {
    const content = node.querySelector('.hover-marquee-inner')
    const [animation] = content.getAnimations()
    if (!animation) return null
    const [mask] = node.getAnimations()
    const duration = Number(animation.effect.getComputedTiming().duration)
    const zoom = node.currentCSSZoom || 1
    const padding = parseFloat(getComputedStyle(node).paddingInlineStart) || 0
    const distance = (content.getBoundingClientRect().width - node.getBoundingClientRect().width) / zoom + padding
    const { animationName, animationTimingFunction, animationIterationCount, animationFillMode } = getComputedStyle(content)
    animation.pause()
    mask?.pause()
    const samples = [0, 349, 350 + (duration - 350) / 2, duration, duration + 500].map(time => {
      animation.currentTime = time
      if (mask) mask.currentTime = time
      const transform = getComputedStyle(content).transform
      return { time, x: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41, mask: getComputedStyle(node).maskSize }
    })
    return { animationName, animationTimingFunction, animationIterationCount, animationFillMode, distance, duration,
      fontSize: parseFloat(getComputedStyle(content).fontSize), samples }
  })
}

export async function verifySessionNavigation({ app, page, expect, projectChat, screenshot, prompt, release, openThemeSettings, closeSettings, themeCard }) {
  const checking = process.env.HERMES_VISUAL_NAVIGATION_BEFORE !== '1'
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' })
  const folder = page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ })
  const long = projectChat(longTitle).first()
  const short = projectChat('Ревью интерфейса').first()
  if (!await long.isVisible()) await folder.click()
  const shortRow = rowOf(short)
  const longLabel = long.locator('.hover-marquee')
  const tabs = page.locator(tabStrip).getByRole('tab')
  const longTab = tabs.filter({ hasText: longTitle })
  const shortTab = tabs.filter({ hasText: 'Ревью интерфейса' })
  const geometry = label => label.evaluate(node => {
    const css = getComputedStyle(node)
    return { visibleWidth: node.clientWidth, textWidth: node.scrollWidth, overflow: css.textOverflow, mask: css.maskImage }
  })
  const spinner = row => row.evaluate(node => {
    const result = getComputedStyle(node, '::after')
    return { name: result.animationName, mask: result.maskImage, width: result.width, duration: result.animationDuration, easing: result.animationTimingFunction }
  })
  const renderedAge = row => row.locator('time[datetime]').count().then(async n => ({
    elements: n, visible: await row.locator('time[datetime]:visible').count(),
  }))
  const shortDot = shortRow.locator(idleDot).first()
  const sidebar = { label: await geometry(longLabel), age: await renderedAge(shortRow), dot: await shortDot.evaluate(dot => getComputedStyle(dot).opacity) }
  if (process.env.HERMES_VISUAL_NAVIGATION_OBSERVE === '1') {
    const row = await observeProjectRow({ page, expect, long, short, shortRow, screenshot, cdp })
    if (checking) {
      for (const state of ['idle', 'hover', 'selected']) {
        assert.equal(row[state].labelColor, state === 'selected' ? 'rgb(223, 223, 223)' : 'rgba(223, 223, 223, 0.8)', `Chat title color in ${state}`)
        assert.equal(row[state].folderColor, 'rgba(223, 223, 223, 0.8)', `Project title color in ${state}`)
      }
    }
    await cdp.detach()
    return { sidebar, row }
  }
  const threadTimeline = checking ? await verifyThreadTimeline({ page, expect, projectChat, screenshot }) : undefined
  const recents = page.locator('[data-hcv-recents-toggle]')
  const recentChat = title => page.locator('[data-hcv-recents-list]').getByRole('button', { name: title, exact: true })
  const openRecents = async () => {
    if (await recents.getAttribute('aria-expanded') !== 'true') await recents.click()
    await expect(recentChat(longTitle)).toBeVisible()
  }
  await openRecents()
  const recentLongRow = rowOf(recentChat(longTitle))
  const recentShortRow = rowOf(recentChat('Ревью интерфейса'))
  const recentLabel = recentLongRow.locator('.hover-marquee')
  const recentDot = recentShortRow.locator(idleDot).first()
  sidebar.recent = { label: await geometry(recentLabel), age: await renderedAge(recentShortRow),
    dot: await recentDot.evaluate(dot => getComputedStyle(dot).opacity) }
  if (checking) {
    await expect(longLabel).toHaveAttribute('data-hcv-title-overflow', '')
    assert.match((await geometry(longLabel)).mask, /linear-gradient/)
    await expect(short.locator('.hover-marquee')).toHaveCSS('mask-image', 'none')
    await expect(shortDot).toHaveCSS('opacity', '0')
    assert.equal(sidebar.age.visible, 0)
    await expect(recentLabel).toHaveAttribute('data-hcv-title-overflow', '')
    await expect(recentDot).toHaveCSS('opacity', '0')
    assert.equal(sidebar.recent.age.visible, 0)
    await expect(shortRow.locator('.hover-marquee-inner')).toHaveCSS('color', 'rgba(223, 223, 223, 0.8)')
    await expect(recentShortRow.locator('.hover-marquee-inner')).toHaveCSS('color', 'rgba(223, 223, 223, 0.8)')
    await expect(folder).toHaveCSS('color', 'rgba(223, 223, 223, 0.8)')
  }

  for (const [kind, row, label] of [['project', rowOf(long), longLabel], ['recent', recentLongRow, recentLabel]]) {
    const content = label.locator('.hover-marquee-inner')
    if (checking) {
      // Hover the row's left inset, clear of the native title's pointer listener.
      await row.hover({ position: { x: 2, y: 12 } })
      await expect(content).toHaveCSS('animation-name', 'hcv-chat-title-scroll')
      await expect(content).toHaveCSS('color', 'rgba(223, 223, 223, 0.8)')
    } else await label.hover()
    const motion = await sampleMarquee(label)
    sidebar[kind + 'Motion'] = motion
    if (checking) {
      assert.equal(motion.animationIterationCount, '1')
      assert.equal(motion.animationFillMode, 'forwards')
      assert.match(motion.animationTimingFunction, /^linear\(/)
      assert.equal(motion.duration, Math.round(350 + motion.distance / (motion.fontSize * 2) * 1000), `${kind}: ${JSON.stringify(motion)}`)
      const [start, held, middle, end, settled] = motion.samples
      assert.equal(start.x, 0)
      assert.equal(held.x, 0)
      assert(middle.x < -motion.distance / 2 && middle.x > -motion.distance)
      assert(Math.abs(end.x + motion.distance) < 0.05)
      assert.equal(settled.x, end.x)
      assert.equal(held.mask, '100% 100%')
      assert.notEqual(end.mask, held.mask)
      const clip = await row.boundingBox()
      await screenshot(`session-navigation-title-${kind}.png`, { clip, animations: 'allow' })
    }
    await page.mouse.move(2, 2)
    if (checking) {
      await expect(content).toHaveCSS('animation-name', 'none')
      await expect(content).toHaveCSS('transform', 'none')
      await row.hover({ position: { x: 2, y: 12 } })
      await expect(content).toHaveCSS('animation-name', 'hcv-chat-title-scroll')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(content).toHaveCSS('animation-name', 'none')
      await page.mouse.move(2, 2)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
  }

  async function sample(action, expected) {
    await page.evaluate(({ expected, surface }) => {
      const state = { started: performance.now(), emptyFrames: 0, loadingFrames: 0, firstComposer: null, firstHistory: null, styleChanges: [], frame: 0 }
      const observer = new MutationObserver(records => {
        for (const { addedNodes, removedNodes } of records) {
          for (const [verb, nodes] of [['add', addedNodes], ['remove', removedNodes]]) {
            for (const node of nodes) if (node instanceof HTMLStyleElement) {
              state.styleChanges.push(verb + ':' + [...node.attributes].map(item => item.name).join(','))
            }
          }
        }
      })
      observer.observe(document.head, { childList: true })
      state.observer = observer
      window.hcvNavigationSample = state
      function frame() {
        const elapsed = performance.now() - state.started
        const visible = [...document.querySelectorAll(surface)]
        if (visible.some(chat => chat.querySelector('[data-slot="composer-rich-input"]'))) state.firstComposer ??= elapsed
        const targetHistory = visible.some(chat => chat.querySelector('[data-slot="aui_thread-content"]')?.textContent.includes(expected))
        if (targetHistory) state.firstHistory ??= elapsed
        else {
          state.emptyFrames++
          if (document.querySelector('[role="status"]:has(> [role="presentation"] svg):not([data-pane-hidden] *, [hidden] *)')) state.loadingFrames++
        }
        if (!targetHistory && elapsed < 12000) state.frame = requestAnimationFrame(frame)
      }
      state.start = () => { state.started = performance.now(); state.frame = requestAnimationFrame(frame) }
      document.addEventListener('pointerdown', state.start, { capture: true, once: true })
    }, { expected, surface: chatSurface })
    const a = await metrics()
    await action()
    await expect(page.locator(chatSurface).getByText(expected, { exact: false }).last()).toBeVisible({ timeout: 15000 })
    await expect.poll(() => page.evaluate(() => window.hcvNavigationSample.firstHistory), { timeout: 3500, intervals: [10, 20, 50] }).not.toBeNull()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const b = await metrics()
    const timing = await page.evaluate(() => {
      const { observer, frame, start, ...data } = window.hcvNavigationSample
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', start, true)
      delete window.hcvNavigationSample
      return data
    })
    return { ...timing, ...Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration'].map(key => [key, Math.round((b[key] - a[key]) * 1000)])) }
  }

  const cold = await sample(() => long.click(), longReply)
  await expect(longTab).toHaveCount(1)
  const addShort = await sample(() => short.click({ modifiers: ['Control'] }), shortReply)
  await expect(shortTab).toHaveCount(1)
  const tabLabel = longTab.locator('.pane-tab-content .truncate')
  const tab = {
    label: await geometry(tabLabel), size: await longTab.evaluate(node => ({
      width: node.getBoundingClientRect().width, max: getComputedStyle(node).maxInlineSize,
    })),
    idleDot: await longTab.locator('.pane-tab-content span[aria-hidden="true"][class~="size-1"][class~="rounded-full"]').first()
      .evaluate(node => getComputedStyle(node).display),
  }
  const warm = []
  for (let pass = 0; pass < 3; pass++) {
    warm.push(await sample(() => longTab.click(), longReply))
    warm.push(await sample(() => shortTab.click(), shortReply))
  }
  console.log('Tab navigation', JSON.stringify({ sidebar, tab, cold, addShort, warm }))

  if (checking) {
    const swappedSheets = warm.flatMap(sample => sample.styleChanges)
    assert.equal(swappedSheets.filter(change => /data-hcv-(?:chat-tables-style|summary-sources|workspace-card)$/.test(change)).length, 0)
    assert(warm.every(sample => sample.emptyFrames === 0))
    await expect(tabLabel).toHaveCSS('text-overflow', 'clip')
    await expect(tabLabel).toHaveAttribute('data-hcv-title-overflow', '')
    assert.match((await geometry(tabLabel)).mask, /linear-gradient/)
    assert.equal(tab.size.max, '144px')
    assert.equal(tab.size.width, 144)
    assert.equal(tab.idleDot, 'none')
    await expect(longTab).toHaveAccessibleName(longTitle)
    await screenshot('session-navigation-dark.png')

    await shortRow.locator('button[data-slot="row-button"]').click({ button: 'right' })
    await expect(page.getByRole('menu').last()).toBeVisible()
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1040, height: 790 })
    await expect(tabLabel).toHaveCSS('text-overflow', 'clip')
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await expect(shortRow.locator('.hover-marquee-inner')).toHaveCSS('color', 'rgb(26, 28, 31)')
    await expect(recentShortRow.locator('.hover-marquee-inner')).toHaveCSS('color', 'rgb(26, 28, 31)')
    await expect(folder).toHaveCSS('color', 'rgba(26, 28, 31, 0.8)')
    await screenshot('session-navigation-narrow.png')

    await openThemeSettings()
    await themeCard('Nous').click()
    await expect(page.locator('head style[data-hcv-chat-tables-style]')).toHaveCount(0)
    await expect(longLabel).not.toHaveAttribute('data-hcv-title-overflow', '')
    await themeCard('Codex').click()
    await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
    await closeSettings()
    await page.setViewportSize({ width: 1440, height: 920 })
    await openRecents()

    const input = page.locator(chatSurface + ' [data-slot="composer-rich-input"]:visible').first()
    try {
      await input.fill(prompt)
      await input.press('Enter')
      await expect(shortRow).toHaveAttribute('data-working', 'true')
      await expect(shortRow.locator('.arc-row')).toHaveCSS('display', 'none')
      assert.equal((await renderedAge(shortRow)).visible, 0)
      const icon = await spinner(shortRow)
      assert.match(icon.mask, /data:image\/svg/)
      assert.equal(icon.width, '16px')
      assert.equal(icon.duration, '2s')
      assert.match(icon.easing, /^steps\(60(?:, end)?\)$/)
      await expect(recentShortRow).toHaveAttribute('data-working', 'true')
      await expect(recentShortRow.locator('.arc-row')).toHaveCSS('display', 'none')
      assert.equal((await renderedAge(recentShortRow)).visible, 0)
      sidebar.working = { project: icon, recent: await spinner(recentShortRow) }
      assert.deepEqual(sidebar.working.recent, icon)
      await expect(shortTab.locator('.pane-tab-content [role="status"]')).toHaveCSS('clip-path', 'inset(50%)')
      await screenshot('session-navigation-working.png', { animations: 'allow' })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(async () => (await spinner(shortRow)).name).toBe('none')
      await expect.poll(async () => (await spinner(recentShortRow)).name).toBe('none')
    } finally {
      release()
    }
    await expect(shortRow).not.toHaveAttribute('data-working', 'true', { timeout: 15000 })
    await expect(recentShortRow).not.toHaveAttribute('data-working', 'true')
  }
  await cdp.detach()
  return { sidebar, tab, cold, addShort, warm, threadTimeline }
}

async function observeProjectRow({ page, expect, long, short, shortRow, screenshot, cdp }) {
  const visibleHistory = page.locator(chatSurface)
  const capture = async (state) => {
    const clip = await shortRow.boundingBox()
    assert(clip, 'Project chat row disappeared before the capture')
    await screenshot(`project-row-${state}.png`, { clip })
    return shortRow.evaluate(node => {
      const css = getComputedStyle(node)
      const button = node.querySelector('button[data-slot="row-button"]')
      const label = node.querySelector('.hover-marquee-inner')
      const folder = node.closest('[data-sessions-project]')?.querySelector('[data-hcv-project-name]')
      const { width, height } = node.getBoundingClientRect()
      return {
        width,
        height,
        topLeftRadius: css.borderTopLeftRadius,
        topLeftCornerShape: css.getPropertyValue('corner-top-left-shape'),
        background: css.backgroundColor,
        hovered: node.matches(':hover'),
        fontSize: css.fontSize,
        buttonColor: button && getComputedStyle(button).color,
        labelColor: label && getComputedStyle(label).color,
        labelOpacity: label && getComputedStyle(label).opacity,
        folderColor: folder && getComputedStyle(folder).color,
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        superellipseSupported: CSS.supports('corner-shape', 'superellipse(1.5)'),
        pixelRatio: window.devicePixelRatio,
      }
    })
  }
  await long.click()
  await expect(visibleHistory.getByText(longReply, { exact: false }).last()).toBeVisible({ timeout: 15000 })
  await page.mouse.move(2, 2)
  const idle = await capture('idle')
  await shortRow.hover()
  let hover
  let hoverMode = 'pointer'
  if (await shortRow.evaluate(node => node.matches(':hover'))) {
    hover = await capture('hover')
  }
  if (!hover?.hovered) {
    hoverMode = 'forced-css'
    const marker = 'data-hcv-probe-project-row'
    await shortRow.evaluate((node, attribute) => node.setAttribute(attribute, ''), marker)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[${marker}]` })
    assert(nodeId, 'Could not mark the project chat row for the CSS hover capture')
    try {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
      hover = await capture('hover')
    } finally {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      await shortRow.evaluate((node, attribute) => node.removeAttribute(attribute), marker)
    }
  }
  await short.click()
  await expect(visibleHistory.getByText(shortReply, { exact: false }).last()).toBeVisible({ timeout: 15000 })
  await page.mouse.move(2, 2)
  const selected = await capture('selected')
  assert(!selected.hovered, 'The selected capture still shows pointer hover')
  return { idle, hover, hoverMode, selected }
}
