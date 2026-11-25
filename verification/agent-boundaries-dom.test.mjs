import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import { activityGroup, activityGroups, activityMember } from '../source/chat-activity-groups.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')

test('commands on either side of an agent start or completion remain separate disclosures', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"></div></div>
  </div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const body = doc.querySelector('[data-slot="aui_assistant-message-content"]')
    const terminal = command => {
      const node = doc.createElement('div')
      node.dataset.slot = 'tool-block'
      node.dataset.toolGroup = ''
      node.innerHTML = '<div data-tool-summary><button aria-expanded="false">Действия</button></div>'
      node.parts = [{ toolName: 'terminal', args: { command }, result: { exit_code: 0 }, completedAt: 1 }]
      const button = node.querySelector('button')
      button.addEventListener('click', () => button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true')))
      body.append(node)
      return node
    }
    const agent = kind => {
      const rows = doc.createElement('div')
      rows.dataset.hcvAgentRows = ''
      const row = doc.createElement('span')
      row.dataset.hcvAgentActivity = kind
      row.dataset.hcvAgentId = 'fixture-reviewer'
      row.textContent = kind === 'started' ? 'Проверка методики начал(-и) работу' : 'Проверка методики завершил(-и) работу'
      rows.append(row)
      body.append(rows)
      return rows
    }
    const before = [terminal('echo before-one'), terminal('echo before-two')]
    const started = agent('started')
    const middle = [terminal('echo middle-one'), terminal('echo middle-two')]
    const completed = agent('completed')
    const after = [terminal('echo after-one'), terminal('echo after-two')]
    const expected = [before, middle, after]
    const groups = activityGroups(node => node.parts || [])
    groups.sync(response, true)
    const headers = [...response.querySelectorAll(`[${activityGroup}] > button`)]
    assert.equal(headers.length, 3, 'An agent event is a boundary even when there is no prose paragraph')
    for (const [index, header] of headers.entries()) {
      assert.deepEqual(groups.panels(header), expected[index])
      header.click()
      assert(expected[index].every(node => node.getAttribute(activityMember) !== 'closed'))
      assert(expected.filter((_, other) => other !== index).flat().every(node => node.getAttribute(activityMember) === 'closed'))
      header.click()
    }
    assert(!started.hasAttribute(activityMember))
    assert(!completed.hasAttribute(activityMember))
    groups.clear()
    assert.equal(response.querySelectorAll(`[${activityGroup}], [${activityMember}]`).length, 0)
    assert(started.isConnected && completed.isConnected, 'The native agent events must survive group cleanup')
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('a saved system receipt splits command groups across assistant message roots', () => {
  const dom = new JSDOM('<!doctype html><div data-slot="aui_response-group"></div>')
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const commands = prefix => {
      const root = doc.createElement('div')
      root.dataset.slot = 'aui_assistant-message-root'
      const body = doc.createElement('div')
      body.dataset.slot = 'aui_assistant-message-content'
      root.append(body)
      response.append(root)
      return ['one', 'two'].map(suffix => {
        const node = doc.createElement('div')
        node.dataset.slot = 'tool-block'
        node.parts = [{ toolName: 'terminal', args: { command: `echo ${prefix}-${suffix}` },
          result: { exit_code: 0 }, completedAt: 1 }]
        body.append(node)
        return node
      })
    }
    const before = commands('before')
    const receipt = doc.createElement('div')
    receipt.dataset.slot = 'aui_system-message-root'
    receipt.innerHTML = '<div data-slot="aui_background-result"><button>Проверка методики завершил(-и) работу</button></div>'
    response.append(receipt)
    const after = commands('after')
    const groups = activityGroups(node => node.parts || [])
    groups.sync(response, true)
    const headers = [...response.querySelectorAll(`[${activityGroup}] > button`)]
    assert.equal(headers.length, 2, 'A visible system completion must separate the preceding and following commands')
    assert.deepEqual(groups.panels(headers[0]), before)
    assert.deepEqual(groups.panels(headers[1]), after)
    assert(!receipt.hasAttribute(activityMember))
    assert(!receipt.querySelector(`[${activityMember}]`))
    groups.clear()
    assert(receipt.isConnected)
    assert.equal(response.querySelectorAll(`[${activityGroup}], [${activityMember}]`).length, 0)
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})
