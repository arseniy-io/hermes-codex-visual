import assert from 'node:assert/strict'

const chat = '[data-chat-surface]:not([data-pane-hidden] *, [hidden] *)'
const timeline = '[data-slot="thread-timeline"]'
const tooltip = '[data-slot="tooltip-content"]'
const bar = '[data-slot="timeline-bar"]'

async function geometry(rail) {
  return rail.evaluate(node => {
    const frame = node.parentElement.getBoundingClientRect()
    const rect = node.getBoundingClientRect()
    const content = node.parentElement.querySelector('[data-slot="aui_thread-content"]')
    const textLeft = content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft) * content.currentCSSZoom
    const first = node.querySelector('[data-slot="timeline-bar"]')
    const ink = first.getBoundingClientRect()
    const style = getComputedStyle(first)
    return {
      leftInset: rect.left - frame.left,
      lineInset: ink.left - frame.left,
      centerOffset: (rect.top + rect.bottom - frame.top - frame.bottom) / 2,
      width: rect.width,
      textInset: textLeft - frame.left,
      strokeWidth: ink.width,
      thickness: ink.height,
      transition: style.transitionProperty,
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
    }
  })
}

export async function verifyThreadTimeline({ page, expect, projectChat, screenshot }) {
  await projectChat('Фокус').first().click()
  const surface = page.locator(chat).filter({ has: page.getByText('Вкладка 1, запрос 24.', { exact: true }) })
  const rail = surface.locator(timeline)
  const prompt = index => `Вкладка 1, запрос ${index}.`
  const mark = index => rail.getByRole('button', { name: prompt(index), exact: true })
  const first = mark(20)
  const second = mark(21)
  const firstBar = first.locator(bar)
  const tip = index => page.locator(tooltip).filter({ hasText: prompt(index) })
  const viewport = surface.locator('[data-slot="aui_thread-viewport"]')
  const away = () => page.mouse.move(2, 2)
  const lengths = () => rail.locator(bar).evaluateAll(nodes => nodes.map(node =>
    Math.round(node.getBoundingClientRect().width * 10) / 10))

  await expect(rail.locator('button[data-timeline-id]')).toHaveCount(5)
  if (await viewport.getAttribute('data-following') === 'false') {
    await surface.getByRole('button', { name: /^(Прокрутить вниз|Scroll to bottom)/ }).click()
    await expect(viewport).toHaveAttribute('data-following', 'true')
  }
  await expect(mark(24)).toHaveAttribute('aria-current', 'location')
  await away()
  const idle = await geometry(rail)
  assert(Math.abs(idle.leftInset - 10) <= 1 && Math.abs(idle.lineInset - 16) <= 1, JSON.stringify(idle))
  assert(Math.abs(idle.centerOffset) < 1 && idle.width === 48 && idle.thickness === 1, JSON.stringify(idle))
  assert.equal(idle.transition, 'width')
  assert.equal(idle.duration, '0.18s')
  assert.equal(idle.easing, 'cubic-bezier(0.2, 0.8, 0.2, 1)')
  assert.deepEqual(await lengths(), [8, 8, 8, 8, 8])
  await screenshot('thread-timeline-idle.png')

  async function hover(index) {
    await mark(index).hover()
    const card = tip(index)
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-hcv-timeline-tip', '')
    const [pane, button, ink, box] = await Promise.all([
      surface.boundingBox(), mark(index).boundingBox(), mark(index).locator(bar).boundingBox(), card.boundingBox(),
    ])
    assert(pane && button && ink && box)
    const gap = box.x - ink.x - ink.width
    const centerOffset = box.y + box.height / 2 - button.y - button.height / 2
    assert(gap >= 8 && gap <= 19 && box.x + box.width <= pane.x + pane.width, JSON.stringify({ gap, pane, box }))
    assert(Math.abs(centerOffset) < 2, JSON.stringify({ centerOffset, button, box }))
    const style = await card.evaluate(node => {
      const style = getComputedStyle(node)
      return { font: style.fontSize, alignment: style.textAlign, animation: style.animationName, radius: style.borderRadius }
    })
    assert.equal(style.alignment, 'right')
    assert.equal(style.animation, 'none')
    return { gap, centerOffset, width: box.width, height: box.height, style }
  }

  await firstBar.evaluate(node => {
    node.addEventListener('transitionrun', event => {
      node.dataset.testTransition = event.propertyName
    }, { once: true })
  })
  const firstHover = await hover(20)
  await expect(firstBar).toHaveAttribute('data-test-transition', 'width')
  await expect.poll(lengths).toEqual([16, 13.6, 11.2, 9.6, 8])
  const firstLengths = await lengths()
  await expect(mark(24)).toHaveAttribute('aria-current', 'location')
  const extended = await geometry(rail)
  assert.equal(extended.strokeWidth, 16)
  assert.equal(extended.lineInset, idle.lineInset)
  await screenshot('thread-timeline-hover.png', { animations: 'allow' })
  const secondHover = await hover(21)
  await expect(tip(20)).toBeHidden()
  await expect.poll(lengths).toEqual([13.6, 16, 13.6, 11.2, 9.6])
  const secondLengths = await lengths()
  await away()
  await expect(tip(21)).toBeHidden()
  await expect.poll(lengths).toEqual([8, 8, 8, 8, 8])

  const initialScroll = await viewport.evaluate(node => node.scrollTop)
  await first.click()
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeLessThan(initialScroll - 70)
  await expect(first).toHaveAttribute('aria-current', 'location')
  await away()
  await first.focus()
  await page.keyboard.press('Tab')
  await expect(second).toBeFocused()
  await expect.poll(lengths).toEqual([8, 16, 8, 8, 8])
  await second.press('Enter')
  await expect(second).toHaveAttribute('aria-current', 'location')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1040, height: 790 })
  await away()
  const narrow = await geometry(rail)
  assert(narrow.leftInset >= 0 && narrow.leftInset + narrow.width <= narrow.textInset + 1, JSON.stringify(narrow))
  assert.equal(narrow.transition, 'none')
  const narrowHover = await hover(21)
  await screenshot('thread-timeline-narrow.png', { animations: 'allow' })
  await away()
  await page.setViewportSize({ width: 1440, height: 920 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const tab = page.locator('[data-zone-tabstrip="grp-main"]').getByRole('tab').filter({ hasText: /^Фокус$/ })
  await tab.hover()
  await tab.locator(':scope > span > button').click()
  await expect(rail).toBeHidden()
  await expect(tip(21)).toBeHidden()
  return { idle, firstHover, secondHover, firstLengths, secondLengths, extended, narrow, narrowHover,
    jumpedByMouse: true, jumpedByKeyboard: true }
}
