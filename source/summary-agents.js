import { CopyButton, host } from '@hermes/plugin-sdk'
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { codexIconStyle } from './codex-reference.js'
import { agentDisplayName } from './agent-display-name.js'
import { attachAgentTranscriptScroll } from './agent-transcript-scroll.js'
import { AgentTranscript, agentTranscriptStyles } from './agent-transcript.js'
import { agentModelDisplayName, agentReasoningEffortName, agentSessionMetadata, mergeAgentTranscript } from './agent-transcript-data.js'
import { readSavedTurnChanges, applySavedTurnChanges, openSavedTurnDiff, sameTurnHistoryOwner, notifySavedTurnOutcome } from './turn-history-client.js'
import { uniqueTileRoute } from './tile-agent-scope.js'
import { observeWindowVisibility } from './window-visibility.js'

const russianPlurals = new Intl.PluralRules('ru')
const relativeTimeFormats = new Map()

const labels = {
  ru: {
    title: 'Субагенты', active: 'Активные', done: 'Готово', noActive: 'Нет активных субагентов',
    back: 'Назад к субагентам', fallback: 'Субагент', task: 'Задание',
    waitingCount: (count) => russianPlurals.select(count) === 'one' ? count + ' ожидает' : count + ' ожидают',
    more: (count) => 'Показать ещё ' + count, worked: (time) => 'Работал на протяжении ' + time,
    elapsed: (time) => 'Работает уже ' + time, activity: 'Активность', result: 'Результат',
    loading: 'Загрузка ответа…', noResult: 'Результат пока недоступен', partial: 'Часть истории недоступна', copy: 'Копировать',
    native: 'Открыть подробности в Hermes', receipt: 'Открыть отчёт в чате',
    status: { running: 'Работает', queued: 'Ожидает', dispatched: 'Передано', failed: 'Ошибка', interrupted: 'Прервано' },
  },
  en: {
    title: 'Subagents', active: 'Active', done: 'Done', noActive: 'No active subagents',
    back: 'Back to subagents', fallback: 'Subagent', task: 'Task', waitingCount: (count) => count + ' waiting',
    more: (count) => 'Show ' + count + ' more', worked: (time) => 'Worked for ' + time,
    elapsed: (time) => 'Working for ' + time, activity: 'Activity', result: 'Result',
    loading: 'Loading response…', noResult: 'Result unavailable', partial: 'Part of the history is unavailable', copy: 'Copy',
    native: 'Open details in Hermes', receipt: 'Open report in chat',
    status: { running: 'Working', queued: 'Waiting', dispatched: 'Dispatched', failed: 'Failed', interrupted: 'Interrupted' },
  },
}

const finished = ({ status }) => ['completed', 'failed', 'interrupted'].includes(status)
const recency = (agent) => agent.updatedAt ?? agent.finishedAt ?? agent.startedAt ?? 0
const goalLabel = (agent, copy) => agentDisplayName(agent, copy.fallback)
const normalizeProfile = (name) => (name || 'default').trim().toLowerCase() || 'default'

function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole / 60) % 60
  return [hours && hours + 'h', (hours || minutes) && minutes + 'm', whole % 60 + 's'].filter(Boolean).join(' ')
}

function relativeTime(value, now, lang) {
  const minutes = Math.max(0, Math.floor((now - value) / 60000))
  const days = Math.floor(minutes / 1440)
  const weeks = Math.floor(days / 7)
  const [age, unit] = weeks ? [weeks, 'week'] : days ? [days, 'day']
    : minutes >= 60 ? [Math.floor(minutes / 60), 'hour'] : [minutes, 'minute']
  if (!relativeTimeFormats.has(lang)) relativeTimeFormats.set(lang, new Intl.RelativeTimeFormat(lang, { style: 'narrow', numeric: 'auto' }))
  return relativeTimeFormats.get(lang).format(-age, unit)
}

function AgentAvatar({ agent, dark, avatarUrl }) {
  const src = avatarUrl(agent.visualSeed, dark, agent.visualIndex)
  if (!src) return null
  return h('img', {
    'data-hcv-subagent-avatar': '', src,
    alt: '', draggable: false, width: 24, height: 24,
  })
}

function Glyph({ name }) {
  return h('span', { 'aria-hidden': true, 'data-hcv-subagent-glyph': name, style: codexIconStyle(name) })
}

function trailingLabel(agent, now, lang, copy) {
  if (agent.status === 'running' && agent.startedAt) return formatDuration((now - agent.startedAt) / 1000)
  if (agent.status === 'completed' && agent.finishedAt) {
    return h('time', { dateTime: new Date(agent.finishedAt).toISOString() }, relativeTime(agent.finishedAt, now, lang))
  }
  return copy.status[agent.status] || null
}

function AgentGroup({ name, title, agents, limit, empty, copy, now, lang, dark, avatarUrl, select, trailing }) {
  const [expanded, setExpanded] = useState(false)
  if (!agents.length && !empty) return null
  const shown = expanded ? agents : agents.slice(0, limit)
  return h('section', { 'data-hcv-subagent-group': name },
    h('h2', null, h('span', null, title + ' · ' + agents.length), trailing && h('small', null, trailing)),
    agents.length ? h('ul', null, shown.map((agent) => {
      const name = goalLabel(agent, copy)
      const preview = !finished(agent) && (agent.activity?.at(-1) || (agent.status === 'running' ? copy.status.running : ''))
      const status = agent.status === 'completed' ? copy.done : copy.status[agent.status]
      const accessibleName = [name, agent.goal, status, preview !== status && preview].filter(Boolean).join('. ')
      return h('li', { key: agent.id },
        h('button', {
          type: 'button', 'data-hcv-subagent-row': agent.id, 'data-status': agent.status,
          'aria-label': accessibleName,
          onClick: () => select(agent.id),
        },
        h(AgentAvatar, { agent, dark, avatarUrl }),
        h('span', { 'data-hcv-subagent-row-body': '' },
          h('span', { 'data-hcv-subagent-row-title': '' },
            h('span', { 'data-hcv-subagent-name': '', title: agent.goal || name, dir: 'auto' }, name),
            h('span', { 'data-hcv-subagent-trailing': '' }, trailingLabel(agent, now, lang, copy))),
          preview && h('span', { 'data-hcv-subagent-preview': '', title: preview, dir: 'auto' }, preview))))
    })) : h('p', { 'data-hcv-subagent-empty': '' }, empty),
    !expanded && agents.length > limit &&
      h('button', { type: 'button', 'data-hcv-subagent-more': '', onClick: () => setExpanded(true) }, copy.more(agents.length - limit)))
}

function textFromContent(value) {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n').trim()
}

function savedResponse(rows) {
  return rows
    .filter(message => message?.role === 'assistant' && !message.display_kind)
    .map(message => ({
      text: textFromContent(message.text ?? message.display_content ?? message.content),
      timestamp: message.timestamp,
    }))
    .filter(message => message.text)
}

function useChildResponse({ subagentId, childSession, status, model, effort }, scope, viewport, tileOwner, shown) {
  const [snapshot, setSnapshot] = useState(null)
  const pane = useRef({ shown, watch: null })
  const key = JSON.stringify([scope, subagentId, childSession])
  useEffect(() => {
    pane.current.shown = shown
    pane.current.watch?.(shown)
  }, [shown])
  useEffect(() => {
    if ((!subagentId && !childSession) || !scope) return
    const [connectionId, profile, parent] = JSON.parse(scope)
    if (childSession === parent) return
    let current = true
    let timer
    let running = !finished({ status })
    let rows = []
    let offset = 0
    let activeRead
    let interrupted = false
    let windowVisibility
    let viewportVisibility
    let complete = false
    let partial = false
    let targetProfile = profile
    let child
    let parentSessionId
    let storedModel = model
    let storedEffort = effort
    let metadataAttempted = false
    const rowId = row => row?.message_uid ?? row?.row_id ?? row?.id
    const sameOwner = () => current && (tileOwner ? tileOwner.isCurrent() :
      host.state.activeSessionId.get() === parent && (host.state.connectionId.get() || null) === connectionId &&
      normalizeProfile(host.state.profile.get()) === profile)
    const visible = () => windowVisibility && !windowVisibility.hidden() &&
      viewport.current?.checkVisibility({ visibilityProperty: true })
    const isCurrent = read => activeRead === read && sameOwner() && visible()
    const publish = (loaded = complete) => {
      complete = loaded
      if (!sameOwner()) return
      const first = rows[0]?.timestamp
      const last = rows.at(-1)?.timestamp
      const elapsed = !running && complete && Number.isFinite(first) && Number.isFinite(last) && last > first
        ? last - first : undefined
      setSnapshot({ key, status, rows: [...rows], messages: savedResponse(rows), complete,
        child, parentSessionId, model: storedModel, effort: storedEffort, elapsed, partial })
    }
    async function read(request) {
      const routes = (tileOwner || connectionId && connectionId !== 'local') && typeof host.profileRoutes === 'function'
        ? await host.profileRoutes().catch(() => []) : []
      if (!isCurrent(request)) return
      const route = tileOwner ? uniqueTileRoute(routes, tileOwner)
        : routes.find(entry => entry.connectionId === connectionId && normalizeProfile(entry.profile) === profile)
      // A tile may use an aliased backend profile. Only the unique host route
      // proves it, including on local connections and across owner changes.
      if (tileOwner && !route) { partial = true; publish(false); return }
      targetProfile = route?.targetProfile ?? profile
      const owner = { ...(connectionId ? { connectionId } : {}), profile: tileOwner?.profile || profile, passive: true, timeoutMs: 8000 }
      if (!subagentId || !window.hermesDesktop?.api) { partial = true; publish(false); return }
      const params = { session_id: tileOwner?.storedId || (host.state.focusedSessionId?.get() === parent
        ? host.state.focusedStoredSessionId?.get() : null) || parent,
        profile: targetProfile, subagent_id: subagentId, order: 'oldest', limit: 1 }
      // The canonical RPC proves the child's ancestry under this parent. Its
      // compact TUI rows omit terminal/MCP output, so they are never presented
      // as a complete transcript. Read full content only after this proof.
      const identity = tileOwner
        ? typeof host.requestProfile === 'function'
          ? await host.requestProfile(route, 'session.transcript', params, 8000)
          : null
        : route && typeof host.requestProfile === 'function'
          ? await host.requestProfile(route, 'session.transcript', params, 8000)
          : await host.request('session.transcript', params, 8000)
      if (!isCurrent(request)) return
      const canonical = identity?.child_session_id
      if (identity?.available !== true || identity.subagent_id !== subagentId ||
          typeof canonical !== 'string' || !canonical || canonical === parent || canonical === params.session_id) {
        rows = []; offset = 0; child = undefined; partial = true; running = false; publish(false); return
      }
      running = identity.running === true
      parentSessionId = params.session_id
      if (child !== canonical) {
        rows = []; offset = 0; metadataAttempted = false; child = canonical
      }
      let readOffset = offset && rowId(rows.at(-1)) != null ? offset - 1 : offset
      let restarts = 0
      while (isCurrent(request)) {
        const query = new URLSearchParams({ profile: targetProfile, order: 'oldest', limit: '100',
          offset: String(readOffset), include_compacted: 'true', inline_images: 'false' })
        const result = await window.hermesDesktop.api({ ...owner,
          path: '/api/sessions/' + encodeURIComponent(child) + '/messages?' + query })
        if (!isCurrent(request)) return
        const page = result?.messages ?? result?.data
        const pagingProven = Array.isArray(page) && result.pagination?.order === 'oldest' &&
          result.pagination?.offset === readOffset && result.pagination?.limit === 100 &&
          result.pagination?.returned === page.length &&
          (!result.profile || normalizeProfile(result.profile) === normalizeProfile(targetProfile))
        if (!pagingProven) { partial = true; publish(false); return }
        // A visible live poll overlaps the last persisted row, so an in-place
        // update replaces that row by durable uid instead of duplicating it.
        // A shortened or rotated window must be reread from its beginning.
        const expected = readOffset === offset - 1 ? rowId(rows.at(-1)) : null
        if (expected != null && rowId(page[0]) !== expected) {
          if (restarts++) { partial = true; publish(false); return }
          rows = []; offset = 0; readOffset = 0; continue
        }
        const merged = mergeAgentTranscript(rows, page)
        const next = readOffset + page.length
        const caughtUp = page.length < 100
        const stalled = page.length > 0 && !caughtUp && next <= offset && merged.length <= rows.length
        rows = merged
        offset = next
        partial = stalled
        publish(caughtUp && !stalled)
        if (caughtUp || stalled) break
        readOffset = next
      }
      if (!isCurrent(request)) return
      if ((!storedModel || !storedEffort) && !metadataAttempted && child) {
        const query = new URLSearchParams({ profile: targetProfile })
        const details = await window.hermesDesktop.api({ ...owner,
          path: '/api/sessions/' + encodeURIComponent(child) + '?' + query }).catch(() => null)
        if (!isCurrent(request)) return
        metadataAttempted = true
        const metadata = agentSessionMetadata(details)
        if (!metadata.profile || normalizeProfile(metadata.profile) === normalizeProfile(targetProfile)) {
          storedModel ||= metadata.model
          storedEffort ||= metadata.effort
          publish()
        }
      }
    }
    const pause = () => {
      window.clearTimeout(timer)
      timer = undefined
      if (activeRead) {
        interrupted = true
        activeRead = undefined
      }
    }
    const poll = async () => {
      if (!sameOwner() || !visible() || activeRead) return
      window.clearTimeout(timer)
      timer = undefined
      const request = activeRead = {}
      interrupted = false
      let retry = false
      try { await read(request) } catch {
        if (isCurrent(request)) { partial = true; publish(false); retry = true }
      }
      if (activeRead !== request) return
      if (!isCurrent(request)) { pause(); return }
      activeRead = undefined
      if (!finished({ status }) || running || retry) timer = window.setTimeout(poll, 2000)
    }
    const reveal = () => {
      if (!sameOwner() || !visible()) { pause(); return }
      if (interrupted || !complete || !finished({ status }) || running) void poll()
    }
    const watchPane = shown => {
      if (Boolean(shown) === Boolean(windowVisibility)) return
      if (shown) {
        windowVisibility = observeWindowVisibility(reveal)
        viewportVisibility = new IntersectionObserver(reveal)
        if (viewport.current) viewportVisibility.observe(viewport.current)
        reveal()
        return
      }
      windowVisibility.dispose()
      windowVisibility = undefined
      viewportVisibility.disconnect()
      viewportVisibility = undefined
      pause()
    }
    // A mounted tab keeps its transcript and its paging position while hidden.
    pane.current.watch = watchPane
    watchPane(pane.current.shown)
    return () => {
      current = false
      pane.current.watch = null
      watchPane(false)
    }
  }, [subagentId, childSession, scope, status, key, model, effort, viewport, tileOwner?.storedId, tileOwner?.surface, tileOwner?.view, tileOwner?.connectionId, tileOwner?.profile])
  return snapshot?.key === key ? snapshot : null
}

function AgentDetail({ agent, scope, now, copy, lang, dark, avatarUrl, onBack, nativeActions, openNativeAgent, onIdentity, tileOwner, shown }) {
  const back = useRef(null)
  useLayoutEffect(() => { back.current?.focus({ preventScroll: true }) }, [])
  const viewport = useRef(null)
  useLayoutEffect(() => attachAgentTranscriptScroll(viewport.current), [])
  const snapshot = useChildResponse(agent, scope, viewport, tileOwner, shown)
  useEffect(() => {
    if (!agent.visualSeed && agent.subagentId && snapshot?.child) onIdentity?.(scope, agent.subagentId, snapshot.child)
  }, [agent.visualSeed, agent.subagentId, snapshot?.child, scope, onIdentity])
  const [savedChanges, setSavedChanges] = useState(null)
  const [changesRevision, setChangesRevision] = useState(0)
  useEffect(() => {
    let current = true
    const child = snapshot?.child
    if (tileOwner || !child || !snapshot?.complete || snapshot.partial || !finished(agent) || !sameTurnHistoryOwner(scope)) {
      setSavedChanges(null)
      return
    }
    const parent = snapshot.parentSessionId
    if (!parent) return
    void readSavedTurnChanges(scope, child, parent).then(value => {
      if (current && sameTurnHistoryOwner(scope)) setSavedChanges({ scope, child, parent, value })
    }).catch(() => {})
    return () => { current = false }
  }, [scope, snapshot?.child, snapshot?.parentSessionId, snapshot?.complete, snapshot?.partial, agent.status, tileOwner?.storedId, changesRevision])
  const completed = finished(agent)
  const model = [agentModelDisplayName(agent.model || snapshot?.model), agentReasoningEffortName(agent.effort || snapshot?.effort, lang)].filter(Boolean).join(' · ')
  const elapsed = agent.durationSeconds ?? snapshot?.elapsed ??
    (agent.startedAt && ((agent.finishedAt || now) - agent.startedAt) / 1000)
  const durationLabel = elapsed == null ? null
    : (completed || snapshot?.elapsed != null ? copy.worked : copy.elapsed)(formatDuration(elapsed))
  const statusLabel = copy.status[agent.status]
  const source = snapshot?.rows.length ? 'transcript' : agent.summary ? 'summary' : undefined
  const result = source === 'transcript' ? snapshot.messages : source === 'summary' ? [{ text: agent.summary }] : []
  const transcriptRows = source === 'transcript' ? snapshot.rows :
    agent.summary ? [{ role: 'assistant', text: agent.summary }] : []
  const hasTask = transcriptRows.some(row => row.role === 'user')
  const shownRows = !hasTask && agent.goal ? [{ role: 'user', text: agent.goal }, ...transcriptRows] : transcriptRows
  const openable = snapshot?.child ? { ...agent, childSession: snapshot.child, lifecycleChild: true } : agent
  const destinations = nativeActions(openable, scope)
  const readsHistory = agent.subagentId || (agent.childSession && window.hermesDesktop?.api)
  const loading = Boolean(readsHistory && (!snapshot || snapshot.status !== agent.status || !snapshot.complete))
  const label = goalLabel(agent, copy)
  const actions = (result.length > 0 || destinations.length > 0) && h('div', { 'data-hcv-subagent-actions': '' },
    result.length > 0 && h(CopyButton, {
      label: copy.copy, text: result.map(({ text }) => text).join('\n\n'), appearance: 'icon', buttonSize: 'icon-sm',
    }),
    destinations.map(action => h('button', { key: action, type: 'button', 'data-hcv-subagent-native': action,
      'aria-label': copy[action], title: copy[action], onClick: () => openNativeAgent(openable, scope, action) },
    h(Glyph, { name: action === 'native' ? 'open' : 'chatTab' }))),
)
  return h('div', { 'data-hcv-subagent-detail': '' },
    h('header', { 'data-hcv-subagent-header': '' },
      h('button', {
        ref: back, type: 'button', 'aria-label': copy.back, title: copy.back,
        'data-hcv-subagent-back': '', onClick: onBack,
      }, h(Glyph, { name: 'back' })),
      h(AgentAvatar, { agent, dark, avatarUrl }),
      h('h2', { 'data-hcv-subagent-name': '', title: label, dir: 'auto' }, label),
      model && h('span', { 'data-hcv-subagent-model': '', title: model }, model)),
    h('div', { ref: viewport, 'data-hcv-subagent-feed': '' },
      h('div', { 'data-hcv-subagent-column': '' },
        h('div', { role: 'group', 'aria-label': copy.result, 'data-hcv-subagent-result': '', 'data-source': source },
          shownRows.length ? h(AgentTranscript, { rows: shownRows, lang, durationLabel, nowMs: now,
            historyComplete: snapshot?.complete === true && !snapshot?.partial,
            changes: savedChanges?.scope === scope && savedChanges?.child === snapshot?.child &&
              savedChanges?.parent === snapshot?.parentSessionId && snapshot?.complete && !snapshot.partial
              ? savedChanges.value.turns : [],
            sameOwner: () => sameTurnHistoryOwner(scope),
            onReview: (selected, path) => openSavedTurnDiff(scope, selected, path),
            onResult: notifySavedTurnOutcome,
            onError: (_, action) => { notifySavedTurnOutcome(null, action); setChangesRevision(value => value + 1) },
            onApply: (selected, action) => applySavedTurnChanges(scope, snapshot.child, snapshot.parentSessionId, selected, action) })
            : h('p', { role: 'status', 'data-hcv-subagent-empty': '' }, snapshot?.status === agent.status && snapshot.partial ? copy.partial
              : loading ? copy.loading : !completed && statusLabel ? statusLabel : copy.noResult)),
        (loading || snapshot?.partial) && shownRows.length > 0 && h('p', { role: 'status', 'data-hcv-subagent-meta': '' },
          snapshot?.partial ? copy.partial : copy.loading),
        actions)))
}

export function AgentPane({ agents, scope, lang, dark, avatarUrl, nativeActions, openNativeAgent, selection, selectAgent, onIdentity, tileOwner, shown }) {
  const copy = labels[lang]
  const [localSelected, setLocalSelected] = useState(null)
  const selected = selection?.scope === scope ? selection.id : selectAgent ? null : localSelected
  const setSelected = id => selectAgent ? selectAgent(id) : setLocalSelected(id)
  const pane = useRef(null)
  const returning = useRef(null)
  const [now, setNow] = useState(Date.now)
  const agent = agents.find((item) => item.id === selected)
  const running = agents.some(({ status, startedAt }) => status === 'running' && startedAt)
  const clock = running ? 1000 : agents.some(({ finishedAt }) => finishedAt) ? 60000 : 0
  useEffect(() => {
    if (!clock || !shown) return
    let timer
    const update = () => {
      window.clearTimeout(timer)
      if (visibility.hidden()) return
      if (pane.current?.checkVisibility({ visibilityProperty: true })) setNow(Date.now())
      timer = window.setTimeout(update, clock)
    }
    const visibility = observeWindowVisibility(update)
    update()
    return () => {
      window.clearTimeout(timer)
      visibility.dispose()
    }
  }, [clock, shown])
  useLayoutEffect(() => {
    if (!agent && returning.current !== null) {
      const rows = Array.from(pane.current?.querySelectorAll('[data-hcv-subagent-row]') || [])
      const row = rows.find((item) => item.dataset.hcvSubagentRow === returning.current) ?? rows[0]
      returning.current = null
      row?.focus({ preventScroll: true })
    }
  }, [agent])
  const ordered = [...agents].sort((first, second) => recency(second) - recency(first))
  const active = ordered.filter((item) => !finished(item))
  const done = ordered.filter(finished)
  const waiting = active.filter(({ status }) => status === 'queued').length
  const group = { copy, now, lang, dark, avatarUrl, select: setSelected }
  return h('section', { ref: pane, 'data-hcv-subagents-pane': '', 'aria-label': copy.title },
    h('div', { 'data-hcv-subagent-list': '', hidden: Boolean(agent) },
      h('div', { 'data-hcv-subagent-column': '' },
        h(AgentGroup, { ...group, name: 'active', title: copy.active, agents: active, limit: 4,
          empty: copy.noActive, trailing: waiting ? copy.waitingCount(waiting) : null }),
        h(AgentGroup, { ...group, name: 'done', title: copy.done, agents: done, limit: 10 }))),
    agent && h(AgentDetail, { key: agent.id, agent, scope, now, copy, lang, dark, avatarUrl, nativeActions, openNativeAgent, onIdentity, tileOwner, shown,
      onBack: () => { returning.current = agent.id; setSelected(null) } }))
}

export function agentPaneStyles(active) {
  const pane = active + ' [data-hcv-subagents-pane]'
  const response = pane + ' [data-hcv-subagent-result]'
  // Codex Desktop 26.1111.2228.0: bw7M owns the header. The response uses the
  // regular conversation and Markdown layout (eHCS, 0cf36033c2f9.css).
  return `
${pane} {
  display: flex; flex-direction: column; block-size: 100%; min-block-size: 0; min-inline-size: 0;
  --hcv-activity-foreground: light-dark(#1a1c1f, #dfdfdf);
  color: var(--hcv-activity-foreground); background: var(--hcv-chat, var(--background));
  font-family: var(--hcv-ui-font, var(--font-sans));
  --hcv-agent-muted: var(--hcv-muted, var(--muted-foreground));
  --hcv-agent-tertiary: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%));
  --hcv-agent-row-hover: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 6%));
  --hcv-agent-divider: var(--hcv-hairline, var(--border));
}
${pane} [hidden] { display: none !important; }
${pane} :is([data-hcv-subagent-list], [data-hcv-subagent-feed]) { min-block-size: 0; flex: 1; overflow: auto; }
${pane} [data-hcv-subagent-list] { padding: 20px 12px; }
${pane} [data-hcv-subagent-column] { margin-inline: auto; max-inline-size: var(--thread-content-max-width, 48rem); }
${pane} [data-hcv-subagent-group="done"] { margin-block-start: 24px; }
${pane} [data-hcv-subagent-group] h2 {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 0 0 8px; padding-inline: 8px; color: var(--hcv-agent-tertiary);
  font-size: 13px; font-weight: 430; line-height: 18.5714px;
}
${pane} [data-hcv-subagent-group] h2 > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${pane} [data-hcv-subagent-group] h2 small { flex: none; font-size: 12px; font-variant-numeric: tabular-nums; }
${pane} [data-hcv-subagent-group] ul { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
${pane} [data-hcv-subagent-row] {
  display: flex; align-items: flex-start; gap: 12px; min-block-size: 40px; inline-size: 100%;
  padding: 8px; border: 0; border-radius: 10px; background: transparent; text-align: start; cursor: pointer;
}
${pane} [data-hcv-subagent-row]:not(:has([data-hcv-subagent-preview])) { align-items: center; }
${pane} [data-hcv-subagent-avatar] { display: block; inline-size: 24px; block-size: 24px; flex: none; }
${pane} [data-hcv-subagent-row-body] { display: block; min-inline-size: 0; flex: 1; }
${pane} [data-hcv-subagent-row-title] { display: flex; align-items: center; gap: 8px; min-block-size: 24px; font-size: 13px; line-height: 20px; }
${pane} :is([data-hcv-subagent-name], [data-hcv-subagent-model], [data-hcv-subagent-preview]) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${pane} [data-hcv-subagent-name] { min-inline-size: 0; flex: 1; unicode-bidi: plaintext; }
${pane} [data-hcv-subagent-trailing] { flex: none; color: var(--hcv-agent-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
${pane} [data-hcv-subagent-trailing]:empty { display: none; }
${pane} :is([data-hcv-subagent-empty], [data-hcv-subagent-preview]) { color: var(--hcv-agent-muted); font-size: 13px; line-height: 20px; }
${pane} [data-hcv-subagent-empty] { margin: 0; padding: 4px 8px; color: var(--hcv-agent-tertiary); }
${pane} [data-hcv-subagent-preview] { display: block; unicode-bidi: plaintext; }
${pane} [data-hcv-subagent-more] {
  margin-block-start: 8px; margin-inline-start: 44px; min-block-size: 26px; padding-inline: 6px;
  border-radius: 8px; color: var(--hcv-agent-muted); font-size: 13px; cursor: pointer;
}
${pane} [data-hcv-subagent-detail] { display: flex; flex: 1; flex-direction: column; min-block-size: 0; }
${pane} [data-hcv-subagent-header] {
  display: flex; align-items: center; gap: 8px; min-inline-size: 0; min-block-size: 40px;
  padding: 0 16px; border-block-end: 1px solid var(--hcv-agent-divider); flex: none;
}
${pane} [data-hcv-subagent-header] h2 { margin: 0; font-size: 13px; font-weight: 500; line-height: 20px; }
${pane} [data-hcv-subagent-model] { flex: 0 1 auto; max-inline-size: 50%; color: var(--hcv-agent-tertiary); font-size: 12px; }
${pane} [data-hcv-subagent-back] {
  display: grid; place-items: center; inline-size: 24px; block-size: 24px; flex: none;
  border-radius: 8px; color: var(--hcv-agent-muted); cursor: pointer;
}
${pane} [data-hcv-subagent-glyph] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
${pane} [data-hcv-subagent-back]:dir(rtl) > span { transform: scaleX(-1); }
${pane} [data-hcv-subagent-feed] {
  overflow-anchor: none;
  --codex-chat-font-size: 14px;
  --codex-chat-code-font-size: 12px;
  --thread-content-max-width: 48rem;
  --hcv-agent-prose: light-dark(#1a1c1f, #dfdfdf);
  padding: 32px 20px 24px;
}
${pane} :is([data-hcv-subagent-meta], [data-hcv-subagent-activity-log], [data-hcv-subagent-task]) {
  margin: 0 0 16px; color: var(--hcv-agent-tertiary); font-size: var(--codex-chat-font-size);
  line-height: 1.5; font-variant-numeric: tabular-nums;
}
${pane} :is([data-hcv-subagent-activity-log], [data-hcv-subagent-task]) summary { display: flex; inline-size: fit-content; align-items: center; gap: 4px; list-style: none; cursor: pointer; }
${pane} :is([data-hcv-subagent-activity-log], [data-hcv-subagent-task]) summary > span { inline-size: 12px; block-size: 12px; }
${pane} :is([data-hcv-subagent-activity-log], [data-hcv-subagent-task]) summary::-webkit-details-marker { display: none; }
${pane} :is([data-hcv-subagent-activity-log], [data-hcv-subagent-task])[open] summary > span { rotate: 90deg; }
${pane} [data-hcv-subagent-task] p { margin: 8px 0 0; color: var(--hcv-agent-prose); white-space: pre-wrap; overflow-wrap: anywhere; unicode-bidi: plaintext; }
${pane} [data-hcv-subagent-activity-log] ul { padding-inline-start: 24px; margin: 4px 0; overflow-wrap: anywhere; }
${response} {
  min-inline-size: 0; color: var(--hcv-agent-prose);
  font-size: var(--codex-chat-font-size); font-weight: 430; line-height: 1.625; overflow-wrap: anywhere;
}
${response} > div + div { margin-block-start: 16px; }
${pane} [data-hcv-subagent-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-block-start: 8px; }
${pane} [data-hcv-subagent-actions] button {
  display: inline-grid; place-items: center; inline-size: 24px; block-size: 24px;
  padding: 0; border-radius: 8px; color: var(--hcv-agent-muted); cursor: pointer;
}
${pane} [data-hcv-subagent-actions] time { font-size: 12px; color: var(--hcv-agent-tertiary); font-variant-numeric: tabular-nums; }
${pane} :is(button, summary):focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
${pane} button:is(:hover, :focus-visible) { background: var(--hcv-agent-row-hover); color: var(--hcv-activity-foreground); }
${pane} summary:is(:hover, :focus-visible) { color: var(--hcv-activity-foreground); }
${pane} :is([data-hcv-subagent-row], [data-hcv-subagent-back]):is(:hover, :focus-visible) {
  background: var(--hcv-agent-row-hover);
}
${pane} :is([data-hcv-subagent-row], [data-hcv-subagent-back]):focus-visible { outline-offset: 0; }
@media (forced-colors: active) {
  ${pane} :is(button, summary):focus-visible { outline-color: Highlight; }
  ${pane} [data-hcv-subagent-glyph] { forced-color-adjust: none; color: ButtonText; }
}
` + agentTranscriptStyles(pane)
}
