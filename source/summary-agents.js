import { CopyButton, host, reasoningEffortLabel, Streamdown } from '@hermes/plugin-sdk'
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { codexIconStyle } from './codex-reference.js'

const labels = {
  ru: {
    title: 'Субагенты', active: 'Активные', done: 'Готово', noActive: 'Нет активных субагентов',
    back: 'Назад к субагентам', fallback: 'Субагент',
    waitingCount: (count) => new Intl.PluralRules('ru').select(count) === 'one' ? count + ' ожидает' : count + ' ожидают',
    more: (count) => 'Показать ещё ' + count, worked: (time) => 'Работал на протяжении ' + time,
    elapsed: (time) => 'Работает уже ' + time, activity: 'Активность', result: 'Результат',
    loading: 'Загрузка ответа…', noResult: 'Результат пока недоступен', copy: 'Копировать',
    native: 'Открыть подробности в Hermes', receipt: 'Открыть отчёт в чате',
    status: { running: 'Работает', queued: 'Ожидает', dispatched: 'Передано', failed: 'Ошибка', interrupted: 'Прервано' },
  },
  en: {
    title: 'Subagents', active: 'Active', done: 'Done', noActive: 'No active subagents',
    back: 'Back to subagents', fallback: 'Subagent', waitingCount: (count) => count + ' waiting',
    more: (count) => 'Show ' + count + ' more', worked: (time) => 'Worked for ' + time,
    elapsed: (time) => 'Working for ' + time, activity: 'Activity', result: 'Result',
    loading: 'Loading response…', noResult: 'Result unavailable', copy: 'Copy',
    native: 'Open details in Hermes', receipt: 'Open report in chat',
    status: { running: 'Working', queued: 'Waiting', dispatched: 'Dispatched', failed: 'Failed', interrupted: 'Interrupted' },
  },
}

const finished = ({ status }) => ['completed', 'failed', 'interrupted'].includes(status)
const recency = (agent) => agent.updatedAt ?? agent.finishedAt ?? agent.startedAt ?? 0
const goalLabel = (agent, copy) => agent.goal || copy.fallback
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
  return new Intl.RelativeTimeFormat(lang, { style: 'narrow', numeric: 'auto' }).format(-age, unit)
}

function AgentAvatar({ agent, dark, avatarUrl }) {
  return h('img', {
    'data-hcv-subagent-avatar': '', src: avatarUrl(agent.seed, dark),
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
      const goal = goalLabel(agent, copy)
      const preview = !finished(agent) && (agent.activity?.at(-1) || (agent.status === 'running' ? copy.status.running : ''))
      return h('li', { key: agent.id },
        h('button', {
          type: 'button', 'data-hcv-subagent-row': agent.id, 'data-status': agent.status,
          onClick: () => select(agent.id),
        },
        h(AgentAvatar, { agent, dark, avatarUrl }),
        h('span', { 'data-hcv-subagent-row-body': '' },
          h('span', { 'data-hcv-subagent-row-title': '' },
            h('span', { 'data-hcv-subagent-name': '', title: goal, dir: 'auto' }, goal),
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

function liveActivity(history, live) {
  // The saved transcript has tool names; live events can add their previews.
  // Keep the older history and replace its overlapping tail with live entries.
  let overlap = Math.min(history.length, live.length)
  while (overlap && !history.slice(-overlap).every((step, index) =>
    live[index] === step || live[index].startsWith(step + ' · '))) overlap--
  return [...history.slice(0, history.length - overlap), ...live]
}

function useChildResponse({ subagentId, childSession, status, model }, scope) {
  const [snapshot, setSnapshot] = useState(null)
  const key = JSON.stringify([scope, subagentId, childSession])
  useEffect(() => {
    if ((!subagentId && !childSession) || !scope) return
    const [connectionId, profile, parent] = JSON.parse(scope)
    if (childSession === parent) return
    let current = true
    // Both the child id and the owner come from the native delegation. Do not
    // read a child through whichever gateway happens to be selected later.
    const sameOwner = () => current && host.state.activeSessionId.get() === parent &&
      (host.state.connectionId.get() || null) === connectionId &&
      normalizeProfile(host.state.profile.get()) === profile
    async function read() {
      if (!sameOwner()) return
      const routes = connectionId && connectionId !== 'local' ? await host.profileRoutes().catch(() => []) : []
      if (!sameOwner()) return
      const route = routes.find((entry) => entry.connectionId === connectionId && normalizeProfile(entry.profile) === profile)
      const targetProfile = route?.targetProfile ?? profile
      const owner = { ...(connectionId ? { connectionId } : {}), profile, passive: true, timeoutMs: 8000 }
      if (subagentId) {
        const stored = host.state.focusedSessionId?.get() === parent ? host.state.focusedStoredSessionId?.get() : null
        try {
          const history = await host.request('session.transcript', {
            session_id: stored || parent, profile: targetProfile, subagent_id: subagentId, order: 'latest', limit: 100,
          }, 8000)
          if (!sameOwner()) return
          const rows = history?.available === true && history.subagent_id === subagentId && Array.isArray(history.rows)
            ? history.rows : []
          const steps = rows.filter(row => row?.role === 'tool' && typeof row.name === 'string').map(row => row.name).slice(-40)
          const start = rows[0]?.timestamp
          const end = rows.at(-1)?.timestamp
          const elapsed = history?.running === false && history.next_cursor == null && Number.isFinite(start) && Number.isFinite(end) && end > start
            ? end - start : undefined
          const child = rows.length && typeof history.child_session_id === 'string' ? history.child_session_id : null
          const saved = { key, status, messages: savedResponse(rows), steps, elapsed, child }
          setSnapshot(saved)
          if (!model && child && child !== parent && window.hermesDesktop?.api) {
            const query = new URLSearchParams({ profile: targetProfile })
            const details = await window.hermesDesktop.api({
              ...owner, path: '/api/sessions/' + encodeURIComponent(child) + '?' + query,
            }).catch(() => null)
            if (sameOwner() && typeof details?.model === 'string') setSnapshot({ ...saved, model: details.model })
          }
          return
        } catch (error) {
          // Prior gateways expose the child's history by session id. A
          // canonical refusal is final, including when the child isn't owned.
          if (error?.code !== -32601 && !/method not found|unknown method/i.test(error?.message || '')) throw error
        }
      }
      if (!sameOwner()) return
      if (!childSession || !window.hermesDesktop?.api) {
        setSnapshot({ key, status, messages: [] })
        return
      }
      const query = new URLSearchParams({ profile: targetProfile, order: 'latest', limit: '80', include_compacted: 'true' })
      const result = await window.hermesDesktop.api({
        ...owner,
        path: '/api/sessions/' + encodeURIComponent(childSession) + '/messages?' + query,
      })
      if (!sameOwner()) return
      const history = result?.messages ?? result?.data
      const available = Array.isArray(history) &&
        (!result.profile || normalizeProfile(result.profile) === normalizeProfile(targetProfile))
      setSnapshot({ key, status, messages: available ? savedResponse(history) : [] })
    }
    void read().catch(() => { if (sameOwner()) setSnapshot({ key, status, messages: [] }) })
    return () => { current = false }
  }, [subagentId, childSession, scope, status, key, model])
  return snapshot?.key === key ? snapshot : null
}

// Do not load remote images or route local files outside the native transcript.
const markdownComponents = {
  img: ({ alt }) => alt ? h('span', null, alt) : null,
  a: ({ children, href }) => /^https?:\/\//i.test(href || '')
    ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, children)
    : h('span', null, children),
  table: ({ node, ...props }) => h('div', { 'data-hcv-subagent-table': '' }, h('table', props)),
}

function responseMarkdown(text) {
  // The transcript may contain a JSON report without a Markdown fence. Keep
  // its original whitespace and values for display, and copy the stored text.
  if (!text.startsWith('{') && !text.startsWith('[')) return text
  try {
    JSON.parse(text)
    return '```json\n' + text + '\n```'
  } catch {
    return text
  }
}

function AgentDetail({ agent, scope, now, copy, lang, dark, avatarUrl, onBack, nativeActions, openNativeAgent }) {
  const back = useRef(null)
  useLayoutEffect(() => { back.current?.focus({ preventScroll: true }) }, [])
  const snapshot = useChildResponse(agent, scope)
  const completed = finished(agent)
  const model = [agent.model || snapshot?.model, agent.effort && reasoningEffortLabel(agent.effort)].filter(Boolean).join(' · ')
  const elapsed = agent.durationSeconds ?? snapshot?.elapsed ??
    (agent.startedAt && ((agent.finishedAt || now) - agent.startedAt) / 1000)
  const durationLabel = elapsed == null ? null
    : (completed || snapshot?.elapsed != null ? copy.worked : copy.elapsed)(formatDuration(elapsed))
  const statusLabel = copy.status[agent.status]
  const history = snapshot?.steps || []
  const live = agent.activity || []
  const activity = !completed || snapshot?.status !== agent.status
    ? liveActivity(history, live)
    : history.length ? history : live
  const source = snapshot?.messages.length ? 'transcript' : agent.summary ? 'summary' : undefined
  const result = source === 'transcript' ? snapshot.messages : source === 'summary' ? [{ text: agent.summary }] : []
  const timestamp = result.at(-1)?.timestamp
  const writtenAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : null
  const openable = snapshot?.child ? { ...agent, childSession: snapshot.child, lifecycleChild: true } : agent
  const destinations = nativeActions(openable, scope)
  const readsHistory = agent.subagentId || (agent.childSession && window.hermesDesktop?.api)
  const loading = Boolean(readsHistory && (!snapshot || snapshot.status !== agent.status))
  const label = goalLabel(agent, copy)
  const actions = (result.length > 0 || destinations.length > 0) && h('div', { 'data-hcv-subagent-actions': '' },
    result.length > 0 && h(CopyButton, {
      label: copy.copy, text: result.map(({ text }) => text).join('\n\n'), appearance: 'icon', buttonSize: 'icon-sm',
    }),
    destinations.map(action => h('button', { key: action, type: 'button', 'data-hcv-subagent-native': action,
      'aria-label': copy[action], title: copy[action], onClick: () => openNativeAgent(openable, scope, action) },
    h(Glyph, { name: action === 'native' ? 'open' : 'chatTab' }))),
    writtenAt && Number.isFinite(writtenAt.valueOf()) && h('time', { dateTime: writtenAt.toISOString() },
      writtenAt.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })))
  return h('div', { 'data-hcv-subagent-detail': '' },
    h('header', { 'data-hcv-subagent-header': '' },
      h('button', {
        ref: back, type: 'button', 'aria-label': copy.back, title: copy.back,
        'data-hcv-subagent-back': '', onClick: onBack,
      }, h(Glyph, { name: 'back' })),
      h(AgentAvatar, { agent, dark, avatarUrl }),
      h('h2', { 'data-hcv-subagent-name': '', title: label, dir: 'auto' }, label),
      model && h('span', { 'data-hcv-subagent-model': '', title: model }, model)),
    h('div', { 'data-hcv-subagent-feed': '' },
      h('div', { 'data-hcv-subagent-column': '' },
        activity.length
          ? h('details', { 'data-hcv-subagent-activity-log': '' },
            h('summary', null, durationLabel || copy.activity, h(Glyph, { name: 'right' })),
            h('ul', null, activity.map((text, index) => h('li', { key: index, dir: 'auto' }, text))))
          : durationLabel && h('p', { 'data-hcv-subagent-meta': '' }, durationLabel),
        h('div', { role: 'group', 'aria-label': copy.result, 'data-hcv-subagent-result': '', 'data-source': source },
          result.length ? result.map(({ text }, index) => h('div', { key: index, dir: 'auto' },
            h(Streamdown, {
              className: 'hcv-subagent-markdown', components: markdownComponents, controls: false,
              mode: 'static', parseIncompleteMarkdown: false,
            }, responseMarkdown(text))))
            : h('p', { role: 'status', 'data-hcv-subagent-empty': '' }, loading ? copy.loading
              : !completed && statusLabel ? statusLabel : copy.noResult)),
        actions)))
}

export function AgentPane({ agents, scope, lang, dark, avatarUrl, nativeActions, openNativeAgent }) {
  const copy = labels[lang]
  const [selected, setSelected] = useState(null)
  const pane = useRef(null)
  const returning = useRef(null)
  const [now, setNow] = useState(Date.now)
  const agent = agents.find((item) => item.id === selected)
  const running = agents.some(({ status, startedAt }) => status === 'running' && startedAt)
  const clock = running ? 1000 : agents.some(({ finishedAt }) => finishedAt) ? 60000 : 0
  useEffect(() => {
    if (!clock) return
    const update = () => {
      if (document.visibilityState !== 'hidden' && pane.current?.checkVisibility({ visibilityProperty: true })) setNow(Date.now())
    }
    update()
    const timer = window.setInterval(update, clock)
    return () => window.clearInterval(timer)
  }, [clock])
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
    agent && h(AgentDetail, { key: agent.id, agent, scope, now, copy, lang, dark, avatarUrl, nativeActions, openNativeAgent,
      onBack: () => { returning.current = agent.id; setSelected(null) } }))
}

export function agentPaneStyles(active) {
  const pane = active + ' [data-hcv-subagents-pane]'
  const response = pane + ' [data-hcv-subagent-result]'
  const prose = response + ' .hcv-subagent-markdown'
  const code = prose + ' [data-streamdown="code-block"]'
  // Codex Desktop 26.1111.2228.0: bw7M owns the header. The response uses the
  // regular conversation and Markdown layout (eHCS, 0cf36033c2f9.css).
  return `
${pane} {
  display: flex; flex-direction: column; block-size: 100%; min-block-size: 0; min-inline-size: 0;
  color: var(--hcv-text, var(--foreground)); background: var(--hcv-chat, var(--background));
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
  --codex-chat-font-size: 14px;
  --codex-chat-code-font-size: 12px;
  --thread-content-max-width: 48rem;
  --hcv-agent-prose: light-dark(#1a1c1f, #dfdfdf);
  --hcv-agent-mono: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  padding: 32px 20px 24px;
}
${pane} :is([data-hcv-subagent-meta], [data-hcv-subagent-activity-log]) {
  margin: 0 0 16px; color: var(--hcv-agent-tertiary); font-size: var(--codex-chat-font-size);
  line-height: 1.5; font-variant-numeric: tabular-nums;
}
${pane} [data-hcv-subagent-activity-log] summary { display: flex; inline-size: fit-content; align-items: center; gap: 4px; list-style: none; cursor: pointer; }
${pane} [data-hcv-subagent-activity-log] summary > span { inline-size: 12px; block-size: 12px; }
${pane} [data-hcv-subagent-activity-log] summary::-webkit-details-marker { display: none; }
${pane} [data-hcv-subagent-activity-log][open] summary > span { rotate: 90deg; }
${pane} [data-hcv-subagent-activity-log] ul { padding-inline-start: 24px; margin: 4px 0; overflow-wrap: anywhere; }
${response} {
  min-inline-size: 0; color: var(--hcv-agent-prose);
  font-size: var(--codex-chat-font-size); font-weight: 430; line-height: 1.625; overflow-wrap: anywhere;
}
${response} > div + div { margin-block-start: 16px; }
${prose} { display: flex; flex-direction: column; gap: 1em; min-inline-size: 0; }
${prose} > * { margin-block: 0; }
${prose} p { margin-block: 0; }
${prose} :is(strong, [data-streamdown="strong"]) { font-weight: 600; }
${prose} :is(h1, h2, h3, h4, h5, h6) { font-weight: 600; line-height: 1.375; }
${prose} h1 { font-size: 1.5em; }
${prose} h2 { font-size: 1.25em; }
${prose} h3 { font-size: 1.125em; }
${prose} :is(h4, h5, h6) { font-size: 1em; }
${prose} :is(ul, ol) { padding-inline-start: 1.5em; }
${prose} li + li { margin-block-start: .25em; }
${prose} blockquote { border-inline-start: 2px solid var(--hcv-agent-divider); padding-inline-start: .86em; }
${prose} a { color: light-dark(#0169cc, #8ec8f8); text-decoration: none; }
${prose} a:hover { text-decoration: underline; }
${prose} [data-streamdown="inline-code"] {
  font-family: var(--hcv-agent-mono); font-size: .92em; font-weight: 400;
  padding: 1px 6px; border-radius: 6px; box-decoration-break: clone;
}
${code} {
  min-inline-size: 0; border: 1px solid var(--hcv-agent-divider); border-radius: 10px;
  background: light-dark(#f6f6f6, #202020);
}
${code} [data-streamdown="code-block-header"] {
  padding: 6px 12px; border-block-end: 1px solid var(--hcv-agent-divider);
  font: 400 12px/18px var(--hcv-ui-font); color: var(--hcv-agent-tertiary);
}
${code} [data-streamdown="code-block-body"] {
  border: 0; border-radius: 0; background: transparent; padding: 12px;
  max-inline-size: 100%; overflow: auto;
}
${code} :is(pre, code) {
  margin: 0; background: transparent; font: 400 var(--codex-chat-code-font-size)/1.625 var(--hcv-agent-mono);
}
${prose} [data-hcv-subagent-table] { margin: 0; min-inline-size: 0; }
${pane} [data-hcv-subagent-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-block-start: 8px; }
${pane} [data-hcv-subagent-actions] button {
  display: inline-grid; place-items: center; inline-size: 24px; block-size: 24px;
  padding: 0; border-radius: 8px; color: var(--hcv-agent-muted); cursor: pointer;
}
${pane} [data-hcv-subagent-actions] time { font-size: 12px; color: var(--hcv-agent-tertiary); font-variant-numeric: tabular-nums; }
${pane} :is(button, summary):focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
${pane} button:is(:hover, :focus-visible) { background: var(--hcv-agent-row-hover); color: var(--hcv-text, var(--foreground)); }
${pane} summary:is(:hover, :focus-visible) { color: var(--hcv-text, var(--foreground)); }
${pane} :is([data-hcv-subagent-row], [data-hcv-subagent-back]):is(:hover, :focus-visible) {
  background: var(--hcv-agent-row-hover);
}
${pane} :is([data-hcv-subagent-row], [data-hcv-subagent-back]):focus-visible { outline-offset: 0; }
@media (forced-colors: active) {
  ${pane} :is(button, summary):focus-visible { outline-color: Highlight; }
  ${pane} [data-hcv-subagent-glyph] { forced-color-adjust: none; color: ButtonText; }
}
`
}
