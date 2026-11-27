import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { measureSidebarScope, sidebarMasks } from './style-scope.spec-helper.mjs'

const end = 'ПОТОК ЗАВЕРШЁН'
const prefix = 'Замер потокового ответа'
const chatName = 'Длинный тестовый чат'
const composer = '[data-slot="composer-rich-input"]:visible'
const chat = '[data-chat-surface][data-composer-target="main"]'
const cases = [0, 1, 2]
const hotspotLinks = 48
const hotspotMode = process.env.HERMES_VISUAL_PERF_HOTSPOTS === '1'
const hotspotWaiters = new Map()

function waitForHotspot(message, res) {
  assert(!hotspotWaiters.has(message), 'Hotspot prompts must run sequentially')
  const gate = Promise.withResolvers()
  let timeout
  const release = reason => {
    if (hotspotWaiters.get(message) !== release) return
    hotspotWaiters.delete(message)
    clearTimeout(timeout)
    res.off('close', closed)
    gate.resolve(reason)
  }
  const closed = () => release('closed')
  hotspotWaiters.set(message, release)
  timeout = setTimeout(() => release('timeout'), 45000)
  res.once('close', closed)
  return gate.promise
}

export async function verifyProjectActivity({ app, page, expect, navigation, projectChat, prompt, mock, release }) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
  })
  await page.bringToFront()
  const folder = page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ })
  const row = folder.locator('xpath=ancestor::*[@data-hcv-project-row][1]')
  const chatRow = projectChat('Ревью интерфейса')
  const spinner = row.locator('[data-hcv-project-status="working"]')
  const unread = row.locator('[data-hcv-project-status="unread"]')
  if (!await chatRow.isVisible()) await folder.click()
  await chatRow.click()
  await expect(page.locator(chat).getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  const input = page.locator(composer).first()
  await input.fill(prompt)
  await input.press('Enter')
  const loading = page.locator('[data-slot="aui_response-loading"]')
  await expect(loading).toHaveCSS('clip-path', 'inset(50%)')
  release()
  await mock.waitForHeldStream()
  await expect(page.locator('[data-slot="aui_response-group"] [data-message-streaming="true"]').last()).toBeAttached()
  await expect(page.locator('[data-hcv-thinking], [data-hcv-live-turn]')).toHaveCount(0)
  await folder.click()
  await expect(spinner).toBeVisible()
  await navigation('new-session').first().click()
  await expect(spinner).toBeVisible()
  mock.releaseHeldStream()
  await expect(spinner).toBeHidden({ timeout: 15000 })
  await expect(unread).toBeVisible()
  await folder.click()
  await chatRow.click()
  await expect(chatRow.locator('xpath=..').getByRole('status', { name: /не прочитан/ })).toHaveCount(0)
}

export async function replyToPerformancePrompt(res, request, projectFolder) {
  const content = request.messages?.findLast(item => item.role === 'user')?.content
  const message = Array.isArray(content) ? content.map(part => part.text || '').join(' ') : content
  if (typeof message !== 'string' || !message.includes(prefix)) return false
  assert(request.stream)
  if (hotspotMode) assert(projectFolder && path.isAbsolute(projectFolder), 'Hotspot writes require the isolated project folder')
  const identity = { id: 'chatcmpl-perf', model: request.model, created: 1780000000 }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const write = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({
    ...identity, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }],
  }) + '\n\n')
  let hotspotObserved
  if (hotspotMode) {
    const user = request.messages.findLastIndex(item => item.role === 'user')
    const completed = request.messages.slice(user + 1).some(item => item.role === 'tool')
    if (!completed) {
      const suffix = createHash('sha256').update(message).digest('hex').slice(0, 12)
      write({ role: 'assistant', content: 'Записываю локальный тестовый файл.', tool_calls: [{
        index: 0, id: 'call_hcv_perf_' + suffix, type: 'function', function: {
          name: 'write_file', arguments: JSON.stringify({
            path: path.join(projectFolder, 'performance-hotspot-' + suffix + '.txt'),
            content: 'Первая строка проверки.\nВторая строка проверки.\n',
          }),
        },
      }] })
      write({}, 'tool_calls')
      res.end('data: [DONE]\n\n')
      return true
    }
    const target = path.join(projectFolder, 'fixture-note.md').replaceAll('\\', '/')
    // Keep the turn live until the real UI has mounted the references and
    // change chip. Slow initial decoration must not hide the chip before it
    // can be verified. Socket close and a deadline also release this hold.
    hotspotObserved = waitForHotspot(message, res)
    write({ role: 'assistant', content: 'Начало ответа.\n\n' + Array.from({ length: hotspotLinks }, (_, index) =>
      '[Файл проверки ' + (index + 1) + '](<' + target + '>)').join(' ') + '\n\n' })
  } else write({ role: 'assistant', content: 'Начало ответа.\n\n' })
  if (hotspotObserved) {
    const reason = await hotspotObserved
    if (res.destroyed) return true
    assert.equal(reason, 'observed', 'Hotspot references and live changes were not observed within 45 seconds')
  }
  for (let index = 1; index <= 28 && !res.destroyed; index++) {
    await pause(65)
    write({ content: index % 4 === 0 ? '| A | B |\n| --- | --- |\n| 3 | 6 |\n\n' :
      'Абзац ' + index + '. Поток добавляет новый текст.\n\n' })
  }
  if (!res.destroyed) {
    write({ content: end })
    write({}, 'stop')
    res.end('data: [DONE]\n\n')
  }
  return true
}

export async function measurePerformance({ app, page, expect, navigation, projectChat, openThemeSettings, closeSettings, themeCard, screenshot }) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
  })
  await page.bringToFront()
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' })
  const nav = name => navigation(name).first()
  const openNew = async () => {
    await nav('new-session').click()
    await expect(page.locator(composer).first()).toBeVisible()
  }
  const openLong = async (title = chatName) => {
    const row = projectChat(title).first()
    if (!await row.isVisible()) {
      await page.locator('[data-hcv-project-name]').filter({ hasText: 'Тестовый проект' }).click()
    }
    await row.click()
    await expect(page.locator(chat).getByText('Ответ 60.', { exact: false }).first()).toBeVisible()
  }
  const catalog = async () => {
    await nav('capabilities').click()
    const plugins = page.locator('[data-tour="tab-plugins"]:visible').first()
    await plugins.click()
    await expect(page.locator('[data-catalog-card]').filter({ hasText: 'Fixture plugin' }).first()).toBeVisible()
  }
  const sidebar = await measureSidebarScope({ app, page, expect, navigation })
  const masks = (await sidebarMasks(page, navigation)).map(mask => createHash('sha256').update(mask).digest('hex'))
  await catalog()
  await openNew()
  await openLong()
  await openNew()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  const getMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(row => [row.name, row.value]))
  const readFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  async function sample(action) {
    await pause(250)
    await readFrames()
    await page.evaluate(() => {
      const sample = window.hcvDeepSample = { frames: [], longTasks: [] }
      let previous
      function frame(now) {
        if (window.hcvDeepSample !== sample) return
        if (previous !== undefined) sample.frames.push(now - previous)
        previous = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      sample.observer = new PerformanceObserver(list => sample.longTasks.push(...list.getEntries().map(entry => entry.duration)))
      sample.observer.observe({ type: 'longtask' })
    })
    const a = await getMetrics()
    const start = performance.now()
    await action()
    await readFrames()
    const b = await getMetrics()
    const elapsed = performance.now() - start
    const { frames, longTasks } = await page.evaluate(() => {
      const { frames, longTasks, observer } = window.hcvDeepSample
      longTasks.push(...observer.takeRecords().map(entry => entry.duration))
      observer.disconnect()
      delete window.hcvDeepSample
      return { frames, longTasks }
    })
    const sorted = frames.slice().sort((x, y) => x - y)
    return {
      elapsedMs: Math.round(elapsed), frames,
      p95FrameMs: Number(sorted[Math.floor(sorted.length * .95)]?.toFixed(1)),
      framesOver32ms: frames.filter(ms => ms > 32).length, longTasks,
      ...Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration'].map(key =>
        [key + 'Ms', Math.round((b[key] - a[key]) * 1000)])),
      ...Object.fromEntries(['RecalcStyleCount', 'LayoutCount'].map(key => [key, b[key] - a[key]])),
      jsHeapMiB: Math.round(b.JSHeapUsedSize / 1048576),
      nodes: b.Nodes,
    }
  }
  const repeat = async (name, action, prepare) => {
    const runs = []
    for (const i of cases) {
      if (prepare) await prepare(i)
      runs.push(await sample(() => action(i)))
    }
    console.log('Performance', name, JSON.stringify(runs.map(({ frames, ...row }) => row)))
    return runs
  }
  const results = { sidebar, masks, turns: await page.locator(chat + ' [data-slot="aui_response-group"]').count() }
  try {
    results.idle = await repeat('idle', () => pause(1250))
    results.screens = await repeat('screens', async () => {
      await catalog()
      await nav('artifacts').click()
      const tabs = page.locator('[data-tour="page-tabs"]:visible').first()
      for (const id of ['image', 'all']) await tabs.locator(`[data-tour="tab-${id}"]:visible`).click()
      await openNew()
    })
    results.longChat = await repeat('long chat', async () => {
      await openLong()
      const viewport = page.locator(chat + ' [data-slot="aui_thread-viewport"]').first()
      await viewport.evaluate(async node => {
        for (const ratio of [.75, .5, .25, 0, .5, 1]) {
          node.scrollTop = ratio * node.scrollHeight
          await new Promise(resolve => requestAnimationFrame(resolve))
        }
      })
      await openNew()
    })
    await openLong()
    const input = page.locator(composer).first()
    results.mountedTurns = await page.locator(chat + ' [data-slot="aui_response-group"]:visible').count()
    assert.equal(results.mountedTurns, 1)
    const viewport = page.locator(chat + ' [data-slot="aui_thread-viewport"]:visible').first()
    await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(500)
    results.typing = await repeat('typing', async () => {
      await input.pressSequentially('Testing the composer in a long conversation', { delay: 15 })
      await expect(input).toHaveText('Testing the composer in a long conversation')
      await input.fill('')
    })
    const sourcesPane = page.locator('[data-hcv-summary-pane="sources"] [data-hcv-sources-pane]:visible')
    const sourcesTab = page.locator('[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-sources"]')
    const openHotspotSources = async () => {
      const compact = page.locator('[data-hcv-context-card]:visible [data-hcv-sources-compact]')
      await expect(compact).toBeVisible()
      const heading = compact.locator('[data-hcv-summary-heading]')
      if (await heading.getAttribute('aria-expanded') === 'false') await heading.click()
      await compact.locator('.hcv-sources-all').click()
      await expect(sourcesPane).toBeVisible()
      await expect(sourcesTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-hcv-summary-add-tab]')).toBeVisible()
    }
    if (hotspotMode) {
      await openHotspotSources()
      results.hotspots = {
        linksPerReply: hotspotLinks, target: 'fixture-note.md', tool: 'write_file',
        writeLines: 2, streamChunks: 28, chunkDelayMs: 65,
        initialLinkHandshake: 'Wait for live references and changes before the 28 stream chunks; 45-second deadline',
        sourcesPaneOpened: true, streams: [],
        limitation: 'Exercises file references, summary tabs and live changes; no image-analysis markers are seeded. Metrics include the real local tool and native rendering.',
      }
    }
    results.stream = await repeat('stream', async i => {
      const message = prefix + ' ' + i
      await input.fill(message)
      await input.press('Enter')
      const last = page.locator(chat + ' [data-slot="aui_response-group"]').last()
      if (hotspotMode) {
        const chip = page.locator(chat + ' [data-hcv-composer-changes-chip]')
        const references = last.locator('[data-hcv-file-reference-control]')
        await expect(chip).toBeVisible({ timeout: 45000 })
        await expect(chip).toHaveAttribute('aria-label', /^(Изменен 1 файл|1 file changed), \+2, −0$/)
        await expect(references).toHaveCount(hotspotLinks, { timeout: 45000 })
        await expect(chip).toBeVisible()
        await expect(last.locator('[data-message-streaming="true"]')).toHaveCount(1)
        await expect(sourcesPane).toBeVisible()
        results.hotspots.streams.push({
          reply: i, fileReferences: await references.count(),
          liveChangesLabel: await chip.getAttribute('aria-label'),
          liveResponse: true, sourcesPaneVisible: true, initialStateObservedBeforeChunks: true,
        })
        const release = hotspotWaiters.get(message)
        assert(release, 'Expected the initial hotspot stream to remain held for UI verification')
        release('observed')
      }
      await expect(last.getByText(end, { exact: true })).toBeVisible({ timeout: hotspotMode ? 45000 : 20000 })
      await expect(last.locator('[data-message-streaming="true"]')).toHaveCount(0)
      if (hotspotMode) await expect(page.locator(chat + ' [data-hcv-composer-changes-chip]')).toHaveCount(0)
    }, async i => {
      if (hotspotMode && i === cases.at(-1)) {
        await sourcesTab.getByRole('button', { name: /^(Закрыть|Close)$/ }).click()
        await openLong('Повторный потоковый замер')
        await openHotspotSources()
      }
    })
    const { JSHeapUsedSize } = await getMetrics()
    results.heapMiB = Math.round(JSHeapUsedSize / 1048576)
    results.processes = await app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({
      type: metric.type, workingSetMiB: Math.round(metric.memory.workingSetSize / 1024),
      privateMiB: Math.round(metric.memory.privateBytes / 1024), cpuPercent: metric.cpu.percentCPUUsage,
    })))
    if (hotspotMode) {
      await sourcesTab.hover()
      await sourcesTab.getByRole('button', { name: /^(Закрыть|Close)$/ }).click()
      await expect(sourcesPane).toHaveCount(0)
    }
    const root = page.locator('html')
    const row = nav('artifacts')
    const readStyle = () => page.evaluate(() => {
      const styles = [
        ['html', ['--hcv-chat', '--hcv-sidebar', '--hcv-text']],
        ['button[data-hcv-sidebar-nav]:has(> [data-tour="sidebar-nav-artifacts"]) > [data-hcv-sidebar-fill]',
          ['background-color', 'border-radius', 'transition-property', 'transition-duration', 'transition-timing-function', 'opacity']],
        ['[data-chat-surface][data-composer-target="main"]', ['background-color']],
        ['[data-slot="composer-surface"]', ['border-radius', 'border-width', 'padding-inline-start']],
        ['[data-slot="composer-rich-input"]', ['font-family', 'font-size', 'line-height']],
      ]
      return styles.map(([selector, keys]) => {
        const node = document.querySelector(selector)
        assertNode(node, selector)
        const css = getComputedStyle(node)
        return [selector, keys.map(key => [key, css.getPropertyValue(key)])]
      })
      function assertNode(node, selector) { if (!node) throw new Error('Missing ' + selector) }
    })
    await openNew()
    results.visual = {}
    for (const scheme of ['dark', 'light']) {
      if (scheme === 'light') {
        await openThemeSettings()
        await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
        await expect(root).toHaveAttribute('data-hermes-mode', 'light')
        await closeSettings()
      }
      await row.hover()
      await expect(row).toHaveAttribute('data-state', 'closed')
      await expect(row).not.toHaveAttribute('aria-describedby', /.+/)
      await expect(row.locator('[data-hcv-sidebar-fill]')).toHaveCSS('opacity', '1')
      await pause(190)
      await readFrames()
      results.visual[scheme] = await readStyle()
      const box = await row.boundingBox()
      await screenshot('hover-' + scheme + '.png', { animations: 'allow', caret: 'hide', clip: {
        x: Math.floor(box.x), y: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height),
      } })
      await page.mouse.move(900, 200)
      await pause(250)
      await screenshot('new-chat-' + scheme + '.png')
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/artifacts/)
    await expect(row.locator('[data-hcv-sidebar-fill]')).toHaveCSS('transition-property', 'none')
    await openThemeSettings()
    await themeCard('Nous').click()
    await expect(page.locator('head style[data-hcv-composer]')).toHaveCount(0)
    await themeCard('Codex').click()
    await closeSettings()
  } finally {
    await cdp.detach()
  }
  return results
}
