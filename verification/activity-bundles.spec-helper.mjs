import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const prompt = 'Проверь группировку действий в живой ленте.'
const interim = 'Сначала проверю страницу и файлы.'
const answer = 'Проверка группировки завершена.'
const middle = 'Страница проверена, продолжаю работу.'
const browser = { name: 'mcp__chrome_devtools__list_pages', id: 'bundle-browser-1' }
const command = { name: 'terminal', id: 'bundle-command-1' }
const failed = { name: 'mcp__chrome_devtools__take_snapshot', id: 'bundle-browser-failed' }
const agent = { name: 'delegate_task', id: 'bundle-agent-1', goal: 'Проверка тестовым агентом',
  subagentId: 'bundle-reviewer', childSession: '20261120_170001_bab001', taskName: 'bundle_reviewer' }
const read = { name: 'read_file', id: 'bundle-read-1' }
const second = { name: 'mcp__chrome_devtools__click', id: 'bundle-browser-2' }
const agentFields = () => ({ subagent_id: agent.subagentId, child_session_id: agent.childSession,
  task_name: agent.taskName, agent_path: '/root/' + agent.taskName, goal: agent.goal, task_index: 0,
  model: 'gpt-6.1-sol', reasoning_effort: 'max' })

// Local protocol events only. No GitHub request, browser action, command, or
// model invocation is performed. Captions and states come from the Codex
// contracts recorded in docs/chat-timeline-contract.md.
export function createActivityBundlesFixture() {
  let emit
  let commandFinished = false
  return {
    intercept(frame, route) {
      if (frame.method !== 'prompt.submit' || frame.params?.text !== prompt) return false
      const session = frame.params.session_id
      emit = (type, payload = {}) => route.send(JSON.stringify({ jsonrpc: '2.0', method: 'event',
        params: { type, payload, session_id: session } }))
      route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id,
        result: { admission_id: 'hcv-bundles', ref: { session_id: session }, sequence: 1,
          status: 'started', outcome: null, authority_epoch: 1, execution_generation: 1 } }))
      setTimeout(() => {
        emit('message.start')
        emit('message.delta', { text: interim })
        emit('message.interim', { text: interim, already_streamed: true })
        emit('reasoning.delta', { text: 'Смотрю страницу.' })
        for (let index = 0; index < 13; index++) {
          const id = 'bundle-github-' + index
          emit('tool.start', { name: 'mcp__github__fetch_file', tool_id: id, args: {
            path: 'fixture-' + index + '.md', hermes_tool_labels: [{ kind: 'mcp', app: 'GitHub',
              name: 'mcp__github__fetch_file', action: 'fetch file', emoji: '', preview: '', text: 'GitHub · fetch file',
              display: { version: 1, registered_name: 'mcp__github__fetch_file', server: 'github', tool: 'fetch_file',
                definition: { title: 'fetch_file' } } }],
          } })
          emit('tool.complete', { name: 'mcp__github__fetch_file', tool_id: id,
            result: { success: true, content: 'Тестовый файл ' + index } })
        }
        emit('tool.start', { name: browser.name, tool_id: browser.id, args: {} })
      }, 150)
      return true
    },
    next() {
      assert(emit, 'Expected the isolated prompt to start')
      emit('tool.complete', { name: browser.name, tool_id: browser.id, result: { success: true, content: 'Страница проверена.' } })
      emit('reasoning.delta', { text: 'Теперь проверяю файлы.' })
      emit('tool.start', { name: command.name, tool_id: command.id, args: { command: 'echo fixture-bundle' } })
    },
    beginError() {
      emit('tool.complete', { name: command.name, tool_id: command.id, result: 'fixture-bundle-output' })
      commandFinished = true
      emit('reasoning.delta', { text: 'Проверяю ошибку.' })
      emit('tool.start', { name: failed.name, tool_id: failed.id, args: {} })
    },
    fail() {
      emit('tool.complete', { name: failed.name, tool_id: failed.id,
        result: { error: 'Тестовая ошибка браузера', success: false } })
    },
    beginAgent() {
      emit('tool.start', { name: agent.name, tool_id: agent.id,
        args: { tasks: [{ goal: agent.goal, task_name: agent.taskName }] } })
      const delegation_id = 'bundle-delegation'
      emit('subagent.start', { ...agentFields(), delegation_id, status: 'running', started_at: Date.now() / 1000 })
      // The native background call confirms dispatch while the child is still running.
      emit('tool.complete', { name: agent.name, tool_id: agent.id,
        result: { status: 'dispatched', mode: 'background', delegation_id, goals: [agent.goal],
          subagent_ids: [agent.subagentId], task_names: [agent.taskName], agent_paths: ['/root/' + agent.taskName] } })
    },
    completeAgent() {
      const summary = 'Агент завершил проверку.'
      emit('subagent.complete', { ...agentFields(), status: 'completed', duration_seconds: 8, summary })
      emit('reasoning.delta', { text: 'Проверяю файл после агента.' })
      emit('tool.start', { name: read.name, tool_id: read.id, args: { path: 'fixture-note.md' } })
    },
    nextComment() {
      emit('tool.complete', { name: read.name, tool_id: read.id, result: { content: 'fixture note' } })
      emit('tool.start', { name: 'write_file', tool_id: 'bundle-created-file', args: { path: 'fixture-created.md' } })
      emit('tool.complete', { name: 'write_file', tool_id: 'bundle-created-file', result: {
        files_created: ['fixture-created.md'],
        diff: '--- /dev/null\n+++ b/fixture-created.md\n@@ -0,0 +1,1216 @@\n' + '+fixture line\n'.repeat(1216),
      } })
      emit('message.delta', { text: middle })
      emit('message.interim', { text: middle, already_streamed: true })
      emit('reasoning.delta', { text: 'Ещё один шаг после комментария.' })
      emit('tool.start', { name: second.name, tool_id: second.id, args: {} })
    },
    finish() {
      assert(emit, 'Expected the isolated prompt to start')
      if (!commandFinished) emit('tool.complete', { name: command.name, tool_id: command.id, result: 'fixture-bundle-output' })
      else emit('tool.complete', { name: second.name, tool_id: second.id, result: { success: true, content: 'Последний шаг проверен.' } })
      emit('message.delta', { text: answer })
      emit('message.complete', { text: answer })
    },
  }
}

export async function verifyActivityBundles({ page, expect, screenshot, fixture }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await editor.fill(prompt)
  await editor.press('Enter')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: prompt }).last()
  await expect(turn.getByText(interim, { exact: true })).toBeVisible({ timeout: 30000 })
  fixture.next()
  const groups = turn.locator('[data-hcv-activity-group] > button')
  await expect(groups.first()).toHaveText('Выполняется команда', { timeout: 30000 })
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'false')
  await expect(turn.locator('[data-hcv-activity-member]:visible')).toHaveCount(0)
  await screenshot('bundles-live-collapsed.png')
  await page.keyboard.down('Tab')
  await groups.first().focus()
  await page.keyboard.up('Tab')
  await page.keyboard.press('Enter')
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true')
  const repeated = turn.locator('[data-hcv-activity-repeat="activityGithub"] > button')
  try {
    await expect(repeated).toHaveText('fetch_file · 13 вызовов')
  } catch (error) {
    const debug = await turn.evaluate(turn => {
      const compactPart = part => part && ({ type: part.type, toolName: part.toolName,
        toolCallId: part.toolCallId, resultPresent: part.result !== undefined,
        completedAt: part.completedAt, args: part.args, isError: part.isError, status: part.status })
      const fiber = element => {
        const keys = Object.keys(element)
        let node = element[keys.find(key => key.startsWith('__reactFiber$'))]
        const props = element[keys.find(key => key.startsWith('__reactProps$'))]
        if (node?.memoizedProps !== props) node = node?.alternate
        const trace = []
        for (let level = 0; node && level < 10; node = node.return, level++) {
          const props = node.memoizedProps
          trace.push({ name: typeof node.type === 'string' ? node.type : node.type?.name || node.type?.displayName,
            propKeys: Object.keys(props || {}), part: compactPart(props?.part), alternatePart: compactPart(node.alternate?.memoizedProps?.part),
            start: props?.startIndex, end: props?.endIndex, live: props?.live,
            contexts: [...(function* () { for (let c = node.dependencies?.firstContext; c; c = c.next) yield {
              keys: Object.keys(c.memoizedValue || {}), messageKeys: Object.keys(c.memoizedValue?.message || {}) } })()] })
        }
        return trace
      }
      return { headers: [...turn.querySelectorAll('[data-hcv-activity-group]')].map(node => node.outerHTML),
        nativeGroups: [...turn.querySelectorAll('[data-tool-group]')].map(node => ({
          html: node.outerHTML.slice(0, 6000), trace: fiber(node) })),
        rows: [...turn.querySelectorAll('[data-tool-row]')].map(node => ({
          html: node.outerHTML.slice(0, 1500), parent: node.parentElement.outerHTML.slice(0, 450),
          ancestors: [...(function* () { for (let parent = node.parentElement, n = 0; parent && n < 5; parent = parent.parentElement, n++) yield {
            tag: parent.tagName, slot: parent.getAttribute('data-slot'), toolGroup: parent.hasAttribute('data-tool-group'),
            activity: parent.getAttribute('data-hcv-activity-member') } })()],
          trace: fiber(node) })) }
    })
    console.log('Activity bundles repeat diagnostic', JSON.stringify(debug))
    throw error
  }
  await expect(repeated).toHaveAttribute('aria-expanded', 'false')
  const repeatedRows = turn.locator('[data-hcv-activity-repeat-member]')
  await expect(repeatedRows).toHaveCount(13)
  await expect(repeatedRows.first()).toBeHidden()
  await repeated.click()
  await expect(repeated).toHaveAttribute('aria-expanded', 'true')
  await expect(repeatedRows.first()).toBeVisible()
  await expect(repeatedRows.locator('[data-hcv-activity-label]')).toHaveText(Array(13).fill('fetch_file'))
  // ConnectorTool's original row and caption stay mounted. Only the Codex
  // presentation label and missing glyph are painted beside that source.
  await expect(repeatedRows.locator('[data-hcv-activity-native-label]')).toHaveText(Array(13).fill('GitHub · fetch file'))
  await expect(repeatedRows.locator('[data-hcv-activity-fallback-icon]')).toHaveCount(13)
  const repeatedGlyphs = await repeatedRows.evaluateAll(rows => rows.map(row => {
    const title = row.querySelector('[data-hcv-activity-fallback-icon]')
    const css = getComputedStyle(title, '::before')
    return { icon: row.getAttribute('data-hcv-activity-icon'), width: css.width, height: css.height,
      mask: css.maskImage, content: css.content, originalParent: row.parentElement.hasAttribute('data-hcv-activity-repeat') === false }
  }))
  for (const glyph of repeatedGlyphs) {
    const svg = /data:image\/svg\+xml,([^")]+)/.exec(glyph.mask)?.[1]
    assert.equal(glyph.icon, 'activityGithub')
    assert.equal(glyph.width, '16px')
    assert.equal(glyph.height, '16px')
    assert.equal(glyph.originalParent, true)
    assert.equal(createHash('sha256').update(decodeURIComponent(svg || '')).digest('hex'),
      'd21c134c8753518eee32edb146e4a0c95381dc412769a9c42925bee0526ed39b')
  }
  await repeated.click()
  await expect(repeatedRows.first()).toBeHidden()
  await expect(turn.getByRole('button', { name: 'List pages', exact: true })).toBeVisible()
  fixture.beginError()
  fixture.fail()
  const errorRow = turn.locator('[data-tool-row][data-hcv-activity-failed][data-hcv-activity-icon="activityIntegration"]')
    .filter({ has: page.locator('[data-hcv-activity-label]').getByText('Take snapshot', { exact: true }) }).last()
  await expect(errorRow).toBeVisible({ timeout: 30000 })
  await expect(errorRow.locator('[data-hcv-activity-label]')).toHaveText('Take snapshot')
  await expect(errorRow.locator('[data-hcv-activity-native-label]')).toBeHidden()
  const failedGlyph = await errorRow.locator('svg.text-destructive[aria-label]').evaluate(svg => {
    const css = getComputedStyle(svg)
    return { color: css.color, mask: css.maskImage, width: css.width, height: css.height,
      paintedPaths: [...svg.children].filter(path => getComputedStyle(path).visibility !== 'hidden').length,
      expectedColor: getComputedStyle(svg.parentElement).color }
  })
  const failedAsset = /data:image\/svg\+xml,([^")]+)/.exec(failedGlyph.mask)?.[1]
  assert.equal(createHash('sha256').update(decodeURIComponent(failedAsset || '')).digest('hex'),
    'e4b6a7951536f14d9a6a3025ce0a9a8e89344483ead9f3b294118d5255432c43')
  assert.equal(failedGlyph.color, failedGlyph.expectedColor)
  assert.equal(failedGlyph.width, '16px')
  assert.equal(failedGlyph.height, '16px')
  assert.equal(failedGlyph.paintedPaths, 0)
  await expect(groups.first()).toHaveText('Использовано интеграции GitHub и Chrome Devtools выполнил команду')
  assert.equal(await groups.first().textContent(), (await groups.first().textContent()).replace(' · есть ошибки', ''))
  fixture.beginAgent()
  const started = turn.locator('[data-hcv-agent-activity="started"]')
  await expect(started).toHaveText('Bundle reviewer начал(-и) работу', { timeout: 30000 })
  await expect(started.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/)
  fixture.completeAgent()
  const completed = turn.locator('[data-hcv-agent-activity="completed"]')
  await expect(completed).toHaveText('Bundle reviewer завершил(-и) работу', { timeout: 30000 })
  assert.equal(await completed.locator('img').getAttribute('src'), await started.locator('img').getAttribute('src'))
  await expect(turn.locator('[data-hcv-agent-activity="dispatched"], [data-hcv-agent-activity="queued"]')).toHaveCount(0)
  await expect(started.locator('button[data-hcv-agent-name]')).toHaveText('Bundle reviewer')
  await expect(started.locator('button[data-hcv-agent-name]')).toBeEnabled()
  await groups.first().click()
  await expect(errorRow).toBeHidden()
  await expect(started).toBeVisible()
  await expect(completed).toBeVisible()
  await groups.first().click()
  await expect(errorRow).toBeVisible()
  await errorRow.getByRole('button').first().click()
  await expect(errorRow).toContainText('Тестовая ошибка браузера')
  await errorRow.getByRole('button').first().click()
  await screenshot('bundles-live-error-agent.png')
  fixture.nextComment()
  await expect(turn.getByText(middle, { exact: true })).toBeVisible({ timeout: 30000 })
  const editGroup = turn.locator('[data-hcv-activity-group="activityEdit"] > button')
  await expect(editGroup).toHaveAttribute('aria-expanded', 'false')
  await editGroup.click()
  const created = turn.locator('[data-tool-row][data-hcv-activity-icon="activityEdit"]')
  await expect(created).toHaveCount(1)
  const createdLabel = created.locator('[data-hcv-file-activity-label]')
  await expect(createdLabel).toHaveText('Создано fixture-created.md +1\u00a0216 −0')
  const marker = createdLabel.locator('[data-hcv-file-activity-marker="add"]')
  await expect(marker).toHaveCSS('width', '6px')
  await expect(marker).toHaveCSS('height', '6px')
  await expect(createdLabel.locator('[data-hcv-file-activity-counts]')).toHaveCSS('font-size', '13px')
  const createdToggle = created.locator('button[aria-expanded]').first()
  await createdToggle.click()
  await expect(createdLabel).toHaveText('Созданный файл')
  await expect(createdLabel.locator('[data-hcv-file-activity-marker]')).toHaveCount(0)
  await createdToggle.click()
  await expect(createdLabel).toHaveText('Создано fixture-created.md +1\u00a0216 −0')
  await expect(marker).toBeVisible()
  const lastGroup = groups.last()
  await expect(lastGroup).toHaveText('Click', { timeout: 30000 })
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'false')
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true')
  fixture.finish()
  await expect(turn.getByText(answer, { exact: true })).toBeVisible({ timeout: 30000 })
  const finished = turn.locator('button[data-hcv-turn-line]')
  if (await finished.count() && await finished.getAttribute('aria-expanded') !== 'true') await finished.click()
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'false')
  await lastGroup.click()
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'true')
  await expect(groups.first()).toHaveText('Использовано интеграции GitHub и Chrome Devtools выполнил команду')
  const metrics = await groups.first().evaluate(button => {
    const label = button.querySelector('span > span')
    const css = getComputedStyle(label)
    return { size: css.fontSize, line: css.lineHeight, weight: css.fontWeight,
      color: css.color, icon: getComputedStyle(button.firstElementChild, '::before').width }
  })
  assert.deepEqual(metrics, { size: '14px', line: '21px', weight: '430', color: 'rgba(255, 255, 255, 0.5)', icon: '16px' })
  await screenshot('bundles-complete-open.png')
  return { runningGroup: true, keyboardExpansion: true, repeatCount: 13, integrationNames: ['GitHub', 'Chrome Devtools'],
    errorsOnlyInside: true, namedAgentEvents: true, commentaryBoundary: true,
    createdFile: { added: 1216, removed: 0, markerSize: 6, countsSize: 13 }, metrics }
}
