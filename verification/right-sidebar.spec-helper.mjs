import assert from 'node:assert/strict'
import { probeNativeRight } from './right-sidebar-probe.mjs'

export async function verifyRightSidebar({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const mirror = page.locator('[data-hcv-right-mirror] [data-tour="right-pane-toggle"]')
  const original = page.locator('[data-hcv-right-original]')
  await expect(mirror).toBeVisible({ timeout: 15000 })
  await expect(original).toHaveCount(1)
  await expect(original).toBeHidden()
  const first = await probeNativeRight(page)
  assert(first.exactBridge && first.button.nativeTooltipFiber, JSON.stringify(first))
  assert.equal(first.selected.mode, 'positional-group')

  const check = async open => {
    await expect.poll(async () => {
      const state = await probeNativeRight(page)
      return state.exactBridge && state.selected?.groupShown
    }, { timeout: 8000 }).toBe(open)
    await expect(mirror).toHaveAttribute('aria-label', open ? 'Скрыть правую панель' : 'Показать правую панель')
  }
  await check(first.selected.groupShown)
  await mirror.click()
  await check(!first.selected.groupShown)
  await mirror.press('Enter')
  await check(first.selected.groupShown)
  await mirror.hover()
  const label = first.selected.groupShown ? 'Скрыть правую панель' : 'Показать правую панель'
  await expect(page.locator('[data-slot="tooltip-content"]:visible').filter({ hasText: label })).toBeVisible()
  await screenshot('right-toggle-tooltip.png')

  // When native Hermes uses its narrow overlay contract, fall back to its
  // original button. Restoring the wide layout must reactivate the mirror.
  await page.setViewportSize({ width: 620, height: 800 })
  await expect(page.locator('[data-hcv-right-mirror]')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('[data-tour="right-pane-toggle"]:visible')).toHaveCount(1)
  await page.setViewportSize({ width: 1440, height: 920 })
  await expect(mirror).toBeVisible({ timeout: 15000 })

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('[data-hcv-right-mirror]')).toHaveCount(0)
  await expect(page.locator('[data-tour="right-pane-toggle"]:visible')).toHaveCount(1)
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await expect(mirror).toBeVisible({ timeout: 15000 })
  const restored = await probeNativeRight(page)
  await check(restored.selected.groupShown)
  return { nativeTooltip: true, clickAndKeyboard: true, initialOpen: first.selected.groupShown,
    narrowFallback: true, themeRestore: true }
}
