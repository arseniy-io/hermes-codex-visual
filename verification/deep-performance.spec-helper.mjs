import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { measureSidebarScope, sidebarMasks } from './style-scope.spec-helper.mjs'

const end = 'ПОТОК ЗАВЕРШЁН'
const prefix = 'Замер потокового ответа'
const chatName = 'Длинный тестовый чат'
const composer = '[data-slot="composer-rich-input"]:visible'
const chat = '[data-chat-surface][data-composer-target="main"]'
const cases = [0, 1, 2]

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
  await expect(page.locator('[data-slot="aui_response-loading"] [data-hcv-thinking]')).toHaveText('Думаю')
  release()
  await mock.waitForHeldStream()
  const live = page.locator('[data-hcv-live-turn]')
  const seconds = live.locator('[data-hcv-live-time]')
  await expect(live.locator('[data-hcv-thinking]')).toHaveText('Думаю')
  const start = parseInt(await seconds.textContent(), 10)
  await expect.poll(async () => parseInt(await seconds.textContent(), 10), { timeout: 8000 }).toBeGreaterThan(start)
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

export async function replyToPerformancePrompt(res, request) {
  const content = request.messages?.findLast(item => item.role === 'user')?.content
  const message = Array.isArray(content) ? content.map(part => part.text || '').join(' ') : content
  if (typeof message !== 'string' || !message.includes(prefix)) return false
  assert(request.stream)
  const identity = { id: 'chatcmpl-perf', model: request.model, created: 1780000000 }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const write = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({
    ...identity, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }],
  }) + '\n\n')
  write({ role: 'assistant', content: 'Начало ответа.\n\n' })
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
  const openLong = async () => {
    const row = projectChat(chatName).first()
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
  const expandHistory = async () => {
    const thread = page.locator(chat + ' [data-slot="aui_thread-content"]:visible').first()
    const groups = thread.locator('[data-slot="aui_response-group"]')
    const earlier = thread.getByRole('button', { name: /Show earlier messages|Показать (?:более ранние|предыдущие|ранние|старые) сообщения/i })
    let count = await groups.count()
    for (let index = 0; count < 40 && index < 10; index++) {
      await earlier.first().click()
      await expect.poll(() => groups.count()).toBeGreaterThan(count)
      count = await groups.count()
    }
    assert(count >= 40, 'Expected at least 40 mounted responses, got ' + count)
    await page.locator(chat + ' [data-slot="aui_thread-viewport"]:visible').first().evaluate(node => {
      node.scrollTop = node.scrollHeight
    })
    return count
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
  const repeat = async (name, action) => {
    const runs = []
    for (const i of cases) runs.push(await sample(() => action(i)))
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
    results.mountedTurns = await expandHistory()
    results.typing = await repeat('typing', async () => {
      await input.pressSequentially('Testing the composer in a long conversation', { delay: 15 })
      await expect(input).toHaveText('Testing the composer in a long conversation')
      await input.fill('')
    })
    results.stream = await repeat('stream', async i => {
      const message = prefix + ' ' + i
      await input.fill(message)
      await input.press('Enter')
      const last = page.locator(chat + ' [data-slot="aui_response-group"]').last()
      await expect(last.getByText(end, { exact: true })).toBeVisible({ timeout: 20000 })
      await expect(last.locator('[data-hcv-live-turn]')).toHaveCount(0)
    })
    const { JSHeapUsedSize } = await getMetrics()
    results.heapMiB = Math.round(JSHeapUsedSize / 1048576)
    results.processes = await app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({
      type: metric.type, workingSetMiB: Math.round(metric.memory.workingSetSize / 1024),
      privateMiB: Math.round(metric.memory.privateBytes / 1024), cpuPercent: metric.cpu.percentCPUUsage,
    })))
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
