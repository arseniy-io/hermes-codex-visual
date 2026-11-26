import { verifyControlHover } from './control-hover.spec-helper.mjs'

async function verifyWorkspaceOverlays({ page, expect, screenshot, toggle }) {
  const summary = page.locator('[data-hcv-context-card]')
  const overlay = page.locator('[data-overlay-surface]:visible').last()
  const read = action => page.evaluate(action => {
    const measure = () => {
      const sidebar = document.querySelector('[data-hcv-sidebar-shell]')
      const sidebarBar = sidebar?.querySelector('[data-hcv-sidebar-bar]')
      const main = document.querySelector('[data-tree-group="grp-main"]:not([data-pane-host])')
      const composer = document.querySelector('[data-chat-surface]:not([data-pane-hidden] *) [data-slot="composer-surface"]')
      return { sidebarTop: sidebar?.getBoundingClientRect().top, sidebarWidth: sidebar?.getBoundingClientRect().width,
        barWidth: sidebarBar?.getBoundingClientRect().width, barDisplay: sidebarBar && getComputedStyle(sidebarBar).display,
        mainTop: main?.getBoundingClientRect().top, composerLeft: composer?.getBoundingClientRect().left,
        summary: getComputedStyle(document.documentElement).getPropertyValue('--hcv-summary-progress').trim() }
    }
    if (action === 'during') return measure()
    if (action === 'watch') {
      window.hcvOverlayFrames = new Promise(resolve => {
        const frames = []
        let attempts = 0
        function sample() {
          if (!document.querySelector('[data-overlay-surface]')) frames.push(measure())
          if (frames.length === 20 || ++attempts === 100) resolve(frames)
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      return
    }
    const frames = window.hcvOverlayFrames
    delete window.hcvOverlayFrames
    return frames
  }, action)
  const open = async route => {
    if (route === 'settings') await page.keyboard.press('Control+,')
    else await page.evaluate(route => { location.hash = '#/' + route }, route)
    await expect(overlay).toBeVisible()
  }
  const close = async () => {
    const rect = await overlay.boundingBox()
    await page.mouse.click(rect.x + 4, rect.y + 150)
    await expect(overlay).toHaveCount(0)
  }

  await page.mouse.click(700, 160)
  await page.keyboard.press('Escape')
  await expect(summary).toBeVisible()
  await expect.poll(async () => (await read('during')).summary).toBe('1')
  const before = await read('during')
  const routes = {}
  const chrome = ({ sidebarTop, sidebarWidth, barWidth, barDisplay, mainTop }) =>
    ({ sidebarTop, sidebarWidth, barWidth, barDisplay, mainTop })
  expect(typeof before.composerLeft).toBe('number')
  for (const route of ['profiles', 'settings', 'command-center', 'agents', 'cron', 'webhooks', 'starmap', 'session-import']) {
    await open(route)
    const during = await read('during')
    expect(chrome(during), route).toEqual(chrome(before))
    expect(during.summary, route).toBe('1')
    if (route === 'profiles' || route === 'settings') await screenshot('overlay-' + route + '.png')
    await read('watch')
    await close()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const frames = await read('frames')
    expect(frames.length, route).toBe(20)
    const composer = frames.flatMap(frame => frame.composerLeft === undefined ? [] : [frame.composerLeft])
    expect(composer.length, route).toBeGreaterThan(0)
    for (const frame of frames) {
      expect(chrome(frame), route).toEqual(chrome(before))
      expect(frame.summary, route).toBe('1')
    }
    const drift = Math.max(...composer.map(x => Math.abs(x - before.composerLeft)))
    expect(drift, route).toBeLessThan(1)
    routes[route] = { sidebarTop: during.sidebarTop, composerDrift: drift, frames: frames.length }
  }

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await open('settings')
  await close()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.press('Space')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  const tabs = page.locator('[data-zone-tabstrip="grp-main"]')
  await tabs.locator('button:has(> .codicon-add)').click()
  const selected = tabs.locator('[role="tab"][data-tree-tab^="session-tile:"][aria-selected="true"]')
  await expect(selected).toBeVisible()
  const created = await selected.getAttribute('data-tree-tab')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await tabs.locator('[role="tab"][data-tree-tab="workspace"]').click()
  const newTab = tabs.locator(`[role="tab"][data-tree-tab="${created}"]`)
  await newTab.hover()
  await newTab.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(newTab).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  return { routes, outsideAndEscape: true, closedStateRestored: true, newTab: true }
}

export async function verifySummaryTooltipsAndCopy({ page, expect, screenshot, projectChat, openThemeSettings, closeSettings }) {
  const tooltip = page.locator('[data-slot="tooltip-content"]:visible')
  const fallback = page.locator('[data-hcv-title-tip]:popover-open')
  const toggle = page.locator('[data-hcv-context-toggle]:visible')
  const search = page.locator('[data-hcv-search-toggle]:visible').first()
  const bell = page.locator('[data-hcv-notifications]:visible').first()
  const composer = page.locator('[data-slot="composer-surface"]:visible')
  const input = composer.locator('[data-slot="composer-rich-input"]')
  const model = composer.locator('[data-tour="model-pill"]')
  const shrink = async () => page.mouse.move(650, 160)
  async function checkStyle(tip) {
    await expect(tip).toBeVisible()
    await expect(tip).toHaveCSS('border-top-left-radius', '20px')
    await expect(tip).toHaveCSS('font-size', '13px')
    await expect(tip).toHaveCSS('font-weight', '430')
    await expect(tip).toHaveCSS('corner-shape', 'superellipse(1.5)')
    await expect(tip).toHaveCSS('font-family', /Segoe UI/)
    await expect(tip).toHaveCSS('box-shadow', 'none')
    await expect(tip).toHaveCSS('filter', 'none')
  }

  await projectChat('Ревью интерфейса').click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const controls = await verifyControlHover({ page, expect, screenshot, search, bell, toggle, composer, input, model })
  const overlays = await verifyWorkspaceOverlays({ page, expect, screenshot, toggle })
  await search.hover()
  await expect(fallback).toContainText('Поиск чатов')
  await expect(fallback.locator('kbd')).toHaveText('Ctrl+Shift+F')
  await checkStyle(fallback)
  await screenshot('tooltip-sidebar-search.png')
  await bell.hover()
  await expect(fallback).toHaveText('Уведомления')
  await checkStyle(fallback)
  await page.keyboard.press('Escape')
  await expect(fallback).toHaveCount(0)
  await expect(bell).toHaveAttribute('title', 'Уведомления')

  await toggle.hover()
  const summaryTip = tooltip.filter({ hasText: 'Скрыть сводку' })
  await checkStyle(summaryTip)
  await shrink()
  await model.hover()
  const modelTip = tooltip.filter({ hasText: 'Модель' })
  await checkStyle(modelTip)
  const modelCopy = modelTip.locator('[data-slot="tooltip-label"]')
  await expect(modelCopy).toHaveText(/^Модель [^·•]+$/)
  await expect(model).toHaveAttribute('aria-label', /^Модель [^·•]+$/)
  await expect(model).toHaveAccessibleDescription(/^Модель [^·•]+$/)
  await screenshot('tooltip-model.png')
  await shrink()

  const mic = composer.locator('[data-slot="fan-menu-anchor"] button, button:has(> .codicon-mic)').first()
  await expect(mic).toBeVisible()
  await page.evaluate(() => {
    const key = 'hermes.desktop.keybinds'
    const shortcuts = JSON.parse(localStorage.getItem(key) || '{}')
    localStorage.setItem(key, JSON.stringify({ ...shortcuts, 'composer.dictate': ['ctrl+shift+d'] }))
  })
  await mic.hover()
  const micTip = tooltip.filter({ hasText: 'Диктовать' })
  await checkStyle(micTip)
  await expect(micTip.locator('kbd')).toHaveText('Ctrl+Shift+D')
  await expect(micTip.locator('kbd')).toHaveCSS('border-radius', '999px')
  await screenshot('tooltip-dictation.png')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await search.hover()
  await checkStyle(fallback)
  await expect(fallback).toHaveCSS('background-color', 'rgb(37, 37, 37)')
  await expect(fallback).toHaveCSS('animation-name', 'none')
  await expect(search).toHaveCSS('transition-duration', /^(0s|1e-05s)$/)
  await expect(search).toHaveCSS('background-color', 'rgba(26, 28, 31, 0.05)')
  await screenshot('tooltip-light.png')
  await openThemeSettings()
  await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'dark')
  await closeSettings()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await shrink()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await input.fill('Проверка формата \u2014 после отправки.')
  await expect(input).toHaveText('Проверка формата \u2014 после отправки.')
  await input.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 20000 })
  await expect(page.getByText('Проверка формата - после отправки.', { exact: true })).toBeVisible()

  // A new text node and incremental text updates follow the same rule. Code
  // samples and editable values retain their original characters.
  await page.evaluate(() => {
    const fixture = document.createElement('section')
    fixture.dataset.hcvPunctuationFixture = ''
    const prose = document.createElement('p')
    prose.textContent = 'Новое \u2014 уведомление'
    const code = document.createElement('code')
    code.textContent = 'const sep = "\u2014"'
    const tip = document.createElement('div')
    tip.dataset.slot = 'tooltip-content'
    const dot = document.createElement('span')
    dot.textContent = '·'
    tip.append('Модель', dot, 'GPT')
    const customTip = document.createElement('div')
    customTip.dataset.hcvQueueTooltip = ''
    customTip.textContent = 'Отправить · сейчас'
    fixture.append(prose, code, tip, customTip)
    document.body.append(fixture)
  })
  const fixture = page.locator('[data-hcv-punctuation-fixture]')
  await expect(fixture.locator('[data-slot="tooltip-content"]')).toHaveText('Модель GPT')
  await expect(fixture.locator('[data-hcv-queue-tooltip]')).toHaveText('Отправить сейчас')
  await expect(fixture.locator('p')).toHaveText('Новое - уведомление')
  await expect(fixture.locator('code')).toHaveText('const sep = "\u2014"')
  await fixture.locator('p').evaluate(el => { el.firstChild.appendData(' \u2014 продолжение') })
  await expect(fixture.locator('p')).toHaveText('Новое - уведомление - продолжение')
  await fixture.evaluate(el => el.remove())
  await page.locator('[data-hcv-sidebar-shell] button:has([data-tour="sidebar-nav-new-session"]):visible').first().click()
  await expect(input).toBeEmpty()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await model.hover()
  await checkStyle(modelTip)
  await expect(modelCopy).toHaveText(/^Модель [^·•]+$/)
  await expect(model).toHaveAttribute('aria-label', /^Модель [^·•]+$/)
  await expect(model).toHaveAccessibleDescription(/^Модель [^·•]+$/)
  await screenshot('tooltip-model-draft.png')
  return { sidebar: true, model: true, modelDraft: true, dictation: true, reducedMotion: true, newTurnDefault: true,
    dashPresentation: true, controls, overlays }
}
