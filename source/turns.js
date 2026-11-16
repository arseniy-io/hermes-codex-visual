import { host } from '@hermes/plugin-sdk'
import { committedFiber } from './sidebar-recents.js'

const response = '[data-slot="aui_response-group"]'
const assistant = '[data-slot="aui_assistant-message-root"]'
const answer = '[data-slot="aui_assistant-message-content"]'
const duration = '[data-slot="aui_turn-duration"]'
const changes = '[data-slot="aui_changed-files"]'
const transcript = '[data-slot="aui_thread-content"]'
const promptRoot = '[data-slot="aui_turn-pair"] > [data-slot="aui_user-message-root"][data-message-id]'
const primary = '[data-chat-surface][data-composer-target="main"]'
const nativeActivity = ':is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"])'
const activeIndicators = `[data-chat-surface] :is(${nativeActivity}, [data-hcv-live-turn])`
const streaming = '[data-message-streaming="true"]'
const step = ':is([data-conversation-scaffold]:not([role="status"]), [data-slot="tool-block"], [data-slot="aui_reasoning-text"])'
const actionable = ':is([role="alert"], [data-approval-activity-only], [data-approval-stack], [data-clarify-choices], [data-clarify-late-choices], [data-clarify-batch-preview], [data-clarify-batch-question]:not([data-locked]))'
const protectedStep = `:is(${actionable}, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-delegate-card], [data-hcv-agent-rows], svg.text-destructive[aria-label])`

const isRussian = () => document.documentElement.lang.toLowerCase().startsWith('ru')

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
  const language = document.documentElement.lang || 'en'
  return units.filter(([unit, value]) => value > 0 || (seconds === 0 && unit === 'second'))
    .map(([unit, value]) => new Intl.NumberFormat(language, { style: 'unit', unitDisplay: 'narrow', unit }).format(value))
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

function findSteps(group, roots, final) {
  const canFold = (node) => !node.matches(protectedStep) && !node.querySelector(protectedStep)
  const earlier = roots.slice(0, roots.indexOf(final)).filter(canFold)
  const body = final.querySelector(answer)
  const detail = [...(body?.querySelectorAll(step) || [])].filter((node) => !node.parentElement.closest(step) && canFold(node))
  const prose = [...(body?.querySelectorAll('.aui-md') || [])].filter((node) => !node.parentElement.closest(step))
  const lastStep = detail.at(-1)
  const commentary = lastStep ? prose.slice(0, -1).filter((node) =>
    canFold(node) && Boolean(node.compareDocumentPosition(lastStep) & Node.DOCUMENT_POSITION_FOLLOWING),
  ) : []
  return [...earlier, ...detail, ...commentary].filter((node) => node.closest(response) === group)
}

function clearSteps(group, state) {
  for (const node of state.steps) node.removeAttribute('data-hcv-turn-step')
  state.steps.clear()
  state.bar?.remove()
  state.bar = null
  group.removeAttribute('data-hcv-turn-folded')
  group.removeAttribute('data-hcv-turn-summary')
}

function showSummary(group, state, steps, elapsed, interrupted) {
  const hasSteps = steps.length > 0
  if (!state.bar || (state.bar.tagName === 'BUTTON') !== hasSteps) {
    clearSteps(group, state)
    const bar = make(hasSteps ? 'button' : 'div', 'turn-line')
    if (hasSteps) {
      bar.type = 'button'
      bar.setAttribute('aria-expanded', 'false')
      group.setAttribute('data-hcv-turn-folded', '')
      bar.addEventListener('click', () => {
        const open = group.toggleAttribute('data-hcv-turn-folded') === false
        bar.setAttribute('aria-expanded', String(open))
      })
    }
    state.bar = bar
  }
  if (group.firstElementChild !== state.bar) group.prepend(state.bar)
  const ru = isRussian()
  let label = ru ? 'Выполнено' : 'Worked'
  if (interrupted) label = ru ? 'Остановлено' : 'Stopped'
  else if (elapsed) label = ru ? `Выполнено за ${elapsed}` : `Worked for ${elapsed}`
  updateText(state.bar, label)
  group.setAttribute('data-hcv-turn-summary', '')

  const next = new Set(steps)
  for (const node of state.steps) if (!next.has(node)) node.removeAttribute('data-hcv-turn-step')
  for (const node of next) if (!state.steps.has(node)) node.setAttribute('data-hcv-turn-step', '')
  state.steps = next
}

function clearLive(state) {
  state.live?.row.remove()
  state.live = null
}

function showLive(root, state, now) {
  if (!state.live) {
    const row = make('div', 'live-turn')
    const time = make('time', 'live-time')
    row.setAttribute('role', 'status')
    time.setAttribute('aria-hidden', 'true')
    row.append(time)
    state.live = { row, time }
  }
  const { row } = state.live
  const body = root.querySelector(answer)
  if (body && body.nextElementSibling !== row) body.after(row)
  updateLiveTime(state, now)
}

function updateLiveTime(state, now) {
  const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000))
  updateText(state.live.time, seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
}

function syncThinkingLabels(labels, enabled) {
  const visible = new Set()
  const text = isRussian() ? 'Думаю' : 'Thinking'
  for (const row of enabled ? document.querySelectorAll(activeIndicators) : []) {
    // Named waits and local-model progress keep their own Hermes wording.
    if (row.querySelector(':scope > :not(.dither, [aria-hidden="true"], [data-hcv-thinking])')) continue
    visible.add(row)
    let label = labels.get(row)
    if (!label) {
      label = make('span', 'thinking')
      const sweep = make('span', 'thinking-sweep')
      sweep.setAttribute('aria-hidden', 'true')
      label.append(document.createTextNode(''), sweep)
      labels.set(row, label)
    }
    if (label.firstChild.data !== text) {
      label.firstChild.data = text
      label.lastElementChild.dataset.hcvThinkingSweep = text
    }
    if (label.parentElement !== row) row.prepend(label)
  }
  for (const [row, label] of labels) {
    if (visible.has(row)) continue
    label.remove()
    labels.delete(row)
  }
}

function fileNoun(count) {
  if (!isRussian()) return count === 1 ? 'file' : 'files'
  return { one: 'файл', few: 'файла', many: 'файлов' }[new Intl.PluralRules('ru').select(count)] || 'файлов'
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

function fileDisplayPath(row, basename, cwd) {
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
  return basename
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
  if (state.files?.card !== card || state.files.nativeTitle !== nativeTitle || state.files.review !== review) {
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
      more.setAttribute('aria-expanded', String(card.toggleAttribute('data-hcv-files-open')))
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
  const format = new Intl.NumberFormat(document.documentElement.lang || 'en')
  const cwd = count > 1 ? nativeCardCwd(card) : ''
  let plus = 0
  let minus = 0
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
    const path = fileDisplayPath(row, basename, cwd)
    if (!files.rows.has(row)) files.rows.set(row, makeFileRow(row))
    paintFileRow(files.rows.get(row), path, added, removed, format)
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
    const basename = files.single.querySelector(':scope > span.truncate')?.textContent || ''
    updateText(name, ru ? `Изменён ${basename}` : `Edited ${basename}`)
  } else {
    updateText(name, ru ? `Изменено ${format.format(count)} ${fileNoun(count)}` : `Edited ${format.format(count)} files`)
  }
  showNumbers(files.counts, plus, minus, format)
  if (card.toggleAttribute('data-hcv-files-foldable', count > 3)) {
    if (more.parentElement !== card) card.append(more)
    files.remaining = count - 3
    updateMoreLabel(files)
  } else {
    card.removeAttribute('data-hcv-files-open')
    more.setAttribute('aria-expanded', 'false')
    more.remove()
  }
}

function nativeCheckpoint(card) {
  const label = isRussian() ? 'Восстановить чекпоинт' : 'Restore checkpoint'
  const turn = card.closest('[data-slot="aui_turn-pair"]')
  const prompt = turn?.querySelector('[data-slot="aui_user-message-root"]')
  return prompt?.querySelector(`button[aria-label="${label}"]:not(:disabled)`)
}

function updateMoreLabel({ card, more, remaining }) {
  const expanded = card.hasAttribute('data-hcv-files-open')
  updateText(more.firstElementChild, expanded
    ? isRussian() ? 'Свернуть файлы' : 'Collapse files'
    : isRussian() ? `Показать еще ${remaining} ${fileNoun(remaining)}` : `Show ${remaining} more ${fileNoun(remaining)}`)
}

function synchronize(group, state, now, tail, ownPrompt, completedSeconds, startedAt) {
  const roots = [...group.querySelectorAll(`:scope > ${assistant}`)]
  const last = roots.at(-1)
  if (!last) {
    clearSteps(group, state)
    clearLive(state)
    clearFiles(state)
    return
  }
  const working = Boolean(group.querySelector(`${streaming}, ${nativeActivity}`))
  const blocked = roots.some((root) => root.matches(actionable) || root.querySelector(actionable))
  const final = roots.findLast((root) => root.querySelector('[data-slot="aui_msg-actions"]'))
  if (working && tail) {
    state.startedAt ??= startedAt ?? now
  } else if (!working) {
    state.startedAt = null
  }
  if (working && tail && !blocked && last.querySelector(streaming) && !last.querySelector(nativeActivity)) {
    showLive(last, state, now)
  } else {
    clearLive(state)
  }

  if (!working && !blocked && final) {
    const message = renderedMessage(final)
    const interrupted = Boolean(message?.metadata?.custom?.interrupted)
    const elapsed = interrupted ? '' : formatDuration(durationSeconds(final.querySelector(duration)?.textContent) ??
      completedSeconds ?? savedDuration(ownPrompt, message))
    const steps = findSteps(group, roots, final)
    if (elapsed || steps.length) showSummary(group, state, steps, elapsed, interrupted)
    else clearSteps(group, state)
  } else {
    clearSteps(group, state)
  }
  showFiles(state, group.querySelector(changes))
}

export function registerTurnExperience(ctx, active) {
  const states = new Map()
  const thinkingLabels = new Map()
  const started = new Map()
  const durations = new Map()
  const lastBySession = new Map()
  const contrast = window.matchMedia('(forced-colors: none)')
  const dirty = new Set()
  const live = new Set()
  const tails = new Set()
  const allGroups = `[data-chat-surface] ${response}`
  const user = '[data-slot="aui_user-message-root"]'
  const turnStructure = `${response}, ${user}`
  let full = true
  let frame = 0
  let clockFrame = 0
  let timer = 0

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
    if (event.payload?.error || (event.payload?.status && event.payload.status !== 'complete')) return
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
    clearLive(state)
    clearFiles(state)
    live.delete(state)
    states.delete(group)
  }

  function render() {
    frame = 0
    const enabled = contrast.matches && document.documentElement.matches(active)
    if (full || !enabled) {
      const groups = enabled ? [...document.querySelectorAll(allGroups)] : []
      const present = new Set(groups)
      for (const [group, state] of states) if (!present.has(group)) remove(group, state)
      dirty.clear()
      tails.clear()
      const tailByTranscript = new Map(groups.map((group) => [group.closest(transcript), group]))
      for (const [container, group] of tailByTranscript) {
        const prompt = [...(container?.querySelectorAll(user) || [])].at(-1)
        if (!prompt || !(group.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING)) tails.add(group)
      }
      for (const group of groups) dirty.add(group)
    }
    full = false
    if (enabled) {
      const now = Date.now()
      const runtime = host.state.activeSessionId.get()
      const key = runtime && sessionKey(runtime)
      const last = runtime && lastBySession.get(storedKey(runtime))
      const liveStart = key && started.get(key)
      for (const group of dirty) {
        if (!group.isConnected || !group.matches(allGroups)) continue
        let state = states.get(group)
        if (!state) {
          state = { steps: new Set(), bar: null, live: null, files: null, startedAt: null }
          states.set(group, state)
        }
        const tail = tails.has(group)
        const main = key && group.closest(primary)
        const ownPrompt = group.closest('[data-slot="aui_turn-pair"]')?.querySelector(`:scope > ${user}[data-message-id]`)
        const timeKey = main && ownPrompt && JSON.stringify([key, ownPrompt.dataset.messageId])
        const recorded = (timeKey && durations.get(timeKey)) ||
          (main && tail && last && last.text === promptText(ownPrompt) && last.seconds)
        synchronize(group, state, now, tail, ownPrompt, recorded || null, main ? liveStart?.at : undefined)
        if (state.live) live.add(state)
        else live.delete(state)
      }
    }
    dirty.clear()
    syncThinkingLabels(thinkingLabels, enabled)
    if (live.size) {
      if (!timer) timer = window.setInterval(() => {
        if (!clockFrame) clockFrame = requestAnimationFrame(() => {
          clockFrame = 0
          const now = Date.now()
          if (!contrast.matches || !document.documentElement.matches(active)) return
          for (const state of live) if (state.live.row.isConnected) updateLiveTime(state, now)
        })
      }, 1000)
    } else if (timer) {
      window.clearInterval(timer)
      timer = 0
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render)
  }

  function queue() {
    full = true
    schedule()
  }

  const observer = new MutationObserver((records) => {
    const root = document.documentElement
    if (records.some(({ target }) => target === root)) return queue()
    if (!root.matches(active)) return
    for (const { target, type, addedNodes, removedNodes } of records) {
      const element = target instanceof Element ? target : target.parentElement
      if (!element || element.closest('[data-hcv-generated]')) continue
      const group = element.closest(response)
      if (type === 'characterData') {
        if (group && element.closest(`${changes}, ${duration}`)) dirty.add(group)
      } else if (type === 'attributes') {
        if (group) dirty.add(group)
      } else {
        for (const nodes of [addedNodes, removedNodes]) {
          for (const node of nodes) {
            if (node instanceof Element && !node.hasAttribute('data-hcv-generated')) {
              // Changes to the list of turns can change which answer owns the clock.
              if (node.matches(turnStructure) || node.querySelector(turnStructure)) return queue()
              if (group) dirty.add(group)
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
    if (dirty.size) schedule()
  })
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-message-streaming', 'data-hermes-theme', 'data-hermes-codex-visual', 'lang'],
  })
  contrast.addEventListener('change', queue)
  const unsubscribe = [host.state.activeSessionId, host.state.focusedSessionId, host.state.focusedStoredSessionId,
    host.state.connectionId, host.state.profile].map(atom => atom.listen(queue))
  queue()
  ctx.onDispose(() => {
    observer.disconnect()
    contrast.removeEventListener('change', queue)
    for (const stop of unsubscribe) stop()
    if (frame) cancelAnimationFrame(frame)
    if (clockFrame) cancelAnimationFrame(clockFrame)
    if (timer) window.clearInterval(timer)
    for (const [group, state] of states) remove(group, state)
    syncThinkingLabels(thinkingLabels, false)
  })
}
