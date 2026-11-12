import assert from 'node:assert/strict'
import path from 'node:path'

export async function verifyLocalEnvironment({ page, expect, screenshot, projectChat, projectFolder }) {
  const card = page.locator('[data-hcv-context-card]')
  const menu = page.locator('[data-hcv-summary-menu]')
  const dialog = page.locator('[data-hcv-local-environment]')
  const advanced = dialog.getByRole('button', { name: 'Расширенные параметры' })
  const setup = dialog.getByRole('textbox', { name: 'Скрипт настройки', exact: true })
  const cleanup = dialog.getByRole('textbox', { name: 'Скрипт очистки', exact: true })
  const terminal = page.locator('[data-hcv-env-terminal]')
  const openMenu = () => card.getByRole('button', { name: 'Действия со сводкой' }).click()
  const openSettings = async () => {
    await openMenu()
    await menu.getByRole('menuitem', { name: 'Настроить локальное окружение', exact: true }).click()
    await expect(dialog).toBeVisible()
  }
  const capture = async name => screenshot(name, { clip: await dialog.boundingBox() })
  const platform = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform]
  const setupScript = process.platform === 'win32'
    ? 'if ($env:CODEX_WORKTREE_PATH -ne (Get-Location).Path) { exit 5 }\nWrite-Output "HCV setup fixture"\nWrite-Output $env:CODEX_SOURCE_TREE_PATH'
    : 'test "$CODEX_WORKTREE_PATH" = "$PWD" || exit 5\nprintf "%s\\n" "HCV setup fixture" "$CODEX_SOURCE_TREE_PATH"'
  const actionScript = process.platform === 'win32' ? 'Write-Output "HCV action fixture"' : 'printf "HCV action fixture\\n"'
  const cleanupScript = process.platform === 'win32' ? 'Write-Output "HCV cleanup fixture"' : 'printf "HCV cleanup fixture\\n"'

  await projectChat('Ревью интерфейса').click()
  await expect(card).toBeVisible()
  await openSettings()
  await expect(dialog.getByRole('heading', { name: 'Настройка этого проекта' })).toBeVisible()
  await expect(dialog).toHaveCSS('width', '420px')
  await expect(dialog).toHaveCSS('background-color', 'rgb(42, 42, 42)')
  await expect(setup).toBeEditable()
  await expect(setup).toHaveCSS('height', '128px')
  await expect(setup).toHaveCSS('background-color', 'rgb(45, 45, 45)')
  await expect(advanced).toHaveAttribute('aria-expanded', 'false')
  await expect(dialog.getByRole('button', { name: 'Настроить проект' })).toBeDisabled()
  await capture('environment-compact.png')

  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 1100 })
  await advanced.click()
  await expect(advanced).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog.getByRole('tablist')).toHaveCount(2)
  await expect(dialog.getByRole('tab')).toHaveCount(8)
  await expect(cleanup).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Добавить действие' })).toBeVisible()
  await capture('environment-advanced.png')
  await dialog.getByRole('button', { name: 'Переменные' }).click()
  const variables = page.locator('[data-hcv-env-vars]')
  await expect(variables.getByText('CODEX_SOURCE_TREE_PATH', { exact: true })).toBeVisible()
  await expect(variables.getByText('CODEX_WORKTREE_PATH', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(variables).toBeHidden()
  await expect(dialog).toBeVisible()

  const setupPlatforms = dialog.getByRole('tablist', { name: 'Скрипт настройки · Платформа' })
  await setupPlatforms.getByRole('tab', { name: platform, exact: true }).click()
  await setup.fill(setupScript)
  await page.keyboard.press('Tab')
  await setupPlatforms.getByRole('tab', { name: platform, exact: true }).focus()
  await page.keyboard.press('Home')
  await expect(setupPlatforms.getByRole('tab', { name: 'По умолчанию' })).toHaveAttribute('aria-selected', 'true')
  await expect(setup).toHaveValue('')
  await setupPlatforms.getByRole('tab', { name: platform, exact: true }).click()
  await expect(setup).toHaveValue(setupScript)
  await cleanup.fill(cleanupScript)

  await dialog.getByRole('button', { name: 'Добавить действие' }).click()
  const action = dialog.locator('[data-hcv-env-action]')
  await action.getByRole('textbox', { name: 'Имя', exact: true }).fill('Проверка окружения')
  await action.getByRole('textbox', { name: 'Сценарий действий' }).fill(actionScript)
  await action.getByRole('combobox', { name: 'Платформа' }).selectOption(process.platform)
  await action.getByRole('combobox', { name: 'Значок' }).selectOption('run')
  await expect(terminal).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Настроить проект' }).click()
  await expect(terminal.locator('[data-hcv-env-run-state]')).toHaveAttribute('data-hcv-env-run-state', 'done', { timeout: 20000 })
  await expect(terminal.locator('pre')).toContainText('HCV setup fixture')
  assert.equal(path.normalize((await terminal.locator('[data-slot="dialog-description"]').textContent()).trim()), path.normalize(projectFolder))
  await screenshot('environment-terminal.png', { clip: await terminal.boundingBox() })
  await terminal.getByRole('button', { name: 'Закрыть', exact: true }).last().click()

  await openSettings()
  await advanced.click()
  await setupPlatforms.getByRole('tab', { name: platform, exact: true }).click()
  await expect(setup).toHaveValue(setupScript)
  await expect(cleanup).toHaveValue(cleanupScript)
  await expect(action.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Проверка окружения')
  await action.getByRole('textbox', { name: 'Сценарий действий' }).fill('Черновая команда для отмены')
  await page.keyboard.press('Escape')
  const confirm = page.locator('[data-hcv-env-confirm]')
  await expect(confirm.getByRole('heading', { name: 'Сбросить черновик локальной среды?' })).toBeVisible()
  await confirm.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize(originalViewport)

  for (const [label, output] of [
    ['Проверка окружения', 'HCV action fixture'], ['Запустить скрипт очистки', 'HCV cleanup fixture'],
  ]) {
    if (label === 'Проверка окружения') {
      await page.getByRole('button', { name: 'Действия проекта', exact: true }).click()
      await page.locator('[data-hcv-project-actions-menu]').getByRole('menuitem', { name: label, exact: true }).click()
    } else {
      await openMenu()
      await menu.getByRole('menuitem', { name: label, exact: true }).click()
    }
    await expect(terminal.locator('[data-hcv-env-run-state]')).toHaveAttribute('data-hcv-env-run-state', 'done', { timeout: 20000 })
    await expect(terminal.locator('pre')).toContainText(output)
    await terminal.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  }

  await openMenu()
  await menu.getByRole('menuitem', { name: 'Переместить в рабочее дерево', exact: true }).click()
  const move = page.locator('[data-hcv-workspace-move]')
  await move.getByRole('combobox').selectOption('new')
  await move.getByRole('textbox', { name: 'Имя новой ветки' }).fill('hcv-environment')
  await expect(move.getByRole('checkbox', { name: 'Запустить скрипт настройки' })).toBeChecked()
  await move.getByRole('button', { name: 'Переместить', exact: true }).click()
  await expect(terminal.locator('[data-hcv-env-run-state]')).toHaveAttribute('data-hcv-env-run-state', 'done', { timeout: 20000 })
  await expect(terminal.locator('pre')).toContainText('HCV setup fixture')
  const output = await terminal.locator('pre').textContent()
  assert(output.replace(/[\r\n]/g, '').includes(projectFolder), output)
  const destination = (await terminal.locator('[data-slot="dialog-description"]').textContent()).trim()
  assert(path.relative(projectFolder, destination).startsWith('.worktrees' + path.sep))
  await terminal.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
}
