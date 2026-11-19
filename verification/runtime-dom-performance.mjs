import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Uses the same trusted local JSDOM dependency as evidence/v01553-count-turns.mjs.
// No Desktop process, network request, filesystem mutation, or real profile is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const before = process.argv[2] || path.join(root, 'evidence/v01584-source-before')
const after = process.argv[3] || path.join(root, 'source')
const batches = 40
const active = 'html[data-hermes-theme="codex-workspace"]'
const results = {}

function environment() {
  const dom = new JSDOM('<html lang="ru" data-hermes-theme="codex-workspace"><body><section id="chat-shell"><div data-chat-surface data-composer-target="main"><div data-slot="aui_thread-content"><div id="stream"></div></div><div data-slot="composer-dock"></div></div></section><div id="unrelated"></div></body></html>', { runScripts: 'outside-only' })
  const { window } = dom
  const frames = new Map()
  const events = new Map()
  const disposers = []
  const counts = { frames: 0, documentQueries: 0, elementQueries: 0, numberFormats: 0, labelWrites: 0 }
  let frameId = 0
  window.requestAnimationFrame = fn => { counts.frames++; frames.set(++frameId, fn); return frameId }
  window.cancelAnimationFrame = id => frames.delete(id)
  const media = new Map()
  window.matchMedia = query => {
    if (!media.has(query)) {
      let matches = true
      const listeners = new Set()
      media.set(query, {
        get matches() { return matches },
        addEventListener(_, fn) { listeners.add(fn) },
        removeEventListener(_, fn) { listeners.delete(fn) },
        set(value) { matches = value; for (const fn of listeners) fn() },
      })
    }
    return media.get(query)
  }
  const atom = initial => {
    let value = initial
    const listeners = new Set()
    return {
      get: () => value,
      set(next) { value = next; for (const fn of [...listeners]) fn(value) },
      listen(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      listeners,
    }
  }
  window.atom = atom
  window.host = { state: {
    connectionId: atom('local'), profile: atom('default'), activeSessionId: atom('one'),
    busyBySession: atom({ one: true, two: false }),
  } }
  window.ctx = {
    register: () => () => {},
    onDispose(fn) { disposers.push(fn) },
    onEvent(name, fn) { events.set(name, fn) },
  }
  window.mountStyle = () => {}
  window.codexIconStyle = () => ({ mask: 'none' })
  window.codex = { quietControl: { radius: '8px' } }
  for (const [proto, counter] of [[window.Document.prototype, 'documentQueries'], [window.Element.prototype, 'elementQueries']]) {
    for (const key of ['querySelector', 'querySelectorAll']) {
      const native = proto[key]
      proto[key] = function (...args) { counts[counter]++; return native.apply(this, args) }
    }
  }
  const nativeAttribute = window.Element.prototype.setAttribute
  window.Element.prototype.setAttribute = function (name, value) {
    if (name === 'aria-label') counts.labelWrites++
    return nativeAttribute.call(this, name, value)
  }
  window.Intl.NumberFormat = new Proxy(window.Intl.NumberFormat, {
    construct(target, args, receiver) { counts.numberFormats++; return Reflect.construct(target, args, receiver) },
  })
  const evaluate = file => {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm, '')
      .replace(/^export function /gm, 'function ')
    window.eval(source)
  }
  evaluate(path.join(root, 'source/dom-changes.js'))
  return {
    window, document: window.document, counts, frames, evaluate,
    reset() { for (const key of Object.keys(counts)) counts[key] = 0 },
    sample: () => ({ ...counts }),
    emit(name, seq, payload, session = 'one') {
      events.get(name)?.({ session_id: session, connectionId: 'local', profile: 'default', seq, payload })
    },
    async flush() {
      for (let pass = 0; pass < 30; pass++) {
        await Promise.resolve()
        if (!frames.size) {
          await Promise.resolve()
          if (!frames.size) return
        }
        const pending = [...frames]
        frames.clear()
        for (const [, fn] of pending) fn(0)
      }
      throw new Error('The DOM observer did not settle')
    },
    dispose() { for (const fn of disposers.reverse()) fn() },
    close() { dom.window.close() },
  }
}

async function summaryScenario(directory, candidate) {
  const env = environment()
  const { window, document } = env
  const prefix = 'plugin-workspace:hermes-codex-visual-summary-'
  const workspaces = new Map()
  let groupId = 0
  function newStrip() {
    const group = document.createElement('section')
    group.dataset.treeGroup = 'right-' + ++groupId
    const strip = document.createElement('div')
    strip.dataset.zoneTabstrip = group.dataset.treeGroup
    const list = document.createElement('div')
    list.setAttribute('role', 'tablist')
    strip.append(list)
    group.append(strip)
    document.body.append(group)
    return { group, strip, list }
  }
  const pane = newStrip()
  window.host.paneVisibility = () => window.atom(true)
  window.host.revealPane = () => {}
  window.host.openWorkspace = (id, options) => {
    const tab = document.createElement('button')
    for (const item of pane.list.children) if (item.hasAttribute('data-tree-tab')) item.setAttribute('aria-selected', 'false')
    tab.setAttribute('role', 'tab')
    tab.dataset.treeTab = 'plugin-workspace:' + id
    tab.setAttribute('aria-selected', 'true')
    pane.list.append(tab)
    const entry = { tab, options }
    workspaces.set(id, entry)
    return () => { tab.remove(); workspaces.delete(id); options.onClose() }
  }
  env.evaluate(path.join(directory, 'summary-panes.js'))
  window.eval('window.panes = registerSummaryPanes(window.ctx, ' + JSON.stringify(active) + ', { agents: () => null, sources: () => null })')
  window.panes.open('agents')
  await env.flush()
  const plus = document.querySelector('[data-hcv-summary-add-tab]')
  assert.equal(plus?.parentElement, pane.list)
  assert.equal(plus.getAttribute('aria-label'), 'Добавить вкладку')
  const stream = document.getElementById('stream')
  const option = document.createElement('button')
  option.setAttribute('role', 'option')
  document.getElementById('unrelated').append(option)
  await env.flush()
  env.reset()
  for (let index = 0; index < batches; index++) {
    stream.append(document.createElement('p'))
    option.setAttribute('aria-selected', String(index % 2 === 0))
    await env.flush()
  }
  const streaming = env.sample()
  const tab = document.querySelector('[data-tree-tab="' + prefix + 'agents"]')
  const nativeTab = document.createElement('button')
  nativeTab.setAttribute('role', 'tab')
  nativeTab.dataset.treeTab = 'files'
  pane.list.append(nativeTab)
  tab.setAttribute('aria-selected', 'false')
  nativeTab.setAttribute('aria-selected', 'true')
  await env.flush()
  assert.equal(plus.isConnected, false, 'Plus must leave a native selected tab')
  tab.setAttribute('aria-selected', 'true')
  nativeTab.setAttribute('aria-selected', 'false')
  await env.flush()
  assert.equal(plus.parentElement, pane.list)
  const moved = newStrip()
  moved.list.append(tab)
  await env.flush()
  assert.equal(plus.parentElement, moved.list, 'Plus must follow the moved tab')
  const replacement = newStrip()
  replacement.list.append(tab)
  moved.group.remove()
  await env.flush()
  assert.equal(plus.parentElement, replacement.list, 'Plus must survive a replaced strip host')
  window.panes.open('sources')
  tab.setAttribute('aria-selected', 'false')
  await env.flush()
  assert.equal(plus.parentElement, pane.list, 'Plus must follow newly selected summary workspace')
  function nativeClose(kind) {
    const id = 'hermes-codex-visual-summary-' + kind
    const entry = workspaces.get(id)
    entry.options.onClose()
    entry.tab.remove()
    workspaces.delete(id)
  }
  nativeClose('agents')
  await env.flush()
  nativeTab.setAttribute('aria-selected', 'true')
  nativeClose('sources')
  await env.flush()
  const lastCloseOrphan = plus.isConnected
  if (candidate) assert.equal(lastCloseOrphan, false, 'Closing the last plugin tab must remove plus from its live native strip')
  window.panes.open('agents')
  await env.flush()
  // onClose can run before React removes the native tab in a later commit.
  const delayedId = 'hermes-codex-visual-summary-agents'
  const delayed = workspaces.get(delayedId)
  delayed.options.onClose()
  workspaces.delete(delayedId)
  await env.flush()
  const delayedCloseOrphanBeforeCommit = plus.isConnected
  if (candidate) assert.equal(delayedCloseOrphanBeforeCommit, false, 'Last onClose must remove plus before the delayed native DOM commit')
  delayed.tab.remove()
  nativeTab.setAttribute('aria-selected', 'true')
  await env.flush()
  const delayedCloseOrphan = plus.isConnected
  if (candidate) assert.equal(delayedCloseOrphan, false, 'Delayed native removal must not leave plus behind')
  window.panes.open('agents')
  await env.flush()
  window.document.documentElement.lang = 'en'
  await env.flush()
  assert.equal(plus.getAttribute('aria-label'), 'Add tab')
  document.documentElement.dataset.hermesTheme = 'nous'
  await env.flush()
  assert.equal(plus.isConnected, false)
  assert.equal(workspaces.size, 0, 'Changing the theme must close plugin workspaces')
  document.documentElement.dataset.hermesTheme = 'codex-workspace'
  window.panes.open('agents')
  await env.flush()
  assert.equal(plus.isConnected, true)
  env.reset()
  env.dispose()
  await env.flush()
  assert.equal(plus.isConnected, false)
  assert.equal(workspaces.size, 0)
  assert.equal(env.sample().frames, 0, 'Workspace onClose callbacks must not schedule work during disposal')
  env.reset()
  stream.append(document.createElement('p'))
  document.documentElement.lang = 'ru'
  await env.flush()
  assert.equal(env.sample().frames, 0, 'Disposed summary observers must stay silent')
  env.close()
  return { streaming, lastCloseOrphan, delayedCloseOrphanBeforeCommit, delayedCloseOrphan, behavior: 'selection, native tab, moving/replacing strip, second workspace, immediate/delayed last close, locale, theme and disposal passed' }
}

function editPayload(id, file, count = 2) {
  return {
    name: 'edit_file', tool_id: id, args: { path: file },
    result: { diff: '--- a/' + file + '\n+++ b/' + file + '\n@@ -1 +1,' + count + ' @@\n-old\n' + Array.from({ length: count }, (_, index) => '+new ' + index).join('\n') },
  }
}

async function changesScenario(directory, candidate) {
  const env = environment()
  const { window, document } = env
  env.evaluate(path.join(directory, 'composer-changes.js'))
  window.eval('registerComposerChanges(window.ctx, ' + JSON.stringify(active) + ')')
  env.emit('message.start', 1)
  env.emit('tool.complete', 2, editPayload('first', 'one.js'))
  await env.flush()
  const rail = document.querySelector('[data-hcv-composer-changes]')
  const chip = rail?.firstElementChild
  assert.ok(rail)
  assert.equal(chip.getAttribute('aria-label'), 'Изменен 1 файл, +2, −1')
  const stream = document.getElementById('stream')
  const unrelated = document.getElementById('unrelated')
  env.reset()
  for (let index = 0; index < batches; index++) {
    stream.append(document.createElement('p'))
    unrelated.toggleAttribute('data-pane-hidden', index % 2 === 0)
    window.host.state.busyBySession.set({ one: true, two: index % 2 === 0 })
    await env.flush()
  }
  const streaming = env.sample()
  env.emit('tool.complete', 3, editPayload('first', 'one.js'))
  env.emit('tool.complete', 4, { ...editPayload('failed', 'broken.js'), error: true })
  await env.flush()
  assert.equal(chip.getAttribute('aria-label'), 'Изменен 1 файл, +2, −1', 'Duplicate and failed tools must not change totals')
  env.emit('tool.complete', 5, editPayload('second', 'one.js', 3))
  env.emit('tool.complete', 6, editPayload('third', 'two.js', 4))
  await env.flush()
  assert.equal(chip.getAttribute('aria-label'), 'Изменено 2 файла, +9, −3')
  if (candidate) assert.equal(env.sample().numberFormats, 0, 'Real same-locale edits must reuse the number formatter')
  document.documentElement.lang = 'en'
  await env.flush()
  assert.equal(chip.getAttribute('aria-label'), '2 files changed, +9, −3')
  window.host.state.busyBySession.set({ one: false, two: false })
  await env.flush()
  assert.equal(rail.isConnected, false)
  window.host.state.busyBySession.set({ one: true, two: false })
  await env.flush()
  assert.equal(rail.isConnected, true)
  window.host.state.activeSessionId.set('two')
  await env.flush()
  assert.equal(rail.isConnected, false)
  window.host.state.activeSessionId.set('one')
  await env.flush()
  assert.equal(rail.isConnected, true)
  for (const [store, temporary] of [[window.host.state.connectionId, 'other'], [window.host.state.profile, 'other']]) {
    const original = store.get()
    store.set(temporary)
    await env.flush()
    assert.equal(rail.isConnected, false)
    store.set(original)
    await env.flush()
    assert.equal(rail.isConnected, true)
  }
  const oldDock = rail.parentElement
  const nextDock = document.createElement('div')
  nextDock.dataset.slot = 'composer-dock'
  oldDock.replaceWith(nextDock)
  await env.flush()
  assert.equal(rail.parentElement, nextDock, 'Rail must follow a replaced composer dock')
  nextDock.replaceChildren()
  await env.flush()
  assert.equal(rail.parentElement, nextDock, 'Rail must survive native dock reconciliation')
  nextDock.setAttribute('data-popped-out', '')
  await env.flush()
  assert.equal(rail.isConnected, false)
  nextDock.removeAttribute('data-popped-out')
  await env.flush()
  assert.equal(rail.parentElement, nextDock)
  const shell = document.getElementById('chat-shell')
  shell.setAttribute('data-pane-hidden', '')
  await env.flush()
  assert.equal(rail.isConnected, false)
  shell.removeAttribute('data-pane-hidden')
  await env.flush()
  assert.equal(rail.parentElement, nextDock)
  if (candidate) {
    shell.setAttribute('inert', '')
    await env.flush()
    assert.equal(rail.isConnected, false)
    shell.removeAttribute('inert')
    await env.flush()
    assert.equal(rail.parentElement, nextDock)
  }
  document.documentElement.dataset.hermesTheme = 'nous'
  await env.flush()
  assert.equal(rail.isConnected, false)
  document.documentElement.dataset.hermesTheme = 'codex-workspace'
  await env.flush()
  assert.equal(rail.isConnected, true)
  window.matchMedia('(forced-colors: none)').set(false)
  await env.flush()
  assert.equal(rail.isConnected, false)
  window.matchMedia('(forced-colors: none)').set(true)
  await env.flush()
  assert.equal(rail.isConnected, true)
  env.emit('message.complete', 7)
  await env.flush()
  assert.equal(rail.isConnected, false)
  env.dispose()
  await env.flush()
  for (const store of Object.values(window.host.state)) assert.equal(store.listeners.size, 0)
  env.reset()
  window.host.state.busyBySession.set({ one: false })
  stream.append(document.createElement('p'))
  document.documentElement.lang = 'ru'
  await env.flush()
  assert.equal(env.sample().frames, 0, 'Disposed composer observers and subscriptions must stay silent')
  env.close()
  return { streaming, behavior: 'file totals, duplicate/error tools, locale, busy, chat/owner switch, dock replacement/clearing/popout, pane visibility, theme, contrast, completion and disposal passed' }
}

for (const [name, directory] of [['before', before], ['after', after]]) {
  if (name === 'before' && !fs.existsSync(directory)) continue
  results[name] = {
    summary: await summaryScenario(directory, name === 'after'),
    changes: await changesScenario(directory, name === 'after'),
  }
}
assert.equal(results.after.summary.streaming.frames, 0, 'Unrelated DOM must not schedule summary strip work')
assert.equal(results.after.summary.streaming.documentQueries, 0)
assert.equal(results.after.summary.streaming.labelWrites, 0)
assert.equal(results.after.changes.streaming.frames, 0, 'Text deltas and unchanged active busy must not schedule composer work')
assert.equal(results.after.changes.streaming.documentQueries, 0)
assert.equal(results.after.changes.streaming.numberFormats, 0)
if (results.before) {
  assert.ok(results.before.summary.streaming.frames >= batches)
  assert.ok(results.before.changes.streaming.frames >= batches)
}
console.log(JSON.stringify({ batches, limitation: 'Deterministic runtime/DOM checks only; JSDOM does not measure Chromium painting, animation or user-perceived speed.', results }, null, 2))
