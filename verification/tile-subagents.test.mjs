import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'
import { canonicalAgentReceipt, matchAgentReceipt } from '../source/agent-receipt-matching.js'
import { mergeTileAgent, sameTileTarget, tileRegistryKey, uniqueTileRoute } from '../source/tile-agent-scope.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const avatars = JSON.parse(fs.readFileSync(new URL('../source/visual-assets.json', import.meta.url), 'utf8')).avatars
const code = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')

function fixture() {
  const dom = new JSDOM(`<html lang="ru" data-test="yes" data-hermes-mode="dark"><body>
  <div data-chat-surface data-composer-target="main" data-session-anchor="workspace"><div data-slot="aui_thread-content"></div></div>
  <div data-chat-surface data-composer-target="tile:a" data-session-anchor="session-tile:a"><div data-slot="aui_thread-content"><div data-slot="aui_turn-pair"><div data-slot="aui_user-message-root" data-message-id="one"></div><div data-slot="aui_response-group"><div data-delegate-card><div><div data-conversation-scaffold><span></span><button>same goal</button></div></div></div></div></div></div></div>
  <div data-chat-surface data-composer-target="tile:b" data-session-anchor="session-tile:b"><div data-slot="aui_thread-content"><div data-slot="aui_turn-pair"><div data-slot="aui_user-message-root" data-message-id="two"></div><div data-slot="aui_response-group"><div data-delegate-card><div><div data-conversation-scaffold><span></span><button>same goal</button></div></div></div></div></div></div></div>
  </body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const nodes = [...document.querySelectorAll('[data-composer-target^="tile:"]')]
  const views = [{}, {}]
  const targets = new Map(nodes.map((surface, i) => [surface, { surface, view: views[i], runtimeId: `runtime-${i}`,
    sessionId: `stored-${i}`, connectionId: 'local', profile: `profile-${i}` }]))
  const calls = new Map(nodes.map((surface, i) => [surface.querySelector('[data-delegate-card]'), {
    toolCallId: `call-${i}`, args: { goal: 'same goal', task_name: `agent_${i}` },
    result: { results: [{ task_index: 0, subagent_id: 'same-worker', child_session_id: `child-${i}`, status: 'completed' }] },
  }]))
  const callbacks = new Map(), frames = new Map(), disposers = [], histories = new Map()
  const requests = []
  let focus = targets.get(nodes[0]), sequence = 0, nextFrame = 0, historyNotify = () => {}, routeOverride
  const atom = initial => { let value = initial; return { get: () => value, set: v => { value = v } } }
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const host = { state: { activeSessionId: state('main-runtime'), connectionId: state('local'), profile: state('main-profile') },
    profileRoutes: async () => routeOverride ?? [...targets.values()].map(target => ({
      connectionId: target.connectionId, profile: target.profile, targetProfile: target.profile })),
    requestProfile: (route, method, params) => new Promise(resolve => requests.push({ route, method, params, resolve })) }
  const tileTurnHistoryTarget = surface => targets.get(surface) || null
  const readFocusedSession = () => focus && ({ surface: focus.surface, view: focus.view, storedId: focus.sessionId,
    runtimeId: focus.runtimeId, owner: { connectionId: focus.connectionId, profile: focus.profile } })
  Object.assign(window, { agentDisplayName, createAgentNameRegistry, canonicalAgentReceipt, matchAgentReceipt,
    sameTileTarget, tileRegistryKey, mergeTileAgent, uniqueTileRoute, tileTurnHistoryTarget, readFocusedSession, host, atom,
    nativeRenderedMessageRecord: () => null,
    committedFiber: node => ({ return: { memoizedProps: calls.has(node) ? calls.get(node) : { row: { status: 'completed' } } } }),
    requestAnimationFrame: cb => { frames.set(++nextFrame, cb); return nextFrame }, cancelAnimationFrame: id => frames.delete(id),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    mountStyle: () => {}, agentAvatars: avatars, codexMask: () => '', AgentPane: () => {}, agentPaneStyles: () => '',
    SummarySection: () => {}, h: () => {}, useEffect: () => {}, useValue: () => {} })
  window.eval(code + '\nwindow.createTestRoster = registerSubagents')
  const roster = window.createTestRoster({ onEvent: (type, cb) => callbacks.set(type, cb), onDispose: cb => disposers.push(cb) },
    '[data-test="yes"]', { forSurface: node => histories.get(node) || null, subscribe: cb => { historyNotify = cb; return () => {} } })
  function flush() {
    for (let pass = 0; pass < 30 && frames.size; pass++) { const work = [...frames.values()]; frames.clear(); for (const cb of work) cb() }
    assert.equal(frames.size, 0)
  }
  flush()
  return { roster, nodes, targets, calls, requests, flush,
    focus(target) { focus = target },
    routes(value) { routeOverride = value },
    history(node, value) { histories.set(node, value) },
    changed() { historyNotify(); flush() },
    emit(target, type, payload, tagged = true) { callbacks.get(type)({ type, session_id: target.runtimeId, seq: ++sequence,
      ...(tagged && { connectionId: target.connectionId, profile: target.profile }), payload }) },
    close() { for (const dispose of disposers.reverse()) dispose(); dom.window.close() } }
}

test('separate tile rosters keep matching worker IDs, names, child IDs and profiles apart', () => {
  const f = fixture()
  try {
    const [a,b] = f.nodes.map(node => f.roster.tiles.get().get(node).agents[0])
    assert.equal(a.subagentId, 'same-worker'); assert.equal(b.subagentId, 'same-worker')
    assert.equal(a.childSession, 'child-0'); assert.equal(b.childSession, 'child-1')
    assert.equal(a.displayName, 'Agent 0'); assert.equal(b.displayName, 'Agent 1')
    assert.equal(f.roster.get().agents.length, 0)
    assert.notEqual(tileRegistryKey(f.targets.get(f.nodes[0])), tileRegistryKey(f.targets.get(f.nodes[1])))
  } finally { f.close() }
})

test('a recycled surface and reused runtime cannot carry another stored chat avatar registry', () => {
  const f = fixture()
  try {
    const node = f.nodes[0], previous = f.targets.get(node), first = f.roster.tiles.get().get(node).agents[0]
    const changed = { ...previous, sessionId: 'a-different-saved-chat' }
    f.targets.set(node, changed); f.focus(changed)
    const call = f.calls.get(node.querySelector('[data-delegate-card]'))
    call.args.task_name = 'brand_new'
    call.result.results[0] = { task_index: 0, subagent_id: 'different-worker', child_session_id: 'child-0', status: 'completed' }
    f.changed()
    const second = f.roster.tiles.get().get(node).agents[0]
    assert.equal(first.visualSeed, 'child-0')
    assert.equal(second.visualSeed, 'child-0', 'A prior chat worker must not reserve this child in the new chat')
    assert.equal(second.displayName, 'Brand new')
    assert.notEqual(tileRegistryKey(previous), tileRegistryKey(changed))
    assert.equal(sameTileTarget(previous, changed), false)
  } finally { f.close() }
})

test('an untagged event for a tile is not borrowed from the primary owner', () => {
  const f = fixture()
  try {
    const t = f.targets.get(f.nodes[0])
    f.emit(t, 'subagent.start', { subagent_id: 'untagged', goal: 'same goal', status: 'running' }, false)
    f.flush()
    assert(!f.roster.tiles.get().get(t.surface).agents.some(a => a.subagentId === 'untagged'))
  } finally { f.close() }
})

test('owner-routed snapshot is discarded after focus changes to another tile', async () => {
  const f = fixture()
  try {
    const a = f.targets.get(f.nodes[0]), b = f.targets.get(f.nodes[1])
    const pending = f.roster.refreshTile(a)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.requests.length, 1)
    assert.equal(f.requests[0].method, 'subagent.list')
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].route)), { connectionId: 'local', profile: 'profile-0', targetProfile: 'profile-0' })
    assert.equal(f.requests[0].params.session_id, 'runtime-0')
    f.focus(b)
    f.requests[0].resolve({ subagents: [{ subagent_id: 'late-a', status: 'running' }] })
    await pending; f.flush()
    assert(!f.roster.tiles.get().get(a.surface).agents.some(agent => agent.id === 'late-a'))
    assert(!f.roster.tiles.get().get(b.surface).agents.some(agent => agent.id === 'late-a'))
  } finally { f.close() }
})

test('a completion event outranks a roster snapshot that was already in flight', async () => {
  const f = fixture()
  try {
    const a = f.targets.get(f.nodes[0]), pending = f.roster.refreshTile(a)
    await new Promise(resolve => setImmediate(resolve))
    f.emit(a, 'subagent.complete', { subagent_id: 'live', child_session_id: 'child-live', status: 'completed' })
    f.requests[0].resolve({ subagents: [{ subagent_id: 'live', status: 'running' }] })
    await pending; f.flush()
    const row = f.roster.tiles.get().get(a.surface).agents.find(agent => agent.id === 'live')
    assert.equal(row.status, 'completed')
  } finally { f.close() }
})

test('saved rows merge only on the same worker ID and never overwrite a finished status with an older snapshot', () => {
  const saved = { subagentId: 'a', childSession: 'child-a', status: 'completed', taskName: 'real_name' }
  assert.equal(mergeTileAgent(saved, { subagentId: 'b', childSession: 'child-b', status: 'running' }), saved)
  assert.equal(mergeTileAgent(saved, { subagentId: 'a', childSession: 'child-b', status: 'running' }), saved)
  assert.equal(mergeTileAgent(saved, { subagentId: 'a', childSession: 'child-a', status: 'running' }).status, 'completed')
})

test('a reused runtime on the same surface cannot inherit the previous chat live event', () => {
  const f = fixture()
  try {
    const node = f.nodes[0], old = f.targets.get(node)
    f.emit(old, 'subagent.start', { subagent_id: 'old-live', child_session_id: 'old-child', status: 'running' })
    f.flush()
    assert(f.roster.tiles.get().get(node).agents.some(a => a.id === 'old-live'))
    const replacement = { ...old, sessionId: 'new-stored-chat' }
    f.targets.set(node, replacement); f.focus(replacement); f.changed()
    assert(!f.roster.tiles.get().get(node).agents.some(a => a.id === 'old-live'))
  } finally { f.close() }
})

test('a timeline click selects only the focused tile and a late focus switch cancels it', () => {
  const f = fixture()
  try {
    const a = f.targets.get(f.nodes[0]), b = f.targets.get(f.nodes[1])
    let opens = 0
    f.roster.revealAgentPane = () => { opens++ }
    f.nodes[0].querySelector('[data-hcv-agent-link]').click()
    f.flush()
    assert.equal(opens, 1)
    assert.equal(f.roster.tileSelection.get().surface, a.surface)
    assert.equal(f.roster.tileSelection.get().id, 'same-worker')
    assert.equal(f.roster.selection.get(), null)
    f.nodes[0].querySelector('[data-hcv-agent-link]').click()
    f.focus(b); f.flush()
    assert.equal(opens, 1)
    assert.equal(f.roster.selection.get(), null)
  } finally { f.close() }
})

test('the same profile and worker ID across two chats still produce separate lists', () => {
  const f = fixture()
  try {
    const first = f.targets.get(f.nodes[0]), second = f.targets.get(f.nodes[1])
    const sameProfile = { ...second, profile: first.profile }
    f.targets.set(f.nodes[1], sameProfile); f.changed()
    const one = f.roster.tiles.get().get(f.nodes[0]).agents[0]
    const two = f.roster.tiles.get().get(f.nodes[1]).agents[0]
    assert.equal(one.childSession, 'child-0')
    assert.equal(two.childSession, 'child-1')
    assert.notEqual(tileRegistryKey(first), tileRegistryKey(sameProfile))
  } finally { f.close() }
})


test('tile snapshot uses the unique remote profile mapping instead of guessing the backend profile', async () => {
  const f = fixture()
  try {
    const original = f.targets.get(f.nodes[0])
    const remote = { ...original, connectionId:'remote', profile:'visible-profile' }
    f.targets.set(remote.surface, remote); f.focus(remote); f.changed()
    f.routes([{ connectionId:'remote', profile:'visible-profile', targetProfile:'backend-profile' }])
    const pending = f.roster.refreshTile(remote)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.requests.length, 1)
    assert.equal(f.requests[0].route.profile, 'visible-profile')
    assert.equal(f.requests[0].route.targetProfile, 'backend-profile')
    f.requests[0].resolve({ subagents:[] }); await pending
  } finally { f.close() }
})

test('missing or ambiguous remote tile routes cannot send a roster request', async () => {
  const f = fixture()
  try {
    const original = f.targets.get(f.nodes[0])
    const remote = { ...original, connectionId:'remote', profile:'visible-profile' }
    f.targets.set(remote.surface, remote); f.focus(remote); f.changed()
    f.routes([])
    await f.roster.refreshTile(remote)
    assert.equal(f.requests.length, 0)
    f.routes([{ connectionId:'remote', profile:'visible-profile', targetProfile:'backend-a' },
      { connectionId:'remote', profile:'visible-profile', targetProfile:'backend-b' }])
    await f.roster.refreshTile(remote)
    assert.equal(f.requests.length, 0)
  } finally { f.close() }
})


test('verified saved receipts remain visible in the tile list without a rendered transcript card', () => {
  const f = fixture()
  try {
    const target=f.targets.get(f.nodes[0]), node=target.surface
    node.querySelector('[data-delegate-card]').remove()
    const row = { row_id:11, delegation_id:'saved-delegation', agents:[{ subagent_id:'saved-worker',
      child_session_id:'saved-child', task_name:'stored_identity', status:'completed' }] }
    f.history(node, {scope:JSON.stringify([target.connectionId,target.profile,target.runtimeId]),
      requestedSessionId:target.sessionId, receipts:[row]})
    f.changed()
    const agent=f.roster.tiles.get().get(node).agents.find(item=>item.id==='saved-worker')
    assert.equal(agent.displayName,'Stored identity')
    assert.equal(agent.childSession,'saved-child')
    assert.equal(agent.status,'completed')
    assert(!f.roster.get().agents.some(item=>item.id==='saved-worker'))
    assert(!f.roster.tiles.get().get(f.nodes[1]).agents.some(item=>item.id==='saved-worker'))
  } finally { f.close() }
})

test('saved receipts with a wrong owner or an ambiguous worker are never added to a tile', () => {
  const f = fixture()
  try {
    const target=f.targets.get(f.nodes[0]), node=target.surface
    node.querySelector('[data-delegate-card]').remove()
    const agent={ subagent_id:'saved-worker', child_session_id:'saved-child', status:'completed' }
    const row={row_id:11, delegation_id:'one', agents:[agent]}
    const own=JSON.stringify([target.connectionId,target.profile,target.runtimeId])
    f.history(node,{scope:JSON.stringify([target.connectionId,'wrong-profile',target.runtimeId]),
      requestedSessionId:target.sessionId, receipts:[row]})
    f.changed()
    assert(!f.roster.tiles.get().get(node).agents.some(item=>item.id==='saved-worker'))
    f.history(node,{scope:own, requestedSessionId:target.sessionId, receipts:[row,{...row,row_id:12,delegation_id:'two'}]})
    f.changed()
    assert(!f.roster.tiles.get().get(node).agents.some(item=>item.id==='saved-worker'))
  } finally { f.close() }
})

test('the same stopped child appears active in its own tile after continuation', () => {
  const f = fixture()
  try {
    const t=f.targets.get(f.nodes[0])
    const call=f.calls.get(t.surface.querySelector('[data-delegate-card]'))
    call.result.delegation_id='old-delegation'
    call.result.results[0].status='interrupted'
    const identity={ subagent_id:'same-worker', child_session_id:'child-0' }
    const original={ ...identity, delegation_id:'old-delegation' }
    const resumed={ ...identity, delegation_id:'hcv-resume-checkpoint-next-run' }
    f.changed()
    f.emit(t,'subagent.complete',{...original,status:'interrupted'})
    f.flush()
    assert.equal(f.roster.tiles.get().get(t.surface).agents[0].status,'interrupted')
    f.emit(t,'subagent.start',resumed)
    f.flush()
    assert.equal(f.roster.tiles.get().get(t.surface).agents.length,1)
    assert.equal(f.roster.tiles.get().get(t.surface).agents[0].status,'running')
    assert.equal(f.roster.tiles.get().get(f.nodes[1]).agents[0].status,'completed')
    f.emit(t,'subagent.complete',{...original,status:'failed'})
    f.flush()
    assert.equal(f.roster.tiles.get().get(t.surface).agents[0].status,'running')
    f.emit(t,'subagent.complete',{...resumed,status:'completed'})
    f.flush()
    assert.equal(f.roster.tiles.get().get(t.surface).agents[0].status,'completed')
  } finally { f.close() }
})
