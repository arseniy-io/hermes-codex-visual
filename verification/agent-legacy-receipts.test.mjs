import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { canonicalAgentReceipt, matchAgentReceipt } from '../source/agent-receipt-matching.js'
import { agentDisplayName, createAgentNameRegistry } from '../source/agent-display-name.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/subagents.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
const avatars = JSON.parse(fs.readFileSync(new URL('../source/visual-assets.json', import.meta.url), 'utf8')).avatars

function fixture({ owned = true } = {}) {
  const dom = new JSDOM(`<html lang="ru" data-test="yes" data-hermes-mode="dark"><head></head><body>
    <div data-chat-surface data-composer-target="main" data-session-anchor="workspace">
      <div data-slot="aui_thread-content"><div data-slot="aui_turn-pair">
        <div data-slot="aui_user-message-root" data-message-id="prompt-1"></div>
        <div data-slot="aui_response-group"><div data-slot="aui_system-message-root">
          <div data-slot="aui_background-result"><div data-conversation-scaffold><div><button><span class="truncate">Subagent Task Completed: Truncated goal…</span></button></div></div></div>
        </div></div>
      </div></div>
    </div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  const { document } = window
  const frames = new Map()
  let next = 0
  const disposers = []
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const host = { state: { activeSessionId: state('parent-runtime'), connectionId: state('local'), profile: state('default') },
    request: async () => ({ subagents: [] }) }
  const scope = JSON.stringify(['local', 'default', 'parent-runtime'])
  const history = { current: () => ({ scope, sessionId: 'parent-stored', requestedSessionId: 'parent-stored',
    receipts: [{ row_id: 1219, delegation_id: 'deleg_saved', agents: [{ task_index: 0, subagent_id: 'sa-real',
      child_session_id: 'child-saved', status: 'completed', task_name: 'saved_name', agent_path: '/root/saved_name' }] }] }),
    subscribe: () => () => {} }
  Object.assign(window, {
    agentDisplayName, createAgentNameRegistry, canonicalAgentReceipt, matchAgentReceipt, host,
    nativeRenderedMessageRecord: () => ({ rowId: 1219, runtimeId: 'parent-runtime', storedId: owned ? 'parent-stored' : 'foreign' }),
    atom: initial => { let value = initial; return { get: () => value, set: next => { value = next } } },
    committedFiber: () => ({ return: { memoizedProps: { report: 'Stored report.' } } }),
    requestAnimationFrame: callback => { frames.set(++next, callback); return next },
    cancelAnimationFrame: frame => frames.delete(frame),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    mountStyle: (_ctx, sheet) => document.head.append(sheet), agentAvatars: avatars, codexMask: () => '',
    AgentPane: () => {}, agentPaneStyles: () => '', SummarySection: () => {},
    h: () => {}, useEffect: () => {}, useValue: () => {},
  })
  window.eval(source + '\nwindow.createTestRoster = registerSubagents')
  const roster = window.createTestRoster({ onEvent() {}, onDispose: callback => disposers.push(callback) }, '[data-test="yes"]', history)
  const flush = async () => {
    for (let pass = 0; pass < 15; pass++) {
      await new Promise(resolve => window.setTimeout(resolve, 0))
      if (!frames.size) return
      const work = [...frames.values()]; frames.clear()
      for (const callback of work) callback()
    }
    assert.fail('Receipt reconciliation did not settle')
  }
  return { document, roster, flush, close() { for (const dispose of disposers.reverse()) dispose(); window.close() } }
}

test('a canonical saved receipt recovers its name, avatar and pane action even without the original tool card', async () => {
  const f = fixture()
  try {
    await f.flush()
    const row = f.document.querySelector('[data-hcv-agent-activity="completed"]')
    assert.equal(row?.textContent, 'Saved name завершил(-и) работу')
    assert(row.querySelector('img')?.src.startsWith('data:image/svg+xml,'))
    assert.equal(f.roster.get().agents[0].visualSeed, 'child-saved')
    row.querySelector('[data-hcv-agent-link]').click()
    assert.equal(f.roster.selection.get().id, 'sa-real')
  } finally { f.close() }
})

test('a receipt cannot receive data from a different stored conversation', async () => {
  const f = fixture({ owned: false })
  try {
    await f.flush()
    assert.equal(f.document.querySelectorAll('[data-hcv-agent-activity]').length, 0)
    assert.equal(f.roster.get().agents.length, 0)
  } finally { f.close() }
})
