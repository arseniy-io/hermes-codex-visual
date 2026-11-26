import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyTurnDiff({
  app, page, expect, projectChat, projectFolder, singleEditPrompt, editsPrompt, singleFile, newFiles, seedLine, oneLine,
  screenshot, openThemeSettings, closeSettings, themeCard,
}) {
  const before = process.env.HERMES_VISUAL_TURN_DIFF_BEFORE === '1'
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const composer = chat.locator('[data-slot="composer-rich-input"]')
  const card = chat.locator('[data-slot="aui_changed-files"]')
  const title = card.locator('[data-hcv-files-title]')
  const header = card.locator(':scope > div:first-child')
  const list = card.locator(':scope > div:nth-child(2)')
  const totals = header.locator('[data-hcv-files-totals]')
  const plus = '[data-hcv-files-added]'
  const minus = '[data-hcv-files-removed]'
  const review = page.getByRole('complementary', { name: 'Проверить' })
  const takeCard = async name => {
    // The native list can be replaced when the final response settles. Retry
    // the locator on a detached node without accepting a missing card.
    await expect(async () => {
      await expect(card).toBeVisible({ timeout: 5000 })
      await card.scrollIntoViewIfNeeded({ timeout: 5000 })
    }).toPass({ timeout: 15000 })
    await page.mouse.move(0, 0)
    const box = await card.boundingBox()
    assert(box, 'Expected a visible file card')
    const margin = 3
    const x = Math.max(0, Math.floor(box.x) - margin)
    const y = Math.max(0, Math.floor(box.y) - margin)
    const { width, height } = page.viewportSize()
    await screenshot(name, { clip: {
      x, y,
      width: Math.min(width, Math.ceil(box.x + box.width) + margin) - x,
      height: Math.min(height, Math.ceil(box.y + box.height) + margin) - y,
    } })
  }
  const send = async (prompt, answer) => {
    await composer.fill(prompt)
    await composer.press('Enter')
    await expect(chat.getByText(answer, { exact: true })).toBeVisible({ timeout: 45000 })
    await expect(card).toHaveAttribute('data-hcv-file-card', '', { timeout: 25000 })
  }
  const openReview = async (control, basename) => {
    await control.click()
    await expect(review).toBeVisible()
    if (basename) await expect(review.getByText(basename, { exact: true }).first()).toBeVisible()
    await page.keyboard.press('Control+g')
    await expect(review).toBeHidden()
  }
  const measure = () => card.evaluate(node => {
    const [header, list, more] = node.children
    const review = header.querySelector('[data-hcv-file-review]')
    const tile = getComputedStyle(header, '::before')
    const icon = getComputedStyle(header, '::after')
    const box = header.getBoundingClientRect()
    return {
      card: getComputedStyle(node).borderRadius,
      corners: getComputedStyle(node).getPropertyValue('corner-shape'),
      header: box.height,
      inset: getComputedStyle(header).paddingInlineStart,
      titleSize: getComputedStyle(header.querySelector('[data-hcv-files-title]')).fontSize,
      titleWeight: getComputedStyle(header.querySelector('[data-hcv-files-title]')).fontWeight,
      review: review.getBoundingClientRect().height,
      tile: tile.width,
      icon: icon.width,
      list: getComputedStyle(list).display,
      row: list.querySelector('button')?.getBoundingClientRect().height,
      more: more?.getBoundingClientRect().height,
    }
  })

  await projectChat('Ревью интерфейса').click()
  await send(singleEditPrompt, 'Изменил один тестовый файл.')
  assert.equal(fs.readFileSync(path.join(projectFolder, singleFile), 'utf8'), seedLine + '\nПервая строка.\nВторая строка.\n')
  await takeCard('one-file.png')
  console.log('Single file card', JSON.stringify(await measure()))
  if (process.env.HERMES_VISUAL_TURN_DIFF_MEDIA === '1') {
    const root = card.locator('xpath=..')
    const delivered = root.locator('span.truncate[title]').filter({ hasText: 'single-file.md' })
    const matchedCard = root.locator('span.truncate[title]').filter({ hasText: 'single-file.md' }).first().locator('..')
    const otherCard = delivered.last().locator('..')
    await expect(delivered).toHaveCount(2)
    if (before) {
      await expect(otherCard).toBeVisible()
      await expect(matchedCard).toBeVisible()
      return
    }
    await expect(matchedCard).toBeHidden()
    await expect(otherCard).toBeHidden()
    const fileLink = header.getByRole('button', { name: 'Открыть файл single-file.md' })
    await expect(fileLink).toBeVisible()
    const singleColors = await fileLink.evaluate(node => ({ color: getComputedStyle(node).color,
      titleColor: getComputedStyle(node.parentElement).color, weight: getComputedStyle(node).fontWeight }))
    assert.equal(singleColors.color, singleColors.titleColor)
    assert.equal(singleColors.weight, '500')
    await fileLink.hover()
    await expect(fileLink).toHaveCSS('text-decoration-line', 'none')
    const cardShadow = await card.evaluate(node => getComputedStyle(node).boxShadow)
    assert.notEqual(cardShadow, 'none')
    assert.doesNotMatch(cardShadow, /inset/)
    await expect(card).toHaveCSS('overflow', 'hidden')
    await fileLink.click()
    const rendered = page.locator('[data-preview-markdown]')
    await expect(rendered).toContainText('Первая строка.')
    await page.keyboard.down('Tab')
    await fileLink.focus()
    await page.keyboard.up('Tab')
    await expect(fileLink).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rendered).toBeHidden()
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('hermes:fs:reveal')
      ipcMain.handle('hermes:fs:reveal', (_, target) => { globalThis.hcvMergedFileRevealed = target; return true })
    })
    await fileLink.hover()
    const reveal = header.getByRole('button', { name: 'Открыть содержащую папку' })
    await expect(reveal).toBeVisible()
    await reveal.click()
    await expect.poll(() => app.evaluate(() => globalThis.hcvMergedFileRevealed)).toBe(path.join(projectFolder, singleFile))
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(matchedCard).toBeHidden()
    await expect(otherCard).toBeHidden()
    await expect(header.locator('[data-hcv-files-preview]')).toHaveCount(0)
    await page.emulateMedia({ forcedColors: 'none' })
    await expect(fileLink).toBeVisible()
    await expect(matchedCard).toBeHidden()
    await expect(otherCard).toBeHidden()
    console.log('Standalone file previews hidden, native actions from the change card and forced colors verified')
  }
  if (!before) {
    await expect(title).toHaveText('Изменён single-file.md')
    await expect(totals.locator(plus)).toHaveText('+2')
    await expect(totals.locator(minus)).toHaveText('–0')
    await expect(list).toBeHidden()
    const open = header.getByRole('button', { name: 'Посмотреть измененные файлы' })
    await open.hover()
    await expect(totals).toBeHidden()
    await expect(header.getByText('Просмотр изменений', { exact: true })).toBeVisible()
    await openReview(open, 'single-file.md')
    await openReview(header.getByRole('button', { name: 'Просмотреть изменения' }), 'single-file.md')
  }

  await send(editsPrompt, process.env.HERMES_VISUAL_TURN_DIFF_TWELVE === '1'
    ? 'Изменил 12 файлов и закончил проверку.' : 'Изменил пять файлов и закончил проверку.')
  const changedCount = 1 + newFiles.length
  if (!before) await expect(title).toHaveText(`Изменено ${changedCount} файлов`, { timeout: 25000 })
  for (const name of newFiles) assert.equal(fs.readFileSync(path.join(projectFolder, name), 'utf8'), seedLine + '\n' + oneLine + '\n')
  assert.match(fs.readFileSync(path.join(projectFolder, 'fixture-note.md'), 'utf8'), /Обновлённый тестовый файл/)
  const multiMedia = process.env.HERMES_VISUAL_TURN_DIFF_MULTI_MEDIA === '1'
  const root = card.locator('xpath=..')
  const note = list.getByRole('button', { name: /^fixture-note\.md/ })
  const noteActions = note.locator('xpath=following-sibling::div[1]')
  const notePreview = noteActions.getByRole('button', { name: 'Открыть файл fixture-note.md' })
  if (multiMedia) {
    const attached = root.locator('.aui-md span.truncate[title]')
    await expect(attached.filter({ hasText: 'fixture-note.md' }).locator('..')).toBeHidden()
    await expect(attached.filter({ hasText: 'turn-change.py' }).locator('..')).toBeHidden()
    await expect(attached.filter({ hasText: 'diagnostics.txt' }).locator('..')).toBeHidden()
    await expect(attached.filter({ hasText: 'fixture-rules.txt' }).locator('..')).toBeHidden()
    await page.mouse.move(0, 0)
    await expect(noteActions).toBeHidden()
  }
  const cardEvidenceName = changedCount === 5 ? 'five-files' : `${changedCount}-files`
  await takeCard(`${cardEvidenceName}.png`)
  const sizes = await measure()
  console.log(`${changedCount} file card`, JSON.stringify(sizes))
  if (before) return

  assert(Math.abs(sizes.header - 64.5) <= 1, JSON.stringify(sizes))
  assert.equal(sizes.card, sizes.corners === 'superellipse(1.5)' ? '12.5px' : '10px')
  assert.equal(sizes.inset, '12px')
  assert.equal(sizes.titleSize, '14px')
  assert.equal(sizes.titleWeight, '500')
  assert.equal(sizes.tile, '40px')
  assert.equal(sizes.icon, '24px')
  assert.equal(sizes.review, 28)
  assert.equal(sizes.row, 36)
  assert.equal(sizes.more, 36)
  const cardShadow = await card.evaluate(node => getComputedStyle(node).boxShadow)
  assert.notEqual(cardShadow, 'none')
  assert.doesNotMatch(cardShadow, /inset/)
  await expect(card).toHaveCSS('overflow', 'hidden')
  const normalFileBackground = await note.evaluate(node => getComputedStyle(node).backgroundColor)
  await note.hover({ position: { x: 40, y: 18 } })
  const hoveredFileBackground = await note.evaluate(node => getComputedStyle(node).backgroundColor)
  assert.notEqual(hoveredFileBackground, normalFileBackground)
  await screenshot('native-files-hover.png')
  console.log('Native file row backgrounds', JSON.stringify({ normalFileBackground, hoveredFileBackground, cardShadow }))
  await expect(title).toHaveText(`Изменено ${changedCount} файлов`)
  await expect(totals.locator(plus)).toHaveText(`+${changedCount}`)
  await expect(totals.locator(minus)).toHaveText('–1')
  await expect(totals.locator(plus)).toHaveCSS('color', 'rgb(64, 201, 119)')
  await expect(totals.locator(minus)).toHaveCSS('color', 'rgb(250, 66, 62)')
  await expect(header.locator('[data-hcv-file-review]')).toHaveCSS('background-color', 'rgb(41, 41, 41)')
  if (process.env.HERMES_VISUAL_CARD_APPEARANCE_ONLY === '1') {
    await page.setViewportSize({ width: 780, height: 720 })
    await expect(header.getByRole('button', { name: 'Просмотреть изменения' })).toBeVisible()
    assert(await header.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Header overflows the card')
    await page.setViewportSize({ width: 1440, height: 920 })
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await expect(totals.locator(plus)).toHaveCSS('color', 'rgb(0, 162, 64)')
    await expect(totals.locator(minus)).toHaveCSS('color', 'rgb(186, 38, 35)')
    const lightShadow = await card.evaluate(node => getComputedStyle(node).boxShadow)
    assert.notEqual(lightShadow, 'none')
    assert.doesNotMatch(lightShadow, /inset/)
    await expect(card).toHaveCSS('overflow', 'hidden')
    await screenshot('native-files-light.png')
    return
  }
  const nested = list.getByRole('button', { name: /^review\/turn-change\.py/ })
  const duplicate = list.getByRole('button', { name: /^docs\/turn-change\.py/ })
  await expect(nested.locator('[data-hcv-file-directory]')).toHaveText('review/')
  await expect(duplicate.locator('[data-hcv-file-directory]')).toHaveText('docs/')
  await expect(nested.locator('[data-hcv-file-basename]')).toHaveText('turn-change.py')
  await expect(nested.locator(plus)).toHaveText('+1')
  await expect(nested.locator(minus)).toHaveText('–0')
  const moreName = changedCount === 12 ? 'Показать еще 9 файлов' : 'Показать еще 2 файла'
  const more = card.getByRole('button', { name: moreName })
  const last = list.getByRole('button', { name: /^diagnostics\.txt/ })
  await expect(last).toBeHidden()
  if (multiMedia) {
    const lastActions = last.locator('xpath=following-sibling::div[1]')
    await expect(lastActions).toBeHidden()
    await note.hover({ position: { x: 40, y: 18 } })
    await expect(notePreview).toBeVisible()
    await notePreview.click()
    const rendered = page.locator('[data-preview-markdown]')
    await expect(rendered).toContainText('Обновлённый тестовый файл')
    await page.keyboard.down('Tab')
    await note.focus()
    await page.keyboard.up('Tab')
    await expect(note).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(notePreview).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rendered).toBeHidden()
    await note.hover({ position: { x: 40, y: 18 } })
    await noteActions.getByRole('button', { name: /^Открыть содержащую папку/ }).click()
    await expect.poll(() => app.evaluate(() => globalThis.hcvMergedFileRevealed)).toBe(path.join(projectFolder, 'fixture-note.md'))
  }
  await more.click()
  await expect(last).toBeVisible()
  if (multiMedia) {
    await last.hover({ position: { x: 40, y: 18 } })
    await expect(last.locator('xpath=following-sibling::div[1]').getByRole('button', { name: 'Открыть файл diagnostics.txt' })).toBeVisible()
  }
  await expect(list).toHaveCSS('max-height', 'none')
  const collapse = page.locator('[data-hcv-files-more][aria-expanded="true"]')
  await page.keyboard.down('Tab')
  await collapse.focus()
  await page.keyboard.up('Tab')
  await expect(collapse).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(more).toBeVisible()
  await expect(last).toBeHidden()
  if (process.env.HERMES_VISUAL_CARD_FOLD_ONLY === '1') return

  const undo = header.getByRole('button', { name: 'Отменить' })
  await undo.click()
  const restore = page.getByRole('dialog', { name: 'Восстановить до этого чекпоинта?' })
  await expect(restore).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(restore).toBeHidden()
  for (const name of newFiles) assert(fs.existsSync(path.join(projectFolder, name)))
  await openReview(nested, 'turn-change.py')
  await openReview(header.getByRole('button', { name: 'Просмотреть изменения' }))

  await projectChat('Проверка каталога').click()
  await expect(card).toHaveCount(0)
  await projectChat('Ревью интерфейса').click()
  await expect(nested).toBeVisible()
  await expect(duplicate).toBeVisible()
  await page.setViewportSize({ width: 780, height: 720 })
  await expect(header.getByRole('button', { name: 'Просмотреть изменения' })).toBeVisible()
  assert(await header.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Header overflows the card')
  await takeCard(`${cardEvidenceName}-narrow.png`)
  await page.setViewportSize({ width: 1440, height: 920 })

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await expect(totals.locator(plus)).toHaveCSS('color', 'rgb(0, 162, 64)')
  await expect(totals.locator(minus)).toHaveCSS('color', 'rgb(186, 38, 35)')
  await takeCard(`${cardEvidenceName}-light.png`)
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(card).toBeVisible()
  await expect(card.locator('[data-hcv-generated]')).toHaveCount(0)
  await expect(list.getByRole('button')).toHaveCount(changedCount)
}
