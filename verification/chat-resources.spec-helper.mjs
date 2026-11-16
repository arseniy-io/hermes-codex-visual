import assert from 'node:assert/strict'
import path from 'node:path'

import { previewResourceCard } from '../source/chat-resources.js'

export async function verifyChatResources({
  app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard,
}) {
  await projectChat('Проверка каталога').click()
  const thread = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="aui_thread-content"]')
  const answer = thread.locator('[data-slot="aui_assistant-message-content"]')
  const cards = answer.locator(previewResourceCard)
  const file = cards.filter({ hasText: 'fixture-note.md' })
  const longFile = cards.filter({ has: page.locator('span[title$="report.txt"]') })
  const site = cards.filter({ has: page.locator('span[title$="/resource-preview"]') })
  const folder = cards.filter({ has: page.locator('button:last-child > .tabler-icon-folder-open') })
  const artifact = answer.locator('[data-slot="aui_artifact-card"]').filter({ hasText: 'Отчёт проверки' })
  await expect(artifact).toBeVisible()
  await expect(file.getByRole('button', { name: 'Открыть содержащую папку' })).toHaveCount(1)
  const capture = async (target, name) => {
    await target.scrollIntoViewIfNeeded()
    const bounds = await target.boundingBox()
    const viewport = page.viewportSize()
    const x = Math.max(0, Math.floor(bounds.x - 14))
    const y = Math.max(0, Math.floor(bounds.y - 10))
    await screenshot(name, {
      clip: {
        x, y,
        width: Math.min(viewport.width, Math.ceil(bounds.x + bounds.width + 14)) - x,
        height: Math.min(viewport.height, Math.ceil(bounds.y + bounds.height + 10)) - y,
      },
    })
  }

  if (process.env.HERMES_VISUAL_RESOURCES_BEFORE === '1') {
    await capture(answer.filter({ hasText: 'Подготовил результаты проверки.' }), 'resources-before.png')
    console.log('Previous ZIP cards:', await cards.evaluateAll((elements) => elements.map((card) => {
      const { borderRadius, borderWidth } = getComputedStyle(card)
      return { name: card.children[1].textContent, borderRadius, borderWidth }
    })))
    return
  }

  await expect(cards).toHaveCount(4)
  await expect(folder).toHaveCount(1)
  const supportsCorners = await page.evaluate(() => CSS.supports('corner-shape', 'superellipse(1.5)'))
  const resourceRadius = supportsCorners ? '12.5px' : '10px'
  for (const card of [file, longFile, site, folder, artifact]) {
    await expect(card).toHaveCSS('border-radius', resourceRadius)
    await expect(card).toHaveCSS('border-width', '0px')
    await expect(card.locator(':scope > span:first-child')).toHaveCSS('width', '40px')
  }
  await expect(file).toHaveCSS('display', 'grid')
  await expect(file).toHaveCSS('padding', '6px')
  await expect(site).toHaveCSS('padding', '12px')
  const fileIcon = file.locator(':scope > span:first-child')
  const siteIcon = site.locator(':scope > span:first-child')
  const mask = (icon) => icon.evaluate((el) => getComputedStyle(el, '::before').maskImage)
  assert.match(await mask(fileIcon), /^url\(/)
  assert.notEqual(await mask(fileIcon), await mask(siteIcon))
  const download = site.getByRole('button', { name: 'Скачать', exact: true })
  const reveal = file.getByRole('button', { name: 'Открыть содержащую папку' })
  const open = file.getByRole('button', { name: 'Открыть предпросмотр', exact: true })
  const close = file.getByRole('button', { name: 'Скрыть', exact: true })
  await expect(download).toHaveCSS('border-radius', '8px')
  await expect(download).toHaveCSS('height', '28px')
  await page.mouse.move(0, 0)
  await expect(download).toHaveCSS('opacity', '0')
  await expect(reveal).toHaveCSS('opacity', '0')
  await site.hover()
  await expect(download).toHaveCSS('opacity', '1')
  await file.hover()
  await expect(reveal).toHaveCSS('opacity', '1')
  await capture(file, 'file-hover.png')
  await page.mouse.move(0, 0)

  // Place the starting focus while Hermes is handling keyboard navigation.
  // Outside a navigation gesture it redirects scripted focus to the composer.
  await page.keyboard.down('Tab')
  await reveal.focus()
  await page.keyboard.up('Tab')
  await expect(reveal).toBeFocused()
  await expect(reveal).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab')
  await expect(open).toBeFocused()
  await expect(file).toHaveCSS('outline-width', '2px')
  await page.keyboard.press('Enter')
  await expect(close).toBeVisible()
  await close.click()

  // A click on the visible filename reaches the same native handler as the caption.
  const filename = file.getByText('fixture-note.md', { exact: true })
  await expect(filename).toHaveAttribute('title', /fixture-note\.md$/)
  await filename.click()
  await expect(close).toBeVisible()
  const rendered = page.locator('[data-preview-markdown]')
  if (!(await rendered.isVisible())) {
    await page.getByRole('button', { name: /^предпросмотр$/i }).click()
  }
  await expect(rendered.getByText('Тестовый файл', { exact: true })).toBeVisible()
  await close.click()
  await expect(open).toBeVisible()

  // Capture the real renderer-to-main action without opening Windows Explorer.
  await app.evaluate(({ app, ipcMain }) => {
    ipcMain.removeHandler('hermes:fs:reveal')
    ipcMain.handle('hermes:fs:reveal', (_event, target) => {
      app.hcvFixtureRevealed = target
      return true
    })
    ipcMain.removeHandler('hermes:fs:openDir')
    ipcMain.handle('hermes:fs:openDir', (_event, target) => {
      app.hcvFixtureDirectory = target
      return { ok: true }
    })
  })
  await file.hover()
  await reveal.click()
  await expect.poll(() => app.evaluate(({ app }) => app.hcvFixtureRevealed))
    .toBe(path.join(projectFolder, 'fixture-note.md'))
  await expect(open).toBeVisible()
  await folder.getByRole('button').click()
  await expect.poll(() => app.evaluate(({ app }) => app.hcvFixtureDirectory)).toBe(projectFolder)

  const media = answer.locator('[data-hcv-audio]')
  const audio = media.locator('audio')
  const play = media.locator('.hcv-audio-play')
  const seek = media.getByRole('slider')
  const options = media.locator('.hcv-audio-options')
  const waveform = media.locator('.hcv-audio-glyph')
  await expect(media).toHaveCSS('border-radius', resourceRadius)
  await expect(media).toHaveCSS('border-width', '0px')
  await expect(audio).toBeHidden()
  await expect.poll(() => audio.evaluate((el) => el.controls && el.duration === 4)).toBe(true)
  await expect(media).toContainText('0:00 / 0:04')
  await expect(seek).toHaveCSS('height', '20px')
  await expect(play).toHaveCSS('width', '32px')
  const darkWaveform = await waveform.evaluate((el) => getComputedStyle(el, '::before').backgroundImage)
  if (process.env.HERMES_VISUAL_EXPECT_LOCAL_ICONS === '1') assert.match(darkWaveform, /4784E1/i)
  await play.press('Enter')
  await expect(play).toHaveAttribute('data-playing', 'true')
  await play.press('Space')
  await expect(play).toHaveAttribute('data-playing', 'false')
  await seek.press('End')
  await expect.poll(() => audio.evaluate(el => el.currentTime)).toBe(4)
  await seek.press('Home')
  await expect(media).toContainText('0:00 / 0:04')
  await options.click()
  await expect(audio).toBeVisible()
  await expect(options).toHaveAttribute('aria-expanded', 'true')
  await options.click()
  await expect(audio).toBeHidden()
  await page.mouse.move(0, 0)
  await capture(answer.filter({ hasText: 'Подготовил результаты проверки.' }), 'resources-after.png')
  const image = thread.locator('[data-slot="aui_embedded-images"] img')
  await expect(image).toHaveCSS('border-radius', '12px')
  await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)
  await image.locator('xpath=ancestor::button[1]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await artifact.click()
  const artifactTab = page.getByRole('tab', { name: /Отчёт проверки/ })
  await expect(artifactTab).toBeVisible()

  await page.setViewportSize({ width: 760, height: 720 })
  const longTitle = longFile.locator(':scope > span[title]')
  await longTitle.scrollIntoViewIfNeeded()
  assert.equal(await longTitle.evaluate((el) => el.scrollWidth > el.clientWidth), true)
  assert.equal(await longFile.evaluate((el) => el.scrollWidth <= el.clientWidth), true)
  await expect(longFile.getByRole('button', { name: 'Открыть содержащую папку' })).toBeVisible()
  assert.equal(await media.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
  await capture(media, 'audio-narrow.png')

  await page.setViewportSize({ width: 1440, height: 920 })
  const dark = await file.evaluate((el) => getComputedStyle(el).backgroundColor)
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await closeSettings()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => file.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(dark)
  await expect(file).toHaveCSS('border-radius', resourceRadius)
  if (process.env.HERMES_VISUAL_EXPECT_LOCAL_ICONS === '1') {
    assert.match(await waveform.evaluate((el) => getComputedStyle(el, '::before').backgroundImage), /3C5CD8/i)
  }
  await capture(answer.filter({ hasText: 'Подготовил результаты проверки.' }), 'resources-light.png')

  await site.getByRole('button', { name: 'Открыть предпросмотр', exact: true }).click()
  await expect(page.locator('[data-preview-browser]:visible')).toBeVisible()
  await expect.poll(() => app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((tab) => tab.getTitle() === 'Тестовый сайт'))).toBe(true)

  await page.emulateMedia({ forcedColors: 'active' })
  await expect(media).toHaveCount(0)
  await expect(answer.locator('audio')).toBeVisible()
  await page.emulateMedia({ forcedColors: 'none' })
  await expect(media).toHaveCount(1)
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(media).toHaveCount(0)
  await expect(answer.locator('audio')).toBeVisible()
  console.log('Resource cards: native file preview, reveal IPC, directory, website preview, HTML artifact, image zoom, audio play/pause/seek, both themes, forced colors and narrow layout.')
}
