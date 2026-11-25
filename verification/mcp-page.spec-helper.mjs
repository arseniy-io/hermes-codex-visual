import assert from 'node:assert/strict'

export async function installMcpFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    const channel = 'hermes:api'
    const native = ipcMain._invokeHandlers.get(channel)
    if (typeof native !== 'function') throw new Error('Expected isolated Hermes API')
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, request) => {
      if (request?.method === 'POST' && /^\/api\/mcp\/servers\/[^/]+\/test(?:\?|$)/.test(request.path)) {
        return { ok: true, tools: Array.from({ length: 226 }, (_, index) => ({
          name: `fixture_tool_${String(index + 1).padStart(3, '0')}`,
          description: 'Test tool description', schema_chars: 1430,
        })) }
      }
      return native(event, request)
    })
  })
}

// The sandbox uses only its own mock MCP servers. Never connect the owner's
// servers or change their switches during this scenario.
export async function verifyMcpPage({ page, expect, screenshot }) {
  const baseline = process.env.HERMES_VISUAL_MCP_BASELINE === '1'
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
  await cdp.send('Profiler.start')
  await page.evaluate(() => {
    window.hcvMcpFrames = []
    window.hcvMcpStart = performance.now()
    window.hcvMcpLong = []
    const observer = new PerformanceObserver(list => {
      for (const item of list.getEntries()) window.hcvMcpLong.push(Math.round(item.duration))
    })
    observer.observe({ type: 'longtask', buffered: false })
    let count = 0
    const frame = () => {
      const card = document.querySelector('[data-slot="connector-row-card"]')
      const dialog = document.querySelector('[data-slot="dialog-content"]:has([data-slot="tools-list"], [data-slot="tools-summary"])')
      if (card || dialog) window.hcvMcpFrames.push({
        time: Math.round(performance.now() - window.hcvMcpStart),
        cardRadius: card && getComputedStyle(card).borderTopLeftRadius,
        dialogRadius: dialog && getComputedStyle(dialog).borderTopLeftRadius,
        style: !!document.querySelector('style[data-hcv-connectors-styles]'),
      })
      if (++count < 180) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    location.hash = '#/capabilities?tab=connectors'
  })
  const directory = page.locator('[data-slot="connectors-directory"]:visible').first()
  await expect(directory).toBeVisible({ timeout: 45000 })
  const card = directory.locator('[data-slot="connector-row-card"]:visible').first()
  await expect(card).toBeVisible({ timeout: 45000 })
  await expect(card).toContainText(/Включён|On, unused|226/, { timeout: 45000 })
  if (!baseline) {
    await expect(page.locator('[data-tour="tab-plugins"]')).toContainText('Плагины')
    await expect(directory.getByText('Чтение и изменение баз, таблиц и записей', { exact: true })).toBeVisible()
    await expect(directory.getByText('Работа с Adobe Marketing Agent через Hermes', { exact: true })).toBeVisible()
  }
  const { profile } = await cdp.send('Profiler.stop')
  const perf = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  await cdp.detach()
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]))
  const samples = new Map()
  for (const [i, id] of profile.samples.entries()) {
    const frame = nodes.get(id)
    if (!frame || frame.functionName === '(idle)') continue
    const name = (frame.url.startsWith('blob:') ? 'plugin/' : 'desktop/') + (frame.functionName || '(anonymous)')
    samples.set(name, (samples.get(name) || 0) + profile.timeDeltas[i] / 1000)
  }
  const hot = [...samples].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, ms]) => [name, Math.round(ms)])
  await screenshot('mcp-directory.png')
  await page.evaluate(() => {
    window.hcvMcpDialogFrames = []
    document.addEventListener('click', () => {
      const start = performance.now()
      const frame = () => {
        const dialog = document.querySelector('[data-slot="dialog-content"]:has([data-slot="tools-list"], [data-slot="tools-summary"])')
        if (dialog) window.hcvMcpDialogFrames.push({
          time: Math.round(performance.now() - start),
          radius: getComputedStyle(dialog).borderTopLeftRadius,
          styled: !!document.querySelector('style[data-hcv-interface-popups]'),
        })
        if (performance.now() - start < 1300) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }, { once: true, capture: true })
  })
  await card.locator('button:not([role="switch"])').first().click()
  const dialog = page.locator('[data-slot="dialog-content"]:visible').last()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('226', { timeout: 45000 })
  await screenshot('mcp-detail.png')
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    directory: document.querySelector('[data-slot="connectors-directory"]')?.innerText.slice(0, 1600),
    dialog: [...document.querySelectorAll('[data-slot="dialog-content"]')].at(-1)?.innerText,
    frames: window.hcvMcpFrames,
    dialogFrames: window.hcvMcpDialogFrames,
    longTasks: window.hcvMcpLong,
  }))
  console.log('MCP_PAGE_SNAPSHOT', JSON.stringify({ ...state,
    frames: { count: state.frames.length, first: state.frames[0] },
    dialogFrames: { count: state.dialogFrames.length, first: state.dialogFrames[0] }, hot, metrics: {
    script: Math.round(perf.ScriptDuration * 1000), style: Math.round(perf.RecalcStyleDuration * 1000),
    layout: Math.round(perf.LayoutDuration * 1000),
  } }))
  assert(state.directory && state.dialog, 'Expected a visible directory and server dialog')
  if (!baseline) {
    assert(state.dialogFrames.length > 0 && state.dialogFrames.every(frame => frame.radius === '24px'),
      'The dialog must be rounded from its first painted frame')
    await expect(page.locator('[data-slot="dialog-overlay"]:visible').last()).toHaveCSS('backdrop-filter', 'none')
    await expect(dialog).toContainText('MCP · Свой')
    await expect(dialog.getByText('Дополнительно', { exact: true })).toBeVisible()
    await expect(dialog).toContainText('Что Hermes может делать с')
    await expect(dialog).toContainText('226 инструментов')
    await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    await expect(dialog).toContainText('80,9 тыс. токенов на вызов')
    await expect(dialog.getByRole('switch', { name: 'Включить или выключить все инструменты' })).toBeVisible()
    await dialog.locator('summary').click()
    await expect(dialog.locator('details')).toHaveAttribute('open', '')
    await dialog.locator('summary').click()
    await dialog.getByRole('button', { name: 'Показать все инструменты (226)' }).click()
    const search = dialog.getByPlaceholder('Поиск инструментов (226)')
    await expect(search).toBeVisible()
    await expect(dialog.locator('[data-slot="tool-row"]').first()).toBeVisible()
    await screenshot('mcp-tools.png')
    await search.fill('fixture_tool_001')
    await expect(dialog.locator('[data-slot="tool-row"]')).toHaveCount(1)
    const tool = dialog.locator('[data-slot="tool-row"]').first()
    await tool.locator('button:not([role="switch"])').first().click()
    await expect(tool).toContainText('Test tool description')
    await tool.getByRole('switch').click()
    await expect(dialog.getByRole('button', { name: 'Отменить изменения' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Отменить изменения' }).click()
    await expect(dialog.getByRole('button', { name: 'Отменить изменения' })).toHaveCount(0)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  if (!baseline) {
    const search = directory.locator('input[placeholder]').first()
    await search.fill('Тестовый поиск')
    await expect(directory.locator('[data-slot="connector-row-card"]')).toHaveCount(1)
    await search.clear()
    await directory.getByRole('button', { name: 'Добавить свой MCP' }).first().click()
    const form = page.locator('[data-slot="dialog-content"]:has([data-slot="add-server-form"])')
    await expect(form).toContainText('Подключить свой сервер MCP')
    await expect(form).toContainText('Команда запуска')
    await page.keyboard.press('Escape')
    await expect(form).toBeHidden()
    await page.setViewportSize({ width: 760, height: 720 })
    await card.locator('button:not([role="switch"])').first().click()
    const narrow = page.locator('[data-slot="dialog-content"]:visible').last()
    await expect(narrow).toBeVisible()
    const title = narrow.locator('[data-slot="dialog-title"]')
    await expect(title).toHaveText('Тестовые документы')
    assert(await title.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Russian status must not truncate the server name')
    await screenshot('mcp-narrow.png')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 920 })
    const changeLanguage = async (label, name, locale) => {
      await page.evaluate(() => { location.hash = '#/settings?tab=config%3Aappearance&page=general' })
      await page.getByRole('button', { name: label }).click()
      const input = page.locator('input[cmdk-input]:visible')
      await input.fill(name)
      await input.press('Enter')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await page.keyboard.press('Escape')
      if (await page.locator('[data-overlay-surface]').count()) await page.keyboard.press('Escape')
      await page.evaluate(() => { location.hash = '#/capabilities?tab=connectors' })
      await expect(directory).toBeVisible()
    }
    await changeLanguage('Сменить язык', 'English', 'en')
    await expect(page.locator('[data-tour="tab-plugins"]')).toContainText('Plugins')
    await expect(directory.getByRole('button', { name: 'Add your own' }).first()).toBeVisible()
    await expect(card).toContainText('MCP · Custom')
    await expect(directory.getByText('Read and edit bases, tables, and records', { exact: true })).toBeVisible()
    await changeLanguage('Switch language', 'Русский', 'ru')
    await expect(page.locator('[data-tour="tab-plugins"]')).toContainText('Плагины')
    await expect(directory.getByRole('button', { name: 'Добавить свой MCP' }).first()).toBeVisible()
    await expect(card).toContainText('MCP · Свой')
    await expect(directory.getByText('Чтение и изменение баз, таблиц и записей', { exact: true })).toBeVisible()
  }
}
