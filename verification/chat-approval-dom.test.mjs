import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { approvalReview, localizedApprovalActivity, protectedApproval } from '../source/chat-approval-data.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(process.env.HCV_APPROVAL_TEST_SOURCE || new URL('../source/chat-approval.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace('export function registerChatApproval', 'function registerChatApproval')
const atom = value => {
  const listeners = new Set()
  return { get: () => value, set: next => { value = next; for (const fn of listeners) fn(next) },
    listen: fn => { listeners.add(fn); return () => listeners.delete(fn) } }
}
const review = { version: 1, complete: true, reason: 'Уточнить правило', files: [
  { path: 'AGENTS.md', operation: 'edit', diff: '--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1 +1 @@\n-Исходное правило.\n+Новое правило.\n' },
] }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

function setup({ primary = 'chat', focused = 'chat', owner = { profile: 'default', connectionId: 'local' }, rpc, nativeBusy = false } = {}) {
  const dom = new JSDOM('<html lang="ru" data-hermes-codex-visual><head></head><body><div data-test-pane><section data-approval-stack data-session-id="chat"><article data-slot="tool-approval-card" data-request-id="request"><div>Native title</div><pre>Native command</pre><div data-slot="tool-approval-actions"><button data-approval-deny>Отклонить</button><button data-approval-run>Run</button></div></article></section></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only' })
  const { window } = dom, { document } = window
  window.matchMedia = () => ({ addEventListener() {}, removeEventListener() {} })
  const frames = new Map(), disposers = [], calls = []
  let nextFrame = 0
  const request = { requestId: 'request', sessionId: 'chat', command: '<write to AGENTS.md>',
    description: 'Write to protected agent-instruction file(s): AGENTS.md.' }
  let card = document.querySelector('article'), button = card.querySelector('[data-approval-run]')
  const template = card.cloneNode(true)
  const stack = card.parentElement
  const pane = stack.parentElement
  function setupCard() {
    button = card.querySelector('[data-approval-run]')
    button.disabled = nativeBusy
    card.getClientRects = () => pane.hidden ? [] : [{}]
  }
  setupCard()
  const socket = { request: async (method, params) => {
    calls.push({ method, params })
    return rpc ? rpc(method, params) : params.hcv_seen_request_id ? { hcv_review_seen: true } : { approvals: [{ request_id: request.requestId, hcv_review: review }] }
  } }
  const host = { state: { activeSessionId: atom(primary), focusedSessionId: atom(focused),
    connectionId: atom('local'), profile: atom('default'), focusedSessionOwner: atom(owner), gateway: atom('open') },
    getGateway: () => socket,
    requestProfile: (route, method, params) => { assert.equal(route.connectionId, 'local'); assert.equal(route.profile, params.profile); return socket.request(method, params) } }
  let nativeOwner = owner
  const view = { kind: primary === 'chat' ? 'primary' : 'tile', $runtimeId: atom('chat') }
  const nativeSessionView = () => ({ view, nativeOwner })
  const fiber = { memoizedProps: { request }, return: { stateNode: stack } }
  const committedFiber = node => node === card ? fiber : node === button ? { memoizedProps: { disabled: nativeBusy } } : null
  const ctx = { onDispose: fn => disposers.push(fn), addEventListener: (target, name, fn) => {
    target.addEventListener(name, fn); disposers.push(() => target.removeEventListener(name, fn))
  } }
  const register = new Function('host', 'codexMask', 'codexReference', 'mountCSS', 'chatStyles', 'committedFiber', 'nativeSessionView',
    'approvalReview', 'localizedApprovalActivity', 'protectedApproval', 'document', 'window', 'Element', 'MutationObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', source + '\nreturn registerChatApproval')(
    host, () => 'none', { font: 'sans-serif' }, () => {}, {}, committedFiber, nativeSessionView,
    approvalReview, localizedApprovalActivity, protectedApproval, document, window, window.Element, window.MutationObserver,
    fn => { frames.set(++nextFrame, fn); return nextFrame }, id => frames.delete(id))
  register(ctx, ':root[data-hermes-codex-visual]')
  const flush = async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setImmediate(resolve))
      const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn()
    }
  }
  return { dom, document, host, request, calls, get card() { return card }, get button() { return button }, flush,
    replaceCard() {
      const replacement = template.cloneNode(true)
      card.replaceWith(replacement)
      card = replacement
      setupCard()
    },
    setNativeBusy: value => { nativeBusy = value; button.disabled = value },
    setNativeOwner: value => { nativeOwner = value; host.state.focusedSessionOwner.set(value) },
    setNativeSession: value => { view.$runtimeId.set(value); host.state.focusedSessionId.set(value) },
    setVisible: value => { pane.hidden = !value },
    dispose: () => { for (const fn of disposers.reverse()) fn(); dom.window.close() } }
}

test('a focused secondary chat loads the exact review and unlocks native approval', async () => {
  const e = setup({ primary: 'primary-chat' })
  try { await e.flush(); assert.match(e.card.textContent, /-Исходное правило\./); assert.match(e.card.textContent, /\+Новое правило\./)
    assert.equal(e.button.disabled, false); assert.equal(e.calls.length, 2); assert.equal(e.calls[0].params.session_id, 'chat')
  } finally { e.dispose() }
})

test('changing the focused owner wakes a pending card without a DOM mutation', async () => {
  const e = setup({ owner: { profile: 'default', connectionId: 'remote' } })
  try { await e.flush(); assert.equal(e.calls.length, 0)
    e.setNativeOwner({ profile: 'default', connectionId: 'local' }); await e.flush()
    assert.match(e.card.textContent, /\+Новое правило\./); assert.equal(e.button.disabled, false)
  } finally { e.dispose() }
})

test('a failed fetch can be retried without resubmitting or approving an unseen edit', async () => {
  let attempts = 0
  const e = setup({ rpc: async (_method, params) => {
    if (params.hcv_seen_request_id) return { hcv_review_seen: true }
    if (++attempts === 1) throw new Error('temporary disconnect')
    return { approvals: [{ request_id: 'request', hcv_review: review }] }
  } })
  try { await e.flush(); assert.equal(e.button.disabled, true)
    const retry = e.card.querySelector('[data-hcv-approval-part="retry"]'); assert(retry, 'A failed card must offer retry')
    retry.click(); await e.flush(); assert.equal(attempts, 2); assert.equal(e.button.disabled, false)
    assert.match(e.card.textContent, /\+Новое правило\./)
  } finally { e.dispose() }
})

test('a late reply cannot mark or unlock a card rebound to another session', async () => {
  const pending = deferred(); const e = setup({ rpc: async () => pending.promise })
  try { await e.flush(); e.setNativeSession('other-chat'); await e.flush()
    pending.resolve({ approvals: [{ request_id: 'request', hcv_review: review }] }); await e.flush()
    assert.equal(e.calls.length, 1); assert.equal(e.button.disabled, true)
  } finally { e.dispose() }
})

test('focusing another tile keeps the displayed card bound to its own review', async () => {
  const e = setup({ primary: 'primary-chat' })
  try { await e.flush(); e.host.state.focusedSessionId.set('other-chat'); await e.flush()
    assert.match(e.card.textContent, /\+Новое правило\./); assert.equal(e.button.disabled, false)
    assert.equal(e.calls.length, 2)
  } finally { e.dispose() }
})

test('showing a loaded hidden pane acknowledges the displayed review without another focus change', async () => {
  const e = setup({ primary: 'primary-chat', focused: 'other-chat' })
  try { e.setVisible(false); await e.flush(); assert.equal(e.calls.length, 1); assert.equal(e.button.disabled, true)
    e.setVisible(true); await e.flush(); assert.equal(e.calls.length, 2); assert.equal(e.button.disabled, false)
    assert.equal(e.calls[1].params.hcv_seen_request_id, 'request')
  } finally { e.dispose() }
})

test('changed content resembling diff headers stays visible in the before/after review', async () => {
  const exact = { ...review, files: [{ path: 'AGENTS.md', operation: 'edit',
    diff: '--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1 +1 @@\n--- old instruction\n+++ new instruction\n' }] }
  const e = setup({ rpc: async (_method, params) => params.hcv_seen_request_id
    ? { hcv_review_seen: true } : { approvals: [{ request_id: 'request', hcv_review: exact }] } })
  try { await e.flush(); const diff = e.card.querySelector('[data-hcv-approval-part="diff"]')
    assert.match(diff.textContent, /--- old instruction/); assert.match(diff.textContent, /\+\+\+ new instruction/)
    assert.doesNotMatch(diff.textContent, /a\/AGENTS\.md|b\/AGENTS\.md/)
  } finally { e.dispose() }
})

test('disposal restores the original native control and removes added content', async () => {
  const e = setup({ rpc: async () => { throw new Error('offline') } })
  await e.flush(); assert.equal(e.button.disabled, true); e.dispose()
  assert.equal(e.button.disabled, false); assert.equal(e.card.hasAttribute('data-hcv-protected-approval'), false)
})

test('a local secondary profile uses its own qualified route', async () => {
  const e = setup({ primary: 'primary-chat', owner: { profile: 'second-profile', connectionId: 'local' } })
  try { await e.flush(); assert.equal(e.calls[0].params.profile, 'second-profile'); assert.equal(e.button.disabled, false) }
  finally { e.dispose() }
})

test('a failed review acknowledgement keeps approval disabled until a successful retry', async () => {
  let acks = 0
  const e = setup({ rpc: async (_method, params) => params.hcv_seen_request_id
    ? { hcv_review_seen: ++acks > 1 } : { approvals: [{ request_id: 'request', hcv_review: review }] } })
  try { await e.flush(); assert.match(e.card.textContent, /Новое правило/); assert.equal(e.button.disabled, true)
    e.card.querySelector('[data-hcv-approval-part="retry"]').click(); await e.flush()
    assert.equal(acks, 2); assert.equal(e.button.disabled, false)
  } finally { e.dispose() }
})

test('the completed review restores the current native busy state, not the first render', async () => {
  const pending = deferred()
  const e = setup({ nativeBusy: true, rpc: async (_method, params) => params.hcv_seen_request_id
    ? { hcv_review_seen: true } : pending.promise })
  try { await e.flush(); e.setNativeBusy(false)
    pending.resolve({ approvals: [{ request_id: 'request', hcv_review: review }] }); await e.flush()
    assert.equal(e.button.disabled, false)
  } finally { e.dispose() }
  const busy = setup({ nativeBusy: true })
  try { await busy.flush(); assert.equal(busy.button.disabled, true) } finally { busy.dispose() }
})

for (const pendingStep of ['review', 'acknowledgement']) {
  test(`remounting a card during ${pendingStep} keeps the review and approval available`, async () => {
    const pending = deferred()
    const approval = { approvals: [{ request_id: 'request', hcv_review: review }] }
    const seen = { hcv_review_seen: true }
    const e = setup({ rpc: async (_method, params) => params.hcv_seen_request_id
      ? pendingStep === 'acknowledgement' ? pending.promise : seen
      : pendingStep === 'review' ? pending.promise : approval })
    try {
      await e.flush()
      e.replaceCard()
      await e.flush()
      assert.equal(e.button.disabled, true)
      pending.resolve(pendingStep === 'review' ? approval : seen)
      await e.flush()
      assert.match(e.card.textContent, /Новое правило/)
      assert.equal(e.button.disabled, false)
      assert.equal(e.calls.length, 2)
    } finally { e.dispose() }
  })
}
