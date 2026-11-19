import assert from 'node:assert/strict'

export async function verifyZoomBanner({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard, togglePlugin }) {
  const root = page.locator('html')
  const banner = page.locator('[data-hcv-zoom-banner]')
  const value = banner.locator('[data-hcv-zoom-value]')
  const minus = banner.locator('[data-hcv-zoom-step="out"]')
  const plus = banner.locator('[data-hcv-zoom-step="in"]')
  const reset = banner.locator('[data-hcv-zoom-reset]')
  const current = () => page.evaluate(async () => (await window.hermesDesktop.zoom.get()).percent)
  const set = percent => page.evaluate(value => window.hermesDesktop.zoom.setPercent(value), percent)
  const expectZoom = percent => expect.poll(current, { timeout: 5000 }).toBe(percent)
  const resize = async (width, height) => {
    const size = await app.evaluate(({ BrowserWindow }, requested) => {
      const win = BrowserWindow.getAllWindows().find(item => item.isVisible() && !item.isDestroyed())
      if (!win) throw new Error('No visible test window to resize')
      win.setContentSize(requested.width, requested.height)
      const bounds = win.getContentBounds()
      return { width: bounds.width, height: bounds.height }
    }, { width, height })
    await page.setViewportSize(size)
    return size
  }
  const inputMethods = []
  const shortcut = async key => {
    const before = await current()
    await page.keyboard.press(`Control+${key}`)
    await page.waitForTimeout(300)
    if (await current() !== before) return inputMethods.push('playwright')
    await app.evaluate(({ BrowserWindow }, inputKey) => {
      const win = BrowserWindow.getAllWindows().find(item => item.isVisible() && !item.isDestroyed())
      if (!win) throw new Error('No visible test window for Electron input')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: inputKey, modifiers: ['control'] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: inputKey, modifiers: ['control'] })
    }, key)
    await page.waitForTimeout(300)
    if (await current() !== before) return inputMethods.push('electron-input')
    // CDP key injection does not always traverse Electron's before-input-event.
    // Exercise the actual registered main-process handler with a named key event.
    await app.evaluate(({ BrowserWindow }, inputKey) => {
      const win = BrowserWindow.getAllWindows().find(item => item.isVisible() && !item.isDestroyed())
      if (!win) throw new Error('No visible test window for Electron shortcut handler')
      win.webContents.emit('before-input-event', { preventDefault() {} }, {
        type: 'keyDown', key: inputKey, control: true, shift: false, alt: false, meta: false,
      })
    }, key)
    inputMethods.push('main-handler-simulation')
  }

  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' })
  const normalSize = await resize(1000, 800)
  await set(100)
  await expectZoom(100)
  await page.mouse.move(10, 300)
  await expect(banner).toHaveCount(0, { timeout: 4000 })

  await shortcut('-')
  await expectZoom(98)
  await expect(value).toHaveText('98%')
  await expect(reset).toBeEnabled()
  const geometry = await banner.evaluate(node => {
    const style = getComputedStyle(node)
    const text = getComputedStyle(node.querySelector('[data-hcv-zoom-value]'))
    const button = getComputedStyle(node.querySelector('[data-hcv-zoom-step]'))
    const icon = getComputedStyle(node.querySelector('[data-hcv-zoom-step]'), '::before')
    const layer = node.parentElement
    const overlay = navigator.windowControlsOverlay
    const rect = overlay?.visible ? overlay.getTitlebarAreaRect() : null
    return {
      height: style.height, radius: style.borderRadius, padding: style.padding,
      background: style.backgroundColor, border: style.borderTopWidth,
      font: text.fontFamily, fontSize: text.fontSize, weight: text.fontWeight,
      lineHeight: text.lineHeight, valueWidth: text.width,
      buttonHeight: button.height, buttonWidth: button.width,
      iconWidth: icon.width, iconHeight: icon.height, iconMask: icon.maskImage !== 'none',
      top: getComputedStyle(layer).top, right: getComputedStyle(layer).right,
      overlayRight: rect?.width ? Math.max(0, Math.round(window.innerWidth - rect.right)) : 0,
    }
  })
  console.log('Zoom banner geometry', JSON.stringify(geometry), 'input', inputMethods[0])
  const near = (actual, expected) => assert(Math.abs(parseFloat(actual) - expected) < .1, `${actual} should be near ${expected}px`)
  near(geometry.height, 44)
  assert.equal(geometry.radius, '20px')
  near(geometry.fontSize, 13)
  assert.equal(geometry.weight, '600')
  near(geometry.valueWidth, 48)
  near(geometry.buttonHeight, 28)
  near(geometry.buttonWidth, 28)
  near(geometry.iconWidth, 16)
  near(geometry.iconHeight, 16)
  assert.equal(geometry.iconMask, true)
  near(geometry.top, 8)
  near(geometry.right, geometry.overlayRight + 16)

  await banner.hover()
  await page.waitForTimeout(2200)
  await expect(banner).toBeVisible()
  await minus.click()
  await expectZoom(88)
  await expect(value).toHaveText('88%')
  await plus.click()
  await expectZoom(98)
  await expect(value).toHaveText('98%')
  await reset.click()
  await expectZoom(100)
  await expect(value).toHaveText('100%')
  await expect(reset).toBeDisabled()
  await minus.click()
  await expectZoom(90)
  await expect(value).toHaveText('90%')
  await screenshot('zoom-banner-dark.png')

  await page.mouse.move(10, 300)
  await expect(banner).toHaveCount(0, { timeout: 4000 })
  await shortcut('0')
  await expectZoom(100)
  await expect(value).toHaveText('100%')
  await expect(reset).toBeDisabled()

  const narrowSize = await resize(420, 700)
  await shortcut('-')
  await expectZoom(98)
  await expect(banner).toBeVisible()
  const fits = await banner.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= window.innerWidth
  })
  assert(fits, 'The zoom controls should fit in the narrow test window')
  await screenshot('zoom-banner-narrow.png')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(banner).toHaveCSS('animation-name', 'none')
  await resize(normalSize.width, normalSize.height)
  await page.mouse.move(10, 300)
  await expect(banner).toHaveCount(0, { timeout: 4000 })

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(root).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await shortcut('-')
  await expect(banner).toBeVisible()
  await screenshot('zoom-banner-light.png')

  await openThemeSettings()
  await themeCard('Nous').click()
  await expect(root).toHaveAttribute('data-hermes-theme', 'nous')
  await closeSettings()
  await expect(banner).toHaveCount(0)
  const beforeNative = await current()
  await shortcut('-')
  await expect.poll(current).toBeLessThan(beforeNative)
  await expect(banner).toHaveCount(0)
  await togglePlugin(false)
  await expect(page.locator('style[data-hcv-zoom-styles]')).toHaveCount(0)
  await shortcut('0')
  await expectZoom(100)
  await expect(banner).toHaveCount(0)
  return { geometry, inputMethods, keyboardStep: '100 → 98', buttons: '98 → 88 → 98 → 100 → 90', hoverMs: 2200,
    autoDismissMs: 2000, exitMs: 150, normalSize, narrowSize, themes: ['dark', 'light', 'nous'], reducedMotion: true }
}
