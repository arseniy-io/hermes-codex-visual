import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { verifyAntigravityModels } from './antigravity-menu.spec-helper.mjs'

// This scenario uses the final ZIP's plugin.js and a disposable gateway. The
// fixture only supplies model capabilities; every click is processed by the
// actual session owner and read back through config.get.
export async function verifyModelSpeedWindow({ page, expect, projectChat, sandbox, screenshot, gatewayLog, fixtureMode }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  await projectChat('Ревью интерфейса').click()
  const pill = chat.locator('[data-slot="composer-surface"] [data-tour="model-pill"]')
  const effort = chat.getByTestId('reasoning-pill')
  await expect(pill).toBeVisible()
  await expect(effort).toBeVisible()
  await expect(pill).toHaveText('GPT-6.2 Sol')

  const geometry = () => pill.evaluate(node => {
    const effortButton = node.nextElementSibling
    const box = node.getBoundingClientRect()
    const labelBox = node.querySelector('span.truncate').getBoundingClientRect()
    const effortBox = effortButton.getBoundingClientRect()
    const effortLabelBox = effortButton.querySelector('span').getBoundingClientRect()
    return {
      modelHeight: box.height, effortHeight: effortBox.height, gap: effortBox.left - box.right,
      modelCenter: labelBox.y + labelBox.height / 2, effortCenter: effortLabelBox.y + effortLabelBox.height / 2,
      modelFont: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].map(x => getComputedStyle(node.querySelector('span.truncate'))[x]),
      effortFont: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].map(x => getComputedStyle(effortButton.querySelector('span'))[x]),
      effortBorder: getComputedStyle(effortButton.querySelector('span')).borderTopWidth,
      modelRadii: [getComputedStyle(node).borderTopLeftRadius, getComputedStyle(node).borderTopRightRadius,
        getComputedStyle(node).borderBottomRightRadius, getComputedStyle(node).borderBottomLeftRadius],
      effortRadii: [getComputedStyle(effortButton).borderTopLeftRadius, getComputedStyle(effortButton).borderTopRightRadius,
        getComputedStyle(effortButton).borderBottomRightRadius, getComputedStyle(effortButton).borderBottomLeftRadius],
      modelColor: getComputedStyle(node).backgroundColor, effortColor: getComputedStyle(effortButton).backgroundColor,
    }
  })
  const idle = await geometry()
  const sharedHover = async () => {
    const { modelColor, effortColor } = await geometry()
    return modelColor === effortColor && modelColor !== idle.modelColor
  }
  assert.equal(idle.modelHeight, idle.effortHeight)
  assert.deepEqual(idle.modelFont, idle.effortFont)
  assert.equal(idle.modelFont[1], '14px')
  assert.equal(idle.modelFont[2], '400')
  assert.equal(idle.modelFont[3], '18px')
  assert.equal(idle.effortBorder, '0px')
  assert.deepEqual(idle.modelRadii, ['14px', '0px', '0px', '14px'])
  assert.deepEqual(idle.effortRadii, ['0px', '14px', '14px', '0px'])
  assert(Math.abs(idle.modelCenter - idle.effortCenter) <= 1)
  assert(Math.abs(idle.gap) <= 1)
  await pill.hover()
  await expect.poll(sharedHover).toBe(true)
  await effort.hover()
  await expect.poll(sharedHover).toBe(true)
  const hovered = await geometry()
  assert.equal(hovered.modelCenter, idle.modelCenter)
  assert.equal(hovered.effortCenter, idle.effortCenter)
  if (fixtureMode === 'responses') {
    const surface = chat.locator('[data-slot="composer-surface"]')
    await screenshot('model-effort-hover.png', { locator: surface })
    // When the model and effort cannot share a fill, the highlighted effort
    // needs the same round corners as a standalone composer control.
    await effort.evaluate(button => {
      const boundary = document.createElement('span')
      boundary.hidden = true
      boundary.setAttribute('data-test-effort-boundary', '')
      button.before(boundary)
    })
    try {
      await effort.hover()
      for (const corner of ['top-left', 'bottom-left', 'top-right', 'bottom-right']) {
        await expect(effort).toHaveCSS(`border-${corner}-radius`, '14px')
      }
      await expect(effort).toHaveCSS('background-color', hovered.effortColor)
      await screenshot('model-effort-standalone-hover.png', { locator: surface })
    } finally {
      await surface.locator('[data-test-effort-boundary]').evaluate(node => node.remove())
    }
  }

  if (fixtureMode === 'responses') {
    // Reproduce the fresh, empty speed result that the first native request
    // can cache. Only the existing isolated gateway is allowed to recover it.
    await expect.poll(() => pill.evaluate(node => {
      let runtimeId
      for (let fiber = node[Object.keys(node).find(key => key.startsWith('__reactFiber$'))]; fiber && !runtimeId; fiber = fiber.return) {
        for (let dep = fiber.dependencies?.firstContext; dep; dep = dep.next) {
          runtimeId = dep.memoizedValue?.$runtimeId?.get() || runtimeId
        }
      }
      if (!runtimeId) return false
      const client = globalThis.__HERMES_PLUGIN_SDK__.queryClient
      const query = client.getQueryCache().findAll({ queryKey: ['model-options'], type: 'active' }).find(entry =>
        entry.queryKey[2] === runtimeId && entry.state.data?.providers?.some(row => row.slug === 'openai-codex'))
      if (!query || query.state.fetchStatus !== 'idle') return false
      client.setQueryData(query.queryKey, data => ({
        ...data,
        providers: data.providers.map(row => row.slug !== 'openai-codex' ? row : ({
          ...row,
          capabilities: { ...row.capabilities, 'gpt-6.2-sol': { ...row.capabilities['gpt-6.2-sol'], fast: false, ultrafast: false } },
        })),
      }))
      return true
    })).toBe(true)
  }

  await effort.click()
  await expect.poll(sharedHover).toBe(true)
  const effortMenu = page.locator('[data-slot="dropdown-menu-content"][data-hcv-model-options]:visible')
  await expect(effortMenu.locator('[data-hcv-speed-heading]')).toHaveText('Скорость')
  await expect(effortMenu.locator('[data-hcv-standard-speed]')).toHaveText('Стандартный')
  await expect(effortMenu.locator('[data-hcv-speed-option="fast"]')).toContainText('Скорость 2×')
  await expect(effortMenu.locator('[data-hcv-speed-option="fast"]')).toContainText('Лимит и кредиты 2×')
  await expect(effortMenu.locator('[data-hcv-speed-option="ultrafast"]')).toContainText('Скорость до 4,5×')
  await expect(effortMenu.locator('[data-hcv-speed-option="ultrafast"]')).toContainText(/Лимит(?: и кредиты)? 6×/u)
  const maxEffort = effortMenu.getByRole('menuitemradio', { name: 'Max', exact: true })
  await maxEffort.click()
  await expect(effort).toHaveText('Max')
  if (await effortMenu.isVisible()) await page.keyboard.press('Escape')
  await expect(effortMenu).not.toBeVisible()
  await effort.click()
  await expect(maxEffort).toHaveAttribute('aria-checked', 'true')
  await expect(effortMenu).not.toContainText('на этом маршруте')
  if (fixtureMode === 'responses') await screenshot('model-effort-and-speed.png', { locator: effortMenu })
  await effortMenu.getByRole('menuitemradio', { name: 'Ultra', exact: true }).click()
  await expect(effort).toHaveText('Ultra')
  await expect(effort.locator('span')).toHaveCSS('color', 'rgb(146, 79, 247)')
  if (await effortMenu.isVisible()) await page.keyboard.press('Escape')
  console.log('HCV_MODEL_SPEED_LAYOUT', JSON.stringify({ idle, hovered }))

  async function openModel(name) {
    await pill.click()
    const catalog = page.locator('[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):visible')
    const search = catalog.getByRole('textbox', { name: 'Поиск моделей' })
    await search.fill(name)
    const row = catalog.locator('[data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: new RegExp(name.replace('-', '[ -]'), 'i') }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.press('ArrowRight')
    const options = page.locator('[data-slot="dropdown-menu-sub-content"]:visible').last()
    await expect(options).toBeVisible()
    return { catalog, row, options }
  }
  async function closeMenu() {
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  }

  let menu = await openModel('gpt-6.2-sol')
  const first = menu.options.locator('[data-hcv-speed-option="fast"]')
  const ultra = menu.options.locator('[data-hcv-speed-option="ultrafast"]')
  const standard = menu.options.locator('[data-hcv-standard-speed]')
  await expect(first).toBeVisible()
  await expect(ultra).toBeVisible()
  await expect(standard).toBeVisible()
  const ownerDetails = await page.evaluate(() => {
    const fiberOf = element => {
      const keys = Object.keys(element)
      let fiber = element[keys.find(key => key.startsWith('__reactFiber$'))]
      const props = element[keys.find(key => key.startsWith('__reactProps$'))]
      if (fiber?.memoizedProps !== props) fiber = fiber?.alternate
      return fiber?.memoizedProps === props ? fiber : null
    }
    const option = document.querySelector('[data-hcv-speed-option="fast"] [role="switch"]')
    let request, profile
    let rowDetails
    for (let fiber = fiberOf(option); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps
      if (!rowDetails && typeof props?.model === 'string' && typeof props?.provider === 'string' && typeof props?.onSetOptions === 'function') {
        rowDetails = { model: props.model, provider: props.provider, isActive: props.isActive }
      }
      if (typeof props?.profile === 'string' && (typeof props.requestGateway === 'function' || typeof props.request === 'function')) {
        request = props.requestGateway || props.request
        profile = props.profile
        break
      }
    }
    const pill = document.querySelector('[data-slot="composer-surface"] [data-tour="model-pill"]')
    let sessionId, current
    for (let fiber = fiberOf(pill); fiber; fiber = fiber.return) {
      for (let dep = fiber.dependencies?.firstContext; dep; dep = dep.next) {
        const view = dep.memoizedValue
        if (typeof view?.$runtimeId?.get === 'function') {
          sessionId = view.$runtimeId.get()
          current = { model: view.$model?.get(), provider: view.$provider?.get(), tier: view.$serviceTier?.get() }
        }
      }
    }
    if (!request || !sessionId) throw new Error('Could not identify this menu owner and its real session')
    window.__hcvTestReadTier = () => request('config.get', { session_id: sessionId, profile, key: 'service_tier' })
    return { rowDetails, current, sessionId, profile }
  })
  console.log('HCV_MODEL_SPEED_OWNER', JSON.stringify(ownerDetails))
  assert.deepEqual(ownerDetails.rowDetails, { model: 'gpt-6.2-sol', provider: 'openai-codex', isActive: true })
  assert.equal(ownerDetails.current.provider, 'openai-codex')
  assert.equal(ownerDetails.current.model, 'gpt-6.2-sol')
  const readTier = async () => (await page.evaluate(() => window.__hcvTestReadTier())).value
  const gatewayEvents = () => {
    const body = fs.readFileSync(gatewayLog, 'utf8')
    const lines = body.split('\n')
    if (!body.endsWith('\n')) lines.pop()
    return lines.filter(Boolean).map(line => JSON.parse(line))
  }
  const successfulWrites = () => gatewayEvents().filter(entry => entry.method === 'config.set' &&
      entry.params.session_id === ownerDetails.sessionId && entry.params.key === 'fast' && entry.result?.result)
    .map(entry => entry.result.result.value)
  await expect.poll(readTier).toBe('normal')

  const previous = standard.locator('xpath=preceding-sibling::*[starts-with(@role,"menuitem")][1]')
  if (await previous.count()) {
    await previous.focus()
    await page.keyboard.press('ArrowDown')
    await expect(standard).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(first).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(standard).toBeFocused()
  }
  await first.click()
  console.log('HCV_MODEL_SPEED_AFTER_FAST_CLICK', JSON.stringify({
    menuVisible: await menu.options.isVisible(), switchChecked: await first.locator('[role="switch"]').getAttribute('aria-checked').catch(() => null),
    tier: await readTier(),
  }))
  await expect.poll(readTier).toBe('fast')
  await expect(pill).toHaveAttribute('data-hcv-model-speed', 'fast')
  const fastMask = await pill.evaluate(node => getComputedStyle(node, '::before').maskImage)
  assert.notEqual(fastMask, 'none')
  console.log('HCV_MODEL_SPEED_SELECTED fast')
  await ultra.click()
  await expect.poll(readTier).toBe('ultrafast')
  await expect(pill).toHaveAttribute('data-hcv-model-speed', 'ultrafast')
  const ultraMask = await pill.evaluate(node => getComputedStyle(node, '::before').maskImage)
  assert.notEqual(ultraMask, 'none')
  assert.notEqual(ultraMask, fastMask)
  console.log('HCV_MODEL_SPEED_SELECTED ultrafast')
  if (fixtureMode === 'responses') {
    await closeMenu()
    const composer = chat.locator('[data-slot="composer-surface"]')
    await screenshot('model-speed-ultrafast.png', { locator: composer })
    await openModel('gpt-6.2-sol')
  }
  await standard.press('Enter')
  await expect.poll(readTier).toBe('normal')
  await expect(pill).not.toHaveAttribute('data-hcv-model-speed', /.+/)
  await expect.poll(() => successfulWrites().slice(0, 3)).toEqual(['fast', 'ultrafast', 'normal'])
  console.log('HCV_MODEL_SPEED_SELECTED normal')
  await ultra.click()
  await expect.poll(readTier).toBe('ultrafast')
  console.log('HCV_MODEL_SPEED_SELECTED ultrafast-before-model-change')

  await closeMenu()
  menu = await openModel('gpt-6.1-sol')
  await menu.row.click()
  await expect(pill).toHaveText('GPT-6.1 Sol')
  console.log('HCV_MODEL_SPEED_MODEL gpt-6.1-sol')
  await expect.poll(readTier).toBe('normal')
  await expect(pill).not.toHaveAttribute('data-hcv-model-speed', /.+/)
  await closeMenu()
  menu = await openModel('gpt-6.1-sol')
  await expect(menu.options.locator('[data-hcv-speed-option="fast"]')).toBeVisible()
  await expect(menu.options.locator('[data-hcv-speed-option="ultrafast"]')).toHaveCount(0)
  await closeMenu()
  menu = await openModel('gpt-6.2-sol')
  await menu.row.click()
  await expect(pill).toHaveText('GPT-6.2 Sol')
  console.log('HCV_MODEL_SPEED_MODEL gpt-6.2-sol')
  await expect.poll(readTier).toBe('normal')
  await closeMenu()
  menu = await openModel('gpt-6.2-sol')
  await expect(menu.options.locator('[data-hcv-speed-option="ultrafast"] [role="switch"]')).toHaveAttribute('aria-checked', 'false')
  await menu.options.locator('[data-hcv-speed-option="ultrafast"]').click()
  await expect.poll(readTier).toBe('ultrafast')

  // The next model.options refresh sees a catalog outage. The native action
  // must remain usable even though neither fast mode can now be confirmed.
  fs.writeFileSync(path.join(sandbox.root, 'model-speed-catalog-state'), 'offline')
  await closeMenu()
  await expect(menu.catalog).not.toBeVisible()
  await pill.click()
  const refreshedCatalog = page.locator('[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):visible')
  await refreshedCatalog.getByRole('menuitem', { name: /^(Обновить модели|Refresh models)$/i }).click()
  await expect.poll(async () => {
    const state = await page.evaluate(async () => window.__hcvTestReadTier())
    return state.options?.includes('ultrafast') ?? false
  }).toBe(false)
  await expect.poll(() => gatewayEvents().some(entry => entry.method === 'model.options' && entry.params.refresh === true &&
    entry.capabilities?.['gpt-6.2-sol']?.fast === false && entry.capabilities?.['gpt-6.2-sol']?.ultrafast === false)).toBe(true)
  await closeMenu()
  await expect(refreshedCatalog).not.toBeVisible()
  await effort.click()
  const fallback = effortMenu.getByRole('menuitem', { name: /^(Использовать стандартную скорость|Use standard speed)$/i })
    .or(effortMenu.locator('[data-hcv-standard-speed][aria-checked="false"]:not([aria-disabled="true"])')).first()
  await expect(fallback).toBeVisible()
  await fallback.click()
  await expect.poll(readTier).toBe('normal')
  await expect(pill).not.toHaveAttribute('data-hcv-model-speed', /.+/)
  await expect.poll(() => successfulWrites().at(-1)).toBe('normal')
  console.log('HCV_MODEL_SPEED_SELECTED normal-after-outage')
  await closeMenu()
  const events = gatewayEvents()
  const actualOwner = events.find(event => event.method === 'config.set' &&
    event.params.session_id === ownerDetails.sessionId && event.params.key === 'fast' && event.result?.result)
  assert(actualOwner?.pid, 'Expected the real session owner to record its PID')
  assert(events.some(event => event.pid === actualOwner.pid && event.event === 'fixture-installed' &&
    event.isolated && event.mode === fixtureMode),
    'Expected the bounded fixture in the same process that accepted the selection')
  assert(events.some(event => event.pid === actualOwner.pid && event.event === 'packaged-speed-helper-loaded' &&
    event.sha256 === '40c5f551da916d2ef956a3a1d056d50bb82dfc81344b83e96f49f5dac5e02b22'),
    'The session owner must load the speed helper from the verified ZIP')
  if (fixtureMode === 'responses') {
    assert(events.some(event => event.pid === actualOwner.pid && event.event === 'responses-catalog' && event.account === 'fixture-A'),
      'Expected the owner to warm its synthetic Responses account catalog')
  } else {
    assert(events.some(event => event.pid === actualOwner.pid && event.event === 'fake-app-server-model-list'),
      'Expected the owner to query the synthetic app-server model/list')
  }
  console.log('HCV_MODEL_SPEED_EVIDENCE', JSON.stringify({ mode: fixtureMode,
    syntheticCatalogConfirmed: true, savedSelections: successfulWrites(), finalTier: await readTier() }))
  console.log('HCV_MODEL_SPEED_WINDOW: real gateway accepted fast, ultrafast, normal and standard after outage')
  if (fixtureMode === 'responses') await verifyAntigravityModels({ page, expect, pill, screenshot })
}
