import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const cases = [
  { name: 'text', prompt: 'Проверка отправки обычного сообщения HCV_SEND_TEXT.', reply: 'Тестовый ответ HCV_SEND_TEXT.' },
  { name: 'image', prompt: 'Проверка отправки изображения HCV_SEND_IMAGE.', reply: 'Тестовый ответ HCV_SEND_IMAGE.',
    photo: 'parity-photo-1.png' },
  { name: 'caption', prompt: 'фото', reply: 'Проверка короткой подписи завершена.', photo: 'parity-photo-2.png' },
]
const title = 'Ревью интерфейса'
const promptSlot = '[data-slot="aui_user-message-root"][data-message-id]'
const imageSlot = '[data-slot="aui_embedded-images"] img'

export function makeSendFixture() {
  const activeCases = process.env.HERMES_VISUAL_SEND_BASELINE === '1' ? cases.slice(0, 2) : cases
  const steps = activeCases.map(step => ({ ...step, gate: Promise.withResolvers(), received: 0 }))
  return {
    steps,
    async reply(request, send) {
      const content = request.messages?.findLast(row => row.role === 'user')?.content
      const text = Array.isArray(content) ? content.filter(part => part.type === 'text').map(part => part.text).join(' ') : content
      const step = steps.find(item => typeof text === 'string' && (item.name === 'caption'
        ? text.split('\n').some(line => line.trim() === item.prompt) : text.includes(item.prompt)))
      if (!step) return false
      step.received += 1
      await step.gate.promise
      send(step.reply, [])
      return true
    },
  }
}

async function pastePhoto(editor, photo) {
  await editor.evaluate((input, bytes) => {
    const clipboardData = new DataTransfer()
    const png = Uint8Array.from(atob(bytes), char => char.charCodeAt(0))
    // Native media capture nests the stored file under a content hash.
    // Keep the Windows fixture path short enough to reach the real submit.
    clipboardData.items.add(new File([png], 'p.png', { type: 'image/png' }))
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, fs.readFileSync(photo, 'base64'))
}

async function armRecorder(chat, sentText) {
  await chat.evaluate((surface, { sentText, promptSlot, imageSlot }) => {
    const viewport = surface.querySelector('[data-slot="aui_thread-viewport"]')
    const dock = surface.querySelector('[data-slot="composer-dock"]')
    const clearance = viewport.querySelector('[data-slot="aui_composer-clearance"]')
    const frames = []
    const longTasks = []
    const listeners = new AbortController()
    const round = value => Math.round(value * 10) / 10
    const bounds = node => {
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { top: round(rect.top), bottom: round(rect.bottom), right: round(rect.right),
        width: round(rect.width), height: round(rect.height) }
    }
    let start
    let inputType
    let timer
    let frame
    const geometry = () => {
      const prompts = viewport.querySelectorAll(promptSlot)
      const last = prompts.item(prompts.length - 1)
      const isSent = last?.textContent?.includes(sentText)
      const bubble = isSent && (last.querySelector('.composer-human-message') || last)
      const image = isSent && (last.closest('[data-slot="aui_turn-pair"]') || last.parentElement).querySelector(imageSlot)
      return {
        top: round(viewport.scrollTop), max: round(viewport.scrollHeight - viewport.clientHeight),
        following: viewport.dataset.following, viewport: bounds(viewport), dock: bounds(dock),
        bubble: bounds(bubble), image: bounds(image), heldClearance: clearance?.style.minBlockSize || '',
      }
    }
    const before = geometry()
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries()))
    observer.observe({ type: 'longtask' })
    const done = Promise.withResolvers()
    window.hcvSendSample = done.promise
    const finish = () => {
      listeners.abort()
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      longTasks.push(...observer.takeRecords())
      observer.disconnect()
      done.resolve({
        inputType, before, frames,
        longTasks: longTasks.filter(task => start !== undefined && task.startTime + task.duration >= start)
          .map(task => ({ start: round(task.startTime - start), duration: round(task.duration) })),
      })
    }
    const sample = () => {
      const elapsed = round(performance.now() - start)
      frames.push({ elapsed, ...geometry() })
      if (elapsed >= 900) finish()
      else frame = requestAnimationFrame(sample)
    }
    const capture = event => {
      if (start !== undefined || !event.isTrusted) return
      if (event.type === 'keydown' && (event.key !== 'Enter' || !event.target.closest('[data-slot="composer-rich-input"]'))) return
      if (event.type === 'click' && !event.target.closest('button[type="submit"]')) return
      start = event.timeStamp
      inputType = event.type
      frame = requestAnimationFrame(sample)
    }
    for (const type of ['keydown', 'click', 'submit']) surface.addEventListener(type, capture, { capture: true, signal: listeners.signal })
    timer = setTimeout(finish, 1800)
  }, { sentText, promptSlot, imageSlot })
}

function summarize(trace) {
  const firstPromptIndex = trace.frames.findIndex(frame => frame.bubble)
  const firstBubble = trace.frames[firstPromptIndex]?.elapsed
  const firstImage = trace.frames.find(frame => frame.image?.width)?.elapsed
  const longestFrame = Math.max(0, ...trace.frames.map((frame, index) =>
    Math.round(frame.elapsed - (trace.frames[index - 1]?.elapsed ?? 0))))
  // Changing the height of the draft must not pull the old transcript down
  // before the new turn has a row in the list.
  const beforePrompt = firstPromptIndex < 0 ? trace.frames : trace.frames.slice(0, firstPromptIndex)
  const beforePromptDrop = Math.max(0, ...beforePrompt.map(frame => trace.before.top - frame.top))
  // Ignore the normal scroll to the newly sent turn. Measure reversals once it has appeared.
  const afterPrompt = trace.frames.filter(frame => frame.bubble)
  const backwardScroll = Math.max(0, ...afterPrompt.map((frame, index) => (afterPrompt[index - 1]?.top ?? frame.top) - frame.top))
  return { firstBubble, firstImage, longestFrame, beforePromptDrop, backwardScroll, ...trace }
}

export async function verifySendMessage({ page, expect, projectChat, projectFolder, screenshot, fixture, baseline = false }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const row = projectChat(title)
  await row.click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  const submit = chat.locator('button[type="submit"]')
  await expect(chat.getByText('Тестовый чат готов к проверке.', { exact: false })).toBeVisible()
  await expect(editor).toBeEditable()

  const trace = { baseline }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const rendererDurations = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics
    .filter(metric => ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(metric.name))
    .map(({ name, value }) => [name, value]))
  const geometry = async step => {
    const prompt = chat.locator(promptSlot).filter({ hasText: step.prompt })
    const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ has: page.locator(promptSlot).filter({ hasText: step.prompt }) })
    const bubble = prompt.locator('.composer-human-message')
    const image = turn.locator(imageSlot)
    await expect(bubble).toBeVisible()
    await expect(image).toHaveCount(1)
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true)
    const thumbnail = image.locator('xpath=ancestor::button[1]')
    const [text, photo, tile] = await Promise.all([bubble.boundingBox(), image.boundingBox(), thumbnail.boundingBox()])
    const computed = await image.evaluate(node => {
      const css = getComputedStyle(node)
      const button = getComputedStyle(node.closest('button'))
      return { fit: css.objectFit, innerRadius: css.borderTopLeftRadius, radius: button.borderTopLeftRadius,
        border: button.borderTopWidth, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight }
    })
    return { text, photo, tile, ...computed }
  }
  const assertGeometry = geometry => {
    const { text, photo, tile, fit, innerRadius, radius, border } = geometry
    const near = (value, target) => assert(Math.abs(value - target) <= 1, JSON.stringify(geometry))
    near(tile.width, 80)
    near(tile.height, 80)
    near(photo.width, 78)
    near(photo.height, 78)
    near(text.y - (tile.y + tile.height), 8)
    near(tile.x + tile.width, text.x + text.width)
    assert.deepEqual({ fit, innerRadius, radius, border },
      { fit: 'cover', innerRadius: '8px', radius: '10px', border: '1px' })
  }

  try {
    for (const step of fixture.steps) {
      await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(2)
      await editor.fill(step.prompt)
      if (step.photo) {
        await pastePhoto(editor, path.join(projectFolder, step.photo))
        await expect(chat.locator('[data-slot="composer-attachments"] img')).toHaveCount(1)
      }
      await expect(submit).toBeEnabled()
      await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(2)
      await armRecorder(chat, step.prompt)
      const before = await rendererDurations()
      if (step.name === 'text') await editor.press('Enter')
      else await submit.click()
      const sample = await page.evaluate(() => window.hcvSendSample)
      const after = await rendererDurations()
      const rendererMs = Object.fromEntries(Object.entries(after).map(([name, value]) =>
        [name, Math.round((value - before[name]) * 1000)]))
      const measured = trace[step.name] = { ...summarize(sample), rendererMs }
      assert(measured.inputType && measured.frames.length, JSON.stringify(measured))
      const { firstBubble, firstImage, longestFrame, beforePromptDrop, backwardScroll } = measured
      console.log('Send timing', step.name, JSON.stringify({
        firstBubble, firstImage, longestFrame, beforePromptDrop, backwardScroll, rendererMs,
        heldClearance: measured.frames.some(frame => frame.heldClearance),
      }))
      const message = chat.locator(promptSlot).filter({ hasText: step.prompt })
      await expect(message).toHaveCount(1)
      await expect(chat.getByText(step.reply, { exact: true })).toHaveCount(0)
      if (step.photo) {
        trace[step.name].live = await geometry(step)
        await screenshot(`send-${step.name}-live.png`)
      }
      step.gate.resolve()
      await expect(chat.getByText(step.reply, { exact: true })).toBeVisible({ timeout: 30000 })
      await expect.poll(() => step.received).toBe(1)
    }
    const tab = page.locator('[data-zone-tabstrip="grp-main"] [role="tab"]').filter({ hasText: title })
    await tab.hover()
    await tab.locator(':scope > span > button').click()
    await expect(tab).toHaveCount(0)
    await row.click()
    const imageStep = fixture.steps.find(step => step.name === 'image')
    await expect(chat.getByText(imageStep.reply, { exact: true })).toBeVisible()
    trace.image.saved = await geometry(imageStep)
    await screenshot('send-image-saved.png')
    if (!baseline) {
      assertGeometry(trace.image.live)
      assertGeometry(trace.image.saved)
      assertGeometry(trace.caption.live)
      trace.miniaturesVerified = true
      const sentImage = chat.locator('[data-slot="aui_turn-pair"]').filter({
        has: page.locator(promptSlot).filter({ hasText: imageStep.prompt }),
      }).locator(imageSlot).locator('xpath=ancestor::button[1]')
      await sentImage.click()
      const viewer = page.locator('[data-variant="media-lightbox"]')
      await expect(viewer.locator('img')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(viewer).toHaveCount(0)
      trace.previewVerified = true
      for (const sent of [trace.text, trace.image, trace.caption]) {
        assert(sent.beforePromptDrop <= 2, `The old transcript moved before the new row: ${sent.beforePromptDrop}px`)
      }
      trace.viewportVerified = true
    }
    return trace
  } finally {
    for (const step of fixture.steps) step.gate.resolve()
    await cdp.detach()
  }
}
