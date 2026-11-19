import assert from 'node:assert/strict'

export async function verifyNewChatDot({ page, expect, screenshot, prompt, release, openThemeSettings, closeSettings, themeCard, before }) {
  const tab = page.locator('[data-zone-tabstrip="grp-main"] [role="tab"][data-tree-tab="workspace"]')
  const dot = tab.locator('.pane-tab-content span.rounded-full[class~="border-(--ui-text-quaternary)"]:not([role="status"])')
  const input = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]:visible').first()
  await expect(tab).toBeVisible()
  await expect(dot).toHaveCount(1)
  const measure = () => tab.evaluate(node => {
    const dot = node.querySelector('.pane-tab-content span.rounded-full[class~="border-(--ui-text-quaternary)"]:not([role="status"])')
    const label = node.querySelector('.pane-tab-content .truncate')
    const style = getComputedStyle(dot)
    const folder = getComputedStyle(node, '::before')
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
    return { opacity: style.opacity, dot: box(dot), label: box(label), labelText: label.textContent,
      accessibleLabel: dot.getAttribute('aria-label'), folderMask: folder.maskImage, folderWidth: folder.width }
  })
  const initial = await measure()
  const box = await tab.boundingBox()
  await screenshot(before ? 'new-chat-dot-before.png' : 'new-chat-dot-dark.png', { clip: box })
  if (before) {
    assert.equal(initial.opacity, '1')
    return { before: true, initial }
  }
  assert.equal(initial.opacity, '0')
  assert.match(initial.accessibleLabel, /черновик/i)
  assert.match(initial.folderMask, /data:image\/svg/)
  assert.equal(initial.folderWidth, '16px')
  await input.fill('Проверочный черновик')
  await expect(dot).toHaveCSS('opacity', '0')
  await tab.click()
  await expect(input).toHaveText('Проверочный черновик')

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await expect(dot).toHaveCSS('opacity', '0')
  await screenshot('new-chat-dot-light.png', { clip: await tab.boundingBox() })
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(dot).toHaveCSS('opacity', '1')
  await openThemeSettings()
  await themeCard('Codex').click()
  await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
  await closeSettings()
  await expect(dot).toHaveCSS('opacity', '0')
  await expect(input).toHaveText('Проверочный черновик')

  try {
    await input.fill(prompt)
    await input.press('Enter')
    const status = tab.locator('.pane-tab-content [role="status"][class~="bg-(--ui-accent)"]')
    await expect(status).toHaveCount(1, { timeout: 30000 })
    await expect(status).toHaveCSS('opacity', '1')
    await expect(dot).toHaveCount(0)
  } finally {
    release()
  }
  return { before: false, initial, workingStatusUnaffected: true }
}
