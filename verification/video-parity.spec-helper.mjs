import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function seedVideos(folder) {
  for (const [name, size] of [['portrait.mp4', '720x1280'], ['landscape.mp4', '960x540']]) {
    const result = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24`,
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100',
      '-t', '21', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-af', 'volume=0.08', '-movflags', '+faststart', path.join(folder, name),
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  }
}

export async function verifyVideoParity({
  app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard,
}) {
  await page.setViewportSize({ width: 1440, height: 920 })
  await projectChat('Проверка каталога').click()
  const answer = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="aui_assistant-message-content"]')
  const videos = answer.locator('video')
  await expect(videos).toHaveCount(2)
  const portrait = videos.first()
  const landscape = videos.last()
  const player = portrait.locator('..')
  const landscapePlayer = landscape.locator('..')
  await player.evaluate(card => card.scrollIntoView({ block: 'center' }))

  const measure = () => player.evaluate(card => {
    const box = el => {
      const { x, y, width, height } = el.getBoundingClientRect()
      return { x, y, width, height }
    }
    const video = card.querySelector('video')
    const row = card.querySelector('.hcv-video-row')
    const slider = card.querySelector('.hcv-video-range')
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio },
      player: box(card),
      video: { ...box(video), objectFit: getComputedStyle(video).objectFit, nativeControls: video.controls },
      surface: getComputedStyle(card).backgroundColor,
      row: row && box(row),
      button: row && box(row.querySelector('button')),
      track: slider && box(slider),
      timeFont: row && getComputedStyle(row.querySelector('.hcv-video-time')).fontSize,
    }
  })

  if (process.env.HERMES_VISUAL_VIDEO_BEFORE === '1') {
    await expect(player).not.toHaveAttribute('data-hcv-video', '')
    await expect.poll(() => portrait.evaluate(video => video.controls)).toBe(true)
    await screenshot('video-before.png')
    return { before: await measure() }
  }

  await expect(player).toHaveAttribute('data-hcv-video', '')
  await expect(landscapePlayer).toHaveAttribute('data-hcv-video', '')
  await expect(player.locator(':scope > span:first-child')).toBeHidden()
  await expect.poll(() => portrait.evaluate(video => ({ duration: video.duration, width: video.videoWidth })))
    .toEqual({ duration: 21, width: 720 })
  await expect.poll(() => landscape.evaluate(video => video.videoWidth)).toBe(960)
  await expect.poll(() => portrait.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2)
  await player.evaluate(card => card.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect(player).toBeInViewport({ ratio: .99 })
  const row = player.locator('.hcv-video-row')
  const play = row.locator('> button')
  const seek = row.getByRole('slider', { name: 'Перемотка видео' })
  const time = row.locator('.hcv-video-time')
  const sound = player.locator('.hcv-video-sound')
  const volume = row.getByRole('button', { name: 'Громкость видео' })
  const menu = player.getByRole('menu', { name: 'Настройки видео' })
  const options = row.getByRole('button', { name: 'Настройки видео' })
  const full = row.locator('button[data-icon="fullscreen"], button[data-icon="exitFullscreen"]')
  await expect(time).toHaveText('0:00 / 0:21')
  await expect(portrait).toHaveCSS('object-fit', 'contain')
  await expect(row).toHaveCSS('height', '40px')
  await expect(play).toHaveCSS('width', '28px')
  await expect(seek).toHaveCSS('height', '24px')
  const playMask = await play.evaluate(el => getComputedStyle(el, '::before').maskImage)
  assert.match(playMask, /data:image\/svg/)
  const record = { inline: await measure() }
  await screenshot('video-inline.png')

  await volume.hover()
  await expect(volume).toHaveCSS('background-color', 'rgb(41, 41, 41)')
  await expect.poll(() => volume.evaluate(button => getComputedStyle(button, '::after').visibility)).toBe('visible')
  await volume.click()
  await expect(sound).toBeVisible()
  await expect(volume).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(() => volume.evaluate(button => getComputedStyle(button, '::after').visibility)).toBe('hidden')
  const soundBox = await sound.boundingBox()
  const volumeBox = await volume.boundingBox()
  assert.equal(soundBox.width, 168)
  assert.equal(soundBox.height, 36)
  assert(Math.abs(soundBox.x + soundBox.width - volumeBox.x - volumeBox.width) < 1)
  assert(Math.abs(volumeBox.y - soundBox.y - soundBox.height - 5) < 1)
  record.volume = { width: soundBox.width, height: soundBox.height, gap: volumeBox.y - soundBox.y - soundBox.height }
  await screenshot('video-volume.png')
  const volumeSlider = sound.getByRole('slider')
  await volumeSlider.press('Home')
  await expect.poll(() => portrait.evaluate(video => video.volume)).toBe(0)
  await expect(volume).toHaveAttribute('data-icon', 'muted')
  await volumeSlider.press('End')
  const mute = sound.getByRole('button')
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(volumeSlider).toHaveAttribute('aria-valuetext', '0 %')
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await expect(sound).toBeHidden()

  await play.click()
  await expect(play, 'Clicking Play starts the clip').toHaveAttribute('data-icon', 'pause')
  await page.evaluate(() => { document.documentElement.lang = 'en' })
  await expect(play).toHaveAttribute('aria-label', 'Pause video')
  await expect.poll(() => portrait.evaluate(video => video.paused)).toBe(false)
  await page.evaluate(() => { document.documentElement.lang = 'ru' })
  await expect(play).toHaveAttribute('aria-label', 'Приостановить воспроизведение видео')
  assert.notEqual(await play.evaluate(el => getComputedStyle(el, '::before').maskImage), playMask)
  await expect.poll(() => portrait.evaluate(video => video.currentTime)).toBeGreaterThan(0)
  const sliderBox = await seek.boundingBox()
  const sliderY = sliderBox.y + sliderBox.height / 2
  await page.mouse.move(sliderBox.x + sliderBox.width * .55, sliderY)
  await page.mouse.down()
  await expect.poll(() => portrait.evaluate(video => video.paused)).toBe(true)
  await page.mouse.move(sliderBox.x + sliderBox.width * .66, sliderY - 50, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => portrait.evaluate(video => video.paused)).toBe(false)
  await play.click()
  await expect(play).toHaveAttribute('data-icon', 'play')
  await expect.poll(() => portrait.evaluate(video => video.currentTime)).toBeGreaterThan(12)
  await seek.press('Home')
  await expect(time).toHaveText('0:00 / 0:21')
  await expect(seek).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(play).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(portrait).toBeFocused()
  await page.keyboard.press('Space')
  await expect(play, 'Space on the video starts the clip').toHaveAttribute('data-icon', 'pause')
  await portrait.click()
  await expect(play).toHaveAttribute('data-icon', 'play')

  await options.click()
  await expect(menu.getByRole('menuitemradio')).toHaveCount(8)
  await expect(menu.getByRole('menuitemradio', { name: '1×', exact: true })).toHaveAttribute('aria-checked', 'true')
  await screenshot('video-menu.png')
  await expect(menu.getByRole('menuitem', { name: 'Сохранить видео как…' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect.poll(() => portrait.evaluate(video => video.playbackRate)).toBe(.25)
  await expect(menu).toBeHidden()
  await expect(options).toBeFocused()

  const saved = path.join(projectFolder, 'saved-portrait.mp4')
  await app.evaluate(({ dialog, session }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    session.defaultSession.on('will-download', (_event, item) => item.setSavePath(filePath))
  }, saved)
  await options.click()
  await menu.getByRole('menuitem', { name: 'Сохранить видео как…' }).click()
  await expect.poll(() => fs.existsSync(saved) && fs.readFileSync(saved).equals(fs.readFileSync(path.join(projectFolder, 'portrait.mp4'))))
    .toBe(true)

  if (await page.evaluate(() => document.pictureInPictureEnabled)) {
    await options.click()
    await menu.getByRole('menuitem', { name: 'Картинка в картинке' }).click()
    await expect.poll(() => portrait.evaluate(video => document.pictureInPictureElement === video)).toBe(true)
    await page.evaluate(() => document.exitPictureInPicture())
  }

  const position = await portrait.evaluate(video => video.currentTime)
  await full.click()
  await expect.poll(() => player.evaluate(card => document.fullscreenElement === card)).toBe(true)
  await expect(full).toHaveAttribute('data-icon', 'exitFullscreen')
  await expect.poll(() => player.evaluate(card => card.getBoundingClientRect().top)).toBe(0)
  const fullMetrics = await measure()
  assert.equal(fullMetrics.player.width, fullMetrics.viewport.width)
  assert.equal(fullMetrics.player.height, fullMetrics.viewport.height)
  assert.equal(fullMetrics.video.objectFit, 'contain')
  assert.equal(fullMetrics.video.height + 1 + fullMetrics.row.height, fullMetrics.player.height)
  assert.equal(await portrait.evaluate(video => video.currentTime), position)
  record.fullscreen = fullMetrics
  await page.mouse.move(0, 0)
  await screenshot('video-fullscreen.png')
  await volume.click()
  await expect(sound).toBeVisible()
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(sound).toBeHidden()
  await expect(full).toHaveAttribute('data-icon', 'exitFullscreen')
  await options.click()
  await menu.getByRole('menuitemradio', { name: '1,5×', exact: true }).click()
  await expect.poll(() => portrait.evaluate(video => video.playbackRate)).toBe(1.5)
  await page.keyboard.press('Escape')
  await expect(full).toHaveAttribute('data-icon', 'fullscreen')
  await expect.poll(() => portrait.evaluate(video => ({ time: video.currentTime, muted: video.muted })))
    .toEqual({ time: position, muted: true })

  await landscape.scrollIntoViewIfNeeded()
  await landscapePlayer.getByRole('button', { name: 'Громкость видео' }).click()
  await expect(landscapePlayer.locator('.hcv-video-sound')).toBeVisible()
  await expect(sound).toBeHidden()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 760, height: 720 })
  await portrait.scrollIntoViewIfNeeded()
  await screenshot('video-narrow.png')
  record.narrow = await measure()
  assert(record.narrow.player.x + record.narrow.player.width <= record.narrow.viewport.width)

  await page.setViewportSize({ width: 1440, height: 920 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await closeSettings()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(player).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await portrait.scrollIntoViewIfNeeded()
  await screenshot('video-light.png')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(player).not.toHaveAttribute('data-hcv-video', '')
  await expect.poll(() => portrait.evaluate(video => video.controls)).toBe(true)
  await page.emulateMedia({ forcedColors: 'none' })
  await expect(player).toHaveAttribute('data-hcv-video', '')
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(player).not.toHaveAttribute('data-hcv-video', '')
  await expect.poll(() => portrait.evaluate(video => video.controls)).toBe(true)
  console.log('Video: both transcript entry points, seek and drag, audio, speed menu, save, fullscreen, themes and narrow window.')
  return record
}
