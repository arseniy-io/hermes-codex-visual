import assert from 'node:assert/strict'
import test from 'node:test'
import { agentModelDisplayName, agentPartDiff, agentReasoningEffortName, agentSessionMetadata, agentTranscriptBlocks, mergeAgentTranscript } from '../source/agent-transcript-data.js'

const call = (id, name, args = {}) => ({ id, function: { name, arguments: JSON.stringify(args) } })
const result = (id, content) => ({ role: 'tool', tool_call_id: id, content })

test('keeps the actual task, commentary, commands, and final response in chronological order', () => {
  const rows = [
    { role: 'user', content: 'Проверь файлы' },
    { role: 'assistant', content: 'Проверяю файлы.' },
    { role: 'assistant', tool_calls: [call('a', 'terminal', { command: 'pwd' })] },
    result('a', '{"stdout":"C:/project","exit_code":0}'),
    { role: 'assistant', content: 'Проверка завершена.' },
  ]
  const blocks = agentTranscriptBlocks(rows)
  assert.deepEqual(blocks.map(row => row.kind), ['user', 'assistant', 'tools', 'assistant'])
  assert.equal(blocks[2].parts[0].args.command, 'pwd')
  assert.equal(blocks[2].parts[0].result.exit_code, 0)
  assert.equal(blocks[3].text, rows[4].content)
})

test('matches repeated tools by call id and groups consecutive activity without losing raw output', () => {
  const rows = [
    { role: 'assistant', tool_calls: [call('a', 'mcp_github_fetch_file'), call('b', 'mcp_github_fetch_file')] },
    result('b', 'second'), result('a', 'first'),
    { role: 'assistant', tool_calls: [call('c', 'terminal', { command: 'node check.mjs' })] },
    result('c', 'done'),
  ]
  const blocks = agentTranscriptBlocks(rows)
  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].parts.map(part => part.outputText), ['first', 'second', 'done'])
  assert.deepEqual(blocks[0].parts.map(part => part.providerCallId), ['a', 'b', 'c'])
})

test('preserves an orphan result without inventing its command or arguments', () => {
  const [block] = agentTranscriptBlocks([{ role: 'tool', name: 'terminal', tool_call_id: 'legacy', content: 'saved output' }])
  assert.equal(block.parts[0].toolName, 'terminal')
  assert.deepEqual(block.parts[0].args, {})
  assert.equal(block.parts[0].outputText, 'saved output')
  assert.equal(block.parts[0].result, 'saved output')
  assert.equal(block.parts[0].argsText, '')
})

test('does not repeat a call when the next cursor page prepends its synthetic context', () => {
  const actual = { role: 'assistant', row_id: 10, _tool_call_uids: { edge: 'uid-edge' }, content: 'Starting a check.', tool_calls: [call('edge', 'terminal', { command: 'pwd' })] }
  const repeatedContext = { role: 'assistant', _tool_call_uids: { edge: 'uid-edge' }, content: '', tool_calls: [call('edge', 'terminal', { command: 'pwd' })] }
  const blocks = agentTranscriptBlocks(mergeAgentTranscript([actual], [repeatedContext, result('edge', 'C:/project')]))
  assert.equal(blocks.filter(block => block.kind === 'tools').flatMap(block => block.parts).length, 1)
  assert.equal(blocks[0].text, 'Starting a check.')
})

test('keeps the absence of a tool result as pending', () => {
  const [block] = agentTranscriptBlocks([{ role: 'assistant', tool_calls: [call('a', 'terminal', { command: 'node long.mjs' })] }])
  assert.equal(block.parts[0].result, undefined)
  assert.equal(block.parts[0].completedAt, undefined)
})

test('merges cursor boundaries by stored row id and updates the same row in place', () => {
  const initial = [{ row_id: 1, role: 'user', text: 'Task' }, { row_id: 2, role: 'assistant', text: 'Part' }]
  const newer = [{ row_id: 2, role: 'assistant', text: 'Complete' }, { row_id: 3, role: 'tool', text: 'Result' }]
  assert.deepEqual(mergeAgentTranscript(initial, newer).map(row => row.text), ['Task', 'Complete', 'Result'])
  const context = { role: 'assistant', _tool_call_uids: { boundary: 'uid-boundary' }, tool_calls: [call('boundary', 'terminal')] }
  assert.equal(mergeAgentTranscript([context], [context]).length, 1)
  assert.equal(mergeAgentTranscript([{ role: 'assistant', text: 'same' }], [{ role: 'assistant', text: 'same' }]).length, 2)
})

test('preserves compaction and system rows at their original position', () => {
  const rows = [{ role: 'user', text: 'Task' }, { row_kind: 'compaction', role: 'system', text: 'Summary' },
    { role: 'system', text: 'Saved notification' }, { role: 'assistant', text: 'Answer' }]
  assert.deepEqual(agentTranscriptBlocks(rows).map(row => row.kind), ['user', 'compaction', 'system', 'assistant'])
})

test('uses the original Codex GPT formatter and preserves literal other names', () => {
  assert.equal(agentModelDisplayName('gpt-6.1-sol'), 'GPT-6.1 Sol')
  assert.equal(agentModelDisplayName('gpt-6-astra'), 'GPT-6 Astra')
  assert.equal(agentModelDisplayName('custom/model_name'), 'custom/model_name')
  assert.equal(agentModelDisplayName('Claude Sonnet'), 'Claude Sonnet')
})

test('uses the selected-subagent header effort wording from the active Codex locale', () => {
  assert.equal(agentReasoningEffortName('max', 'ru'), 'Max')
  assert.equal(agentReasoningEffortName('xhigh', 'ru'), 'Очень высокое')
  assert.equal(agentReasoningEffortName('low', 'en'), 'Light')
  assert.equal(agentReasoningEffortName('unknown', 'ru'), '')
})

test('counts only the returned unified patch and preserves it for the details', () => {
  const text = '--- a/file.py\n+++ b/file.py\n@@ -1,2 +1,3 @@\n-old\n+new\n+++literal\n rest\n'
  assert.deepEqual(agentPartDiff({ result: { diff: text } }), { text, added: 2, removed: 1 })
  assert.equal(agentPartDiff({ args: { old_string: 'old', new_string: 'new' }, result: { success: true } }), null)
})

test('reused provider ids keep distinct durable UID outputs and source arguments', () => {
  const rows = [
    { role: 'assistant', _tool_call_uids: { same: 'first-uid' }, tool_calls: [call('same', 'terminal', { command: 'first' })] },
    { role: 'tool', _tool_call_uid: 'first-uid', tool_call_id: 'same', content: 'first output' },
    { role: 'assistant', _tool_call_uids: { same: 'second-uid' }, tool_calls: [call('same', 'terminal', { command: 'second' })] },
    { role: 'tool', _tool_call_uid: 'second-uid', tool_call_id: 'same', content: 'second output' },
  ]
  const parts = agentTranscriptBlocks(rows).flatMap(block => block.parts || [])
  assert.deepEqual(parts.map(part => part.toolCallId), ['first-uid', 'second-uid'])
  assert.deepEqual(parts.map(part => part.args.command), ['first', 'second'])
  assert.deepEqual(parts.map(part => part.outputText), ['first output', 'second output'])
})

test('raw REST canonical UID columns preserve repeated ids and reverse-order results', () => {
  const rows = [
    { role: 'assistant', tool_call_uids: JSON.stringify({ same: ['db-uid-1', 'db-uid-2'] }),
      tool_calls: [call('same', 'terminal', { command: 'first' }), call('same', 'terminal', { command: 'second' })] },
    { role: 'tool', tool_call_id: 'same', tool_call_uid: 'db-uid-2', content: 'second output' },
    { role: 'tool', tool_call_id: 'same', tool_call_uid: 'db-uid-1', content: 'first output' },
  ]
  const parts = agentTranscriptBlocks(rows).flatMap(block => block.parts || [])
  assert.deepEqual(parts.map(part => part.toolCallId), ['db-uid-1', 'db-uid-2'])
  assert.deepEqual(parts.map(part => part.args.command), ['first', 'second'])
  assert.deepEqual(parts.map(part => part.outputText), ['first output', 'second output'])
})

test('canonical and live UID formats may meet at a cursor boundary without duplicating calls', () => {
  const original = { role: 'assistant', message_uid: 'stored-assistant', tool_call_uids: JSON.stringify({ same: 'db-uid-1' }),
    tool_calls: [call('same', 'terminal', { command: 'first' })] }
  const context = { role: 'assistant', _tool_call_uids: { same: 'db-uid-1' },
    tool_calls: [call('same', 'terminal', { command: 'first' })] }
  const parts = agentTranscriptBlocks([
    original, context, { role: 'tool', tool_call_id: 'same', tool_call_uid: 'db-uid-1', content: 'first output' },
    { role: 'assistant', tool_call_uids: { same: 'db-uid-2' }, tool_calls: [call('same', 'terminal', { command: 'second' })] },
    { role: 'tool', tool_call_id: 'same', _tool_call_uid: 'db-uid-2', content: 'second output' },
  ]).flatMap(block => block.parts || [])
  assert.deepEqual(parts.map(part => part.toolCallId), ['db-uid-1', 'db-uid-2'])
  assert.deepEqual(parts.map(part => part.outputText), ['first output', 'second output'])
  assert.equal(mergeAgentTranscript([context], [{ ...context, _tool_call_uids: undefined,
    tool_call_uids: JSON.stringify({ same: 'db-uid-1' }) }]).length, 1)
})

test('folded UID arrays select the uid of each repeated call occurrence', () => {
  const parts = agentTranscriptBlocks([
    { role: 'assistant', _tool_call_uids: { same: ['uid-1', 'uid-2'] },
      tool_calls: [call('same', 'terminal', { command: 'first' }), call('same', 'terminal', { command: 'second' })] },
    { role: 'tool', tool_call_id: 'same', _tool_call_uid: 'uid-2', content: 'second output' },
    { role: 'tool', tool_call_id: 'same', _tool_call_uid: 'uid-1', content: 'first output' },
  ]).flatMap(block => block.parts || [])
  assert.deepEqual(parts.map(part => part.outputText), ['first output', 'second output'])
})

test('legacy calls without UID pair sequentially and never absorb another user turn result', () => {
  const parts = agentTranscriptBlocks([
    { role: 'assistant', tool_calls: [call('same', 'terminal', { command: 'first' })] },
    result('same', 'first output'),
    { role: 'assistant', tool_calls: [call('same', 'terminal', { command: 'second' })] },
    result('same', 'second output'),
    { role: 'user', content: 'New turn' },
    result('same', 'orphan output'),
  ]).flatMap(block => block.parts || [])
  assert.deepEqual(parts.map(part => part.outputText), ['first output', 'second output', 'orphan output'])
  assert.deepEqual(parts.map(part => part.args.command), ['first', 'second', undefined])
})

test('counts multiple unified files without treating following file headers as hunk lines', () => {
  const text = '--- a/one\n+++ b/one\n@@ -1 +1 @@\n-old\n+new\n--- a/two\n+++ b/two\n@@ -1 +1 @@\n-before\n+after\n'
  assert.deepEqual(agentPartDiff({ result: { diff: text } }), { text, added: 2, removed: 2 })
})

test('reads only the actual saved model and resolved effort metadata', () => {
  assert.deepEqual(agentSessionMetadata({ model: 'gpt-6.1-sol', profile: 'default',
    model_config: JSON.stringify({ reasoning_config: { enabled: true, effort: 'max' } }) }),
  { model: 'gpt-6.1-sol', effort: 'max', profile: 'default' })
  assert.equal(agentSessionMetadata({ model_config: { reasoning_config: { enabled: false, effort: 'high' } } }).effort, 'none')
  assert.equal(agentSessionMetadata({ model: 'gpt-6.1-sol', system_prompt: 'secret' }).effort, '')
})

test('uses native visibility contracts for hidden context, model-only copies, and task wrappers', () => {
  const rows = [
    { role: 'system', display_kind: 'hidden', content: 'SYSTEM PROMPT DO NOT SHOW' },
    { role: 'developer', content: 'DEVELOPER INSTRUCTIONS DO NOT SHOW' },
    { role: 'user', display_metadata: JSON.stringify({ model_only: true }), content: 'MERGED MODEL COPY DO NOT SHOW' },
    { role: 'user', content: '[Background process proc1 heartbeat #1 running]' },
    { role: 'user', content: 'Actual task\n--- Attached Context ---\nSecret attachment body @file:README.md\n--- Context Warnings ---\nHidden warning' },
    { role: 'assistant', display_kind: 'hidden', content: 'HIDDEN INTERNAL ASSISTANT' },
    { role: 'assistant', content: 'Stored raw body', display_content: 'Visible answer' },
    { role: 'user', display_kind: 'async_delegation_complete', display_metadata: { display_text: 'Agent finished' },
      content: '[ASYNC DELEGATION COMPLETE internal wake envelope]' },
  ]
  const blocks = agentTranscriptBlocks(rows)
  assert.deepEqual(blocks.map(block => block.kind), ['user', 'assistant', 'system'])
  assert.equal(blocks[0].text, '@file:README.md\n\nActual task')
  assert.equal(blocks[1].text, 'Visible answer')
  assert.equal(blocks[2].text, 'Agent finished')
  assert(!JSON.stringify(blocks).includes('DO NOT SHOW'))
})

test('a skill invocation hides the embedded skill body using the native exact markers', () => {
  const [block] = agentTranscriptBlocks([{ role: 'user', content: '[IMPORTANT: The user has invoked the "work" skill. The full skill content is loaded below.]\nSECRET SKILL BODY\nThe user has provided the following instruction alongside the skill invocation: check files' }])
  assert.equal(block.text, '/work check files')
})
