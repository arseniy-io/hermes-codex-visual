import assert from 'node:assert/strict'
import test from 'node:test'
import { activityPresentation, activityToolPart, describeActivity, pendingActivityPart, repeatedActivityPresentation } from '../source/chat-activity-labels.js'
const call = (toolName, args = {}, result = {}) => ({ toolName, args, result, completedAt: 1 })

test('Chrome Devtools is a named integration with its actual tool action, independent of the current page', () => {
  for (const toolName of ['mcp_chrome_devtools_list_pages', 'mcp__chrome_devtools__list_pages']) {
    const part = call(toolName, { url: 'https://www.threads.com' }, { url: 'https://www.threads.com' })
    assert.equal(describeActivity(part).kind, 'integration')
    assert.equal(activityPresentation([part], false, true).label, 'Использовано интеграция Chrome Devtools')
    assert.equal(activityPresentation([part], false, true, true).label, 'List pages')
    assert.equal(activityPresentation([part], false, true).site, undefined)
    assert.equal(activityPresentation([part], false, true).icon, 'activityIntegration')
  }
})

test('browserUse metadata retains Codex browser-surface identity and the sanitized favicon origin', () => {
  const part = call('mcp__chrome__js', {}, { _meta: {
    'codex/toolSurface': { kind: 'browserUse', backend: 'chrome' },
    browser_use: { url: 'https://www.threads.com/@owner?secret=fixture' },
  } })
  assert.equal(describeActivity(part).kind, 'chrome')
  assert.equal(activityPresentation([part], false, true).site, 'https://www.threads.com')
  assert.equal(activityPresentation([part], false, true).icon, 'activityBrowser')
})

test('Codex summary keeps every category, source identity and unit-list separators with failures inside', () => {
  const read = call('read_file', { path: 'notes.md' })
  const skill = call('skill_view', { name: 'fixture' })
  const command = call('terminal', { command: 'echo example' })
  const edit = call('edit_file', { path: 'notes.md' })
  const github = call('mcp__github__fetch_file')
  const chrome = call('mcp__chrome_devtools__get_network_request')
  assert.equal(activityPresentation([read, skill, command], false, true, false, true).label,
    'Прочитал файлы выполнил команду')
  assert.equal(activityPresentation([github, chrome, edit, command], false, true, false, true).label,
    'Использовано интеграции GitHub и Chrome Devtools отредактировал файл выполнил команду')
  assert.equal(activityPresentation([github, edit, command], false, true, false, true).icon, 'activityGithub')
  const failed = { ...command, isError: true }
  assert.equal(activityPresentation([read, failed], false, true, false, true).label,
    'Прочитал файлы выполнил команду')
  assert.equal(activityPresentation([failed], false, true), null)
  assert.equal(activityPresentation([{ ...command, status: { type: 'requires-action' } }], false, true, false, true), null)
  assert.equal(activityPresentation([command], false, true).label, 'Выполнена команда echo example')
})

test('Hermes persisted app labels and Codex tool definition titles take precedence over normalized names', () => {
  const part = call('tool_call', { hermes_tool_labels: [
    { kind: 'mcp', app: 'GitHub Enterprise', name: 'mcp__company_server__fetch_file', action: 'fetch file' },
  ] })
  part.toolDefinition = { title: 'fetch_file' }
  assert.equal(activityPresentation([part], false, true).label, 'Использовано интеграция GitHub Enterprise')
  assert.equal(activityPresentation([part], false, true, true).label, 'fetch_file')
  const repetitions = Array.from({ length: 13 }, () => part)
  assert.equal(repeatedActivityPresentation(repetitions, true).label, 'fetch_file · 13 вызовов')
  assert.equal(repeatedActivityPresentation([part, { ...part, isError: true }], true), null)
  assert.equal(repeatedActivityPresentation([part, call('mcp__company_server__another_tool')], true), null)
  assert.equal(repeatedActivityPresentation([part, { ...part, automaticApprovalReviews: [{}] }], true), null)
  const computer = call('mcp__computer_use__js')
  assert.equal(repeatedActivityPresentation([computer, computer], true), null)
})

test('an edited row uses the exact Russian patch labels from Codex', () => {
  assert.equal(activityPresentation([call('edit_file', { path: 'one.py' })], false, true, true).prefix, 'Редактирование ')
  assert.equal(activityPresentation([call('write_file', { path: 'two.py' }, { created: true })], false, true, true).prefix, 'Создано ')
})


test('live and completed integration labels use their corresponding saved invocation metadata', () => {
  const part = call('mcp__chrome_devtools__get_network_request')
  part.toolDefinition = { title: 'Network details', _meta: {
    'openai/toolInvocation/invoking': 'Reading network details',
    'openai/toolInvocation/invoked': 'Read network details',
  } }
  assert.equal(activityPresentation([part], false, true, true).label, 'Read network details')
  const pending = { ...part, result: undefined, completedAt: undefined }
  assert.equal(activityPresentation([pending], true, true, false, true).label, 'Reading network details')
  assert.equal(activityPresentation([call('mcp__chrome_devtools__get_network_request')], false, true, true).label,
    'Get network request')
})


test('read, directory, search and skill rows use the corresponding Codex locale branches', () => {
  const done = (name, args) => activityPresentation([call(name, args)], false, true).label
  const active = (name, args, summary = false) => activityPresentation([
    { toolName: name, args },
  ], true, true, false, summary).label
  assert.equal(done('read_file', { path: 'src/entry.ts' }), 'Прочитал entry.ts')
  assert.equal(active('read_file', { path: 'src/entry.ts' }, true), 'Чтение entry.ts')
  assert.equal(done('list_files', { path: 'src/ui' }), 'Перечислил файлы в src/ui')
  assert.equal(done('list_files', {}), 'Перечисленные файлы')
  assert.equal(active('list_files', { path: 'src/ui' }), 'Перечисление файлов в src/ui')
  assert.equal(active('list_files', { path: 'src/ui' }, true), 'Получение списка файлов в папке src/ui')
  assert.equal(done('search_files', { path: 'src/ui', pattern: 'button' }), 'Выполнен поиск button в src/ui')
  assert.equal(done('search_files', {}), 'Выполнен поиск файлов')
  assert.equal(active('search_files', { pattern: 'button' }), 'Поиск «button»')
  assert.equal(active('search_files', { path: 'src/ui', pattern: 'button' }, true), 'Поиск файлов в папке src/ui')
  assert.equal(active('search_files', { pattern: 'button' }, true), 'Поиск по запросу button')
  assert.equal(done('skill_view', { name: 'anti-ii-redaktor' }), 'Прочитал навык anti-ii-redaktor')
  assert.equal(active('skill_view', { name: 'anti-ii-redaktor' }, true), 'Чтение навыка anti-ii-redaktor')
})

test('a genuine browserUse source uses the exact named or browser summary branch', () => {
  const chrome = call('mcp__chrome__js', {}, { _meta: { 'codex/toolSurface': { kind: 'browserUse', backend: 'chrome' } } })
  const browser = call('mcp__browser_use__open', {}, { _meta: { 'codex/toolSurface': { kind: 'browserUse', backend: 'inApp' } } })
  assert.equal(activityPresentation([chrome], false, true).label, 'Использовано интеграция Chrome')
  assert.equal(activityPresentation([browser], false, true).label, 'Использовал браузер')
  const pending = { ...chrome, result: undefined, completedAt: undefined }
  // Without result metadata an MCP named chrome is a server, not browserUse.
  assert.equal(activityPresentation([pending], true, true).label, 'Js')
})


test('producer MCP display snapshot survives the native hermes_tool_labels channel', () => {
  const display = { version: 1, registered_name: 'mcp__github__fetch_file', server: 'github', tool: 'fetch_file',
    definition: { title: 'fetch_file', annotations: { title: 'Secondary title' }, _meta: {
      'openai/toolInvocation/invoking': 'Reading file', 'openai/toolInvocation/invoked': 'Read file',
    } } }
  const part = { toolName: 'mcp__github__fetch_file', args: { hermes_tool_labels: [
    { kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', action: 'fetch file', display },
  ] } }
  assert.equal(activityPresentation([part], true, true, false, true).label, 'Reading file')
  assert.equal(activityPresentation([{ ...part, completedAt: 1, result: {} }], false, true, true).label, 'Read file')
  const untitled = { ...part, completedAt: 1, result: {}, args: { hermes_tool_labels: [
    { kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', display: { ...display, definition: { title: 'fetch_file' } } },
  ] } }
  assert.equal(activityPresentation([untitled], false, true, true).label, 'fetch_file')
  assert.equal(repeatedActivityPresentation(Array.from({ length: 13 }, () => untitled), true).label, 'fetch_file · 13 вызовов')
  const fallback = { ...untitled, args: { hermes_tool_labels: [
    { kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', display: { ...display, definition: { annotations: { title: 'Exact annotation title' } } } },
  ] } }
  assert.equal(activityPresentation([fallback], false, true, true).label, 'Exact annotation title')
  const literal = { ...fallback, args: { hermes_tool_labels: [
    { kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', display: { ...display, definition: { title: '  Exact title  ' } } },
  ] } }
  assert.equal(activityPresentation([literal], false, true, true).label, '  Exact title  ')
})

test('native ConnectorTool captions keep the canonical inner tool identity for repeated calls', () => {
  const native = { toolName: 'GitHub · fetch file', innerToolName: 'mcp__github__fetch_file',
    toolCallId: 'bundle-github-0:0', args: { path: 'fixture-0.md', hermes_tool_labels: [{
      kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', text: 'GitHub · fetch file',
      display: { version: 1, server: 'github', tool: 'fetch_file', definition: { title: 'fetch_file' } },
    }] }, result: { success: true, content: 'Тестовый файл 0' }, completedAt: 1 }
  const part = activityToolPart(native)
  assert.equal(native.toolName, 'GitHub · fetch file')
  assert.equal(part.toolName, 'mcp__github__fetch_file')
  assert.equal(part.toolCallId, 'bundle-github-0:0')
  assert.equal(part.args, native.args)
  assert.equal(part.result, native.result)
  assert.equal(describeActivity(part).kind, 'integration')
  assert.equal(activityPresentation([part], false, true, true).label, 'fetch_file')
  assert.equal(repeatedActivityPresentation(Array.from({ length: 13 }, () => part), true).label, 'fetch_file · 13 вызовов')
  assert.equal(repeatedActivityPresentation([part, part], true).icon, 'activityGithub')
  const ordinary = call('terminal', { command: 'echo fixture' })
  assert.equal(activityToolPart(ordinary), ordinary)
})


test('failed MCP headers retain the source title and integration glyph without success captions', () => {
  const failed = call('mcp__chrome_devtools__take_snapshot', {}, { error: 'snapshot failed', success: false })
  const row = activityPresentation([failed], false, true, true)
  assert.equal(row.label, 'Take snapshot')
  assert.equal(row.icon, 'activityIntegration')
  assert.equal(row.failed, true)
  assert.equal(activityPresentation([failed], false, true).label, 'Take snapshot')
  const titled = { ...failed, toolDisplay: { title: '  Snapshot title  ', invoked: 'Snapshot complete' },
    toolDefinition: { title: 'Definition title', _meta: { 'openai/toolInvocation/invoked': 'Read snapshot' } } }
  assert.equal(activityPresentation([titled], false, true, true).label, '  Snapshot title  ')
  assert.equal(activityPresentation([{ ...titled, toolDisplay: {} }], false, true, true).label, 'Definition title')
  assert.equal(activityPresentation([failed], false, true, false, true).label,
    'Использовано интеграция Chrome Devtools')
  assert.equal(activityPresentation([{ ...failed, status: { type: 'requires-action' } }], false, true, true), null)
  assert.equal(activityPresentation([{ ...failed, automaticApprovalReviews: [{ status: 'denied' }] }], false, true, true), null)
  assert.equal(activityPresentation([{ ...failed, interrupted: true }], false, true, true), null)
  assert.equal(activityPresentation([call('unknown_tool', {}, { error: 'unknown' })], false, true, true), null)
  assert.equal(activityPresentation([call('browser_navigate', {}, { error: 'browser' })], false, true, true), null)
})

test('nested failed commands use Codex English caption and terminal glyph while native isolated errors stay intact', () => {
  const failed = call('terminal', { command: 'echo failed' }, { exit_code: 2, stdout: 'failure' })
  assert.deepEqual(activityPresentation([failed], false, true, true), {
    icon: 'activityTerminal', site: undefined, failed: true, label: 'Command failed (echo failed)',
  })
  assert.equal(activityPresentation([failed], false, true), null)
  assert.equal(activityPresentation([{ ...failed, interrupted: true }], false, true, true), null)
  assert.equal(activityPresentation([{ ...failed, status: { type: 'requires-action' } }], false, true, true), null)
  assert.equal(activityPresentation([{ ...failed, automaticApprovalReviews: [{ status: 'denied' }] }], false, true, true), null)
  assert.equal(activityPresentation([call('terminal', { command: 'echo ok' }, { exit_code: 0 })], false, true, true).label, 'echo ok')
})

test('the latest pending command supplies its actual input to the live activity line', () => {
  const completed = { toolName: 'terminal', args: { command: 'echo finished' }, result: { exit_code: 0 } }
  const first = { toolName: 'terminal', args: { command: 'echo first' } }
  const latest = { toolName: 'terminal', args: { command: 'echo latest' } }
  const blocked = { ...first, status: { type: 'requires-action' } }
  const interrupted = { ...first, interrupted: true }
  const current = pendingActivityPart([completed, first, latest, blocked, interrupted])
  assert.equal(current, latest)
  assert.equal(activityPresentation([current], true, true, false, true).label, 'Выполняется echo latest')
  assert.equal(activityPresentation([current], true, false, false, true).label, 'Running echo latest')
  assert.equal(activityPresentation([{ toolName: 'terminal', args: {} }], true, true).label, 'Выполняется команда')
  assert.equal(pendingActivityPart([completed, blocked, interrupted]), undefined)
})
