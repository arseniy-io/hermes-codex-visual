import assert from 'node:assert/strict'
import fs from 'node:fs'
import { codexMask } from '../source/codex-reference.js'

const overlay = '[data-overlay-surface]'
const raised = '[data-glass-raised]'
const pageShell = 'section.h-full.min-w-0.overflow-hidden:not([data-chat-surface])'
const menu = '[data-slot="dropdown-menu-content"]'
const tip = '[data-slot="tooltip-content"]'
const dialog = '[data-slot="dialog-content"]:has([data-slot="add-server-form"])'
const addConnectorButton = ':is([data-catalog-actions] > button, div:has(> h2) > button)'
const state = (node) => node.evaluate((el) => {
  const s = getComputedStyle(el)
  return {
    animation: s.animationName, duration: s.animationDuration, radius: s.borderTopLeftRadius,
    background: s.backgroundColor, opacity: s.opacity, origin: s.transformOrigin,
    transition: s.transitionDuration, outline: s.outlineStyle,
  }
})

async function expectMenuFocus(item, expect) {
  await expect(item).toBeFocused()
  await expect(item).toHaveCSS('outline-style', 'none')
  await expect(item).toHaveCSS('box-shadow', 'none')
  await expect(item).toHaveCSS('background-color', /^rgba\((255, 255, 255, 0\.0(?:78|8)|26, 28, 31, 0\.05\d*)\)$/)
  await expect.poll(() => item.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none')
}

export async function verifyModelMenu({ page, expect, screenshot }) {
  const picker = page.locator('[data-slot="composer-surface"]:visible [data-tour="model-pill"]')
  await picker.click()
  const catalog = page.locator(menu + ':has(> [data-slot="dropdown-menu-search"]):visible')
  await expect(catalog).toHaveCSS('padding-top', '4px')
  await expect(catalog).toHaveCSS('border-top-width', '0px')
  await expect(catalog).toHaveCSS('border-radius', /^(16|20)px$/)
  await expect(catalog).toHaveCSS('box-shadow', /0px 0px 0px 0\.5px, .* 0px 8px 16px -4px$/)
  const provider = catalog.locator('[class~="group/label"] > span.truncate').first()
  await expect(provider).toHaveCSS('text-transform', 'lowercase')
  await expect(provider).toHaveCSS('letter-spacing', 'normal')

  const row = catalog.locator('[data-slot="dropdown-menu-sub-trigger"]').filter({
    has: page.getByText('Mock Variant', { exact: true }),
  })
  const initialEffort = catalog.locator('[data-hcv-model-effort]').filter({ hasText: /^Med$/ }).first()
  await expect(initialEffort).toHaveCSS('display', 'none')
  await expect(row.getByText('Preview', { exact: true })).toBeVisible()
  await screenshot('model-menu.png', { clip: await catalog.boundingBox() })

  const search = catalog.getByRole('textbox', { name: 'Поиск моделей' })
  const searchRow = catalog.locator('[data-slot="dropdown-menu-search"]')
  await expect(searchRow).toHaveCSS('box-shadow', 'none')
  await expect(searchRow).toHaveCSS('padding', '5px 8px')
  await expect(search).toHaveCSS('font-size', '13px')
  assert.match(await searchRow.evaluate(el => getComputedStyle(el, '::before').maskImage), /^url\(/)
  await search.fill('mock-variant')
  await expect(row).toBeVisible()
  await row.hover()
  const options = page.locator('[data-slot="dropdown-menu-sub-content"]:visible')
  const maximum = options.getByRole('menuitemradio', { name: 'Максимум', exact: true })
  await maximum.press('Enter')
  await expect(maximum).toHaveAttribute('data-state', 'checked')
  const effort = row.locator('[data-hcv-model-effort]')
  await expect(effort).toHaveText('Max')
  await expect(effort).toHaveCSS('display', 'none')

  const high = options.getByRole('menuitemradio', { name: 'Высокое', exact: true })
  await high.hover()
  await expect(high).toBeFocused()
  if (process.env.HERMES_VISUAL_MENU_REFERENCE === '1') {
    await expect(high).toHaveCSS('outline-style', 'solid')
    await expect(high).toHaveCSS('outline-width', '2px')
    await screenshot('effort-before.png')
    return
  }
  await expectMenuFocus(high, expect)
  await expect(high).toHaveAttribute('aria-checked', 'false')
  await screenshot('effort-hover.png')
  await page.mouse.move(16, 90)
  await high.press('ArrowDown')
  const extraHigh = options.getByRole('menuitemradio', { name: 'Очень высокое', exact: true })
  await expectMenuFocus(extraHigh, expect)
  await expect(maximum).toHaveAttribute('aria-checked', 'true')
  await extraHigh.press('Enter')
  await expect(extraHigh).toHaveAttribute('aria-checked', 'true')
  await screenshot('effort-keyboard.png')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  const reasoning = page.getByTestId('reasoning-pill').filter({ visible: true })
  await reasoning.click()
  const reasoningMenu = page.locator(menu + ':visible').filter({ has: page.getByRole('menuitemradio') })
  const directHigh = reasoningMenu.getByRole('menuitemradio', { name: 'Высокое', exact: true })
  await directHigh.hover()
  await expectMenuFocus(directHigh, expect)
  await directHigh.press('Enter')
  await expect(directHigh).toHaveAttribute('aria-checked', 'true')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(directHigh).toHaveCSS('outline-style', 'solid')
  await page.emulateMedia({ forcedColors: 'none' })
  await page.keyboard.press('Escape')
  console.log('Verified model labels, hidden effort chips, hover and keyboard paint, native effort selection and forced colors')
}

export async function verifyCatalogControls({ page, expect, screenshot, navigation }) {
  await navigation('capabilities').click()
  const tabs = page.locator('[data-tour="page-tabs"]')
  const plugins = tabs.locator('[data-tour="tab-plugins"]')
  await plugins.click()
  await expect(plugins).toHaveAttribute('data-active', 'true')
  await expect(plugins.locator(':scope > span').first()).toHaveCSS('text-decoration-line', 'none')
  const skills = tabs.locator('[data-tour="tab-skills"]')
  const idleTab = (await state(skills)).background
  await skills.hover()
  await expect(skills.locator(':scope > span').first()).toHaveCSS('text-decoration-line', 'none')
  await expect.poll(async () => (await state(skills)).background).not.toBe(idleTab)

  const filters = page.locator('[data-catalog="plugins"] [data-tour="overlay-nav"] > button[aria-pressed]')
  const all = filters.filter({ hasText: /^(Все источники|All sources)$/i })
  const installed = filters.filter({ hasText: /^(Установленные|Installed)$/i })
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await installed.click()
  await expect(installed).toHaveAttribute('aria-pressed', 'true')
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  const next = installed.locator('xpath=following-sibling::*[1][self::button]')
  await expect(next).toHaveAttribute('aria-pressed', 'false')
  const idleRow = (await state(next)).background
  await next.hover()
  await expect.poll(async () => (await state(next)).background).not.toBe(idleRow)

  const gap = async (above, below) => {
    const [a, b] = await Promise.all([above.boundingBox(), below.boundingBox()])
    return Math.round(b.y - a.y - a.height)
  }
  await expect.poll(() => gap(all, installed)).toBe(4)
  await expect.poll(() => gap(installed, next)).toBe(4)
  await screenshot('plugins-filters.png')
  await installed.press('Space')
  await expect(installed).toHaveAttribute('aria-pressed', 'false')
  console.log(JSON.stringify({ tabUnderline: false, tabHover: true, filterGap: 4, adjacentChecked: true, keyboardToggle: true }))
}

export async function verifyPopupStyles({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const fixtureKey = 'hcv-popup-style-fixture'
  const showNotice = async () => {
    await page.evaluate(id => window.__HERMES_PLUGIN_SDK__.host.notify({
      id,
      kind: 'warning',
      title: 'Terminal commands are unavailable',
      message: "Hermes can't run shell commands right now: Docker / Podman isn't ready. Switch to Local, or finish setting up Docker / Podman and try again.",
      detail: 'Docker / Podman is unavailable in this fixture.',
      action: { label: 'Open terminal settings', onClick: () => {} },
      secondaryAction: { label: 'Use Local', onClick: () => {} },
    }), fixtureKey)
    const notice = page.locator(`[data-stack-key="${fixtureKey}"] [data-slot="card-stack-surface"]`)
    await expect(notice).toBeVisible()
    return notice
  }
  const dismiss = async notice => {
    await notice.locator('[data-slot="alert"] > button[aria-label]').click()
    await expect(notice).toHaveCount(0)
  }

  const notice = await showNotice()
  await expect(notice).toHaveCSS('border-radius', '20px')
  const title = notice.locator('[data-slot="alert-title"]')
  await expect(title).toHaveCSS('font-family', /Segoe UI/)
  await expect(title).toHaveCSS('font-weight', '600')
  await expect(notice.locator('[data-slot="alert-description"]')).toHaveCSS('font-size', '13px')
  const action = notice.getByRole('button', { name: 'Use Local' })
  await expect(action).toHaveCSS('border-radius', '10px')
  const idle = (await state(action)).background
  await action.hover()
  await expect.poll(async () => (await state(action)).background).not.toBe(idle)
  await notice.locator('summary').click()
  await expect(notice.locator('details')).toHaveAttribute('open', '')
  await notice.locator('summary').click()
  await screenshot('popup-terminal-warning.png')
  await dismiss(notice)

  await page.locator('[data-hcv-menu-button]').filter({ hasText: /^Правка$/ }).click()
  const windowMenu = page.locator('[data-hcv-window-menu-content][data-state="open"]')
  await expect(windowMenu).toHaveCSS('border-radius', /^(6|7\.5)px$/)
  const item = windowMenu.getByRole('menuitem', { name: 'Отменить ввод' })
  await item.hover()
  await expect(item).toHaveCSS('background-color', /^rgba\(255, 255, 255, 0\.0(?:78|8)\)$/)
  await screenshot('popup-window-menu.png')
  await item.press('ArrowDown')
  await expect(windowMenu.getByRole('menuitem', { name: 'Повторить ввод' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(windowMenu).toHaveCount(0)
  await page.mouse.move(700, 200)

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').filter({ has: page.locator('[data-slot="command-input"]') })
  const selectedCommand = palette.locator('[data-slot="command-item"][data-selected="true"]')
  const idleCommand = palette.locator('[data-slot="command-item"][data-selected="false"]:visible').first()
  await expect(selectedCommand).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(palette.locator('[data-slot="command-input"]')).toBeFocused()
  await expect(selectedCommand).toHaveCSS('outline-style', 'none')
  await expect.poll(async () => (await state(selectedCommand)).background).not.toBe((await state(idleCommand)).background)
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)

  await page.evaluate(() => { location.hash = '#/capabilities?tab=connectors' })
  const addConnector = page.locator(`[data-slot="connectors-directory"] ${addConnectorButton}`).first()
  await addConnector.click()
  const form = page.locator(dialog)
  await expect(form).toHaveCSS('border-radius', '24px')
  await expect(form.locator('[data-slot="dialog-close-button"]')).toHaveCSS('border-radius', '10px')
  const editJson = form.getByRole('button', { name: 'Edit mcp.json', exact: true })
  await expect(editJson).toHaveCSS('border-radius', '10px')
  const idleJson = (await state(editJson)).background
  await editJson.hover()
  await expect.poll(async () => (await state(editJson)).background).not.toBe(idleJson)
  await screenshot('popup-connector-dialog.png')
  const formField = form.locator('input[data-slot="input"]:visible').first()
  await formField.press('Shift')
  await expect(formField).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)

  await openThemeSettings()
  await expect(page.locator('[data-overlay-surface]:visible > div > [data-glass-raised]').last()).toHaveCSS('border-radius', '24px')
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  const light = await showNotice()
  await expect(light).toHaveCSS('border-radius', '20px')
  await expect(light).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await screenshot('popup-terminal-warning-light.png')
  await dismiss(light)

  await page.evaluate(() => { location.hash = '#/settings?tab=model' })
  const picker = page.locator('[data-slot="select-trigger"]:visible').first()
  await picker.press('Enter')
  const select = page.locator('[data-slot="select-content"]:visible')
  const focusedOption = select.getByRole('option').and(page.locator(':focus'))
  await expectMenuFocus(focusedOption, expect)
  const optionBefore = await focusedOption.textContent()
  await page.keyboard.press('ArrowDown')
  await expect(focusedOption).not.toHaveText(optionBefore)
  await expectMenuFocus(focusedOption, expect)
  await screenshot('menu-select-light.png')
  await page.keyboard.press('Escape')
  await expect(select).toHaveCount(0)
  await closeSettings()

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  const native = await showNotice()
  await expect(native).not.toHaveCSS('border-radius', '20px')
  await dismiss(native)
  console.log(JSON.stringify({ warningRadius: 20, buttonRadius: 10, menuRadius: 20, formRadius: 24, hover: true, nativeDetails: true, light: true, themeCleanup: true }))
}

export async function runUiAudit({ page, expect, screenshot, themeCard, openThemeSettings, closeSettings }) {
  const verified = { routes: [], commandCenter: [], capabilities: [], underlinedControls: [] }
  const rows = []
  const strict = process.env.HERMES_VISUAL_AUDIT_EXPECT === 'fixed'
  const keys = [...fs.readFileSync(new URL('../source/codex-reference.js', import.meta.url), 'utf8')
    .matchAll(/^  (\w+): "<svg/gm)].map(([, name]) => name)
  const glyphs = keys.map(key => [key, codexMask(key).slice(5, -2)])
  const missing = await page.evaluate(async (sources) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const failures = []
    for (const [name, src] of sources) {
      const glyph = new Image()
      glyph.src = src
      try {
        await glyph.decode()
        ctx.clearRect(0, 0, 16, 16)
        ctx.drawImage(glyph, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        const ink = data.filter((alpha, index) => index % 4 === 3 && alpha > 64).length
        if (ink < 6 || ink > 235) failures.push([name, ink])
      } catch {
        failures.push([name, 'decode'])
      }
    }
    return failures
  }, glyphs)
  assert.deepEqual(missing, [], 'Every glyph must paint a recognizable shape at 16px')
  verified.glyphs = keys.length

  async function go(path) {
    await page.evaluate((route) => { location.hash = route }, '#/' + path)
    // Settings (and some catalog tabs) add native default query params.
    await expect.poll(() => page.evaluate((expected) => {
      const base = 'https://fixture.invalid'
      const actual = new URL(location.hash.slice(1), base)
      const target = new URL('/' + expected, base)
      return actual.pathname === target.pathname &&
        [...target.searchParams].every(([key, value]) => actual.searchParams.get(key) === value)
    }, path), { message: 'Route: /' + path }).toBe(true)
  }
  const panel = () => page.locator(overlay + ':visible').last()
  const pageContent = () => page.locator(pageShell + ':visible').last()

  for (const path of ['', 'settings', 'command-center', 'session-import', 'capabilities', 'messaging', 'artifacts',
    'cron', 'profiles', 'agents', 'starmap', 'webhooks']) {
    await go(path)
    const content = ['', 'capabilities', 'messaging', 'artifacts'].includes(path)
      ? path ? pageContent() : page.locator('[data-chat-surface][data-composer-target="main"]:visible').first()
      : panel().locator(raised).first()
    await expect(content).toBeVisible()
    const activeControl = content.locator('button:visible:not(:disabled), a[href]:visible, input:visible:not(:disabled)').first()
    if (path !== 'starmap') await expect(activeControl, `Controls at /${path}`).toBeVisible({ timeout: 15000 })
    verified.routes.push(path || 'chat')
    const underlined = await content.locator('button:visible, button:visible span').evaluateAll(nodes =>
      nodes.filter(node => getComputedStyle(node).textDecorationLine.includes('underline'))
        .map(node => node.textContent.trim()).filter(Boolean),
    )
    if (underlined.length) verified.underlinedControls.push({ route: path || 'chat', labels: underlined })
    if (['starmap', 'session-import', 'agents', 'webhooks'].includes(path)) await screenshot('audit-' + path + '.png')
  }

  for (const section of ['sessions', 'system', 'usage', 'maintenance']) {
    await go('command-center?section=' + section)
    const link = panel().locator('[data-tour="nav-' + section + '"]')
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(panel().locator('main :is(header, nav[aria-label])').first(), `Heading in ${section}`).toBeVisible()
    verified.commandCenter.push(section)
    if (section !== 'sessions') await screenshot('audit-cc-' + section + '.png')
  }
  for (const tab of ['skills', 'toolsets', 'plugins', 'connectors']) {
    await go('capabilities?tab=' + tab)
    const nav = pageContent().locator('[data-tour="page-tabs"]')
    await expect(nav.locator('button:visible')).toHaveCount(4)
    await expect(nav.locator(`[data-tour="tab-${tab}"]`)).toHaveAttribute('data-active', 'true')
    verified.capabilities.push(tab)
    if (tab === 'plugins') {
      const filterBar = pageContent().locator('[data-catalog-filters]')
      if (await filterBar.count()) {
        await filterBar.locator('.catalog-filter-trigger > button').click()
        const filters = page.locator('[data-slot="popover-content"]').filter({ has: page.locator('[data-catalog-expanded-filters]') })
        await expect(filters).toHaveCSS('border-top-width', '0px')
        const installed = filters.getByRole('button', { name: /^(Установленные|Installed)$/i })
        await expect(installed).toHaveAttribute('aria-pressed', 'false')
        await installed.press('Enter')
        await expect(installed).toHaveAttribute('aria-pressed', 'true')
        await installed.press('Enter')
        await page.keyboard.press('Escape')
        await expect(filters).toHaveCount(0)
        verified.catalogFilters = true
      } else {
        const filter = page.locator('button:has([data-slot="checkbox-mark"])')
          .filter({ hasText: /Установленные|Installed/ }).first()
        const mark = filter.locator('[data-slot="checkbox-mark"]')
        await expect(mark).toHaveAttribute('data-state', 'unchecked')
        await filter.press('Enter')
        await expect(mark).toHaveAttribute('data-state', 'checked')
        await expect(mark.locator('.codicon-check')).not.toHaveCSS('mask-image', 'none')
        verified.catalogCheckbox = true
      }
    }
  }
  const directory = page.locator('[data-slot="connectors-directory"]')
  const switchControl = directory.locator('[data-slot="connector-row-card"]')
    .filter({ hasText: 'Тестовый поиск' }).getByRole('switch')
  await expect(switchControl).toBeVisible()
  await expect(switchControl).toHaveAttribute('aria-checked', 'true')
  const on = await state(switchControl)
  await switchControl.press('Space')
  await expect(switchControl).toHaveAttribute('aria-checked', 'false', { timeout: 12000 })
  try {
    await expect.poll(async () => (await state(switchControl)).background).not.toBe(on.background)
  } catch (error) {
    console.log('Connector switch paint', await switchControl.evaluate((element) => ({
      slot: element.dataset.slot,
      state: element.dataset.state,
      checked: element.getAttribute('aria-checked'),
      disabled: element.disabled,
      background: getComputedStyle(element).backgroundColor,
      selected: getComputedStyle(element).getPropertyValue('--hcv-selected'),
      thumb: element.querySelector('[data-slot="switch-thumb"]')?.dataset.state,
    })))
    throw error
  }
  const off = await state(switchControl)
  assert.notEqual(off.background, on.background, 'Switch visually distinguishes its states')
  await switchControl.press('Space')
  await expect(switchControl).toHaveAttribute('aria-checked', 'true', { timeout: 12000 })
  verified.connectorSwitch = { on: on.background, off: off.background }
  if (strict) {
    await expect(switchControl).toHaveCSS('width', '32px')
    await expect(switchControl).toHaveCSS('height', '19px')
    await expect(switchControl.locator('[data-slot="switch-thumb"]')).toHaveCSS('translate', /^13px(?: 0px)?$/)
  }
  const addConnector = directory.locator(addConnectorButton).first()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // Slow the compositor only during the measurements. Restore its speed
  // before focus and navigation checks so the real interaction is exercised.
  const motion = async (trigger, content, label, openState = 'open') => {
    await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
    await trigger.click()
    const visible = content.locator('xpath=self::*[@data-state="' + openState + '"]')
    await expect(visible).toBeAttached()
    const entered = await state(visible)
    if (strict && label === 'add-connector-dialog') {
      await expect(visible.locator('[data-slot="dialog-close-button"] > svg')).not.toHaveCSS('mask-image', 'none')
    }
    await page.keyboard.press('Escape')
    const closed = content.locator('xpath=self::*[@data-state="closed"]')
    const exiting = await closed.waitFor({ state: 'attached', timeout: 400 })
      .then(() => state(closed), () => null)
    rows.push({ label, entered, exiting })
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
    await expect(content).toHaveCount(0, { timeout: 10000 })
    return [entered, exiting]
  }
  const dialogMotion = await motion(addConnector, page.locator(dialog), 'add-connector-dialog')

  await go('settings?tab=appearance')
  const selected = panel().locator('[data-tour="overlay-nav"] button[aria-current="page"]').first()
  await expect(selected).toBeVisible()
  const selectedStyle = await state(selected)
  const appearance = panel().locator('[data-tour="overlay-nav"] [data-tour="nav-config:appearance"]')
  await expect(appearance).toBeVisible()
  const settingsIcon = appearance.locator(':scope > :is(svg, .codicon)').first()
  await expect(settingsIcon).not.toHaveCSS('mask-image', 'none')
  verified.settingsSelection = selectedStyle.background
  await page.keyboard.press('Escape')

  await go('')
  const project = page.locator('[data-hcv-project-name]').filter({ hasText: 'Тестовый проект' }).first()
  await expect(project).toBeVisible()
  const row = project.locator('xpath=../..')
  const idle = await state(row)
  await project.hover()
  await expect.poll(async () => (await state(row)).background).not.toBe(idle.background)
  const projectTrigger = row.getByRole('button', { name: 'Действия', exact: true })
  const menuMotion = await motion(projectTrigger, page.locator(menu), 'project-menu')
  await expect(projectTrigger).toBeFocused()
  verified.menuCloseUsesHostUnmount = !menuMotion[1]
  const summaryToggle = page.locator('[data-hcv-context-toggle]')
  await summaryToggle.hover()
  const tooltip = page.locator(tip).filter({ hasText: /Скрыть сводку|Hide summary/i })
  await expect(tooltip).toBeVisible()
  const tooltipStyle = await state(tooltip)
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await page.mouse.move(700, 110)
  const closedTip = tooltip.locator('xpath=self::*[@data-state="closed"]')
  const tooltipExit = await closedTip.waitFor({ state: 'attached', timeout: 400 })
    .then(() => state(closedTip), () => null)
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(tooltip).toHaveCount(0)
  verified.tooltip = { enter: tooltipStyle, exit: tooltipExit }

  const summary = page.locator('[data-hcv-context-card]')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await summaryToggle.click()
  await expect(summaryToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(summary).toHaveAttribute('aria-hidden', 'true')
  verified.summaryExit = await summary.evaluate((el) => el.getAnimations().map(animation => [
    animation.transitionProperty, animation.effect.getTiming().duration,
  ]))
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(summary).toBeHidden()
  await summaryToggle.click()
  await expect(summary).toBeVisible()
  await expect(summaryToggle).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').filter({ has: page.locator('[data-slot="command-input"]') })
  await expect(palette.locator('[data-slot="command-input"]')).toBeFocused()
  const selectedCommand = palette.locator('[data-slot="command-item"][data-selected="true"]')
  await expect(selectedCommand).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(selectedCommand).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  verified.commandPalette = true

  const bots = page.locator('[data-zone-tabstrip="grp-sessions"] [data-tree-tab="hermes-bots:pane"]')
  await bots.click()
  await expect(bots).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: /New bot or group chat|Новый бот или групповой чат/i })).toBeVisible()
  const sessionSearch = page.locator('[data-hcv-search-toggle]')
  verified.hiddenSearchInBots = !(await sessionSearch.isVisible())
  if (strict) {
    await expect(sessionSearch).toHaveCount(0)
    await expect(page.locator('button[data-roster-key]').first()).toHaveCSS('border-radius', '8px')
  }
  await screenshot('audit-bots.png')
  const sessions = page.locator('[data-zone-tabstrip="grp-sessions"] [data-tree-tab="sessions"]')
  await sessions.click()
  await expect(sessions).toHaveAttribute('aria-selected', 'true')
  await expect(sessionSearch).toBeVisible()
  verified.botsPane = true

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await projectTrigger.click()
  await expect(page.locator(menu)).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Escape')
  await expect(page.locator(menu)).toHaveCount(0)
  await expect(projectTrigger).toBeFocused()
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.locator('[data-hcv-project-name], [data-hcv-context-toggle], [data-hcv-sidebar-bar]')).toHaveCount(0)
  await expect(page.locator('[data-sessions-project] button[data-slot="row-button"]').first()).toBeVisible()
  await page.emulateMedia({ forcedColors: 'none' })

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('[data-hcv-project-name], [data-hcv-context-toggle], [data-hcv-sidebar-bar], [data-hcv-generated]')).toHaveCount(0)
  await expect(page.locator('[data-sessions-project] button[data-slot="row-button"]').first()).toBeVisible()
  await cdp.detach()
  verified.reducedMotionAndCleanup = true
  console.log(JSON.stringify({ audit: verified, motion: rows }))
  if (strict) {
    assert.equal(menuMotion[0].duration, '0.15s')
    // Hermes' DropdownMenu portal can unmount the content immediately.
    // Confirm native dismissal/focus even in that case; only check the
    // duration when Radix keeps the closed element for its exit.
    if (menuMotion[1]) assert.equal(menuMotion[1].duration, '0.1s')
    assert.deepEqual(dialogMotion.map(frame => frame?.duration), ['0.15s', '0.1s'])
    assert.notEqual(selectedStyle.background, 'rgba(0, 0, 0, 0)')
    assert.equal(tooltipStyle.radius, '8px')
    assert.deepEqual([tooltipStyle.duration, tooltipExit?.duration], ['0.25s', '0.25s'])
    assert(verified.summaryExit.some(([property, duration]) => property === 'transform' && duration === 300))
  }
}
