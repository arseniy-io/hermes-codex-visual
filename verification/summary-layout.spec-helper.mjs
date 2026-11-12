import assert from 'node:assert/strict'

export async function verifySummaryLayout({ page, expect, summary, outside, screenshot }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const editor = chat.locator('[data-slot="composer-root"] [contenteditable="true"]:visible')
  const toggle = page.locator('[data-hcv-context-toggle]')
  const actions = summary.getByRole('button', { name: 'Действия со сводкой' })
  const measure = () => chat.evaluate(node => {
    const box = (selector, root = node) => {
      const rect = root.querySelector(selector)?.getBoundingClientRect()
      return rect && { left: rect.left, right: rect.right, center: rect.left + rect.width / 2 }
    }
    const bounds = box('[data-slot="composer-bounds"]')
    const outer = node.getBoundingClientRect()
    return {
      bounds,
      inset: outer.right - bounds.right,
      outer: { left: outer.left, right: outer.right },
      thread: box('[data-slot="aui_thread-content"]'),
      composer: box('[data-slot="composer-surface"]'),
      card: box('[data-hcv-context-card]', document),
      scrollTop: node.querySelector('[data-slot="aui_thread-viewport"]').scrollTop,
    }
  })
  const inset = async () => Math.round((await measure()).inset)
  const reserve = 312
  const draft = 'Черновик для проверки сводки'
  await expect(editor).toBeEditable()
  await editor.fill(draft)
  await expect(viewport.getByText(/^Контрольный абзац 36\./)).toBeAttached()
  await viewport.evaluate(node => { node.scrollTop = Math.floor((node.scrollHeight - node.clientHeight) / 2) })
  await expect(viewport).toHaveAttribute('data-following', 'false')
  await expect.poll(inset).toBe(reserve)
  const expanded = await measure()
  assert(expanded.scrollTop > 30)

  await actions.click()
  await page.getByRole('menuitem', { name: 'Открепить сводку' }).click()
  await expect(summary).toHaveAttribute('data-pinned', 'false')
  await expect(summary).toBeVisible()
  await expect.poll(inset, { message: 'A visible summary keeps space for the loaded thread even when unpinned' }).toBe(reserve)
  await outside.click()
  await expect(summary).toBeHidden()
  await expect.poll(inset).toBe(0)
  const collapsed = await measure()
  for (const column of ['thread', 'composer']) {
    assert(expanded[column].right < expanded.card.left, JSON.stringify(expanded))
    assert(Math.abs(collapsed[column].center - expanded[column].center - reserve / 2) < 3)
  }
  await screenshot('summary-layout-closed.png')

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const opening of [true, false]) {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: .12 })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', String(opening))
    const started = await page.locator('html').evaluate(node => node.getAnimations().some(animation => animation.transitionProperty === '--hcv-summary-progress'))
    assert(started)
    await expect.poll(async () => {
      const width = await inset()
      return width > 10 && width < reserve - 10
    }).toBe(true)
    const moving = await measure()
    for (const column of ['thread', 'composer']) {
      assert(Math.abs(moving[column].center - collapsed[column].center + moving.inset / 2) < 3, JSON.stringify(moving))
    }
    const expectedCardLeft = expanded.card.left + (expanded.card.right - expanded.card.left) * (1 - moving.inset / reserve)
    assert(Math.abs(moving.card.left - expectedCardLeft) < 4, JSON.stringify(moving))
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
    await expect.poll(inset).toBe(opening ? reserve : 0)
    if (opening) await screenshot('summary-layout-open.png')
  }
  await expect(summary).toBeHidden()
  await expect(editor).toHaveText(draft)
  const afterAnimation = await measure()
  assert(Math.abs(afterAnimation.scrollTop - expanded.scrollTop) < 2,
    JSON.stringify({ before: expanded.scrollTop, after: afterAnimation.scrollTop }))
  await editor.fill('')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.click()
  await expect.poll(inset).toBe(reserve)
  assert.equal(await summary.evaluate(node => node.getAnimations().length), 0)
  await actions.click()
  await page.getByRole('menuitem', { name: 'Закрепить сводку' }).click()
  await expect(summary).toHaveAttribute('data-pinned', 'true')

  await page.setViewportSize({ width: 1440, height: 465 })
  await expect(summary).toBeVisible()
  await expect.poll(inset).toBe(reserve)
  await page.setViewportSize({ width: 1050, height: 920 })
  await expect(summary).toHaveCount(0)
  await expect.poll(inset).toBe(0)
  await page.setViewportSize({ width: 1440, height: 920 })
  await expect(summary).toBeVisible()
  await expect.poll(inset).toBe(reserve)
  console.log(JSON.stringify({ summaryInset: reserve, transcriptShift: collapsed.thread.center - expanded.thread.center, draftPreserved: true, scrollPreserved: true }))
}
