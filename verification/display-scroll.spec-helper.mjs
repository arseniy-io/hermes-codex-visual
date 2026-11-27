import assert from 'node:assert/strict'
import { verifyComposerBottomGap } from './composer-bottom-gap.spec-helper.mjs'

export async function verifyDisplayScroll({ page, expect, sidebar, screenshot }) {
  const recents = sidebar.locator('[data-hcv-recents-toggle]')
  await expect(recents).toBeVisible()
  if (await recents.getAttribute('aria-expanded') !== 'true') await recents.press('Enter')
  const saved = sidebar.locator('[data-hcv-recents-list]').getByRole('button', { name: 'Тест длинного сообщения', exact: true })
  await expect(saved).toBeVisible()
  await saved.click()
  const viewport = page.locator('[data-slot="aui_thread-viewport"]:visible').first()
  const long = viewport.locator('[data-slot="aui_user-message-root"]').filter({ hasText: 'Длинный запрос' })
  const toggle = long.locator('[data-hcv-message-toggle]')
  await expect(toggle).toHaveText('Показать ещё', { timeout: 30000 })
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const gap = process.env.HERMES_VISUAL_COMPOSER_BOTTOM_GAP === '1'
    ? await verifyComposerBottomGap({ page, expect, screenshot,
      baseline: process.env.HERMES_VISUAL_COMPOSER_GAP_BEFORE === '1' }) : null

  const before = await viewport.evaluate(node => {
    node.scrollTop = node.scrollHeight
    return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight, mask: getComputedStyle(node).maskImage }
  })
  assert(before.max > 700, JSON.stringify(before))
  await expect(viewport).not.toHaveCSS('scrollbar-color', 'auto')
  const content = viewport.locator(':scope > [data-slot="aui_thread-content"]')
  await expect(content).toHaveCSS('scrollbar-color', 'auto')
  await viewport.hover()
  await expect(content).toHaveCSS('scrollbar-color', 'auto')
  await page.mouse.wheel(0, -500)
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeLessThan(before.max)
  const during = await viewport.evaluate(node => ({ top: node.scrollTop, mask: getComputedStyle(node).maskImage }))
  assert(during.top > 0, JSON.stringify(during))
  assert.match(during.mask, /16px/)
  await screenshot('long-chat-scrolled.png')
  await viewport.evaluate(node => { node.scrollTop = 0 })
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(0)
  const top = await viewport.evaluate(node => {
    const bubble = node.querySelector('[data-slot="aui_user-message-root"] button.composer-human-message')
    return bubble.getBoundingClientRect().top - node.getBoundingClientRect().top
  })
  assert.equal(top, 32)
  return { before, during, top, expandedAndCollapsed: true, gap }
}
