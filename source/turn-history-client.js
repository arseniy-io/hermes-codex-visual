import { host, MessageTextContent } from '@hermes/plugin-sdk'
import { createElement as h } from 'react'

const diffWorkspaces = new Map()
let ownerContext
const normalize = value => (value || 'default').trim().toLowerCase()
export function turnHistoryScope() {
  const parent = host.state.activeSessionId.get()
  return parent ? JSON.stringify([host.state.connectionId.get() || null, normalize(host.state.profile.get()), parent]) : null
}
export function sameTurnHistoryOwner(scope, owner) {
  return owner ? owner.scope === scope && owner.isCurrent()
    : scope != null && turnHistoryScope() === scope
}
export function setTurnHistoryContext(ctx) {
  ownerContext = ctx
  ctx.onDispose(() => {
    if (ownerContext !== ctx) return
    ownerContext = undefined
    for (const dispose of [...diffWorkspaces.values()]) dispose()
    diffWorkspaces.clear()
  })
}

function unwrap(response) {
  if (response?.ok === false || (Number.isFinite(response?.status) && response.status >= 400)) throw new Error('Saved history unavailable')
  return response?.data ?? response
}

export async function requestTurnHistory(scope, path, options, owner) {
  const ctx = ownerContext
  if (!ctx || !sameTurnHistoryOwner(scope, owner)) throw new Error('Chat owner changed')
  if (owner && (!path.startsWith('/') || path.split(/[?#]/, 1)[0].split('/').includes('..'))) {
    throw new Error('Invalid saved-history path')
  }
  const response = owner
    ? await window.hermesDesktop.api({ timeoutMs: 12000, ...options,
      connectionId: owner.connectionId, profile: owner.profile, passive: true,
      path: '/api/plugins/hermes-codex-visual' + path })
    : await ctx.rest(path, { timeoutMs: 12000, ...options })
  if (ownerContext !== ctx || !sameTurnHistoryOwner(scope, owner)) throw new Error('Chat owner changed')
  return unwrap(response)
}

export async function readTurnTimeline(owner, previous) {
  const readPage = async (offset, { checkpoint, incremental = true } = {}) => {
    const query = new URLSearchParams({ session_id: owner.sessionId, offset: String(offset), limit: '400' })
    if (incremental) query.set('incremental', 'true')
    if (checkpoint) query.set('checkpoint', checkpoint)
    const page = await requestTurnHistory(owner.scope, '/turn-timeline?' + query, undefined, owner)
    const pagination = page?.pagination
    if ((page?.requestedSessionId ?? page?.sessionId) !== owner.sessionId || !Array.isArray(page.rows) ||
        (pagination?.offset !== offset && !(checkpoint && pagination?.offset === 0)) ||
        pagination?.returned !== page.rows.length || !Number.isSafeInteger(pagination?.scanned) ||
        pagination.scanned < 0 || pagination.scanned > 400) throw new Error('Unproven timeline page')
    return page
  }
  const known = previous?.complete && previous.checkpoint
  let page
  if (known) {
    const offset = previous.pagination.offset + previous.pagination.scanned
    page = await readPage(offset, { checkpoint: known })
    if (page.appended === true && page.hasMore === false && page.sessionId === previous.sessionId &&
        page.pagination.offset === offset && typeof page.checkpoint === 'string') {
      return { ...page, rows: page.rows.length ? previous.rows.concat(page.rows) : previous.rows,
        receipts: previous.receipts.concat(page.receipts || []),
        requestedSessionId: owner.sessionId, complete: true }
    }
    if (page.pagination.offset !== 0) page = undefined
  }
  page ??= await readPage(0)
  const rows = [], receipts = []
  let checkpoint = typeof page.checkpoint === 'string' ? page.checkpoint : null
  while (true) {
    rows.push(...page.rows)
    if (Array.isArray(page.receipts)) receipts.push(...page.receipts)
    if (page.checkpoint !== checkpoint) checkpoint = null
    if (!page.hasMore) break
    const next = page.pagination.nextOffset
    if (!Number.isSafeInteger(next) || next <= page.pagination.offset) throw new Error('Stalled timeline page')
    if (next >= 10000) break
    page = await readPage(next, { incremental: checkpoint !== null })
  }
  const complete = page.hasMore !== true
  return { ...page, rows, receipts, requestedSessionId: owner.sessionId, complete,
    checkpoint: complete ? checkpoint : null }
}

export async function readSavedTurnChanges(scope, sessionId, parentId, owner) {
  const query = new URLSearchParams({ session_id: sessionId, parent_session_id: parentId })
  const result = await requestTurnHistory(scope, '/turn-changes?' + query, undefined, owner)
  if (result?.sessionId !== sessionId || result.parentId !== parentId || typeof result.scope !== 'string' || !Array.isArray(result.turns)) {
    throw new Error('Saved patch identity unavailable')
  }
  return result
}

export async function applySavedTurnChanges(scope, sessionId, parentId, snapshot, action, owner) {
  return requestTurnHistory(scope, '/turn-changes/apply', {
    method: 'POST', timeoutMs: 30000,
    body: { scope: snapshot.scope, sessionId, parentId, snapshotId: snapshot.snapshotId,
      revision: snapshot.revision, action },
  }, owner)
}

export function notifySavedTurnOutcome(outcome, action) {
  if (outcome?.status === 'success') {
    // Both success ids are absent from the active ru-RU catalog. Codex uses
    // these exact defaultMessage fallbacks instead of an invented translation.
    host.notify({ id: 'turnDiffPatchAction', kind: 'success',
      message: action === 'undo' ? 'Changes reverted' : 'Changes reapplied' })
    return
  }
  const ru = document.documentElement.lang.startsWith('ru')
  const title = outcome?.status === 'partial'
    ? action === 'undo' ? ru ? 'Некоторые изменения отменены' : 'Some changes reverted'
      : ru ? 'Некоторые изменения применены повторно' : 'Some changes reapplied'
    : action === 'undo' ? ru ? 'Не удалось отменить изменения' : 'Failed to revert changes'
      : ru ? 'Не удалось повторно применить изменения' : 'Failed to reapply changes'
  host.notify({ id: 'turnDiffPatchAction', kind: 'error', message: title })
}

// The SDK owns this read-only workspace and its text renderer. Its contents are
// the selected immutable turn patch, never a fresh working-tree Git diff.
export function openSavedTurnDiff(scope, snapshot, path, owner) {
  if (!ownerContext || !sameTurnHistoryOwner(scope, owner) || typeof host.openWorkspace !== 'function') return
  const title = path || (document.documentElement.lang.startsWith('ru') ? 'Изменения' : 'Changes')
  const diff = path ? snapshot.files?.find(file => file.path === path)?.unifiedDiff || snapshot.unifiedDiff : snapshot.unifiedDiff
  if (typeof diff !== 'string' || !diff) return
  let fenceLength = 3
  for (const match of diff.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1)
  const fence = '`'.repeat(fenceLength)
  const key = 'hermes-codex-visual:turn-diff:' + snapshot.snapshotId
  diffWorkspaces.get(key)?.()
  const dispose = host.openWorkspace(key, {
    title, dock: { pane: 'workspace', pos: 'right' },
    onClose: () => diffWorkspaces.delete(key),
    render: () => h('div', { 'data-hcv-saved-turn-diff': '', style: { padding: '16px', minWidth: 0, overflow: 'auto', height: '100%' } },
      h(MessageTextContent, { text: fence + 'diff\n' + diff + '\n' + fence, previewOnly: true })),
  })
  diffWorkspaces.set(key, dispose)
}
