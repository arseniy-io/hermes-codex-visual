import assert from 'node:assert/strict'

// Call only in the isolated Electron test profile. Every usage route is
// intercepted in main-process IPC; no OpenAI call or real reset can occur.
export async function installUsageUiFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    if (globalThis.__hcvUsageFixture) throw new Error('usage fixture already installed')
    const previous = ipcMain._invokeHandlers.get('hermes:api')
    if (typeof previous !== 'function') throw new Error('Hermes API handler missing')
    const state = { previous, calls: [], enabled: false, confirmStatus: 'reset', historyUnits: 'percent' }
    globalThis.__hcvUsageFixture = state
    const scope = 'fixture-profile-account'
    const overview = () => ({
      scope, account: { plan: 'test', windows: [{ label: 'Weekly', used_percent: 11, reset_at: '2026-11-25T00:00:00Z' }],
        credits_balance: '61567.7397127500' },
      resets: [
        { id: 'fixture-reset-1', reset_type: 'codex_rate_limits', title: 'Full reset', expires_at: '2026-11-30T19:59:00Z' },
        { id: 'fixture-reset-2', reset_type: 'codex_rate_limits', title: 'Full reset', expires_at: '2026-12-02T19:59:00Z' },
        { id: 'fixture-reset-3', reset_type: 'codex_rate_limits', title: 'Full reset', expires_at: '2026-12-13T19:59:00Z' },
      ],
      assistant_available: true, assistant_enabled: state.enabled, assistant_pending: null,
    })
    ipcMain.removeHandler('hermes:api')
    ipcMain.handle('hermes:api', async (event, request) => {
      const full = String(request?.path || '')
      const prefix = '/api/plugins/hermes-codex-visual'
      if (!full.startsWith(prefix + '/')) return previous(event, request)
      const url = new URL('http://fixture' + full.slice(prefix.length))
      state.calls.push({ path: url.pathname, query: url.search, method: request.method || 'GET', body: request.body || null })
      if (url.pathname === '/overview') return overview()
      if (url.pathname === '/assistant/setting') {
        state.enabled = request.body?.enabled === true
        return { scope, enabled: state.enabled }
      }
      if (url.pathname === '/reset/prepare') {
        const credit = overview().resets.find(item => item.id === request.body?.credit_id)
        if (!credit) throw new Error('unknown reset in fixture')
        return { scope, nonce: 'fixture-nonce', expires_in: 30, credit }
      }
      if (url.pathname === '/reset/confirm') {
        if (state.confirmStatus === 'throw') throw new Error('fixture uncertain response')
        return { scope, status: state.confirmStatus }
      }
      if (url.pathname === '/chats') return { scope, data_as_of: '2026-11-19T00:00:00Z', truncated: false,
        rows: Array.from({ length: 6 }, (_, i) => ({ id: 'fixture-chat-' + i, title: 'Чат ' + (i + 1),
          usage: i === 5 ? { data_status: 'unavailable' } : { data_status: i === 2 ? 'partial' : 'available', weekly_limit_percent: i === 4 ? 0.004 : 5 - i,
            balance_usage_credits: i === 4 ? '0.75' : '0', groups: [
              { model: 'gpt-6.1-sol', reasoning_effort: 'high', speed: 'standard',
                weekly_limit_percent: 5 - i, balance_usage_credits: '0' }] } })) }
      if (url.pathname === '/history') {
        const row = (thread_source, model, surface, turn_trigger, value) => ({ thread_source, model, surface, turn_trigger, value })
        const day = (date, chat, subagent, child) => ({ date, attribution: [
          ...(chat ? [row('user', 'gpt-6.1-sol', 'desktop_app', 'user', chat)] : []),
          ...(subagent ? [row('subagent', 'gpt-6.1-terra', 'codex', 'agent', subagent)] : []),
          ...(child ? [row('aeon_child', 'gpt-6.1-sol', 'desktop_app', 'agent', child)] : []),
        ] })
        const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
        const shift = date => new Date(Date.parse(date + 'T00:00:00Z') - offset * 7 * 86400000).toISOString().slice(0, 10)
        return { scope, start_date: shift('2026-11-13'), end_date: shift('2026-11-19'), units: state.historyUnits, data: [
          day('2026-11-13', .2, .1, .1), day('2026-11-14', .5, .2, .2), day('2026-11-15', 4, 2, 3),
          day('2026-11-16', 4, 2, 1), day('2026-11-17', 3, 4, 1), day('2026-11-18', 2, 1, 0),
          day('2026-11-19', 0, 0, 0),
        ].map(item => ({ ...item, date: shift(item.date) })) }
      }
      if (url.pathname === '/plan-history') return { scope, approximate: true, coverage_complete: false, data_as_of: '2026-11-19T00:00:00Z',
        periods: [{ id: 'one', window_minutes: 10080, starts_at: '2026-11-18T00:00:00Z',
          ends_at: '2026-11-25T00:00:00Z', accounting_complete: true, used_basis_points: 300,
          breakdowns: [{ dimension: 'thread_source', rows: [{ key: 'chat', basis_points: 300 }] }] }] }
      throw new Error('unexpected usage fixture path ' + url.pathname)
    })
  })
}

export async function restoreUsageUiFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    const state = globalThis.__hcvUsageFixture
    if (!state) return
    ipcMain.removeHandler('hermes:api')
    ipcMain.handle('hermes:api', state.previous)
    delete globalThis.__hcvUsageFixture
  })
}

export async function verifyUsageUi({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard }) {
  await installUsageUiFixture(app)
  try {
    await openThemeSettings()
    const rail = page.locator('[data-tour="overlay-nav"]')
    const usage = rail.locator('[data-hcv-usage-nav="rail"]')
    await expect(usage).toBeVisible()
    const order = await rail.evaluate(node => {
      const session = node.querySelector('[data-tour="nav-sessions"]')?.parentElement
      const inserted = node.querySelector('[data-hcv-usage-nav="rail"]')
      return Boolean(session && inserted && (session.compareDocumentPosition(inserted) & Node.DOCUMENT_POSITION_FOLLOWING))
    })
    assert(order, 'Usage belongs after Sessions')
    await usage.click()
    const body = page.locator('[data-hcv-usage-page]')
    await expect(body).toBeVisible()
    await expect(body.getByText('Активный профиль Hermes: default')).toBeVisible()
    await expect(body.getByText('Недельный лимит', { exact: true })).toBeVisible()
    await expect(body.getByText(/Остаётся 89/)).toBeVisible()
    await expect(body.getByText(/Осталось 61\s?568 кредитов$/)).toBeVisible()
    await expect(body.getByText('Текущий баланс', { exact: true })).toBeVisible()
    await expect(body.locator('[data-u-reset-count]')).toHaveText(/Доступно\s+3/)
    const resetButtons = body.getByRole('button', { name: 'Использовать сброс' })
    await expect(resetButtons).toHaveCount(3)
    await expect(body.getByRole('heading', { name: 'Полный сброс', exact: true })).toHaveCount(3)
    await screenshot('usage-overview.png')

    const toggle = body.getByRole('switch', { name: 'Разрешить ассистенту использовать сбросы лимитов' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await resetButtons.nth(1).click()
    const dialog = body.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Аккаунт Codex активного профиля Hermes: default')).toBeVisible()
    await expect(dialog.getByText('Выбранный сброс: Полный сброс')).toBeVisible()
    let calls = await app.evaluate(() => globalThis.__hcvUsageFixture.calls)
    assert.equal(calls.find(call => call.path === '/reset/prepare').body.credit_id, 'fixture-reset-2')
    assert.equal(calls.filter(call => call.path === '/reset/confirm').length, 0)
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    calls = await app.evaluate(() => globalThis.__hcvUsageFixture.calls)
    assert.equal(calls.filter(call => call.path === '/reset/confirm').length, 0)
    await resetButtons.first().click()
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(body.getByText('Сброс использован.')).toBeVisible()
    calls = await app.evaluate(() => globalThis.__hcvUsageFixture.calls)
    assert.equal(calls.filter(call => call.path === '/reset/confirm').length, 1)

    await body.getByRole('tab', { name: 'Аналитика' }).click()
    await expect(body.getByRole('heading', { name: 'История использования', exact: true })).toBeVisible()
    await expect(body.getByRole('heading', { name: 'Топ чатов', exact: true })).toBeVisible()
    await expect(body.getByText('Чат 1', { exact: true })).toBeVisible()
    await expect(body.getByText('Данные могут быть неполными.', { exact: true })).toBeVisible()
    await expect(body.getByText('< 0,01 %', { exact: true })).toBeVisible()
    await expect(body.getByText('Чаты', { exact: true })).toBeVisible()

    // The menu is rendered by Hermes outside the settings panel. Verify both
    // selection and the keyboard dismissal/focus path, not only its styling.
    const grouping = body.locator('[data-u-group-trigger]').first()
    await expect(grouping).toContainText('По функциям')
    await grouping.click()
    const groupingMenu = page.locator('[data-hcv-usage-group-menu]')
    await expect(groupingMenu).toBeVisible()
    await expect(groupingMenu.getByRole('menuitemradio', { name: 'По функциям' })).toHaveAttribute('aria-checked', 'true')
    await screenshot('usage-group-menu.png')
    await groupingMenu.getByRole('menuitemradio', { name: 'По моделям' }).click()
    await expect(grouping).toContainText('По моделям')
    await expect(body.getByText('gpt-6.1-sol', { exact: true })).toBeVisible()
    await grouping.focus()
    await page.keyboard.press('Enter')
    await expect(groupingMenu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(groupingMenu).toHaveCount(0)
    await expect(grouping).toBeFocused()
    await grouping.click()
    await groupingMenu.getByRole('menuitemradio', { name: 'По функциям' }).click()
    await expect(grouping).toContainText('По функциям')

    const chart = body.locator('[data-u-history-card]')
    const days = chart.locator('[data-u-history-day]')
    const legend = chart.locator('[data-u-history-legend-item]')
    const chartHeading = chart.locator('[data-u-history-heading] > span')
    await expect(days).toHaveCount(7)
    await expect(chartHeading).toContainText('2026')
    await days.nth(4).hover()
    await expect(chartHeading).toContainText('17 нояб.')
    await expect(legend.nth(0)).toContainText('37,5 %')
    await expect(legend.nth(1)).toContainText('50 %')
    await expect(legend.nth(2)).toContainText('12,5 %')
    await expect.poll(() => days.nth(3).locator('[data-u-history-bar]').evaluate(el => getComputedStyle(el).opacity)).toBe('0.4')
    await expect(days.nth(4).locator('[data-u-history-bar]')).toHaveCSS('opacity', '1')
    await screenshot('usage-day-hover.png')
    await body.getByRole('heading', { name: 'История использования', exact: true }).hover()
    await expect(chartHeading).toContainText('2026')
    await expect(chart.locator('[data-u-history-active]')).toHaveCount(0)
    await days.nth(5).focus()
    await expect(chartHeading).toContainText('18 нояб.')
    await expect(legend.nth(0)).toContainText('66,7 %')
    await page.keyboard.press('ArrowLeft')
    await expect(chartHeading).toContainText('17 нояб.')
    await page.keyboard.press('Escape')
    await expect(chartHeading).toContainText('2026')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(days.nth(0).locator('[data-u-history-bar]')).toHaveCSS('animation-duration', '0.3s')
    await chart.getByRole('button', { name: 'Предыдущий период' }).click()
    await expect(chartHeading).toContainText('12 нояб.')
    await expect(chart.locator('[data-u-history-body]')).toHaveAttribute('data-u-history-enter', 'previous')
    await expect(chart.locator('[data-u-history-body]')).toHaveCSS('animation-duration', '0.52s')
    const motion = await chart.locator('[data-u-history-body]').evaluate(node => {
      const animation = node.getAnimations().find(item => item.animationName === 'hcv-usage-history-from-previous')
      if (!animation) return null
      animation.pause()
      animation.currentTime = 0
      const shift = new DOMMatrixReadOnly(getComputedStyle(node).transform).m41
      const width = node.offsetWidth
      animation.play()
      return { shift, width }
    })
    assert(motion && motion.width > 0 && Math.abs(motion.shift + motion.width) < 2, 'Previous period enters from a full card width')
    await chart.getByRole('button', { name: 'Следующий период' }).click()
    await expect(chartHeading).toContainText('19 нояб.')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(chart.locator('[data-u-history-body]')).toHaveCSS('animation-name', 'none')
    await expect(days.nth(0).locator('[data-u-history-bar]')).toHaveCSS('animation-name', 'none')

    await expect(body.getByText('Чат 6', { exact: true })).toHaveCount(0)
    await body.getByRole('button', { name: 'Показать ещё' }).click()
    await expect(body.getByText('Чат 6', { exact: true })).toBeVisible()
    await body.getByRole('button', { name: /Чат 1/ }).click()
    await expect(body.getByText(/gpt-6\.1-sol/).first()).toBeVisible()
    await body.getByRole('button', { name: '30 дн.' }).click()
    await expect.poll(async () => app.evaluate(() => globalThis.__hcvUsageFixture.calls.some(c => c.path === '/history' && c.query.includes('days=30')))).toBeTruthy()
    await expect(body.getByRole('heading', { name: 'История использования лимитов плана' })).toBeVisible()
    await expect(body.getByText('История может быть приблизительной или неполной.')).toBeVisible()
    const planGrouping = body.locator('[data-u-group-trigger]').nth(1)
    await planGrouping.click()
    await groupingMenu.getByRole('menuitemradio', { name: 'По моделям' }).click()
    await expect(planGrouping).toContainText('По моделям')
    await planGrouping.click()
    await groupingMenu.getByRole('menuitemradio', { name: 'По функциям' }).click()
    await screenshot('usage-analytics.png')

    await app.evaluate(() => { globalThis.__hcvUsageFixture.historyUnits = 'tokens' })
    await body.getByRole('button', { name: '7 дн.' }).click()
    await expect(body.getByText('Разбивка за этот период недоступна.')).toBeVisible()
    await app.evaluate(() => { globalThis.__hcvUsageFixture.historyUnits = 'percent' })

    await body.getByRole('tab', { name: 'Обзор' }).click()
    await app.evaluate(() => { globalThis.__hcvUsageFixture.confirmStatus = 'throw' })
    await resetButtons.first().click()
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    await expect(body.getByText(/Результат сброса неизвестен/)).toBeVisible()
    await expect(resetButtons.first()).toBeDisabled()
    await expect(resetButtons.nth(1)).toBeEnabled()
    calls = await app.evaluate(() => globalThis.__hcvUsageFixture.calls)
    assert.equal(calls.filter(call => call.path === '/reset/confirm').length, 2)

    await page.setViewportSize({ width: 760, height: 720 })
    const menu = page.locator('[data-overlay-surface] [data-tour="overlay-nav"] + div button[aria-haspopup="menu"]')
    await expect(menu).toBeVisible()
    await menu.click()
    await page.getByRole('menuitem', { name: 'Основная модель', exact: true }).click()
    await menu.click()
    await page.getByRole('menuitem', { name: 'Использование', exact: true }).click()
    await expect(body).toBeVisible()
    assert(await body.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Usage fits narrow settings')
    await screenshot('usage-narrow.png')

    await page.setViewportSize({ width: 1440, height: 920 })
    await closeSettings()
    await openThemeSettings()
    await themeCard('Nous').click()
    await expect(page.locator('html')).not.toHaveAttribute('data-hermes-theme', 'codex-workspace')
    await expect(page.locator('[data-hcv-usage-nav]')).toHaveCount(0)
    await themeCard('Codex').click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-theme', 'codex-workspace')
    await expect(page.locator('[data-hcv-usage-nav="rail"]')).toBeVisible()
  } finally {
    await restoreUsageUiFixture(app)
  }
}
