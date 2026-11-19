import path from 'node:path'
import assets from '../source/visual-assets.json' with { type: 'json' }

// Capture the real public module in an isolated profile with synthetic content.
// No replacement styles or edited pixels: each image is a native UI state.
export async function captureReadme({ page, expect, projectChat, openThemeSettings, closeSettings, themeCard }) {
  await page.evaluate(() => { location.hash = '#/settings?tab=config%3Aappearance&page=general' })
  await page.getByRole('button', { name: 'Сменить язык' }).click()
  const search = page.locator('input[cmdk-input]:visible')
  await search.fill('English')
  await search.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.keyboard.press('Escape')
  if (await page.locator('[data-overlay-surface]').count()) await page.keyboard.press('Escape')
  await projectChat('Workspace overview').click()
  await expect(page.getByRole('heading', { name: 'Your workspace at a glance' })).toBeVisible()
  // Decline only the optional usage counter in this disposable demo profile.
  const consent = page.getByRole('button', { name: /^(No,? thanks|Нет, спасибо)$/ })
  if (await consent.isVisible()) {
    await consent.click()
    await expect(consent).toHaveCount(0)
  }
  const summary = page.locator('[data-hcv-context-card]:visible')
  if (!(await summary.count())) await page.locator('[data-hcv-context-toggle]').click()
  await expect(summary).toBeVisible()
  // README screenshots must use the same artwork as the installed workspace.
  // Compare rendered masks, not only the names of icons in the source.
  const mask = (node, pseudo = '::before') => node.evaluate((element, pseudo) => {
    const value = getComputedStyle(element, pseudo).maskImage
    const encoded = value.match(/^url\(["']?data:image\/svg\+xml,([^"']+)["']?\)$/)?.[1]
    return encoded ? decodeURIComponent(encoded) : value
  }, pseudo)
  for (const [id, glyph] of [['new-session', 'newChat'], ['capabilities', 'plugins'], ['messaging', 'messages'], ['artifacts', 'artifacts'], ['cron', 'schedule']]) {
    const button = page.locator(`[data-tour="sidebar-nav-${id}"]`).locator('xpath=ancestor::button[1]')
    await expect.poll(() => mask(button)).toBe(assets.icons[glyph])
  }
  const project = page.locator('[data-hcv-project-row]').filter({ has: page.locator('[data-hcv-project-name]', { hasText: /^Atlas$/ }) })
  const folder = project.locator('.codicon-folder-library, .codicon-repo').first()
  await expect.poll(() => mask(folder)).toBe(assets.icons.folderOpen)
  const viewport = page.locator('[data-slot="aui_thread-viewport"]:visible')
  await viewport.evaluate(node => { node.scrollTop = 0 })
  const save = async name => {
    await page.mouse.move(720, 20)
    await expect(page.locator('[role="tooltip"]:visible')).toHaveCount(0)
    await page.screenshot({ path: path.resolve(import.meta.dirname, '../docs/images', name), animations: 'disabled' })
  }
  await save('workspace-dark.png')
  await openThemeSettings()
  await page.getByText('Light', { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await save('workspace-light.png')
  await openThemeSettings()
  await page.getByText('Dark', { exact: true }).first().click()
  await themeCard('Nous').click()
  await closeSettings()
  await save('stock-dark.png')
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await page.evaluate(() => { location.hash = '#/settings?tab=config%3Amodel&page=delegation' })
  await expect(page.locator('[data-overlay-surface] main')).toBeVisible()
  await expect(page.locator('[data-overlay-surface] main [data-slot="skeleton"]:visible')).toHaveCount(0)
  await save('settings-dark.png')
  await closeSettings()
  console.log('Verified six rendered shared icons and captured public dark/light, stock comparison and settings screenshots')
}
