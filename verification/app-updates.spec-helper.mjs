import assert from 'node:assert/strict'

export async function verifyAppUpdates({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const capture = process.env.HERMES_VISUAL_SKIP_SCREENSHOTS !== '1'
  const root = page.locator('html')
  const version = await page.evaluate(() => window.hermesDesktop.getVersion())
  await app.evaluate(({ ipcMain }, current) => {
    ipcMain.removeHandler('hermes:version')
    ipcMain.handle('hermes:version', () => ({
      ...current,
      appVersion: '9.8.7',
      bundleOutOfSync: true,
      bundleSwapPending: false,
      commit: '0123456789abcdef',
      installId: 'fixture',
      hermesRoot: 'C:\\Hermes\\test-profile\\' + 'long-directory-name\\'.repeat(8),
    }))
    ipcMain.removeHandler('hermes:updates:check')
    ipcMain.handle('hermes:updates:check', () => ({
      supported: false,
      behind: 0,
      updateAvailable: false,
      message: 'Обновления устанавливаются через пакет приложения.',
    }))
    ipcMain.removeHandler('hermes:openExternal')
    ipcMain.handle('hermes:openExternal', (_, url) => { globalThis.hcvUpdateLink = url })
  }, version)

  const openAbout = async () => {
    await page.keyboard.press('Control+,')
    await page.locator('[data-tour="nav-about"]').click()
    const updates = page.locator('[id="setting-field-about.updates"]')
    if (!(await updates.isVisible())) {
      await page.getByRole('button', { name: /^(Обновления|Updates)$/ }).first().click()
    }
    await expect(updates).toBeVisible()
    return updates
  }
  const aboutUpdates = await openAbout()
  await expect(aboutUpdates.locator('> div').first()).toHaveCSS('border-top-left-radius', '12px')
  await expect(page.locator('[data-overlay-surface] main dl').first()).toHaveCSS('border-top-left-radius', '16px')
  await page.keyboard.press('Escape')
  await expect(aboutUpdates).toBeHidden()

  const openDialog = async () => {
    await page.locator('[data-slot="statusbar"]').getByRole('button', { name: /9\.8\.7/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Hermes' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Обновления устанавливаются через пакет приложения.')).toBeVisible()
    return dialog
  }
  let dialog = await openDialog()
  const verifyDialog = async () => {
    const warning = dialog.getByText(/^(Сборка приложения устарела|App build is out of date)$/)
    await expect(warning).toBeVisible()
    const link = dialog.getByRole('link', { name: /^(Скачать установщик|Download installer)$/ })
    await expect(link).toHaveCSS('border-top-left-radius', '8px')
    await expect(link).toHaveCSS('text-decoration-line', 'none')
    const details = dialog.locator('dl')
    await expect(details).toHaveCSS('border-top-left-radius', '16px')
    await expect(details.locator('dd').last()).toContainText('long-directory-name')
    await expect(details.locator('dd').last()).toHaveCSS('overflow-wrap', 'anywhere')
    assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
    return link
  }
  const download = await verifyDialog()
  if (capture) await screenshot('updates-dark.png', { clip: await dialog.boundingBox() })
  const installerUrl = await download.getAttribute('href')
  await download.press('Enter')
  await expect.poll(() => app.evaluate(() => globalThis.hcvUpdateLink)).toBe(installerUrl)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(root).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  dialog = await openDialog()
  await verifyDialog()
  if (capture) await screenshot('updates-light.png', { clip: await dialog.boundingBox() })
  await page.setViewportSize({ width: 540, height: 500 })
  await verifyDialog()
  await expect.poll(() => dialog.evaluate(node => {
    const body = node.firstElementChild
    return body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto'
  })).toBe(true)
  await dialog.locator('dd').last().scrollIntoViewIfNeeded()
  await expect(dialog.locator('dd').last()).toBeInViewport()
  await expect(dialog.getByRole('button', { name: /^(Закрыть|Close)$/ })).toBeInViewport()
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(dialog.locator('dl')).not.toHaveCSS('border-top-left-radius', '16px')
  await page.emulateMedia({ forcedColors: 'none' })
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1440, height: 920 })
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  dialog = await openDialog()
  await expect(dialog.locator('dl')).not.toHaveCSS('border-top-left-radius', '16px')
  await page.keyboard.press('Escape')
}
