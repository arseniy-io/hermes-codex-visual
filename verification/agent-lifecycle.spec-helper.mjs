import assert from 'node:assert/strict'
import { verifyChildTimelineParity } from './timeline-parity.spec-helper.mjs'
import { verifySubagentToolGeometry } from './subagents-pane.spec-helper.mjs'

const prompt = 'Проверь методику, примеры и отступы с помощью трёх агентов.'
const lead = 'Сначала проверю правила, затем сверю примеры и оформление ленты.'
const afterA = 'Проверку методики запустил. Пока она идёт, проверю сохранённые файлы.'
const afterB = 'Проверка примеров завершена. Продолжаю сверку методики и отступов.'
const answer = 'Методика, примеры и отступы проверены. Замечания собраны.'
const queuedText = 'Тестовое сообщение в очереди при работе субагента.'
const agents = [
  { id: 'fixture-agent-method', taskName: 'agent_names', agentPath: '/root/agent_names', name: 'Agent names',
    childSession: '20261120_103001_ded001', goal: 'Независимый read-only критик E2 небольшой правки методики Rublix. Прочитай точные правила и найди смысловые противоречия. Файлы не меняй.' },
  { id: 'fixture-agent-examples', taskName: 'agent_events_tests', agentPath: '/root/agent_events_tests', name: 'Agent events tests',
    childSession: '20261120_103002_ded002', goal: 'Примени действующие проектные документы к восьми ситуациям из CONTROL-INPUTS.md. Для каждой ситуации проверь уместность ответа, не меняй исходные файлы.' },
  { id: 'fixture-agent-spacing', taskName: 'reference_audit', agentPath: '/root/reference_audit', name: 'Reference audit',
    // This ID deliberately has the same original Codex badge index as the
    // preceding agent; the plugin must still keep their images distinct.
    childSession: '20261120_103003_000004', goal: 'Проверь отступы в ленте Hermes Desktop и сравни их с Codex Desktop. Измерь промежутки между текстом, командами и событиями агентов.' },
]

// Only this isolated prompt is intercepted. The events use the real gateway
// protocol, but no agent, terminal command or external request is executed.
export function createAgentLifecycleFixture() {
  let emit
  let owner
  let sequence = 0
  let stage = 0
  let pending = []
  const active = new Map()
  const reply = (frame, route, result) => route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }))
  const begin = (indexes, toolId) => {
    assert(emit, 'Expected the isolated lifecycle prompt to start')
    const selected = indexes.map(index => agents[index])
    emit('tool.start', { name: 'delegate_task', tool_id: toolId,
      args: { tasks: selected.map(({ goal, taskName }) => ({ goal, task_name: taskName })) } })
    for (const [index, agent] of selected.entries()) {
      const payload = { subagent_id: agent.id, child_session_id: agent.childSession,
        task_name: agent.taskName, agent_path: agent.agentPath,
        goal: agent.goal, task_index: index, status: 'running', model: 'gpt-6.1-sol', reasoning_effort: 'max', started_at: Date.now() / 1000 }
      active.set(agent.id, payload)
      emit('subagent.start', payload)
    }
    emit('tool.complete', { name: 'delegate_task', tool_id: toolId,
      result: { status: 'dispatched', mode: 'background', count: selected.length,
        goals: selected.map(({ goal }) => goal), subagent_ids: selected.map(({ id }) => id),
        task_names: selected.map(({ taskName }) => taskName), agent_paths: selected.map(({ agentPath }) => agentPath), refused: [] } })
  }
  const complete = index => {
    const agent = agents[index]
    active.delete(agent.id)
    emit('subagent.complete', { subagent_id: agent.id, child_session_id: agent.childSession,
      task_name: agent.taskName, agent_path: agent.agentPath,
      goal: agent.goal, status: 'completed', duration_seconds: 8,
      summary: 'Проверка завершена. Замечания переданы основному агенту.' })
  }
  const commands = prefix => {
    for (const suffix of ['files', 'links']) {
      const toolId = `fixture-command-${prefix}-${suffix}`
      emit('reasoning.delta', { text: suffix === 'files' ? 'Проверяю сохранённые файлы.' : 'Проверяю связанные пути.' })
      emit('tool.start', { name: 'terminal', tool_id: toolId,
        args: { command: `node tools/check-${prefix}-${suffix}.mjs` } })
      emit('tool.complete', { name: 'terminal', tool_id: toolId,
        result: 'Сохранённые файлы проверены.' })
    }
  }
  return {
    agents,
    intercept(frame, route) {
      if (frame.method === 'prompt.cancel' && frame.params?.admission_id === 'hcv-queued-user') {
        pending = pending.filter(item => item.admission_id !== 'hcv-queued-user')
        reply(frame, route, { admission_id: 'hcv-queued-user', status: 'terminal', outcome: 'cancelled' })
        emit('session.info', { running: true, pending_submissions: pending })
        return true
      }
      if (frame.method === 'subagent.list' && owner && frame.params?.session_id === owner) {
        reply(frame, route, { subagents: [...active.values()] })
        return true
      }
      if (frame.method === 'session.transcript' && owner && frame.params?.session_id === owner &&
          agents.some(({ id }) => id === frame.params?.subagent_id)) {
        const id = frame.params.subagent_id
        const agent = agents.find(agent => agent.id === id)
        // The real child history is seeded in the isolated SessionDB. This
        // deliberately lossy canonical RPC must never supply its full tools.
        assert.equal(frame.params.limit, 1)
        reply(frame, route, { available: true, subagent_id: id, child_session_id: agent.childSession,
          running: active.has(id), rows: [{ role: 'assistant', text: 'Compact identity projection.' }],
          reset: true, next_cursor: '1' })
        return true
      }
      if (frame.method !== 'prompt.submit' || frame.params?.text !== prompt) return false
      owner = frame.params.session_id
      emit = (type, payload = {}) => route.send(JSON.stringify({
        jsonrpc: '2.0', method: 'event', params: { type, payload, session_id: owner,
          seq: ++sequence, timestamp: Date.now() / 1000 },
      }))
      reply(frame, route, { admission_id: 'hcv-agent-lifecycle', ref: { session_id: owner }, sequence: 1,
        status: 'started', outcome: null, authority_epoch: 1, execution_generation: 1 })
      setTimeout(() => {
        emit('message.start')
        emit('message.delta', { text: lead })
        emit('message.interim', { text: lead, already_streamed: true })
        begin([0], 'fixture-delegate-method')
        stage = 1
      }, 150)
      return true
    },
    showPending() {
      pending = [
        { admission_id: 'hcv-queued-user', status: 'queued', user: queuedText, controls: ['replace', 'steer'] },
      ]
      emit('session.info', { running: true, pending_submissions: pending })
    },
    afterFirstStart() {
      assert.equal(stage, 1)
      emit('message.delta', { text: afterA })
      emit('message.interim', { text: afterA, already_streamed: true })
      commands('before-agents')
      stage = 2
    },
    startRemaining() {
      assert.equal(stage, 2)
      begin([1, 2], 'fixture-delegate-examples-spacing')
      stage = 3
    },
    commandsAfterRemainingStart() {
      assert.equal(stage, 3)
      commands('after-agents')
      stage = 4
    },
    finishExamples() {
      assert.equal(stage, 4)
      complete(1)
      stage = 5
    },
    continueAfterExamples() {
      assert.equal(stage, 5)
      emit('message.delta', { text: afterB })
      emit('message.interim', { text: afterB, already_streamed: true })
      stage = 6
    },
    finishRemaining() {
      assert.equal(stage, 6)
      complete(0)
      complete(2)
      stage = 7
    },
    finish() {
      assert.equal(stage, 7)
      emit('message.delta', { text: answer })
      emit('message.complete', { text: answer })
      stage = 8
    },
  }
}

const rowSelector = (id, kind) => `[data-hcv-agent-activity="${kind}"][data-hcv-agent-ids*='"${id}"']`
const startedName = sentence => sentence.replace(/ начал(?:\(-и\))? работу$/, '')
const finishedName = sentence => sentence.replace(/ завершил(?:\(-и\))? работу$/, '')

async function rowSnapshot(row, id) {
  const text = (await row.innerText()).trim()
  const ids = JSON.parse(await row.getAttribute('data-hcv-agent-ids'))
  const icon = row.locator('img').nth(ids.indexOf(id))
  await icon.waitFor({ state: 'visible' })
  return { text, name: await row.locator(`[data-hcv-agent-link="${id}"][data-hcv-agent-name]`).textContent(),
    src: await icon.getAttribute('src') }
}

async function measure(turn) {
  return turn.evaluate((root, copy) => {
    const text = value => [...root.querySelectorAll('.aui-md')].find(node => node.textContent.trim() === value)
    const row = (id, kind) => root.querySelector(`[data-hcv-agent-activity="${kind}"][data-hcv-agent-ids*='"${id}"']`)
    const rect = node => {
      if (!node) throw new Error('Missing lifecycle measurement node')
      return node.getBoundingClientRect()
    }
    const commands = [...root.querySelectorAll('[data-hcv-activity-group]')]
    const flow = [text(copy.lead), row(copy.ids[0], 'started'), text(copy.afterA), commands[0],
      row(copy.ids[1], 'started'), commands[1], row(copy.ids[1], 'completed'),
      text(copy.afterB), row(copy.ids[0], 'completed'), text(copy.answer)]
    const boxes = flow.map(rect)
    const agent = flow[1]
    const css = getComputedStyle(agent)
    const icon = agent.querySelector('img').getBoundingClientRect()
    return {
      gaps: boxes.slice(1).map((box, index) => box.top - boxes[index].bottom),
      order: flow.map(node => node.textContent.trim()),
      lefts: boxes.map(box => box.left),
      style: { fontSize: css.fontSize, lineHeight: css.lineHeight, fontWeight: css.fontWeight,
        color: css.color, avatar: [icon.width, icon.height] },
    }
  }, { lead, afterA, afterB, answer, ids: agents.map(({ id }) => id) })
}

export async function verifyAgentLifecycle({ page, expect, projectChat, screenshot, projectFolder, fixture }) {
  const timelineParity = process.env.HERMES_VISUAL_TIMELINE_PARITY === '1'
  await page.setViewportSize({ width: 1600, height: 1100 })
  const prepareScreenshot = async () => {
    // This page belongs to the disposable test profile. Dismiss its native
    // telemetry prompt through the normal control so it cannot cover the feed.
    const decline = page.getByRole('button', { name: 'Нет, спасибо', exact: true }).first()
    if (await decline.isVisible()) {
      await decline.click()
      await expect(decline).toBeHidden()
    }
    await page.mouse.move(3, 80)
  }
  await prepareScreenshot()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await editor.fill(prompt)
  await editor.press('Enter')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: prompt }).last()
  const by = (index, kind) => turn.locator(rowSelector(agents[index].id, kind))
  await expect(turn.getByText(lead, { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(by(0, 'started')).toBeVisible({ timeout: 15000 })
  const dock = chat.locator('[data-slot="composer-dock"]')
  const nativeRoster = dock.locator('[data-slot="composer-subagents"]')
  await expect(nativeRoster).toHaveCount(1)
  await expect(nativeRoster.locator('..')).toHaveCSS('display', 'none')
  await expect(page.locator('[data-hcv-summary-agents]')).toBeVisible()

  // The isolated gateway supplies the projected user queue while the
  // roster is live. The personal-queue journey verifies delivery separately.
  fixture.showPending()
  const queue = dock.locator('[data-hcv-queue]')
  await expect(queue).toHaveCount(1)
  const drawerToggle = dock.locator('[data-slot="status-drawer-toggle"]')
  if (await drawerToggle.getAttribute('aria-expanded') === 'false') await drawerToggle.click()
  await expect(queue).toBeVisible()
  await expect(queue).toContainText(queuedText)
  await expect(nativeRoster.locator('..')).toHaveCSS('display', 'none')
  const queueCard = dock.locator('[data-slot="composer-status-stack"] > div')
  await expect(queueCard).toHaveCSS('margin-left', '18px')
  const queueRow = queue.locator('[data-slot="status-row"]').filter({ hasText: queuedText })
  await screenshot('agent-lifecycle-queue.png')
  await queueRow.locator('.status-dismiss-button').click()
  await expect(queueRow).toHaveCount(0)
  await expect(queue).toHaveCount(0)

  const original = new Map([[agents[0].id, await rowSnapshot(by(0, 'started'), agents[0].id)]])
  fixture.afterFirstStart()
  await expect(turn.getByText(afterA, { exact: true })).toBeVisible()
  await expect(turn.locator('[data-hcv-activity-group]')).toHaveCount(1)
  await expect(turn.locator('[data-hcv-activity-group]')).toBeVisible()
  fixture.startRemaining()
  for (const index of [1, 2]) {
    await expect(by(index, 'started')).toBeVisible()
    original.set(agents[index].id, await rowSnapshot(by(index, 'started'), agents[index].id))
  }
  const names = [...original.values()].map(({ name }) => name)
  assert.deepEqual(names, agents.map(({ name }) => name), 'Labels come from task paths, not Russian goal summaries')
  for (const { text, name, src } of original.values()) {
    assert.notEqual(text, name, 'A start row must include the action after the name')
    assert(src?.startsWith('data:image/svg+xml,'), 'Expected the agent avatar in the activity row')
  }
  assert.equal(new Set([...original.values()].map(({ src }) => src)).size, agents.length,
    'Different agents must retain different avatars even if their Codex badge indexes collide')
  fixture.commandsAfterRemainingStart()
  const compactGroups = turn.locator('[data-hcv-activity-group]')
  await expect(compactGroups).toHaveCount(2)
  // These two runs have no prose between them. Only the agents' start rows
  // separate them, and neither group may consume the other's terminal calls.
  for (const [index, prefix] of ['before-agents', 'after-agents'].entries()) {
    const toggle = compactGroups.nth(index).getByRole('button')
    await toggle.click()
    for (const suffix of ['files', 'links']) await expect(turn.getByRole('button', {
      name: `node tools/check-${prefix}-${suffix}.mjs`, exact: true,
    })).toBeVisible()
    const otherPrefix = index === 0 ? 'after-agents' : 'before-agents'
    await expect(turn.getByRole('button', { name: `node tools/check-${otherPrefix}-files.mjs`, exact: true })).toBeHidden()
    await toggle.click()
  }
  await prepareScreenshot()
  await screenshot('agent-lifecycle-running.png')
  fixture.finishExamples()
  await expect(by(1, 'completed')).toBeVisible()
  assert.equal((await rowSnapshot(by(1, 'completed'), agents[1].id)).name, names[1])
  for (const index of [0, 1, 2]) await expect(by(index, 'started')).toHaveText(original.get(agents[index].id).text)
  fixture.continueAfterExamples()
  await expect(turn.getByText(afterB, { exact: true })).toBeVisible()
  fixture.finishRemaining()
  for (const index of [0, 1, 2]) {
    await expect(by(index, 'completed')).toBeVisible()
    const completed = await rowSnapshot(by(index, 'completed'), agents[index].id)
    assert.equal(completed.name, names[index])
    assert.equal(completed.src, original.get(agents[index].id).src)
  }
  fixture.finish()
  await expect(turn.getByText(answer, { exact: true })).toBeVisible({ timeout: 15000 })
  const lifecycleDiagnostics = await turn.evaluate((root, expected) => {
    const data = node => Object.fromEntries([...node.attributes]
      .filter(attribute => attribute.name.startsWith('data-')).map(attribute => [attribute.name, attribute.value]))
    const describe = node => {
      const box = node.getBoundingClientRect()
      return { id: node.id, data: data(node), rect: { x: box.x, y: box.y, width: box.width, height: box.height } }
    }
    const leads = [...root.querySelectorAll('.aui-md')].filter(node => node.textContent.trim() === expected)
      .map(node => ({ ...describe(node), visible: node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }))
    const assistantRoots = [...root.querySelectorAll('[data-slot="aui_assistant-message-root"]')].map((node, rootIndex) => {
      const body = node.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
      return { rootIndex, ...describe(node),
        nativeParts: [...(body?.children ?? [])].filter(part => part.matches('.aui-md, [data-slot="tool-block"]')).map((part, partIndex) => ({
          partIndex, ...describe(part), text: part.textContent.trim().slice(0, 120),
        })) }
    })
    const generated = [...root.querySelectorAll('[data-hcv-agent-activity]')].map(node => ({
      ...describe(node), text: node.textContent.trim().slice(0, 120),
    }))
    return { leads, assistantRoots, generated }
  }, lead)
  console.log('Agent lifecycle final diagnostics', JSON.stringify(lifecycleDiagnostics))
  await expect(turn.locator('[data-hcv-agent-activity="started"]')).toHaveCount(2)
  await expect(turn.locator('[data-hcv-agent-activity="completed"]')).toHaveCount(2)
  const turnSummary = turn.locator('button[data-hcv-turn-line]')
  if (await turnSummary.count() && await turnSummary.getAttribute('aria-expanded') !== 'true') await turnSummary.click()
  await expect(turn.getByText(lead, { exact: true })).toBeVisible()
  for (const index of [0, 1, 2]) {
    await expect(by(index, 'started')).toBeVisible()
    await expect(by(index, 'completed')).toBeVisible()
  }
  await prepareScreenshot()
  await turn.evaluate(node => node.scrollIntoView({ block: 'center' }))
  await screenshot('agent-lifecycle-final-before-measure.png')
  const measurements = await measure(turn)
  assert.deepEqual(measurements.gaps, Array(9).fill(16), JSON.stringify(measurements))
  assert(measurements.lefts.every(left => left === measurements.lefts[0]), 'Agent and prose rows must share the same left edge')
  await turn.evaluate(node => node.scrollIntoView({ block: 'center' }))
  await prepareScreenshot()
  await screenshot('agent-lifecycle-completed.png')
  const turnBox = await turn.boundingBox()
  const viewport = page.viewportSize()
  assert(turnBox && viewport)
  const insideViewport = turnBox.x >= 0 && turnBox.y >= 0 &&
    turnBox.x + turnBox.width <= viewport.width && turnBox.y + turnBox.height <= viewport.height
  const detailClip = insideViewport ? turnBox : await turn.evaluate((root, copy) => {
    const prose = value => [...root.querySelectorAll('.aui-md')].find(node => node.textContent.trim() === value)
    const first = prose(copy.lead).getBoundingClientRect()
    const last = prose(copy.answer).getBoundingClientRect()
    const left = Math.max(0, Math.min(first.left, last.left) - 12)
    const top = Math.max(0, first.top - 12)
    const right = Math.min(innerWidth, Math.max(first.right, last.right) + 12)
    const bottom = Math.min(innerHeight, last.bottom + 12)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }, { lead, answer })
  assert(detailClip.width > 0 && detailClip.height > 0, 'Expected a visible native transcript clip')
  await screenshot('agent-lifecycle-thread-detail.png', { clip: detailClip })

  const firstLink = by(0, 'completed').locator(`[data-hcv-agent-link="${agents[0].id}"]`)
  const statusInk = await by(0, 'completed').evaluate(node => getComputedStyle(node).color)
  await firstLink.hover()
  await expect(firstLink).toHaveCSS('color', 'rgb(223, 223, 223)')
  assert.notEqual(await firstLink.evaluate(node => getComputedStyle(node).color), statusInk)
  // The status remains muted when the name alone is hovered.
  assert.equal(await by(0, 'completed').evaluate(node => getComputedStyle(node).color), statusInk)
  await firstLink.click()
  const pane = page.locator('[data-hcv-subagents-pane]:visible')
  const detail = pane.locator('[data-hcv-subagent-detail]')
  await expect(detail.locator('h2')).toHaveText(agents[0].name)
  await expect(detail.locator('[data-hcv-subagent-avatar]')).toHaveAttribute('src', original.get(agents[0].id).src)
  await expect(detail.locator('[data-hcv-subagent-model]')).toHaveText('GPT-6.1 Sol · Max')
  await expect(detail.locator('[data-hcv-agent-message="user"]').first()).toHaveText(agents[0].goal)
  await expect(detail).not.toContainText('Compact identity projection.')
  await expect(detail).not.toContainText('HCV_PRIVATE_')
  await expect(detail.locator('[data-hcv-agent-message="assistant"]').last()).toContainText('Проверка завершена.')
  // >100 persisted rows prove that this is not just the last fixed-size page.
  await expect(detail.locator('[data-hcv-agent-message="assistant"]')).toHaveCount(timelineParity ? 105 : 104)
  const childFeed = detail.locator('[data-hcv-subagent-feed]')
  await expect(childFeed).toHaveCSS('overflow-anchor', 'none')
  await expect.poll(() => childFeed.evaluate(node =>
    Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop)), {
    message: 'Opening long agent history scrolls to the last answer',
  }).toBeLessThanOrEqual(2)
  const manualScroll = await childFeed.evaluate(async node => {
    node.scrollTop = 100
    await new Promise(resolve => requestAnimationFrame(resolve))
    const before = node.scrollTop
    const growth = document.createElement('div')
    growth.style.height = '120px'
    node.firstElementChild.append(growth)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const after = node.scrollTop
    growth.remove()
    node.scrollTop = node.scrollHeight
    return { before, after }
  })
  assert.equal(manualScroll.after, manualScroll.before, 'A reading position must survive later content growth')
  const timelineResult = timelineParity ? await verifyChildTimelineParity({
    page, expect, detail, projectFolder, screenshot,
    reopen: async () => {
      await detail.getByRole('button', { name: 'Назад к субагентам' }).click()
      await by(0, 'completed').locator(`[data-hcv-agent-link="${agents[0].id}"]`).click()
      await expect(detail.locator('h2')).toHaveText(agents[0].name)
    },
  }) : null
  const toolGroup = detail.locator('[data-hcv-agent-turn-body] > [data-hcv-agent-tool] > button').first()
  const childGeometry = await verifySubagentToolGeometry({ page, expect, detail, toolGroup })
  const command = detail.getByRole('button', { name: 'node tools/check-agent.mjs', exact: true })
  await expect(command).toHaveCSS('font-size', '14px')
  await expect(command).toHaveCSS('line-height', '21px')
  await expect(command).toHaveAttribute('aria-expanded', 'false')
  await command.click()
  await expect(detail.locator('[data-hcv-terminal-header]')).toHaveText('Shell')
  await expect(detail.locator('[data-hcv-terminal-output]')).toContainText('Agent fixture command passed.')
  await expect(detail.locator('[data-hcv-terminal-status]')).toHaveText('Успех')
  const markdown = detail.locator('[data-hcv-agent-message="assistant"]').filter({ hasText: 'result.txt' })
  const snippet = markdown.locator('.aui-md code').filter({ hasText: 'result.txt' })
  await expect(snippet).toHaveCSS('padding-inline-start', '6px')
  await expect(snippet).toHaveCSS('border-radius', '6px')
  const table = markdown.locator('[data-hcv-markdown-table]')
  await table.scrollIntoViewIfNeeded()
  await table.hover()
  const expandTable = markdown.getByRole('button', { name: 'Развернуть таблицу' })
  await expect(expandTable).toBeVisible()
  await expandTable.click()
  const tableDialog = page.locator('[data-hcv-table-dialog]')
  await expect(tableDialog.getByRole('cell', { name: 'Готово' })).toBeVisible()
  await tableDialog.getByRole('button', { name: 'Закрыть предпросмотр таблицы' }).click()
  await expect(tableDialog).toHaveCount(0)
  console.log('Verified assistant Markdown with native inline code and table expansion')
  await screenshot('agent-lifecycle-transcript.png')
  await detail.getByRole('button', { name: 'Назад к субагентам' }).click()
  const done = pane.locator('[data-hcv-subagent-group="done"]')
  await expect(done.locator('[data-hcv-subagent-row]')).toHaveCount(3)
  for (const [index, { id, goal }] of agents.entries()) {
    const entry = done.locator(`[data-hcv-subagent-row="${id}"]`)
    await expect(entry.locator('[data-hcv-subagent-name]')).toHaveText(names[index])
    await expect(entry.locator('[data-hcv-subagent-name]')).toHaveAttribute('title', goal)
    await expect(entry.locator('[data-hcv-subagent-avatar]')).toHaveAttribute('src', original.get(id).src)
  }
  await prepareScreenshot()
  await screenshot('agent-lifecycle-pane.png')
  const paneClip = await pane.boundingBox()
  assert(paneClip && paneClip.width > 0 && paneClip.height > 0, 'Expected a visible native subagent pane clip')
  await screenshot('agent-lifecycle-pane-detail.png', { clip: paneClip })
  const draft = 'Черновик после проверки агентов'
  await editor.fill(draft)
  await projectChat('Ревью интерфейса').click()
  await expect(pane.locator('[data-hcv-subagent-row]')).toHaveCount(0)
  await projectChat('Проверка каталога').click()
  await expect(editor).toHaveText(draft)
  // Completed work is collapsed again after reopening the chat. Verify that
  // default, then inspect the same agent rows through the actual disclosure.
  await expect(turnSummary).toHaveAttribute('aria-expanded', 'false')
  await turnSummary.click()
  await expect(turnSummary).toHaveAttribute('aria-expanded', 'true')
  for (const [index, { id }] of agents.entries()) {
    await expect(by(index, 'started')).toHaveText(original.get(id).text)
    assert.equal((await rowSnapshot(by(index, 'completed'), id)).src, original.get(id).src)
    await expect(pane.locator(`[data-hcv-subagent-row="${id}"] [data-hcv-subagent-name]`)).toHaveText(names[index])
  }
  return { ...measurements, names, starts: 3, completions: 3, groupedStartRows: 2, groupedCompletionRows: 2, panelNamesMatch: true,
    nameOpensDetails: true, fullPagedChildTranscript: true, childCommandDetails: true, childGeometry,
    stableAvatars: true, commandGroupsSeparatedByAgent: true, switchAndDraftPreserved: true,
    producerNamesPreserved: true, lifecycleDiagnostics, timelineParity: timelineResult }
}
