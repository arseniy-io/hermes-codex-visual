import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyTurnDiff({
  page, expect, projectChat, projectFolder, singleEditPrompt, editsPrompt, singleFile, newFiles, seedLine, oneLine,
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
    await card.scrollIntoViewIfNeeded()
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

  await send(editsPrompt, 'Изменил пять файлов и закончил проверку.')
  for (const name of newFiles) assert.equal(fs.readFileSync(path.join(projectFolder, name), 'utf8'), seedLine + '\n' + oneLine + '\n')
  assert.match(fs.readFileSync(path.join(projectFolder, 'fixture-note.md'), 'utf8'), /Обновлённый тестовый файл/)
  await takeCard('five-files.png')
  const sizes = await measure()
  console.log('Five file card', JSON.stringify(sizes))
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
  await expect(title).toHaveText('Изменено 5 файлов')
  await expect(totals.locator(plus)).toHaveText('+5')
  await expect(totals.locator(minus)).toHaveText('–1')
  await expect(totals.locator(plus)).toHaveCSS('color', 'rgb(64, 201, 119)')
  await expect(totals.locator(minus)).toHaveCSS('color', 'rgb(250, 66, 62)')
  await expect(header.locator('[data-hcv-file-review]')).toHaveCSS('background-color', 'rgb(41, 41, 41)')
  const nested = list.getByRole('button', { name: /^review\/turn-change\.py/ })
  const duplicate = list.getByRole('button', { name: /^docs\/turn-change\.py/ })
  await expect(nested.locator('[data-hcv-file-directory]')).toHaveText('review/')
  await expect(duplicate.locator('[data-hcv-file-directory]')).toHaveText('docs/')
  await expect(nested.locator('[data-hcv-file-basename]')).toHaveText('turn-change.py')
  await expect(nested.locator(plus)).toHaveText('+1')
  await expect(nested.locator(minus)).toHaveText('–0')
  const more = card.getByRole('button', { name: 'Показать еще 2 файла' })
  const last = list.getByRole('button', { name: /^diagnostics\.txt/ })
  await expect(last).toBeHidden()
  await more.click()
  await expect(last).toBeVisible()
  await expect(list).toHaveCSS('max-height', 'none')
  await page.locator('[data-hcv-files-more][aria-expanded="true"]').press('Enter')
  await expect(more).toBeVisible()
  await expect(last).toBeHidden()

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
  await takeCard('five-files-narrow.png')
  await page.setViewportSize({ width: 1440, height: 920 })

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await expect(totals.locator(plus)).toHaveCSS('color', 'rgb(0, 162, 64)')
  await expect(totals.locator(minus)).toHaveCSS('color', 'rgb(186, 38, 35)')
  await takeCard('five-files-light.png')
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(card).toBeVisible()
  await expect(card.locator('[data-hcv-generated]')).toHaveCount(0)
  await expect(list.getByRole('button')).toHaveCount(5)
}
