import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/composer-send-clearance.js', import.meta.url), 'utf8')
const selectors = fs.readFileSync(new URL('../source/composer-native.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const executable = source.slice(source.indexOf('const dockedComposer')).replace('export function ', 'function ')
const viewportSelector = '[data-slot="aui_thread-viewport"]'
const promptSelector = '[data-slot="aui_user-message-root"][data-message-id]'

function surface(target) {
  return `<section data-chat-surface data-composer-target="${target}"
        style="--hcv-composer-surface-height: 182px">
    <div data-slot="aui_thread-viewport" data-following="true">
      <div data-slot="aui_thread-content">
        <div data-slot="aui_turn-pair">
          <div data-slot="aui_user-message-root" data-message-id="saved"></div>
          <div data-slot="aui_response-group"></div>
        </div>
        <div data-slot="aui_composer-clearance"></div>
      </div>
    </div>
    <div data-slot="composer-dock"><form data-slot="composer-root">
      <div data-slot="composer-rich-input" contenteditable="true"></div>
      <div data-slot="composer-attachments"><div class="group/attachment">
        <button type="button"><span><img></span></button>
      </div></div>
      <button type="submit"><span class="codicon-arrow-up"></span></button>
    </form></div>
  </section>`
}

function setup() {
  const dom = new JSDOM(`<body>${surface('main')}${surface('tile:secondary')}</body>`, { runScripts: 'outside-only' })
  const { window } = dom
  const { document } = window
  const listeners = new Map()
  const disposers = []
  const timers = new Map()
  const views = new Map()
  let timer = 0
  let enabled = true
  for (const element of document.querySelectorAll('[data-chat-surface]')) {
    const watchers = new Set()
    views.set(element, {
      busy: false,
      $busy: { get: () => views.get(element).busy },
      $storedId: { get: () => 'stored-chat',
        listen(listener) { watchers.add(listener); return () => watchers.delete(listener) } },
      switchSession() { for (const listener of watchers) listener() },
    })
  }
  window.nativeSessionView = element => ({ view: views.get(element) })
  window.setTimeout = callback => { timers.set(++timer, callback); return timer }
  window.clearTimeout = key => timers.delete(key)
  window.eval(selectors + '\n' + executable + '\nglobalThis.registerFixture = registerComposerSendClearance')
  const ctx = {
    addEventListener(_node, event, handler, capture) { assert(capture); listeners.set(event, handler) },
    onDispose: fn => disposers.push(fn),
  }
  const cleanup = window.registerFixture(ctx, { enabled: () => enabled, viewportSelector,
    promptSelector })
  const box = target => {
    const element = document.querySelector(`[data-composer-target="${target}"]`)
    const form = element.querySelector('form')
    const editor = form.querySelector('[contenteditable]')
    const submitter = form.querySelector('button[type="submit"]')
    const viewport = element.querySelector(viewportSelector)
    const spacer = viewport.querySelector('[data-slot="aui_composer-clearance"]')
    const response = viewport.querySelector('[data-slot="aui_response-group"]')
    Object.defineProperty(response, 'offsetHeight', { value: 124 })
    return {
      element, viewport, spacer, submitter, form, response,
      press(options = {}) { listeners.get('keydown')({ type: 'keydown', target: editor, key: 'Enter', isTrusted: true, ...options }) },
      send(options = {}) { listeners.get('submit')({ type: 'submit', target: form, submitter, isTrusted: true, ...options }) },
      addPrompt(id) { spacer.insertAdjacentHTML('beforebegin', `<div data-slot="aui_user-message-root" data-message-id="${id}"></div>`) },
      setBusy(value) { views.get(element).busy = value },
      switchSession() { views.get(element).switchSession() },
    }
  }
  const marker = document.createElement('div')
  marker.style.minBlockSize = 'calc(182px + 32px)'
  assert(marker.style.minBlockSize)
  return {
    main: box('main'), tile: box('tile:secondary'), heldSize: marker.style.minBlockSize, timers,
    setEnabled(value) { enabled = value; cleanup() },
    cleanup, close() { for (const dispose of disposers) dispose(); window.close() },
  }
}

test('holding the native spacer spans the photo draft collapse and ends on its own sent message', async () => {
  const f = setup()
  try {
    f.main.send()
    assert.equal(f.main.spacer.style.minBlockSize, f.heldSize)
    assert.equal(f.tile.spacer.style.minBlockSize, '')
    assert.equal(f.main.response.style.minBlockSize, '124px')
    assert.equal(f.tile.response.style.minBlockSize, '')
    f.main.element.style.setProperty('--hcv-composer-surface-height', '60px')
    f.tile.addPrompt('user-other')
    f.main.addPrompt('saved-hydrated')
    await Promise.resolve()
    assert.equal(f.main.spacer.style.minBlockSize, f.heldSize)
    f.main.addPrompt('user-just-sent')
    await Promise.resolve()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    assert.equal(f.main.response.style.minBlockSize, '')
    assert.equal(f.timers.size, 0)
  } finally { f.close() }
})

test('only a live local send at the bottom reserves space and reading above releases it', async () => {
  const f = setup()
  try {
    f.main.press({ isTrusted: false })
    f.main.press({ ctrlKey: true })
    f.main.press({ isComposing: true })
    f.main.setBusy(true)
    f.main.send()
    f.main.setBusy(false)
    f.main.viewport.dataset.following = 'false'
    f.main.send()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    f.main.viewport.dataset.following = 'true'
    f.main.press()
    assert.equal(f.main.spacer.style.minBlockSize, f.heldSize)
    f.main.viewport.dataset.following = 'false'
    await Promise.resolve()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    f.main.viewport.dataset.following = 'true'
    f.main.form.querySelector('[data-slot="composer-attachments"]').remove()
    f.main.submitter.disabled = true
    f.main.press()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    f.main.submitter.disabled = false
    f.main.press()
    assert.equal(f.main.spacer.style.minBlockSize, f.heldSize)
    assert.equal(f.main.response.style.minBlockSize, '124px')
  } finally { f.close() }
})

test('a session switch, hiding, disabling and a cancelled send release the reserved space', () => {
  const f = setup()
  try {
    f.main.send()
    f.main.switchSession()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    f.main.send()
    f.main.element.hidden = true
    f.cleanup()
    assert.equal(f.main.spacer.style.minBlockSize, '')
    f.tile.send()
    f.setEnabled(false)
    assert.equal(f.tile.spacer.style.minBlockSize, '')
    f.setEnabled(true)
    f.tile.send()
    assert.equal(f.tile.spacer.style.minBlockSize, f.heldSize)
    for (const timeout of f.timers.values()) timeout()
    assert.equal(f.tile.spacer.style.minBlockSize, '')
    assert.equal(f.timers.size, 0)
  } finally { f.close() }
})

test('updating the transcript with the same visible composer leaves its geometry to the resize observer', async () => {
  const { createComposerClearanceMetrics } = await import('../source/composer-clearance.js')
  const dom = new JSDOM('<section><div data-slot="composer-dock"><div data-slot="composer-surface"></div></div></section>')
  try {
    const root = dom.window.document.querySelector('section')
    const dock = root.firstElementChild
    const editor = dock.firstElementChild
    const observer = { observe() {}, unobserve() {} }
    const metrics = createComposerClearanceMetrics()
    const reads = []
    let editorHeight = 98
    dock.getBoundingClientRect = () => { reads.push(dock); return { height: 159, top: 400 } }
    editor.getBoundingClientRect = () => { reads.push(editor); return { height: editorHeight, top: 432 } }
    metrics.sync([root], observer)
    assert.deepEqual(reads, [dock, editor])
    assert.equal(root.style.getPropertyValue('--hcv-composer-above-surface'), '32px')
    metrics.sync([root], observer)
    assert.deepEqual(reads, [dock, editor])
    editorHeight = 110
    metrics.resize([{ target: editor }])
    assert.equal(root.style.getPropertyValue('--hcv-composer-surface-height'), '110px')
    root.hidden = true
    metrics.sync([root], observer)
    editorHeight = 120
    root.hidden = false
    metrics.sync([root], observer)
    assert.equal(root.style.getPropertyValue('--hcv-composer-surface-height'), '120px')
    metrics.dispose(observer)
  } finally {
    dom.window.close()
  }
})
