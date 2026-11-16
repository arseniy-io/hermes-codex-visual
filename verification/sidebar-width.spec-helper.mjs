import assert from 'node:assert/strict'

export async function verifySidebarWidth({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard, beforeRelease }) {
  const sidebar = page.locator('[data-tree-group="grp-sessions"]:visible')
  const track = sidebar.locator('xpath=..')
  const following = track.locator('xpath=following-sibling::div[not(contains(@style,"display: none"))][1]')
  const divider = following.locator(':scope > [role="separator"][data-sash-overlap="trailing"]')
  const measure = () => track.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      width: Math.round(element.getBoundingClientRect().width),
      minimum: style.minWidth,
      preference: element.style.flexBasis,
    }
  })
  async function resize(delta) {
    const box = await divider.boundingBox()
    assert(box && box.height > 120, 'Expected the native sidebar separator')
    const x = box.x + box.width / 2
    const y = box.y + Math.min(220, box.height / 2)
    await page.mouse.move(x, y)
    await page.mouse.down()
    try {
      await page.mouse.move(x + delta, y, { steps: 6 })
    } finally {
      await page.mouse.up()
    }
  }

  await expect(sidebar).toBeVisible()
  const minimum = beforeRelease ? 237 : 222
  await expect(track).toHaveCSS('min-width', `${minimum}px`)
  const before = await measure()
  assert(before.width > minimum)
  const clip = { x: 0, y: 0, width: 345, height: 570 }
  await screenshot('sidebar-width-before.png', { clip })
  await resize(-100)
  await expect.poll(async () => (await measure()).width).toBe(minimum)
  if (beforeRelease) return { before, compact: await measure() }
  await page.mouse.move(870, 158)
  const compact = await measure()
  await screenshot('sidebar-width-after.png', { clip })
  await resize(57)
  await expect.poll(async () => (await measure()).width).toBe(279)
  const widened = await measure()
  await resize(-120)
  await expect.poll(async () => (await measure()).width).toBe(222)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await measure()).width).toBe(222)
  const restored = await measure()
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(track).toHaveCSS('min-width', '237px')
  const native = await measure()
  return { before, compact, widened, restored, native }
}
