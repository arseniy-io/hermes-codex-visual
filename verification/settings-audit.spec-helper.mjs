import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function verifyGroups(pages) {
  const rows = id => pages.find(page => page.id === id)?.rowGeometry ?? []
  const shared = (label, entries, frame, member) => {
    assert(entries.length >= 2, `Expected real rows for ${label}`)
    assert.equal(new Set(entries.map(entry => JSON.stringify(entry[frame]))).size, 1, label)
    assert.equal(entries[0][frame].radius, '16px', label)
    assert.equal(entries[0][frame].inset, '16px', label)
    assert.equal(entries[0][frame].gap, '0px', label)
    for (const item of entries.slice(1)) assert.equal(item[member].borderStart, '1px', label)
    for (const item of entries) assert.equal(item.row.background, 'rgba(0, 0, 0, 0)', label)
  }
  const auxiliary = rows('nav-config:model:auxiliary').filter(row => row.id.startsWith('aux-task-'))
  shared('Auxiliary model group', auxiliary, 'group', 'parent')
  for (const row of auxiliary) {
    assert.equal(row.labelSize, '13px')
    assert.equal(row.columns.split(' ').length, 2)
  }
  const typography = rows('nav-config:appearance:typography')
  const frame = row => row.id.endsWith('-font') ? row.group : row.parent
  assert(typography.length >= 3, 'Expected scale and both font rows')
  assert.equal(new Set(typography.map(row => JSON.stringify(frame(row)))).size, 1)
  assert.equal(frame(typography[0]).radius, '16px')
  const attachments = rows('nav-config:chat:attachments')
  const size = attachments.find(row => row.id === 'setting-field-chat.attachment-size')
  const mode = attachments.find(row => row.id === 'setting-field-agent.image_input_mode')
  assert(size && mode, 'Expected both attachment settings')
  assert.equal(size.row.endRadius, '0px')
  assert.equal(size.row.borderEnd, '0px')
  assert.equal(mode.group.radius, '0px')
  assert.equal(mode.group.borderStart, '0px')
  assert.equal(mode.parent.borderStart, '1px')
  assert.equal(size.row.x, mode.group.x)
  assert.equal(size.row.width, mode.group.width)
  shared('MoA references and aggregator', rows('nav-config:model:moa'), 'parent', 'row')
  shared('Archived chats', rows('nav-sessions:archived').filter(row => row.id.startsWith('archived-session-')), 'group', 'parent')
}

async function verifySettingsStates({ page, expect, main, jump, screenshot }) {
  const states = {}
  const dialog = page.locator('[data-slot="dialog-content"]:visible, [role="alertdialog"]:visible')
  const select = page.locator('[data-slot="select-content"]:visible')
  const attachmentMode = main.locator('[id="setting-field-agent.image_input_mode"] [data-slot="select-trigger"]')
  const auxiliary = main.locator('[id^="aux-task-"]').first()
  const profileName = 'visual-settings-long-profile'
  await jump('nav-config:model:auxiliary')
  const edit = auxiliary.getByRole('button', { name: 'Изменить', exact: true })
  await edit.click()
  await expect(auxiliary.getByRole('combobox').first()).toBeVisible()
  await screenshot('auxiliary-edit.png')
  await auxiliary.getByRole('button', { name: /Отмена|Отменить/ }).click()
  await expect(edit).toBeVisible()

  await jump('nav-config:chat:attachments')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await attachmentMode.press('Space')
  await expect(select).toBeVisible()
  const motion = () => select.evaluate(node => {
    const css = getComputedStyle(node)
    return { name: css.animationName, time: css.animationDuration, easing: css.animationTimingFunction }
  })
  states.selectOpen = await motion()
  assert.equal(states.selectOpen.name, 'hcv-settings-select-in')
  assert.equal(states.selectOpen.time, '0.3s')
  await screenshot('attachments-select.png', { animations: 'allow' })
  await page.keyboard.press('Escape')
  await expect(select).toBeHidden()
  await expect(attachmentMode).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await attachmentMode.press('Space')
  await expect(select).toBeVisible()
  states.selectReduced = await motion()
  assert.equal(states.selectReduced.name, 'none')
  const newMode = select.getByRole('option').nth(1)
  const newModeText = (await newMode.innerText()).trim()
  await newMode.click()
  await expect(attachmentMode).toHaveText(newModeText)
  await jump('nav-config:model:auxiliary')
  await jump('nav-config:chat:attachments')
  await expect(attachmentMode).toHaveText(newModeText)
  states.attachmentSaved = newModeText

  await jump('nav-config:model:moa')
  const add = main.getByRole('button', { name: 'Добавить референсную модель', exact: true })
  const references = main.getByRole('switch', { name: /референс \d+$/i })
  const referenceCount = await references.count()
  assert(referenceCount >= 2, 'Expected reference model switches')
  await add.click()
  await expect(references).toHaveCount(referenceCount + 1)
  const newReference = new RegExp(`референс ${referenceCount + 1}$`, 'i')
  const toggle = main.getByRole('switch', { name: newReference })
  const extra = main.locator('[class~="@container"]:has(> .grid.py-3)').filter({
    has: page.getByRole('switch', { name: newReference }),
  })
  await toggle.press('Space')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await extra.getByRole('button', { name: 'Убрать', exact: true }).click()
  await expect(references).toHaveCount(referenceCount)
  states.moaActions = true

  await jump('nav-sessions:archived')
  const archived = main.locator('[id^="archived-session-"]')
  await expect(archived).toHaveCount(3)
  await archived.first().getByRole('button', { name: /Удалить/ }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(archived).toHaveCount(3)
  await archived.first().getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(archived).toHaveCount(2)
  states.archiveRestored = true

  const fit = () => main.evaluate(element => {
    const scroller = element.querySelector(':scope > section > .h-full')
    const bounds = scroller.getBoundingClientRect()
    const overflow = [...scroller.querySelectorAll('input, textarea, button, [role="switch"]')].filter(node => {
      if (!node.getClientRects().length || getComputedStyle(node).visibility !== 'visible') return false
      const rect = node.getBoundingClientRect()
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1
    }).map(node => node.getAttribute('aria-label') || node.textContent.trim())
    return { overflow, horizontalScroll: scroller.scrollWidth > scroller.clientWidth + 1 }
  })
  await page.setViewportSize({ width: 740, height: 700 })
  await jump('nav-config:appearance:typography')
  const scale = main.locator('[id="setting-field-appearance.ui-scale"]')
  await scale.getByRole('button', { name: '175%', exact: true }).press('Space')
  await expect(scale.getByRole('button', { name: '175%', exact: true })).toHaveAttribute('aria-pressed', 'true')
  states.typography175 = await fit()
  assert.deepEqual(states.typography175, { overflow: [], horizontalScroll: false })
  await screenshot('narrow-typography-175.png')
  await scale.getByRole('button', { name: '100%', exact: true }).press('Space')
  await expect(scale.getByRole('button', { name: '100%', exact: true })).toHaveAttribute('aria-pressed', 'true')
  for (const [id, name] of [
    ['nav-config:model:moa', 'moa'],
    ['nav-config:chat:attachments', 'attachments'],
    ['nav-config:model:auxiliary', 'auxiliary'],
  ]) {
    await jump(id)
    states[`narrow-${name}`] = await fit()
    assert.deepEqual(states[`narrow-${name}`], { overflow: [], horizontalScroll: false }, name)
    await screenshot(`narrow-${name}.png`)
  }
  await page.setViewportSize({ width: 1440, height: 920 })
  await main.getByRole('button', { name: profileName, exact: true }).click()
  await expect(main.getByRole('status').filter({ hasText: profileName })).toBeVisible()
  await jump('nav-config:chat:attachments', { loading: true })
  await expect(main.getByRole('status').filter({ hasText: profileName })).toBeVisible()
  states.profileScope = true
  return states
}

export async function installSettingsAuditFixture(app, page, desktop) {
  const { billingDevFixtures } = await import(pathToFileURL(path.join(
    desktop, 'src/app/settings/billing/dev-fixtures.ts',
  )))
  const { billing, subscription } = billingDevFixtures['subscriber-personal']
  const fixtureReplies = new Map([
    ['billing.state', billing.data], ['subscription.state', subscription.data],
    // This disposable profile already has the loopback provider in config.
    // Newer Desktop additionally asks setup.status before leaving onboarding.
    ['setup.status', { provider_configured: true, ready: true, free_tier_route: false }],
    ['setup.runtime_check', { ok: true, provider: 'custom', model: 'mock-model', free_tier_route: false }],
  ])
  await page.routeWebSocket(url => url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.id != null && fixtureReplies.has(frame.method)) {
        route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: fixtureReplies.get(frame.method) }))
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

export async function verifySettingsAudit({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard, save }) {
  const before = process.env.HERMES_VISUAL_AUDIT_BASELINE === '1'
  const root = page.locator('html')
  const overlay = page.locator('[data-overlay-surface]:visible').last()
  const rail = overlay.locator('[data-tour="overlay-nav"]')
  const main = overlay.locator('main')
  const heading = main.locator('nav [aria-current="page"]').first()
  const nav = id => rail.locator(`button[data-tour="${id}"]`)
  const captured = new Set([
    'nav-config:advanced:delegation', 'nav-config:model:delegation', 'nav-config:model:moa',
    'nav-config:model:auxiliary', 'nav-config:chat:attachments', 'nav-sessions:archived',
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
    const heading = element.querySelector('nav [aria-current="page"]')
    const content = element.querySelector(':scope > section > .h-full')
    const length = value => Math.round(value * 100) / 100
    const box = node => {
      const css = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        x: length(rect.left), width: length(rect.width), height: length(rect.height),
        radius: css.borderTopLeftRadius, endRadius: css.borderBottomLeftRadius,
        background: css.backgroundColor, inset: css.paddingInlineStart, gap: css.rowGap,
        borderStart: css.borderBlockStartWidth, borderEnd: css.borderBlockEndWidth,
      }
    }
    return {
      route: location.hash,
      title: heading?.textContent?.trim(),
      headingSize: heading && getComputedStyle(heading).fontSize,
      main: box(element),
      contentOverflows: content ? content.scrollWidth > content.clientWidth + 1 : false,
      rows: rows.length,
      groups: rows.filter(row => parseFloat(getComputedStyle(row).borderTopLeftRadius) >= 12 ||
        parseFloat(getComputedStyle(row.parentElement).borderTopLeftRadius) >= 12).length,
      controls: [...controls].filter(visible).length,
      rowGeometry: rows.map(row => {
        const label = row.querySelector(':scope > .grid > div:first-child > div:first-child')
        const actions = row.querySelector(':scope > .grid > div:nth-child(2)')
        return {
          id: row.id || row.closest('[id]')?.id || '',
          label: label?.textContent?.trim(),
          row: box(row),
          parent: box(row.parentElement),
          group: box(row.parentElement.parentElement),
          labelSize: label && getComputedStyle(label).fontSize,
          labelLine: label && getComputedStyle(label).lineHeight,
          columns: getComputedStyle(row.firstElementChild).gridTemplateColumns,
          actions: actions && box(actions),
        }
      }),
      square,
      gradient: card && {
        cardRadius: getComputedStyle(card).borderTopLeftRadius,
        ringRadius: ringStyle.borderTopLeftRadius,
        standoff: ringStyle.getPropertyValue('--arc-standoff').trim(),
        inset: ringStyle.inset,
        mask: ringStyle.maskImage,
        gradient: getComputedStyle(gradient, '::before').backgroundImage,
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
    if (id === 'nav-pview:keys') await expect(main.getByRole('button', { name: 'Fixture', exact: true })).toBeVisible()
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
  console.log('Settings coverage:', checked.length, 'pages in', groups.length, 'groups')
  save({ baseline: before, groups, pages: checked })
  assert(checked.length >= 45, 'Expected every mounted settings subpage')
  const distinct = new Set(checked.map(row => row.route))
  assert.equal(distinct.size, checked.length, 'Every measured page should have its own native route')
  if (!before) assert.deepEqual(checked.flatMap(row => row.square.map(control => ({ page: row.id, ...control }))), [])
  const jump = async (id, { loading = false } = {}) => {
    const target = checked.find(entry => entry.id === id)
    assert(target, `Missing settings page ${id}`)
    await page.evaluate(route => { location.hash = route }, target.route)
    await expect(heading).toHaveText(target.title)
    if (!loading) await expect(main.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, { timeout: 20000 })
  }
  let states
  if (!before) {
    verifyGroups(checked)
    states = await verifySettingsStates({ page, expect, main, jump, screenshot })
  }

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
    assert.match(provider.gradient.gradient, /gradient\(/)
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
  save({ baseline: before, groups, pages: checked, states, completed: true })
  return true
}
