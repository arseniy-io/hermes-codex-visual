import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const pathKey = value => String(value || '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

export async function verifyWorkspacePanel({ page, expect, screenshot, projectChat, projectFolder }) {
  const card = page.locator('[data-hcv-context-card]')
  const changes = card.getByRole('button', { name: 'Изменения', exact: true })
  const openMenu = () => card.getByRole('button', { name: 'Действия со сводкой' }).click()
  const menu = page.locator('[data-hcv-summary-menu]')
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const runtime = '[data-persistent-terminal][aria-hidden="false"] [data-terminal]:visible'
  const move = page.locator('[data-hcv-workspace-move]')
  const cwd = () => page.evaluate(async () => (await window.hermesDesktop.api({
    connectionId: 'local', profile: 'default', path: '/api/sessions/20261108_124501_aab001',
  })).cwd)
  const worktrees = () => page.evaluate(async folder => {
    const query = new URLSearchParams({ path: folder })
    const result = await window.hermesDesktop.api({ connectionId: 'local', path: '/api/git/worktrees?' + query })
    return result.worktrees
  }, projectFolder)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await projectChat('Ревью интерфейса').click()
  await expect(changes).toHaveAttribute('data-hcv-branch', 'main')
  await expect(card).toHaveCSS('width', '300px')
  await expect(card).toHaveCSS('border-radius', '16px')
  await expect(card.locator('.hcv-context-diff')).toContainText('+2')
  await changes.hover()
  await expect(page.getByRole('tooltip', { name: 'main', exact: true })).toBeVisible()
  await screenshot('branch.png')
  await openMenu()
  await expect(menu.getByRole('menuitem', { name: 'Настроить локальное окружение' })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: 'Открыть терминал' })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: 'Переместить в рабочее дерево' })).toBeEnabled()
  const [cardBox, menuBox] = await Promise.all([card.boundingBox(), menu.boundingBox()])
  assert(Math.abs(cardBox.x - (menuBox.x + menuBox.width) - 8) <= 2, JSON.stringify({ cardBox, menuBox }))
  await screenshot('actions.png')
  await page.keyboard.press('Escape')

  await changes.click()
  const review = page.locator('[data-pane-host="review"]:visible, [data-hcv-changes-pane]:visible')
  await expect(review).toBeVisible()
  const file = review.getByText('fixture-note.md', { exact: true }).first()
  await expect(file).toBeVisible()
  await file.click()
  const fallback = page.locator('[data-hcv-changes-pane]:visible')
  if (await fallback.isVisible()) {
    await expect(fallback.locator('[data-hcv-change-diff]')).toContainText('+Изменение для проверки.')
  }
  await screenshot('changes.png')
  if (await fallback.isVisible()) {
    const tab = page.locator('[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-changes"]')
    await tab.hover()
    await tab.getByRole('button', { name: 'Закрыть', exact: true }).click()
  } else await page.keyboard.press('Control+g')
  await expect(review).toHaveCount(0)
  await expect(card).toBeVisible()

  await openMenu()
  await menu.getByRole('menuitem', { name: 'Открыть терминал' }).click()
  const terminal = page.locator(runtime)
  await expect(terminal.first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hermes.desktop.terminals.v1') || '{}')
    return saved.terminals?.find(entry => entry.id === saved.activeTerminalId)?.title || ''
  })).toMatch(/powershell|pwsh|bash|zsh|fish/i)
  const marker = path.join(path.dirname(projectFolder), 'terminal-cwd.txt')
  const input = terminal.first().locator('.xterm-helper-textarea')
  await input.focus()
  const command = process.platform === 'win32'
    ? "(Get-Location).Path | Set-Content -Encoding UTF8 -LiteralPath '" + marker.replaceAll("'", "''") + "'"
    : "pwd > '" + marker.replaceAll("'", "'\\''") + "'"
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
  await expect.poll(() => {
    try { return pathKey(fs.readFileSync(marker, 'utf8').replace(/^\uFEFF/, '').trim()) }
    catch { return '' }
  }, { timeout: 10000 }).toBe(pathKey(projectFolder))
  await screenshot('terminal.png')
  await page.getByRole('button', { name: 'Скрыть терминал', exact: true }).click()
  await expect(terminal).toHaveCount(0)

  const before = await cwd()
  await expect(chat.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await openMenu()
  await menu.getByRole('menuitem', { name: 'Переместить в рабочее дерево' }).click()
  await expect(move).toBeVisible()
  await expect(move.getByRole('combobox')).toBeVisible()
  await move.getByRole('combobox').selectOption('new')
  await move.getByRole('textbox', { name: 'Имя новой ветки' }).fill('hcv-side-panel')
  await screenshot('move.png')
  await move.getByRole('button', { name: 'Переместить', exact: true }).click()
  await expect(move).toHaveCount(0, { timeout: 15000 })
  const created = (await worktrees()).find(tree => tree.branch === 'hcv-side-panel')
  assert(created && !created.isMain)
  await expect.poll(async () => pathKey(await cwd())).toBe(pathKey(created.path))
  await expect(chat.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await expect(changes).toHaveAttribute('data-hcv-branch', 'hcv-side-panel')

  await openMenu()
  await menu.getByRole('menuitem', { name: 'Переместить в основную рабочую копию' }).click()
  await expect(move.getByRole('combobox')).toContainText('Основной каталог')
  await move.getByRole('button', { name: 'Переместить', exact: true }).click()
  await expect(move).toHaveCount(0, { timeout: 15000 })
  await expect.poll(async () => pathKey(await cwd())).toBe(pathKey(before))
  await expect(card.locator('.hcv-context-diff')).toContainText('+2')
  await expect(changes).toHaveAttribute('data-hcv-branch', 'main')
  console.log(JSON.stringify({ workspacePanel: 'branch, review, terminal, move and return', preservedChat: true }))
}
