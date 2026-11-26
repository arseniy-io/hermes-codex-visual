const noFill = 'rgba(0, 0, 0, 0)'
const darkHover = 'rgba(255, 255, 255, 0.08)'

async function styleOf(locator) {
  return locator.evaluate(node => {
    const style = getComputedStyle(node)
    const { width, height } = node.getBoundingClientRect()
    return {
      width, height, radius: style.borderTopLeftRadius, background: style.backgroundColor,
      corner: style.cornerShape, motion: style.transitionDuration, easing: style.transitionTimingFunction,
    }
  })
}

export async function verifyControlHover({ page, expect, screenshot, search, bell, toggle, composer, input, model }) {
  const activity = page.locator('[data-hcv-activity-button]:visible').first()
  const titlebar = page.locator('[data-titlebar-cluster="right"] [data-size="icon-titlebar"]:visible').first()
  const rightPanel = page.locator('[data-tour="right-pane-toggle"]:visible').first()
  const mic = composer.locator('[data-slot="fan-menu-anchor"] button, button:has(> .codicon-mic)').first()
  const send = composer.locator('button[type="submit"]')
  const searchField = page.locator('[data-hcv-search-field] input')
  const fallback = page.locator('[data-hcv-title-tip]:popover-open')
  const moveAway = () => page.mouse.move(650, 160)
  const results = {}
  const compareRound = async (name, button, { size, initial = noFill, hover = darkHover, motion } = {}) => {
    const idle = await styleOf(button)
    if (initial != null) expect(idle.background, name).toBe(initial)
    expect(idle.radius, name).toMatch(/^(?:999px|50%)$/)
    expect(idle.corner, name).toMatch(/^(?:round|superellipse\(1\))$/)
    expect(idle.width).toBe(idle.height)
    if (size) expect(idle.width).toBeCloseTo(size, 0)
    if (motion) expect(idle.motion).toBe(motion)
    await button.hover()
    if (hover != null) await expect(button).toHaveCSS('background-color', hover)
    results[name] = { idle, hover: await styleOf(button) }
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await moveAway()
  await page.waitForTimeout(310) // Let any previous tooltip leave its warm window.
  await page.evaluate(() => {
    const entries = []
    let entered
    const start = event => {
      const anchor = event.target.closest?.('[data-hcv-search-toggle], [data-hcv-notifications]')
      if (anchor && !anchor.contains(event.relatedTarget)) {
        const name = anchor.getAttribute('aria-label')
        entered = { name, time: performance.now() }
      }
    }
    window.addEventListener('pointerover', start, true)
    const observer = new MutationObserver(() => {
      if (entered && document.querySelector('[data-hcv-title-tip]:popover-open')) {
        entries.push({ name: entered.name, milliseconds: performance.now() - entered.time })
        entered = null
      }
    })
    observer.observe(document.body, { childList: true })
    window.__hcvHoverRead = () => {
      window.removeEventListener('pointerover', start, true)
      observer.disconnect()
      delete window.__hcvHoverRead
      return entries
    }
  })

  await compareRound('search', search, { size: 28, motion: '0.15s, 0.15s' })
  await expect(fallback.locator('kbd')).toHaveText('Ctrl+Shift+F')
  await expect(fallback).toHaveCSS('animation-name', 'none')
  const searchBox = await search.boundingBox()
  const tipBox = await fallback.boundingBox()
  expect(tipBox.y - searchBox.y - searchBox.height).toBeCloseTo(2, 0)
  await screenshot('hover-search.png')
  await compareRound('notifications', bell, { size: 28 })
  await expect(fallback).toHaveText('Уведомления')

  const timing = await page.evaluate(() => window.__hcvHoverRead())
  expect(timing.map(item => item.name)).toEqual(['Поиск чатов', 'Уведомления'])
  expect(timing[0].milliseconds).toBeGreaterThanOrEqual(135)
  expect(timing[1].milliseconds).toBeLessThan(100)
  results.titleTiming = timing
  await page.keyboard.press('Escape')
  await expect(fallback).toHaveCount(0)
  await moveAway()
  await expect(search).toHaveCSS('background-color', noFill)
  await compareRound('activity', activity, { size: 28 })

  await moveAway()
  await bell.focus()
  await page.keyboard.press('Tab')
  await expect(search).toBeFocused()
  await expect(search).toHaveCSS('outline-width', '2px')
  await expect(fallback.locator('kbd')).toHaveText('Ctrl+Shift+F')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+F')
  await expect(searchField).toBeFocused()
  await expect(search).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(searchField).toBeHidden()
  await expect(search).toBeFocused()

  await compareRound('titlebar', titlebar, { size: 28, initial: null, motion: '0s' })
  await moveAway()
  const openPanel = await rightPanel.evaluate(node => Boolean(node.closest('[data-hcv-right-open]')))
  await compareRound('rightPanel', rightPanel, { size: 28, initial: null, hover: openPanel ? null : darkHover, motion: '0s' })
  if (openPanel) {
    expect(results.rightPanel.idle.background).toMatch(/\/ 0\.05\)$/)
    expect(results.rightPanel.hover.background).toMatch(/\/ 0\.1\)$/)
  }
  await moveAway()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await moveAway()
  await compareRound('summary', toggle, { size: 28, motion: '0s' })
  await expect(page.locator('[data-slot="tooltip-content"]:visible').filter({ hasText: 'Показать сводку' })).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await moveAway()
  await expect(toggle).toHaveCSS('background-color', noFill)
  await toggle.hover()
  await expect(toggle).toHaveCSS('background-color', darkHover)
  results.summary.openHover = await styleOf(toggle)
  await moveAway()
  await expect(toggle).toHaveCSS('background-color', noFill)
  results.summary.openRest = await styleOf(toggle)
  await screenshot('hover-titlebar.png')

  await compareRound('microphone', mic)
  await moveAway()
  const modelRest = await styleOf(model)
  await model.hover()
  await expect(model).toHaveCSS('background-color', darkHover)
  const modelHover = await styleOf(model)
  expect(modelHover.radius).not.toBe('0px')
  expect(modelHover.width).toBeGreaterThan(modelHover.height)
  results.model = { idle: modelRest, hover: modelHover }
  await moveAway()

  const emptyComposer = await send.count() === 0 ? 'voice' : 'disabled'
  if (emptyComposer === 'disabled') await expect(send).toBeDisabled()
  await input.fill('Проверка кнопки отправки')
  await expect(send).toBeEnabled()
  const ready = await styleOf(send)
  await compareRound('send', send, { initial: ready.background, hover: ready.background, motion: '0s' })
  await expect(page.locator('[data-slot="tooltip-content"]:visible').filter({ hasText: 'Отправить' })).toBeVisible()
  await screenshot('hover-send.png')
  await moveAway()
  await input.fill('')
  results.send.emptyComposer = emptyComposer
  return results
}
