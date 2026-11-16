import assert from 'node:assert/strict'

export async function verifyChatHover({ app, page, expect, projectChat, screenshot, baseline }) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false)
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const dismissNotice = page.getByRole('button', { name: 'Нет, спасибо', exact: true })
  if (await dismissNotice.isVisible()) await dismissNotice.click()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp.send('Performance.enable')
  const profiling = process.env.HERMES_VISUAL_PROFILE_HOVER === '1'
  if (profiling) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
  }
  await projectChat('Длинный тестовый чат').click()
  await page.mouse.move(3, 90)
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const finalLine = 'Ответ 59. Контрольный текст для проверки длинного разговора.'
  const answer = chat.locator('[data-slot="aui_assistant-message-root"]').filter({
    hasText: finalLine,
  })
  const paragraph = answer.getByText(finalLine, { exact: true })
  const actions = answer.locator('[data-slot="aui_msg-actions"]')
  const stamp = actions.locator('time').first()
  const copy = actions.locator('.aui-message-actions-desktop button[data-size="icon"]').first()
  await expect(paragraph).toBeInViewport({ timeout: 25000 })
  await expect(actions).toHaveCSS('opacity', '0')
  await expect(stamp).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/)

  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(
    ({ name, value }) => [name, value],
  ))
  const rounded = (value) => Number(value.toFixed(2))
  const sample = async (target, waitMs, hitTarget = target) => {
    const before = await metrics()
    await hitTarget.evaluate(async (node) => {
      const run = { frames: [], longTasks: [], triggerStates: [] }
      let previous
      const observe = (now) => {
        if (previous !== undefined) run.frames.push(now - previous)
        previous = now
        run.frame = requestAnimationFrame(observe)
      }
      run.frame = requestAnimationFrame(observe)
      run.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) run.longTasks.push(entry.duration)
      })
      run.observer.observe({ type: 'longtask' })
      run.trigger = new MutationObserver(records => {
        for (const record of records) run.triggerStates.push(record.oldValue)
        run.triggerStates.push(node.getAttribute('data-state'))
      })
      run.trigger.observe(node, { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true })
      run.input = new AbortController()
      document.addEventListener('pointermove', (event) => {
        run.hit ||= node.contains(event.target)
      }, { capture: true, signal: run.input.signal })
      window.hcvHoverRun = run
      await new Promise(requestAnimationFrame)
    })
    await target.hover({ force: hitTarget !== target })
    await page.waitForTimeout(waitMs)
    const { frames, longTasks, hit, triggerStates } = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame)
      const { frame, observer, trigger, input, frames, longTasks, hit, triggerStates } = window.hcvHoverRun
      cancelAnimationFrame(frame)
      observer.disconnect()
      trigger.disconnect()
      input.abort()
      delete window.hcvHoverRun
      return { frames, longTasks, hit, triggerStates }
    })
    assert(frames.length >= 2, 'The test window must render frames during a hover')
    const after = await metrics()
    return {
      pointerReached: Boolean(hit),
      maxFrameMs: rounded(Math.max(...frames)),
      longTasksMs: longTasks.map(rounded),
      nativeTipOpened: triggerStates.some(state => state?.endsWith('-open')),
      ...(profiling ? { startUs: before.Timestamp * 1000000, endUs: after.Timestamp * 1000000 } : {}),
      taskMs: rounded((after.TaskDuration - before.TaskDuration) * 1000),
      scriptMs: rounded((after.ScriptDuration - before.ScriptDuration) * 1000),
      layoutMs: rounded((after.LayoutDuration - before.LayoutDuration) * 1000),
      styleMs: rounded((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000),
    }
  }
  try {
    const body = []
    const time = []
    for (let pass = 0; pass < 5; pass++) {
      body.push(await sample(paragraph, 85))
      await expect(actions).toHaveCSS('opacity', '1')
      time.push(await sample(stamp, 1000, baseline ? stamp : actions))
      if (pass === 0 && baseline && (await stamp.getAttribute('data-state'))?.endsWith('-open')) {
        await screenshot('date-tooltip.png', { animations: 'allow' })
      }
      await page.mouse.move(3, 90)
      await expect(actions).toHaveCSS('opacity', '0')
    }
    const visibleActions = await actions.locator('button:visible').count()
    assert.equal(visibleActions, baseline ? 4 : 1)
    const result = { visibleActions, body, time }
    console.log('Response hover', JSON.stringify(result))
    if (profiling) result.profile = (await cdp.send('Profiler.stop')).profile
    await paragraph.hover()
    await copy.hover()
    const copyTip = baseline
      ? page.getByRole('tooltip', { name: 'Копировать', exact: true })
      : page.locator('[data-hcv-reply-copy-tip]')
    await expect(copyTip).toBeVisible()
    await screenshot('copy-tooltip.png', { animations: 'allow' })
    await page.mouse.move(3, 90)
    return result
  } finally {
    await cdp.detach()
  }
}
