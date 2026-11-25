import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = process.cwd()
const { agentDisplayName, createAgentNameRegistry } = await import(pathToFileURL(path.join(root, 'source/agent-display-name.js')))
const { canonicalAgentReceipt, matchAgentReceipt } = await import(pathToFileURL(path.join(root, 'source/agent-receipt-matching.js')))
const tileHelpers = await import(pathToFileURL(path.join(root, 'source/tile-agent-scope.js')))
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = fs.readFileSync(process.env.HCV_AVATAR_TEST_CANDIDATE || path.join(root, 'source/subagents.js'), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const avatars = JSON.parse(fs.readFileSync(path.join(root, 'source/visual-assets.json'), 'utf8')).avatars

function fixture() {
  const dom = new JSDOM(`<html lang="ru" data-test="yes" data-hermes-mode="dark"><head></head><body>
    <div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
      <div data-slot="aui_thread-content"><div data-slot="aui_turn-pair">
        <div data-slot="aui_user-message-root" data-message-id="prompt-1"></div>
        <div data-slot="aui_response-group"><div data-slot="aui_assistant-message-root" data-message-id="answer-1">
          <div data-slot="aui_assistant-message-content"><div class="aui-md">Test context</div></div>
        </div></div>
      </div></div>
    </div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  const { document } = window
  const callbacks = new Map()
  const frames = new Map()
  const disposers = []
  let nextFrame = 0
  let sequence = 0
  let receipts = []
  let foreignReceipts = []
  let historyNotify = () => {}
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const host = { state: { activeSessionId: state('parent-runtime'), connectionId: state('local'), profile: state('default') },
    request: async () => ({ subagents: [] }) }
  const foreignView = {}
  const scope = JSON.stringify(['local', 'default', 'parent-runtime'])
  const history = { current: () => ({ scope, sessionId: 'parent-stored', requestedSessionId: 'parent-stored', receipts }),
    forSurface: node => node?.matches('[data-session-anchor="workspace"]') ? history.current() :
      ({ scope: JSON.stringify(['local', 'default', 'foreign-runtime']), sessionId: 'foreign-stored', receipts: foreignReceipts }),
    subscribe: notify => { historyNotify = notify; return () => {} } }
  Object.assign(window, {
    agentDisplayName, createAgentNameRegistry, canonicalAgentReceipt, matchAgentReceipt, host, ...tileHelpers,
    tileTurnHistoryTarget: node => node.dataset.composerSurfaceId === 'foreign-tile' ?
      ({ surface: node, view: foreignView, runtimeId: 'foreign-runtime', sessionId: 'foreign-stored', connectionId: 'local', profile: 'default' }) : null,
    readFocusedSession: () => null,
    nativeRenderedMessageRecord: node => node.closest('[data-composer-surface-id="foreign-tile"]')
      ? ({ rowId: 1219, runtimeId: 'foreign-runtime', storedId: 'foreign-stored' })
      : ({ rowId: 1219, runtimeId: 'parent-runtime', storedId: 'parent-stored' }),
    atom: initial => { let value = initial; return { get: () => value, set: next => { value = next } } },
    committedFiber: () => ({ return: { memoizedProps: { report: 'Stored report.' } } }),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: frame => frames.delete(frame),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    mountStyle: (_ctx, sheet) => document.head.append(sheet), agentAvatars: avatars, codexMask: () => '',
    AgentPane: () => {}, agentPaneStyles: () => '', SummarySection: () => {},
    h: () => {}, useEffect: () => {}, useValue: () => {},
  })
  window.eval(source + '\nwindow.createTestRoster = registerSubagents; window.testAvatarUrl = avatarUrl; window.testAvatarRegistry = createAvatarRegistry')
  const roster = window.createTestRoster({ onEvent: (type, callback) => callbacks.set(type, callback),
    onDispose: callback => disposers.push(callback) }, '[data-test="yes"]', history)
  const flush = async () => {
    for (let pass = 0; pass < 15; pass++) {
      await new Promise(resolve => window.setTimeout(resolve, 0))
      if (!frames.size) return
      const work = [...frames.values()]; frames.clear()
      for (const callback of work) callback()
    }
    assert.fail('Avatar reconciliation did not settle')
  }
  return { window, document, roster, flush,
    emit(id, child, type = 'subagent.start') { callbacks.get(type)({ type, session_id: 'parent-runtime', seq: ++sequence,
      payload: { subagent_id: id, child_session_id: child, goal: id, task_name: id, status: 'running' } }) },
    theme(dark) { document.documentElement.dataset.hermesMode = dark ? 'dark' : 'light' },
    receipt(id, child) {
      receipts = [{ row_id: 1219, delegation_id: 'deleg_saved', agents: [{ task_index: 0,
        subagent_id: id, child_session_id: child, status: 'completed', task_name: id }] }]
      const system = document.createElement('div')
      system.dataset.slot = 'aui_system-message-root'
      system.innerHTML = '<div data-slot="aui_background-result"><div data-conversation-scaffold><button><span class="truncate">Subagent Task Completed: Test</span></button></div></div>'
      document.querySelector('[data-slot="aui_response-group"]').append(system)
      historyNotify()
    },
    foreignReceipt(id, child) {
      foreignReceipts = [{ row_id: 1219, delegation_id: 'foreign-delegation', agents: [{ task_index: 0,
        subagent_id: id, child_session_id: child, status: 'completed', task_name: id }] }]
      const tile = document.createElement('div')
      tile.dataset.chatSurface = ''
      tile.dataset.composerSurfaceId = 'foreign-tile'
      tile.innerHTML = '<div data-slot="aui_thread-content"><div data-slot="aui_system-message-root"><div data-slot="aui_background-result"><div data-conversation-scaffold><button><span class="truncate">Subagent Task Completed: Other</span></button></div></div></div></div>'
      document.body.append(tile)
      historyNotify()
    },
    close() { for (const dispose of disposers.reverse()) dispose(); window.close() } }
}

function collision() {
  const index = seed => { let hash = 0; for (const c of seed) hash = (31 * hash + c.charCodeAt(0)) % 0x7fffffff; return hash % avatars.length }
  const byIndex = new Map()
  for (let i = 0; i < 100; i++) {
    const seed = 'test-child-' + i
    const prior = byIndex.get(index(seed))
    if (prior) return [prior, seed]
    byIndex.set(index(seed), seed)
  }
  assert.fail('Expected two real IDs mapping to the same Codex image')
}

test('two different agents with a Codex hash collision have distinct consistent avatars', async () => {
  const f = fixture()
  try {
    await f.flush()
    const [first, second] = collision()
    f.emit('first', first); f.emit('second', second)
    await f.flush()
    const row = f.document.querySelector('[data-hcv-agent-activity="started"]')
    const images = [...row.querySelectorAll('img')].map(img => img.getAttribute('src'))
    assert.equal(images.length, 2)
    assert.ok(images[0] !== images[1], 'Different agents in one chat must not have identical icons')
    for (const [i, agent] of f.roster.get().agents.entries()) {
      assert.equal(f.window.testAvatarUrl(agent.visualSeed, true, agent.visualIndex), images[i])
    }
  } finally { f.close() }
})

test('a saved receipt and a live event for the same ID form one roster entry and use one avatar', async () => {
  const f = fixture()
  try {
    await f.flush(); f.emit('first', 'live-child'); await f.flush()
    f.receipt('first', 'stored-child'); await f.flush()
    const agents = f.roster.get().agents
    const started = f.document.querySelector('[data-hcv-agent-activity="started"] img')
    const completed = f.document.querySelector('[data-hcv-agent-activity="completed"] img')
    assert(started && completed, 'Both observed events remain visible')
    assert.ok(started.getAttribute('src') === completed.getAttribute('src'), 'The same agent must use the same icon on both events')
    assert.equal(agents.length, 1, 'The same worker must not occur twice in the pane')
    const src = f.window.testAvatarUrl(agents[0].visualSeed, true, agents[0].visualIndex)
    assert.equal(started.getAttribute('src'), src)
    assert.equal(completed.getAttribute('src'), src)
  } finally { f.close() }
})

test('each of the 28 available icons is allocated at most once and theme changes keep the assignment', async () => {
  const f = fixture()
  try {
    await f.flush()
    for (let i = 0; i < 28; i++) f.emit('worker-' + i, 'child-' + i)
    await f.flush()
    const dark = f.roster.get().agents.map(agent => ({ id: agent.id, index: agent.visualIndex,
      src: f.window.testAvatarUrl(agent.visualSeed, true, agent.visualIndex) }))
    assert.equal(new Set(dark.map(item => item.index)).size, 28)
    assert.equal(new Set(dark.map(item => item.src)).size, 28)
    f.theme(false); await f.flush()
    const light = f.roster.get().agents.map(agent => ({ id: agent.id, index: agent.visualIndex,
      src: f.window.testAvatarUrl(agent.visualSeed, false, agent.visualIndex) }))
    assert.deepEqual(light.map(item => [item.id, item.index]), dark.map(item => [item.id, item.index]))
    assert.equal(new Set(light.map(item => item.src)).size, 28)
    f.emit('worker-28', 'child-28'); await f.flush()
    const all = f.roster.get().agents
    assert.equal(all.length, 29)
    assert.ok(all.every(agent => Number.isInteger(agent.visualIndex) && agent.visualIndex >= 0 && agent.visualIndex < 28))
  } finally { f.close() }
})

test('a child identity received after start updates the original activity and can be recovered from its detail', async () => {
  const f = fixture()
  try {
    await f.flush(); f.emit('late-worker', ''); await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity] img').length, 0)
    f.roster.recordIdentity(JSON.stringify(['local', 'default', 'parent-runtime']), 'late-worker', 'proven-child')
    await f.flush()
    const agent = f.roster.get().agents.find(item => item.id === 'late-worker')
    assert.equal(agent.visualSeed, 'proven-child')
    assert.equal(f.document.querySelector('[data-hcv-agent-activity] img').getAttribute('src'),
      f.window.testAvatarUrl(agent.visualSeed, true, agent.visualIndex))
    f.roster.recordIdentity(JSON.stringify(['local', 'default', 'foreign-parent']), 'late-worker', 'foreign-child')
    await f.flush()
    assert.equal(f.roster.get().agents[0].visualSeed, 'proven-child')
  } finally { f.close() }
})

test('a receipt in a different surface cannot claim or recolor an agent in the active chat', async () => {
  const f = fixture()
  try {
    await f.flush(); f.emit('shared-worker', 'main-child'); await f.flush()
    const original = f.document.querySelector('[data-hcv-agent-activity="started"] img').getAttribute('src')
    f.foreignReceipt('shared-worker', 'foreign-child'); await f.flush()
    const agents = f.roster.get().agents
    assert.equal(agents.length, 1)
    assert.equal(agents[0].childSession, 'main-child')
    assert.equal(agents[0].status, 'running')
    assert.equal(f.document.querySelector('[data-hcv-agent-activity="started"] img').getAttribute('src'), original)
    const foreignIcon = f.document.querySelector('[data-composer-surface-id="foreign-tile"] [data-hcv-agent-activity] img')
    assert(foreignIcon)
    assert.equal(foreignIcon.getAttribute('src'), f.window.testAvatarUrl('foreign-child', true))
  } finally { f.close() }
})

test('the real pane avatar passes the allocated index and theme to the shared image selector', () => {
  const summaryFile = process.env.HCV_AVATAR_TEST_SUMMARY || path.join(root, 'source/summary-agents.js')
  const summary = fs.readFileSync(summaryFile, 'utf8')
  const part = summary.slice(summary.indexOf('function AgentAvatar('), summary.indexOf('\nfunction Glyph('))
  assert(part.startsWith('function AgentAvatar('))
  const Avatar = new Function('h', part + '\nreturn AgentAvatar')(React.createElement)
  const calls = []
  const html = renderToStaticMarkup(React.createElement(Avatar, {
    agent: { visualSeed: 'confirmed-child', visualIndex: 11 }, dark: false,
    avatarUrl: (...args) => { calls.push(args); return 'data:image/svg+xml,%3Csvg/%3E' },
  }))
  assert.deepEqual(calls, [['confirmed-child', false, 11]])
  assert.match(html, /data-hcv-subagent-avatar/)
})

test('the real details component forwards a verified late child to the shared roster', () => {
  const summaryFile = process.env.HCV_AVATAR_TEST_SUMMARY || path.join(root, 'source/summary-agents.js')
  const summary = fs.readFileSync(summaryFile, 'utf8')
  const labels = summary.slice(summary.indexOf('const labels ='), summary.indexOf('\nconst finished ='))
  const format = summary.slice(summary.indexOf('function formatDuration('), summary.indexOf('\nfunction relativeTime('))
  const helpers = ['finished', 'goalLabel'].map(name => summary.split('\n').find(line => line.startsWith('const ' + name + ' ='))).join('\n')
  const detail = summary.slice(summary.indexOf('function AgentDetail('), summary.indexOf('\nexport function AgentPane('))
  const effects = []
  const received = []
  const dependencies = {
    h: React.createElement, useRef: React.useRef, useState: React.useState,
    useLayoutEffect() {}, useEffect(effect) { effects.push(effect) }, agentDisplayName,
    useChildResponse: () => ({ child: 'owned-child', rows: [], messages: [], complete: false, partial: true, status: 'running' }),
    attachAgentTranscriptScroll() {}, sameTurnHistoryOwner: () => false,
    agentModelDisplayName: () => '', agentReasoningEffortName: () => '',
    nativeActions: () => [], AgentAvatar: () => null, Glyph: () => null,
    AgentTranscript: () => null, CopyButton: () => null, window: {},
  }
  const make = new Function(...Object.keys(dependencies), labels + '\n' + helpers + '\n' + format + '\n' + detail + '\nreturn { AgentDetail, copy: labels.ru }')
  const { AgentDetail, copy } = make(...Object.values(dependencies))
  const scope = JSON.stringify(['local', 'default', 'parent-runtime'])
  renderToStaticMarkup(React.createElement(AgentDetail, { agent: { id: 'worker', subagentId: 'worker', status: 'running' },
    scope, now: 0, copy, lang: 'ru', dark: true, avatarUrl: () => '', onBack() {}, nativeActions: () => [],
    openNativeAgent() {}, onIdentity: (...args) => received.push(args) }))
  assert.equal(effects.length, 2)
  effects[0]()
  assert.deepEqual(received, [[scope, 'worker', 'owned-child']])
})

test('a provisional goal match does not claim an icon before the identity is proven', async () => {
  const f = fixture()
  try {
    const allocate = f.window.testAvatarRegistry()
    assert.equal(allocate({ subagentId: 'worker', childSession: 'child', nameProvisional: true }), null)
    const confirmed = allocate({ subagentId: 'worker', childSession: 'child' })
    assert(confirmed && confirmed.seed === 'child')
  } finally { f.close() }
})

test('contradictory worker ids for one child do not cause an invented second badge', () => {
  const f = fixture()
  try {
    const allocate = f.window.testAvatarRegistry()
    const first = allocate({ subagentId: 'worker-a', childSession: 'shared-child' })
    assert(first)
    assert.equal(allocate({ subagentId: 'worker-b', childSession: 'shared-child' }), null)
    assert.strictEqual(allocate({ subagentId: 'worker-a', childSession: 'shared-child' }), first)
  } finally { f.close() }
})
