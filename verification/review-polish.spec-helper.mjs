import assert from 'node:assert/strict'

export async function verifyReviewPolish({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const capture = async name => {
    try {
      await screenshot(name, { timeout: 5000 })
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error
      console.log('Screenshot unavailable:', name)
    }
  }
  await projectChat('Ревью интерфейса').click()
  const dock = page.locator('[data-slot="composer-dock"]:visible')
  const branch = dock.locator('.coding-status-bar')
  const grip = dock.locator('[data-slot="status-drawer-toggle"]')
  await expect(branch).toBeVisible({ timeout: 15000 })
  await expect(branch).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  await expect(grip).toHaveAttribute('aria-expanded', 'true')

  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'false')
  await page.mouse.move(1, 1)
  await expect(grip).toHaveCSS('opacity', '0')
  await capture('grip-hidden.png')
  await grip.hover()
  await expect(grip).toHaveCSS('opacity', '1')
  const tip = page.locator('[data-slot="tooltip-content"]:visible').filter({ hasText: 'Показать панель состояния' })
  await expect(tip).toHaveCSS('border-radius', '8px')
  await expect(tip).toHaveCSS('padding', '6px 8px')
  await expect(tip.locator('[data-slot="tooltip-arrow"]')).toBeHidden()
  await capture('grip-hover.png')
  await page.mouse.move(1, 1)
  await expect(grip).toHaveCSS('opacity', '0')

  // Tab onto the original control before reopening the same drawer.
  await grip.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(grip).toBeFocused()
  await expect(grip).toHaveCSS('opacity', '1')
  await grip.press('Enter')
  await expect(grip).toHaveAttribute('aria-expanded', 'true')

  await branch.locator('button:has(> .codicon-git-branch)').click()
  const review = page.getByRole('complementary', { name: 'Проверить', exact: true })
  await expect(review).toBeVisible()
  const picker = review.locator('button[aria-haspopup="menu"]').filter({ hasText: /^(Незакоммиченные|Ветка|Последний ход)$/ })
  await expect(picker).toHaveText('Незакоммиченные')
  await expect(picker).toHaveCSS('height', '24px')
  await expect(picker).toHaveCSS('border-radius', '6px')
  await expect(review.getByRole('button', { name: 'Ветка', exact: true })).toHaveCount(0)

  const ask = review.getByRole('button', { name: 'Попросить Hermes открыть PR', exact: true })
  await expect(ask).toBeEnabled()
  await expect(ask.locator('span')).toHaveCSS('text-decoration-line', 'none')
  assert(await ask.locator('span').evaluate(label => label.scrollWidth <= label.clientWidth + 1),
    'The PR label must fit at the standard review width')
  await ask.hover()
  await expect(ask.locator('span')).toHaveCSS('text-decoration-line', 'none')
  await expect(ask).toHaveCSS('border-radius', '6px')
  await page.mouse.move(1, 1)
  await capture('review.png')
  await picker.click()
  const menu = page.getByRole('menu')
  for (const label of ['Незакоммиченные', 'Ветка', 'Последний ход']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
  }
  await capture('review-scope.png')
  await menu.getByRole('menuitem', { name: 'Ветка', exact: true }).click()
  await expect(picker).toHaveText('Ветка')
  await expect(ask).toBeHidden()
  await picker.press('Enter')
  await menu.getByRole('menuitem', { name: 'Последний ход', exact: true }).click()
  await expect(picker).toHaveText('Последний ход')
  await picker.press('Enter')
  await menu.getByRole('menuitem', { name: 'Незакоммиченные', exact: true }).click()
  await expect(ask).toBeEnabled()

  await page.setViewportSize({ width: 820, height: 760 })
  await expect(picker).toBeVisible()
  const [paneBox, pickerBox] = await Promise.all([review.boundingBox(), picker.boundingBox()])
  assert(pickerBox.x >= paneBox.x && pickerBox.x + pickerBox.width <= paneBox.x + paneBox.width)
  await capture('review-narrow.png')

  // A real link in a message keeps its own underline. The shared rule also
  // covers nested labels and hover-only variants on other buttons.
  const decorations = await page.evaluate(() => {
    const root = document.createElement('div')
    root.innerHTML = '<button class="underline"><span class="underline">Action</span></button><a class="underline" href="#test">Link</a>'
    document.body.append(root)
    try {
      return [...root.querySelectorAll('button, span, a')].map(element => getComputedStyle(element).textDecorationLine)
    } finally {
      root.remove()
    }
  })
  assert.deepEqual(decorations, ['none', 'none', 'underline'])

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('html')).not.toHaveAttribute('data-hermes-theme', 'codex-workspace')
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  await grip.click()
  await page.mouse.move(1, 1)
  await expect(grip).toHaveCSS('opacity', '0.35')
  console.log('Review, tooltip, branch divider, pointer and keyboard grip, and theme fallback passed')
}
