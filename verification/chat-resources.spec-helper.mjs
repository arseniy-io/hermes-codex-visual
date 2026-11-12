import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { previewResourceCard } from '../source/chat-resources.js'

export async function verifyChatResources({
  app, page, expect, projectChat, screenshot, projectFolder, downloadDir, openThemeSettings, closeSettings,
}) {
  await projectChat('Проверка каталога').click()
  const thread = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="aui_thread-content"]')
  const answer = thread.locator('[data-slot="aui_assistant-message-content"]')
  const cards = answer.locator(previewResourceCard)
  const file = cards.filter({ hasText: 'fixture-note.md' })
  const longFile = cards.filter({ has: page.locator('span[title$="report.txt"]') })
  const site = cards.filter({ has: page.locator('span[title$="/resource-preview"]') })
  const artifact = answer.locator('[data-slot="aui_artifact-card"]').filter({ hasText: 'Отчёт проверки' })
  await expect(cards).toHaveCount(3)
  await expect(artifact).toBeVisible()
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
    await capture(file, 'file-before.png')
    await capture(artifact, 'artifact-before.png')
    console.log('Previous ZIP card:', await file.evaluate((card) => {
      const style = getComputedStyle(card)
      return { borderRadius: style.borderRadius, borderWidth: style.borderWidth }
    }))
    return
  }

  const auditBaseline = process.env.HERMES_VISUAL_AUDIT_BASELINE === '1'
  const supportsCorners = await page.evaluate(() => CSS.supports('corner-shape', 'superellipse(1.5)'))
  const resourceRadius = !auditBaseline && supportsCorners ? '12.5px' : '10px'
  for (const card of [file, longFile, site, artifact]) {
    await expect(card).toHaveCSS('border-radius', resourceRadius)
    await expect(card).toHaveCSS('border-width', '0px')
    await expect(card.locator(':scope > span:first-child')).toHaveCSS('width', '40px')
  }
  await expect(file).toHaveCSS('display', 'grid')
  const fileIcon = file.locator(':scope > span:first-child')
  const siteIcon = site.locator(':scope > span:first-child')
  const mask = (icon) => icon.evaluate((el) => getComputedStyle(el, '::before').maskImage)
  assert.match(await mask(fileIcon), /^url\(/)
  assert.notEqual(await mask(fileIcon), await mask(siteIcon))
  const download = file.getByRole('button', { name: 'Скачать', exact: true })
  const open = file.getByRole('button', { name: 'Открыть предпросмотр', exact: true })
  const close = file.getByRole('button', { name: 'Скрыть', exact: true })
  await expect(download).toHaveCSS('border-radius', '8px')
  await expect(download).toHaveCSS('height', '28px')
  await page.mouse.move(0, 0)
  if (!auditBaseline) await expect(download).toHaveCSS('opacity', '0')
  await capture(file, 'file-after.png')
  await capture(artifact, 'artifact-after.png')
  await capture(site, 'site-after.png')
  await file.hover()
  await expect(download).toHaveCSS('opacity', '1')
  await capture(file, 'file-hover.png')
  await page.mouse.move(0, 0)

  // Place the starting focus while Hermes is handling keyboard navigation.
  // Outside a navigation gesture it redirects scripted focus to the composer.
  await page.keyboard.down('Tab')
  await download.focus()
  await page.keyboard.up('Tab')
  await expect(download).toBeFocused()
  await expect(download).toHaveCSS('opacity', '1')
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
  await expect(page.locator('[data-preview-markdown]').getByText('Тестовый файл', { exact: true })).toBeVisible()
  await close.click()
  await expect(open).toBeVisible()

  const destination = path.join(downloadDir, 'downloaded-note.md')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, destination)
  await file.hover()
  await download.click()
  const original = fs.readFileSync(path.join(projectFolder, 'fixture-note.md'))
  await expect.poll(() => fs.existsSync(destination) && fs.readFileSync(destination).equals(original)).toBe(true)
  await expect(open).toBeVisible()

  const media = answer.locator('span[class~="bg-muted/35"]:has(> audio)')
  await expect(media).toHaveCSS('border-radius', '10px')
  await expect(media).toHaveCSS('border-width', '0px')
  await expect.poll(() => media.locator('audio').evaluate((el) => el.controls && el.readyState >= 1)).toBe(true)
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
  await expect(longFile.getByRole('button', { name: 'Скачать', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 920 })
  const dark = await file.evaluate((el) => getComputedStyle(el).backgroundColor)
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await closeSettings()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => file.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(dark)
  await expect(file).toHaveCSS('border-radius', resourceRadius)
  await capture(file, 'file-light.png')

  await site.getByRole('button', { name: 'Открыть предпросмотр', exact: true }).click()
  await expect(page.locator('[data-preview-browser]:visible')).toBeVisible()
  await expect.poll(() => app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((tab) => tab.getTitle() === 'Тестовый сайт'))).toBe(true)
  console.log('Resource cards: file preview by pointer and keyboard, saved bytes, website preview, HTML artifact tab, audio, image zoom, narrow and light layouts.')
}
