import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyInstallOverlay({
  app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard, sandbox,
}) {
  const host = await app.evaluate(({ app }) => ({
    version: app.getVersion(),
    userData: app.getPath('userData'),
    hermesHome: process.env.HERMES_HOME,
  }))
  assert.equal(path.resolve(host.hermesHome), path.resolve(sandbox.hermesHome))
  assert.equal(path.resolve(host.userData), path.resolve(sandbox.userDataDir))
  const fixturePlugin = process.env.HERMES_VISUAL_FIXTURE_PLUGIN
  if (fixturePlugin) {
    const installed = fs.readFileSync(path.join(sandbox.hermesHome, 'desktop-plugins/hermes-codex-visual/plugin.js'))
    assert.deepEqual(installed, fs.readFileSync(fixturePlugin))
    console.log('Installer fixture module SHA-256', createHash('sha256').update(installed).digest('hex'))
  }
  console.log('Installer fixture on isolated Hermes Desktop', host.version)

  const stages = ['prerequisites', 'repository', 'venv', 'python-deps', 'config', 'products', 'setup', 'gateway', 'complete']
    .map(name => ({ name }))
  const manifest = { type: 'manifest', stages, protocolVersion: 1 }
  const start = Date.now() - 8000
  const snapshot = {
    active: true, manifest, error: null, startedAt: start, completedAt: null, setupChoice: null,
    unsupportedPlatform: null, bundled: false,
    log: [{ ts: start, stage: 'repository', line: 'Fixture: reading repository metadata' }],
    stages: {
      prerequisites: { state: 'succeeded', durationMs: 577, startedAt: start, json: null, error: null },
      repository: { state: 'running', durationMs: null, startedAt: start, json: null, error: null },
    },
  }

  await app.evaluate(({ ipcMain }, fixture) => {
    ipcMain.removeHandler('hermes:bootstrap:get')
    ipcMain.handle('hermes:bootstrap:get', () => fixture)
    ipcMain.removeHandler('hermes:bootstrap:cancel')
    ipcMain.handle('hermes:bootstrap:cancel', event => {
      globalThis.hcvInstallCancelCount = (globalThis.hcvInstallCancelCount ?? 0) + 1
      event.sender.send('hermes:bootstrap:event', { type: 'stage', name: 'venv', state: 'failed' })
      event.sender.send('hermes:bootstrap:event', {
        type: 'failed', stage: 'venv', error: 'Fixture: installation cancelled',
      })
    })
  }, snapshot)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-theme', 'codex-workspace')
  const window = await app.browserWindow(page)
  const send = event => window.evaluate((win, payload) => {
    win.webContents.send('hermes:bootstrap:event', payload)
  }, event)

  const panel = page.locator('div[class~="z-(--z-setup)"] > div').filter({ has: page.getByRole('progressbar') })
  const capture = async (name, options) => screenshot(name, { ...options, clip: await panel.boundingBox() })
  const progress = panel.getByRole('progressbar')
  const spinner = panel.getByRole('status', { name: 'Loading' })
  const output = panel.getByRole('button', { name: /Показать вывод|Show installer output/ })
  const cancel = panel.getByRole('button', { name: /Отменить установку|Cancel install/ })
  await expect(panel.getByRole('heading')).toHaveText(/Настройка Hermes Agent|Setting up Hermes Agent/)
  await expect(panel.locator('ol > li')).toHaveCount(9)
  await expect(progress).toHaveAttribute('aria-valuenow', '17')

  if (process.env.HERMES_VISUAL_INSTALL_BEFORE === '1') {
    const baseline = await panel.evaluate(node => ({
      width: getComputedStyle(node).width, radius: getComputedStyle(node).borderRadius,
      progressHeight: getComputedStyle(node.querySelector('[role=progressbar]')).height,
    }))
    console.log('Baseline installer dimensions', baseline)
    assert.notEqual(baseline.radius, '16px')
    await capture('install-before.png')
    return
  }

  await expect(panel).toHaveCSS('width', '560px')
  await expect(panel).toHaveCSS('border-radius', '16px')
  await expect(progress).toHaveCSS('height', '8px')
  await expect(progress.locator('> div')).toHaveCSS('background-color', 'rgb(102, 181, 255)')
  await expect(panel.locator('ol')).toHaveCSS('gap', '8px')
  await expect(spinner).toHaveCSS('width', '14px')
  await expect(spinner).toHaveCSS('animation-name', 'none')
  await capture('install-dark.png')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(spinner).toHaveCSS('animation-duration', '2s')
  await expect(spinner).toHaveCSS('animation-timing-function', 'steps(60)')
  await output.focus()
  await expect(output).toHaveCSS('outline-width', '2px')
  await output.press('Enter')
  const log = panel.locator('[data-selectable-text]')
  await expect(log).toContainText('Fixture: reading repository metadata')
  await expect(panel.getByRole('button', { name: /Скрыть вывод|Hide installer output/ }).locator('svg')).toHaveCSS('rotate', '90deg')
  await send({ type: 'log', stage: 'repository', line: 'Fixture: repository progress' })
  await expect(log).toContainText('Fixture: repository progress')
  await send({ type: 'stage', name: 'repository', state: 'succeeded', durationMs: 8000 })
  await send({ type: 'stage', name: 'venv', state: 'running' })
  await expect(progress).toHaveAttribute('aria-valuenow', '28')
  await expect(panel.getByText(/Установка ·|Installing ·/)).toBeVisible()
  await capture('install-output.png', { animations: 'allow' })

  await send({ type: 'complete', marker: {} })
  await expect(panel).toHaveCount(0)

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await page.setViewportSize({ width: 420, height: 450 })
  await send(manifest)
  await send({ type: 'stage', name: 'prerequisites', state: 'succeeded', durationMs: 577 })
  await send({ type: 'stage', name: 'repository', state: 'running' })
  await expect(progress).toHaveAttribute('aria-valuenow', '17')
  await expect(progress.locator('> div')).toHaveCSS('background-color', 'rgb(1, 105, 204)')
  await expect(cancel).toBeInViewport()
  await expect(cancel).toBeEnabled()
  assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  assert(await panel.locator('> .overflow-y-auto').evaluate(node => node.scrollHeight > node.clientHeight))
  await capture('install-light-narrow.png', { animations: 'allow' })

  await page.emulateMedia({ forcedColors: 'active' })
  await expect(panel).not.toHaveCSS('border-radius', '16px')
  await page.emulateMedia({ forcedColors: 'none' })
  await page.setViewportSize({ width: 1440, height: 920 })
  await send({ type: 'stage', name: 'repository', state: 'succeeded', durationMs: 8000 })
  await send({ type: 'stage', name: 'venv', state: 'running' })
  await expect(progress).toHaveAttribute('aria-valuenow', '28')
  await cancel.click()
  await expect.poll(() => app.evaluate(() => globalThis.hcvInstallCancelCount)).toBe(1)
  await expect(panel).toContainText('Fixture: installation cancelled')
  await expect(panel.getByRole('button', { name: /Повторить|Retry/i })).toBeVisible()
  await expect(panel.locator('ol > li').filter({ hasText: 'Venv' }).locator('.codicon-error')).toHaveCount(1)
  await capture('install-cancelled.png', { animations: 'allow' })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)


  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await send(manifest)
  await expect(progress).toBeVisible()
  await expect(panel).not.toHaveCSS('border-radius', '16px')
  await expect(progress).toHaveCSS('height', '6px')
  await send({ type: 'dismissed' })
  await expect(panel).toHaveCount(0)
}
