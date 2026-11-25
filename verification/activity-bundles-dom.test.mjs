import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import { activityGroup, activityGroups, activityMember, activityRepeatGroup, activityRepeatMember, emptyActivityOwner } from '../source/chat-activity-groups.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')

test('activity groups keep failed calls inside their disclosure and stop at agent status', () => {
  const dom = new JSDOM('<!doctype html><html lang="ru"><body><div data-slot="aui_response-group"></div></body></html>')
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const root = () => {
      const row = doc.createElement('div')
      row.dataset.slot = 'aui_assistant-message-root'
      const body = doc.createElement('div')
      body.dataset.slot = 'aui_assistant-message-content'
      row.append(body)
      response.append(row)
      return { row, body }
    }
    const paragraph = body => {
      const node = doc.createElement('div')
      node.className = 'aui-md'
      node.textContent = 'Комментарий'
      body.append(node)
    }
    const thought = body => {
      const node = doc.createElement('div')
      node.dataset.slot = 'aui_thinking-disclosure'
      node.innerHTML = '<button aria-expanded="false">Думал</button>'
      body.append(node)
      return node
    }
    const tool = (body, toolName, result = {}) => {
      const node = doc.createElement('div')
      node.dataset.slot = 'tool-block'
      node.dataset.toolGroup = ''
      node.innerHTML = '<div data-tool-summary><button aria-expanded="false">Действия</button></div>'
      const button = node.querySelector('button')
      button.addEventListener('click', () => button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true')))
      node.parts = [{ toolName, args: {}, result, completedAt: 1 }]
      body.append(node)
      return node
    }
    const first = root()
    paragraph(first.body)
    const firstThought = thought(first.body)
    const browser = tool(first.body, 'mcp__chrome_devtools__list_pages')
    const continuation = root()
    thought(continuation.body)
    const reading = tool(continuation.body, 'read_file')
    const error = tool(continuation.body, 'terminal', { exit_code: 1, error: 'fixture error' })
    const markedError = tool(continuation.body, 'mcp__chrome_devtools__click')
    const errorIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    errorIcon.setAttribute('class', 'text-destructive')
    errorIcon.setAttribute('aria-label', 'Ошибка')
    markedError.append(errorIcon)
    const approval = tool(continuation.body, 'terminal')
    approval.parts[0].status = { type: 'requires-action' }
    const agent = doc.createElement('button')
    agent.dataset.hcvAgentRows = ''
    agent.textContent = 'Агент начал работу'
    continuation.body.append(agent)
    const last = root()
    paragraph(last.body)
    thought(last.body)
    tool(last.body, 'terminal')

    const groups = activityGroups(node => node.parts || [])
    groups.sync(response, true)
    const headers = response.querySelectorAll(`[${activityGroup}] > button`)
    assert.equal(headers.length, 2)
    assert.equal(firstThought.getAttribute(activityMember), 'closed')
    assert.equal(reading.getAttribute(activityMember), 'closed')
    assert.equal(error.hasAttribute(activityMember), true)
    assert.equal(markedError.hasAttribute(activityMember), true)
    assert.equal(approval.hasAttribute(activityMember), false)
    assert.equal(agent.hasAttribute(activityMember), false)
    assert.equal(continuation.row.hasAttribute(emptyActivityOwner), false)

    headers[0].click()
    assert.equal(headers[0].getAttribute('aria-expanded'), 'true')
    assert.equal(browser.querySelector('button').getAttribute('aria-expanded'), 'true')
    const extra = tool(continuation.body, 'mcp__chrome_devtools__click')
    groups.sync(response, true)
    assert.equal(response.querySelector(`[${activityGroup}] > button`), headers[0])
    assert.equal(headers[0].getAttribute('aria-expanded'), 'true')
    assert.equal(extra.hasAttribute(activityMember), false, 'A new command after an agent starts its own run')

    const edit = doc.createElement('div')
    edit.dataset.slot = 'tool-block'
    edit.dataset.toolRow = ''
    edit.dataset.fileEdit = ''
    edit.innerHTML = '<button aria-expanded="true">Изменён файл</button>'
    edit.parts = [{ toolName: 'edit_file', args: { path: 'fixture.txt' }, result: {}, completedAt: 1 }]
    const editToggle = edit.querySelector('button')
    editToggle.addEventListener('click', () => editToggle.setAttribute('aria-expanded', String(editToggle.getAttribute('aria-expanded') !== 'true')))
    continuation.body.append(edit)
    groups.sync(response, true)
    assert.equal(extra.getAttribute(activityMember), 'closed', 'The second run gets its own collapsed disclosure')
    extra.previousElementSibling.querySelector('button').click()
    assert.equal(editToggle.getAttribute('aria-expanded'), 'false')
    editToggle.click()
    groups.sync(response, true)
    assert.equal(editToggle.getAttribute('aria-expanded'), 'true')

    reading.parts[0].result = { success: false, error: 'read failed' }
    groups.sync(response, true)
    assert.equal(reading.hasAttribute(activityMember), true)
    assert.equal(error.hasAttribute(activityMember), true)
    assert.equal(markedError.hasAttribute(activityMember), true)
    assert.equal(approval.hasAttribute(activityMember), false)
    assert.equal(agent.textContent, 'Агент начал работу')
    headers[0].click()
    assert.equal(headers[0].getAttribute('aria-expanded'), 'false')
    assert.equal(reading.hasAttribute(activityMember), true)

    groups.clear()
    assert.equal(response.querySelectorAll(`[${activityGroup}], [${activityMember}], [${emptyActivityOwner}]`).length, 0)
    assert.equal(browser.querySelector('button').getAttribute('aria-expanded'), 'false')
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('a fully collapsed continuation does not leave an empty message row', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
      <div data-slot="aui_thinking-disclosure"><button aria-expanded="true">Думаю</button></div><div data-slot="tool-block" id="first"></div>
    </div><span aria-hidden="true"></span></div>
    <div data-slot="aui_assistant-message-root" id="continuation"><div data-slot="aui_assistant-message-content">
      <div data-slot="aui_thinking-disclosure"></div><div data-slot="tool-block" id="second"></div>
    </div><span aria-hidden="true"></span></div>
  </div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const continuation = doc.querySelector('#continuation')
    const groups = activityGroups(node => node.matches('[data-slot="tool-block"]')
      ? [{ toolName: 'terminal', args: {}, result: {}, completedAt: 1 }] : [])
    groups.sync(response, true)
    const toggle = response.querySelector(`[${activityGroup}] > button`)
    assert(toggle)
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert(continuation.hasAttribute(emptyActivityOwner))
    toggle.click()
    assert.equal(continuation.hasAttribute(emptyActivityOwner), false)
    toggle.click()
    assert(continuation.hasAttribute(emptyActivityOwner))
    groups.clear()
    assert.equal(continuation.hasAttribute(emptyActivityOwner), false)
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('an unconfirmed old call is not presented as running or completed', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
      <div data-slot="aui_thinking-disclosure"></div><div data-slot="tool-block" id="call"></div>
    </div></div>
  </div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const call = doc.querySelector('#call')
    const groups = activityGroups(node => node === call ? [{ toolName: 'terminal', args: {} }] : [])
    groups.sync(response, true)
    assert.equal(response.querySelector(`[${activityGroup}]`), null)
    assert.equal(call.hasAttribute(activityMember), false)
    const marker = doc.createElement('span')
    marker.setAttribute('data-message-streaming', 'true')
    response.firstElementChild.append(marker)
    groups.sync(response, true)
    assert.equal(response.querySelector(`[${activityGroup}] > button`).textContent, 'Выполняется команда')
    marker.remove()
    groups.sync(response, true)
    assert.equal(response.querySelector(`[${activityGroup}]`), null)
    assert.equal(call.hasAttribute(activityMember), false)
    groups.clear()
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('a long tool-heavy response keeps its steps and one group as new work arrives', () => {
  const dom = new JSDOM('<!doctype html><div data-slot="aui_response-group"></div>')
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const nodes = []
    let body
    function addStep(index) {
      if (index % 20 === 0) {
        const row = doc.createElement('div')
        row.dataset.slot = 'aui_assistant-message-root'
        body = doc.createElement('div')
        body.dataset.slot = 'aui_assistant-message-content'
        row.append(body)
        response.append(row)
      }
      const thinking = doc.createElement('div')
      thinking.dataset.slot = 'aui_thinking-disclosure'
      body.append(thinking)
      const call = doc.createElement('div')
      call.dataset.slot = 'tool-block'
      call.parts = [{ toolName: index % 2 ? 'read_file' : 'mcp__chrome_devtools__list_pages',
        args: {}, result: index === 43 ? { error: 'fixture error' } : {}, completedAt: 1 }]
      body.append(call)
      nodes.push({ thinking, call })
    }
    for (let index = 0; index < 120; index++) addStep(index)
    const groups = activityGroups(node => node.parts || [])
    groups.sync(response, true)
    const header = response.querySelector(`[${activityGroup}] > button`)
    assert(header)
    assert.equal(response.querySelectorAll(`[${activityGroup}]`).length, 1)
    assert.equal(response.querySelectorAll(`[${activityMember}="closed"]`).length, 240)
    assert.equal(nodes[43].call.hasAttribute(activityMember), true)
    header.click()
    for (let index = 120; index < 140; index++) addStep(index)
    groups.sync(response, true)
    assert.equal(response.querySelector(`[${activityGroup}] > button`), header)
    assert.equal(header.getAttribute('aria-expanded'), 'true')
    assert.equal(response.querySelectorAll(`[${activityMember}]`).length, 280)
    assert.equal(nodes[43].call.hasAttribute(activityMember), true)
    groups.clear()
    assert.equal(response.querySelectorAll(`[${activityMember}]`).length, 0)
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('a grouped browser icon receives only the public site origin', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
      <div data-slot="aui_thinking-disclosure"></div><div data-slot="tool-block" id="call"></div>
    </div></div>
  </div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const call = doc.querySelector('#call')
    const resolved = []
    const groups = activityGroups(node => node === call ? [{
      toolName: 'mcp__chrome_devtools__js', args: {}, completedAt: 1,
      result: { _meta: { 'codex/toolSurface': { kind: 'browserUse', backend: 'chrome' },
        browser_use: { url: 'https://www.threads.com/@fixture?private=example' } } },
    }] : [], (_header, _title, site) => resolved.push(site))
    groups.sync(response, true)
    assert.equal(resolved.at(-1), 'https://www.threads.com')
    groups.clear()
    assert.equal(resolved.at(-1), '')
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})


test('consecutive identical MCP calls get a closed nested disclosure without moving or replacing original rows', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
      <div data-slot="tool-block" data-tool-group><div data-tool-summary><button aria-expanded="true">Действия</button></div>
      <div id="native-rows"></div></div>
    </div></div></div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const container = doc.querySelector('#native-rows')
    const rows = []
    let nativeClicks = 0
    function add(toolName, failed = false) {
      const row = doc.createElement('div')
      row.dataset.toolRow = ''
      row.dataset.slot = 'tool-block'
      const button = doc.createElement('button')
      button.addEventListener('click', () => nativeClicks++)
      row.append(button)
      row.parts = [{ toolName, args: {}, completedAt: 1, result: failed ? { error: 'fixture failure' } : {},
        toolDefinition: { title: toolName.endsWith('fetch_file') ? 'fetch_file' : 'other' } }]
      container.append(row)
      rows.push(row)
      return row
    }
    for (let index = 0; index < 13; index++) add('mcp__github__fetch_file')
    add('terminal')
    add('mcp__github__fetch_file')
    add('mcp__github__fetch_file')
    const failed = add('mcp__github__fetch_file', true)
    const standalone = add('mcp__github__fetch_file')
    const groups = activityGroups(node => node.parts || [])
    groups.sync(response, true)
    const headers = [...container.querySelectorAll(`[${activityRepeatGroup}]`)]
    assert.equal(headers.length, 2)
    assert.equal(headers[0].textContent, 'fetch_file · 13 вызовов')
    assert.equal(headers[0].getAttribute(activityRepeatGroup), 'activityGithub')
    assert.equal(headers[0].querySelector('button').getAttribute('aria-expanded'), 'false')
    assert.equal(rows[0].getAttribute(activityRepeatMember), 'closed')
    assert.equal(failed.hasAttribute(activityRepeatMember), false)
    assert.equal(standalone.hasAttribute(activityRepeatMember), false)
    headers[0].querySelector('button').click()
    assert.equal(rows[0].getAttribute(activityRepeatMember), 'first')
    assert.equal(rows[12].getAttribute(activityRepeatMember), 'next')
    rows[4].querySelector('button').click()
    assert.equal(nativeClicks, 1)
    groups.sync(response, true)
    assert.equal(container.querySelector(`[${activityRepeatGroup}]`), headers[0])
    assert.equal(headers[0].querySelector('button').getAttribute('aria-expanded'), 'true')
    assert.deepEqual([...container.children].filter(node => node.hasAttribute('data-tool-row')), rows)
    assert(rows.every(row => row.parentElement === container))
    groups.clear()
    assert.equal(container.querySelectorAll(`[${activityRepeatGroup}], [${activityRepeatMember}]`).length, 0)
    assert.deepEqual([...container.children], rows)
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})


test('a new overall disclosure starts closed even if Hermes auto-expanded its native summary', () => {
  const dom = new JSDOM(`<!doctype html><div data-slot="aui_response-group">
    <div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content">
    <div data-slot="aui_thinking-disclosure"></div>
    <div data-slot="tool-block" data-tool-group><div data-tool-summary><button aria-expanded="true">Действия</button></div></div>
    </div></div></div>`)
  const previousDocument = globalThis.document
  globalThis.document = dom.window.document
  try {
    const doc = dom.window.document
    const response = doc.querySelector('[data-slot="aui_response-group"]')
    const native = response.querySelector('[data-tool-summary] button')
    native.addEventListener('click', () => native.setAttribute('aria-expanded', String(native.getAttribute('aria-expanded') !== 'true')))
    const groups = activityGroups(node => node.matches('[data-tool-group]')
      ? [{ toolName: 'terminal', args: { command: 'echo one' }, result: {}, completedAt: 1 }] : [])
    groups.sync(response, true)
    const header = response.querySelector(`[${activityGroup}] > button`)
    assert.equal(header.getAttribute('aria-expanded'), 'false')
    assert.equal(native.getAttribute('aria-expanded'), 'false')
    groups.clear()
    assert.equal(native.getAttribute('aria-expanded'), 'true')
  } finally {
    globalThis.document = previousDocument
    dom.window.close()
  }
})
