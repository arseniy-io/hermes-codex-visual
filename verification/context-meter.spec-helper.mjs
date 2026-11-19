import assert from 'node:assert/strict'

// Forward the real Hermes RPC and capture its native numbers before replacing
// the two counts with repeatable readings for the visual and switching checks.
export async function installContextFixture(page) {
  const requests = []
  const modelRequests = []
  const info = new Map()
  let window = 475_000
  let used = 379_000
  await page.routeWebSocket(url => url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    const pending = new Map()
    const modelPending = new Map()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.method === 'session.context_breakdown') {
        pending.set(frame.id, { session: frame.params.session_id, window, used })
      }
      if (frame.method === 'session.model' || (frame.method === 'session.mutate' && frame.params?.operation === 'model')) {
        const request = { method: frame.method, model: frame.params?.payload?.model, provider: frame.params?.payload?.provider }
        modelPending.set(frame.id, request)
        modelRequests.push(request)
      }
      upstream.send(message)
    })
    upstream.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.method === 'event' && frame.params?.type === 'session.info') {
        info.set(frame.params.session_id, frame.params.payload)
      }
      if (modelPending.has(frame.id)) {
        Object.assign(modelPending.get(frame.id), { error: frame.error, result: frame.result })
        modelPending.delete(frame.id)
      }
      const expected = pending.get(frame.id)
      if (expected) pending.delete(frame.id)
      if (expected && frame.result) requests.push({ ...expected, native: frame.result })
      if (!expected || !frame.result?.context_max) {
        route.send(message)
        return
      }
      route.send(JSON.stringify({
        ...frame,
        result: {
          ...frame.result,
          context_used: expected.used,
          context_max: expected.window,
          context_estimated: false,
        },
      }))
    })
  })
  return {
    requests,
    modelRequests,
    info,
    setWindow(max, nextUsed = used) { window = max; used = nextUsed },
  }
}

export async function verifyContextMeter({ page, expect, screenshot, projectChat, fixture, reply, inferenceModels }) {
  const meter = page.locator('[data-hcv-context-meter]')
  const detail = page.locator('[data-hcv-context-detail]:visible')
  const composer = page.locator('[data-slot="composer-surface"]:visible')
  const model = composer.locator('[data-tour="model-pill"]')
  const input = composer.getByRole('textbox', { name: 'Сообщение' })
  const runMockTurn = async prompt => {
    await input.fill(prompt)
    await input.press('Enter')
    await expect(page.getByText(reply, { exact: false }).first()).toBeVisible({ timeout: 40000 })
  }

  await expect(meter).toHaveCount(0)
  const projects = page.locator('[data-sessions-mode="projects"]')
  const project = projects.getByRole('button', { name: 'Тестовый проект', exact: true })
  await expect(project).toBeVisible()
  if (await project.getAttribute('aria-expanded') === 'false') await project.click()
  await projectChat('Ревью интерфейса').click()
  await runMockTurn('Продолжи проверку.')
  await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 80%', { timeout: 20000 })
  await expect(meter.locator('svg')).toHaveAttribute('viewBox', '0 0 12 12')
  await expect(meter.locator('svg circle').first()).toHaveAttribute('opacity', '0.16')
  await expect(meter.locator('[data-hcv-context-arc]')).toHaveAttribute('transform', 'rotate(-90 6 6)')
  await expect(meter.locator('[data-hcv-context-arc]')).toHaveAttribute('pathLength', '100')
  const left = await meter.boundingBox()
  const right = await model.boundingBox()
  assert(left && right && left.x + left.width <= right.x + 1, 'Context meter must precede the model')
  const firstSession = fixture.requests.at(-1).session
  await expect.poll(() => fixture.info.get(firstSession)?.running, { timeout: 20000 }).toBe(false)
  assert(fixture.requests.some(request => request.native.context_max > 0 && request.native.context_used >= 0))

  await meter.hover()
  await expect(detail).toContainText('80% заполнено')
  await expect(detail).toContainText('Использовано 379 к / 475 к токенов')
  await expect(page.locator('[data-hcv-context-tip] [data-slot="tooltip-arrow"]')).toBeHidden()
  await screenshot('context-meter.png')

  if (process.env.HERMES_VISUAL_CONTEXT_LANGUAGE_ONLY !== '1') {
    if (process.env.HERMES_VISUAL_CONTEXT_NATIVE_DIAGNOSTIC === '1') {
      await page.keyboard.press('Control+,')
      await page.getByText(/^(Внешний вид|Appearance)$/).first().click()
      await page.getByText(/^(Тема|Theme)$/).first().click()
      await page.getByText('Nous', { exact: true }).locator('xpath=ancestor::button[1]').click()
      await page.keyboard.press('Escape')
      await expect(meter).toHaveCount(0)
    }
    fixture.setWindow(900_000)
    await model.click()
    const search = page.getByPlaceholder(/поиск|search/i).last()
    await search.fill('mock-wide')
    const wide = page.locator('[data-slot="dropdown-menu-sub-trigger"]:visible')
      .filter({ has: page.getByText(/^mock[- ]wide$/i) }).first()
    await expect(wide).toBeVisible()
    console.log('Model picker matching rows', await wide.allTextContents())
    await wide.hover()
    console.log('Model picker provider choices', await page.locator('[role="menu"]:visible').allTextContents())
    // The row also contains a star that changes favorites instead of selecting
    // the model. Click its name, not an ambiguous point in the whole row.
    await wide.getByText(/^mock[- ]wide$/i).first().click()
    try {
      await expect(model).toContainText(/mock[- ]wide/i, { timeout: 20000 })
    } catch (error) {
      console.log('Model switch diagnostic:', JSON.stringify({ requests: fixture.modelRequests,
        contexts: fixture.requests.map(request => ({ session: request.session, model: request.native.model })),
        currentLabel: await model.getAttribute('aria-label'),
        dialogs: await page.getByRole('dialog').allTextContents(),
        notices: await page.locator('[role="alert"], [data-sonner-toast]').allTextContents() }))
      throw error
    }
    if (process.env.HERMES_VISUAL_CONTEXT_NATIVE_DIAGNOSTIC === '1') {
      console.log('Native theme model switch succeeded')
      return
    }
    await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 42%', { timeout: 15000 })
    assert(fixture.requests.some(request => request.session === firstSession && request.native.model === 'mock-wide'))
    await input.fill('Подтверди смену модели следующим ответом.')
    await input.press('Enter')
    await expect.poll(() => inferenceModels.at(-1), { timeout: 40000 }).toBe('mock-wide')
    await expect.poll(() => fixture.info.get(firstSession)?.running, { timeout: 40000 }).toBe(false)
  }

  fixture.setWindow(256_000, 64_000)
  await projectChat('Проверка каталога').click()
  await runMockTurn('Продолжи проверку каталога.')
  await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 25%', { timeout: 20000 })
  assert.notEqual(fixture.requests.at(-1).session, firstSession)
  await meter.hover()
  await expect(detail).toContainText('Использовано 64 к / 256 к токенов')
  const switchLanguage = async (label, language, locale) => {
    await page.evaluate(() => { location.hash = '#/settings?tab=config%3Aappearance&page=general' })
    await page.getByRole('button', { name: label }).click()
    const search = page.locator('input[cmdk-input]:visible')
    await search.fill(language)
    await expect(page.getByRole('option', { name: new RegExp(language) })).toHaveAttribute('aria-selected', 'true')
    await search.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await page.keyboard.press('Escape')
    const settings = page.locator('[data-overlay-surface]')
    try {
      await expect(settings).toHaveCount(0, { timeout: 1000 })
    } catch {
      // The language picker can still be open after choosing an item; the
      // first Escape closes it and the second returns to the chat.
      await page.keyboard.press('Escape')
      await expect(settings).toHaveCount(0)
    }
  }
  await switchLanguage('Сменить язык', 'English', 'en')
  await expect(meter).toHaveAttribute('aria-label', 'Context usage: 25%')
  await meter.hover()
  await expect(detail).toContainText('25% used (75% left)')
  await expect(detail).toContainText('Used 64k / 256k tokens')
  await switchLanguage('Switch language', 'Русский', 'ru')
  await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 25%')
  console.log(process.env.HERMES_VISUAL_CONTEXT_LANGUAGE_ONLY === '1'
    ? 'Verified native context RPC, ring, hover, chat and language changes; model switching was tested separately.'
    : 'Verified native context RPC, 12px Codex ring, hover, model and chat changes')
}
