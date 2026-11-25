import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import * as turn from '../source/completed-turn-disclosure.js'

const require = createRequire(join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')

function fixture(html) {
  const dom = new JSDOM(`<div data-slot="aui_response-group">${html}</div>`)
  return dom.window.document.body.firstElementChild
}
const assistant = (content, footer = '') => `<div data-role="assistant" data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">${content}</div>${footer}</div>`
const text = (id) => `<div class="aui-md" id="${id}"><p>${id}</p></div>`
const tool = (id) => `<div data-slot="tool-block" id="${id}"><button type="button">Logs</button></div>`
const footer = '<footer><div data-slot="aui_msg-actions"></div></footer>'
const receipt = '<div id="receipt" data-slot="aui_background-result"><button type="button">Worker finished</button><div class="aui-md">Report</div></div>'
const ids = nodes => nodes.map(node => node.id)

test('folds sealed interims, work before the answer, and background results', () => {
  const group = fixture(assistant(text('start') + tool('read')) + receipt +
    assistant(text('before') + tool('terminal') + text('after') + text('final'), footer))
  const final = group.lastElementChild
  assert.deepEqual(ids(turn.completedWorkSteps(group, final, { isInterim: row => row === group.firstElementChild })),
    ['', 'receipt', 'before', 'terminal'])
})

test('two native text parts do not make the first part commentary', () => {
  const group = fixture(assistant(text('part-one') + text('part-two'), footer))
  assert.deepEqual(turn.completedWorkSteps(group, group.firstElementChild, { textPartCount: 2 }), [])
})

test('keeps all prose after the last tool when its type is unknown', () => {
  const group = fixture(assistant(tool('read') + text('part-one') + text('part-two'), footer))
  assert.deepEqual(ids(turn.completedWorkSteps(group, group.firstElementChild, { textPartCount: 2 })), ['read'])
})

test('keeps a native tool error visible without requiring role=alert', () => {
  const group = fixture(assistant('<div data-slot="tool-block" id="failure"><svg aria-label="Error" class="text-destructive"></svg></div>' +
    tool('ok') + text('final'), footer))
  assert.deepEqual(ids(turn.completedWorkSteps(group, group.firstElementChild)), ['ok'])
})

test('keeps attachments, interactive blockers and nested response data out of the fold', () => {
  const group = fixture(assistant('<div id="blocking" data-clarify-choices></div>' + tool('inspect')) +
    assistant(`<div data-slot="aui_artifact-card" id="artifact"></div>
      <div data-slot="aui_response-group">${assistant(tool('nested'), footer)}</div>${text('final')}`, footer))
  assert.deepEqual(ids(turn.completedWorkSteps(group, group.lastElementChild)), ['inspect'])
})

test('retains the same native elements and restores their collapsed and expanded states', () => {
  const group = fixture(assistant(tool('step') + text('final'), footer))
  const [step] = turn.completedWorkSteps(group, group.firstElementChild)
  const button = group.ownerDocument.createElement('button')
  group.prepend(button)
  const state = { bar: button, steps: new Set() }
  button.setAttribute('aria-expanded', 'false')
  turn.syncWorkSteps(group, state, [step])
  assert.equal(group.querySelector('#step'), step)
  assert.equal(step.hasAttribute('data-hcv-turn-step'), true)
  turn.setWorkOpen(group, state, true)
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(group.hasAttribute('data-hcv-turn-folded'), false)
  step.querySelector('button').focus()
  turn.setWorkOpen(group, state, false)
  assert.equal(group.ownerDocument.activeElement, button)
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(group.hasAttribute('data-hcv-turn-folded'), true)
  turn.syncWorkSteps(group, state, [])
  assert.equal(step.hasAttribute('data-hcv-turn-step'), false)
})

test('long work lists use the Codex threshold and bound geometry reads before animation', () => {
  const group = fixture(assistant(Array.from({ length: 500 }, (_, i) => tool(`step-${i}`)).join('') + text('final'), footer))
  const steps = turn.completedWorkSteps(group, group.firstElementChild)
  const bar = group.ownerDocument.createElement('button')
  group.prepend(bar)
  const state = { bar, steps: new Set() }
  turn.syncWorkSteps(group, state, steps.slice(0, 47))
  assert.equal(group.hasAttribute('data-hcv-turn-long'), false)
  assert.equal(turn.workMotionPanels(bar).length, 47)
  turn.syncWorkSteps(group, state, steps)
  assert.equal(group.hasAttribute('data-hcv-turn-long'), true)
  const animated = turn.workMotionPanels(bar)
  assert.equal(animated.length, 12)
  assert.equal(animated[0], steps[0])
  assert.equal(animated.at(-1), steps[11])
  turn.syncWorkSteps(group, state, [])
  assert.equal(group.hasAttribute('data-hcv-turn-long'), false)
})
