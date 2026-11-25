import assert from 'node:assert/strict'
import { agentToolUnits, agentToolArgsText } from '../source/agent-tool-presentation.js'
import { describeActivity } from '../source/chat-activity-labels.js'

const tool = (id, overrides = {}) => ({ toolCallId: id, toolName: 'mcp__github__fetch_file', args: { path: id }, result: 'saved', ...overrides })
const ids = units => units.map(unit => unit.parts.map(part => part.toolCallId))
assert.deepEqual(ids(agentToolUnits([tool('a'), tool('b'), tool('c')], true)), [['a', 'b', 'c']])
assert.equal(agentToolUnits([tool('a'), tool('b'), tool('c')], true)[0].view.label, 'Fetch file · 3 вызова')
assert.equal(agentToolUnits([tool('a'), tool('b')], false)[0].view.label, 'Fetch file · 2 calls')
for (const breaker of [
  tool('error', { result: { error: 'refused' } }),
  tool('flagged', { isError: true }),
  tool('active', { result: undefined }),
  tool('approval', { status: { type: 'requires-action' } }),
  tool('review', { automaticApprovalReviews: [{}] }),
  tool('other', { toolName: 'mcp__github__get_file' }),
  tool('another-server', { toolName: 'mcp__gitlab__fetch_file' }),
  tool('shell', { toolName: 'terminal', args: { command: 'echo fixture' } }),
]) assert.deepEqual(ids(agentToolUnits([tool('a'), breaker, tool('c')], true)), [['a'], [breaker.toolCallId], ['c']])
assert.deepEqual(ids(agentToolUnits([tool('a'), tool('b'), tool('active', { result: undefined }), tool('c'), tool('d')], true)),
  [['a', 'b'], ['active'], ['c', 'd']])
const args = { path: 'README.md', labels: ['preserve'], context: 'real context',
  nested: { hermes_tool_labels: 'real nested user field' },
  hermes_tool_labels: [{ kind: 'mcp', app: 'GitHub', name: 'mcp__github__fetch_file', text: 'GitHub · fetch file' }] }
const before = JSON.stringify(args)
const part = tool('args', { args, argsText: JSON.stringify(args) })
const shown = JSON.parse(agentToolArgsText(part))
assert.equal(Object.hasOwn(shown, 'hermes_tool_labels'), false)
assert.deepEqual(shown.labels, ['preserve'])
assert.equal(shown.context, 'real context')
assert.equal(shown.nested.hermes_tool_labels, 'real nested user field')
assert.equal(JSON.stringify(args), before)
assert.equal(describeActivity(part).sources[0].name, 'GitHub')
assert.equal(agentToolArgsText(tool('plain', { args: { query: 'say hermes_tool_labels literally' }, argsText: 'original raw query' })), 'original raw query')
assert.equal(agentToolArgsText(tool('empty', { args: {}, argsText: '' })), '')
console.log('Verified child MCP repeats, boundaries, stable ordering and UI-only argument filtering')
