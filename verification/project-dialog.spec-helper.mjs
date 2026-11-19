import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyProjectDialog({ app, page, expect, screenshot, sandbox, openThemeSettings, closeSettings, themeCard }) {
  const baseline = process.env.HERMES_VISUAL_PROJECT_DIALOG_BEFORE === '1'
  const folders = [path.join(sandbox.root, 'project-dialog-first'), path.join(sandbox.root, 'project-dialog-second')]
  for (const folder of folders) fs.mkdirSync(folder)
  await app.evaluate(({ dialog }, picks) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: picks })
  }, folders)

  const openDialog = async () => {
    const bar = page.locator('[data-chat-surface][data-composer-target="main"]:visible [data-hcv-draft-bar]')
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: 'Выбрать проект', exact: true }).click()
    const menu = page.locator('[data-hcv-draft-menu="projects"]:popover-open')
    await menu.getByRole('button', { name: 'Новый проект', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Новый проект', exact: true })
    await expect(dialog).toBeVisible()
    return dialog
  }
  const capture = async (dialog, name) => {
    const rect = await dialog.boundingBox()
    const view = page.viewportSize()
    const x = Math.max(0, Math.floor(rect.x - 8))
    const y = Math.max(0, Math.floor(rect.y - 8))
    await screenshot(name, { clip: { x, y, width: Math.min(view.width, Math.ceil(rect.x + rect.width + 8)) - x,
      height: Math.min(view.height, Math.ceil(rect.y + rect.height + 8)) - y } })
  }
  const geometry = async dialog => dialog.evaluate(element => {
    const input = element.querySelector('[data-slot="input"]')
    const textarea = element.querySelector('[data-slot="textarea"]')
    const row = element.querySelector('li:has(> .codicon-folder)')
    const add = element.querySelector('button[data-size="sm"]:has(> .codicon-add)')
    const remove = row?.querySelector('button')
    const style = node => node && ({ radius: getComputedStyle(node).borderTopLeftRadius,
      background: getComputedStyle(node).backgroundColor, outline: getComputedStyle(node).outlineWidth,
      outlineStyle: getComputedStyle(node).outlineStyle,
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })
    return { dialog: style(element), input: style(input), textarea: style(textarea), row: style(row), add: style(add), remove: style(remove),
      scrollFits: element.scrollWidth <= element.clientWidth + 1 }
  })

  await page.setViewportSize({ width: 1440, height: 920 })
  let dialog = await openDialog()
  const input = dialog.locator('[data-slot="input"]')
  const add = dialog.getByRole('button', { name: 'Добавить папку', exact: true })
  const create = dialog.getByRole('button', { name: 'Создать', exact: true })
  await expect(create).toBeDisabled()
  await add.click()
  await expect(dialog.locator('li')).toHaveCount(2)
  const before = await geometry(dialog)
  console.log('Project dialog geometry', JSON.stringify(before))
  await capture(dialog, baseline ? 'project-dialog-before.png' : 'project-dialog-dark.png')
  if (process.env.HERMES_VISUAL_PROJECT_DIALOG_NARROW_PROBE === '1') {
    await dialog.locator('textarea').fill('Проверка при изменении размера окна')
    await page.setViewportSize({ width: 420, height: 820 })
    await page.waitForTimeout(800)
    const visible = await dialog.isVisible()
    await screenshot('project-dialog-narrow-probe.png')
    return { baseline, narrowProbe: { viewportWidth: 420, dialogVisible: visible } }
  }
  if (baseline) return { baseline: true, initial: before }

  assert.equal(before.row.radius, '10px')
  assert.equal(before.add.radius, '10px')
  assert.equal(before.input.radius, '8px')
  assert.equal(before.textarea.radius, '8px')
  assert(before.scrollFits)
  await expect(create).toBeEnabled()
  await input.fill('Тестовый проект')
  const row = dialog.locator('li')
  await expect(row.first()).toContainText(/основная/i)
  await row.first().getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(row).toHaveCount(1)
  await expect(row.first()).toContainText(/основная/i)
  await add.click()
  await expect(row).toHaveCount(2)
  const idea = dialog.locator('textarea')
  await idea.fill('Тестовый текст идеи')
  await add.hover()
  const hovered = await geometry(dialog)
  assert.notEqual(hovered.add.background, before.add.background)
  await capture(dialog, 'project-dialog-hover.png')
  await add.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(add).toBeFocused()
  const focused = await geometry(dialog)
  assert.notEqual(focused.add.outlineStyle, 'none')
  assert.notEqual(focused.add.outline, '0px')
  await page.setViewportSize({ width: 1000, height: 820 })
  const narrow = await geometry(dialog)
  assert(narrow.scrollFits)
  await capture(dialog, 'project-dialog-narrow.png')
  await expect(idea).toHaveValue('Тестовый текст идеи')
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(dialog).toBeHidden()

  await page.setViewportSize({ width: 1440, height: 920 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  dialog = await openDialog()
  await dialog.getByRole('button', { name: 'Добавить папку', exact: true }).click()
  await expect(dialog.locator('li')).toHaveCount(2)
  const light = await geometry(dialog)
  assert.equal(light.row.radius, '10px')
  assert.equal(light.add.radius, '10px')
  assert(light.scrollFits)
  await capture(dialog, 'project-dialog-light.png')
  await dialog.locator('[data-slot="input"]').fill('Проект проверки оформления')
  await dialog.locator('textarea').fill('Тестовая идея проекта')
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  const ideaFile = path.join(folders[0], 'IDEA.md')
  await expect.poll(() => fs.existsSync(ideaFile), { timeout: 15000 }).toBe(true)
  assert.match(fs.readFileSync(ideaFile, 'utf8'), /Тестовая идея проекта/)
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('html')).not.toHaveAttribute('data-hermes-theme', 'codex-workspace')
  await expect(page.locator('style[data-hcv-dialog-fields]')).toHaveCount(0)
  return { baseline: false, dark: before, hovered, focused, narrow, light, projectCreated: true }
}
