import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'
import { matchAgentReceipt } from '../source/agent-receipt-matching.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const avatars = JSON.parse(fs.readFileSync(new URL('../source/visual-assets.json', import.meta.url), 'utf8')).avatars

function fixture({ subagentId = 'stored-worker' } = {}) {
  const dom = new JSDOM(`<html lang="ru" data-test="yes" data-hermes-mode="dark"><head></head><body>
    <div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
      <div data-slot="aui_thread-content"><div data-slot="aui_turn-pair">
        <div data-slot="aui_user-message-root" data-message-id="prompt-1"></div>
        <div data-slot="aui_response-group"><div data-slot="aui_assistant-message-root" data-message-id="message-1">
          <div data-slot="aui_assistant-message-content"><div data-delegate-card data-slot="tool-block">
            <div><div data-conversation-scaffold><span><svg aria-label="Done"></svg></span><button>Actual saved goal.</button></div></div>
          </div></div>
        </div></div>
      </div></div>
    </div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  const { document } = window
  const card = document.querySelector('[data-delegate-card]')
  const frames = new Map()
  let nextFrame = 0
  const disposers = []
  const requests = []
  const completions = []
  const failures = []
  let now = 1000
  const observed = new Set()
  let visibilityCallback
  const state = value => {
    const listeners = new Set()
    return { get: () => value, set: next => { value = next; for (const listener of listeners) listener(value) },
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  }
  const parent = state('parent-runtime')
  const profile = state('default')
  const connection = state('local')
  const gateway = state('open')
  const host = { state: { activeSessionId: parent, profile, connectionId: connection, gateway,
    focusedSessionId: state('parent-runtime'), focusedStoredSessionId: state('parent-stored') },
    request: async (method, params) => {
      if (method !== 'session.transcript') return { subagents: [] }
      requests.push({ method, params })
      return new Promise((resolve, reject) => { completions.push(resolve); failures.push(reject) })
    } }
  const fibers = new Map([
    [card, { toolCallId: 'legacy-call', args: { tasks: [{ goal: 'Actual saved goal.' }] },
      result: { results: [{ task_index: 0, status: 'completed', ...(subagentId && { subagent_id: subagentId }) }] } }],
    [card.firstElementChild, { row: { id: 'native-row', status: 'completed', goal: 'Actual saved goal.' } }],
  ])
  Object.assign(window, {
    agentDisplayName, createAgentNameRegistry, matchAgentReceipt, host,
    atom: initial => { let value = initial; return { get: () => value, set: next => { value = next } } },
    committedFiber: element => fibers.has(element) ? { return: { memoizedProps: fibers.get(element) } } : null,
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: frame => frames.delete(frame),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    mountStyle: (_ctx, sheet) => document.head.append(sheet), agentAvatars: avatars, codexMask: () => '',
    AgentPane: () => {}, agentPaneStyles: () => '', SummarySection: () => {},
    h: () => {}, useEffect: () => {}, useValue: () => {},
    IntersectionObserver: class {
      constructor(callback) { visibilityCallback = callback }
      observe(target) { observed.add(target) }
      unobserve(target) { observed.delete(target) }
      disconnect() { observed.clear() }
    },
  })
  window.Date.now = () => now
  window.Element.prototype.checkVisibility = () => true
  window.eval(source + '\nwindow.createTestRoster = registerSubagents')
  const roster = window.createTestRoster({ onEvent() {}, onDispose: callback => disposers.push(callback) }, '[data-test="yes"]')
  const flush = async () => {
    for (let pass = 0; pass < 15; pass++) {
      await new Promise(resolve => window.setTimeout(resolve, 0))
      if (!frames.size) return
      const work = [...frames.values()]
      frames.clear()
      for (const callback of work) callback()
    }
    assert.fail('Identity reconciliation did not settle')
  }
  return { document, roster, parent, profile, connection, gateway, requests, completions, failures, flush,
    advance(ms) { now += ms },
    reveal(visible = true) { visibilityCallback([...observed].map(target => ({ target, isIntersecting: visible }))) },
    close() { for (const dispose of disposers.reverse()) dispose(); dom.window.close() } }
}

test('only a visible legacy completion queries one owned child row, deduplicates and restores canonical identity', async () => {
  const f = fixture()
  try {
    await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity] img').length, 0)
    assert.equal(f.requests.length, 0)
    f.reveal(false)
    assert.equal(f.requests.length, 0)
    f.reveal()
    f.reveal()
    assert.equal(f.requests.length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].params)), { session_id: 'parent-stored', profile: 'default',
      subagent_id: 'stored-worker', order: 'oldest', limit: 1 })
    f.completions[0]({ available: true, subagent_id: 'stored-worker', child_session_id: 'canonical-child',
      task_name: 'actual_name', agent_path: '/root/actual_name', rows: [] })
    await f.flush()
    const icon = f.document.querySelector('[data-hcv-agent-activity] img')
    assert(icon?.src.startsWith('data:image/svg+xml,'))
    assert.equal(f.roster.get().agents[0].childSession, 'canonical-child')
    assert.equal(f.roster.get().agents[0].displayName, 'Actual name')
    assert.equal(f.requests.length, 1)
  } finally { f.close() }
})

test('an unavailable or mismatched response never supplies a badge or a guessed name', async () => {
  for (const response of [
    { available: false, subagent_id: 'stored-worker', child_session_id: 'unowned-child' },
    { available: true, subagent_id: 'another-worker', child_session_id: 'unowned-child' },
  ]) {
    const f = fixture()
    try {
      await f.flush()
      f.reveal()
      f.completions[0]({ ...response, task_name: 'untrusted_name', agent_path: '/root/untrusted_name', rows: [] })
      await f.flush()
      assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity] img').length, 0)
      assert.equal(f.roster.get().agents[0].childSession, '')
      assert.equal(f.roster.get().agents[0].displayName, 'Субагент')
      f.reveal()
      assert.equal(f.requests.length, 1)
    } finally { f.close() }
  }
})

test('late canonical metadata is ignored after changing parent, profile, or connection', async () => {
  for (const field of ['parent', 'profile', 'connection']) {
    const f = fixture()
    try {
      await f.flush()
      f.reveal()
      f[field].set('different-owner')
      await f.flush()
      f.completions[0]({ available: true, subagent_id: 'stored-worker', child_session_id: 'late-child', rows: [] })
      await f.flush()
      assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity] img').length, 0)
      assert.equal(f.roster.get().agents[0].childSession, '')
    } finally { f.close() }
  }
})

test('a legacy completion without a saved subagent id does not enumerate sessions or invent a badge', async () => {
  const f = fixture({ subagentId: '' })
  try {
    await f.flush()
    f.reveal()
    assert.equal(f.requests.length, 0)
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity] img').length, 0)
    assert.equal(f.roster.get().agents[0].displayName, 'Субагент')
  } finally { f.close() }
})

test('a transient failure retries only after the negative TTL and a new visibility event', async () => {
  const f = fixture()
  try {
    await f.flush(); f.reveal()
    f.failures[0](new Error('Temporary timeout'))
    await f.flush(); f.reveal()
    assert.equal(f.requests.length, 1, 'No retry loop on a visible row')
    f.advance(15001); f.reveal()
    assert.equal(f.requests.length, 2)
    f.completions[1]({ available: true, subagent_id: 'stored-worker', child_session_id: 'recovered-child', rows: [] })
    await f.flush()
    assert.equal(f.roster.get().agents[0].childSession, 'recovered-child')
  } finally { f.close() }
})

test('gateway recovery permits a fresh negative lookup without waiting for another timer', async () => {
  const f = fixture()
  try {
    await f.flush(); f.reveal()
    f.completions[0]({ available: false, subagent_id: 'stored-worker', child_session_id: null, rows: [] })
    await f.flush()
    f.gateway.set('closed'); f.gateway.set('open')
    assert.equal(f.requests.length, 2)
    f.completions[1]({ available: true, subagent_id: 'stored-worker', child_session_id: 'gateway-restored-child', rows: [] })
    await f.flush()
    assert.equal(f.roster.get().agents[0].childSession, 'gateway-restored-child')
  } finally { f.close() }
})
