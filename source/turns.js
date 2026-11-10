import { host } from '@hermes/plugin-sdk'

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
  const units = isRussian() ? ['ч', 'мин', 'с'] : ['h', 'min', 's']
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .flatMap((value, index) => value || (index === 2 && seconds === 0) ? [`${value} ${units[index]}`] : [])
    .join(' ')
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
        const open = group.toggleAttribute('data-hcv-turn-folded') === false
        bar.setAttribute('aria-expanded', String(open))
      })
    }
    state.bar = bar
  }
  if (group.firstElementChild !== state.bar) group.prepend(state.bar)
  updateText(state.bar, elapsed
    ? isRussian() ? `Выполнено за ${elapsed}` : `Worked for ${elapsed}`
    : isRussian() ? 'Шаги работы' : 'Activity')
  group.toggleAttribute('data-hcv-turn-summary', Boolean(elapsed))

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
  const { row, time } = state.live
  const body = root.querySelector(answer)
  if (body && body.nextElementSibling !== row) body.after(row)
  const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000))
  updateText(time, seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
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

function sumLines(rows, className) {
  return rows.reduce((sum, row) => {
    const digits = row.querySelector(`[class~="${className}"]`)?.textContent.replace(/[^0-9]/g, '')
    return sum + (Number(digits) || 0)
  }, 0)
}

function clearFiles(state) {
  const files = state.files
  if (!files) return
  files.heading.remove()
  files.more.remove()
  files.checkpoint.remove()
  files.nativeTitle.removeAttribute('data-hcv-file-native-title')
  if (files.review.getAttribute('aria-label') === files.review.getAttribute('data-hcv-file-review')) {
    if (files.originalReviewLabel === null) files.review.removeAttribute('aria-label')
    else files.review.setAttribute('aria-label', files.originalReviewLabel)
  }
  files.review.removeAttribute('data-hcv-file-review')
  files.card.removeAttribute('data-hcv-file-card')
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
    const totals = make('span', 'files-totals')
    const added = make('span', 'files-added')
    const removed = make('span', 'files-removed')
    totals.append(added, removed)
    heading.append(name, totals)
    const more = make('button', 'files-more')
    more.type = 'button'
    more.setAttribute('aria-expanded', 'false')
    more.addEventListener('click', () => {
      more.setAttribute('aria-expanded', String(card.toggleAttribute('data-hcv-files-open')))
      updateMoreLabel(state.files)
    })
    const checkpoint = make('button', 'files-checkpoint')
    checkpoint.type = 'button'
    checkpoint.addEventListener('click', () => nativeCheckpoint(card)?.click())
    state.files = { card, nativeTitle, review, originalReviewLabel: review.getAttribute('aria-label'), heading, name, added, removed, more, checkpoint, remaining: 0 }
  }
  const { heading, name, added, removed, more, checkpoint } = state.files
  if (heading.parentElement !== header) nativeTitle.after(heading)
  const rows = [...list.querySelectorAll(':scope > button')]
  if (!rows.length) return clearFiles(state)
  card.setAttribute('data-hcv-file-card', '')
  nativeTitle.setAttribute('data-hcv-file-native-title', '')
  const reviewLabel = isRussian() ? 'Просмотреть изменения' : 'View changes'
  review.setAttribute('data-hcv-file-review', reviewLabel)
  review.setAttribute('aria-label', reviewLabel)
  const restore = nativeCheckpoint(card)
  if (restore) {
    updateText(checkpoint, isRussian() ? 'Чекпоинт' : 'Checkpoint')
    checkpoint.title = restore.getAttribute('aria-label')
    if (checkpoint.parentElement !== header) review.before(checkpoint)
  } else {
    checkpoint.remove()
  }
  const count = rows.length
  updateText(name, isRussian() ? `Изменено ${count} ${fileNoun(count)}` : `${count} ${fileNoun(count)} changed`)
  const plus = sumLines(rows, 'text-(--ui-green)')
  const minus = sumLines(rows, 'text-(--ui-red)')
  updateText(added, plus ? `+${plus}` : '')
  updateText(removed, minus ? `−${minus}` : '')
  if (card.toggleAttribute('data-hcv-files-foldable', count > 3)) {
    if (more.parentElement !== card) card.append(more)
    state.files.remaining = count - 3
    updateMoreLabel(state.files)
  } else {
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
  updateText(more, expanded
    ? isRussian() ? 'Свернуть список' : 'Show fewer files'
    : isRussian() ? `Показать ещё ${remaining} ${fileNoun(remaining)}` : `Show ${remaining} more ${fileNoun(remaining)}`)
}

function synchronize(group, state, now, tail, completedSeconds, startedAt) {
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

  const elapsed = formatDuration(durationSeconds(final?.querySelector(duration)?.textContent) ?? completedSeconds)
  if (!working && !blocked && final) {
    const steps = findSteps(group, roots, final)
    if (elapsed || steps.length) showSummary(group, state, steps, elapsed)
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
  let frame = 0
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
    states.delete(group)
  }

  function render() {
    frame = 0
    const enabled = contrast.matches && document.documentElement.matches(active)
    for (const [group, state] of states) if (!enabled || !group.isConnected) remove(group, state)
    if (enabled) {
      const now = Date.now()
      const groups = [...document.querySelectorAll(`[data-chat-surface] ${response}`)]
      const tailByTranscript = new Map(groups.map((group) => [group.closest(transcript), group]))
      const latestPrompt = new Map([...tailByTranscript.keys()].map((container) => [
        container, [...(container?.querySelectorAll('[data-slot="aui_user-message-root"]') || [])].at(-1),
      ]))
      for (const group of groups) {
        let state = states.get(group)
        if (!state) {
          state = { steps: new Set(), bar: null, live: null, files: null, startedAt: null }
          states.set(group, state)
        }
        const container = group.closest(transcript)
        const prompt = latestPrompt.get(container)
        const tail = tailByTranscript.get(container) === group &&
          (!prompt || !(group.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING))
        const ownPrompt = group.closest('[data-slot="aui_turn-pair"]')?.querySelector('[data-slot="aui_user-message-root"][data-message-id]')
        const runtime = group.closest(primary) && host.state.activeSessionId.get()
        const key = runtime && sessionKey(runtime)
        const timeKey = key && ownPrompt && JSON.stringify([key, ownPrompt.dataset.messageId])
        const last = tail && runtime && lastBySession.get(storedKey(runtime))
        const recorded = (timeKey && durations.get(timeKey)) || (last && last.text === promptText(ownPrompt) && last.seconds)
        const liveStart = key && started.get(key)
        synchronize(group, state, now, tail, recorded || null, liveStart?.at)
      }
    }
    syncThinkingLabels(thinkingLabels, enabled)
    if ([...states.values()].some((state) => state.live)) {
      if (!timer) timer = window.setInterval(queue, 1000)
    } else if (timer) {
      window.clearInterval(timer)
      timer = 0
    }
  }

  function queue() {
    if (!frame) frame = requestAnimationFrame(render)
  }

  const observer = new MutationObserver((records) => {
    if (records.some(({ target, type, addedNodes, removedNodes }) => {
      if (target === document.documentElement) return true
      if (!document.documentElement.matches(active)) return false
      const element = target instanceof Element ? target : target.parentElement
      if (!element || element.closest('[data-hcv-generated]')) return false
      if (type === 'characterData') return Boolean(element.closest(`${changes}, ${duration}`))
      if (type === 'attributes') return Boolean(target.closest(response))
      const nodes = [...addedNodes, ...removedNodes]
      if (nodes.some((node) => node.nodeType === Node.TEXT_NODE) && element.closest(`${changes}, ${duration}`)) return true
      return nodes.some((node) => node instanceof Element && !node.hasAttribute('data-hcv-generated') && (
        target.closest(response) || node.matches(`${response}, [data-slot="aui_user-message-root"]`) || node.querySelector(response)
      ))
    })) queue()
  })
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-message-streaming', 'data-hermes-theme', 'data-hermes-codex-visual', 'lang'],
  })
  contrast.addEventListener('change', queue)
  queue()
  ctx.onDispose(() => {
    observer.disconnect()
    contrast.removeEventListener('change', queue)
    if (frame) cancelAnimationFrame(frame)
    if (timer) window.clearInterval(timer)
    for (const [group, state] of states) remove(group, state)
    syncThinkingLabels(thinkingLabels, false)
  })
}
