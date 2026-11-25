import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createTurnControl, turnControlKey } from '../source/turn-control-state.js'
import { createTurnStopHistory, captureStopAttempt, stoppedPromptRow, stoppedPromptFromHistory } from '../source/turn-stop-history.js'
import { nativeBubbleStop } from '../source/turn-control-native.js'
import { composerRoot as formSelector, composerCompletionDrawer, composerQueuedEdit, composerStopButton,
  composerChatSurface as surfaceSelector, surfaceForComposer as surfaceFor, composerForSurface as formFor, composerAwaitingInput, composerVoiceStartGroup }
  from '../source/composer-native.js'
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const code = fs.readFileSync(new URL('../source/turn-control.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*? from '[^'\n]+'\r?\n/gm, '').replace('export function registerTurnControl', 'function registerTurnControl')

function fixture(conflict = false, showStop = true, attached = false, waiting = false) {
  const dom = new JSDOM('<html lang="ru" data-hermes-theme="codex"><body><div data-chat-surface data-composer-target="main" data-session-anchor="workspace">' +
    '<div data-slot="aui_user-message-root"><button type="button" id="bubble">Native bubble action</button></div>' +
    '<form data-slot="composer-root"><button type="submit" id="composer"><span class="size-2.5 bg-current"></span></button></form></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window, notices = [], calls = [], dispose = []
  const atom = value => ({ get: () => value, listen: () => () => {} })
  const state = { focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('stored'),
    focusedSessionOwner: atom({ connectionId: 'local', profile: 'default' }) }
  const native = conflict || attached ? { view: { $runtimeId: atom('runtime'), $storedId: atom('stored') },
    nativeOwner: conflict ? { connectionId: 'different', profile: 'other' } : state.focusedSessionOwner.get() } : null
  const surface = w.document.querySelector('[data-chat-surface]')
  Object.assign(w, { host: { state, notify: value => notices.push(value), requestProfile: (...args) => {
    calls.push(args)
    return { root_runtime_id: 'runtime', root_stored_id: 'stored', checkpoint_id: 'checkpoint',
      state: args[1] === 'session.interrupt' ? 'stopped' : args[1] === 'session.continue_tree' ? 'resumed' : 'idle' }
  } },
    mountCSS() {}, chatStyles: {}, createTurnControl, turnControlKey, nativeBubbleStop, createTurnStopHistory, captureStopAttempt, stoppedPromptRow, stoppedPromptFromHistory,
    formSelector, composerCompletionDrawer, composerQueuedEdit, composerStopButton, surfaceSelector, surfaceFor, formFor, composerAwaitingInput, composerVoiceStartGroup,
    nativeSessionView: node => node === surface ? native : null,
    committedFiber: node => waiting && node?.matches('form') ? { dependencies: { firstContext: {
      memoizedValue: { target: 'main', attachments: {}, $messages: atom([]), $awaitingInput: atom(true) },
    } } } : { memoizedProps: { showStop, showRestore: !showStop, touch: false,
      messageId: 'native', fullText: 'Goal', onCancel() {} } } })
  const ctx = { storage: { get: () => null, set() {} }, onEvent() {}, onDispose: fn => dispose.push(fn),
    addEventListener(target, type, callback, options) { target.addEventListener(type, callback, options);
      dispose.push(() => target.removeEventListener(type, callback, options)) } }
  w.eval(code + ';window.register=registerTurnControl')
  w.register(ctx, '[data-hermes-theme="codex"]')
  return { w, notices, calls, close() { dispose.forEach(fn => fn()); w.close() } }
}

test('recognized composer and bubble Stop with unproved owner cannot fall through to legacy cancel', () => {
  for (const conflict of [false, true]) {
    const f = fixture(conflict)
    try {
      let legacy = 0
      for (const id of ['composer', 'bubble']) {
        const button = f.w.document.getElementById(id)
        button.addEventListener('click', () => legacy++)
        assert.equal(button.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true })), false)
      }
      assert.equal(legacy, 0)
      assert.equal(f.calls.length, 0)
      assert.equal(f.notices.length, 2)
    } finally { f.close() }
  }
})

test('a native restore action remains under its own handler', () => {
  const f = fixture(false, false)
  try {
    let native = 0
    const button = f.w.document.getElementById('bubble')
    button.addEventListener('click', () => native++)
    button.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(native, 1)
    assert.equal(f.notices.length, 0)
    assert.equal(f.calls.length, 0)
  } finally { f.close() }
})

test('a submit event with an unproved Stop owner cannot invoke native cancel', () => {
  for (const conflict of [false, true]) {
    const f = fixture(conflict)
    try {
      let legacy = 0
      const form = f.w.document.querySelector('form')
      form.addEventListener('submit', () => legacy++)
      assert.equal(form.dispatchEvent(new f.w.SubmitEvent('submit', {
        bubbles: true, cancelable: true, submitter: f.w.document.getElementById('composer'),
      })), false)
      assert.equal(legacy, 0)
      assert.equal(f.calls.length, 0)
      assert.equal(f.notices.length, 1)
    } finally { f.close() }
  }
})

test('Escape leaves completion, queue editing and IME to the composer', async () => {
  const f = fixture(false, true, true)
  try {
    const form = f.w.document.querySelector('form')
    let handled = 0
    form.addEventListener('keydown', () => handled++)
    const surface = f.w.document.createElement('div')
    surface.dataset.slot = 'composer-surface'
    form.append(surface)
    const escape = options => form.dispatchEvent(new f.w.KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true, ...options,
    }))
    surface.innerHTML = '<div data-slot="composer-completion-drawer" role="listbox"></div>'
    assert.equal(escape(), true)
    surface.innerHTML = '<div class="bg-accent/18"><div><button></button><button></button></div></div>'
    assert.equal(escape(), true)
    surface.replaceChildren()
    assert.equal(escape({ isComposing: true }), true)
    assert.equal(handled, 3)
    assert.equal(escape(), false)
    await Promise.resolve()
    assert.equal(f.calls.filter(call => call[1] === 'session.interrupt').length, 1)
  } finally { f.close() }
})

test('Pause and Resume use the primary slot in the owning floating composer', async () => {
  const f = fixture(false, true, true)
  try {
    const doc = f.w.document
    const surface = doc.querySelector('[data-chat-surface]')
    surface.dataset.composerSurfaceId = 'owner'
    const portal = doc.createElement('div')
    portal.dataset.floatingComposerTarget = 'main'
    portal.dataset.composerOwner = 'owner'
    const form = surface.querySelector('form')
    portal.append(form)
    doc.body.append(portal)
    // Let the mount check finish so its idle result cannot race with the click.
    const paint = () => new Promise(resolve => f.w.requestAnimationFrame(resolve))
    await paint()
    const stop = doc.getElementById('composer')
    const controls = doc.createElement('div')
    controls.className = '[grid-area:controls]'
    controls.append(stop)
    const composer = doc.createElement('div')
    composer.dataset.slot = 'composer-surface'
    composer.append(controls)
    form.append(composer)
    // The same selector also covers a portal that moves into this row after mounting.
    f.w.document.documentElement.lang = 'en'
    f.w.document.documentElement.lang = 'ru'
    await paint()
    const action = controls.querySelector('[data-hcv-turn-composer-action="pause"]')
    assert.equal(action.getAttribute('aria-label'), 'Приостановить')
    assert.equal(action.querySelector('svg').getAttribute('viewBox'), '0 0 20 20')
    assert.equal(action.querySelector('path').getAttribute('d'), 'M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z')
    assert.equal(action.previousElementSibling, stop)
    assert(stop.hasAttribute('data-hcv-turn-native-stop'))
    action.click()
    await paint()
    assert.equal(f.calls.filter(call => call[1] === 'session.interrupt').length, 1)
    assert.equal(f.calls.find(call => call[1] === 'session.interrupt')[2].session_id, 'runtime')
    const panel = form.querySelector('[data-hcv-turn-control-panel]')
    assert.equal(surface.dataset.hcvTurnControl, 'stopped')
    assert.equal(panel.hidden, true)
    assert.equal(panel.querySelector('[role="status"]').textContent, '')
    assert.equal(panel.querySelector('button').hidden, true)
    const voice = doc.createElement('span')
    voice.innerHTML = '<button type="button"><svg class="tabler-icon-wave-sine"></svg></button>'
    stop.replaceWith(voice)
    await paint()
    assert.equal(action.previousElementSibling, voice)
    assert.equal(action.getAttribute('aria-label'), 'Возобновить')
    assert.equal(action.querySelector('path').getAttribute('d'), 'M6 14.7227V5.27693C6 4.29057 7.08894 3.6928 7.9211 4.22235L15.3428 8.94526C16.1147 9.43645 16.1147 10.5632 15.3428 11.0544L7.92109 15.7773C7.08894 16.3069 6 15.7091 6 14.7227Z')
    assert(!stop.hasAttribute('data-hcv-turn-native-stop'))
    action.click()
    await paint()
    assert.equal(f.calls.filter(call => call[1] === 'session.continue_tree').length, 1)
    assert.equal(action.isConnected, false)
  } finally { f.close() }
})

test('Escape does not stop a turn that is waiting for the user', async () => {
  const f = fixture(false, true, true, true)
  try {
    const form = f.w.document.querySelector('form')
    assert.equal(form.dispatchEvent(new f.w.KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    })), true)
    await Promise.resolve()
    assert.equal(f.calls.filter(call => call[1] === 'session.interrupt').length, 0)
  } finally { f.close() }
})
