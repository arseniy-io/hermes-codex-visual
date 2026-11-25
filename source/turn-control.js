import { host } from '@hermes/plugin-sdk'
import { mountCSS, chatStyles } from './style-scope.js'
import { nativeSessionView } from './sidebar-session-state.js'
import { createTurnControl, turnControlKey } from './turn-control-state.js'
import { committedFiber } from './sidebar-recents.js'
import { nativeBubbleStop } from './turn-control-native.js'
import { createTurnStopHistory, captureStopAttempt, stoppedPromptRow, stoppedPromptFromHistory } from './turn-stop-history.js'

import { composerRoot as formSelector, composerCompletionDrawer, composerQueuedEdit, composerStopButton,
  composerChatSurface as surfaceSelector, surfaceForComposer as surfaceFor, composerForSurface as formFor,
  composerAwaitingInput, composerVoiceStartGroup } from './composer-native.js'

const nativeStop = `${formSelector} ${composerStopButton}`
const composerAction = '[data-hcv-turn-composer-action]'
const replacedStop = 'data-hcv-turn-native-stop'
const dictation = '[data-hcv-dictation]'

// Codex Desktop 26.1117.4957.0: aJad (stop) and EVaN (resume),
// used by the composer submit button in 839700.c1fe868f96.js.
const actionPaths = {
  pause: 'M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z',
  resume: 'M6 14.7227V5.27693C6 4.29057 7.08894 3.6928 7.9211 4.22235L15.3428 8.94526C16.1147 9.43645 16.1147 10.5632 15.3428 11.0544L7.92109 15.7773C7.08894 16.3069 6 15.7091 6 14.7227Z',
}

const copy = {
  ru: { pause: 'Приостановить', resume: 'Возобновить',
    stopping: 'Приостанавливаю…', resuming: 'Возобновляю…', unknown: 'Остановка ещё не подтверждена',
    resumeUnknown: 'Продолжение ещё не подтверждено', checkState: 'Проверить состояние',
    failed: 'Не удалось подтвердить действие. Проверьте состояние перед продолжением.' },
  en: { pause: 'Pause', resume: 'Resume', stopping: 'Pausing…', resuming: 'Resuming…',
    unknown: 'Stop has not been confirmed',
    resumeUnknown: 'Continuation has not been confirmed', checkState: 'Check state',
    failed: 'The action was not confirmed. Check the state before continuing.' },
}

function targetFor(surface) {
  if (!surface) return null
  const native = nativeSessionView(surface)
  if (!native) return null
  const { view, nativeOwner } = native
  const runtimeId = view.$runtimeId.get(), storedId = view.$storedId.get()
  const focusedOwner = host.state.focusedSessionId.get() === runtimeId &&
    host.state.focusedStoredSessionId.get() === storedId ? host.state.focusedSessionOwner.get() : null
  if (nativeOwner && focusedOwner && (nativeOwner.connectionId !== focusedOwner.connectionId ||
      nativeOwner.profile !== focusedOwner.profile)) return null
  const owner = nativeOwner || focusedOwner
  const target = { ...owner, runtimeId, storedId, view, surface }
  return turnControlKey(target) ? target : null
}

export function registerTurnControl(ctx, active, turnTimeline) {
  const entries = new Map()
  let frame = 0, disposed = false
  const enabled = () => !disposed && document.documentElement.matches(active)
  const words = () => copy[document.documentElement.lang.startsWith('ru') ? 'ru' : 'en']
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(sync) }
  const history = createTurnStopHistory(ctx.storage)
  function bindSavedPrompt(target, attempt) {
    const { view, runtimeId, storedId } = target
    if (view.$runtimeId.get() !== runtimeId || view.$storedId.get() !== storedId) return null
    const snapshot = target.connectionId === 'local' && turnTimeline?.forSurface(target.surface)
    let rows
    if ([snapshot?.sessionId, snapshot?.requestedSessionId].includes(storedId)) {
      try {
        const scope = JSON.parse(snapshot.scope)
        if (scope[0] === target.connectionId && scope[1] === target.profile &&
            [runtimeId, storedId].includes(scope[2])) rows = snapshot.rows
      } catch { /* The native prompt or completion receipt can still bind. */ }
    }
    return stoppedPromptFromHistory(view.$messages?.get(), attempt, rows)
  }
  const control = createTurnControl({ storage: ctx.storage, changed: schedule,
    stopped(target, attempt) {
      attempt.rowId ??= bindSavedPrompt(target, attempt)
      history.record(target, attempt)
    },
    request: (target, method, params) => host.requestProfile({ connectionId: target.connectionId,
      profile: target.profile, targetProfile: target.profile }, method, params, 75000) })
  const fail = () => host.notify({ id: 'hcv-turn-control', kind: 'error', message: words().failed })

  function stop(event, surface) {
    event.preventDefault()
    event.stopImmediatePropagation()
    // Pane focus can change between pointerdown and click.
    const target = targetFor(surface)
    if (!target) { fail(); schedule(); return }
    const promptNode = event.target.closest('[data-slot="aui_user-message-root"][data-message-id]')
    const promptId = promptNode?.dataset.messageId
    const attempt = captureStopAttempt(target.view.$messages?.get(), promptId,
      target.view.$turnStartedAt?.get(), Date.now())
    void control.stop(target, attempt).catch(fail)
  }
  ctx.addEventListener(document, 'click', event => {
    if (!enabled() || !(event.target instanceof Element)) return
    const button = event.target.closest(nativeStop)
    if (button && !button.disabled) stop(event, surfaceFor(button.closest(formSelector)))
    else {
      const bubble = event.target.closest('button[type="button"]')
      if (bubble && !bubble.disabled && nativeBubbleStop(bubble, committedFiber)) {
        stop(event, bubble.closest(surfaceSelector))
      }
    }
  }, true)
  ctx.addEventListener(document, 'submit', event => {
    if (!enabled() || !(event.target instanceof HTMLFormElement)) return
    const surface = surfaceFor(event.target)
    if (event.submitter?.matches(nativeStop)) { stop(event, surface); return }
    const target = targetFor(surface)
    if (!target) return
    const state = control.get(target)
    if (state?.pending) {
      event.preventDefault()
      event.stopImmediatePropagation()
    } else if (state) control.invalidate(target)
  }, true)
  ctx.addEventListener(document, 'keydown', event => {
    if (!enabled() || event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        document.querySelector('[data-overlay-surface], [role="dialog"], [role="menu"][data-state="open"]')) return
    const form = event.target instanceof Element ? event.target.closest(formSelector) : null
    if (!form || form.querySelector(composerCompletionDrawer + ', ' + composerQueuedEdit) ||
        composerAwaitingInput(form, committedFiber)) return
    const button = form.querySelector(composerStopButton)
    if (button && !button.disabled) stop(event, surfaceFor(form))
  }, true)

  function resumeAnchor(form) {
    const group = form.querySelector(composerVoiceStartGroup)
    const voiceButton = group?.querySelector('button:not(:disabled)')
    return voiceButton && !form.querySelector(`${dictation}, ${composerQueuedEdit}`) &&
      !composerAwaitingInput(form, committedFiber) ? group : null
  }

  function clearAction(entry) {
    entry.nativeButton?.removeAttribute(replacedStop)
    entry.nativeButton = null
    entry.action.remove()
  }

  function syncAction(entry, phase, nativeButton) {
    const mode = nativeButton && !nativeButton.disabled ? 'pause'
      : phase === 'stopped' || phase === 'resuming' ? 'resume' : null
    const anchor = mode === 'pause' ? nativeButton : mode === 'resume' ? resumeAnchor(entry.form) : null
    if (!anchor) { clearAction(entry); return }
    const masked = mode === 'pause' ? nativeButton : null
    if (entry.nativeButton !== masked) {
      entry.nativeButton?.removeAttribute(replacedStop)
      masked?.setAttribute(replacedStop, '')
      entry.nativeButton = masked
    }
    const { action, path } = entry
    const pending = phase === 'stopping' || phase === 'resuming'
    const title = words()[pending ? phase : mode]
    action.dataset.hcvTurnComposerAction = mode
    action.title = title
    action.setAttribute('aria-label', title)
    if (pending) action.setAttribute('aria-busy', 'true')
    else action.removeAttribute('aria-busy')
    action.disabled = pending
    if (path.getAttribute('d') !== actionPaths[mode]) path.setAttribute('d', actionPaths[mode])
    if (anchor.nextElementSibling !== action) anchor.after(action)
  }

  function clear(surface, entry) {
    clearAction(entry)
    entry.panel.remove()
    surface.removeAttribute('data-hcv-turn-control')
    entries.delete(surface)
  }
  function sync() {
    frame = 0
    const seen = new Set()
    for (const surface of enabled() ? document.querySelectorAll(surfaceSelector) : []) {
      const form = formFor(surface), target = targetFor(surface)
      if (!form || !target) continue
      seen.add(surface)
      let entry = entries.get(surface)
      const key = turnControlKey(target)
      if (entry && (entry.form !== form || entry.key !== key || entry.target.runtimeId !== target.runtimeId)) {
        clear(surface, entry)
        entry = null
      }
      if (!entry) {
        const panel = document.createElement('div')
        panel.setAttribute('data-hcv-turn-control-panel', '')
        const label = document.createElement('span')
        label.setAttribute('role', 'status')
        const button = document.createElement('button')
        button.type = 'button'
        panel.append(label, button)
        const action = document.createElement('button')
        action.type = 'button'
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('aria-hidden', 'true')
        icon.setAttribute('viewBox', '0 0 20 20')
        icon.setAttribute('fill', 'currentColor')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        icon.append(path)
        action.append(icon)
        entry = { form, target, key, panel, label, button, action, path }
        entries.set(surface, entry)
        action.addEventListener('click', event => {
          const current = targetFor(surface)
          if (turnControlKey(current) !== entry.key || formFor(surface) !== entry.form) { fail(); schedule(); return }
          if (action.dataset.hcvTurnComposerAction === 'pause') {
            const native = entry.form.querySelector(composerStopButton)
            if (native && !native.disabled) stop(event, surface)
          } else if (control.get(current)?.phase === 'stopped' && resumeAnchor(entry.form)) {
            void control.resume(current).catch(fail)
          }
        })
        button.addEventListener('click', () => {
          const target = targetFor(surface)
          if (turnControlKey(target) !== entry.key) { fail(); schedule(); return }
          void control.refresh(target).catch(fail)
        })
        void control.refresh(target).catch(() => {})
      }
      let state = control.get(target)
      const nativeButton = form.querySelector(composerStopButton)
      const running = Boolean(nativeButton)
      if (state?.phase === 'stopped' && !running) entry.stoppedSeenIdle = true
      if (state?.phase === 'stopped' && running && entry.stoppedSeenIdle) {
        control.invalidate(target)
        state = undefined
        entry.stoppedSeenIdle = false
      }
      const phase = state?.phase || 'idle'
      const labels = words()
      syncAction(entry, phase, nativeButton)
      const hidden = phase !== 'unknown'
      const pending = Boolean(state?.pending)
      const label = hidden ? '' : state?.lastAction === 'resume' ? labels.resumeUnknown : labels.unknown
      // Ordinary typing can update the native send controls with no turn
      // state change. Keep the existing nodes and attributes in that case.
      if (entry.panel.hidden !== hidden) entry.panel.hidden = hidden
      if (entry.label.textContent !== label) entry.label.textContent = label
      if (entry.button.hidden !== hidden) entry.button.hidden = hidden
      if (entry.button.disabled !== pending) entry.button.disabled = pending
      if (entry.button.textContent !== labels.checkState) entry.button.textContent = labels.checkState
      if (!entry.panel.isConnected) form.prepend(entry.panel)
      if (surface.getAttribute('data-hcv-turn-control') !== phase) surface.setAttribute('data-hcv-turn-control', phase)
    }
    for (const [surface, entry] of entries) if (!seen.has(surface)) clear(surface, entry)
  }
  const rootObserver = new MutationObserver(schedule)
  rootObserver.observe(document.documentElement, { attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'lang'] })
  const controls = `${formSelector} [class~="[grid-area:controls]"]`
  const watched = `${surfaceSelector}, ${formSelector}, ${dictation}`
  const mounts = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target
      if (target instanceof Element && target.closest(controls) && !target.closest(composerAction)) return true
      return record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches(watched) || node.querySelector(watched)))
    })) schedule()
  })
  mounts.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  const stops = ['focusedSessionId', 'focusedStoredSessionId', 'focusedSessionOwner', 'activeSessionId',
    'busyBySession', 'connectionId', 'profile', 'gateway'].map(key => host.state[key]?.listen(schedule)).filter(Boolean)
  ctx.onEvent('message.complete', event => {
    if (event.replayed || event.payload?.status !== 'interrupted') return
    for (const { target } of entries.values()) {
      if (target.runtimeId !== event.session_id || target.connectionId !== event.connectionId ||
          target.profile.toLowerCase() !== event.profile?.trim().toLowerCase()) continue
      const state = control.get(target)
      const attempt = state?.attempt
      const rowId = stoppedPromptRow(event.payload.persisted_turn, attempt?.promptId)
      if (rowId === null || (attempt.rowId != null && attempt.rowId !== rowId)) continue
      attempt.rowId = rowId
      if (state.phase === 'stopped') history.record(target, attempt)
    }
  })
  ctx.onEvent('message.start', event => {
    for (const entry of entries.values()) {
      const state = control.get(entry.target)
      if (entry.target.runtimeId === event.session_id && entry.target.connectionId === event.connectionId &&
          entry.target.profile.toLowerCase() === event.profile?.trim().toLowerCase() && !state?.pending &&
          ['stopped', 'unknown'].includes(state?.phase)) control.invalidate(entry.target)
    }
    schedule()
  })
  mountCSS(ctx, 'data-hcv-turn-control-style', `
    ${active} [${replacedStop}] { display: none !important; }
    ${active} ${composerAction} {
      display: inline-grid; place-items: center; flex: none; padding: 0;
      inline-size: var(--composer-control-primary-size, var(--composer-control-size, 28px));
      block-size: var(--composer-control-primary-size, var(--composer-control-size, 28px));
      border-radius: 50%; color: var(--hcv-ink); background: var(--hcv-action); cursor: pointer;
    }
    ${active} ${composerAction} > svg { width: 16px; height: 16px; }
    ${active} ${composerAction}:not(:disabled):hover { background: color-mix(in srgb, var(--hcv-action) 85%, var(--hcv-ink)); }
    ${active} ${composerAction}:disabled { cursor: progress; opacity: .6; }
    ${active} ${composerAction}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
    @media (forced-colors: active) {
      ${active} ${composerAction} { color: ButtonText; background: ButtonFace; border: 1px solid ButtonText; }
    }
    [data-hcv-turn-control-panel] { display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 8px 4px; color: var(--hcv-muted); font: 400 13px/20px var(--hcv-ui-font); }
    [data-hcv-turn-control-panel][hidden] { display: none; }
    [data-hcv-turn-control-panel] button { flex: none; border-radius: 8px; padding: 4px 10px;
      color: var(--hcv-text); background: var(--hcv-selected); cursor: pointer; }
    [data-hcv-turn-control-panel] button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
  `, chatStyles)
  ctx.onDispose(() => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    rootObserver.disconnect(); mounts.disconnect(); stops.forEach(stop => stop())
    control.dispose()
    history.dispose()
    for (const [surface, entry] of entries) clear(surface, entry)
  })
  schedule()
  return {
    forSurface(surface) {
      const target = targetFor(surface)
      if (!target) return null
      const state = control.get(target)
      const attempt = state?.attempt
      if (state?.phase === 'stopped' && attempt && attempt.rowId == null) {
        const rowId = bindSavedPrompt(target, attempt)
        if (rowId !== null) {
          attempt.rowId = rowId
          history.record(target, attempt)
        }
      }
      return (promptId, rowId) => history.read(target, promptId, rowId)
    },
    subscribe: history.subscribe,
  }
}
