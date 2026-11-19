const modelId = 'mock-wide'
const confirmation = 'hcv-test-confirmation'
const guard = [
  '!!! LARGE CONTEXT MODEL SWITCH !!!',
  '',
  'This session holds ~213,758 tokens of context.',
  `Switching to ${modelId} makes the next reply re-read all of it uncached (providers key prompt caches per model) — a one-time full-price input cost.`,
  '',
  'Threshold: model.switch_context_confirm_tokens (currently 100,000; 0 disables this check).',
  'Confirm only if you intend to switch now.',
].join('\n')

export async function installInterfaceCopyFixture(page) {
  const confirmations = []
  await page.routeWebSocket(url => url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const { id, method, params } = JSON.parse(String(message))
      const canonical = method === 'session.mutate' && params.operation === 'model' && params.payload?.model === modelId
      const legacy = method === 'config.set' && params.key === 'model' && params.value.split(' ')[0] === modelId
      if (!canonical && !legacy) {
        upstream.send(message)
        return
      }
      const token = canonical ? params.payload.confirm : params.confirm_expensive_model
      confirmations.push(token ?? null)
      // The confirmed switch fails locally so the real error toast can be
      // checked without changing the test model or contacting a provider.
      const result = token ? { error: { code: 5000, message: 'Gateway disconnected' } } : {
        result: {
          session_id: params.session_id, operation: 'model', status: 'confirmation_required',
          confirm: confirmation, confirm_required: true, confirm_message: guard,
        },
      }
      route.send(JSON.stringify({ jsonrpc: '2.0', id, ...result }))
    })
  })
  return confirmations
}

export async function verifyInterfaceCopy({ page, expect, screenshot, projectChat, confirmations, openThemeSettings, closeSettings, themeCard }) {
  const before = process.env.HERMES_VISUAL_INTERFACE_COPY_BEFORE === '1'
  const root = page.locator('html')
  await expect(root).toHaveAttribute('lang', 'ru')
  await projectChat('Ревью интерфейса').click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const history = chat.locator('[data-slot="aui_thread-viewport"]')
  const prose = 'Тестовый чат готов к проверке (ответ)'
  await expect(history.getByText(`${prose} ${before ? '—' : '-'} всё видно.`, { exact: true })).toBeVisible()
  await expect(history.locator('code').filter({ hasText: /^a—b$/ })).toBeVisible()
  const link = history.getByRole('link', { name: 'Ссылка — пример', exact: true })
  await expect(link).toHaveAttribute('href', 'https://example.invalid/a%E2%80%94b')

  const composer = chat.locator('[data-slot="composer-rich-input"]')
  const draft = 'Проверка — текст отправки.'
  await composer.fill(draft)
  await expect(composer).toHaveText(draft)
  await composer.press('Enter')
  await expect(history.getByText(`Новый ответ ${before ? '—' : '-'} готов.`, { exact: true })).toBeVisible({ timeout: 40000 })
  await expect(history.getByText(`Проверка ${before ? '—' : '-'} текст отправки.`, { exact: true })).toBeVisible()
  const model = chat.locator('[data-tour="model-pill"]')
  const dialog = page.getByRole('dialog', { name: `Переключиться на ${modelId}?` })
  const description = dialog.locator('[data-slot="dialog-description"]')
  const openGuard = async () => {
    await model.click()
    await page.getByPlaceholder(/поиск|search/i).last().fill(modelId)
    const row = page.locator('[data-slot="dropdown-menu-sub-trigger"]:visible').filter({ hasText: /mock[- ]wide/i }).first()
    await row.hover()
    await row.getByText(/^mock[- ]wide$/i).first().click()
    await expect(dialog).toBeVisible()
  }
  await openGuard()
  if (before) {
    await expect(description).toHaveText(guard)
    await screenshot('model-switch-before.png', { clip: await dialog.boundingBox() })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(confirmations).toEqual([null])
    return
  }

  await expect(description).toContainText('В этом чате около 213 758 токенов истории.')
  await expect(description).toContainText(`После перехода на ${modelId} первый запрос заново обработает всю историю.`)
  await expect(description).toContainText('входные токены в этом запросе будут стоить полную цену.')
  await expect(description).toContainText('Порог предупреждения - 100 000 токенов (model.switch_context_confirm_tokens, значение 0 отключает проверку).')
  await expect(description).not.toContainText(/LARGE CONTEXT|—/)
  await screenshot('model-switch-ru.png', { clip: await dialog.boundingBox() })
  // Simulate just the locale attribute changing with the same dialog mounted.
  await root.evaluate(element => { element.lang = 'en' })
  await expect(description).toHaveText(guard)
  await expect(history.getByText(`${prose} — всё видно.`, { exact: true })).toBeVisible()
  await root.evaluate(element => { element.lang = 'ru' })
  await expect(description).toContainText('Смена модели в длинном чате')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(confirmations).toEqual([null])

  await openGuard()
  await dialog.getByRole('button', { name: 'Оставить текущую модель' }).click()
  await expect(dialog).toHaveCount(0)
  expect(confirmations).toEqual([null, null])
  await openGuard()
  await dialog.getByRole('button', { name: 'Всё равно переключить' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => confirmations).toEqual([null, null, null, confirmation])
  const toast = page.locator('[data-slot="alert"][role="alert"]').filter({ hasText: 'Связь с Hermes потеряна.' }).last()
  await expect(toast).toBeVisible()
  const title = toast.locator('[data-slot="alert-title"]')
  const russianTitle = /^(Не удалось сменить модель|Смена модели не удалась)$/
  await expect(title).toHaveText(russianTitle)
  await expect(title).toHaveAttribute('title', russianTitle)
  await screenshot('connection-error-ru.png', { clip: await toast.boundingBox() })

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(history.getByText(`${prose} — всё видно.`, { exact: true })).toBeVisible()
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await expect(history.getByText(`${prose} - всё видно.`, { exact: true })).toBeVisible()
  console.log('Verified model confirmation, localized connection error, saved and streamed prose, code, links, draft, locale and theme.')
}
