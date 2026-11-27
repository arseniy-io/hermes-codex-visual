const fixtureText = 'Hermes could not start the assistant for this session. Details: The test connection closed before the assistant could reply. Diagnostic reference ' + '0123456789'.repeat(12)

export async function installReplyErrorFixture(page) {
  let failed = false
  await page.routeWebSocket(url => url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const request = JSON.parse(String(message))
      if (failed || request.method !== 'prompt.submit') {
        upstream.send(message)
        return
      }
      failed = true
      // Current Hermes validates that the admission belongs to this session.
      route.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {
        status: 'streaming', admission_id: 'hcv-fixture-error', ref: { session_id: request.params.session_id },
      } }))
      route.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: {
          type: 'error',
          session_id: request.params.session_id,
          payload: { message: fixtureText },
        },
      }))
    })
  })
}

export async function verifyReplyError({ page, expect, screenshot, projectChat, openThemeSettings, closeSettings }) {
  const before = process.env.HERMES_VISUAL_REPLY_ERROR_BEFORE === '1'
  await projectChat('Ревью интерфейса').click()
  await expect(page.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  const input = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]:visible')
  await input.fill('Проверка карточки ошибки.')
  await input.press('Enter')
  const card = page.locator('[data-slot="aui_assistant-message-content"] [role="alert"]').filter({ has: page.locator('.aui-error-action') })
  const modernCard = page.locator('[data-slot="aui_error-card"][role="alert"]')
  await expect.poll(async () => (await card.count()) + (await modernCard.count()), { timeout: 15000 }).toBeGreaterThan(0)
  if (await modernCard.count()) {
    await expect(modernCard).toHaveCSS('border-radius', '16px')
    await expect(modernCard).toHaveCSS('background-color', 'rgb(32, 32, 32)')
    await expect(modernCard).toHaveCSS('font-family', /Segoe UI/)
    await expect(modernCard.locator('.aui-error-card-icon')).not.toHaveCSS('mask-image', 'none')
    // Current Hermes uses a new error surface with one action and a details
    // toggle instead of the older four-action <details> card.
    const toggle = modernCard.locator('button[aria-controls][aria-expanded]')
    const details = modernCard.locator('[data-slot="aui_error-details"]')
    await expect(modernCard.getByRole('button', { name: /^(Retry|Повторить)$/i })).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(details).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(details.getByText(fixtureText, { exact: true })).toBeVisible()
    await screenshot('expanded.png', { clip: await modernCard.boundingBox() })
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await page.setViewportSize({ width: 620, height: 760 })
    await modernCard.scrollIntoViewIfNeeded()
    await expect(modernCard).toHaveCSS('background-color', 'rgb(250, 250, 250)')
    await expect.poll(() => modernCard.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(modernCard).not.toHaveCSS('border-radius', '16px')
    await expect(toggle).toBeVisible()
    await page.emulateMedia({ forcedColors: 'none' })
    // Changing theme may remount the native card, resetting the details state.
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click()
    await expect(details).toBeHidden()
    await modernCard.getByRole('button', { name: /Dismiss|Скрыть ошибку/i }).click()
    await expect(modernCard).toHaveCount(0)
    console.log('Verified current Hermes error card details, narrow layout, light theme, forced colors and dismissal')
    return
  }
  const details = card.locator('details')
  const summary = details.locator('summary')
  const actions = card.locator('.aui-error-action')
  const retry = card.getByRole('button', { name: /^(Retry|Повторить)$/i })
  const dismiss = card.getByRole('button', { name: /Dismiss|Скрыть ошибку/i })
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(retry).toBeVisible()
  await expect(actions).toHaveCount(4)
  await expect(summary).toBeVisible()
  await expect(details).not.toHaveAttribute('open', '')
  const appearance = await card.evaluate((el) => {
    const css = getComputedStyle(el)
    return { radius: css.borderRadius, background: css.backgroundColor, color: css.color, font: css.fontFamily }
  })
  console.log('Reply error card', JSON.stringify(appearance))
  await screenshot('collapsed.png', { clip: await card.boundingBox() })
  await summary.click()
  await expect(details).toHaveAttribute('open', '')
  await expect(details.getByText(fixtureText, { exact: true })).toBeVisible()
  await screenshot('expanded.png', { clip: await card.boundingBox() })

  if (!before) {
    await expect(card).toHaveCSS('border-radius', '16px')
    await expect(card).toHaveCSS('background-color', 'rgb(32, 32, 32)')
    await expect(card).toHaveCSS('font-family', /Segoe UI/)
    await expect.poll(() => card.locator(':scope > div:first-child').evaluate(el => {
      const icon = getComputedStyle(el, '::before')
      return { color: icon.backgroundColor, masked: icon.maskImage !== 'none' }
    })).toEqual({ color: 'rgb(242, 128, 128)', masked: true })
    await expect(retry).toHaveCSS('border-radius', '8px')
    await expect(summary).toHaveCSS('border-radius', '8px')
    await summary.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(summary).toBeFocused()
    await expect(summary).toHaveCSS('outline-style', 'solid')
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
    await closeSettings()
    await page.setViewportSize({ width: 620, height: 760 })
    await card.scrollIntoViewIfNeeded()
    if (await details.getAttribute('open') === null) await summary.click()
    await expect(details).toHaveAttribute('open', '')
    await expect.poll(() => card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(card).toHaveCSS('background-color', 'rgb(250, 250, 250)')
    await screenshot('light-narrow.png', { clip: await card.boundingBox() })
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(card).not.toHaveCSS('border-radius', '16px')
    await page.emulateMedia({ forcedColors: 'none' })
  }
  await summary.click()
  await expect(details).not.toHaveAttribute('open', '')
  await dismiss.click()
  await expect(card).toHaveCount(0)
}


export const rateLimitPrompt = 'Проверка карточки лимита.'
const rateLimitError = 'Test provider request rate limit reached.'

export function replyWithRateLimit(response) {
  response.writeHead(429, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: {
    message: rateLimitError, type: 'rate_limit_error', code: 'rate_limit_exceeded',
  } }))
}

export async function verifyRateLimitCard({ page, expect, projectChat, editsPrompt, screenshot,
  openThemeSettings, closeSettings, rateLimitAttempts }) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const decline = page.getByRole('button', { name: 'Нет, спасибо', exact: true }).first()
  if (await decline.isVisible()) await decline.click()
  await projectChat('Ревью интерфейса').click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  const changes = chat.locator('[data-hcv-saved-turn-card]')
  await expect(chat.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await editor.fill(editsPrompt)
  await editor.press('Enter')
  await expect(changes.locator('[data-hcv-turn-card-title]')).toHaveText('Изменено 5 файлов', { timeout: 60000 })
  const card = chat.locator('[data-slot="aui_error-card"][role="alert"]')
  const retry = card.getByRole('button', { name: 'Повторить', exact: true })
  const toggle = card.locator('button[aria-controls][aria-expanded]')
  const dismiss = card.getByRole('button', { name: 'Скрыть ошибку', exact: true })
  const details = card.locator('[data-slot="aui_error-details"]')
  await editor.fill(rateLimitPrompt)
  await editor.press('Enter')
  await expect.poll(rateLimitAttempts, { timeout: 20000 }).toBeGreaterThan(0)
  await expect(card).toContainText('Достигнут лимит запросов', { timeout: 30000 })
  await expect(card).toHaveAttribute('data-severity', 'degraded')

  const checkWidth = async () => {
    let edges
    await expect.poll(async () => {
      const [error, files] = await Promise.all([card.boundingBox(), changes.boundingBox()])
      if (!error || !files) return Infinity
      edges = { error: [error.x, error.x + error.width], files: [files.x, files.x + files.width] }
      return Math.max(...edges.error.map((edge, index) => Math.abs(edge - edges.files[index])))
    }).toBeLessThan(0.5)
    await expect.poll(() => card.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    return edges
  }
  const checkButtons = async () => {
    await page.mouse.move(4, 40)
    const review = changes.locator('[data-hcv-turn-card-review]')
    for (const prop of ['block-size', 'border-radius', 'font-size', 'font-weight', 'border-top-width', 'background-color']) {
      await expect(retry).toHaveCSS(prop, await review.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), prop))
    }
    await expect(toggle).toHaveCSS('text-decoration-line', 'none')
    await expect(dismiss).toHaveCSS('block-size', '24px')
    const fills = []
    for (const button of [retry, toggle, dismiss]) {
      await page.mouse.move(4, 40)
      const fill = () => button.evaluate(node => getComputedStyle(node).backgroundColor)
      const rest = await fill()
      await button.hover()
      await expect.poll(fill).not.toBe(rest)
      fills.push({ rest, hover: await fill() })
    }
    await page.mouse.move(4, 40)
    return fills
  }
  const dark = { edges: await checkWidth(), buttons: await checkButtons() }
  await screenshot('rate-limit-dark.png', { locator: card })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(details).toContainText(rateLimitError)
  await checkWidth()

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await closeSettings()
  for (const name of ['Скрыть боковую панель', 'Скрыть сводку']) {
    const hide = page.getByRole('button', { name, exact: true })
    if (await hide.isVisible()) await hide.click()
  }
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 620, height: 760 })
  await expect(page.locator('[data-narrow-overlay]')).toHaveCount(0)
  await expect(card).toHaveCSS('background-color', 'rgb(250, 250, 250)')
  const lightNarrow = { edges: await checkWidth(), buttons: await checkButtons() }
  await screenshot('rate-limit-light-narrow.png', { locator: card })
  await page.setViewportSize(viewport)

  const attemptsBeforeRetry = rateLimitAttempts()
  await retry.click()
  await expect.poll(rateLimitAttempts, { timeout: 20000 }).toBeGreaterThan(attemptsBeforeRetry)
  await expect(card).toHaveCount(2, { timeout: 30000 })
  await expect(card.last()).toContainText('Достигнут лимит запросов')
  await dismiss.last().click()
  await expect(card).toHaveCount(1)
  await dismiss.click()
  await expect(card).toHaveCount(0)
  return { dark, lightNarrow, retryAndDismiss: true, detailsOpened: true }
}
