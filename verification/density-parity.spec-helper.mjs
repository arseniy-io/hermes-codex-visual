import assert from 'node:assert/strict'

export async function verifyDensityParity({ page, expect, screenshot, projectChat, navigation }) {
  const before = process.env.HERMES_VISUAL_AUDIT_BASELINE === '1'
  const workspace = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const surface = workspace.locator('[data-slot="composer-surface"]')
  const chat = projectChat('Ревью интерфейса')
  const folder = page.locator('[data-hcv-project-name]').filter({ hasText: 'Тестовый проект' })
  const setZoom = async percent => {
    await page.evaluate(value => window.hermesDesktop.zoom.setPercent(value), percent)
    await expect.poll(() => page.evaluate(async () => (await window.hermesDesktop.zoom.get()).percent)).toBe(percent)
  }
  const metrics = locator => locator.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      width: rect.width, height: rect.height, font: style.fontSize, line: style.lineHeight,
      radius: style.borderRadius, background: style.backgroundColor, blur: style.backdropFilter,
      scale: devicePixelRatio,
    }
  })

  await page.clock.setFixedTime(new Date('2026-11-12T17:30:10+03:00'))
  await expect(surface).toBeVisible()
  await setZoom(102)
  const composer102 = await metrics(surface)
  await screenshot('density-102.png')
  await setZoom(90)
  const composer90 = await metrics(surface)
  assert(Math.abs(composer90.width - 736) < 0.5, JSON.stringify(composer90))
  assert(Math.abs(composer90.height - 98) < 0.5, JSON.stringify(composer90))
  assert(composer90.scale < composer102.scale)
  const wordmark = workspace.locator('[data-slot="aui_intro"] .wordmark > :not([aria-hidden]) > span')
  if (!before) {
    await expect(wordmark).toBeVisible()
    assert(parseFloat((await metrics(wordmark)).font) >= 44)
  }
  await screenshot('density-90.png')

  const model = surface.locator('[data-tour="model-pill"]')
  await model.click()
  const catalog = page.locator('[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):visible')
  const variant = catalog.locator('[data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: 'Mock Variant' })
  await expect(variant).toBeVisible()
  await variant.hover()
  const options = page.locator('[data-slot="dropdown-menu-sub-content"]:visible')
  await expect(options).toBeVisible()
  const modelMenu = await metrics(catalog)
  const modelOptions = await metrics(options)
  if (!before) {
    for (const menu of [catalog, options]) {
      await expect(menu).toHaveCSS('background-color', 'rgb(45, 45, 45)')
      await expect(menu).toHaveCSS('backdrop-filter', 'none')
    }
  }
  await screenshot('model-menu.png')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)

  await folder.hover()
  const project = page.locator('[data-hcv-project-preview]:visible')
  await expect(project).toBeVisible()
  const projectCard = await metrics(project)
  assert.equal(Math.round(projectCard.width), 336)
  await screenshot('project-preview.png')
  await page.keyboard.press('Escape')
  await expect(project).toHaveCount(0)

  if (!(await chat.isVisible())) await folder.click()
  await chat.hover()
  const preview = page.locator('[data-hcv-chat-preview]:visible')
  let chatCard = null
  if (before) {
    await expect(preview).toHaveCount(0)
  } else {
    await expect(preview).toBeVisible()
    await expect(preview.locator('[data-hcv-chat-preview-title]')).toHaveText('Ревью интерфейса')
    assert.equal(Math.round((await metrics(preview.getByRole('img', { name: 'Этот компьютер' }))).width), 14)
    await expect(preview.locator('time')).toHaveText('46м')
    await expect(preview.locator('[data-hcv-chat-preview-project]')).toHaveText('Тестовый проект')
    chatCard = await metrics(preview)
    assert.equal(Math.round(chatCard.width), 320)
  }
  await screenshot('chat-preview.png')
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await chat.click()
  await expect(workspace.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()

  const nav = navigation('capabilities')
  const navRow = await metrics(nav)
  if (!before) assert.equal(Math.round(navRow.height), 30)
  await page.setViewportSize({ width: 810, height: 700 })
  await expect(surface).toBeVisible()
  await expect(surface.locator('[data-slot="composer-rich-input"]')).toBeEditable()
  const narrow = await metrics(surface)
  assert(narrow.width < composer90.width)
  await screenshot('narrow.png')

  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.locator('[data-hcv-chat-preview]')).toHaveCount(0)
  console.log('Density metrics', JSON.stringify({ composer102, composer90, modelMenu, modelOptions, projectCard, chatCard, navRow, narrow }))
}
