import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Exercise the actual context hook with a controllable gateway; the separate
// Desktop test covers the real UI and records its model-switch limitation.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const dom = new JSDOM('<html><body><main></main></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' })
const { window } = dom
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })

const atom = value => ({ value, get() { return this.value } })
const state = {
  focusedSessionId: atom('first'), activeSessionId: atom('first'),
  focusedSessionOwner: atom({ profile: 'default', connectionId: 'local' }),
  profile: atom('default'), connectionId: atom('local'), model: atom('mock-model'),
  busy: atom(false), gateway: atom('open'), focusedUsage: atom(null),
}
const listeners = new Set()
let respond = () => Promise.resolve({ model: 'mock-model', context_used: 379_000, context_max: 475_000 })
const socket = {
  request: (method, params) => { assert.equal(method, 'session.context_breakdown'); return respond(params.session_id) },
  onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener) },
}
Object.assign(window, { host: { state, getGateway: () => socket }, useValue: entry => entry.value,
  useState: React.useState, useEffect: React.useEffect })
const source = fs.readFileSync('source/context-meter.js', 'utf8')
window.eval(source.slice(source.indexOf('function readContext('), source.indexOf('\nconst numbers =')) + '\nwindow.testContext = useContext')
const root = createRoot(document.querySelector('main'))
function Probe() { return React.createElement('output', null, JSON.stringify(window.testContext(true))) }
const render = () => React.act(async () => { root.render(React.createElement(Probe)) })
const value = () => JSON.parse(document.querySelector('output').textContent)

try {
  await render()
  assert.deepEqual(value(), { used: 379000, max: 475000, estimated: false })

  state.model.value = 'mock-wide'
  await render()
  assert.equal(value(), null, 'Do not show the old model as the new one')
  respond = () => Promise.resolve({ model: 'mock-wide', context_used: 379_000, context_max: 900_000 })
  await React.act(async () => { for (const listener of listeners) listener({ type: 'session.info', session_id: 'first', payload: {} }) })
  assert.deepEqual(value(), { used: 379000, max: 900000, estimated: false })

  let finishOld
  respond = session => session === 'first' ? new Promise(resolve => { finishOld = resolve })
    : Promise.resolve({ model: 'mock-wide', context_used: 64_000, context_max: 256_000 })
  state.model.value = 'another-model'
  await render()
  assert.equal(value(), null)
  state.focusedSessionId.value = state.activeSessionId.value = 'second'
  state.model.value = 'mock-wide'
  await render()
  assert.deepEqual(value(), { used: 64000, max: 256000, estimated: false })
  await React.act(async () => { finishOld({ model: 'another-model', context_used: 1, context_max: 10 }) })
  assert.deepEqual(value(), { used: 64000, max: 256000, estimated: false }, 'Ignore a late answer from the previous chat')

  state.focusedSessionOwner.value = { profile: 'other', connectionId: 'local' }
  await render()
  assert.equal(value(), null, 'Do not read another profile through the active gateway')
  console.log('Context follows confirmed model and chat changes, and ignores stale or other-profile data.')
} finally {
  await React.act(async () => { root.unmount() })
  dom.window.close()
}
