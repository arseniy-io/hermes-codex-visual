import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const referenceMaskSha256 = '4227bd4ae6a770a45290610f5aeb85032510680c8a8c41a4c81480f339ce676a'

export async function verifyScrollJump({ page, expect, screenshot, baseline = false }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const button = chat.locator('[data-slot="composer-bounds"] > button.thread-jump-button')
  const label = /^(Прокрутить вниз|Scroll to bottom)/
  const count = button.locator(':scope > span')
  const moveUp = async () => {
    await viewport.hover({ position: { x: 80, y: 160 } })
    await page.mouse.wheel(0, -1250)
    await expect(viewport).toHaveAttribute('data-following', 'false')
    await expect(button).toHaveAttribute('aria-hidden', 'false')
    await expect(button).toHaveAccessibleName(label)
    await expect(button).toHaveAttribute('tabindex', '0')
    await expect(button).toHaveCSS('opacity', '1')
    await expect(count).toContainText(/\d/)
  }
  const atBottom = async (stage) => {
    await expect(viewport, stage).toHaveAttribute('data-following', 'true', { timeout: 10000 })
    await expect(button).toHaveAttribute('aria-hidden', 'true')
    await expect(button).toHaveAttribute('tabindex', '-1')
    await expect(button).toHaveCSS('opacity', '0')
    await expect(chat.getByRole('button', { name: label })).toHaveCount(0)
    await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(2)
  }
  const measure = () => button.evaluate(node => {
    const icon = node.querySelector('.codicon-arrow-down')
    const chat = node.closest('[data-chat-surface]')
    const buttonBox = node.getBoundingClientRect()
    const iconBox = icon.getBoundingClientRect()
    const dockBox = chat.querySelector('[data-slot="composer-dock"]').getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      buttonWidth: buttonBox.width, buttonHeight: buttonBox.height,
      iconWidth: iconBox.width, iconHeight: iconBox.height,
      centerDelta: (buttonBox.left + buttonBox.width / 2) - (dockBox.left + dockBox.width / 2),
      dockGap: dockBox.top - buttonBox.bottom,
      radius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
      foreground: style.color,
      shadow: style.boxShadow,
      animation: style.animationName,
      transition: style.transitionProperty,
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
      label: node.getAttribute('aria-label'),
      countDisplay: getComputedStyle(node.querySelector(':scope > span')).display,
      iconMask: getComputedStyle(icon).maskImage,
    }
  })

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await atBottom('Start at the end of the transcript')
  await moveUp()
  const normal = await measure()
  if (baseline) {
    await expect(count).toBeVisible()
    assert(normal.buttonWidth > normal.buttonHeight)
  } else {
    await expect(count).toBeHidden()
    assert(Math.abs(normal.buttonWidth - 2 * normal.rem) < 1, JSON.stringify(normal))
    assert(Math.abs(normal.buttonHeight - 2 * normal.rem) < 1, JSON.stringify(normal))
    assert(Math.abs(normal.centerDelta) < 1, JSON.stringify(normal))
    assert(Math.abs(normal.dockGap - 1.5 * normal.rem) <= 1, JSON.stringify(normal))
    assert.equal(normal.iconWidth, 20)
    assert.equal(normal.iconHeight, 20)
    assert.equal(normal.radius, '50%')
    assert.equal(normal.borderWidth, '1px')
    assert.equal(normal.background, 'rgb(24, 24, 24)')
    assert.equal(normal.foreground, 'rgb(223, 223, 223)')
    assert.equal(normal.animation, 'none')
    assert.equal(normal.transition, 'opacity')
    assert.equal(normal.duration, '0.12s')
    assert.equal(normal.easing, 'cubic-bezier(0, 0, 0.2, 1)')
    const encodedMask = normal.iconMask.match(/^url\("data:image\/svg\+xml,([^"]+)"\)$/)?.[1]
    assert(encodedMask, normal.iconMask)
    assert.equal(createHash('sha256').update(decodeURIComponent(encodedMask)).digest('hex'), referenceMaskSha256)
  }
  await screenshot(baseline ? 'scroll-jump-before.png' : 'scroll-jump.png', { animations: 'allow' })
  await button.click()
  await atBottom('A mouse click returns to the end')
  if (!baseline) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await moveUp()
    await expect(button).toHaveCSS('transition-property', 'none')
    // A physical Tab switches the floating composer to keyboard navigation.
    await page.keyboard.down('Tab')
    await button.focus()
    await page.keyboard.up('Tab')
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    await atBottom('The Enter key returns to the end')
  }
  const { iconMask, ...metrics } = normal
  return metrics
}
