import { atom, host, useValue } from '@hermes/plugin-sdk'
import { createElement as h, useEffect } from 'react'
import { agentAvatars } from './agent-avatars.js'
import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { AgentPane, agentPaneStyles } from './summary-agents.js'

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
const getPrompt = (turn) => turn?.querySelector(':scope > ' + prompt)?.dataset.messageId
const profile = (value) => tidy(value).toLowerCase() || 'default'
const scopeKey = (session, connection, name) => session && JSON.stringify([connection || null, profile(name), session])

const labels = {
  ru: {
    title: 'Субагенты', fallback: 'Субагент', more: (n) => 'ещё ' + n, open: 'Открыть список субагентов',
    started: 'начал(-и) работу', running: 'В работе', queued: 'ожидает(-ют) запуска',
    dispatched: 'передан(-ы) в работу', completed: 'завершил(-и) работу',
    failed: 'завершил(-и) с ошибкой', interrupted: 'прервал(-и) работу',
    status: { running: 'В работе', queued: 'В очереди', dispatched: 'Передано',
      completed: 'Готово', failed: 'Ошибка', interrupted: 'Прервано' },
  },
  en: {
    title: 'Subagents', fallback: 'Subagent', more: (n) => n + ' more', open: 'Open subagents list',
    started: 'started working', running: 'Working', queued: 'waiting to start',
    dispatched: 'dispatched', completed: 'finished', failed: 'finished with errors', interrupted: 'interrupted',
    status: { running: 'Working', queued: 'Queued', dispatched: 'Dispatched',
      completed: 'Done', failed: 'Failed', interrupted: 'Interrupted' },
  },
}
const language = () => document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru' : 'en'

const assetUrls = new Map()
function avatarUrl(seed, dark) {
  // Keep an agent’s badge stable when the theme changes.
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (31 * hash + seed.charCodeAt(i)) % 0x7fffffff
  const index = hash % agentAvatars.length
  const key = index * 2 + Number(!dark)
  if (!assetUrls.has(key)) {
    const svg = agentAvatars[index][dark ? 0 : 1]
    assetUrls.set(key, 'data:image/svg+xml,' + encodeURIComponent(svg))
  }
  return assetUrls.get(key)
}

function shortName(goal, fallback) {
  const name = goal || fallback
  const chars = Array.from(name)
  return chars.length > 48 ? chars.slice(0, 47).join('') + '…' : name
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

function readCard(card, cardIndex) {
  // Hermes's DelegateTool hydrates from the tool result and overlays the live
  // subagent state. Use the tool and child ids across renderer remounts.
  const call = committedFiber(card)?.return?.memoizedProps
  const callId = tidy(call?.toolCallId)
  const args = resultObject(call?.args)
  const result = resultObject(call?.result)?.results
  const turnId = getPrompt(card.closest(pair))
  return [...card.children].flatMap((entry, index) => {
    const scaffold = entry.querySelector(':scope > [data-conversation-scaffold]')
    const button = scaffold?.querySelector(':scope > button')
    const glyph = scaffold?.firstElementChild
    if (!button || !glyph) return []
    const goal = tidy(args?.tasks?.[index]?.goal || (index === 0 && args?.goal)) || tidy(button.textContent)
    const native = committedFiber(entry)?.return?.memoizedProps?.row
    const stored = Array.isArray(result) ? resultObject(result[index]) : null
    // A native live row can be overlaid on an older call with the same goal.
    // Keep the completed call's own result until an event is matched to it.
    const status = stored ? settledStatus(stored.status) : native?.status || (glyph.querySelector('[role="status"]') ? 'running'
      : glyph.querySelector('svg.text-destructive') ? 'failed'
        : glyph.querySelector('svg[aria-label]') ? 'completed' : 'dispatched')
    const nativeSession = tidy(native?.sessionId)
    const childSession = tidy(stored?.child_session_id || stored?.session_id) || (!stored ? nativeSession : '')
    const seed = JSON.stringify(callId ? [callId, index] : [turnId, cardIndex, index, goal])
    return [{
      id: seed, seed, nativeId: tidy(native?.id), nativeSession, goal, status, childSession,
      model: tidy(stored ? stored.model : native?.model),
      durationSeconds: duration(stored ? stored.duration_seconds : native?.durationSeconds),
      effort: tidy(stored?.reasoning_effort),
      summary: prose(stored?.summary) || prose(stored?.error),
      activity: noActivity,
      started: status === 'running' || status === 'completed',
      button, canOpen: !button.disabled && (!stored || Boolean(childSession && nativeSession === childSession)),
    }]
  })
}

function applyStoredReceipts(rowsByCard) {
  // The async dispatch result only records "dispatched". Hermes writes the
  // actual outcome as a system result later, including the original goals.
  // Use an exact, unambiguous match in the same transcript. Mixed batches
  // without per-agent outcomes keep the native result visible.
  for (const [target, heading] of [...document.querySelectorAll(surface + ' ' + transcript + ' ' + notice)]
    .map(node => [node, tidy(node.querySelector('[data-conversation-scaffold] span.truncate')?.textContent)])) {
    const match = /^Subagent (Task|Tasks) (Completed|Failed|Interrupted|Cancelled|Timed Out): (.+)$/.exec(heading)
    if (!match) continue
    const [, kind, outcome, text] = match
    const batch = kind === 'Tasks' && /^(.*) \((\d+) tasks\)$/.exec(text)
    if (kind === 'Tasks' && !batch) continue
    const goals = batch ? batch[1] : text
    const count = batch ? Number(batch[2]) : 1
    const matches = [...rowsByCard].filter(([card, entries]) =>
      card.closest(transcript) === target.closest(transcript) &&
      Boolean(card.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      entries.length === count && entries.every(row => row.status === 'dispatched') &&
      entries.map(row => row.goal).join('; ') === goals)
    if (matches.length !== 1) continue
    const receipt = committedFiber(target)?.return?.memoizedProps
    const receiptButton = target.querySelector('[data-conversation-scaffold] button')
    const dateTime = target.querySelector('time[datetime]')?.dateTime
    for (const row of matches[0][1]) {
      row.started = true
      row.status = outcome === 'Completed' ? 'completed'
        : outcome === 'Cancelled' || outcome === 'Interrupted' ? 'interrupted' : 'failed'
      row.finishedAt = dateTime ? timestamp(Date.parse(dateTime)) : undefined
      if (count === 1 && !row.summary) row.summary = prose(receipt?.report)
      row.receiptButton = receiptButton
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

function activityRows(agents) {
  return ['started', 'queued', 'dispatched', 'completed', 'failed', 'interrupted'].map((kind) => [
    kind, agents.filter((agent) => agent.status === (kind === 'started' ? 'running' : kind)),
  ]).filter(([, list]) => list.length)
}

function activitySignature(agents, lang, dark) {
  return JSON.stringify([lang, dark, agents.map(({ id, seed, goal, status, started }) => [id, seed, goal, status, started])])
}

function renderActivity(state, agents, lang, dark) {
  const signature = activitySignature(agents, lang, dark)
  if (signature === state.signature) return
  state.signature = signature
  const copy = labels[lang]
  const format = new Intl.ListFormat(lang)
  const rows = activityRows(agents).map(([kind, list]) => {
    const row = document.createElement('span')
    row.setAttribute('data-hcv-agent-activity', kind)
    const icons = document.createElement('span')
    icons.setAttribute('data-hcv-agent-icons', '')
    icons.setAttribute('aria-hidden', 'true')
    const shown = list.length <= 3 ? list : list.slice(0, 2)
    for (const agent of shown) {
      const image = document.createElement('img')
      image.src = avatarUrl(agent.seed, dark)
      image.alt = ''
      image.draggable = false
      icons.append(image)
    }
    const names = shown.map(({ goal }) => shortName(goal, copy.fallback))
    if (list.length > shown.length) names.push(copy.more(list.length - shown.length))
    const sentence = document.createElement('span')
    sentence.textContent = format.format(names) + ' ' + copy[kind]
    sentence.title = format.format(list.map(({ goal }) => goal || copy.fallback)) + ' ' + copy[kind]
    row.append(icons, sentence)
    return row
  })
  state.rows.replaceChildren(...rows)
}

function enhanceCard(card, id, expanded, key) {
  const rows = document.createElement('button')
  rows.type = 'button'
  rows.setAttribute('data-hcv-agent-rows', '')
  const assigned = !card.id
  if (assigned) card.id = 'hcv-delegate-' + id
  const assignedId = card.id
  rows.setAttribute('aria-expanded', String(expanded.has(key)))
  rows.setAttribute('aria-controls', assignedId)
  rows.addEventListener('click', () => {
    const open = rows.getAttribute('aria-expanded') !== 'true'
    rows.setAttribute('aria-expanded', String(open))
    if (open) expanded.add(key)
    else expanded.delete(key)
    if (expanded.size > 100) expanded.delete(expanded.values().next().value)
  })
  card.before(rows)
  return { rows, glyphs: new Map(), remove() {
    rows.remove()
    for (const glyph of this.glyphs.keys()) {
      glyph.removeAttribute(agentAvatar)
      glyph.style.removeProperty('--hcv-delegate-avatar')
    }
    if (assigned && card.id === assignedId) card.removeAttribute('id')
  } }
}

function styleDelegateRows(state, agents, dark) {
  const previous = state.glyphs
  const next = new Map()
  for (const { button, seed } of agents) {
    const glyph = button.previousElementSibling
    if (!glyph) continue
    const image = avatarUrl(seed, dark)
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

function localWatchProfile(agent, scope) {
  if (!agent.lifecycleChild || !agent.childSession || !scope || typeof window.hermesDesktop?.openSessionWindow !== 'function') return null
  const [connection, owner, parent] = JSON.parse(scope)
  // The watch bridge accepts a profile but cannot pin a registry connection.
  return connection === 'local' && agent.childSession !== parent ? owner : null
}

function nativeActions(agent, scope) {
  return [
    (agent.canOpen || localWatchProfile(agent, scope)) && 'native',
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
    const owner = localWatchProfile(agent, scope)
    if (owner) {
      const errorTitle = language() === 'ru' ? 'Не удалось открыть подробности субагента' : 'Could not open subagent details'
      void window.hermesDesktop.openSessionWindow(agent.childSession, { profile: owner, watch: true }).then(result => {
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

function useScopedRoster(roster) {
  const value = useValue(roster)
  const session = useValue(host.state.activeSessionId)
  const connection = useValue(host.state.connectionId)
  const name = useValue(host.state.profile)
  const scope = scopeKey(session, connection, name)
  return value.scope === scope ? value : { ...value, scope, agents: [] }
}

export function SubagentsPane({ roster }) {
  const value = useScopedRoster(roster)
  const gateway = useValue(host.state.gateway)
  useEffect(() => {
    if (value.scope && gateway === 'open') void roster.refresh(value.scope)
  }, [roster, value.scope, gateway])
  return h(AgentPane, { ...value, key: value.scope ?? 'draft', avatarUrl, nativeActions, openNativeAgent })
}

export function SummarySubagents({ roster, onExpand }) {
  const value = useScopedRoster(roster)
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
  const image = (agent) => h('img', { key: agent.id, src: avatarUrl(agent.seed, dark), alt: '', draggable: false })
  const previewContent = [
    h('span', { key: 'avatars', 'data-hcv-agent-icons': '', 'aria-hidden': true }, preview.map(image)),
    h('span', { key: 'status', role: 'status', 'data-hcv-agent-counts': '' }, counts.join(' · ')),
  ]
  return h('section', { 'data-hcv-summary-agents': '', 'aria-label': copy.title },
    h('div', { 'data-hcv-agents-heading': '' }, copy.title),
    onExpand
      ? h('button', { type: 'button', className: 'hcv-context-row', title: copy.open,
        'aria-label': copy.open, 'data-hcv-open-subagents': '', onClick: onExpand }, previewContent)
      :
    h('details', { key: value.scope },
      h('summary', { className: 'hcv-context-row' }, previewContent),
      h('ul', null, agents.map((agent) => {
        const name = agent.goal || copy.fallback
        const info = h('span', { 'data-hcv-agent-info': '' },
          h('span', { title: name }, name),
          h('small', null, copy.status[agent.status]))
        return h('li', { key: agent.id },
          agent.canOpen
            ? h('button', { type: 'button', onClick: () => openNativeAgent(agent, value.scope) }, image(agent), info)
            : h('div', null, image(agent), info))
      })),
    ))
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
    rows + ':is(button) { display: grid; inline-size: fit-content; max-inline-size: 100%; gap: 4px; min-inline-size: 0; border-radius: 6px; text-align: start; cursor: pointer; }',
    rows + ':is(div) { display: grid; gap: 4px; }',
    rows + '[aria-expanded="false"] + ' + delegate + ' { display: none; }',
    rows + ' [data-hcv-agent-activity] { display: flex; align-items: center; gap: 4px; min-inline-size: 0; color: var(--hcv-activity-text); font-size: var(--hcv-activity-font); line-height: 1.5; }',
    rows + ' [data-hcv-agent-activity] > span:last-child { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
    rows + ':is(button) [data-hcv-agent-activity]:last-child::after { content: ""; flex: none; inline-size: 12px; block-size: 12px; background: var(--hcv-activity-glyph); mask: ' + codexMask('right') + ' center / contain no-repeat; opacity: 0; }',
    rows + ':is(:hover, :focus-visible, [aria-expanded="true"]) [data-hcv-agent-activity]:last-child::after { opacity: 1; }',
    rows + '[aria-expanded="true"] [data-hcv-agent-activity]:last-child::after { rotate: 90deg; }',
    '@media (prefers-reduced-motion: no-preference) { ' + rows + ' [data-hcv-agent-activity]:last-child::after { transition: rotate 300ms; } }',
    rows + ':hover [data-hcv-agent-activity], ' + rows + ':focus-visible [data-hcv-agent-activity] { color: var(--hcv-text); }',
    active + ' [data-hcv-agent-icons] { display: inline-flex; flex: none; align-items: center; align-self: flex-start; gap: 4px; min-block-size: var(--conversation-line-height, 21px); }',
    active + ' [data-hcv-agent-icons] img, ' + card + ' li img { inline-size: .875rem; block-size: .875rem; flex: none; }',
    rows + ' [data-hcv-agent-icons] img { inline-size: 16px; block-size: 16px; }',
    native + ' { gap: 4px; margin-inline-start: 8px; padding-inline-start: 16px; border-inline-start: 1px solid var(--hcv-activity-border); }',
    task + ' { padding: 0; border: 0; border-radius: 0; }',
    line + ' { opacity: 1; gap: 4px; --conversation-tool-font-size: var(--hcv-activity-font); --conversation-scaffold-text: var(--hcv-activity-text); }',
    line + ' > .codicon-agent { display: none; }',
    line + ' > button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; border-radius: 6px; }',
    glyph + ' { position: relative; inline-size: 16px; block-size: 16px; }',
    glyph + ':not(:has([role="status"], svg.text-destructive)) { background: var(--hcv-delegate-avatar) center / contain no-repeat; }',
    glyph + ':not(:has([role="status"], svg.text-destructive)) > * { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; }',
    card + ' { border-block-start: 1px solid color-mix(in srgb, var(--hcv-muted) 14%, transparent); margin-block-start: 6px; padding-block-start: 7px; color: var(--hcv-muted); }',
    card + ' [data-hcv-agents-heading] { min-block-size: 28px; display: flex; align-items: center; font-size: 12px; }',
    card + ' summary { position: relative; color: var(--hcv-muted); list-style: none; cursor: pointer; gap: 6px; }',
    card + ' summary::-webkit-details-marker { display: none; }',
    card + ' [data-hcv-agent-icons] { align-self: center; }',
    card + ' [data-hcv-agent-counts] { min-inline-size: 0; }',
    card + ' summary::after { content: ""; margin-inline-start: auto; flex: none; inline-size: 12px; block-size: 12px; background: currentColor; mask: ' + codexMask('down') + ' center / contain no-repeat; opacity: 0; }',
    card + ' [data-hcv-open-subagents]::after { content: ""; margin-inline-start: auto; flex: none; inline-size: 16px; block-size: 16px; background: currentColor; mask: ' + codexMask('right') + ' center / contain no-repeat; }',
    card + ' summary:is(:hover, :focus-visible)::after, ' + card + ' details[open] > summary::after { opacity: 1; }',
    card + ' details[open] > summary::after { rotate: 180deg; }',
    card + ' ul { max-block-size: min(30vh, 220px); overflow-y: auto; overscroll-behavior: contain; margin: 4px 0 0; }',
    card + ' li > :is(div, button) { display: flex; gap: 8px; align-items: center; inline-size: 100%; padding: 4px; border-radius: 6px; text-align: start; }',
    card + ' :is(button, summary):hover { background: var(--hcv-hover); color: var(--hcv-text); }',
    card + ' [data-hcv-agent-info] { display: grid; min-inline-size: 0; gap: 1px; }',
    card + ' [data-hcv-agent-info] > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
    card + ' small { font-size: 11px; }',
    rows + ':focus-visible, ' + card + ' :is(button, summary):focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }',
    '}',
  ].join('\n') + agentPaneStyles(active)
}

export function registerSubagents(ctx, active) {
  const empty = { scope: null, agents: [], lang: 'en', dark: false }
  const roster = Object.assign(atom(empty), { refresh })
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const enabled = () => root.matches(active)
  const getScope = () => scopeKey(host.state.activeSessionId.get(), host.state.connectionId.get(), host.state.profile.get())
  const sheet = document.createElement('style')
  sheet.setAttribute('data-hcv-subagents-style', '')
  sheet.textContent = css(active)
  document.head.append(sheet)

  const cards = new Map()
  const expanded = new Set()
  const runtimeAgents = new Map()
  const extra = new Map()
  let nextId = 0
  let frame = 0
  let rosterSignature = ''
  let snapshot = null
  let reading = null
  let disposed = false
  const queue = () => { if (!frame) frame = requestAnimationFrame(reconcile) }

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
        agents.set(id, { id, seed: id, goal: tidy(item.goal), status: item.status,
          started: item.status === 'running', startedAt: timestamp(item.started_at), model: tidy(item.model),
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
      const payload = event.payload
      const goal = tidy(payload.goal)
      const id = tidy(payload.subagent_id) || JSON.stringify([payload.delegation_id, payload.parent_id, payload.task_index, goal])
      if (!tidy(payload.subagent_id) && !goal) return
      const list = runtimeAgents.get(scope) || new Map()
      const previous = list.get(id)
      if (previous && (final(previous.status) || (event.seq != null && previous.seq >= event.seq))) return
      const status = eventStatus(event, previous)
      if (previous?.started && status === 'queued') return
      const turn = previous?.turn || (scope === getScope()
        ? getPrompt([...document.querySelectorAll(primary + ' ' + transcript + ' ' + pair)].at(-1))
        : null)
      const time = timestamp(event.timestamp) ?? (event.replayed ? undefined : Date.now())
      const childSession = tidy(payload.child_session_id) || previous?.childSession
      list.set(id, {
        id, goal: goal || previous?.goal || '', seed: id, turn, status, cardId: previous?.cardId,
        seq: event.seq ?? previous?.seq, started: previous?.started || status === 'running' || status === 'completed',
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
      runtimeAgents.delete(scope)
      runtimeAgents.set(scope, list)
      if (runtimeAgents.size > 32) runtimeAgents.delete(runtimeAgents.keys().next().value)
      queue()
    })
  }

  function reconcile() {
    frame = 0
    const on = enabled()
    const dark = root.dataset.hermesMode === 'dark'
    const lang = language()
    const scope = on ? getScope() : null
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
    if (rowsByCard.size) applyStoredReceipts(rowsByCard)
    const agentsById = new Map()
    for (const [card, entries] of rowsByCard) {
      const inPrimary = Boolean(card.closest(primary))
      const promptId = inPrimary && getPrompt(card.closest(pair))
      if (inPrimary && live) {
        for (const row of entries) {
          const available = (agent) => agent && !claimed.has(agent.id) && (agent.cardId === row.id ||
            (!agent.cardId && (agent.turn ? agent.turn === promptId : !final(row.status))))
          const sameId = live.get(row.nativeId)
          const matched = available(sameId) ? sameId : [...live.values()].find((agent) => available(agent) &&
            (agent.cardId === row.id || (promptId && agent.turn === promptId && agent.goal === row.goal)))
          if (!matched) continue
          matched.cardId = row.id
          claimed.add(matched.id)
          row.id = matched.id
          row.started ||= matched.started
          if (final(matched.status) || !final(row.status)) row.status = matched.status
          row.startedAt = matched.startedAt
          row.finishedAt = matched.finishedAt ?? row.finishedAt
          row.updatedAt = matched.updatedAt
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
      if (inPrimary) for (const row of entries) agentsById.set(row.id, row)
      if (!enhance || !entries.length) {
        cards.get(card)?.remove()
        cards.delete(card)
        continue
      }
      if (!cards.has(card)) {
        const owner = inPrimary ? scope : card.closest(surface)?.dataset.composerSurfaceId
        const key = JSON.stringify([owner, entries.map(({ seed }) => seed)])
        cards.set(card, enhanceCard(card, ++nextId, expanded, key))
      }
      const state = cards.get(card)
      if (state.rows.nextElementSibling !== card) card.before(state.rows)
      styleDelegateRows(state, entries, dark)
      renderActivity(state, entries, lang, dark)
    }

    // Slash commands and asynchronous children may emit real lifecycle frames
    // without a delegate card. Attach those only to the observed parent turn.
    const withoutCard = live ? [...live.values()].filter((agent) => !claimed.has(agent.id)) : []
    const agents = [...agentsById.values(), ...withoutCard]
    const groups = new Map()
    if (enhance && withoutCard.length) {
      const turns = new Map([...document.querySelectorAll(primary + ' ' + transcript + ' ' + pair)]
        .map((turn) => [getPrompt(turn), turn]))
      for (const agent of withoutCard) {
        const group = agent.turn && turns.get(agent.turn)?.querySelector(':scope > ' + response)
        if (group) groups.set(group, [...(groups.get(group) || []), agent])
      }
    }
    for (const [group, state] of extra) {
      if (!groups.has(group)) {
        state.rows.remove()
        extra.delete(group)
      }
    }
    for (const [group, entries] of groups) {
      if (!extra.has(group)) {
        const rows = document.createElement('div')
        rows.setAttribute('data-hcv-agent-rows', '')
        group.append(rows)
        extra.set(group, { rows })
      }
      renderActivity(extra.get(group), entries, lang, dark)
    }
    const signature = scope + activitySignature(agents, lang, dark)
    const prior = roster.get().agents
    if (signature !== rosterSignature || agents.some((agent, i) => {
      const old = prior[i]
      return !old || agent.button !== old.button || agent.canOpen !== old.canOpen ||
        agent.model !== old.model || agent.childSession !== old.childSession || agent.lifecycleChild !== old.lifecycleChild ||
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
    const relevant = [delegate, primary, pair, response, notice].join(', ')
    if (records.some(({ target, type, addedNodes, removedNodes }) => {
      if (target === root) return true
      if (!enabled()) return false
      const element = target instanceof Element ? target : target.parentElement
      if (!element || element.closest(generated)) return false
      if (element.closest(delegate)) return true
      if (type !== 'childList') return false
      return [...addedNodes, ...removedNodes].some((node) => node instanceof Element &&
        !node.matches(generated) && (node.matches(relevant) || node.querySelector(relevant)))
    })) queue()
  })
  observer.observe(root, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['aria-label', 'disabled', 'data-hermes-theme', 'data-hermes-mode', 'data-hermes-codex-visual', 'lang'],
  })
  const unsubscribers = [host.state.activeSessionId, host.state.connectionId, host.state.profile].map((state) => state.subscribe(queue))
  contrast.addEventListener('change', queue)
  ctx.onDispose(() => {
    disposed = true
    observer.disconnect()
    for (const unsubscribe of unsubscribers) unsubscribe()
    contrast.removeEventListener('change', queue)
    cancelAnimationFrame(frame)
    for (const state of cards.values()) state.remove()
    for (const state of extra.values()) state.rows.remove()
    roster.set(empty)
    sheet.remove()
  })
  queue()
  return roster
}
