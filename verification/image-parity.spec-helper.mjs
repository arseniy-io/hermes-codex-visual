import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const card = '.group\\/attachment:has(> button:first-child img)'
const rail = '[data-slot="composer-attachments"]'

async function pastePhotos(editor, files) {
  await editor.focus()
  await editor.evaluate((input, images) => {
    const clipboardData = new DataTransfer()
    for (const { name, bytes } of images) {
      const data = Uint8Array.from(atob(bytes), char => char.charCodeAt(0))
      clipboardData.items.add(new File([data], name, { type: 'image/png' }))
    }
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, files.map(file => ({ name: path.basename(file), bytes: fs.readFileSync(file, 'base64') })))
}

const measure = async target => target.evaluate(node => {
  const { x, y, width, height } = node.getBoundingClientRect()
  const css = getComputedStyle(node)
  return { x, y, width, height, radius: css.borderTopLeftRadius, gap: css.columnGap, opacity: css.opacity }
})

export async function verifyImageParity({ app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard }) {
  const before = process.env.HERMES_VISUAL_IMAGE_BEFORE === '1'
  const root = page.locator('html')
  const editor = page.locator('[data-slot="composer-rich-input"][contenteditable="true"]:visible')
  const viewer = page.locator('[data-variant="media-lightbox"]')
  const photos = [1, 2, 3].map(index => path.join(projectFolder, `parity-photo-${index}.png`))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await projectChat('Проверка каталога').click()
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  await expect(chat.getByText('Проверка истории завершена.', { exact: true })).toBeVisible()
  const navigation = chat.locator('button[data-hcv-turn-line]').last()
  if (await navigation.count() && await navigation.getAttribute('aria-expanded') !== 'true') await navigation.click()

  const images = chat.locator('[data-tool-row][data-hcv-activity-icon="activityImage"]')
  const toggle = images.first().locator(':scope > div:first-child button[aria-expanded]')
  if (!before) await expect(toggle).toHaveAccessibleName('Просмотрено изображение')
  const caret = toggle.locator('.codicon-chevron-right')
  await toggle.hover()
  const closedActivity = await measure(toggle)
  await toggle.click()
  const thumbnail = images.first().locator('[data-slot="aui_markdown-image"]')
  await expect(thumbnail.locator('img')).toBeVisible()
  const activity = await measure(thumbnail)
  if (!before) {
    await expect(thumbnail).toHaveCSS('width', '80px')
    await expect(thumbnail).toHaveCSS('height', '80px')
    await expect(caret).toHaveCSS('width', '14px')
    await expect(caret).toHaveCSS('transition-duration', '0.3s')
    await expect.poll(() => caret.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(0, 1, -1, 0, 0, 0)')
  }
  const one = thumbnail.getByRole('button').first()
  await one.click()
  await expect(viewer.locator('img')).toBeVisible()
  const activityViewer = await measure(viewer)
  if (!before) await expect(viewer).toHaveAttribute('data-hcv-image-viewer', 'activity')
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(one).toBeFocused()
  await toggle.click()
  await expect(thumbnail).toHaveCount(0)
  await expect(chat.getByText('fixture vision error', { exact: true })).toHaveCount(0)

  const multi = chat.locator('[data-tool-group]').filter({
    has: page.locator('[data-tool-summary]').filter({ hasText: /Analyzed 3 images|Просмотрено 3 изображения/ }),
  })
  const multiToggle = multi.locator(':scope > [data-tool-summary] button[aria-expanded]')
  if (!before) await expect(multiToggle).toHaveAccessibleName('Просмотрено 3 изображения')
  await multiToggle.click()
  if (before) {
    for (const row of await multi.locator('[data-tool-row]').all()) await row.locator('button[aria-expanded="false"]').click()
  } else {
    await expect(multiToggle).toHaveAccessibleName('Просмотрено 3 изображения')
  }
  const gallery = multi.locator('[data-slot="aui_markdown-image"] img')
  await expect(gallery).toHaveCount(3)
  await expect.poll(() => gallery.evaluateAll(items => items.every(img => img.naturalWidth > 0))).toBe(true)
  const activityGallery = await Promise.all((await gallery.all()).map(measure))
  if (!before) {
    assert.equal(activityGallery[0].y, activityGallery[1].y)
    assert.equal(activityGallery[1].x - activityGallery[0].x, 88)
    assert(activityGallery.every(image => image.width === 78 && image.height === 78))
    assert.equal(activityGallery[0].x - (await multiToggle.boundingBox()).x, 1)
  }
  await multiToggle.scrollIntoViewIfNeeded()
  await screenshot('activity.png')
  const fromGallery = multi.locator('[data-slot="aui_zoomable-image"] > button:first-child').first()
  await fromGallery.click()
  await expect(viewer.locator('img')).toBeVisible()
  const naturalWidth = () => viewer.locator('img').evaluate(img => img.naturalWidth)
  if (!before) {
    await viewer.getByRole('button', { name: 'Следующее изображение', exact: true }).click()
    await expect.poll(naturalWidth).toBe(1080)
    await page.keyboard.press('ArrowLeft')
    await expect.poll(naturalWidth).toBe(1400)
  }
  const save = viewer.getByRole('button', { name: /Скачать изображение|Download image/ })
  const saveTarget = path.join(projectFolder, 'saved-image.png')
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ filePath: destination, canceled: false })
  }, saveTarget)
  const zoomIn = viewer.getByRole('button', { name: /Увеличить|Zoom in/ })
  await zoomIn.click()
  await expect(viewer.getByRole('button', { name: /Сбросить масштаб|Reset zoom/ })).not.toHaveText('100%')
  await viewer.getByRole('button', { name: /Сбросить масштаб|Reset zoom/ }).click()
  if (!before) {
    const next = viewer.getByRole('button', { name: 'Следующее изображение', exact: true })
    const bounds = await next.boundingBox()
    assert.equal(bounds.y + bounds.height / 2, page.viewportSize().height / 2)
    await page.mouse.move(15, 120)
    await screenshot('activity-viewer.png')
  }
  await save.click()
  await expect.poll(() => fs.existsSync(saveTarget) && fs.readFileSync(saveTarget).equals(fs.readFileSync(photos[0]))).toBe(true)
  if (!before) {
    await expect(save).toHaveCSS('width', '40px')
    await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click()
  } else await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect.poll(() => chat.evaluate(node => node.contains(document.activeElement))).toBe(true)
  await multiToggle.click()
  await expect(gallery).toHaveCount(0)

  await editor.fill('Черновик остаётся на месте')
  await pastePhotos(editor, photos)
  const attachmentList = chat.locator(rail)
  const tiles = attachmentList.locator(card)
  await expect(tiles).toHaveCount(3)
  const draftTiles = await Promise.all((await tiles.all()).map(measure))
  const tile = tiles.first()
  const preview = tile.getByRole('button').first()
  const remove = tile.getByRole('button', { name: /Удалить|Remove/ })
  if (!before) {
    assert.equal(draftTiles[0].width, 122)
    assert.equal(draftTiles[0].height, 122)
    assert.equal(draftTiles[0].radius, '10px')
    assert.equal(draftTiles[1].x - draftTiles[0].x, 130)
    await expect(remove).toHaveCSS('opacity', '0')
    await expect(remove).toHaveCSS('pointer-events', 'none')
  }
  await preview.hover()
  await expect(remove).toHaveCSS('opacity', '1')
  if (!before) await expect(remove).toHaveCSS('width', '16px')
  await screenshot('draft-hover.png')
  await preview.click()
  await expect(viewer.locator('img')).toBeVisible()
  const draftViewer = await measure(viewer)
  if (!before) {
    await expect(viewer).toHaveAttribute('data-hcv-image-viewer', 'draft')
    await expect(viewer.getByRole('button', { name: 'Следующее изображение', exact: true })).toBeVisible()
    await screenshot('draft-viewer.png')
  }
  await page.mouse.click(4, 170)
  await expect(viewer).toHaveCount(0)
  await expect(preview).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(remove).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tiles).toHaveCount(2)
  await expect(editor).toHaveText('Черновик остаётся на месте')

  if (!before) {
    await page.setViewportSize({ width: 760, height: 720 })
    await pastePhotos(editor, photos)
    await expect(tiles).toHaveCount(5)
    await expect.poll(() => attachmentList.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
    await tiles.last().getByRole('button').first().focus()
    await expect.poll(() => attachmentList.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
    await expect(editor).toBeVisible()
    await screenshot('draft-narrow.png')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(caret).toHaveCSS('transition-property', 'none')
    await page.setViewportSize({ width: 1440, height: 920 })
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/).first().click()
    await expect(root).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await expect(tiles.first()).toHaveCSS('width', '122px')
    await screenshot('draft-light.png')
    await openThemeSettings()
    await themeCard('Nous').click()
    await closeSettings()
    await expect(root).not.toHaveAttribute('data-hermes-theme', 'codex-workspace')
    await expect(page.locator('style[data-hcv-chat-images]')).toHaveCount(0)
    await expect(page.locator('[data-hcv-viewed-image-label], [data-hcv-image-close]')).toHaveCount(0)
    await expect(editor).toHaveText('Черновик остаётся на месте')
  }
  return { closedActivity, activity, activityViewer, activityGallery, draftTiles, draftViewer, savedOriginal: true }
}
