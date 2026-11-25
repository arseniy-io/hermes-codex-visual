import { mountStyle } from './style-scope.js'
import { atom, host, useValue } from '@hermes/plugin-sdk'
import { createElement as h, useEffect } from 'react'
import { agentAvatars } from './agent-avatars.js'
import { agentDisplayName, createAgentNameRegistry } from './agent-display-name.js'
import { canonicalAgentReceipt, matchAgentReceipt } from './agent-receipt-matching.js'
import { nativeRenderedMessageRecord } from './native-rendered-message.js'
import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { AgentPane, agentPaneStyles } from './summary-agents.js'
import { SummarySection } from './summary-section.js'
import { tileTurnHistoryTarget } from './chat-tile-turn-history.js'
import { readFocusedSession } from './sidebar-session-state.js'
import { sameTileTarget, mergeTileAgent, tileRegistryKey, uniqueTileRoute } from './tile-agent-scope.js'

const surface = '[data-chat-surface]:not([data-hud-shell] *)'
const primary = surface + '[data-composer-target="main"][data-session-anchor="workspace"]'
const delegate = '[data-delegate-card]'
const response = '[data-slot="aui_response-group"]'
const transcript = '[data-slot="aui_thread-content"]'
const pair = '[data-slot="aui_turn-pair"]'
const prompt = '[data-slot="aui_user-message-root"][data-message-id]'
const generated = '[data-hcv-agent-rows]'
const agentAvatar = 'data-hcv-delegate-avatar'
const notice = '[data-slot="aui_system-message-root"] [data-slot="aui_background-result"]'
const final = (status) => ['completed', 'failed', 'interrupted'].includes(status)
const isActive = ({ status }) => status === 'running' || status === 'queued'
const tidy = (text) => typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
const prose = (text) => typeof text === 'string' ? text.trim() : ''
const duration = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const timestamp = (value) => Number.isFinite(value) && value > 0 ? value * (value < 1e12 ? 1000 : 1) : undefined
const noActivity = Object.freeze([])
const nameMetadata = value => ({
  taskName: tidy(value?.task_name || value?.taskName),
  agentPath: tidy(value?.agent_path || value?.agentPath),
})
const getPrompt = (turn) => turn?.querySelector(':scope > ' + prompt)?.dataset.messageId
const profile = (value) => tidy(value).toLowerCase() || 'default'
const scopeKey = (session, connection, name) => session && JSON.stringify([connection || null, profile(name), session])

const labels = {
  ru: {
    title: 'Субагенты', fallback: 'Субагент', more: (n) => 'ещё ' + n, open: 'Открыть список субагентов',
    started: ['начал(-и) работу'], running: 'В работе', queued: ['ожидает запуска'],
    dispatched: ['передан(-ы) в работу'], completed: ['завершил(-и) работу'],
    failed: ['завершил(-и) работу с ошибками'], interrupted: ['прервал(-и) работу'],
    status: { running: 'В работе', queued: 'В очереди', dispatched: 'Передано',
      completed: 'Готово', failed: 'Ошибка', interrupted: 'Прервано' },
  },
  en: {
    title: 'Subagents', fallback: 'Subagent', more: (n) => n + ' more', open: 'Open subagents list',
    started: ['started working', 'started working'], running: 'Working', queued: ['waiting to start', 'waiting to start'],
    dispatched: ['dispatched', 'dispatched'], completed: ['finished', 'finished'],
    failed: ['finished with errors', 'finished with errors'], interrupted: ['interrupted', 'interrupted'],
    status: { running: 'Working', queued: 'Queued', dispatched: 'Dispatched',
      completed: 'Done', failed: 'Failed', interrupted: 'Interrupted' },
  },
}
const language = () => document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru' : 'en'

const assetUrls = new Map()
function codexAvatarIndex(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (31 * hash + seed.charCodeAt(i)) % 0x7fffffff
  return hash % agentAvatars.length
}

function createAvatarRegistry() {
  const workers = new Map()
  const children = new Map()
  const used = new Set()
  return agent => {
    // A temporary goal match is not proof that this row belongs to the
    // observed worker, even if that worker already has a real child ID.
    if (agent.nameProvisional) return null
    const worker = tidy(agent.subagentId)
    const child = tidy(agent.childSession)
    const knownChild = child && children.get(child)
    const knownWorker = worker && workers.get(worker)
    // One confirmed child cannot belong to two different worker IDs. Treat
    // conflicting evidence as unknown instead of allocating another image.
    if ((worker && knownChild?.worker && knownChild.worker !== worker) ||
        (knownWorker && knownChild && knownWorker !== knownChild)) return null
    let entry = knownWorker || knownChild
    if (!entry && child) {
      const preferred = codexAvatarIndex(child)
      let index = preferred
      // Explicit user requirement: two agents in one chat should not share
      // an icon when a free one is available. Keep Codex's original choice
      // unless it is already taken; all views use this same assignment.
      for (let offset = 0; offset < agentAvatars.length; offset++) {
        const candidate = (preferred + offset) % agentAvatars.length
        if (!used.has(candidate)) { index = candidate; break }
      }
      entry = { seed: child, index, worker }
      used.add(index)
    }
    if (!entry) return null
    if (worker) { workers.set(worker, entry); entry.worker ||= worker }
    if (child && !children.has(child)) children.set(child, entry)
    return entry
  }
}

function avatarUrl(seed, dark, assignedIndex) {
  // Incomplete legacy records have no child identity; never invent a badge.
  if (!seed) return undefined
  const index = Number.isInteger(assignedIndex) && assignedIndex >= 0 && assignedIndex < agentAvatars.length
    ? assignedIndex : codexAvatarIndex(seed)
  const key = index * 2 + Number(!dark)
  if (!assetUrls.has(key)) {
    const svg = agentAvatars[index][dark ? 0 : 1]
    assetUrls.set(key, 'data:image/svg+xml,' + encodeURIComponent(svg))
  }
  return assetUrls.get(key)
}

function resultObject(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

function settledStatus(value) {
  const status = tidy(value)
  if (!status || ['ok', 'success', 'completed'].includes(status)) return 'completed'
  return ['interrupted', 'cancelled', 'canceled'].includes(status) ? 'interrupted' : 'failed'
}

function dispatchIds(result) {
  const ids = result?.subagent_ids
  const goals = result?.goals
  if (result?.status !== 'dispatched' || !Array.isArray(ids) || !Array.isArray(goals)) return new Map()
  const refused = new Set(Array.isArray(result.refused) ? result.refused.map(entry => entry?.task_index) : [])
  const indexes = Array.from(goals.keys()).filter(index => !refused.has(index))
  const cleanIds = ids.map(tidy)
  return indexes.length === ids.length && cleanIds.every(Boolean) && new Set(cleanIds).size === cleanIds.length
    ? new Map(indexes.map((index, i) => [index, cleanIds[i]])) : new Map()
}

function readCard(card, cardIndex) {
  // Hermes's DelegateTool hydrates from the tool result and overlays the live
  // subagent state. Use the tool and child ids across renderer remounts.
  const call = committedFiber(card)?.return?.memoizedProps
  const callId = tidy(call?.toolCallId)
  const args = resultObject(call?.args)
  const result = resultObject(call?.result)
  const savedIds = dispatchIds(result)
  const results = Array.isArray(result?.results) ? result.results.map(resultObject) : []
  const turnId = getPrompt(card.closest(pair))
  return [...card.children].flatMap((entry, index) => {
    const scaffold = entry.querySelector(':scope > [data-conversation-scaffold]')
    const button = scaffold?.querySelector(':scope > button')
    const glyph = scaffold?.firstElementChild
    if (!button || !glyph) return []
    const task = args?.tasks?.[index] || (index === 0 ? args : null)
    const goal = tidy(task?.goal) || tidy(button.textContent)
    const ambiguousGoal = Array.isArray(args?.tasks) && args.tasks.filter(task => tidy(task?.goal) === goal).length > 1
    const native = committedFiber(entry)?.return?.memoizedProps?.row
    const stored = results.find(row => row?.task_index === index) ??
      (results[index]?.task_index == null ? results[index] : null)
    const refused = Array.isArray(result?.refused) && result.refused.find(row => row?.task_index === index)
    const outcome = stored || refused
    // A native live row can be overlaid on an older call with the same goal.
    // Keep the completed call's own result until an event is matched to it.
    const status = outcome ? settledStatus(outcome.status) : native?.status || (glyph.querySelector('[role="status"]') ? 'running'
      : glyph.querySelector('svg.text-destructive') ? 'failed'
        : glyph.querySelector('svg[aria-label]') ? 'completed' : 'dispatched')
    const nativeSession = tidy(native?.sessionId)
    const childSession = tidy(stored?.child_session_id || stored?.session_id) || (!stored ? nativeSession : '')
    const subagentId = tidy(stored?.subagent_id) || savedIds.get(index)
    const supplied = nameMetadata(task)
    const saved = nameMetadata(stored)
    const taskName = saved.taskName || tidy(result?.task_names?.[index]) || supplied.taskName
    const agentPath = saved.agentPath || tidy(result?.agent_paths?.[index]) || supplied.agentPath
    const seed = JSON.stringify(callId ? [callId, index] : [turnId, cardIndex, index, goal])
    return [{
      id: subagentId || seed, seed, delegationId: tidy(result?.delegation_id), taskIndex: index, nativeId: tidy(native?.id), nativeSession, goal, taskName, agentPath, ambiguousGoal, status, childSession, subagentId,
      model: tidy(stored ? stored.model : native?.model),
      durationSeconds: duration(stored ? stored.duration_seconds : native?.durationSeconds),
      effort: tidy(stored?.reasoning_effort),
      summary: prose(outcome?.summary) || prose(outcome?.error),
      activity: noActivity,
      started: status === 'running' || status === 'completed',
      button, canOpen: !button.disabled && (!stored || Boolean(childSession && nativeSession === childSession)),
    }]
  })
}

function applyStoredReceipts(rowsByCard, markReceipt, historyForSurface) {
  // The async dispatch result only records "dispatched". Hermes writes the
  // actual outcome as a system result later, including the original goals.
  // Use an exact, unambiguous match in the same transcript. Mixed batches
  // without per-agent outcomes keep the native result visible.
  const receipts = [...document.querySelectorAll(surface + ' ' + transcript + ' ' + notice)]
    .map(node => [node, tidy(node.querySelector('[data-conversation-scaffold] span.truncate')?.textContent)])
  const decisions = receipts.map(([target, heading]) => {
    const history = historyForSurface?.(target.closest(surface))
    const source = history && nativeRenderedMessageRecord(target)
    const owner = history?.scope && JSON.parse(history.scope)
    const owns = source && owner && source.runtimeId === owner[2] &&
      [history.sessionId, history.requestedSessionId].filter(Boolean).includes(source.storedId)
    const canonical = owns && canonicalAgentReceipt(source.rowId, history.receipts)
    if (!canonical) return [target, matchAgentReceipt(target, heading, rowsByCard, receipts)]
    const cards = [...rowsByCard].filter(([card, entries]) =>
      card.closest(transcript) === target.closest(transcript) &&
      entries.every(row => row.delegationId === canonical.delegation_id))
    const saved = cards.length === 1 ? cards[0][1] : []
    const entries = canonical.agents.map(metadata => {
      const id = metadata.subagent_id
      const existing = saved.find(row => row.subagentId === id ||
        (!row.subagentId && row.taskIndex === metadata.task_index))
      return Object.assign(existing || { seed: id, goal: '', activity: noActivity, started: false }, {
        id, subagentId: id, delegationId: canonical.delegation_id, taskIndex: metadata.task_index,
        taskName: nameMetadata(metadata).taskName || existing?.taskName || '',
        agentPath: nameMetadata(metadata).agentPath || existing?.agentPath || '', status: metadata.status,
        childSession: tidy(metadata.child_session_id) || existing?.childSession || '',
        lifecycleChild: Boolean(metadata.child_session_id || existing?.lifecycleChild),
      })
    })
    return [target, { count: entries.length, entries, canonical: true }]
  })
  for (const [target, match] of decisions) {
    if (!match) continue
    const { outcome, count, entries } = match
    markReceipt(target, entries)
    const receipt = committedFiber(target)?.return?.memoizedProps
    const receiptButton = target.querySelector('[data-conversation-scaffold] button')
    const dateTime = target.querySelector('time[datetime]')?.dateTime
    for (const row of entries) {
      if (!match.canonical) row.status = outcome === 'Completed' ? 'completed'
        : outcome === 'Cancelled' || outcome === 'Interrupted' ? 'interrupted' : 'failed'
      row.finishedAt = dateTime ? timestamp(Date.parse(dateTime)) : undefined
      if (count === 1 && !row.summary) row.summary = prose(receipt?.report)
      row.receiptButton = receiptButton
      row.receiptMatched = true
    }
  }
}

function eventStatus(event, previous) {
  if (event.type === 'subagent.spawn_requested') return 'queued'
  if (event.type === 'subagent.start') return 'running'
  if (event.type !== 'subagent.complete') return previous?.started ? previous.status : 'running'
  const value = event.payload.status
  if (['completed', 'ok', 'success'].includes(value)) return 'completed'
  if (['interrupted', 'cancelled', 'canceled'].includes(value)) return 'interrupted'
  return 'failed'
}

function eventActivity(event, previous) {
  const activity = previous?.activity || noActivity
  const { payload, type } = event
  const additions = []
  if (type === 'subagent.tool' || type === 'subagent.progress') {
    const tool = tidy(payload.tool_name)
    const text = tidy(payload.tool_preview || payload.text)
    if (tool || text) additions.push(tool && text && tool !== text ? tool + ' · ' + text : text || tool)
  }
  if (type === 'subagent.complete' && Array.isArray(payload.output_tail)) {
    for (const item of payload.output_tail) {
      const text = tidy(item?.preview)
      const tool = tidy(item?.tool)
      if (tool || text) additions.push([tool, text].filter(Boolean).join(' · '))
    }
  }
  const next = [...activity]
  for (const text of additions) {
    const line = text.slice(0, 1000)
    if (next.at(-1) !== line) next.push(line)
  }
  return next.length === activity.length ? activity : next.slice(-24)
}

function activityRows(state, agents) {
  state.started ??= new Set()
  return agents.flatMap(agent => {
    const key = agent.seed
    if (agent.startAnchor) state.started.add(key)
    const rows = state.started.has(key) ? [{ agent, kind: 'started' }] : []
    // Dispatched/queued is a roster state, not a witnessed Codex start.
    // A stored final outcome can stand alone; never manufacture its launch.
    if (final(agent.status) && !agent.receiptMatched && !agent.finishAnchor) rows.push({ agent, kind: agent.status })
    return rows
  })
}

function activitySignature(agents, lang, dark) {
  return JSON.stringify([lang, dark, agents.map(({ id, seed, visualSeed, visualIndex, goal, displayName, status, started, receiptMatched }) =>
    [id, seed, visualSeed, visualIndex, goal, displayName, status, started, receiptMatched])])
}

function renderActivity(state, agents, lang, dark, events = activityRows(state, agents), openAgent) {
  const signature = JSON.stringify([activitySignature(agents, lang, dark), events.map(({ agent, kind }) => [agent.id, kind])])
  if (signature === state.signature) return
  state.signature = signature
  const copy = labels[lang]
  // AQ20 groups consecutive activity at one transcript anchor into ONE
  // localized sentence, keeping each named agent as its own action.
  const groups = []
  for (const event of events) {
    const prior = groups.at(-1)
    if (prior?.kind === event.kind) prior.agents.push(event.agent)
    else groups.push({ kind: event.kind, agents: [event.agent] })
  }
  const rows = groups.map(({ kind, agents }) => {
    const row = document.createElement('span')
    row.setAttribute('data-hcv-agent-activity', kind)
    row.setAttribute('data-hcv-agent-id', agents[0].id)
    row.setAttribute('data-hcv-agent-ids', JSON.stringify(agents.map(agent => agent.id)))
    const named = agents.length > 3 ? 2 : agents.length
    const open = agent => openAgent?.(agent.id)
    const canOpen = agent => openAgent && Boolean(agent.subagentId || agent.childSession || agent.summary || agent.goal)
    const action = (agent, text, avatar = false) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-hcv-agent-link', agent.id)
      button.setAttribute('aria-label', lang === 'ru' ? 'Открыть субагента ' + text : 'Open ' + text + ' subagent')
      if (avatar) button.title = text
      button.addEventListener('click', () => open(agent))
      return button
    }
    const icons = document.createElement('span')
    icons.setAttribute('data-hcv-agent-icons', '')
    for (const [index, agent] of agents.slice(0, 4).entries()) {
      const url = avatarUrl(agent.visualSeed, dark, agent.visualIndex)
      if (!url) continue // Legacy data has no child identity; never make a broken image.
      const image = document.createElement('img')
      image.src = url
      image.alt = ''
      image.draggable = false
      image.setAttribute('aria-hidden', 'true')
      if (index >= named && canOpen(agent)) {
        const button = action(agent, agentDisplayName(agent, copy.fallback), true)
        button.append(image)
        icons.append(button)
      } else icons.append(image)
    }
    if (icons.childElementCount) row.append(icons)
    const sentence = document.createElement('span')
    sentence.setAttribute('data-hcv-agent-sentence', '')
    const names = agents.slice(0, named).map((agent, index) => {
      const text = agentDisplayName(agent, copy.fallback)
      const name = canOpen(agent) ? action(agent, text) : document.createElement('span')
      name.setAttribute('data-hcv-agent-name', '')
      name.textContent = text
      return name
    })
    names.forEach((name, index) => {
      if (index) sentence.append(document.createTextNode(index === names.length - 1 && agents.length <= 3
        ? (lang === 'ru' ? ' и ' : ' and ') : ', '))
      sentence.append(name)
    })
    if (agents.length > 3) {
      sentence.append(document.createTextNode(lang === 'ru' ? ' и ' : ' and '))
      const more = document.createElement('button')
      more.type = 'button'
      more.setAttribute('data-hcv-agent-overflow', '')
      more.textContent = copy.more(agents.length - named)
      more.addEventListener('click', () => openAgent?.(null))
      sentence.append(more)
    }
    sentence.append(document.createTextNode(' ' + copy[kind][0]))
    row.append(sentence)
    return row
  })
  state.rows.replaceChildren(...rows)
}

// Loading and thinking placeholders may disappear when a reply is sealed.
// Anchor lifecycle rows to durable transcript content instead.
const timelinePart = '.aui-md, [data-slot="tool-block"]'
const messageRoot = '[data-slot="aui_assistant-message-root"]'
const messageBody = '[data-slot="aui_assistant-message-content"]'
const nativeParts = body => [...body.children].filter(node => node.matches(timelinePart))

// Lifecycle frames do not have native transcript rows. Keep their observed
// position relative to a native message part, rather than appending the latest
// status to the end of the whole response. A replay with no observed position
// belongs in the roster until a stored tool/receipt supplies its location.
function captureActivityAnchor() {
  const turn = [...document.querySelectorAll(primary + ' ' + transcript + ' ' + pair)].at(-1)
  const turnId = getPrompt(turn)
  if (!turnId) return null
  const messages = [...turn.querySelectorAll(response + ' > ' + messageRoot)]
  for (let index = messages.length - 1; index >= 0; index--) {
    const body = messages[index].querySelector(':scope > ' + messageBody)
    const parts = body && nativeParts(body)
    if (parts?.length) return { turn: turnId, message: messages[index].dataset.messageId || null, index, part: parts.length - 1 }
  }
  return { turn: turnId, index: -1, part: -1 }
}

function activityAnchorTarget(anchor) {
  if (!anchor) return null
  const turn = [...document.querySelectorAll(primary + ' ' + transcript + ' ' + pair)].find(node => getPrompt(node) === anchor.turn)
  if (!turn) return null
  if (anchor.index < 0) {
    const group = turn.querySelector(response)
    return group && { parent: group, after: null }
  }
  const messages = [...turn.querySelectorAll(response + ' > ' + messageRoot)]
  const message = anchor.message ? messages.find(node => node.dataset.messageId === anchor.message) : messages[anchor.index]
  const body = message?.querySelector(':scope > ' + messageBody)
  const after = body && nativeParts(body)[anchor.part]
  return after && { parent: body, after }
}

function placeActivityRows(rows, anchor) {
  const target = activityAnchorTarget(anchor)
  if (!target) return false
  const { parent, after } = target
  if (after ? after.nextElementSibling !== rows : parent.firstElementChild !== rows) parent.insertBefore(rows, after ? after.nextSibling : parent.firstChild)
  return true
}

function enhanceReceipt(target) {
  const rows = document.createElement('div')
  rows.setAttribute('data-hcv-agent-rows', '')
  target.prepend(rows)
  target.setAttribute('data-hcv-agent-receipt', '')
  return { rows, remove() { rows.remove(); target.removeAttribute('data-hcv-agent-receipt') } }
}

function enhanceCard(card) {
  const rows = document.createElement('div')
  rows.setAttribute('data-hcv-agent-rows', '')
  card.setAttribute('data-hcv-agent-native-card', '')
  card.before(rows)
  return { rows, glyphs: new Map(), remove() {
    rows.remove()
    card.removeAttribute('data-hcv-agent-native-card')
    for (const glyph of this.glyphs.keys()) {
      glyph.removeAttribute(agentAvatar)
      glyph.style.removeProperty('--hcv-delegate-avatar')
    }
  } }
}

function styleDelegateRows(state, agents, dark) {
  const previous = state.glyphs
  const next = new Map()
  for (const { button, visualSeed, visualIndex } of agents) {
    const glyph = button.previousElementSibling
    if (!glyph) continue
    const image = avatarUrl(visualSeed, dark, visualIndex)
    if (!image) continue
    if (previous.get(glyph) !== image) {
      glyph.setAttribute(agentAvatar, '')
      glyph.style.setProperty('--hcv-delegate-avatar', 'url("' + image + '")')
    }
    next.set(glyph, image)
  }
  for (const glyph of previous.keys()) {
    if (next.has(glyph)) continue
    glyph.removeAttribute(agentAvatar)
    glyph.style.removeProperty('--hcv-delegate-avatar')
  }
  state.glyphs = next
}

function nativeWatchOwner(agent, scope) {
  if (!agent.lifecycleChild || !agent.childSession || !scope || typeof window.hermesDesktop?.openSessionWindow !== 'function') return null
  const [connectionId, owner, parent] = JSON.parse(scope)
  // Desktop 0.23.1 passes both owner fields through the raw window bridge.
  // Keep the route captured with the canonical child, including explicit local.
  return typeof connectionId === 'string' && connectionId && typeof owner === 'string' && owner &&
    agent.childSession !== parent ? { connectionId, profile: owner } : null
}

function nativeActions(agent, scope) {
  return [
    (agent.canOpen || nativeWatchOwner(agent, scope)) && 'native',
    agent.receiptButton && 'receipt',
  ].filter(Boolean)
}

function openNativeAgent(agent, scope, action = 'native') {
  if (!scope || scope !== scopeKey(host.state.activeSessionId.get(), host.state.connectionId.get(), host.state.profile.get())) return
  if (action === 'native') {
    if (agent.canOpen && agent.button?.isConnected && !agent.button.disabled) {
      agent.button.click()
      return
    }
    const owner = nativeWatchOwner(agent, scope)
    if (owner) {
      const errorTitle = language() === 'ru' ? 'Не удалось открыть подробности субагента' : 'Could not open subagent details'
      void window.hermesDesktop.openSessionWindow(agent.childSession, { ...owner, watch: true }).then(result => {
        if (!result?.ok) throw new Error(result?.error || errorTitle)
      }).catch(error => host.notifyError(error, errorTitle))
      return
    }
  }
  const receipt = agent.receiptButton
  if (receipt?.isConnected) {
    if (receipt.getAttribute('aria-expanded') !== 'true') receipt.click()
    receipt.scrollIntoView({ block: 'nearest' })
  }
}

function useScopedRoster(roster, focus) {
  const value = useValue(roster)
  const session = useValue(host.state.activeSessionId)
  const connection = useValue(host.state.connectionId)
  const name = useValue(host.state.profile)
  const scope = scopeKey(session, connection, name)
  const tileValues = useValue(roster.tiles)
  if (focus?.view.kind === 'tile') {
    const target = tileTurnHistoryTarget(focus.surface)
    const tile = tileValues.get(focus.surface)
    if (target && target.view === focus.view && target.sessionId === focus.storedId &&
        target.runtimeId === focus.runtimeId && target.connectionId === focus.owner.connectionId &&
        target.profile === focus.owner.profile && tile && sameTileTarget(tile.target, target)) return tile
    return { ...value, scope: null, agents: [], target: null }
  }
  return value.scope === scope ? value : { ...value, scope, agents: [] }
}

function useTileRefresh(roster, value, gateway) {
  const target = value.target
  useEffect(() => {
    if (!target || gateway !== 'open') return
    const refresh = () => { if (document.visibilityState !== 'hidden') void roster.refreshTile(target) }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => window.clearInterval(timer)
  }, [roster, target?.surface, target?.view, target?.runtimeId, target?.sessionId, target?.connectionId, target?.profile, gateway])
}

export function SubagentsPane({ roster, focus }) {
  const value = useScopedRoster(roster, focus)
  const gateway = useValue(host.state.gateway)
  useTileRefresh(roster, value, gateway)
  useEffect(() => {
    if (!value.target && value.scope && gateway === 'open') void roster.refresh(value.scope)
  }, [roster, value.scope, value.target, gateway])
  const selection = useValue(roster.selection)
  const tileSelection = useValue(roster.tileSelection)
  if (value.target) {
    const target = value.target
    const current = () => roster.isCurrentTile(target)
    return h(AgentPane, { ...value, key: JSON.stringify([value.scope, target.sessionId]), avatarUrl,
      nativeActions: () => [], openNativeAgent: () => {},
      tileOwner: { isCurrent: current, storedId: target.sessionId, surface: target.surface, view: target.view,
        connectionId: target.connectionId, profile: target.profile },
      selection: tileSelection?.surface === target.surface && tileSelection?.sessionId === target.sessionId &&
        tileSelection?.scope === value.scope ? tileSelection : null,
      selectAgent: id => roster.selectTileAgent(target, id) })
  }
  return h(AgentPane, { ...value, key: value.scope ?? 'draft', avatarUrl, nativeActions, openNativeAgent,
    onIdentity: roster.recordIdentity,
    selection, selectAgent: id => roster.selectAgent(id) })
}

export function SummarySubagents({ roster, onExpand, disclosure, focus }) {
  const value = useScopedRoster(roster, focus)
  const gateway = useValue(host.state.gateway)
  useTileRefresh(roster, value, gateway)
  if (!value.agents.length) return null
  const { agents, lang, dark } = value
  const copy = labels[lang]
  const working = agents.filter(isActive)
  const done = agents.filter(({ status }) => status === 'completed')
  const other = agents.filter(({ status }) => status === 'dispatched')
  const issues = agents.filter(({ status }) => status === 'failed' || status === 'interrupted')
  const preview = (working.length ? working : done.length ? done : other.length ? other : issues).slice(0, 4)
  const counts = [
    [copy.running, working], [copy.status.completed, done], [copy.status.dispatched, other],
    [lang === 'ru' ? 'Ошибки и остановки' : 'Errors and interruptions', issues],
  ].filter(([, list]) => list.length).map(([label, list]) => label + ': ' + list.length)
  const image = agent => {
    const src = avatarUrl(agent.visualSeed, dark, agent.visualIndex)
    return src ? h('img', { key: agent.id, src, alt: '', draggable: false }) : null
  }
  const previewContent = [
    h('span', { key: 'avatars', 'data-hcv-agent-icons': '', 'aria-hidden': true }, preview.map(image)),
    h('span', { key: 'status', role: 'status', 'data-hcv-agent-counts': '' }, counts.join(' · ')),
  ]
  return h(SummarySection, { ...disclosure, kind: 'agents', title: copy.title, 'data-hcv-summary-agents': '' },
    h('button', { type: 'button', className: 'hcv-context-row', title: copy.open,
      'aria-label': copy.open, 'data-hcv-open-subagents': '', onClick: onExpand }, previewContent))
}

function css(active) {
  const chat = active + ' ' + surface
  const card = active + ' [data-hcv-context-card] [data-hcv-summary-agents]'
  const rows = chat + ' ' + generated
  const native = rows + ' + ' + delegate
  const task = native + ' > div'
  const line = task + ' > [data-conversation-scaffold]'
  const glyph = line + ' > [' + agentAvatar + ']'
  return [
    '@media (forced-colors: none) {',
    rows + ' { display: grid; gap: 16px; min-inline-size: 0; }',
    rows + ':empty { display: none; }',
    chat + ' [data-hcv-agent-native-card] { display: none; }',
    rows + ' [data-hcv-agent-activity] { display: flex; align-items: flex-start; gap: 6px; min-inline-size: 0; color: var(--hcv-activity-text); font-size: var(--hcv-activity-font); font-weight: 430; line-height: 20px; user-select: none; }',
    rows + ' [data-hcv-agent-sentence] { min-inline-size: 0; overflow-wrap: break-word; }',
    rows + ' :is([data-hcv-agent-link], [data-hcv-agent-overflow]) { display: inline; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; border-radius: 2px; cursor: pointer; }',
    rows + ' :is([data-hcv-agent-link], [data-hcv-agent-overflow]):hover { color: var(--hcv-activity-foreground, light-dark(#1a1c1f, #dfdfdf)); }',
    rows + ' :is([data-hcv-agent-link], [data-hcv-agent-overflow]):focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 0; }',
    active + ' [data-hcv-agent-icons] { display: inline-flex; flex: none; align-items: center; align-self: flex-start; gap: 4px; min-block-size: var(--conversation-line-height, 21px); }',
    active + ' [data-hcv-agent-icons] img { inline-size: .875rem; block-size: .875rem; flex: none; }',
    rows + ' [data-hcv-agent-icons] { gap: 6px; min-block-size: 20px; }',
    rows + ' [data-hcv-agent-icons] img { inline-size: 16px; block-size: 16px; }',
    chat + ' [data-hcv-agent-receipt] { padding-block: 0; }',
    chat + ' [data-hcv-agent-receipt] > [data-conversation-scaffold] { display: none; }',
    native + ' { gap: 4px; margin-block-start: 12px; margin-inline-start: 8px; padding-inline-start: 16px; border-inline-start: 1px solid var(--hcv-activity-border); }',
    task + ' { padding: 0; border: 0; border-radius: 0; }',
    line + ' { opacity: 1; gap: 4px; --conversation-tool-font-size: var(--hcv-activity-font); --conversation-scaffold-text: var(--hcv-activity-text); }',
    line + ' > .codicon-agent { display: none; }',
    line + ' > button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; border-radius: 6px; }',
    glyph + ' { position: relative; inline-size: 16px; block-size: 16px; }',
    glyph + ':not(:has([role="status"], svg.text-destructive)) { background: var(--hcv-delegate-avatar) center / contain no-repeat; }',
    glyph + ':not(:has([role="status"], svg.text-destructive)) > * { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; }',
    card + ' button[data-hcv-open-subagents] { position: relative; isolation: isolate; gap: 6px; color: var(--hcv-muted); padding: 0; }',
    card + ' button[data-hcv-open-subagents]:is(:hover, :focus-visible) { background: none; color: var(--hcv-activity-foreground, light-dark(#1a1c1f, #dfdfdf)); }',
    card + ' button[data-hcv-open-subagents]:is(:hover, :focus-visible)::before { content: ""; position: absolute; z-index: -1; inset: 0 -8px; border-radius: 8px; background: var(--hcv-summary-row-hover); }',
    card + ' [data-hcv-agent-icons] { align-self: center; }',
    card + ' [data-hcv-agent-counts] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    card + ' [data-hcv-open-subagents]::after { content: ""; margin-inline-start: auto; flex: none; inline-size: 14px; block-size: 14px; background: currentColor; mask: ' + codexMask('right') + ' center / contain no-repeat; opacity: 0; }',
    card + ' [data-hcv-open-subagents]:is(:hover, :focus-visible)::after { opacity: 1; }',
    rows + ':focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }',
    '}',
  ].join('\n') + agentPaneStyles(active)
}

export function registerSubagents(ctx, active, history) {
  const empty = { scope: null, agents: [], lang: 'en', dark: false }
  const selection = atom(null)
  const tiles = atom(new Map())
  const tileSelection = atom(null)
  const roster = Object.assign(atom(empty), { refresh, selection, tiles, tileSelection, refreshTile, isCurrentTile,
    selectTileAgent(target, id) {
      if (isCurrentTile(target)) tileSelection.set({ surface: target.surface, sessionId: target.sessionId,
        scope: tileScope(target), id })
    },
    openTileAgent(target, id) {
      // Native focus can commit between pointerdown and the click bubbling.
      requestAnimationFrame(() => {
        if (!isCurrentTile(target)) return
        roster.selectTileAgent(target, id)
        roster.revealAgentPane?.()
      })
    },
    recordIdentity(owner, id, child) {
      if (disposed || !enabled() || !owner || owner !== getScope() || !id || !child || child === JSON.parse(owner)[2]) return
      const key = identityKey(owner, id)
      if (childIdentities.get(key)?.childSession === child) return
      childIdentities.set(key, { ...childIdentities.get(key), childSession: child })
      while (childIdentities.size > 1000) childIdentities.delete(childIdentities.keys().next().value)
      queue()
    },
    selectAgent(id) { selection.set({ scope: getScope(), id }) },
    openAgent(id) { roster.selectAgent(id); roster.revealAgentPane?.() },
  })
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const enabled = () => root.matches(active)
  const getScope = () => scopeKey(host.state.activeSessionId.get(), host.state.connectionId.get(), host.state.profile.get())
  const sheet = document.createElement('style')
  sheet.setAttribute('data-hcv-subagents-style', '')
  sheet.textContent = css(active)
  mountStyle(ctx, sheet, { surface: '[data-hcv-agent-rows], [data-hcv-agent-icons], [data-hcv-summary-agents], [data-hcv-subagents-pane], [data-hcv-delegate-avatar], [data-hcv-agent-receipt]' })

  const cards = new Map()
  const runtimeAgents = new Map()
  const tileEvents = new Map()
  const tileSnapshots = new Map()
  const tileReads = new Map()
  const eventVersions = new Map()
  const extra = new Map()
  const markedReceipts = new Map()
  const nameRegistries = new Map()
  const avatarRegistries = new Map()
  let eventOrder = 0
  let frame = 0
  let rosterSignature = ''
  let snapshot = null
  let reading = null
  let disposed = false
  const childIdentities = new Map()
  const identityReads = new Map()
  const identityTargets = new Map()
  let identityScope = null
  let currentIdentityTargets
  const queue = () => { if (!frame) frame = requestAnimationFrame(reconcile) }
  const identityKey = (owner, id) => JSON.stringify([owner, id])
  const identityUnavailable = key => childIdentities.set(key, { retryAfter: Date.now() + 15000 })
  const identityOwnerCurrent = request => !disposed && !request.cancelled && enabled() &&
    request.scope === getScope() && identityReads.get(request.key) === request
  async function hydrateIdentity(owner, id) {
    const key = identityKey(owner, id)
    const cached = childIdentities.get(key)
    if (!id || owner !== getScope() || cached?.childSession || cached?.retryAfter > Date.now() ||
        identityReads.has(key) || !enabled()) return
    const request = { key, scope: owner }
    identityReads.set(key, request)
    try {
      const [connectionId, profile, parent] = JSON.parse(owner)
      const stored = host.state.focusedSessionId?.get() === parent ? host.state.focusedStoredSessionId?.get() : null
      const route = connectionId && connectionId !== 'local' && typeof host.profileRoutes === 'function'
        ? (await host.profileRoutes()).find(item => item.connectionId === connectionId &&
          (tidy(item.profile).toLowerCase() || 'default') === profile) : null
      if (!identityOwnerCurrent(request)) return
      const params = { session_id: stored || parent, profile: route?.targetProfile ?? profile,
        subagent_id: id, order: 'oldest', limit: 1 }
      const result = route && typeof host.requestProfile === 'function'
        ? await host.requestProfile(route, 'session.transcript', params, 5000)
        : await host.request('session.transcript', params, 5000)
      if (!identityOwnerCurrent(request)) return
      const child = tidy(result?.child_session_id)
      // available is the owning gateway's ancestry check. No result body,
      // goal, unrelated session lookup or guessed identifier can replace it.
      if (result?.available === true && result.subagent_id === id && child && child !== parent && child !== stored) {
        childIdentities.set(key, { childSession: child, ...nameMetadata(result) })
        if (childIdentities.size > 1000) childIdentities.delete(childIdentities.keys().next().value)
        queue()
      } else identityUnavailable(key)
    } catch {
      if (identityOwnerCurrent(request)) identityUnavailable(key)
    } finally {
      if (identityReads.get(key) === request) identityReads.delete(key)
      while (childIdentities.size > 1000) childIdentities.delete(childIdentities.keys().next().value)
    }
  }
  const childVisibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const value = identityTargets.get(entry.target)
      if (value) value.intersecting = entry.isIntersecting
      if (!entry.isIntersecting || !value || !entry.target.isConnected ||
          document.visibilityState === 'hidden' || !entry.target.checkVisibility({ visibilityProperty: true })) continue
      for (const id of value.ids) void hydrateIdentity(value.scope, id)
    }
  }) : null
  function watchIdentityRows(state, agents, owner) {
    if (!childVisibility || owner !== getScope()) return
    const ids = agents.filter(agent => agent.subagentId &&
      (!agent.childSession || (final(agent.status) && !agentDisplayName({ ...nameMetadata(agent),
        displayName: agent.suppliedDisplayName, agentNickname: agent.agentNickname }))))
      .map(agent => agent.subagentId).filter(id => !childIdentities.get(identityKey(owner, id))?.childSession)
    if (!ids.length) return
    currentIdentityTargets.add(state.rows)
    identityTargets.set(state.rows, { scope: owner, ids, intersecting: identityTargets.get(state.rows)?.intersecting })
    childVisibility.observe(state.rows)
  }
  const resumeVisibleIdentityReads = () => {
    if (document.visibilityState === 'hidden') return
    for (const [target, value] of identityTargets) {
      if (value.intersecting && target.isConnected && target.checkVisibility({ visibilityProperty: true })) {
        for (const id of value.ids) void hydrateIdentity(value.scope, id)
      }
    }
  }
  document.addEventListener('visibilitychange', resumeVisibleIdentityReads)
  const stopIdentityGateway = host.state.gateway?.subscribe(status => {
    if (status !== 'open') return
    // An authority restart can restore data that was temporarily unavailable.
    // Retry negatives on this explicit state change or later visibility, never
    // a timer loop while the same row remains on screen.
    const owner = getScope()
    for (const [key, entry] of childIdentities) {
      if (entry?.retryAfter && JSON.parse(key)[0] === owner) childIdentities.delete(key)
    }
    resumeVisibleIdentityReads()
  }) || (() => {})
  const cancelIdentityReads = () => {
    for (const request of identityReads.values()) request.cancelled = true
    identityReads.clear()
    for (const target of identityTargets.keys()) childVisibility?.unobserve(target)
    identityTargets.clear()
  }
  const nameFor = (owner, agent, lang) => {
    const canonical = agent.subagentId && childIdentities.get(identityKey(owner, agent.subagentId))
    if (canonical?.childSession) {
      agent.childSession ||= canonical.childSession
      agent.lifecycleChild = Boolean(agent.childSession)
      agent.taskName ||= canonical.taskName
      agent.agentPath ||= canonical.agentPath
    }
    const supplied = { taskName: agent.taskName, agentPath: agent.agentPath,
      displayName: agent.suppliedDisplayName, agentNickname: agent.agentNickname }
    if (!avatarRegistries.has(owner)) avatarRegistries.set(owner, createAvatarRegistry())
    if (avatarRegistries.size > 32) avatarRegistries.delete(avatarRegistries.keys().next().value)
    const avatar = avatarRegistries.get(owner)(agent)
    agent.visualSeed = avatar?.seed
    agent.visualIndex = avatar?.index
    // A still-streaming native card has no child identity yet. Do not reserve
    // a second name for the same worker before its real start/dispatch arrives.
    if (agent.button && agent.id === agent.seed && !agent.subagentId && !final(agent.status)) {
      return agentDisplayName(supplied, labels[lang].fallback)
    }
    if (!nameRegistries.has(owner)) nameRegistries.set(owner, createAgentNameRegistry())
    if (nameRegistries.size > 32) nameRegistries.delete(nameRegistries.keys().next().value)
    // A match by goal is provisional. Only an exact dispatch/child id may
    // permanently join the card's name to that child's identity.
    const identity = { ...supplied, id: agent.id, subagentId: agent.subagentId,
      ...(!agent.nameProvisional && { seed: agent.seed }) }
    const resolve = nameRegistries.get(owner)
    const name = resolve(identity, labels[lang].fallback)
    return name
  }

  const tileScope = target => target && scopeKey(target.runtimeId || target.sessionId, target.connectionId, target.profile)
  function isCurrentTile(target) {
    if (disposed || !enabled() || !target?.surface?.isConnected || target.surface.closest('[inert]')) return false
    const current = tileTurnHistoryTarget(target.surface)
    const focus = readFocusedSession({ state: host.state })
    return sameTileTarget(target, current) && focus?.surface === target.surface && focus.view === target.view &&
      focus.storedId === target.sessionId && focus.runtimeId === target.runtimeId &&
      focus.owner?.connectionId === target.connectionId && focus.owner?.profile === target.profile
  }

  async function refreshTile(target) {
    if (!target?.runtimeId || !isCurrentTile(target) || tileReads.has(target.surface) ||
        typeof host.requestProfile !== 'function' || typeof host.profileRoutes !== 'function') return
    const ownerKey = tileScope(target)
    const request = { target, version: eventVersions.get(ownerKey) || 0 }
    tileReads.set(target.surface, request)
    try {
      const routes = await host.profileRoutes()
      if (!isCurrentTile(target) || tileReads.get(target.surface) !== request ||
          request.version !== (eventVersions.get(ownerKey) || 0)) return
      const route = uniqueTileRoute(routes, target)
      if (!route) return
      const result = await host.requestProfile(route, 'subagent.list', { session_id: target.runtimeId }, 5000)
      if (!isCurrentTile(target) || tileReads.get(target.surface) !== request ||
          request.version !== (eventVersions.get(ownerKey) || 0) || !Array.isArray(result?.subagents)) return
      const agents = new Map()
      for (const item of result.subagents) {
        const id = tidy(item?.subagent_id)
        if (!id || !['running', 'queued'].includes(item.status)) continue
        const tool = tidy(item.last_tool)
        const childSession = tidy(item.child_session_id)
        agents.set(id, { id, subagentId: id, seed: id, goal: tidy(item.goal), ...nameMetadata(item), status: item.status,
          started: item.status === 'running', startedAt: timestamp(item.started_at), model: tidy(item.model),
          childSession, lifecycleChild: Boolean(childSession), activity: tool ? [tool] : noActivity })
      }
      tileSnapshots.set(target.surface, { target, agents })
      queue()
    } catch { /* A missing owner route or inactive session never falls back to the primary gateway. */ }
    finally { if (tileReads.get(target.surface) === request) tileReads.delete(target.surface) }
  }

  async function refresh(scope) {
    if (disposed || scope !== getScope() || !enabled() || reading?.scope === scope) return
    const request = { scope }
    reading = request
    try {
      const result = await host.request('subagent.list', { session_id: host.state.activeSessionId.get() }, 5000)
      if (disposed || reading !== request || scope !== getScope() || !Array.isArray(result?.subagents)) return
      // A child may have started before this renderer saw its first event.
      // Snapshots describe active children only. Terminal events and native
      // tool results are still the source of truth for finished work.
      const agents = new Map()
      for (const item of result.subagents) {
        const id = tidy(item?.subagent_id)
        if (!id || !['running', 'queued'].includes(item.status)) continue
        const tool = tidy(item.last_tool)
        const childSession = tidy(item.child_session_id)
        agents.set(id, { id, subagentId: id, seed: id, goal: tidy(item.goal), ...nameMetadata(item), status: item.status,
          started: item.status === 'running', startedAt: timestamp(item.started_at), model: tidy(item.model),
          childSession, lifecycleChild: Boolean(childSession),
          activity: tool ? [tool] : noActivity })
      }
      snapshot = { scope, agents }
      queue()
    } catch {
      // Older gateways still expose native cards and future lifecycle events.
    } finally {
      if (reading === request) reading = null
    }
  }

  for (const type of ['subagent.spawn_requested', 'subagent.start', 'subagent.tool', 'subagent.progress', 'subagent.complete']) {
    ctx.onEvent(type, (event) => {
      if (!event.session_id || !event.payload || !enabled()) return
      const scope = scopeKey(event.session_id,
        event.connectionId || host.state.connectionId.get(), event.profile || host.state.profile.get())
      // An untagged frame is safe only for the active native session.
      if (scope !== getScope() && !(event.connectionId && event.profile)) return
      eventVersions.set(scope, (eventVersions.get(scope) || 0) + 1)
      if (eventVersions.size > 64) eventVersions.delete(eventVersions.keys().next().value)
      // A snapshot begun before this event must not restore an older status.
      for (const [node, saved] of tileSnapshots) if (tileScope(saved.target) === scope) tileSnapshots.delete(node)
      const payload = event.payload
      const supplied = nameMetadata(payload)
      const goal = tidy(payload.goal)
      const subagentId = tidy(payload.subagent_id)
      if (!subagentId && !goal) return
      const id = subagentId || JSON.stringify([payload.delegation_id, payload.parent_id, payload.task_index, goal])
      // Runtime IDs can be reused during a surface transition. Bind a tagged
      // non-primary event to exactly one currently mounted native tile,
      // including its stored session, before retaining it for that tile.
      const candidates = scope !== getScope() && event.connectionId && event.profile
        ? [...document.querySelectorAll(surface)].map(tileTurnHistoryTarget).filter(target =>
          target && target.runtimeId === event.session_id && tileScope(target) === scope) : []
      const tile = candidates.length === 1 ? candidates[0] : null
      if (scope !== getScope() && !tile) return
      const tileKey = tile && tileRegistryKey(tile)
      const list = tileKey ? tileEvents.get(tileKey) || new Map() : runtimeAgents.get(scope) || new Map()
      const last = list.get(id)
      const delegationId = tidy(payload.delegation_id)
      const child = tidy(payload.child_session_id)
      // Continue reuses the exact worker and child chat under a new delegation.
      const continuation = subagentId && child && delegationId.startsWith('hcv-resume-')
      const resumed = continuation && last?.status === 'interrupted' && last.childSession === child &&
        last.delegationId !== delegationId && ['subagent.start', 'subagent.complete'].includes(event.type)
      if (last && (event.seq != null && last.seq >= event.seq || final(last.status) && !resumed ||
        last.resumed && delegationId !== last.delegationId && !resumed)) return
      const previous = resumed ? null : last
      const status = eventStatus(event, previous)
      if (previous?.started && status === 'queued') return
      const turn = previous?.turn || (scope === getScope()
        ? getPrompt([...document.querySelectorAll(primary + ' ' + transcript + ' ' + pair)].at(-1))
        : null)
      const time = timestamp(event.timestamp) ?? (event.replayed ? undefined : Date.now())
      const childSession = tidy(payload.child_session_id) || previous?.childSession
      const anchor = scope === getScope() && !event.replayed ? captureActivityAnchor() : null
      const firstStart = !previous?.startAnchor && event.type === 'subagent.start' && anchor
      const firstFinish = final(status) && anchor
      list.set(id, {
        id, subagentId, delegationId: delegationId || last?.delegationId, resumed: Boolean(continuation || last?.resumed),
        goal: goal || last?.goal || '', seed: id, turn, status, cardId: previous?.cardId,
        taskName: supplied.taskName || last?.taskName || '',
        agentPath: supplied.agentPath || last?.agentPath || '',
        cardIdBasis: previous?.cardIdBasis,
        seq: event.seq ?? previous?.seq, started: previous?.started || status === 'running',
        startAnchor: previous?.startAnchor || firstStart || null,
        startOrder: previous?.startOrder ?? (firstStart ? ++eventOrder : undefined),
        finishAnchor: firstFinish || previous?.finishAnchor || null,
        finishOrder: firstFinish ? ++eventOrder : previous?.finishOrder,
        startedAt: previous?.startedAt ?? (status === 'running' ? time : undefined),
        finishedAt: final(status) ? time : undefined,
        updatedAt: time ?? previous?.updatedAt,
        model: tidy(payload.model) || previous?.model,
        childSession, lifecycleChild: Boolean(childSession),
        effort: tidy(payload.reasoning_effort) || previous?.effort,
        durationSeconds: duration(payload.duration_seconds) ?? previous?.durationSeconds,
        summary: prose(payload.summary) || (final(status) ? prose(payload.text) : '') || previous?.summary,
        activity: eventActivity(event, previous),
      })
      if (list.size > 200) list.delete(list.keys().next().value)
      const collection = tileKey ? tileEvents : runtimeAgents
      const collectionKey = tileKey || scope
      collection.delete(collectionKey)
      collection.set(collectionKey, list)
      if (collection.size > 32) collection.delete(collection.keys().next().value)
      queue()
    })
  }

  function reconcile() {
    frame = 0
    const on = enabled()
    const dark = root.dataset.hermesMode === 'dark'
    const lang = language()
    const scope = on ? getScope() : null
    if (identityScope !== scope) { cancelIdentityReads(); identityScope = scope }
    currentIdentityTargets = new Set()
    if (snapshot?.scope !== scope) snapshot = null
    const observed = runtimeAgents.get(scope)
    const live = snapshot ? new Map([...snapshot.agents, ...(observed || [])]) : observed
    const claimed = new Set()
    const activeCards = new Set(on ? document.querySelectorAll(surface + ' ' + transcript + ' ' + delegate) : [])
    const enhance = on && contrast.matches
    for (const [card, state] of cards) {
      if (!activeCards.has(card)) {
        state.remove()
        cards.delete(card)
      }
    }
    const indexInTurn = new Map()
    const rowsByCard = new Map()
    for (const card of activeCards) {
      const turn = card.closest(pair)
      const index = indexInTurn.get(turn) ?? 0
      indexInTurn.set(turn, index + 1)
      rowsByCard.set(card, readCard(card, index))
    }
    // Match live statuses first. A receipt that contradicts a final live
    // outcome must not be joined to that card merely because goals match.
    for (const [card, entries] of rowsByCard) {
      const inPrimary = Boolean(card.closest(primary))
      const promptId = inPrimary && getPrompt(card.closest(pair))
      if (inPrimary && live) {
        for (const row of entries) {
          const available = (agent) => agent && !claimed.has(agent.id) && (agent.cardId === row.seed ||
            (!agent.cardId && (agent.turn ? agent.turn === promptId : !final(row.status))))
          // Hermes may assign native.id by the first matching goal before the
          // dispatch result is known. Only the stored child ID is exact.
          const sameId = row.subagentId && live.get(row.subagentId)
          // A real child ID is stronger than an earlier provisional match by
          // goal. Never bind the first of several equal goals by accident.
          const exact = sameId && !claimed.has(sameId.id) &&
            (!sameId.cardId || sameId.cardId === row.seed || sameId.cardIdBasis === 'goal') ? sameId : null
          let matched = exact
          if (!matched && !row.subagentId && !row.ambiguousGoal && promptId) {
            const sameGoalRows = [...rowsByCard].flatMap(([other, rows]) =>
              other.closest(primary) && getPrompt(other.closest(pair)) === promptId
                ? rows.filter(candidate => candidate.goal === row.goal) : [])
            const candidates = [...live.values()].filter(agent => available(agent) && agent.goal === row.goal &&
              (!row.taskName || !agent.taskName || row.taskName === agent.taskName) &&
              (agent.cardId === row.seed || agent.turn === promptId))
            if (sameGoalRows.length === 1 && candidates.length === 1) matched = candidates[0]
          }
          if (!matched || matched.resumed && row.delegationId !== matched.delegationId) continue
          matched.cardId = row.seed
          matched.cardIdBasis = exact ? 'id' : 'goal'
          row.nameProvisional = !exact
          if (exact) {
            row.taskName = matched.taskName || row.taskName
            row.agentPath = matched.agentPath || row.agentPath
          }
          claimed.add(matched.id)
          row.id = matched.id
          row.subagentId ||= matched.subagentId
          row.started ||= matched.started
          if (final(matched.status) || !final(row.status)) row.status = matched.status
          row.startedAt = matched.startedAt
          row.finishedAt = matched.finishedAt ?? row.finishedAt
          row.updatedAt = matched.updatedAt
          row.startAnchor = matched.startAnchor
          row.startOrder = matched.startOrder
          row.finishAnchor = matched.finishAnchor
          row.finishOrder = matched.finishOrder
          row.model ||= matched.model
          row.childSession = matched.childSession || row.childSession
          row.lifecycleChild = matched.lifecycleChild
          row.canOpen = !row.button.disabled && Boolean(row.childSession && row.nativeSession === row.childSession)
          row.effort ||= matched.effort
          row.durationSeconds ??= matched.durationSeconds
          row.summary ||= matched.summary
          row.activity = matched.activity
        }
      }
    }
    const currentReceipts = new Map()
    applyStoredReceipts(rowsByCard, (target, entries) => {
      if (!enhance) return
      currentReceipts.set(target, entries)
    }, node => history?.forSurface?.(node) ||
      (node?.matches('[data-session-anchor="workspace"]') ? history?.current?.() : null))
    // A visible saved completion and a live event may describe the same
    // worker even when its native delegate card is no longer present.
    // Reconcile on the exact worker ID before rendering either view.
    for (const [target, entries] of currentReceipts) for (const agent of entries) {
      if (!target.closest(primary)) continue
      const observedAgent = !agent.nameProvisional && agent.subagentId && live?.get(agent.subagentId)
      if (!observedAgent || claimed.has(observedAgent.id) || observedAgent.resumed &&
          agent.delegationId !== observedAgent.delegationId) continue
      agent.childSession = observedAgent.childSession || agent.childSession
      agent.lifecycleChild = Boolean(agent.childSession)
      agent.startAnchor = observedAgent.startAnchor
      agent.startOrder = observedAgent.startOrder
      agent.started ||= observedAgent.started
      agent.startedAt ||= observedAgent.startedAt
      agent.updatedAt ||= observedAgent.updatedAt
      agent.model ||= observedAgent.model
      agent.effort ||= observedAgent.effort
      agent.summary ||= observedAgent.summary
      agent.activity = observedAgent.activity
      claimed.add(observedAgent.id)
    }
    for (const [target, state] of markedReceipts) {
      if (currentReceipts.has(target)) continue
      state.remove()
      markedReceipts.delete(target)
    }
    const agentsById = new Map()
    const tileRows = new Map()
    const tileTarget = element => {
      const node = element.closest(surface)
      if (!node || node.matches(primary)) return null
      const target = tileTurnHistoryTarget(node)
      if (!target) return null
      if (!tileRows.has(node)) tileRows.set(node, { target, agents: new Map() })
      return tileRows.get(node)
    }
    const tileLive = target => {
      const stored = tileSnapshots.get(target.surface)
      const snap = stored && sameTileTarget(stored.target, target) ? stored.agents : null
      // Untagged events for the primary never supply a tile, even if the
      // runtime ID happens to be the same. Non-primary events were accepted
      // above only with both connection and profile tags.
      const events = tileEvents.get(tileRegistryKey(target))
      return new Map([...(snap || []), ...(events || [])])
    }
    function addTileRow(bucket, row) {
      if (!bucket) return row
      const live = tileLive(bucket.target)
      const merged = mergeTileAgent(row, row.subagentId && live.get(row.subagentId))
      bucket.agents.set(merged.id, merged)
      return merged
    }
    for (const [card, entries] of rowsByCard) {
      const inPrimary = Boolean(card.closest(primary))
      const bucket = inPrimary ? null : tileTarget(card)
      const owner = inPrimary ? scope : bucket ? tileRegistryKey(bucket.target) : null
      for (let i = 0; i < entries.length; i++) {
        entries[i] = addTileRow(bucket, entries[i])
        entries[i].displayName = owner ? nameFor(owner, entries[i], lang) : agentDisplayName(entries[i], labels[lang].fallback)
      }
      if (inPrimary) for (const row of entries) agentsById.set(row.id, row)
      if (!enhance || !entries.length) {
        cards.get(card)?.remove()
        cards.delete(card)
        continue
      }
      if (!cards.has(card)) {
        cards.set(card, enhanceCard(card))
      }
      const state = cards.get(card)
      if (state.rows.nextElementSibling !== card) card.before(state.rows)
      styleDelegateRows(state, entries, dark)
      renderActivity(state, entries, lang, dark, undefined,
        inPrimary ? roster.openAgent : bucket ? id => roster.openTileAgent(bucket.target, id) : null)
      watchIdentityRows(state, entries, owner)
    }

    for (const [target, entries] of currentReceipts) {
      const inPrimary = Boolean(target.closest(primary))
      const bucket = inPrimary ? null : tileTarget(target)
      const owner = inPrimary ? scope : bucket ? tileRegistryKey(bucket.target) : null
      for (let i = 0; i < entries.length; i++) {
        entries[i] = addTileRow(bucket, entries[i])
        entries[i].displayName = owner ? nameFor(owner, entries[i], lang) : agentDisplayName(entries[i], labels[lang].fallback)
        if (inPrimary) agentsById.set(entries[i].id, entries[i])
      }
      const nativeButton = entries[0].receiptButton
      if (!nativeButton) continue
      if (!markedReceipts.has(target)) markedReceipts.set(target, enhanceReceipt(target))
      const state = markedReceipts.get(target)
      if (state.rows.parentNode !== target) target.prepend(state.rows)
      renderActivity(state, entries, lang, dark, entries.map(agent => ({ agent, kind: agent.status })),
        inPrimary ? roster.openAgent : bucket ? id => roster.openTileAgent(bucket.target, id) : null)
      watchIdentityRows(state, entries, owner)
    }

    // A visible tile can have a live agent without a rendered delegate card.
    // The exact owner/session roster and native rows stay in a separate map.
    for (const node of on ? document.querySelectorAll(surface) : []) tileTarget(node)
    const nextTiles = new Map()
    for (const [node, bucket] of tileRows) {
      const scope = tileScope(bucket.target)
      const registry = tileRegistryKey(bucket.target)
      // Saved metadata is already proven against the durable receipt row,
      // delegation and child ancestry by the tile history backend. Include
      // those records even when their transcript rows are not currently in
      // the DOM; require this exact session and owner before using them.
      const stored = history?.forSurface?.(node)
      let owner = null
      try { owner = JSON.parse(stored?.scope) } catch { /* No verified owner. */ }
      if (stored?.requestedSessionId === bucket.target.sessionId && Array.isArray(stored.receipts) &&
          owner?.length === 3 && owner[0] === bucket.target.connectionId && owner[1] === bucket.target.profile &&
          owner[2] === (bucket.target.runtimeId || bucket.target.sessionId)) {
        const byWorker = new Map()
        for (const candidate of stored.receipts) {
          const receipt = canonicalAgentReceipt(candidate?.row_id, stored.receipts)
          if (!receipt) continue
          for (const metadata of receipt.agents) {
            const id = metadata.subagent_id
            if (byWorker.has(id)) byWorker.set(id, null)
            else byWorker.set(id, { receipt, metadata })
          }
        }
        for (const [id, claim] of byWorker) {
          if (!claim) continue
          const { receipt, metadata } = claim
          const child = tidy(metadata.child_session_id)
          if (child && (child === bucket.target.sessionId || child === bucket.target.runtimeId)) continue
          const previous = bucket.agents.get(id)
          if (previous && (previous.delegationId !== receipt.delegation_id ||
              previous.childSession && child && previous.childSession !== child)) continue
          const agent = { ...(previous || { id, subagentId: id, seed: id, goal: '', activity: noActivity, started: false }),
            delegationId: receipt.delegation_id, status: metadata.status,
            taskName: nameMetadata(metadata).taskName || previous?.taskName || '',
            agentPath: nameMetadata(metadata).agentPath || previous?.agentPath || '',
            childSession: child || previous?.childSession || '',
            lifecycleChild: Boolean(child || previous?.childSession) }
          agent.displayName = nameFor(registry, agent, lang)
          bucket.agents.set(id, agent)
        }
      }
      for (const agent of tileLive(bucket.target).values()) {
        const saved = bucket.agents.get(agent.id)
        if (saved && !(agent.resumed && saved.childSession === agent.childSession && saved.delegationId !== agent.delegationId)) continue
        const next = { ...agent }
        next.displayName = nameFor(registry, next, lang)
        bucket.agents.set(next.id, next)
      }
      nextTiles.set(node, { scope, target: bucket.target, agents: [...bucket.agents.values()], lang, dark })
    }
    tiles.set(nextTiles)
    for (const node of tileSnapshots.keys()) if (!tileRows.has(node)) tileSnapshots.delete(node)

    // Slash commands and asynchronous children may emit real lifecycle frames
    // without a delegate card. Attach those only to the observed parent turn.
    const withoutCard = live ? [...live.values()].filter((agent) => !claimed.has(agent.id)) : []
    for (const agent of withoutCard) {
      agent.displayName = nameFor(scope, agent, lang)
      // Keep the original receipt in the feed and show only the current worker in the list.
      if (agent.resumed && agentsById.get(agent.id)?.childSession === agent.childSession) agentsById.delete(agent.id)
    }
    const agents = [...agentsById.values(), ...withoutCard]
    const groups = new Map()
    if (enhance) {
      const events = agents.flatMap(agent => [
        !agent.button && agent.startAnchor && { agent, kind: 'started', anchor: agent.startAnchor, order: agent.startOrder },
        !agent.receiptMatched && agent.finishAnchor && { agent, kind: agent.status, anchor: agent.finishAnchor, order: agent.finishOrder },
      ].filter(Boolean)).sort((a, b) => a.order - b.order)
      for (const event of events) {
        const key = JSON.stringify(event.anchor)
        if (!groups.has(key)) groups.set(key, { anchor: event.anchor, events: [] })
        groups.get(key).events.push(event)
      }
    }
    for (const [key, state] of extra) {
      if (!groups.has(key)) {
        state.rows.remove()
        extra.delete(key)
      }
    }
    for (const [key, { anchor, events }] of groups) {
      if (!extra.has(key)) {
        const rows = document.createElement('div')
        rows.setAttribute('data-hcv-agent-rows', '')
        extra.set(key, { rows })
      }
      const state = extra.get(key)
      if (!placeActivityRows(state.rows, anchor)) { state.rows.remove(); continue }
      renderActivity(state, events.map(({ agent }) => agent), lang, dark, events, roster.openAgent)
      watchIdentityRows(state, events.map(({ agent }) => agent), scope)
    }
    for (const target of identityTargets.keys()) {
      if (currentIdentityTargets.has(target)) continue
      childVisibility?.unobserve(target)
      identityTargets.delete(target)
    }
    const signature = scope + activitySignature(agents, lang, dark)
    const prior = roster.get().agents
    if (signature !== rosterSignature || agents.some((agent, i) => {
      const old = prior[i]
      return !old || agent.button !== old.button || agent.canOpen !== old.canOpen ||
        agent.model !== old.model || agent.childSession !== old.childSession || agent.subagentId !== old.subagentId ||
        agent.lifecycleChild !== old.lifecycleChild ||
        agent.effort !== old.effort || agent.summary !== old.summary ||
        agent.startedAt !== old.startedAt || agent.finishedAt !== old.finishedAt ||
        agent.updatedAt !== old.updatedAt ||
        agent.durationSeconds !== old.durationSeconds || agent.activity !== old.activity ||
        agent.receiptButton !== old.receiptButton
    })) {
      rosterSignature = signature
      roster.set({ scope, agents, lang, dark })
    }
  }

  const observer = new MutationObserver((records) => {
    const relevant = [delegate, primary, pair, response, notice, messageRoot, messageBody, timelinePart].join(', ')
    if (records.some(({ target, type, addedNodes, removedNodes }) => {
      if (target === root) return true
      if (!enabled()) return false
      const element = target instanceof Element ? target : target.parentElement
      if (!element || element.closest(generated)) return false
      if (element.closest(delegate) || element.closest(notice)) return true
      if (type !== 'childList') return false
      return [...addedNodes, ...removedNodes].some((node) => node instanceof Element &&
        !node.matches(generated) && (node.matches(relevant) || node.querySelector(relevant)))
    })) queue()
  })
  observer.observe(root, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['aria-label', 'aria-expanded', 'disabled', 'data-hermes-theme', 'data-hermes-mode', 'data-hermes-codex-visual', 'lang'],
  })
  const unsubscribers = [host.state.activeSessionId, host.state.connectionId, host.state.profile].map((state) => state.subscribe(queue))
  if (history?.subscribe) unsubscribers.push(history.subscribe(queue))
  contrast.addEventListener('change', queue)
  ctx.onDispose(() => {
    disposed = true
    cancelIdentityReads()
    childVisibility?.disconnect()
    document.removeEventListener('visibilitychange', resumeVisibleIdentityReads)
    stopIdentityGateway()
    childIdentities.clear()
    observer.disconnect()
    for (const unsubscribe of unsubscribers) unsubscribe()
    contrast.removeEventListener('change', queue)
    cancelAnimationFrame(frame)
    for (const state of cards.values()) state.remove()
    for (const state of extra.values()) state.rows.remove()
    for (const state of markedReceipts.values()) state.remove()
    nameRegistries.clear()
    avatarRegistries.clear()
    tileEvents.clear()
    tileSnapshots.clear()
    tileReads.clear()
    eventVersions.clear()
    tiles.set(new Map())
    tileSelection.set(null)
    roster.set(empty)
    selection.set(null)
    roster.revealAgentPane = null
    sheet.remove()
  })
  queue()
  return roster
}
