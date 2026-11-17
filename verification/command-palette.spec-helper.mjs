import assert from 'node:assert/strict'

function waitForPaint(page) {
  return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function measureHover(page, rows) {
  const points = await Promise.all(rows.map(async row => {
    const box = await row.boundingBox()
    assert(box, 'Expected a visible command')
    return [box.x + 24, box.y + box.height / 2]
  }))
  const cdp = await page.context().newCDPSession(page)
  const totals = async () => Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
  )
  try {
    await cdp.send('Performance.enable')
    const samples = []
    for (let run = 0; run < 3; run++) {
      const start = await totals()
      for (let pass = 0; pass < 8; pass++) {
        for (const point of points) {
          await page.mouse.move(...point)
          await waitForPaint(page)
        }
      }
      const end = await totals()
      samples.push(Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration']
        .map(name => [name + 'Ms', Math.round((end[name] - start[name]) * 1000)])))
    }
    return samples
  } finally {
    await cdp.detach()
  }
}

function paletteStyles(dialog) {
  const input = dialog.querySelector('[data-slot="command-input"]')
  const list = dialog.querySelector('[data-slot="command-list"]')
  const row = list.querySelector('[data-slot="command-item"]')
  const icon = row.firstElementChild
  const view = getComputedStyle(dialog)
  const item = getComputedStyle(row)
  return {
    width: dialog.getBoundingClientRect().width,
    radius: view.borderRadius,
    background: view.backgroundColor,
    animation: view.animationName,
    duration: view.animationDuration,
    inputHeight: input.parentElement.getBoundingClientRect().height,
    rowHeight: row.getBoundingClientRect().height,
    rowTransition: item.transitionDuration,
    iconSize: icon.getBoundingClientRect().width,
    iconMask: getComputedStyle(icon).maskImage !== 'none',
    visibleShortcuts: [...dialog.querySelectorAll('kbd')].filter(key => key.getClientRects().length).length,
  }
}

export async function verifyCommandPalette({
  page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, before,
}) {
  const dialog = page.getByRole('dialog').filter({ has: page.locator('[data-slot="command-input"]') })
  const input = dialog.locator('[data-slot="command-input"]')
  const list = dialog.locator('[data-slot="command-list"]')
  const selected = list.locator('[data-slot="command-item"][aria-selected="true"]')
  const command = text => list.getByRole('option').filter({ hasText: text }).first()
  const settings = command(/^Настройки|^Settings/)
  const capabilities = command(/^Возможности|^Capabilities/)
  const newChat = command(/^Новый (сеанс|чат)|^New (Session|Chat)/i)
  const open = async () => {
    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await expect(selected).toBeVisible()
  }
  await page.bringToFront()
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' })
  await page.mouse.move(1300, 190)
  await open()
  await dialog.evaluate(node => Promise.allSettled(node.getAnimations().map(animation => animation.finished)))
  const palette = await dialog.evaluate(paletteStyles)
  await screenshot('command-palette.png', { animations: 'allow' })
  await input.hover()
  await settings.hover()
  await expect(settings).toHaveAttribute('aria-selected', 'true')
  const hovering = await measureHover(page, [settings, newChat, capabilities])
  await expect(capabilities).toHaveAttribute('aria-selected', 'true')
  await expect(input).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(capabilities).toHaveAttribute('aria-selected', 'false')
  await expect(selected).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.mouse.move(1300, 190)
  await open()
  await input.fill('Проверка каталога')
  const result = command(/Проверка каталога/)
  await expect(result).toBeVisible()
  await input.press('ArrowDown')
  await expect(result).toHaveAttribute('aria-selected', 'true')
  await input.press('Enter')
  await expect(dialog).toHaveCount(0)
  const side = page.locator('[data-tour="sessions-sidebar"]').first()
  const project = side.getByRole('button', { name: 'Тестовый проект', exact: true })
  if (await project.getAttribute('aria-expanded') === 'false') await project.click()
  const projectRow = project.locator('xpath=ancestor::*[@data-hcv-project-row][1]')
  const session = projectChat('Проверка каталога').first()
  await expect(session).toBeVisible()
  const sessionRow = session.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " row-hover ")][1]')
  const child = projectRow.locator('xpath=..').locator('.row-hover:visible').first()
  const childBox = await child.boundingBox()
  const projectBox = await projectRow.boundingBox()
  assert(childBox && projectBox, 'Expected visible project and chat rows')
  const gap = childBox.y - (projectBox.y + projectBox.height)
  await project.hover()
  await expect(projectRow).toHaveCSS('background-color', 'rgb(41, 41, 41)')
  const sidebar = {
    gap,
    parentBackground: await projectRow.evaluate(el => getComputedStyle(el).backgroundColor),
    chatBackground: await sessionRow.evaluate(el => getComputedStyle(el).backgroundColor),
  }
  const sideBox = await side.boundingBox()
  await screenshot('project-hover.png', { clip: sideBox, animations: 'allow' })

  if (!before) {
    assert.equal(palette.visibleShortcuts, 0, 'Keycaps must be hidden in the palette')
    assert(palette.iconMask, 'Expected the Codex icon on the first command')
    assert.equal(palette.iconSize, 16)
    assert.equal(palette.rowHeight, 36)
    assert.equal(palette.animation, 'hcv-palette-in')
    assert.equal(palette.duration, '0.15s')
    assert.equal(palette.rowTransition, '0s', 'Hover should not ease into the highlight')
    assert(gap >= 1 && gap <= 2, 'The first chat and its project must have a visible gap')
    assert.notEqual(sidebar.chatBackground, 'rgba(0, 0, 0, 0)', 'The active chat stays highlighted')

    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await page.setViewportSize({ width: 720, height: 500 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await open()
    await expect(dialog).toHaveCSS('animation-name', 'none')
    assert(await dialog.evaluate(el => {
      const box = el.getBoundingClientRect()
      return box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight
    }), 'Search must fit the compact window')
    await screenshot('command-palette-light.png')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.setViewportSize({ width: 1440, height: 920 })
    await openThemeSettings()
    await themeCard('Nous').click()
    await closeSettings()
    await open()
    await expect(dialog.locator('kbd:visible').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
  return { palette, sidebar, hovering }
}
