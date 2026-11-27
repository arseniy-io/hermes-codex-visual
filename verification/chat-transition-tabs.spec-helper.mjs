import assert from 'node:assert/strict'

const longTitle = 'Тест длинного сообщения'
const longReply = 'Ответ, абзац 53.'
const shortTitles = ['Свободный чат 13', 'Свободный чат 12', 'Свободный чат 11']
const surfaceSelector = '[data-tree-group="grp-main"] [data-chat-surface]'
const visibleSurface = surfaceSelector + ':not([data-pane-hidden] *, [hidden] *):visible'
const viewportSlot = '[data-slot="aui_thread-viewport"]'

export async function verifyChatTransitionTabs({ page, expect, sidebar, measure }) {
  const tabs = page.locator('[data-zone-tabstrip="grp-main"] [role="tab"]')
  const tabFor = title => tabs.filter({ hasText: title })
  const rows = sidebar.locator('[data-hcv-recents-list]')
  const recents = sidebar.locator('[data-hcv-recents-toggle]')
  if (await recents.getAttribute('aria-expanded') !== 'true') await recents.press('Enter')
  const viewport = page.locator(visibleSurface).locator(viewportSlot)
  const longTab = tabFor(longTitle)
  const waitForLong = () => expect(viewport.getByText(longReply, { exact: false })).toBeVisible({ timeout: 30000 })
  const snapshot = () => viewport.evaluate(node => ({
    top: node.scrollTop,
    range: node.scrollHeight - node.clientHeight,
    following: node.dataset.following,
  }))
  const settle = () => page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))

  async function select(tab) {
    await tab.click({ position: { x: 10, y: 12 } })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }

  async function switchAway() {
    const away = []
    for (const title of shortTitles) {
      const tab = tabFor(title)
      if (await tab.count()) await select(tab)
      else await rows.getByRole('button', { name: title, exact: true }).click({ modifiers: ['Control'] })
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(viewport.getByText('Короткий ответ.', { exact: true })).toBeVisible({ timeout: 30000 })
      await expect(viewport.getByText(longReply, { exact: false })).toHaveCount(0)
      await settle()
      away.push(await page.locator(surfaceSelector).evaluateAll((surfaces, { viewportSlot, longReply }) => {
        const node = surfaces.map(surface => surface.querySelector(viewportSlot))
          .find(view => view?.textContent.includes(longReply))
        if (!node) return { mounted: false }
        return {
          mounted: true,
          hidden: Boolean(node.closest('[data-pane-hidden], [hidden]')),
          suspended: node.hasAttribute('data-hcv-suspended-transcript'),
        }
      }, { viewportSlot, longReply }))
    }
    return away
  }

  const options = { relativeToBottom: true }
  async function roundTrip(mode) {
    const before = await snapshot()
    let away
    await measure(`tabs/return/${mode}`, async () => {
      away = await switchAway()
      await select(longTab)
      await waitForLong()
    }, options)
    const after = await snapshot()
    return { before, away, after }
  }

  await waitForLong()
  await expect(longTab).toHaveAttribute('aria-selected', 'true')
  const initial = await snapshot()
  assert(initial.range > 700, JSON.stringify(initial))
  if (initial.range - initial.top > 2) {
    await viewport.hover({ position: { x: 90, y: 170 } })
    await page.mouse.wheel(0, Math.ceil(initial.range))
  }
  await expect.poll(async () => {
    const { range, top } = await snapshot()
    return range - top
  }).toBeLessThanOrEqual(2)
  await settle()
  const bottom = await roundTrip('bottom')

  // Position the reader by a real scroll gesture so the follow latch learns
  // that this pane must retain its place even after two newer tabs pass it.
  await viewport.hover({ position: { x: 90, y: 170 } })
  await page.mouse.wheel(0, -600)
  await expect(viewport).toHaveAttribute('data-following', 'false')
  await expect.poll(async () => {
    const { range, top } = await snapshot()
    return range - top
  }).toBeGreaterThan(150)
  await settle()
  const reading = await roundTrip('reading')
  return { bottom, reading }
}
