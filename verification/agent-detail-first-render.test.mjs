import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = [path.resolve(import.meta.dirname, '../..'), path.resolve(import.meta.dirname, '..')]
  .find(candidate => fs.existsSync(path.join(candidate, 'source/summary-agents.js')))
assert(root, 'Expected the actual project source')
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { agentDisplayName } = await import(pathToFileURL(path.join(root, 'source/agent-display-name.js')))
const { agentModelDisplayName, agentReasoningEffortName } = await import(pathToFileURL(path.join(root, 'source/agent-transcript-data.js')))
const source = fs.readFileSync(path.join(root, 'source/summary-agents.js'), 'utf8')
const start = source.indexOf('function AgentDetail(')
const end = source.indexOf('\nexport function AgentPane(', start)
assert(start > 0 && end > start, 'Expected the real AgentDetail function boundary')
const componentSource = source.slice(start, end)
const labelsSource = source.slice(source.indexOf('const labels ='), source.indexOf('\nconst finished ='))
const formatSource = source.slice(source.indexOf('function formatDuration('), source.indexOf('\nfunction relativeTime('))
const helperLines = ['finished', 'goalLabel'].map(name => {
  const line = source.split('\n').find(value => value.startsWith('const ' + name + ' ='))
  assert(line, name)
  return line
}).join('\n')

const scope = '["local","default","parent-runtime"]'
const now = 1_800_000_000_000
const agent = { id: 'worker', subagentId: 'worker', childSession: 'owned-child',
  taskName: 'saved_child', agentPath: '/root/saved_child', visualSeed: 'owned-child',
  status: 'completed', goal: 'Exact saved task', model: 'gpt-6.1-sol', effort: 'max',
  durationSeconds: 8, summary: 'Cached summary visible while the child history loads.' }
const loaded = { child: 'owned-child', parentSessionId: 'parent-stored', status: 'completed',
  complete: true, partial: false, rows: [
    { message_uid: 'input', role: 'user', content: 'Exact stored task' },
    { message_uid: 'answer', role: 'assistant', content: 'Actual stored final answer.' },
  ], messages: [{ text: 'Actual stored final answer.' }], model: 'gpt-6.1-sol', effort: 'max' }

function render({ snapshot = null, savedChanges = null, implementation = componentSource } = {}) {
  const transcripts = []
  let externalReads = 0
  const h = React.createElement
  function AgentTranscript(props) {
    transcripts.push(props)
    return h('div', { 'data-hcv-agent-transcript': '' },
      props.rows.map((row, index) => h('p', { key: index, 'data-hcv-agent-message': row.role }, row.text ?? row.content)),
      props.changes.map(snapshot => h('div', { key: snapshot.snapshotId,
        'data-hcv-saved-turn-card': snapshot.turnId }, snapshot.snapshotId)))
  }
  const nativeActions = () => []
  // Only the child reader and asynchronous saved state are injected. Actual
  // React runs AgentDetail, including all expressions evaluated on its first
  // render. Effects remain real React effects and do not execute during SSR.
  const dependencies = {
    h, useRef: React.useRef, useEffect: React.useEffect, useLayoutEffect: React.useLayoutEffect,
    useState: initial => React.useState(savedChanges ?? initial),
    agentDisplayName, agentModelDisplayName, agentReasoningEffortName,
    useChildResponse: () => snapshot,
    attachAgentTranscriptScroll: () => { throw new Error('An SSR layout effect must not execute') },
    sameTurnHistoryOwner: captured => captured === scope,
    readSavedTurnChanges: () => { externalReads++; throw new Error('No RPC/REST during first-render regression') },
    applySavedTurnChanges: () => { throw new Error('No file action during first-render regression') },
    openSavedTurnDiff() {}, notifySavedTurnOutcome() {},
    AgentTranscript,
    AgentAvatar: () => h('img', { 'data-hcv-subagent-avatar': '', alt: '', src: 'data:image/svg+xml,%3Csvg/%3E' }),
    Glyph: ({ name }) => h('span', { 'data-test-glyph': name }),
    CopyButton: ({ label }) => h('button', { 'aria-label': label }, label),
    window: { hermesDesktop: { api() { throw new Error('No desktop API during SSR') } } },
  }
  const create = new Function(...Object.keys(dependencies),
    labelsSource + '\n' + helperLines + '\n' + formatSource + '\n' + implementation + '\nreturn { AgentDetail, copy: labels.ru }')
  const { AgentDetail, copy } = create(...Object.values(dependencies))
  const html = renderToStaticMarkup(h(AgentDetail, { agent, scope, now, copy, lang: 'ru', dark: true,
    avatarUrl: () => '', onBack() {}, nativeActions, openNativeAgent() {} }))
  return { html, transcripts, externalReads }
}

function headerAndNoCards(result) {
  assert.match(result.html, /data-hcv-subagent-header/)
  assert.match(result.html, /Saved child/)
  assert.match(result.html, /GPT-6\.1 Sol · Max/)
  assert.match(result.html, /data-hcv-subagent-avatar/)
  assert.doesNotMatch(result.html, /data-hcv-saved-turn-card/)
  assert.equal(result.externalReads, 0)
  assert.equal(result.transcripts.length, 1)
  assert.deepEqual(result.transcripts[0].changes, [])
}

test('first real AgentDetail frame with null child snapshot shows cached prose and no saved cards', () => {
  const result = render()
  headerAndNoCards(result)
  assert.match(result.html, /Exact saved task/)
  assert.match(result.html, /Cached summary visible while the child history loads\./)
  assert.equal(result.transcripts[0].historyComplete, false)
})

test('loaded child history renders before the saved-change request has produced state', () => {
  const result = render({ snapshot: loaded })
  headerAndNoCards(result)
  assert.match(result.html, /Exact stored task/)
  assert.match(result.html, /Actual stored final answer\./)
  assert.doesNotMatch(result.html, /Cached summary visible/)
  assert.equal(result.transcripts[0].historyComplete, true)
})

test('saved changes from a different child cannot appear while the selected child is loading', () => {
  const result = render({ snapshot: loaded, savedChanges: { scope, child: 'other-child', parent: 'parent-stored', value: { turns: [
    { turnId: 'other-turn', snapshotId: 'other-snapshot' },
  ] } } })
  headerAndNoCards(result)
  assert.doesNotMatch(result.html, /other-snapshot/)
})

test('matching settled saved state still reaches the transcript once both sources exist', () => {
  const saved = { turnId: 'input', snapshotId: 'own-snapshot' }
  const result = render({ snapshot: loaded, savedChanges: { scope, child: 'owned-child', parent: 'parent-stored', value: { turns: [saved] } } })
  assert.match(result.html, /data-hcv-saved-turn-card="input"/)
  assert.deepEqual(result.transcripts[0].changes, [saved])
  assert.equal(result.externalReads, 0)
})

test('the original optional-chain equality reproduces the first-frame null.value crash', () => {
  const fixed = /changes: savedChanges\?\.scope === scope[^?]*?(?:\?\.[^?]*?)*?\? savedChanges\.value\.turns : \[\]/
  assert.match(componentSource, fixed)
  const original = 'changes: savedChanges?.child === snapshot?.child ? savedChanges.value.turns : []'
  assert.throws(() => render({ implementation: componentSource.replace(fixed, original) }), error =>
    error instanceof TypeError && /null/.test(error.message) && /value/.test(error.message))
})

test('saved changes with the same child id still require the same scope and parent', () => {
  const saved = { child: 'owned-child', parent: 'parent-stored', scope, value: { turns: [
    { turnId: 'input', snapshotId: 'other-snapshot' },
  ] } }
  for (const different of [{ scope: 'another-profile' }, { parent: 'other-parent' }]) {
    headerAndNoCards(render({ snapshot: loaded, savedChanges: { ...saved, ...different } }))
  }
})
