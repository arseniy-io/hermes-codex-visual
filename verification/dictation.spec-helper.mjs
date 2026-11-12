import assert from 'node:assert/strict'

export function fixtureAudio() {
  const sampleRate = 48000
  const samples = sampleRate * 2
  const audio = Buffer.alloc(44 + samples * 2)
  audio.write('RIFF', 0)
  audio.writeUInt32LE(audio.length - 8, 4)
  audio.write('WAVEfmt ', 8)
  audio.writeUInt32LE(16, 16)
  audio.writeUInt16LE(1, 20)
  audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(sampleRate, 24)
  audio.writeUInt32LE(sampleRate * 2, 28)
  audio.writeUInt16LE(2, 32)
  audio.writeUInt16LE(16, 34)
  audio.write('data', 36)
  audio.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index++) {
    const time = index / sampleRate
    const volume = 4000 + 3300 * Math.sin(time * Math.PI * 4)
    audio.writeInt16LE(Math.round(volume * Math.sin(time * Math.PI * 880)), 44 + index * 2)
  }
  return audio
}

export async function verifyDictation({ page, expect, screenshot, voiceRequests }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const form = chat.locator('form[data-slot="composer-root"]')
  const editor = form.locator('[data-slot="composer-rich-input"]')
  const strip = form.locator('[data-hcv-dictation]')
  const mic = form.locator('[data-slot="fan-menu-anchor"]').getByRole('button', { name: 'Голосовая диктовка', exact: true })
  const stop = form.getByRole('button', { name: 'Остановить диктовку', exact: true })
  const cancel = form.getByRole('button', { name: 'Отменить диктовку', exact: true })
  const selectAt = async offset => {
    await editor.evaluate((node, index) => {
      node.focus()
      window.getSelection().collapse(node.firstChild, index)
    }, offset)
  }
  await editor.fill('Начало конец.')
  await selectAt('Начало '.length)
  await mic.click()
  await expect(strip).toHaveAttribute('data-state', 'recording')
  await expect(editor).toBeEditable()
  await expect(editor).toHaveText('Начало конец.')
  await expect(stop.locator('.codicon-mic')).toBeHidden()
  await expect.poll(() => stop.evaluate(button => getComputedStyle(button, '::before').display)).toBe('none')
  await expect(form.locator('button[type="submit"]')).toBeVisible()
  await expect(form.locator('[data-slot="composer-fade"]')).toHaveCSS('overflow', 'hidden')
  await expect(form.locator('[data-slot="composer-surface"]')).toHaveCSS('background-clip', 'padding-box')
  const wave = strip.locator('canvas')
  await expect(wave).toBeVisible()
  await expect.poll(() => wave.evaluate(canvas => canvas.width)).toBeGreaterThan(100)
  await expect.poll(() => wave.evaluate(canvas => {
    const { width, height } = canvas
    const { data } = canvas.getContext('2d').getImageData(0, Math.floor(height / 3), width, 1)
    return data.some((byte, index) => index % 4 === 3 && byte > 30)
  })).toBe(true)
  await selectAt(0)
  await page.keyboard.insertText('Новое ')
  await expect(editor).toHaveText('Новое Начало конец.')
  await screenshot('dictation-recording.png')

  await stop.click()
  await expect(strip).toHaveAttribute('data-state', 'transcribing')
  await expect.poll(() => voiceRequests.length).toBe(1)
  assert.match(voiceRequests[0].contentType, /multipart\/form-data/)
  assert(voiceRequests[0].bytes > 500)
  await editor.press('End')
  await page.keyboard.insertText(' И хвост.')
  voiceRequests[0].release()
  await expect(editor).toHaveText('Новое Начало вставка голосом конец. И хвост.')
  await expect(strip).toHaveCount(0)
  await screenshot('dictation-inserted.png')

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('hermes:composer-dictation', { detail: { target: 'main' } })))
  await expect(strip).toHaveAttribute('data-state', 'recording')
  await cancel.click()
  await expect(strip).toHaveCount(0)
  await expect(editor).toHaveText('Новое Начало вставка голосом конец. И хвост.')
  assert.equal(voiceRequests.length, 1)

  await mic.click()
  await expect(strip).toHaveAttribute('data-state', 'recording')
  await expect.poll(() => wave.evaluate(canvas => canvas.width)).toBeGreaterThan(100)
  await stop.click()
  await expect.poll(() => voiceRequests.length).toBe(2)
  const sidebar = page.locator('[data-hcv-sidebar-shell]')
  const project = sidebar.getByRole('button', { name: 'Тестовый проект', exact: true })
  if (await project.getAttribute('aria-expanded') === 'false') await project.click()
  await sidebar.getByRole('button', { name: 'Ревью интерфейса', exact: true }).click()
  await expect(chat.locator('[data-slot="aui_thread-viewport"]').getByText('Тестовый чат готов к проверке.')).toBeVisible()
  await expect(strip).toHaveCount(0)
  voiceRequests[1].release()
  await voiceRequests[1].sent
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(editor).toBeEmpty()

  await chat.locator('[data-slot="composer-dock"]').evaluate(dock => { dock.style.maxWidth = '245px' })
  await form.getByRole('button', { name: 'Голос', exact: true }).click()
  const voiceItem = page.getByRole('menuitemcheckbox', { name: 'Голосовая диктовка', exact: true })
  await voiceItem.click()
  await expect(voiceItem).toHaveCount(0)
  await expect(strip).toHaveAttribute('data-state', 'recording')
  await expect(stop).toBeVisible()
  await expect.poll(() => wave.evaluate(canvas => canvas.width)).toBeGreaterThan(40)
  await stop.click()
  await expect.poll(() => voiceRequests.length).toBe(3)
  voiceRequests[2].release()
  await expect(editor).toHaveText('вставка голосом')
  await expect(strip).toHaveCount(0)
  console.log(JSON.stringify({ microphone: 'fixture', waveform: true, requests: 3, savedCaret: true, editable: true,
    cancellation: true, lateResultIsolated: true, compactControls: true }))
}
