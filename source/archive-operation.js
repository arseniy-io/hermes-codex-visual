// Isolated candidate: coordinates the native archive and a requested restore.
// A request made while archive is pending is queued behind its actual result.
export function createArchiveOperation({ archive, isArchived, restore, changed }) {
  let phase = 'pending'
  let wantsUndo = false
  let restoreStarted = false
  let finished = false
  const notify = () => changed({ phase, wantsUndo })
  async function runRestore() {
    if (restoreStarted || phase !== 'archived') return
    restoreStarted = true
    phase = 'restoring'
    notify()
    try {
      await restore()
      phase = 'restored'
    } catch (error) {
      phase = 'restore-error'
      notify()
      throw error
    }
    notify()
  }
  const result = (async () => {
    notify()
    try {
      await archive()
      if (!(await isArchived())) throw new Error('Archive was not confirmed')
      phase = 'archived'
      notify()
      if (wantsUndo) await runRestore()
      finished = true
      return phase
    } catch (error) {
      if (phase !== 'restore-error') { phase = 'archive-error'; notify() }
      finished = true
      throw error
    }
  })()
  return {
    result,
    get phase() { return phase },
    async undo() {
      if (wantsUndo || restoreStarted || phase === 'restored' || phase === 'archive-error') return
      wantsUndo = true
      notify()
      if (phase === 'archived') await runRestore()
      else if (!finished) await result
    },
  }
}

// Keep the original connection and profile even if the user has switched
// elsewhere. The native mutation client supplies its normal request identity.
export async function restoreArchivedChat({ session, owner, pinned, index, mutate, api,
  currentConnection, untombstone, restoreRow, pin, broadcast }) {
  const path = `/api/sessions/${encodeURIComponent(session.id)}`
  const query = new URLSearchParams({ profile: owner.profile })
  const payload = { archived: false, ...(pinned ? { pinned: true } : {}) }
  const key = JSON.stringify([owner, session.id, 'PATCH', payload])
  const result = await mutate(key,
    () => api({ ...owner, path: `${path}/mutation-snapshot?${query}` }),
    identity => api({ ...owner, path, method: 'PATCH', body: { ...payload, ...identity, profile: owner.profile } }))
  if (!result?.ok) throw new Error('Unarchive was not confirmed')
  // Client lists and pin order belong to the active connection. A different
  // connection must refresh from its own state instead of receiving this row.
  if (currentConnection() === owner.connectionId) {
    untombstone([session.id, session._lineage_root_id])
    restoreRow({ ...session, archived: false, pinned })
    if (pinned) pin(session._lineage_root_id || session.id, true, index)
  }
  broadcast()
}
