import assert from 'node:assert/strict'

const strip = '[data-zone-tabstrip="grp-main"]'
const tabs = '[role="tab"]:is([data-tree-tab="workspace"],[data-tree-tab^="session-tile:"])'
const surface = '[data-tree-group="grp-main"] [data-chat-surface]'
const visible = surface + ':not([data-pane-hidden] *, [hidden] *)'
const close = ':scope > span > button'
const folderIcon = '.pane-tab-content .codicon-folder'

const sessions = [
  ['Длинное название чата для проверки плавного затухания в проекте и верхней вкладке', 'Ответ 60. Контрольный текст'],
  ['Фокус', 'Вкладка 1, ответ 24.'],
  ['Заметки о проекте', 'Вкладка 2, ответ 24.'],
  ['Вкладка с длинным названием для проверки постоянной ширины и обрезки текста', 'Вкладка 3, ответ 24.'],
  ['Ревью интерфейса', 'Тестовый чат готов к проверке.'],
]

export async function verifySessionTabStack({ app, page, expect, projectChat, before }) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
  })
  const tabList = page.locator(strip).locator(tabs)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  const delta = (a, b) => Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration']
    .map(name => [name, Math.round((b[name] - a[name]) * 1000)]))
  const history = text => page.locator(visible).getByText(text, { exact: false }).last()
  async function settle() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }

  async function resident() {
    await cdp.send('HeapProfiler.collectGarbage')
    const { nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters')
    const { JSHeapUsedSize } = await metrics()
    const panes = await page.locator(surface).evaluateAll(nodes => nodes.map(node => {
      const viewport = node.querySelector('[data-slot="aui_thread-viewport"]')
      const content = viewport?.querySelector('[data-slot="aui_thread-content"]')
      return {
        id: node.dataset.sessionAnchor, hidden: Boolean(node.closest('[data-pane-hidden], [hidden]')),
        following: viewport?.dataset.following ?? null,
        contentVisibility: content ? getComputedStyle(content).contentVisibility : null,
      }
    }))
    const mounted = panes.length
    const current = await page.locator(visible).count()
    const start = await metrics()
    await page.waitForTimeout(1200)
    const end = await metrics()
    return { mounted, current, panes, nodes, jsEventListeners, JSHeapUsedSize, idle: delta(start, end) }
  }

  async function open([title, reply], modifiers) {
    await projectChat(title).first().click({ modifiers, timeout: 30000 })
    await expect(history(reply)).toBeVisible({ timeout: 30000 })
    await settle()
    console.log('Ready chat tab', title)
  }

  const folder = page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ })
  if (!await projectChat(sessions[0][0]).first().isVisible()) await folder.click()
  await open(sessions[0])
  const one = await resident()
  for (const entry of sessions.slice(1)) await open(entry, ['Control'])
  await expect(tabList).toHaveCount(sessions.length)
  const five = await resident()
  console.log('Five chat tabs loaded', JSON.stringify(five))

  const switches = []
  const repeat = [3, 4, 3, 4]
  for (const index of before ? repeat : [...repeat, 0, 4]) {
    const [title, reply] = sessions[index]
    const target = tabList.filter({ hasText: title })
    const pane = await target.getAttribute('data-tree-tab')
    const mounted = await page.locator(surface).evaluateAll((nodes, pane) =>
      nodes.some(node => node.dataset.sessionAnchor === pane), pane)
    await target.scrollIntoViewIfNeeded()
    await page.evaluate(({ reply, pane, visible }) => {
      const state = { duration: null, waitingFrames: 0 }
      state.done = new Promise(resolve => {
        const timer = setTimeout(resolve, 12000)
        document.addEventListener('pointerdown', () => {
          const start = performance.now()
          function check() {
            const now = performance.now()
            const shown = document.querySelector(visible)
            if (shown?.dataset.sessionAnchor === pane &&
                shown.querySelector('[data-slot="aui_thread-content"]')?.textContent.includes(reply)) {
              state.duration = now - start
              clearTimeout(timer)
              resolve()
            } else if (now - start < 12000) {
              state.waitingFrames++
              requestAnimationFrame(check)
            }
          }
          requestAnimationFrame(check)
        }, { capture: true, once: true })
      })
      window.hcvStackSwitch = state
    }, { reply, pane, visible })
    const start = await metrics()
    await target.click({ position: { x: 10, y: 12 }, timeout: 20000, noWaitAfter: true })
    const timing = await page.evaluate(async () => {
      const state = window.hcvStackSwitch
      await state.done
      delete window.hcvStackSwitch
      return { duration: state.duration, waitingFrames: state.waitingFrames }
    })
    assert.notEqual(timing.duration, null, JSON.stringify({ pane, title, timing }))
    if (!before) await expect(history(reply)).toBeInViewport({ timeout: 15000 })
    await settle()
    switches.push({ pane, mounted, ...timing, ...delta(start, await metrics()) })
    console.log('Chat tab switch', JSON.stringify(switches.at(-1)))
  }
  const afterSwitches = await resident()

  const geometry = () => tabList.evaluateAll((nodes, { close, folderIcon }) => nodes.map(node => {
    const button = node.querySelector(close)
    const folder = node.querySelector(folderIcon)
    return {
      title: node.getAttribute('aria-label'), width: node.getBoundingClientRect().width,
      close: button?.getBoundingClientRect().width ?? null,
      folder: folder ? getComputedStyle(folder).display : null,
      leadingContent: getComputedStyle(node, '::before').content,
    }
  }), { close, folderIcon })
  const normal = await geometry()
  await page.setViewportSize({ width: 1040, height: 790 })
  const narrow = await geometry()
  await page.setViewportSize({ width: 1440, height: 920 })

  let restored = null
  if (!before) {
    const focusTab = tabList.filter({ hasText: sessions[1][0] })
    const otherTab = tabList.filter({ hasText: sessions[4][0] })
    const select = async tab => {
      await tab.click({ position: { x: 10, y: 12 }, timeout: 30000, noWaitAfter: true })
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await settle()
    }
    await select(focusTab)
    const composer = page.locator(visible).locator('[data-slot="composer-rich-input"]')
    const draft = 'Черновик при переключении вкладок'
    await composer.fill(draft, { timeout: 30000 })
    const viewport = page.locator(visible).locator('[data-slot="aui_thread-viewport"]')
    const bounds = await viewport.boundingBox()
    assert(bounds, 'The selected chat needs a scrollable transcript')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.wheel(0, -900)
    await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop))
      .toBeGreaterThan(320)
    await expect(viewport).toHaveAttribute('data-following', 'false')
    const position = anchor => viewport.evaluate((node, anchor) => {
      const frame = node.getBoundingClientRect()
      const marker = '[data-slot="aui_user-message-root"][data-message-id]'
      const prompts = [...node.querySelectorAll(marker)]
      const prompt = anchor
        ? prompts.find(item => item.dataset.messageId === anchor)
        : prompts.find(item => item.getBoundingClientRect().top >= frame.top + frame.height / 3)
      if (!prompt) return null
      const offset = prompt.getBoundingClientRect().top - frame.top
      return { anchor: prompt.dataset.messageId, offset, viewportHeight: frame.height, scrollTop: node.scrollTop }
    }, anchor)
    let from
    await expect.poll(async () => {
      const first = await position(null)
      if (!first || first.scrollTop <= 0) return false
      await settle()
      const settled = await position(first.anchor)
      if (!settled || Math.abs(settled.offset - first.offset) > 1) return false
      from = settled
      return true
    }, { timeout: 15000 }).toBe(true)
    await select(otherTab)
    const focusId = await focusTab.getAttribute('data-tree-tab')
    const hiddenHistory = page.locator(surface + '[data-session-anchor="' + focusId + '"]').locator('[data-slot="aui_thread-content"]')
    const thirdTab = tabList.filter({ hasText: sessions[3][0] })
    await select(thirdTab)
    await expect(hiddenHistory).toHaveCSS('content-visibility', 'visible')
    await select(focusTab)
    await expect(composer).toHaveText(draft)
    const to = await position(from.anchor)
    assert(to && to.offset >= 0 && to.offset < to.viewportHeight, JSON.stringify({ from, to }))
    restored = { draft: true, from, to }
    await composer.fill('', { timeout: 30000 })
  }

  await tabList.first().scrollIntoViewIfNeeded()
  const closePoint = await tabList.first().locator(close).boundingBox()
  assert(closePoint, 'The first chat tab has no close button')
  const x = closePoint.x + closePoint.width / 2
  const y = closePoint.y + closePoint.height / 2
  await page.mouse.move(x, y)
  const closed = []
  for (let remaining = sessions.length; remaining > 0; remaining--) {
    const button = tabList.first().locator(close)
    const bounds = await button.boundingBox()
    if (!bounds || x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) break
    const pane = await tabList.first().getAttribute('data-tree-tab')
    const title = await tabList.first().getAttribute('aria-label')
    await page.mouse.down()
    await page.mouse.up()
    if (remaining > 1) await expect(tabList).toHaveCount(remaining - 1)
    else if (pane === 'workspace') await expect(tabList.first()).not.toHaveAttribute('aria-label', title)
    else await expect(tabList).not.toHaveCount(remaining)
    closed.push(title)
  }

  if (!before) {
    for (const widths of [normal, narrow]) {
      assert.equal(widths.length, sessions.length)
      assert(widths.every(tab => Math.abs(tab.width - widths[0].width) < 0.5), JSON.stringify(widths))
      assert.equal(widths[0].leadingContent, 'none', JSON.stringify(widths[0]))
      assert(widths.every(tab => tab.folder == null || tab.folder === 'none'), JSON.stringify(widths))
    }
    assert.equal(closed.length, sessions.length, 'Five clicks at one position must close five chats')
    assert.equal(five.current, 1)
    assert(five.mounted <= 3 && afterSwitches.mounted <= 3, 'Hermes retained more than two background chat surfaces')
    assert.equal(five.panes.filter(pane => pane.hidden).length, five.mounted - 1)
    const following = five.panes.filter(pane => pane.hidden && pane.following === 'true')
    assert.equal(following.filter(pane => pane.contentVisibility === 'hidden').length, 1)
    assert(following.some(pane => pane.contentVisibility === 'visible'), 'The immediately preceding tab must stay ready')
  }
  const afterClose = await resident()
  console.log('Tab stack layout and close', JSON.stringify({ normal, narrow, closed, restored, afterClose }))
  await cdp.detach()
  return { one, five, afterSwitches, afterClose, switches, normal, narrow, closePoint: { x, y }, closed, restored }
}
