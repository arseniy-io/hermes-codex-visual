// Tile identities are the renderer view and BOTH session IDs plus their
// connection/profile. A reused runtime ID alone does not identify a tab.
export function sameTileTarget(left, right) {
  return Boolean(left && right && left.surface === right.surface && left.view === right.view &&
    left.runtimeId === right.runtimeId && left.sessionId === right.sessionId &&
    left.connectionId === right.connectionId && left.profile === right.profile)
}

const final = status => ['completed', 'failed', 'interrupted'].includes(status)

// Only the worker ID joins a live record to a saved/native card. Identical
// goals, labels or positions never connect two workers.
export function mergeTileAgent(row, observed) {
  if (!row?.subagentId || !observed || row.subagentId !== observed.subagentId ||
      (row.childSession && observed.childSession && row.childSession !== observed.childSession)) return row
  return { ...row,
    status: final(row.status) ? row.status : observed.status || row.status,
    started: row.started || observed.started,
    startedAt: row.startedAt ?? observed.startedAt,
    finishedAt: row.finishedAt ?? observed.finishedAt,
    updatedAt: observed.updatedAt ?? row.updatedAt,
    model: row.model || observed.model,
    effort: row.effort || observed.effort,
    childSession: row.childSession || observed.childSession,
    lifecycleChild: row.lifecycleChild || observed.lifecycleChild,
    taskName: row.taskName || observed.taskName,
    agentPath: row.agentPath || observed.agentPath,
    summary: row.summary || observed.summary,
    activity: observed.activity?.length ? observed.activity : row.activity,
  }
}

// A SessionView element can be recycled for another stored conversation.
// Its DOM identity is never an owner for persistent name/avatar allocations.
export function tileRegistryKey(target) {
  if (!target?.connectionId || !target?.profile || !target?.sessionId) return null
  return JSON.stringify(['tile', target.connectionId, target.profile, target.runtimeId || null, target.sessionId])
}

// A visible owner name may be an alias for a different backend profile.
// Use the unique route provided by Hermes; no ambient or guessed fallback.
export function uniqueTileRoute(routes, target) {
  if (!Array.isArray(routes) || !target?.connectionId || !target?.profile) return null
  const matches = routes.filter(route => route?.connectionId === target.connectionId && route?.profile === target.profile)
  return matches.length === 1 && typeof matches[0].targetProfile === 'string' && matches[0].targetProfile.trim()
    ? matches[0] : null
}
