import assert from 'node:assert/strict'

export async function verifyDisplay({ page, expect, sidebar, screenshot, openThemeSettings, closeSettings, themeCard, baseline }) {
  const rail = page.locator('[data-tree-group="grp-sessions"][data-window-top]:not([data-pane-host])')
  const strip = rail.locator('[data-zone-tabstrip="grp-sessions"] [role="tablist"]')
  const brand = rail.locator('[data-hcv-sidebar-bar]')
  const menu = page.locator('[data-hcv-window-menu]')
  const activeMenus = page.locator('[data-hcv-window-menu-content][data-state="open"]')
  const tab = key => strip.locator(`[data-tree-tab="${key}"]`)
  const profile = sidebar.locator('[data-slot="profile-rail"]').getByRole('button', { name: /^(All profiles|Показать все профили)$/i })
  const projects = sidebar.locator('[data-sessions-mode="projects"]')
  const recent = projects.locator('[data-hcv-recents-toggle]')
  const list = projects.locator('[data-hcv-recents-list]')
  const chatTitle = 'Тест длинного сообщения'
  const oldTitle = 'Старый чат другого профиля'
  const chatRow = (scope, title) => scope.locator('button[data-slot="row-button"]:visible').filter({ hasText: title })
  const olderDivider = sidebar.getByText('Ранее в этом месяце', { exact: true })
  const groupBy = async label => {
    await sidebar.getByRole('button', { name: 'Фильтры', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Группировка/ }).press('ArrowRight')
    await page.getByRole('menuitemradio', { name: label, exact: true }).click()
    for (let i = 0; i < 2 && await page.locator('[role="menu"][data-state="open"]').count(); i++) {
      await page.keyboard.press('Escape')
    }
  }
  const geometry = () => rail.evaluate(node => {
    const header = node.querySelector(':scope > [data-panel-header]')
    const list = header?.querySelector('[role="tablist"]')
    return {
      header: header?.offsetHeight,
      width: list?.clientWidth,
      scrollWidth: list?.scrollWidth,
      labels: Array.from(list?.querySelectorAll('[role="tab"] .truncate') || [], label => ({
        text: label.textContent.trim(), width: label.clientWidth, textWidth: label.scrollWidth,
      })),
      branded: Boolean(header?.querySelector('[data-hcv-sidebar-bar]')),
    }
  })

  if (baseline) {
    await menu.getByRole('button', { name: 'Правка', exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: 'Отменить ввод' })).toBeHidden()
    await page.mouse.move(700, 150)
  } else {
    const edit = menu.getByRole('button', { name: 'Правка', exact: true })
    const view = menu.getByRole('button', { name: 'Вид', exact: true })
    await edit.click()
    await expect(activeMenus).toHaveCount(1)
    const undo = activeMenus.getByRole('menuitem', { name: 'Отменить ввод' })
    await undo.hover()
    await expect(undo).toBeVisible()
    await view.hover()
    await expect(activeMenus).toHaveCount(1)
    await expect(activeMenus.getByRole('menuitem', { name: 'Боты', exact: true })).toBeVisible()
    await expect(undo).toHaveCount(0)
    await screenshot('window-menu.png')
    await menu.getByRole('button', { name: 'Справка', exact: true }).hover()
    await expect(activeMenus.getByRole('menuitem', { name: 'О программе' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(activeMenus).toHaveCount(0)
    await page.mouse.move(700, 150)
    await edit.press('Enter')
    await expect(undo).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(edit).toBeFocused()
    await view.click()
    await page.mouse.move(700, 150)
    await expect(activeMenus).toHaveCount(1)
    await page.mouse.click(700, 150)
    await expect(activeMenus).toHaveCount(0)
  }

  const tabs = ['sessions', 'hermes-bots:pane', 'terminal']
  const sizes = {}
  for (const key of tabs) {
    await tab(key).click()
    await expect(tab(key)).toHaveAttribute('aria-selected', 'true')
    if (!baseline) await expect(brand).toBeVisible()
    sizes[key] = await geometry()
    if (!baseline && key === 'hermes-bots:pane') {
      const bots = rail.locator('[data-slot="bots-roster"]')
      await expect(bots.getByText('Visual Other', { exact: true })).toBeVisible()
      await expect(tab('terminal').locator('.truncate')).toBeVisible()
    }
    if (key !== 'sessions') await screenshot(key === 'terminal' ? 'sidebar-terminal.png' : 'sidebar-bots.png')
    if (!baseline && key === 'terminal') {
      const empty = page.locator('[data-hcv-terminal-empty]')
      await expect(empty).toBeVisible()
      await page.keyboard.press('Control+Shift+Backquote')
      await expect(page.locator('[data-persistent-terminal][aria-hidden="false"] > [data-terminal]')).toBeVisible()
      await expect(empty).toBeHidden()
      await screenshot('sidebar-terminal-active.png')
    }
  }
  await tab('sessions').click()
  if (!baseline) {
    for (const layout of Object.values(sizes)) {
      assert(layout.branded && layout.header === sizes.sessions.header, JSON.stringify(sizes))
      assert(layout.scrollWidth <= layout.width + 1, JSON.stringify(sizes))
      assert.equal(layout.labels.length, 3)
      for (const label of layout.labels) assert(label.textWidth <= label.width + 1, JSON.stringify(sizes))
    }
  }

  await expect(profile).toBeVisible()
  if ((await profile.getAttribute('aria-label')) === 'Показать все профили') {
    await profile.click()
    await expect(profile).toHaveCount(0)
  }
  if (!(await projects.isVisible())) await groupBy('Проект')
  await expect(recent).toBeVisible()
  await recent.press('Enter')
  await expect(list.getByRole('button', { name: /^Свободный чат/ }).first()).toBeVisible()
  const projectRecentCount = await list.getByRole('button', { name: /^Свободный чат/ }).count()
  if (!baseline) {
    await expect(list.getByRole('button', { name: /^Свободный чат/ })).toHaveCount(13)
    await expect(chatRow(list, oldTitle)).toBeVisible()
  }
  await groupBy('Обновление')
  const flat = sidebar.locator('[data-sessions-mode="flat"]')
  await expect(flat).toBeVisible()
  const recentFlat = flat.getByRole('button', { name: 'Недавние', exact: true })
  if (await recentFlat.getAttribute('aria-expanded') === 'false') await recentFlat.press('Enter')
  await expect(chatRow(flat, oldTitle)).toBeVisible()
  if (baseline) await expect(olderDivider).toBeVisible()
  else await expect(olderDivider).toBeHidden()
  await screenshot('sidebar-all-profiles.png')

  if (!baseline) {
    await page.setViewportSize({ width: 790, height: 850 })
    const compactRecents = page.locator('[data-hcv-flat-list]')
    await expect(compactRecents).toHaveCount(1)
    await expect(chatRow(compactRecents, oldTitle)).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 920 })
    await chatRow(flat, oldTitle).click()
    await expect(page.locator('[data-slot="aui_thread-viewport"]:visible')
      .getByText('Ответ из другого профиля.', { exact: true })).toBeVisible({ timeout: 30000 })
  }
  await chatRow(flat, chatTitle).click()
  const viewport = page.locator('[data-slot="aui_thread-viewport"]:visible').first()
  const short = viewport.locator('[data-slot="aui_user-message-root"]').filter({ hasText: 'Ровно двадцать строк' })
  const long = viewport.locator('[data-slot="aui_user-message-root"]').filter({ hasText: 'Длинный запрос' })
  await expect(long).toBeAttached({ timeout: 20000 })
  const readMask = () => viewport.evaluate(node => getComputedStyle(node).maskImage)
  if (baseline) {
    await expect(long.locator('[data-hcv-message-toggle]')).toHaveCount(0)
    await viewport.evaluate(node => { node.scrollTop = 700 })
    await screenshot('transcript.png')
    console.log(JSON.stringify({ baseline: true, sizes, projectRecentCount, hoverMenu: false, dateDivider: true, messageToggle: false, viewportMask: await readMask() }))
    return
  }

  await expect(short).toBeAttached()
  await expect(short.locator('[data-hcv-message-toggle]')).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 580 })
  await expect(short).toHaveCSS('position', 'relative')
  await page.setViewportSize({ width: 1440, height: 920 })
  const toggle = long.locator('button[data-hcv-message-toggle]')
  await expect(toggle).toHaveText(/Показать ещё/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const preview = long.locator('[data-hcv-message-preview]')
  const ellipsis = long.locator('[data-hcv-message-ellipsis]')
  const previewHeight = () => preview.evaluate(node => node.clientHeight)
  const collapsedHeight = await previewHeight()
  assert(await preview.evaluate(node => Math.abs(node.clientHeight / parseFloat(getComputedStyle(node).lineHeight) - 19) < .1))
  assert.equal(await ellipsis.evaluate(node => getComputedStyle(node, '::before').content), '"…"')
  await toggle.scrollIntoViewIfNeeded()
  await expect(ellipsis).toBeVisible()
  await screenshot('message-folded.png')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveText(/Свернуть/)
  await expect.poll(() => preview.evaluate(node => node.getAnimations().some(a => a.transitionProperty === 'max-height'))).toBe(true)
  await expect.poll(previewHeight).toBeGreaterThan(collapsedHeight + 2)
  const fullHeight = await preview.evaluate(node => node.scrollHeight)
  assert((await previewHeight()) < fullHeight, 'Expanding passes through a partial height')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect.poll(previewHeight).toBe(fullHeight)
  await expect(ellipsis).toBeHidden()
  await toggle.scrollIntoViewIfNeeded()
  await screenshot('message-expanded.png')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(previewHeight).toBe(collapsedHeight)
  await expect(ellipsis).toBeVisible()
  await viewport.evaluate(node => { node.scrollTop = 700 })
  await expect.poll(readMask).toMatch(/linear-gradient\(.*16px/)
  await expect.poll(() => viewport.locator('[data-sticky-prompt-clip]').evaluateAll(nodes =>
    nodes.every(node => getComputedStyle(node).clipPath === 'none'),
  )).toBe(true)
  await screenshot('transcript-fade.png')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  assert.equal(await preview.evaluate(node => node.getAnimations().length), 0)
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(long.locator('[data-hcv-message-toggle]')).toHaveCount(0)
  await expect.poll(readMask).toBe('none')
  await expect(page.locator('[data-sessions-mode="flat"]').getByText('Ранее в этом месяце', { exact: true })).toBeVisible()
  await expect(chatRow(page.locator('[data-sessions-mode="flat"]'), oldTitle)).toBeHidden()
  console.log(JSON.stringify({ sizes, allProfiles: true, dateDivider: false, nativeChat: true, showMore: true, fade: true, themeCleanup: true }))
}
