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
      route.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { status: 'streaming' } }))
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
