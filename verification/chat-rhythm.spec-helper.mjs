import assert from 'node:assert/strict'

const prompt = 'Проверка живой ленты Chrome.'
const interim = 'Сначала проверю тестовую страницу.'
const answer = 'Проверка тестовой страницы завершена.'
const toolName = 'mcp__chrome_devtools__list_pages'
const toolId = 'hcv-live-chrome-fixture'
const secondToolName = 'mcp__chrome_devtools__click'
const secondToolId = 'hcv-live-chrome-next-fixture'

// Intercept only this test prompt in the isolated profile. The event payloads
// are the same ones Hermes receives from the gateway; no browser is opened.
export function createChatRhythmFixture() {
  let emit
  return {
    intercept(frame, route) {
      if (frame.method !== 'prompt.submit' || frame.params?.text !== prompt) return false
      const session = frame.params.session_id
      emit = (type, payload = {}) => route.send(JSON.stringify({
        jsonrpc: '2.0', method: 'event', params: { type, payload, session_id: session },
      }))
      route.send(JSON.stringify({
        jsonrpc: '2.0', id: frame.id,
        result: { admission_id: 'hcv-admission', ref: { session_id: session }, sequence: 1,
          status: 'started', outcome: null, authority_epoch: 1, execution_generation: 1 },
      }))
      setTimeout(() => {
        emit('message.start')
        emit('message.delta', { text: interim })
        emit('message.interim', { text: interim, already_streamed: true })
        emit('reasoning.delta', { text: 'Проверяю состояние страницы.' })
        emit('tool.start', { name: toolName, tool_id: toolId, args: {} })
      }, 150)
      return true
    },
    nextTool() {
      assert(emit, 'Expected the isolated prompt to start')
      emit('tool.complete', { name: toolName, tool_id: toolId, result: 'Тестовый результат.' })
      emit('tool.start', { name: secondToolName, tool_id: secondToolId, args: {} })
    },
    finish() {
      assert(emit, 'Expected the isolated prompt to start')
      emit('tool.complete', { name: secondToolName, tool_id: secondToolId, result: 'Тестовый результат.' })
      emit('message.delta', { text: answer })
      emit('message.complete', { text: answer })
    },
  }
}

export async function verifyChatRhythm({ page, expect, screenshot, fixture }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await editor.fill(prompt)
  await editor.press('Enter')
  await expect(editor).toHaveText('')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: prompt }).last()
  const lead = turn.locator('[data-slot="aui_assistant-message-content"]').filter({ hasText: interim }).first()
  const thought = turn.locator('[data-slot="aui_thinking-disclosure"]').first()
  const compact = turn.locator('[data-hcv-activity-group] > button').first()
  const integration = turn.locator('[data-tool-row][data-hcv-activity-icon="activityIntegration"]:visible').last()
  await expect(lead).toBeVisible({ timeout: 30000 })
  await expect(compact).toBeVisible({ timeout: 30000 })
  await expect(compact).toHaveText('List pages')
  await expect(compact.locator('..')).toHaveAttribute('data-hcv-activity-group', 'activityIntegration')
  await expect(thought).toBeHidden()
  await expect(turn.locator('[role="alert"]')).toHaveCount(0)
  await expect(page.getByText('Промпт не удался', { exact: true })).toHaveCount(0)
  const measurements = await turn.evaluate(root => {
    const rect = selector => root.querySelector(selector)?.getBoundingClientRect()
    const bubble = rect('button.composer-human-message')
    const content = rect('[data-slot="aui_assistant-message-content"]')
    const groupBox = rect('[data-hcv-activity-group]')
    const firstProse = rect('[data-slot="aui_assistant-message-content"] .aui-md')
    const response = root.querySelector('[data-slot="aui_response-group"]')
    return {
      userToResponse: content.top - bubble.bottom,
      proseToGroup: groupBox.top - firstProse.bottom,
      responseGap: getComputedStyle(response).rowGap,
    }
  })
  assert.equal(measurements.userToResponse, 46)
  assert.equal(measurements.proseToGroup, 16)
  assert.equal(measurements.responseGap, '16px')
  await compact.click()
  await expect(thought).toBeHidden()
  await expect(integration.getByText('List pages', { exact: true })).toBeVisible()
  fixture.nextTool()
  await expect(compact).toHaveText('Click')
  await expect(compact).toHaveAttribute('aria-expanded', 'true')
  await expect(integration.getByText('Click', { exact: true })).toBeVisible()
  await screenshot('live-chrome-rhythm.png')
  fixture.finish()
  await expect(turn.getByText(answer, { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(turn.locator('[data-slot="aui_msg-actions"]')).toHaveCount(1)
  return { ...measurements, integrationIconDuringCall: true, namedToolActions: true, reasoningHidden: true, completedAnswer: true }
}
