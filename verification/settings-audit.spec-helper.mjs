import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function installSettingsAuditFixture(app, page, desktop) {
  const { billingDevFixtures } = await import(pathToFileURL(path.join(
    desktop, 'src/app/settings/billing/dev-fixtures.ts',
  )))
  const { billing, subscription } = billingDevFixtures['subscriber-personal']
  const billingReplies = new Map([['billing.state', billing.data], ['subscription.state', subscription.data]])
  await page.routeWebSocket(url => url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.id != null && billingReplies.has(frame.method)) {
        route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: billingReplies.get(frame.method) }))
      } else {
        upstream.send(message)
      }
    })
  })
  await app.evaluate(({ ipcMain }) => {
    const channel = 'hermes:api'
    const native = ipcMain._invokeHandlers.get(channel)
    if (typeof native !== 'function') throw new Error('Expected the isolated Hermes API handler')
    const replies = {
      '/api/providers/oauth': {
        providers: [
          { id: 'nous', name: 'Nous Portal', flow: 'device_code', status: { logged_in: false } },
          { id: 'openai-codex', name: 'ChatGPT or Codex Subscription', flow: 'device_code', status: { logged_in: true } },
        ],
      },
      '/api/env': {
        FIXTURE_API_KEY: {
          advanced: false, category: 'provider', description: 'Проверочный провайдер', is_password: true,
          is_set: false, provider: 'fixture', provider_label: 'Fixture', redacted_value: null, tools: [], url: '',
        },
      },
      '/api/providers/custom-endpoints': {
        ok: true,
        current: { provider: 'custom', model: 'mock-model', base_url: 'http://127.0.0.1:9/v1' },
        endpoints: [{
          id: 'fixture', name: 'Локальный тестовый эндпоинт', base_url: 'http://127.0.0.1:9/v1',
          model: 'mock-model', models: ['mock-model'], discover_models: false, has_api_key: false,
        }],
      },
    }
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, request) => {
      const pathname = String(request?.path || '').split('?')[0]
      if ((!request?.method || request.method === 'GET') && Object.hasOwn(replies, pathname)) return replies[pathname]
      return native(event, request)
    })
  })
}

export async function verifySettingsAudit({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const before = process.env.HERMES_VISUAL_AUDIT_BASELINE === '1'
  const root = page.locator('html')
  const overlay = page.locator('[data-overlay-surface]:visible').last()
  const rail = overlay.locator('[data-tour="overlay-nav"]')
  const main = overlay.locator('main')
  const heading = main.locator('nav [aria-current="page"]').first()
  const nav = id => rail.locator(`button[data-tour="${id}"]`)
  const captured = new Set([
    'nav-config:appearance:general', 'nav-config:appearance:theme', 'nav-config:appearance:typography',
    'nav-config:model:main', 'nav-config:workspace:projects', 'nav-config:voice:transcription',
    'nav-pview:accounts', 'nav-pview:keys', 'nav-pview:custom-endpoints', 'nav-pview:local',
    'nav-gateway:connection', 'nav-keybinds:shortcuts', 'nav-bview:overview', 'nav-bview:plans', 'nav-web-access', 'nav-plugins',
  ])
  const slug = value => value.replace(/[^a-z0-9]+/gi, '-')

  const inspect = () => main.evaluate(element => {
    const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible'
    const painted = value => value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)'
    const fields = '[data-slot="input"], [data-slot="textarea"], [data-slot$="select-trigger"], [data-slot="combobox-input"]'
    const controls = element.querySelectorAll(`${fields}, button[data-variant][data-size]:not([data-size="inline"]), [data-slot="badge"]`)
    const square = []
    for (const node of controls) {
      if (!visible(node) || node.matches('input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"]')) continue
      const css = getComputedStyle(node)
      if (parseFloat(css.borderTopLeftRadius) >= 6) continue
      const border = parseFloat(css.borderTopWidth) > 0 && painted(css.borderTopColor)
      if (border || painted(css.backgroundColor) || css.boxShadow !== 'none') {
        square.push({ slot: node.dataset.slot, variant: node.dataset.variant, radius: css.borderTopLeftRadius })
      }
    }
    const gradient = element.querySelector('button > .arc-border.arc-nous')
    const card = gradient?.parentElement
    const ringStyle = gradient && getComputedStyle(gradient)
    const rows = [...element.querySelectorAll('[class~="@container"]:has(> .grid.py-3)')].filter(visible)
    return {
      route: location.hash,
      title: element.querySelector('nav [aria-current="page"]')?.textContent?.trim(),
      rows: rows.length,
      groups: rows.filter(row => parseFloat(getComputedStyle(row).borderTopLeftRadius) >= 12 ||
        parseFloat(getComputedStyle(row.parentElement).borderTopLeftRadius) >= 12).length,
      controls: [...controls].filter(visible).length,
      square,
      gradient: card && {
        cardRadius: getComputedStyle(card).borderTopLeftRadius,
        ringRadius: ringStyle.borderTopLeftRadius,
        standoff: ringStyle.getPropertyValue('--arc-standoff').trim(),
        inset: ringStyle.inset,
        mask: ringStyle.maskImage,
        gradient: getComputedStyle(gradient, '::before').backgroundImage.startsWith('repeating-linear-gradient'),
      },
    }
  })

  await page.keyboard.press('Control+,')
  await expect(rail).toBeVisible()
  const groups = await rail.locator('button.row-hover').evaluateAll(nodes =>
    nodes.filter(node => !node.parentElement.id && node.dataset.tour).map(node => node.dataset.tour))
  assert(groups.length >= 17, `Expected settings groups, got ${groups}`)
  const checked = []
  const inspectPage = async id => {
    await expect(heading).toBeVisible()
    await expect(main.locator(':scope > :not(nav):not(:has(> nav))').first()).toBeAttached()
    await expect(main.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, { timeout: 10000 })
    if (id === 'nav-pview:accounts') {
      const hero = main.locator('button:has(> .arc-border.arc-nous)')
      await expect(hero).toBeVisible()
      if (!before) await expect(hero.locator('div > div > span.inline-flex')).toHaveCSS('border-radius', '999px')
    }
    if (id === 'nav-pview:keys') await expect(main.locator('[id^="provider-key-"]').first()).toBeVisible()
    if (id === 'nav-pview:custom-endpoints') await expect(main.getByText('Локальный тестовый эндпоинт')).toBeVisible()
    if (!before && id === 'nav-config:appearance:general') {
      const language = main.getByRole('button', { name: 'Сменить язык', exact: true })
      await expect(language).toHaveCSS('border-radius', '10px')
      const group = main.locator('[class~="@container"]:has(button[aria-label="Сменить язык"])').first().locator('..')
      await expect(group).toHaveCSS('border-radius', '16px')
      await expect(group).toHaveCSS('padding-inline-start', '16px')
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    checked.push({ id, ...await inspect() })
    if (process.env.HERMES_VISUAL_SETTINGS_ALL_SHOTS === '1' || captured.has(id)) await screenshot(`${slug(id)}.png`)
  }
  for (const id of groups) {
    const group = nav(id)
    await group.click()
    const childButtons = group.locator('xpath=../following-sibling::*[1][@id]').locator('button.row-hover')
    if (id === 'nav-billing') await expect(nav('nav-bview:plans')).toBeVisible()
    const children = await childButtons.evaluateAll(nodes => nodes.map(node => node.dataset.tour).filter(Boolean))
    if (!children.length) {
      await expect(group).toHaveAttribute('aria-current', 'page')
      await inspectPage(id)
    }
    for (const child of children) {
      await nav(child).click()
      await expect(nav(child)).toHaveAttribute('aria-current', 'page')
      await inspectPage(child)
    }
  }
  console.log('Settings coverage', JSON.stringify({ groups, pages: checked }))
  assert(checked.length >= 45, 'Expected every mounted settings subpage')
  const distinct = new Set(checked.map(row => row.route))
  assert.equal(distinct.size, checked.length, 'Every measured page should have its own native route')
  if (!before) assert.deepEqual(checked.flatMap(row => row.square.map(control => ({ page: row.id, ...control }))), [])

  const search = overlay.locator('button[data-glass-opaque]:has(> svg.tabler-icon-search)')
  await search.click()
  await expect(page.locator('[data-slot="command-input"]:visible')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()

  await closeSettings()
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(root).toHaveAttribute('data-hermes-mode', 'light')
  await expect(themeCard('Codex')).toBeVisible()
  const appearance = nav('nav-config:appearance')
  if (!(await nav('nav-config:appearance:general').isVisible())) await appearance.click()
  await nav('nav-config:appearance:general').click()
  await expect(heading).toBeVisible()
  await screenshot('light-appearance.png')
  await page.setViewportSize({ width: 740, height: 700 })
  const menu = overlay.locator('[data-tour="overlay-nav"] + div button[aria-haspopup="menu"]')
  await expect(menu).toBeVisible()
  await menu.click()
  await expect(page.locator('[data-slot="dropdown-menu-content"]:visible')).toBeVisible()
  await page.keyboard.press('Escape')
  await screenshot('light-narrow-appearance.png')
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(heading).toBeVisible()

  if (!before) {
    const provider = checked.find(entry => entry.gradient)
    assert(provider, 'Expected to visit the native featured provider card')
    assert.equal(provider.gradient.cardRadius, '20px', JSON.stringify(provider))
    assert.equal(provider.gradient.ringRadius, provider.gradient.cardRadius, JSON.stringify(provider))
    assert.equal(provider.gradient.standoff, '0px', JSON.stringify(provider))
    assert.equal(provider.gradient.inset, '0px', JSON.stringify(provider))
    assert.notEqual(provider.gradient.mask, 'none', 'Gradient must remain a border, not a solid fill')
    assert.equal(provider.gradient.gradient, true)
    await page.evaluate(() => { location.hash = '#/settings?tab=providers' })
    const ring = main.locator('button > .arc-border.arc-nous').first()
    await expect(ring).toHaveCSS('display', 'none')
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' })
    await expect(ring).toBeVisible()
    assert.equal(await ring.evaluate(node => getComputedStyle(node, '::before').animationName), 'arc-border')
    await screenshot('light-narrow-provider.png', { animations: 'allow' })
    await closeSettings()
    await page.setViewportSize({ width: 1440, height: 920 })
    await openThemeSettings()
    await themeCard('Nous').click()
    await expect(root).not.toHaveAttribute('data-hcv-settings-tab')
    await expect(root).not.toHaveAttribute('data-hcv-settings-page')
  }
}
