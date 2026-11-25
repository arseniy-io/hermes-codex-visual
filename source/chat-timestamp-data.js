// Codex Desktop 26.1117.3838.0: 121693.77be527e89.js, dMTK.AR/a7.
// Groups are turn descriptions, never individual commentary/tool messages.
export function timestampSeparatorTimes(groups, nowMs = Date.now()) {
  let previous = null
  let hasSeenUser = false
  return groups.map(group => {
    if (group == null) { previous = null; hasSeenUser = true; return null }
    let selected = null
    for (const current of group) {
      if (current.breaksPreviousAdjacency) previous = null
      if (selected == null && current.opensExchange !== false &&
          current.sentAtMs != null && Number.isFinite(current.sentAtMs) &&
          ((current.role === 'user' && !hasSeenUser && nowMs - current.sentAtMs > 3_600_000) ||
            (previous?.role === 'assistant' && previous.sentAtMs != null && Number.isFinite(previous.sentAtMs) &&
              current.sentAtMs - previous.sentAtMs > (current.role === 'user' ? 3_600_000 : 600_000)))) {
        selected = current.sentAtMs
      }
      hasSeenUser ||= current.role === 'user'
      previous = current
    }
    return selected
  })
}

export function timestampSeparatorParts(sentAtMs, lang = 'ru', nowMs = Date.now()) {
  if (!Number.isFinite(sentAtMs)) return null
  const sent = new Date(sentAtMs)
  const now = new Date(nowMs)
  if (!Number.isFinite(sent.getTime()) || !Number.isFinite(now.getTime())) return null
  const day = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
  const age = Math.max((day(now) - day(sent)) / 86_400_000, 0)
  const includeAt = age > 7
  let date
  if (age <= 1) {
    date = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-age, 'day')
    if (lang.startsWith('en')) date = date.charAt(0).toUpperCase() + date.slice(1)
  } else date = new Intl.DateTimeFormat(lang, age <= 7 ? { weekday: 'long' }
    : age <= 365 ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }).format(sent)
  const time = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).format(sent)
  const join = lang.startsWith('ru') ? (includeAt ? ' в ' : ', ') : (includeAt ? ' at ' : ' ')
  return { date, time, includeAt, join, label: date + join + time, iso: sent.toISOString() }
}

function object(value) {
  if (typeof value === 'string') { try { return JSON.parse(value) } catch { return null } }
  return value && typeof value === 'object' ? value : null
}

export function savedTimelineMetadata(row) {
  const value = object(object(row?.display_metadata)?.hcv_timeline)
  if (value?.version !== 1 || typeof value.turnId !== 'string' || !value.turnId ||
      !Number.isFinite(value.turnStartedAtMs)) return null
  return value
}
