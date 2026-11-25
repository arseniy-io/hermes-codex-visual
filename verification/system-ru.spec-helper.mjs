import fs from 'node:fs'
import path from 'node:path'

const rawDetail = 'The gateway is running a turn in this chat and did not confirm your message in time. It may already be queued there: check the chat before sending it again.'

export async function installSystemRuFixture(app, page) {
  // This isolated scenario must never reach the real uninstall implementation.
  await app.evaluate(({ ipcMain }) => {
    globalThis.hcvManagedInstall = false
    for (const name of ['hermes:uninstall:summary', 'hermes:uninstall:run']) ipcMain.removeHandler(name)
    ipcMain.handle('hermes:uninstall:summary', () => ({
      code_removal_allowed: !globalThis.hcvManagedInstall,
      native_removal_instructions: globalThis.hcvManagedInstall ? 'To uninstall, go to Windows Settings → Apps → Installed apps.' : null,
      hermes_home: 'C:\\Fixture\\Hermes', running_app_path: 'C:\\Fixture\\Hermes.exe', agent_installed: true,
      gui_installed: true, source_built_artifacts: [], packaged_app_paths: [], userdata_exists: true,
      userdata_dir: 'C:\\Fixture\\Data', platform: 'win32', probe: 'fixture',
    }))
    ipcMain.handle('hermes:uninstall:run', () => ({ ok: false, error: 'blocked by isolated test' }))
  })
  await page.routeWebSocket(url => url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const request = JSON.parse(String(message))
      if (request.method !== 'prompt.submit') return upstream.send(message)
      route.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: {
        code: 4090, message: rawDetail, data: { reason: 'SESSION_OWNER_UNCONFIRMED' },
      } }))
    })
  })
}

export async function verifySystemRu({ app, page, expect, screenshot, projectChat }) {
  const replacement = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
  if (replacement) {
    await page.evaluate(() => { location.hash = '#/settings?tab=vault' })
    const before = page.locator('[data-tour="nav-vault"]')
    await expect(before).toBeVisible()
    await expect(before).toHaveText('Passwords & Logins')
    const home = await app.evaluate(() => process.env.HERMES_HOME)
    const plugin = path.join(home, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
    const staged = plugin + '.system-ru-test-staging'
    fs.copyFileSync(replacement, staged, fs.constants.COPYFILE_EXCL)
    fs.renameSync(staged, plugin)
    await expect(before).toHaveText('Пароли и логины', { timeout: 30000 })
    await expect(page.locator('[data-overlay-surface]:visible main').getByText(/Пароли хранятся зашифрованными на этом компьютере/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-overlay-surface]:visible')).toHaveCount(0)
  }
  await projectChat('Ревью интерфейса').click()
  await expect(page.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  const input = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]:visible')
  await input.fill('Проверка системного сообщения.')
  await input.press('Enter')
  const error = page.locator('[data-slot="aui_error-card"][role="alert"]').last()
  await expect(error).toBeVisible({ timeout: 20000 })
  await expect(error).toContainText('Сообщение уже может быть в очереди')
  await expect(error).toContainText('Проверьте чат, прежде чем отправлять его снова')
  await expect(page.getByRole('region', { name: 'Уведомления' }).getByText(/Сообщение уже может быть в очереди/)).toBeVisible()
  await expect(error.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0)
  const details = error.locator('button[aria-controls][aria-expanded]')
  await details.click()
  await expect(error).toContainText(rawDetail)
  await screenshot('system-error.png')

  const uninstallRoute = '#/settings?tab=about&page=uninstall'
  const goToUninstall = async () => {
    await page.evaluate(hash => { location.hash = hash }, uninstallRoute)
    await expect(page.locator('[data-overlay-surface]:visible main')).toBeVisible()
  }
  await goToUninstall()
  const main = page.locator('[data-overlay-surface]:visible main').last()
  await expect(main.getByText('Удалить Hermes', { exact: true })).toBeVisible()
  await expect(main.getByText('Удалить всё', { exact: true })).toBeVisible()
  await expect(main.getByText(/Удалить приложение, агента и все пользовательские данные/)).toBeVisible()
  await main.getByRole('button', { name: /Удалить всё/ }).click()
  await expect(main.getByText('Подтвердите удаление', { exact: true })).toBeVisible()
  await expect(main.getByText(/ВСЁ: приложение, агент Hermes, все настройки, чаты, секреты и журналы/)).toBeVisible()
  await screenshot('system-uninstall-confirm.png')
  await main.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(main.getByText('Удалить всё', { exact: true })).toBeVisible()

  await app.evaluate(() => { globalThis.hcvManagedInstall = true })
  await page.evaluate(() => { location.hash = '#/settings?tab=config%3Aappearance&page=general' })
  await expect(page.getByRole('button', { name: 'Сменить язык' })).toBeVisible()
  await goToUninstall()
  await expect(main.getByText(/Чтобы удалить приложение, откройте в Windows/)).toBeVisible()
  await expect(main.getByText(/C:\\Fixture\\Hermes/)).toBeVisible()
  await screenshot('system-uninstall-managed.png')

  await page.evaluate(() => { location.hash = '#/settings?tab=vault' })
  await expect(page.getByRole('button', { name: 'Браузер', exact: true })).toBeVisible()
  await expect(main.getByText(/Пароли хранятся зашифрованными на этом компьютере/)).toBeVisible()
  await main.getByRole('button', { name: 'Добавить', exact: true }).click()
  const vault = page.getByRole('dialog').last()
  await expect(vault.getByText('Добавить логин, карту или адрес', { exact: true })).toBeVisible()
  await expect(vault.getByText('Пароль', { exact: true })).toBeVisible()
  await expect(vault.getByPlaceholder('https://github.com')).toBeVisible()
  await screenshot('system-vault-add.png')
  await page.keyboard.press('Escape')
  await expect(vault).toBeHidden()

  const setLanguage = async (label, name, lang) => {
    await page.evaluate(() => { location.hash = '#/settings?tab=config%3Aappearance&page=general' })
    await page.getByRole('button', { name: label }).click()
    const search = page.locator('input[cmdk-input]:visible')
    await search.fill(name)
    await search.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await goToUninstall()
  }
  await setLanguage('Сменить язык', 'English', 'en')
  await expect(main.getByText('To uninstall, go to Windows Settings → Apps → Installed apps.', { exact: true })).toBeVisible()
  await setLanguage('Switch language', 'Русский', 'ru')
  await expect(main.getByText(/Чтобы удалить приложение, откройте в Windows/)).toBeVisible()
  console.log('Verified Russian error safety, original diagnostic detail, uninstall warnings, paths and language switching in an isolated profile.')
}
