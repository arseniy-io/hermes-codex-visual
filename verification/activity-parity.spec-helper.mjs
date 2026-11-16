import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const mark = '[data-hcv-activity-label]'
const icon = '[data-hcv-activity-icon]'

export async function installActivityReadinessFixture(page) {
  const replies = {
    'setup.status': { provider_configured: true, ready: true, free_tier_route: false },
    'setup.runtime_check': { ok: true, provider: 'custom', model: 'mock-model', free_tier_route: false },
  }
  await page.routeWebSocket(url => url.protocol === 'ws:' && url.hostname === '127.0.0.1' &&
    url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.id != null && Object.hasOwn(replies, frame.method)) {
        route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: replies[frame.method] }))
      } else upstream.send(message)
    })
  })
}

function maskHash(value) {
  const body = /data:image\/svg\+xml,([^")]+)/.exec(value)?.[1]
  return body ? createHash('sha256').update(decodeURIComponent(body)).digest('hex') : null
}

export async function verifyActivityParity({ page, app, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard }) {
  const before = process.env.HERMES_VISUAL_ACTIVITY_BEFORE === '1'
  const fixtureIcon = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#292929"/><path d="M5 5h6M8 5v6" stroke="white" stroke-width="1.4"/></svg>',
  ).toString('base64')
  await app.evaluate(({ ipcMain }, image) => {
    globalThis.hcvActivityFaviconRequests = []
    ipcMain.removeHandler('hermes:resolveFavicon')
    ipcMain.handle('hermes:resolveFavicon', (_event, url) => {
      globalThis.hcvActivityFaviconRequests.push(url)
      return url === 'https://www.threads.com' ? image : ''
    })
  }, fixtureIcon)
  await page.setViewportSize({ width: 1440, height: 960 })
  await projectChat('Проверка каталога').click()
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Проверка оформления закончена.' })
  await expect(turn).toBeVisible()
  const steps = turn.locator('button[data-hcv-turn-line]')
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  const skill = turn.locator('[data-hcv-skill-link]').filter({ hasText: 'Мультролики с твоим героем' })
  const legacySkill = turn.locator('span[title$="/SKILL.md"]')
  const prose = turn.locator('.aui-md').filter({ hasText: 'Для сборки использую' }).first()
  await prose.scrollIntoViewIfNeeded()

  if (before) {
    await screenshot('activities.png')
    return {
      skillFileCard: await legacySkill.evaluate(span => getComputedStyle(span.parentElement).display),
      skillLabels: await turn.locator('[data-hcv-skill-link]').allTextContents(),
      nativeBrowserRows: await turn.locator('[data-tool-summary] button').allTextContents(),
    }
  }
  await expect(skill).toBeVisible()
  await expect(skill).toHaveAttribute('href', /^#preview\//)
  await expect(legacySkill).toBeHidden()
  await expect(turn.locator('code').getByText('$fixture-skill', { exact: true })).toBeVisible()
  await expect(turn.locator('span[title$="/fixture-note.md"]')).toBeVisible()
  await expect(turn.locator('[data-tool-row][data-hcv-activity-icon="chatSkill"]')).toBeVisible()
  const browser = turn.locator(`${icon}[data-tool-summary]`).filter({ has: page.locator(mark).getByText('Использовал браузер и Chrome выполнил команды', { exact: true }) })
  await expect(browser).toBeVisible()
  const site = turn.locator(mark).getByText('Проверяю Threads в новой вкладке Chrome', { exact: true })
  await site.scrollIntoViewIfNeeded()
  await expect(site).toBeVisible()
  const siteImage = site.locator('..').locator('img[data-hcv-activity-favicon]')
  await expect(siteImage).toHaveAttribute('src', fixtureIcon)
  await expect.poll(() => siteImage.evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
  await expect(siteImage).toHaveCSS('width', '16px')
  const command = turn.locator('[data-tool-summary]').filter({ has: page.locator(mark).getByText('Выполнил команды', { exact: true }) })
  await expect(command).toBeVisible()
  const integration = turn.locator('[data-tool-row][data-hcv-activity-icon="activityIntegration"]').locator(mark)
  await expect(integration).toHaveText('Вызвал инструмент')
  assert.match(await integration.evaluate(label => getComputedStyle(label.parentElement, '::before').maskImage), /^url\(/)
  const agent = turn.locator('[data-hcv-agent-activity="completed"]').filter({ hasText: 'Thread research завершил(-и) работу' })
  await expect(agent).toBeVisible()
  const failed = turn.locator('[data-tool-row]').filter({ has: page.locator('svg.text-destructive[aria-label]') })
  await expect(failed).toBeVisible()
  await expect(failed.locator(mark)).toHaveCount(0)
  await expect(failed.locator('[data-hcv-activity-favicon]')).toHaveCount(0)

  const skillStyle = await skill.evaluate(link => {
    const style = getComputedStyle(link)
    const icon = link.firstElementChild
    const glyph = getComputedStyle(icon, '::before')
    return { color: style.color, weight: style.fontWeight, display: style.display, width: glyph.width,
      iconGap: getComputedStyle(icon).paddingInlineEnd, mask: glyph.maskImage }
  })
  const rowStyle = await browser.locator(mark).evaluate(label => {
    const row = label.parentElement
    const glyph = getComputedStyle(row, '::before')
    const style = getComputedStyle(label)
    return { color: style.color, size: style.fontSize, lineHeight: style.lineHeight, weight: style.fontWeight,
      gap: getComputedStyle(row).gap, width: glyph.width, mask: glyph.maskImage }
  })
  const agentStyle = await agent.evaluate(row => ({
    gap: getComputedStyle(row).gap, lineHeight: getComputedStyle(row).lineHeight,
    width: getComputedStyle(row.querySelector('img')).width, color: getComputedStyle(row).color,
  }))
  assert.equal(skillStyle.color, 'rgb(153, 206, 255)')
  assert.equal(skillStyle.weight, '500')
  assert.equal(skillStyle.display, 'inline')
  assert.equal(skillStyle.width, '16px')
  assert.equal(skillStyle.iconGap, '3px')
  assert.equal(rowStyle.color, 'rgb(139, 139, 139)')
  assert.equal(rowStyle.size, '14px')
  assert.equal(rowStyle.lineHeight, '21px')
  assert.equal(rowStyle.weight, '430')
  assert.equal(rowStyle.gap, '8px')
  assert.equal(rowStyle.width, '16px')
  assert.equal(agentStyle.gap, '6px')
  assert.equal(agentStyle.width, '16px')
  assert.equal(agentStyle.lineHeight, '20px')
  const maskSha256 = { skill: maskHash(skillStyle.mask), browser: maskHash(rowStyle.mask) }
  assert.equal(maskSha256.skill, 'cf5f6cd062f22cce9a3beeae612fbe72bab5c304fbd958a037925f78d19f8afb')
  assert.equal(maskSha256.browser, '6bb6168fe4a94f7495574909b6101a951e189cdd35e91d62582ef682ba4bd62c')
  delete skillStyle.mask
  delete rowStyle.mask
  const requests = await app.evaluate(() => globalThis.hcvActivityFaviconRequests.filter(url => url.includes('threads.com')))
  assert.deepEqual(requests, ['https://www.threads.com'])
  await prose.scrollIntoViewIfNeeded()
  await page.mouse.move(290, 130)
  await screenshot('activities.png')

  await page.bringToFront()
  const nativePreview = skill.locator('..').locator(':scope > button:last-child')
  await expect(nativePreview).toBeEnabled()
  await nativePreview.evaluate(button => button.addEventListener('click', () => {
    button.setAttribute('data-fixture-preview-clicked', 'true')
  }, { once: true }))
  await skill.click()
  await expect(nativePreview).toHaveAttribute('data-fixture-preview-clicked', 'true')
  await expect(page.getByText('Инструкция из отдельного профиля.', { exact: true })).toBeVisible({ timeout: 12000 })
  // Explicitly deliver Enter to the link; window focus is managed by the
  // OS during isolated tests, so native key delivery can go to another window.
  await skill.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await expect(page.getByText('Инструкция из отдельного профиля.', { exact: true })).toBeHidden()
  const commandToggle = command.locator('button[aria-expanded]')
  await commandToggle.click()
  const outputRow = turn.locator('[data-tool-row][data-hcv-activity-icon="activityTerminal"]').filter({
    has: page.locator('button').filter({ hasText: 'Выполнил команду' }),
  }).first()
  await outputRow.locator('button[aria-expanded]').click()
  await expect(outputRow.getByText('fixture-output-one', { exact: true })).toBeVisible()
  await commandToggle.click()
  await expect(outputRow.getByText('fixture-output-one', { exact: true })).toBeHidden()

  await page.setViewportSize({ width: 760, height: 760 })
  await expect(skill).toBeVisible()
  await skill.scrollIntoViewIfNeeded()
  await expect.poll(() => skill.evaluate(link => link.closest('p')?.getBoundingClientRect().right ?? 0)).toBeLessThanOrEqual(760)
  await screenshot('narrow.png')
  await page.setViewportSize({ width: 1440, height: 960 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  const lightColor = await skill.evaluate(link => getComputedStyle(link).color)
  assert.equal(lightColor, 'rgb(1, 105, 204)')
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(skill).toHaveCount(0)
  await expect(turn.locator(mark)).toHaveCount(0)
  await expect(legacySkill).not.toHaveCSS('display', 'none')
  return { skillStyle, rowStyle, agentStyle, maskSha256, lightColor, requests,
    clickPreview: true, enterClosesPreview: true, terminalDetails: true, errorPreserved: true, themeScoped: true }
}
