import { host } from '@hermes/plugin-sdk'
import { committedFiber } from './sidebar-recents.js'
import { nativeSessionView } from './sidebar-session-state.js'
import { nativeRenderedMessageRecord } from './native-rendered-message.js'
import { savedTimelineMetadata } from './chat-timestamp-data.js'
import { observeChatText } from './chat-text-observation.js'
import { elapsedTurnSeconds } from './turn-stop-history.js'
import { completedWorkSteps, setWorkOpen, syncWorkSteps } from './completed-turn-disclosure.js'
import { mountCSS, chatStyles } from './style-scope.js'
import { clearTurnFilePreview, syncTurnFilePreview, clearTurnFilePreviewRows, syncTurnFilePreviewRows,
  registerTurnFilePreviewStyle } from './turn-file-preview.js'

const response = '[data-slot="aui_response-group"]'
const assistant = '[data-slot="aui_assistant-message-root"]'
const answer = '[data-slot="aui_assistant-message-content"]'
const duration = '[data-slot="aui_turn-duration"]'
const changes = '[data-slot="aui_changed-files"]'
const transcript = '[data-slot="aui_thread-content"]'
const turnPair = '[data-slot="aui_turn-pair"]'
const user = '[data-slot="aui_user-message-root"]'
const promptRoot = `${turnPair} > ${user}[data-message-id]`
const stoppedNotice = '[data-slot="aui_assistant-message-stopped"]'
const stopDiagnostic = '[data-hcv-stop-diagnostic]'
const stopRecovery = '[data-slot="aui_system-message-root"][data-hcv-stop-diagnostic]'
const primary = '[data-chat-surface][data-composer-target="main"]'
const nativeActivity = ':is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"])'
const streaming = '[data-message-streaming="true"]'
const viewWorking = 'data-hcv-response-working'
const actionable = ':is([role="alert"], [data-approval-activity-only], [data-approval-stack], [data-clarify-choices], [data-clarify-late-choices], [data-clarify-batch-preview], [data-clarify-batch-question]:not([data-locked]))'

const isRussian = () => document.documentElement.lang.toLowerCase().startsWith('ru')
const numberFormats = new Map()
let formatterLanguage
let russianPlurals

function numberFormat(unit) {
  const language = document.documentElement.lang || 'en'
  if (formatterLanguage !== language) {
    formatterLanguage = language
    numberFormats.clear()
  }
  if (!numberFormats.has(unit)) {
    numberFormats.set(unit, new Intl.NumberFormat(language, unit && { style: 'unit', unitDisplay: 'narrow', unit }))
  }
  return numberFormats.get(unit)
}

function make(tag, marker, text) {
  const node = document.createElement(tag)
  node.setAttribute(`data-hcv-${marker}`, '')
  node.setAttribute('data-hcv-generated', '')
  if (text) node.textContent = text
  return node
}

function updateText(node, text) {
  if (node.textContent !== text) node.textContent = text
}

function durationSeconds(value) {
  // Hermes uses seconds with an s suffix or mm:ss, even in Russian.
  const match = value?.match(/(\d+)(?:\:(\d{2})|s)\s*$/)
  if (!match) return null
  return match[2] === undefined ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2])
}

function formatDuration(seconds) {
  if (seconds === null) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const units = hours ? [['hour', hours], ['minute', minutes]] : [['minute', minutes], ['second', seconds % 60]]
  return units.filter(([unit, value]) => value > 0 || (seconds === 0 && unit === 'second'))
    .map(([unit, value]) => numberFormat(unit).format(value))
    .join(' ')
}

function renderedMessage(element) {
  if (!element) return null
  const root = committedFiber(element)
  // Assistant UI scopes each bubble to its own message. Read only that scope.
  for (let fiber = root; fiber && (fiber === root || !(fiber.stateNode instanceof Element)); fiber = fiber.return) {
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) {
      const client = context.memoizedValue
      if (!client?.message?.source) continue
      try {
        const message = client.message().__internal_getRuntime?.()?.getState()
        if (message?.role === element.dataset.role && (!element.dataset.messageId || message.id === element.dataset.messageId)) {
          return message
        }
      } catch {
        // Old or detached message scopes need no inferred duration.
      }
    }
  }
  return null
}

function savedDuration(prompt, message) {
  const metadata = message?.metadata?.custom
  if (!metadata || message.status?.type !== 'complete') return null
  // Hydration may group early tool activity into the final reply. Its last
  // persisted text part has the completion time, while the bubble start does not.
  const text = message.content.findLast(part => part.type === 'text' && part.text.trim())
  const end = metadata.timelineCompletedAt ?? (text?.sourceRowId != null ? text.timestamp : null)
  if (!Number.isFinite(end)) return null
  const start = renderedMessage(prompt)?.metadata?.custom?.timelineTimestamp
  return Number.isFinite(start) && start > 0 && end > start ? Math.floor(end - start) : null
}

function clearSteps(group, state) {
  syncWorkSteps(group, state, [])
  state.bar?.remove()
  state.bar = null
  group.removeAttribute('data-hcv-turn-folded')
  group.removeAttribute('data-hcv-turn-summary')
}

function showSummary(group, state, steps, elapsed) {
  const hasSteps = steps.length > 0
  if (!state.bar || (state.bar.tagName === 'BUTTON') !== hasSteps) {
    clearSteps(group, state)
    const bar = make(hasSteps ? 'button' : 'div', 'turn-line')
    if (hasSteps) {
      bar.type = 'button'
      bar.setAttribute('aria-expanded', 'false')
      group.setAttribute('data-hcv-turn-folded', '')
      bar.addEventListener('click', () => {
        setWorkOpen(group, state, bar.getAttribute('aria-expanded') !== 'true')
      })
    }
    state.bar = bar
  }
  if (group.firstElementChild !== state.bar) group.prepend(state.bar)
  const ru = isRussian()
  let label = ru ? 'Выполнено' : 'Worked'
  if (elapsed) label = ru ? `Работал на протяжении ${elapsed}` : `Worked for ${elapsed}`
  updateText(state.bar, label)
  group.setAttribute('data-hcv-turn-summary', '')

  syncWorkSteps(group, state, steps)
}

function savedStopSeconds(history, surface, notice) {
  const record = nativeRenderedMessageRecord(notice.closest(assistant))
  const snapshot = history?.forSurface(surface)
  if (!record?.storedId || ![snapshot?.sessionId, snapshot?.requestedSessionId].includes(record.storedId)) return null
  const ids = new Set([record.rowId, ...record.sourceRowIds])
  const row = snapshot.rows?.findLast(row => row.role === 'assistant' &&
    row.display_metadata?.interrupted === true && ids.has(row.row_id ?? row.id))
  const timing = savedTimelineMetadata(row)
  return elapsedTurnSeconds(timing?.turnStartedAtMs, timing?.completedAtMs ?? row?.timestamp * 1000)
}

function clearStoppedPair(pair, states) {
  const state = states.get(pair)
  if (!state) return
  state.line.remove()
  pair.removeAttribute('data-hcv-turn-stopped')
  states.delete(pair)
}

function syncStoppedPair(pair, states, history, surface, readStop) {
  const prompt = pair.querySelector(`:scope > ${user}[data-message-id]`)
  const notice = pair.querySelector(`:scope > ${response} > ${assistant} > ${answer} > ${stoppedNotice}`)
  const stop = prompt && readStop?.(prompt.dataset.messageId, renderedMessage(prompt)?.metadata?.custom?.rowId)
  if (!prompt || (!stop && !notice) || pair.querySelector(`${streaming}, ${nativeActivity}`)) {
    clearStoppedPair(pair, states)
    return
  }

  let state = states.get(pair)
  if (!state) {
    const line = make('div', 'turn-stop-line')
    line.setAttribute('role', 'status')
    const label = document.createElement('span')
    const time = document.createElement('time')
    line.append(label, time)
    state = { line, label, time }
    states.set(pair, state)
  }

  const seconds = stop ? stop.seconds : savedStopSeconds(history, surface, notice)
  const elapsed = Number.isSafeInteger(seconds) && seconds >= 0 ? formatDuration(seconds) : ''
  const label = isRussian()
    ? stop ? 'Вы остановили выполнение' : 'Выполнение прервано'
    : stop ? 'You stopped the task' : 'Task interrupted'
  updateText(state.label, elapsed ? label + (isRussian() ? ' через' : ' after') + ' ' : label)
  updateText(state.time, elapsed)
  state.time.hidden = !elapsed
  if (elapsed) state.time.dateTime = `PT${seconds}S`
  else state.time.removeAttribute('datetime')
  if (prompt.nextElementSibling !== state.line) prompt.after(state.line)
  pair.setAttribute('data-hcv-turn-stopped', stop ? 'user' : 'interrupted')
}

function fileNoun(count) {
  if (!isRussian()) return count === 1 ? 'file' : 'files'
  russianPlurals ??= new Intl.PluralRules('ru')
  return { one: 'файл', few: 'файла', many: 'файлов' }[russianPlurals.select(count)] || 'файлов'
}

function numbers(parent) {
  const totals = make('span', 'files-totals')
  const added = make('span', 'files-added')
  const removed = make('span', 'files-removed')
  totals.append(added, removed)
  parent.append(totals)
  return { totals, added, removed }
}

function showNumbers({ added, removed }, plus, minus, format) {
  updateText(added, `+${format.format(plus)}`)
  updateText(removed, `${isRussian() ? '–' : '-'}${format.format(minus)}`)
}

function nativeCardCwd(card) {
  // The session view belongs to this card's pane, including when a tile
  // and the main chat are displaying different worktrees.
  for (let fiber = committedFiber(card)?.return; fiber; fiber = fiber.return) {
    if (!Array.isArray(fiber.memoizedProps?.parts)) continue
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) {
      const view = context.memoizedValue
      if ((view?.kind === 'primary' || view?.kind === 'tile') && typeof view.$cwd?.get === 'function') {
        return view.$cwd.get()
      }
    }
    break
  }
  return card.closest(primary) ? host.state.cwd.get() : ''
}

function fileDisplayPath(row, cwd) {
  // Hermes passes the real path as the row's tooltip key. The DOM only
  // exposes the basename until that tooltip opens.
  for (let fiber = committedFiber(row)?.return; fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof fiber.key === 'string' && typeof props?.label === 'string' && props.children?.type === 'button') {
      const path = fiber.key.replaceAll('\\', '/')
      const root = (cwd || '').replaceAll('\\', '/').replace(/\/+$/, '')
      if (!root && !cwd) return path
      const prefix = root + '/'
      const windows = /^(?:[a-z]:\/|\/\/)/i.test(prefix)
      const within = windows ? path.toLowerCase().startsWith(prefix.toLowerCase()) : path.startsWith(prefix)
      return within ? path.slice(prefix.length) : path
    }
    if (fiber.stateNode instanceof Element) break
  }
}

function paintFileRow(row, path, added, removed, format) {
  const index = path.lastIndexOf('/') + 1
  updateText(row.accessiblePath, path)
  updateText(row.directory, path.slice(0, index))
  updateText(row.basename, path.slice(index))
  showNumbers(row.numbers, added, removed, format)
}

function makeFileRow(button) {
  const accessiblePath = make('span', 'file-accessible-path')
  const label = make('span', 'file-path')
  const directory = make('span', 'file-directory')
  const basename = make('span', 'file-basename')
  label.setAttribute('aria-hidden', 'true')
  label.append(directory, basename)
  button.append(accessiblePath, label)
  const counts = numbers(button)
  return { accessiblePath, label, directory, basename, numbers: counts }
}

function clearFileRow(row) {
  row.accessiblePath.remove()
  row.label.remove()
  row.numbers.totals.remove()
}

function clearFiles(state) {
  const files = state.files
  if (!files) return
  clearTurnFilePreview(files)
  clearTurnFilePreviewRows(files)
  files.heading.remove()
  files.open.remove()
  files.more.remove()
  files.checkpoint.remove()
  files.review.removeEventListener('click', files.selectSingle, true)
  for (const row of files.rows.values()) clearFileRow(row)
  files.nativeTitle.removeAttribute('data-hcv-file-native-title')
  if (files.review.getAttribute('aria-label') === files.review.getAttribute('data-hcv-file-review')) {
    if (files.originalReviewLabel === null) files.review.removeAttribute('aria-label')
    else files.review.setAttribute('aria-label', files.originalReviewLabel)
  }
  files.review.removeAttribute('data-hcv-file-review')
  files.card.removeAttribute('data-hcv-file-card')
  files.card.removeAttribute('data-hcv-file-single')
  files.card.removeAttribute('data-hcv-files-open')
  files.card.removeAttribute('data-hcv-files-foldable')
  state.files = null
}

function showFiles(state, card) {
  const header = card?.children[0]
  const list = card?.children[1]
  const nativeTitle = header?.querySelector(':scope > span')
  const review = header?.querySelector(':scope > button:not([data-hcv-generated])')
  if (!nativeTitle || !review || !list) return clearFiles(state)
  let restoreMoreFocus = false
  if (state.files?.card !== card || state.files.nativeTitle !== nativeTitle || state.files.review !== review) {
    // Hermes can replace the native review button while keeping this turn.
    // Its repaint must not collapse the user's list or discard keyboard focus.
    restoreMoreFocus = Boolean(state.files?.more?.contains(document.activeElement))
    clearFiles(state)
    const heading = make('div', 'files-heading')
    const name = make('span', 'files-title')
    const subtitle = make('span', 'files-subtitle')
    heading.append(name, subtitle)
    const counts = numbers(subtitle)
    const hover = make('span', 'files-hover')
    subtitle.append(hover)
    const open = make('button', 'files-open')
    open.type = 'button'
    open.addEventListener('click', () => (state.files?.single || review).click())
    const selectSingle = event => {
      const row = state.files?.single
      if (!row) return
      // Both Codex controls open the file's diff for a one-file turn.
      event.stopPropagation()
      row.click()
    }
    review.addEventListener('click', selectSingle, true)
    const more = make('button', 'files-more')
    more.type = 'button'
    more.append(make('span', 'files-more-label'))
    more.setAttribute('aria-expanded', 'false')
    more.addEventListener('click', () => {
      anchorTurnCard(header)
      state.filesExpanded = !state.filesExpanded
      card.toggleAttribute('data-hcv-files-open', state.filesExpanded)
      more.setAttribute('aria-expanded', String(state.filesExpanded))
      updateMoreLabel(state.files)
    })
    const checkpoint = make('button', 'files-checkpoint')
    checkpoint.type = 'button'
    checkpoint.addEventListener('click', () => nativeCheckpoint(card)?.click())
    state.files = { card, nativeTitle, review, originalReviewLabel: review.getAttribute('aria-label'),
      heading, name, counts, hover, open, selectSingle, more, checkpoint, remaining: 0, single: null, rows: new Map() }
  }
  const files = state.files
  const { heading, name, hover, open, more, checkpoint } = files
  if (heading.parentElement !== header) nativeTitle.after(heading)
  if (open.parentElement !== header) header.prepend(open)
  const rows = new Set(list.querySelectorAll(':scope > button'))
  if (!rows.size) return clearFiles(state)
  const count = rows.size
  const ru = isRussian()
  const format = numberFormat()
  const cwd = nativeCardCwd(card)
  let plus = 0
  let minus = 0
  const previewRows = []
  for (const [row, display] of files.rows) {
    if (count > 1 && rows.has(row)) continue
    clearFileRow(display)
    files.rows.delete(row)
  }
  for (const row of rows) {
    const added = Number(row.querySelector('[class~="text-(--ui-green)"]')?.textContent.slice(1)) || 0
    const removed = Number(row.querySelector('[class~="text-(--ui-red)"]')?.textContent.slice(1)) || 0
    plus += added
    minus += removed
    if (count === 1) continue
    const basename = row.querySelector(':scope > span.truncate')?.textContent || ''
    const path = fileDisplayPath(row, cwd)
    previewRows.push({ row, basename, path: path ?? '' })
    if (!files.rows.has(row)) files.rows.set(row, makeFileRow(row))
    paintFileRow(files.rows.get(row), path ?? basename, added, removed, format)
  }
  files.single = count === 1 ? rows.values().next().value : null
  card.toggleAttribute('data-hcv-file-single', Boolean(files.single))
  card.setAttribute('data-hcv-file-card', '')
  nativeTitle.setAttribute('data-hcv-file-native-title', '')
  open.setAttribute('aria-label', ru ? 'Посмотреть измененные файлы' : 'View changed files')
  updateText(hover, ru ? 'Просмотр изменений' : 'View changes')
  const reviewLabel = ru ? 'Просмотреть изменения' : 'View changes'
  review.setAttribute('data-hcv-file-review', reviewLabel)
  review.setAttribute('aria-label', reviewLabel)
  const restore = nativeCheckpoint(card)
  if (restore) {
    updateText(checkpoint, ru ? 'Отменить' : 'Undo')
    checkpoint.title = restore.getAttribute('aria-label')
    if (checkpoint.parentElement !== header) review.before(checkpoint)
  } else {
    checkpoint.remove()
  }
  if (files.single) {
    clearTurnFilePreviewRows(files)
    const basename = files.single.querySelector(':scope > span.truncate')?.textContent || ''
    syncTurnFilePreview(files, fileDisplayPath(files.single, '') ?? '', cwd, basename, ru)
    if (!files.previewLink) updateText(name, ru ? `Изменён ${basename}` : `Edited ${basename}`)
  } else {
    clearTurnFilePreview(files)
    updateText(name, ru ? `Изменено ${format.format(count)} ${fileNoun(count)}` : `Edited ${format.format(count)} files`)
    syncTurnFilePreviewRows(files, previewRows, cwd, ru)
  }
  showNumbers(files.counts, plus, minus, format)
  if (card.toggleAttribute('data-hcv-files-foldable', count > 3)) {
    if (more.parentElement !== card) card.append(more)
    card.toggleAttribute('data-hcv-files-open', Boolean(state.filesExpanded))
    more.setAttribute('aria-expanded', String(Boolean(state.filesExpanded)))
    files.remaining = count - 3
    updateMoreLabel(files)
    if (restoreMoreFocus && more.isConnected) more.focus({ preventScroll: true })
  } else {
    state.filesExpanded = false
    card.removeAttribute('data-hcv-files-open')
    more.setAttribute('aria-expanded', 'false')
    more.remove()
  }
}

function nativeCheckpoint(card) {
  // Restoring a conversation checkpoint is a different action. Source-based
  // file undo is owned by chat-turn-history and its immutable saved patches.
  return null
}

function updateMoreLabel({ card, more, remaining }) {
  const expanded = card.hasAttribute('data-hcv-files-open')
  updateText(more.firstElementChild, expanded
    ? isRussian() ? 'Свернуть файлы' : 'Collapse files'
    : isRussian() ? `Показать еще ${remaining} ${fileNoun(remaining)}` : `Show ${remaining} more ${fileNoun(remaining)}`)
}

function synchronize(group, state, tail, ownPrompt, completedSeconds, textChanges, viewBusy) {
  const roots = [...group.querySelectorAll(`:scope > ${assistant}`)]
  if (!roots.length) {
    group.removeAttribute(viewWorking)
    clearSteps(group, state)
    state.wasWorking = false
    clearFiles(state)
    textChanges.set(group)
    return
  }
  const nativeWorking = Boolean(group.querySelector(`${streaming}, ${nativeActivity}`))
  // A new submission sets the session busy before its own prompt is mounted.
  // Only a turn already observed working can use that flag after it seals.
  const working = nativeWorking || (viewBusy && state.wasWorking)
  group.toggleAttribute(viewWorking, viewBusy && working)
  const justFinished = !working && state.wasWorking
  state.wasWorking = working && (tail || state.wasWorking)
  const blocked = roots.some((root) => root.matches(actionable) || root.querySelector(actionable))
  const final = roots.findLast((root) => [...root.querySelectorAll('[data-slot="aui_msg-actions"]')]
    .some(actions => actions.closest(assistant) === root))

  let durationLabel = null
  if (!working && !blocked && final && !group.closest(`${turnPair}[data-hcv-turn-stopped]`)) {
    durationLabel = final.querySelector(duration)
    const elapsed = formatDuration(durationSeconds(durationLabel?.textContent) ??
      completedSeconds ?? savedDuration(ownPrompt, renderedMessage(final)))
    const steps = completedWorkSteps(group, final, {
      isInterim: root => renderedMessage(root)?.metadata?.custom?.interim === true,
    })
    if (elapsed || steps.length) {
      showSummary(group, state, steps, elapsed)
      if (justFinished) state.bar.setAttribute('data-hcv-turn-finish', '')
    } else clearSteps(group, state)
  } else {
    clearSteps(group, state)
  }
  const card = group.querySelector(changes)
  showFiles(state, card)
  textChanges.set(group, durationLabel, card)
}

export function registerTurnExperience(ctx, active, stoppedTurns, history) {
  registerTurnFilePreviewStyle(ctx, active)
  const chat = `${active} [data-chat-surface]`
  const stoppedPair = `${chat} ${turnPair}[data-hcv-turn-stopped]`
  const stoppedRoot = `${stoppedPair} > ${response} > ${assistant}`
  const activities = ':is([data-slot="tool-block"], [data-hcv-activity-group], [data-hcv-agent-rows])'
  const visibleFlow = `:is(${activities}, .aui-md:not(${stopDiagnostic})):not([data-hcv-activity-member="closed"], [data-delegate-card])`
  const tailResponse = `:is(${stoppedPair} > ${response}:last-child,` +
    ` ${stoppedPair}[data-hcv-turn-stopped="user"] > ${response}:nth-last-child(1 of :not(${stopRecovery})))`
  const tailRoot = `${tailResponse} > ${assistant}:last-child` +
    `:has(> ${answer} > ${activities}:nth-last-child(1 of ${visibleFlow}))` +
    `:not(:has([role="alert"], ${changes}, [data-hcv-saved-turn-card]))`
  const replyFooter = 'div:has(> div > [data-slot="aui_msg-actions"])'
  mountCSS(ctx, 'data-hcv-stop-line-style', `
    ${chat} [data-hcv-turn-stop-line] {
      align-self: start; color: var(--hcv-activity-text, var(--hcv-muted));
      font: 430 var(--hcv-activity-font, var(--conversation-text-font-size))/var(--hcv-activity-line, 1.5) var(--hcv-ui-font);
    }
    ${stoppedPair}[data-hcv-turn-stopped="user"] > ${stopRecovery},
    ${stoppedRoot} > ${answer} > :is(${stoppedNotice}, ${stopDiagnostic}),
    ${stoppedRoot} ${duration} { display: none !important; }
    ${stoppedRoot}:has(> ${answer} > ${stopDiagnostic}):not(:has(> ${answer} > .aui-md:not(${stopDiagnostic})))
      > ${replyFooter} { display: none; }
    ${tailRoot} { position: relative; overflow: visible; }
    /* Keep the hover and keyboard actions inside the existing clearance. */
    ${tailRoot} > ${replyFooter}:has(> div:only-child) { position: absolute; inset-block-start: 100%; inset-inline: 0; }
  `, chatStyles)
  const states = new Map()
  const stoppedPairs = new Map()
  const dirtyPairs = new Set()
  const started = new Map()
  const durations = new Map()
  const lastBySession = new Map()
  const contrast = window.matchMedia('(forced-colors: none)')
  const dirty = new Set()
  const tails = new Set()
  const busyViews = new Map()
  const allGroups = `[data-chat-surface] ${response}`
  const allPairs = `[data-chat-surface] ${turnPair}`
  const dirtyTranscripts = new Set()
  const turnStructure = `${turnPair}, ${response}, ${user}`
  let full = true
  let refreshStopped = false
  let frame = 0

  const sessionKey = (id) => JSON.stringify([host.state.connectionId.get(), host.state.profile.get(), id])
  const keyFor = (event) => event.session_id && !event.replayed && document.documentElement.matches(active) &&
    (!event.connectionId || event.connectionId === host.state.connectionId.get()) &&
    (!event.profile || event.profile === host.state.profile.get()) ? sessionKey(event.session_id) : null
  const primaryPrompt = (event) => event.session_id === host.state.activeSessionId.get()
    ? [...document.querySelectorAll(`${primary} ${promptRoot}`)].at(-1)
    : null
  const storedKey = (runtime) => sessionKey(host.state.focusedSessionId.get() === runtime
    ? host.state.focusedStoredSessionId.get() || runtime : runtime)
  const promptText = (prompt) => prompt?.querySelector('.composer-human-message')?.textContent.trim()
  ctx.onEvent('message.start', (event) => {
    const key = keyFor(event)
    if (key && !started.has(key)) {
      const prompt = primaryPrompt(event)
      const session = storedKey(event.session_id)
      lastBySession.delete(session)
      started.set(key, { at: Date.now(), promptId: prompt?.dataset.messageId, text: promptText(prompt), session })
    }
    if (started.size > 64) started.delete(started.keys().next().value)
  })
  ctx.onEvent('message.complete', (event) => {
    const key = keyFor(event)
    const start = key && started.get(key)
    if (!start) return
    started.delete(key)
    if (event.payload?.error || (event.payload?.status && event.payload.status !== 'complete')) {
      if (event.payload?.status === 'interrupted') queue()
      return
    }
    const prompt = primaryPrompt(event)
    const promptId = prompt?.dataset.messageId || start.promptId
    if (!promptId) return
    const seconds = Math.max(1, Math.round((Date.now() - start.at) / 1000))
    durations.set(JSON.stringify([key, promptId]), seconds)
    const text = promptText(prompt) || start.text
    if (text) lastBySession.set(prompt ? storedKey(event.session_id) : start.session, { text, seconds })
    if (durations.size > 200) durations.delete(durations.keys().next().value)
    if (lastBySession.size > 64) lastBySession.delete(lastBySession.keys().next().value)
    queue()
  })

  function remove(group, state) {
    clearSteps(group, state)
    clearFiles(state)
    group.removeAttribute(viewWorking)
    textChanges.set(group)
    states.delete(group)
  }

  function watchBusyViews() {
    const activePairs = new Set([...tails].map(group => group.closest(turnPair)).filter(Boolean))
    for (const [pair, entry] of busyViews) {
      if (activePairs.has(pair)) continue
      entry.stop()
      busyViews.delete(pair)
    }
    for (const pair of activePairs) {
      const view = nativeSessionView(pair.closest('[data-chat-surface]'))?.view
      const atom = view?.$busy
      const current = busyViews.get(pair)
      if (current?.atom === atom) continue
      current?.stop()
      busyViews.delete(pair)
      if (typeof atom?.get !== 'function' || typeof atom?.listen !== 'function') continue
      busyViews.set(pair, { atom, stop: atom.listen(() => {
        for (const group of pair.querySelectorAll(`:scope > ${response}`)) dirty.add(group)
        schedule()
      }) })
    }
  }

  function render() {
    frame = 0
    const enabled = document.documentElement.matches(active)
    const styled = enabled && contrast.matches
    if (full || refreshStopped || !enabled) {
      refreshStopped = false
      const pairs = enabled ? new Set(document.querySelectorAll(allPairs)) : new Set()
      for (const pair of stoppedPairs.keys()) if (!pairs.has(pair)) clearStoppedPair(pair, stoppedPairs)
      if (full || !enabled) dirtyPairs.clear()
      for (const pair of pairs) dirtyPairs.add(pair)
    }
    const refreshAll = full || !styled
    if (refreshAll || dirtyTranscripts.size) {
      let groups = []
      if (refreshAll) {
        groups = styled ? [...document.querySelectorAll(allGroups)] : []
        const present = new Set(groups)
        for (const [group, state] of states) if (!present.has(group)) remove(group, state)
        dirty.clear()
        tails.clear()
      } else {
        // A new prompt or response only changes the tail of its own transcript.
        for (const group of tails) {
          if (!dirtyTranscripts.has(group.closest(transcript))) continue
          tails.delete(group)
          dirty.add(group)
        }
        for (const container of dirtyTranscripts) {
          const ownGroups = [...container.querySelectorAll(response)].filter(group => group.closest(transcript) === container)
          const last = ownGroups.at(-1)
          if (last) groups.push(last)
        }
      }
      const tailByTranscript = new Map(groups.map((group) => [group.closest(transcript), group]))
      for (const [container, group] of tailByTranscript) {
        const prompt = [...(container?.querySelectorAll(user) || [])].at(-1)
        if (!prompt || !(group.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING)) tails.add(group)
      }
      watchBusyViews()
      for (const group of groups) dirty.add(group)
    }
    dirtyTranscripts.clear()
    full = false
    if (enabled) {
      const readers = new Map()
      for (const pair of dirtyPairs) {
        if (!pair.isConnected) continue
        const surface = pair.closest('[data-chat-surface]')
        if (!surface) continue
        if (!readers.has(surface)) readers.set(surface, stoppedTurns?.forSurface(surface))
        const hadStop = stoppedPairs.has(pair)
        syncStoppedPair(pair, stoppedPairs, history, surface, readers.get(surface))
        if (hadStop !== stoppedPairs.has(pair)) {
          for (const group of pair.querySelectorAll(`:scope > ${response}`)) dirty.add(group)
        }
      }
    }
    dirtyPairs.clear()
    if (styled) {
      const runtime = host.state.activeSessionId.get()
      const key = runtime && sessionKey(runtime)
      const last = runtime && lastBySession.get(storedKey(runtime))
      for (const group of dirty) {
        if (!group.isConnected || !group.matches(allGroups)) continue
        let state = states.get(group)
        if (!state) {
          state = { steps: new Set(), bar: null, files: null, wasWorking: false }
          states.set(group, state)
        }
        const tail = tails.has(group)
        const main = key && group.closest(primary)
        const ownPrompt = group.closest('[data-slot="aui_turn-pair"]')?.querySelector(`:scope > ${user}[data-message-id]`)
        const timeKey = main && ownPrompt && JSON.stringify([key, ownPrompt.dataset.messageId])
        const recorded = (timeKey && durations.get(timeKey)) ||
          (main && tail && last && last.text === promptText(ownPrompt) && last.seconds)
        // The latest public comment may already be sealed while the session
        // is still working. Keep its footer and completion fold out of that gap.
        const viewBusy = busyViews.get(group.closest(turnPair))?.atom.get() === true
        synchronize(group, state, tail, ownPrompt, recorded || null, textChanges, viewBusy)
      }
    }
    dirty.clear()
    textChanges.refresh()
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render)
  }

  function queue() {
    full = true
    schedule()
  }

  function markAddedStructure(element, node) {
    const container = element.closest(transcript)
    if (!container?.closest('[data-chat-surface]') || !node.isConnected || container.parentElement.closest(transcript)) return false
    const parts = [...node.querySelectorAll(turnStructure)]
    if (node.matches(turnStructure)) parts.push(node)
    if (parts.some(part => part.closest(transcript) !== container)) return false
    dirtyTranscripts.add(container)
    for (const part of parts) {
      if (part.matches(turnPair)) dirtyPairs.add(part)
      if (part.matches(response)) dirty.add(part)
    }
    return true
  }

  function markChanges(records) {
    const root = document.documentElement
    if (records.some(({ target }) => target === root)) return queue()
    if (!root.matches(active)) return
    for (const { target, type, addedNodes, removedNodes } of records) {
      const element = target instanceof Element ? target : target.parentElement
      if (!element || element.closest('[data-hcv-generated]')) continue
      const group = element.closest(response)
      const pair = element.closest(turnPair)
      if (type === 'characterData') {
        if (group && element.closest(`${changes}, ${duration}`)) dirty.add(group)
      } else if (type === 'attributes') {
        if (group) dirty.add(group)
        if (pair) dirtyPairs.add(pair)
      } else {
        for (const nodes of [addedNodes, removedNodes]) {
          for (const node of nodes) {
            if (node instanceof Element && !node.hasAttribute('data-hcv-generated')) {
              if ((node.matches(turnStructure) || node.querySelector(turnStructure)) &&
                  (nodes === removedNodes || !markAddedStructure(element, node))) return queue()
              if (group) dirty.add(group)
              if (pair) dirtyPairs.add(pair)
            } else if (group && node.nodeType === Node.TEXT_NODE && element.closest(`${changes}, ${duration}`)) {
              dirty.add(group)
            }
          }
        }
      }
      // A response can contain another response (for example in a subagent view).
      // Its descendants also affect the selectors used by the enclosing answer.
      if (group && dirty.has(group)) {
        for (let parent = group.parentElement?.closest(response); parent; parent = parent.parentElement?.closest(response)) {
          dirty.add(parent)
        }
      }
    }
    if (dirty.size || dirtyPairs.size || dirtyTranscripts.size) schedule()
  }
  const observer = new MutationObserver(markChanges)
  const textChanges = observeChatText(markChanges)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-message-streaming', 'data-hermes-theme', 'data-hermes-codex-visual', 'lang', 'title', 'disabled'],
  })
  contrast.addEventListener('change', queue)
  const stopUpdates = stoppedTurns?.subscribe(queue)
  // Timeline snapshots supply interruption timing. Only a changed stop
  // marker affects the response presentation, through the dirty-pair pass.
  const historyUpdates = history?.subscribe(() => {
    refreshStopped = true
    schedule()
  })
  const unsubscribe = [host.state.activeSessionId, host.state.focusedSessionId, host.state.focusedStoredSessionId,
    host.state.connectionId, host.state.profile].map(atom => atom.listen(queue))
  queue()
  ctx.onDispose(() => {
    observer.disconnect()
    textChanges.clear()
    stopUpdates?.()
    historyUpdates?.()
    for (const pair of stoppedPairs.keys()) clearStoppedPair(pair, stoppedPairs)
    contrast.removeEventListener('change', queue)
    for (const stop of unsubscribe) stop()
    for (const { stop } of busyViews.values()) stop()
    busyViews.clear()
    if (frame) cancelAnimationFrame(frame)
    for (const [group, state] of states) remove(group, state)
  })
}
import { anchorTurnCard } from './turn-card-scroll.js'
