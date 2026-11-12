import assert from 'node:assert/strict'

// Forward the real Hermes RPC and capture its native numbers before replacing
// the two counts with repeatable readings for the visual and switching checks.
export async function installContextFixture(page) {
  const requests = []
  let window = 475_000
  let used = 379_000
  await page.routeWebSocket(url => url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    const pending = new Map()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.method === 'session.context_breakdown') {
        pending.set(frame.id, { session: frame.params.session_id, window, used })
      }
      upstream.send(message)
    })
    upstream.onMessage(message => {
      const frame = JSON.parse(String(message))
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
    setWindow(max, nextUsed = used) { window = max; used = nextUsed },
  }
}

export async function verifyContextMeter({ page, expect, screenshot, projectChat, fixture, reply }) {
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
  assert(fixture.requests.some(request => request.native.context_max > 0 && request.native.context_used >= 0))

  await meter.hover()
  await expect(detail).toContainText('80% заполнено')
  await expect(detail).toContainText('Использовано 379 к / 475 к токенов')
  await expect(page.locator('[data-hcv-context-tip] [data-slot="tooltip-arrow"]')).toBeHidden()
  await screenshot('context-meter.png')

  fixture.setWindow(900_000)
  await model.click()
  const search = page.getByPlaceholder(/поиск|search/i).last()
  await search.fill('mock-wide')
  await expect(page.getByText(/^mock[- ]wide$/i).first()).toBeVisible()
  await search.press('Enter')
  await expect(model).toContainText(/mock[- ]wide/i, { timeout: 20000 })
  await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 42%', { timeout: 15000 })
  assert(fixture.requests.some(request => request.session === firstSession && request.native.model === 'mock-wide'))

  fixture.setWindow(256_000, 64_000)
  await projectChat('Проверка каталога').click()
  await runMockTurn('Продолжи проверку каталога.')
  await expect(meter).toHaveAttribute('aria-label', 'Использование контекста: 25%', { timeout: 20000 })
  assert.notEqual(fixture.requests.at(-1).session, firstSession)
  await meter.hover()
  await expect(detail).toContainText('Использовано 64 к / 256 к токенов')
  console.log('Verified native context RPC, 12px Codex ring, hover, model and chat changes')
}
