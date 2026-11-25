import assert from 'node:assert/strict'

// Expected invariants come from Codex MM7P.D: aria-current, hover and the
// expanded menu share the ghost-hover fill. Open-but-unfocused is not selected.
// Pass the raw colors and timing found in the chosen Codex resource as reference.
export async function verifySidebarRowParity({
  page, expect, sidebar, projectChat, screenshot,
  openThemeSettings, closeSettings, themeCard, onCapture = () => {},
  reference = {
    dark: { fill: 'rgba(255, 255, 255, 0.08)', height: '30px', radius: '10px', transitionDuration: '0s' },
    light: { fill: 'rgba(26, 28, 31, 0.05)', height: '30px', radius: '10px', transitionDuration: '0s' },
  },
}) {
  const before = process.env.HERMES_VISUAL_SIDEBAR_ROW_BEFORE === '1'
  const neutral = 'rgba(0, 0, 0, 0)'
  const group = sidebar.locator('[data-sessions-mode="projects"]')
  const name = group.getByRole('button', { name: 'Тестовый проект', exact: true })
  const projectRow = group.locator('[data-hcv-project-row]').filter({ hasText: 'Тестовый проект' })
  const home = group.locator('[data-sessions-project="__no_project__"]')
  const row = title => projectChat(title).locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row-hover ")][1]')
  const firstTitle = 'Ревью интерфейса'
  const secondTitle = 'Проверка каталога'
  const first = row(firstTitle)
  const second = row(secondTitle)
  const away = () => page.mouse.move(1000, 110)
  const menu = page.locator('[data-hcv-sidebar-menu][data-state="open"]')
  const states = []
  const measurements = locator => locator.evaluate(node => {
    const s = getComputedStyle(node)
    const bounds = node.getBoundingClientRect()
    return {
      fill: s.backgroundColor, color: s.color, radius: s.borderRadius,
      height: bounds.height, width: bounds.width,
      transitionProperty: s.transitionProperty, transitionDuration: s.transitionDuration,
      transitionTimingFunction: s.transitionTimingFunction,
      current: node.getAttribute('aria-current'), classes: node.className,
      menu: node.getAttribute('data-state') === 'open' || !!node.querySelector('[aria-haspopup="menu"][aria-expanded="true"]'),
      focusWithin: node.contains(document.activeElement), hover: node.matches(':hover'),
    }
  })
  async function capture(label, theme) {
    states.push({ label, theme, first: await measurements(first), second: await measurements(second),
      project: await measurements(projectRow), homeVisible: await home.isVisible() })
    onCapture({ before, reference, states })
  }
  async function paint(locator, color) {
    if (!before) await expect(locator).toHaveCSS('background-color', color)
  }
  async function openProject() {
    await expect(name).toBeVisible()
    if (await name.getAttribute('aria-expanded') === 'false') await name.click()
    await expect(projectChat(firstTitle)).toBeVisible()
    await expect(projectChat(secondTitle)).toBeVisible()
  }
  async function mode(theme) {
    await openProject()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await projectChat(firstTitle).click()
    await away()
    const selectedColor = reference[theme]?.fill || (await measurements(first)).fill
    if (!before) assert.notEqual(selectedColor, neutral, 'The current chat has a visible Codex selection')
    await paint(first, selectedColor)
    await paint(second, neutral)
    await paint(projectRow, neutral)
    await capture('first-selected', theme)

    await projectChat(secondTitle).click({ modifiers: ['Control'] })
    await away()
    await paint(second, selectedColor)
    await paint(first, neutral)
    await paint(projectRow, neutral)
    await capture('second-selected-both-open', theme)
    await screenshot(`${theme}-two-open-chats.png`, { animations: 'allow' })

    await first.hover()
    await paint(first, selectedColor)
    await paint(second, selectedColor)
    await capture('hover-old-chat', theme)
    await away()
    await paint(first, neutral)
    await paint(second, selectedColor)
    await capture('left-old-chat', theme)

    await projectRow.hover()
    await paint(projectRow, selectedColor)
    await paint(second, selectedColor)
    await away()
    await paint(projectRow, neutral)
    await capture('left-project', theme)

    if (before) {
      const more = first.locator('[data-row-actions] button[aria-haspopup="menu"]').first()
      await first.hover()
      await more.click()
      await expect(menu).toBeVisible()
      await away()
      await capture('old-chat-menu-open', theme)
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await away()
      await capture('old-chat-menu-closed-focused', theme)
    } else {
      await expect(first.locator('button[data-session-actions]')).toHaveCSS('visibility', 'hidden')
    }

    await projectChat(firstTitle).click({ button: 'right' })
    const contextMenu = page.locator('[data-slot="context-menu-content"][data-state="open"]')
    await expect(contextMenu).toBeVisible()
    await away()
    await paint(first, selectedColor)
    await capture('old-chat-context-open', theme)
    await screenshot(`${theme}-chat-menu.png`, { animations: 'allow' })
    await page.keyboard.press('Escape')
    await expect(contextMenu).toHaveCount(0)
    await away()
    await paint(first, neutral)

    await projectRow.hover()
    await projectRow.getByRole('button', { name: 'Новый сеанс в Тестовый проект', exact: true }).click()
    await away()
    await capture('new-session-in-project-initial', theme)
    await paint(projectRow, selectedColor)
    await paint(first, neutral)
    await paint(second, neutral)
    await capture('new-session-in-project', theme)
    await screenshot(`${theme}-new-session-project.png`, { animations: 'allow' })

    await projectChat(firstTitle).click()
    await away()
    await paint(first, selectedColor)
    await paint(second, neutral)
    await paint(projectRow, neutral)
    await capture('chat-after-project-draft', theme)
    if (!before) {
      const expected = reference[theme]
      if (expected?.radius) await expect(first).toHaveCSS('border-radius', expected.radius)
      if (expected?.height) await expect(first).toHaveCSS('height', expected.height)
      if (expected?.transitionProperty) await expect(first).toHaveCSS('transition-property', expected.transitionProperty)
      if (expected?.transitionDuration) await expect(first).toHaveCSS('transition-duration', expected.transitionDuration)
      if (expected?.transitionTimingFunction) await expect(first).toHaveCSS('transition-timing-function', expected.transitionTimingFunction)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await second.hover()
    await paint(second, selectedColor)
    await away()
    await paint(second, neutral)
    await capture('reduced-motion-left-chat', theme)
  }

  await expect(group).toBeVisible()
  await expect(home).toHaveCount(1)
  if (!before) await expect(home).toBeHidden()
  await mode('dark')
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await mode('light')

  // A theme-scoped change must not remove Hermes' native Home permanently.
  const nativeHomeExists = await home.count()
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  if (nativeHomeExists) await expect(home).toBeVisible()
  const returnedToNative = await page.locator('html').getAttribute('data-hermes-theme') !== 'codex-workspace'
  assert(returnedToNative, 'The original Hermes theme remains available')
  return { before, reference, states, returnedToNative, nativeHomeRestored: nativeHomeExists ? await home.isVisible() : null }
}
