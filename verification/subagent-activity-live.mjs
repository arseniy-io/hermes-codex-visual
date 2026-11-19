import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Render the real pane with a local transcript fixture, without a gateway or
// a Desktop process. The React and JSDOM dependencies come from the test tree.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html lang="ru"><body><main id="app"></main></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const { window } = dom
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
let resolveFinished
let completed = false
const response = names => ({ available: true, subagent_id: 'agent1', child_session_id: 'child1',
  running: !completed, rows: names.map(name => ({ role: 'tool', name })), next_cursor: null })
Object.assign(window, {
  h: React.createElement, useEffect: React.useEffect, useLayoutEffect: React.useLayoutEffect,
  useRef: React.useRef, useState: React.useState, codexIconStyle: () => ({}),
  reasoningEffortLabel: value => value, CopyButton: () => null,
  Streamdown: ({ children }) => React.createElement('span', null, children),
  host: {
    state: {
      activeSessionId: { get: () => 'parent' }, connectionId: { get: () => 'local' },
      profile: { get: () => 'default' }, focusedSessionId: { get: () => 'parent' },
      focusedStoredSessionId: { get: () => 'parent' },
    },
    request: () => completed ? new Promise(resolve => { resolveFinished = resolve }) : Promise.resolve(response(['read_file'])),
  },
})
window.hermesDesktop = {}
const source = fs.readFileSync('source/summary-agents.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.TestPane = AgentPane')
const root = createRoot(window.document.querySelector('#app'))
const base = { id: 'agent1', seed: 'agent1', subagentId: 'agent1', childSession: 'child1',
  status: 'running', model: 'fixture', goal: 'Тест', activity: ['read_file'] }
const props = agent => ({ agents: [agent], scope: '["local","default","parent"]', lang: 'ru', dark: false,
  avatarUrl: () => 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
  nativeActions: () => [], openNativeAgent: () => {},
})
const render = agent => act(async () => root.render(React.createElement(window.TestPane, props(agent))))
const activity = () => [...window.document.querySelectorAll('[data-hcv-subagent-activity-log] li')].map(node => node.textContent)

try {
  await render(base)
  await act(async () => { window.document.querySelector('[data-hcv-subagent-row]').click(); await Promise.resolve() })
  assert.deepEqual(activity(), ['read_file'], 'Overlapping saved and live activity must not be duplicated')

  const running = { ...base, activity: ['read_file', 'write_file · new.txt'] }
  await render(running)
  assert.deepEqual(activity(), ['read_file', 'write_file · new.txt'], 'New activity must appear while the agent is working')

  await render({ ...base, activity: ['Waiting for a result'] })
  assert.deepEqual(activity(), ['read_file', 'Waiting for a result'], 'Unmatched live activity must keep the saved history')
  await render(running)

  completed = true
  await render({ ...running, status: 'completed' })
  assert.deepEqual(activity(), ['read_file', 'write_file · new.txt'], 'Live activity must remain visible while the final history loads')
  await act(async () => { resolveFinished(response(['read_file', 'write_file'])); await Promise.resolve() })
  assert.deepEqual(activity(), ['read_file', 'write_file'], 'The completed transcript becomes the final history')
  console.log('Live, saved and completed subagent activity passed.')
} finally {
  await act(async () => root.unmount())
  dom.window.close()
}
