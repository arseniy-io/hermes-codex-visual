import assert from 'node:assert/strict'

export async function verifySummaryLayout({ page, expect, summary, outside, screenshot }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const editor = chat.locator('[data-slot="composer-root"] [contenteditable="true"]:visible')
  const toggle = page.locator('[data-hcv-context-toggle]')
  const measure = () => chat.evaluate(node => {
    const box = (selector, root = node) => {
      const rect = root.querySelector(selector)?.getBoundingClientRect()
      return rect && { left: rect.left, right: rect.right, center: rect.left + rect.width / 2 }
    }
    const outer = node.getBoundingClientRect()
    const viewport = node.querySelector('[data-slot="aui_thread-viewport"]')
    const rect = viewport.getBoundingClientRect()
    const styles = getComputedStyle(viewport)
    return {
      inset: parseFloat(styles.paddingRight),
      outer: { left: outer.left, right: outer.right },
      scroll: {
        right: rect.right,
        windowInset: window.innerWidth - rect.right,
        centerY: rect.top + rect.height / 2,
        gutter: viewport.offsetWidth - viewport.clientWidth - viewport.clientLeft,
        width: styles.scrollbarWidth,
        gutterMode: styles.scrollbarGutter,
        color: styles.scrollbarColor,
      },
      thread: box('[data-slot="aui_thread-content"]'),
      composer: box('[data-slot="composer-surface"]'),
      card: box('[data-hcv-context-card]', document),
      scrollTop: viewport.scrollTop,
    }
  })
  const inset = async () => Math.round((await measure()).inset)
  const reserve = 292
  const draft = 'Черновик для проверки сводки'
  await expect(editor).toBeEditable()
  await editor.fill(draft)
  await expect(viewport.getByText(/^Контрольный абзац 36\./)).toBeAttached()
  await expect.poll(inset).toBe(reserve)
  await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200)
  const loaded = await measure()
  await page.mouse.move(loaded.thread.center, loaded.scroll.centerY)
  await page.mouse.wheel(0, -300)
  await expect(viewport).toHaveAttribute('data-following', 'false', { timeout: 15000 })
  await viewport.evaluate(node => { node.scrollTop = Math.floor((node.scrollHeight - node.clientHeight) / 2) })
  await page.mouse.move(10, (await page.evaluate(() => window.innerHeight)) - 8)
  const scrollbarAlpha = async () => Number((await measure()).scroll.color.match(/rgba\([^)]*, ([.\d]+)\)/)?.[1])
  await expect.poll(scrollbarAlpha).toBeLessThan(.1)
  const expanded = await measure()
  assert(expanded.scrollTop > 30)
  assert(Math.abs(expanded.scroll.right - expanded.outer.right) < 1, JSON.stringify(expanded))
  assert(expanded.scroll.windowInset < 8, JSON.stringify(expanded.scroll))
  assert.equal(expanded.scroll.width, 'thin')
  assert.equal(expanded.scroll.gutterMode, 'stable both-edges')
  await screenshot('summary-layout-scrollbar.png')

  await page.mouse.move(expanded.thread.center, expanded.scroll.centerY)
  await expect.poll(scrollbarAlpha).toBeGreaterThan(.1)
  const hovered = await measure()
  assert.notEqual(hovered.scroll.color, expanded.scroll.color)

  if (process.platform === 'win32') {
    assert(expanded.scroll.gutter > 0, JSON.stringify(expanded.scroll))
    const x = expanded.scroll.right - expanded.scroll.gutter / 2
    const y = expanded.scroll.centerY
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 24, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => (await measure()).scrollTop, { message: 'Dragging the right-edge thumb scrolls the transcript' }).toBeGreaterThan(expanded.scrollTop + 24)
    await viewport.evaluate((node, top) => { node.scrollTop = top }, expanded.scrollTop)
  }

  await outside.click()
  await page.keyboard.press('Escape')
  await expect(summary).toBeVisible()
  await expect.poll(inset).toBe(reserve)
  await toggle.click()
  await expect(summary).toBeHidden()
  await expect.poll(inset).toBe(0)
  const collapsed = await measure()
  assert.equal(collapsed.scroll.right, expanded.scroll.right)
  for (const column of ['thread', 'composer']) {
    assert(expanded[column].right < expanded.card.left, JSON.stringify(expanded))
    assert(Math.abs(collapsed[column].center - expanded[column].center - reserve / 2) < 3)
  }
  await screenshot('summary-layout-closed.png')

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const opening of [true, false]) {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', String(opening))
    const sampled = await page.locator('html').evaluate(node => {
      const transition = node.getAnimations().find(animation => animation.transitionProperty === '--hcv-summary-progress')
      if (!transition) return false
      transition.currentTime = transition.effect.getTiming().duration / 3
      return true
    })
    assert(sampled, 'Expected a summary transition')
    const moving = await measure()
    assert(moving.inset > 10 && moving.inset < reserve - 10, JSON.stringify(moving))
    assert.equal(moving.scroll.right, expanded.scroll.right)
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
  assert(Math.abs(afterAnimation.scrollTop - collapsed.scrollTop) < 2,
    JSON.stringify({ before: collapsed.scrollTop, after: afterAnimation.scrollTop }))
  await editor.fill('')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.click()
  await expect.poll(inset).toBe(reserve)
  assert.equal(await summary.evaluate(node => node.getAnimations().length), 0)

  await page.setViewportSize({ width: 1440, height: 465 })
  await expect(summary).toBeVisible({ timeout: 15000 })
  await expect.poll(inset, { timeout: 15000 }).toBe(reserve)
  await page.setViewportSize({ width: 1050, height: 920 })
  await expect(summary).toHaveCount(0)
  await expect.poll(inset).toBe(0)
  assert.equal((await measure()).scroll.width, 'thin')
  await page.setViewportSize({ width: 1440, height: 920 })
  await expect(summary).toBeVisible({ timeout: 15000 })
  await expect.poll(inset, { timeout: 15000 }).toBe(reserve)
  console.log(JSON.stringify({
    summaryInset: reserve, transcriptShift: collapsed.thread.center - expanded.thread.center,
    scrollbar: expanded.scroll, scrollbarHoverColor: hovered.scroll.color, draftPreserved: true, scrollPreserved: true,
  }))
}
