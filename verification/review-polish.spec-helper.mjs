import assert from 'node:assert/strict'

export async function verifyReviewPolish({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
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
  const surface = dock.locator('[data-slot="composer-surface"]')
  const drawer = surface.locator(':scope > .status-drawer')
  await expect(branch).toBeVisible({ timeout: 15000 })
  if (process.env.HERMES_VISUAL_BRANCH_CONTEXT_ONLY === '1') {
    const branchButton = branch.locator('button:has(> .codicon-git-branch)')
    const branchMenu = page.getByRole('menu').filter({ has: page.getByRole('menuitem') })
    await branch.click({ button: 'right' })
    await expect(branchMenu).toBeVisible()
    const mouseItems = await branchMenu.getByRole('menuitem').allTextContents()
    await page.keyboard.press('Escape')
    await expect(branchMenu).toBeHidden()
    await page.keyboard.press('Tab')
    await branchButton.focus()
    console.log('Branch keyboard focus', JSON.stringify(await page.evaluate(() => ({
      tag: document.activeElement?.tagName, className: document.activeElement?.className,
      inBranch: Boolean(document.activeElement?.closest('.coding-status-bar')),
    }))))
    await expect(branchButton).toBeFocused()
    assert(await branchButton.evaluate(node => node.matches(':focus-visible')))
    await expect(branchButton).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Shift+F10')
    await expect(branchMenu).toBeVisible()
    assert.deepEqual(await branchMenu.getByRole('menuitem').allTextContents(), mouseItems)
    await page.keyboard.press('Escape')
    return
  }
  await expect(branch).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  await branch.hover()
  const cwd = branch.locator('[data-slot="coding-status-cwd"]')
  await expect(cwd).toBeVisible()
  await expect(cwd).toHaveCSS('font-size', '12px')
  await expect(cwd).toHaveCSS('font-weight', '400')
  await expect(cwd).toHaveCSS('color', 'rgb(169, 169, 169)')
  assert.match(await cwd.evaluate(node => getComputedStyle(node).fontFamily), /Segoe UI/)
  const branchLabel = branch.locator('button.contents > span[title]')
  await expect(branchLabel).toHaveCSS('color', 'rgb(223, 223, 223)')
  const added = branch.locator('span[class~="text-(--ui-green)"]').filter({ hasText: /^\+/ })
  const removed = branch.locator('span[class~="text-(--ui-red)"]').filter({ hasText: /^−/ })
  await expect(added).toHaveCSS('color', 'rgb(64, 201, 119)')
  await expect(removed).toHaveCSS('color', 'rgb(250, 66, 62)')
  await expect(drawer).toHaveCSS('transition-duration', '0.28s')
  await capture('status-branch.png')

  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'false')
  await page.mouse.move(1, 1)
  await expect(grip).toHaveCSS('opacity', '0')
  const composerBox = await surface.boundingBox()
  assert(composerBox)
  // The 28px line has only 14px of reach at its sides and 12px vertically.
  await page.mouse.move(composerBox.x + composerBox.width / 2 + 90, composerBox.y + 35)
  await expect(grip).toHaveCSS('opacity', '0')
  await page.mouse.move(composerBox.x + composerBox.width / 2 + 45, composerBox.y - 4)
  await expect(grip).toHaveCSS('opacity', '0')
  assert(!await grip.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)),
    { x: composerBox.x + composerBox.width / 2 + 45, y: composerBox.y - 4 }))
  await page.mouse.move(composerBox.x + composerBox.width / 2 + 15, composerBox.y + 4)
  await expect(grip).toHaveCSS('opacity', '1')
  assert(await grip.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)),
    { x: composerBox.x + composerBox.width / 2 + 15, y: composerBox.y + 4 }))
  await page.mouse.click(composerBox.x + composerBox.width / 2 + 15, composerBox.y + 4)
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'false')
  const input = surface.locator('[data-slot="composer-rich-input"]')
  // The editor starts 14px below the edge and must remain clickable.
  assert(!await grip.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)),
    { x: composerBox.x + composerBox.width / 2, y: composerBox.y + 16 }))
  await page.mouse.click(composerBox.x + composerBox.width / 2, composerBox.y + 16)
  await expect(input).toBeFocused()
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
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const control of [drawer, grip]) {
    const duration = await control.evaluate(node => getComputedStyle(node).transitionDuration)
    assert(duration.split(',').every(value => parseFloat(value) <= 0.001), duration)
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })

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
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await branch.hover()
  await expect(branchLabel).toHaveCSS('color', 'rgb(26, 28, 31)')
  await expect(added).toHaveCSS('color', 'rgb(0, 162, 64)')
  await expect(removed).toHaveCSS('color', 'rgb(186, 38, 35)')
  await capture('status-branch-light.png')

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
