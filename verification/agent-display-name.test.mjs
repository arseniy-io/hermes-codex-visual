import assert from 'node:assert/strict'
import test from 'node:test'
import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'

const label = (agent, fallback = 'Субагент') => agentDisplayName(agent, fallback)

test('matches the Codex path formatter for saved task names', () => {
  assert.equal(label({ agentPath: '/root/agent_names' }), 'Agent names')
  assert.equal(label({ agentPath: '/root/reference_audit' }), 'Reference audit')
  assert.equal(label({ agentPath: '/root/fresh-outbound-reader' }), 'Fresh outbound reader')
})

test('uses the last trimmed non-root path segment as Codex does', () => {
  assert.equal(label({ agentPath: ' / root / outer_scope / agent_names / ' }), 'Agent names')
  assert.equal(label({ agentPath: '/root/reference_audit/root' }), 'Reference audit')
  assert.equal(label({ agentPath: '/root//nested_parent///dispatch-review/' }), 'Dispatch review')
  assert.equal(label({ agentPath: '/root/root//' }), 'Субагент')
  assert.equal(label({ agentPath: '/ROOT' }), 'Root')
})

test('preserves the exact separator, whitespace and sentence-case rules', () => {
  assert.equal(label({ agentPath: '/root/  AGENT__NAMES---FINAL  ' }), 'Agent names final')
  assert.equal(label({ agentPath: '/root/ preparation\t\nreview ' }), 'Preparation review')
  assert.equal(label({ agentPath: '/root/Выбор_источников' }), 'Выбор источников')
})

test('formats both task-name metadata spellings through the same branch', () => {
  assert.equal(label({ task_name: 'reference_audit' }), 'Reference audit')
  assert.equal(label({ taskName: 'dispatch-review' }), 'Dispatch review')
  assert.equal(label({ agent_path: '/root/nested/agent_names' }), 'Agent names')
  assert.equal(label({ agentPath: '/root/first_path', task_name: 'other_task' }), 'First path')
})

test('keeps supplied nicknames literal and separate from path formatting', () => {
  assert.equal(label({ agentNickname: '  Fresh_outbound-reader  ', agentPath: '/root/other' }), 'Fresh_outbound-reader')
  assert.equal(label({ displayName: '  @Preparation REVIEW  ', task_name: 'reference_audit' }), '@Preparation REVIEW')
  assert.equal(label({ agentNickname: 'Критик E2', displayName: 'Other name' }), 'Критик E2')
  assert.equal(label({ displayName: 'Имя '.repeat(30).trim() }), 'Имя '.repeat(30).trim())
})

test('never derives an agent name from a goal', () => {
  for (const goal of [
    'Независимый read-only критик E2 небольшой правки методики Rublix. Прочитай правила.',
    'Примени действующие проектные документы к восьми ситуациям.',
    'Проверь отступы в ленте Hermes Desktop.',
    'Preparation review',
  ]) assert.equal(label({ goal }), 'Субагент')
  assert.equal(label({ task_name: 'agent_names', goal: 'Другая формулировка' }), 'Agent names')
})

test('uses caller fallback for absent metadata without inventing a name', () => {
  assert.equal(label(null, 'Subagent'), 'Subagent')
  assert.equal(label({}, 'Subagent'), 'Subagent')
  assert.equal(label({ agentPath: 17, task_name: null, displayName: ' ' }, 'Subagent'), 'Subagent')
  assert.equal(label({ agentPath: '/root/', task_name: 'reference_audit' }), 'Reference audit')
})

test('keeps the saved producer name when progress and completion have no metadata', () => {
  const resolve = createAgentNameRegistry()
  assert.equal(resolve({ id: 'child', agentPath: '/root/reference_audit' }, 'Субагент'), 'Reference audit')
  assert.equal(resolve({ id: 'child', goal: 'Новое поручение', status: 'running' }, 'Субагент'), 'Reference audit')
  assert.equal(resolve({ id: 'child', status: 'completed' }, 'Subagent'), 'Reference audit')
})

test('updates a producer name only when actual new metadata arrives', () => {
  const resolve = createAgentNameRegistry()
  resolve({ id: 'child', task_name: 'preparation_review' }, 'Субагент')
  assert.equal(resolve({ id: 'child', task_name: 'legacy_review' }, 'Субагент'), 'Legacy review')
  assert.equal(resolve({ id: 'child', goal: 'Rename this agent to something else' }, 'Subagent'), 'Legacy review')
  assert.equal(resolve({ id: 'child', agentNickname: 'Fresh outbound reader' }, 'Subagent'), 'Fresh outbound reader')
  assert.equal(resolve({ id: 'child' }, 'Субагент'), 'Fresh outbound reader')
})

test('translates only missing-metadata fallback and never adds numeric suffixes', () => {
  const resolve = createAgentNameRegistry()
  assert.equal(resolve({ id: 'a' }, 'Субагент'), 'Субагент')
  assert.equal(resolve({ id: 'b' }, 'Субагент'), 'Субагент')
  assert.equal(resolve({ id: 'a' }, 'Subagent'), 'Subagent')
  assert.equal(resolve({ id: 'b' }, 'Subagent'), 'Subagent')
  assert.equal(resolve({ id: 'a' }, 'Субагент'), 'Субагент')
})

test('distinct agents may have the same producer name without frontend renaming', () => {
  const resolve = createAgentNameRegistry()
  assert.equal(resolve({ id: 'a', task_name: 'reference_audit' }, 'Субагент'), 'Reference audit')
  assert.equal(resolve({ id: 'b', task_name: 'reference_audit' }, 'Субагент'), 'Reference audit')
  assert.equal(resolve({ id: 'a', agentPath: '/root/agent_names' }, 'Субагент'), 'Agent names')
  assert.equal(resolve({ id: 'b', status: 'completed' }, 'Субагент'), 'Reference audit')
})

test('keeps the card-first producer name after exact ID binding and completion', () => {
  const resolve = createAgentNameRegistry()
  const card = { seed: 'card', agentPath: '/root/agent_names' }
  resolve(card, 'Субагент')
  resolve({ seed: 'card', id: 'live-id', subagentId: 'live-id' }, 'Субагент')
  assert.equal(resolve({ id: 'live-id', status: 'completed' }, 'Субагент'), 'Agent names')
})

test('keeps the latest producer name after a late alias merge', () => {
  const resolve = createAgentNameRegistry()
  resolve({ id: 'live-id', task_name: 'agent_names' }, 'Субагент')
  resolve({ seed: 'late-card', id: 'late-row', agentPath: '/root/reference_audit' }, 'Субагент')
  assert.equal(resolve({ seed: 'late-card', subagentId: 'live-id' }, 'Субагент'), 'Reference audit')
  for (const id of ['late-card', 'late-row', 'live-id']) {
    assert.equal(resolve({ id, status: 'completed' }, 'Субагент'), 'Reference audit')
  }
})

test('keeps owning scopes independent even when child IDs are equal', () => {
  const first = createAgentNameRegistry()
  const second = createAgentNameRegistry()
  assert.equal(first({ id: 'same-id', task_name: 'agent_names' }, 'Субагент'), 'Agent names')
  assert.equal(second({ id: 'same-id', task_name: 'reference_audit' }, 'Субагент'), 'Reference audit')
})
