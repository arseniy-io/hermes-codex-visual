// Session writes use the same revision and generation fence as Hermes Desktop.
// Keep the identity after an uncertain response so a retry cannot issue a new
// write against a later version of the chat.
export class MissingStoredSession extends Error {}

// Hermes stamps non-local rows with their connection. An untagged row belongs
// to the local primary; another focused chat can share its ID and profile.
export function sessionRowOwner(session, activeConnectionId) {
  const profile = typeof session.profile === 'string' && session.profile.trim() || 'default'
  const connectionId = typeof session.connection_id === 'string' && session.connection_id.trim()
  if (connectionId) return { connectionId, profile }
  return activeConnectionId === 'local' ? { connectionId: 'local', profile } : null
}

export function sessionTabOwner(row, activeConnectionId, focusedOwner, canUseFocused) {
  return row ? sessionRowOwner(row, activeConnectionId) : canUseFocused ? focusedOwner : null
}

export async function titleForOpen(stale, read, fallback) {
  if (!stale) return fallback
  const session = await read()
  if (!session || (session.title !== null && typeof session.title !== 'string')) throw new Error('Current title unavailable')
  return (session.title || '').trim()
}

export function applyTitleRead(entry, version, title) {
  if (entry.readVersion !== version) return false
  entry.failed = false
  if (!title || title === entry.title) return false
  entry.title = title
  return true
}

export function sessionOwnerKey(owner, id) {
  return JSON.stringify([owner.connectionId, owner.profile, id])
}

// Some live-only title writes use RPC rather than the fenced HTTP route. If
// their response is lost, keep them blocked even when the dialog is reopened.
export function createUncertainRpcRegistry() {
  const pending = new Map()
  return {
    mark(owner, id, title) { pending.set(sessionOwnerKey(owner, id), title) },
    get(owner, id) {
      return pending.get(sessionOwnerKey(owner, id)) ?? null
    },
  }
}

export async function readTitleWithRetry(read, active, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const delays = [1000, 4000]
  for (let attempt = 0; ; attempt++) {
    try { return await read() } catch (error) {
      if (attempt >= delays.length || !active()) throw error
      await wait(delays[attempt])
      if (!active()) throw error
    }
  }
}

// A failed write can have succeeded without its acknowledgement. The next
// submission must first settle that exact request and show the stored title.
export function createRenameFormController(initialTitle, { save, recover, unsettled }) {
  let baseline = initialTitle
  let uncertain = null
  let fence = null
  return {
    async submit(title) {
      uncertain ??= unsettled()
      if (uncertain !== null) {
        const current = await recover(uncertain)
        baseline = current.title
        fence = current.fence
        uncertain = null
        return { review: true, title: baseline }
      }
      if (title === baseline) return { review: false }
      try {
        await save(title, fence)
        return { review: false }
      } catch (error) {
        uncertain = title
        fence = null
        throw error
      }
    },
  }
}

const definiteRejection = /revision_conflict|stale_generation|permission_denied|profile_mismatch|invalid_params|admission_conflict|session_busy|retained_receipts|runtime_coordination_required|unknown_execution|not_found|mutation_identity_required/
const missingRoute = /no such api endpoint|endpoint is likely missing|(?:^\s*|error:\s*)404:.*headless backend \(hermes serve\): web ui disabled/i

function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createSessionRenamer(api, newRequestId = requestId) {
  const pending = new Map()
  const readFence = async (scope, id, path) => {
    const snapshot = await api({ ...scope, path: `${path}/mutation-snapshot?${new URLSearchParams({ profile: scope.profile })}` })
    if (snapshot?.exists === false) throw new MissingStoredSession('Session is not yet stored')
    if (snapshot?.exists !== true || snapshot.session_id !== id ||
        !Number.isSafeInteger(snapshot.runtime_revision) || snapshot.runtime_revision < 0 ||
        !Number.isSafeInteger(snapshot.runtime_generation) || snapshot.runtime_generation < 0) {
      throw new Error('Session mutation snapshot unavailable')
    }
    return { expected_revision: snapshot.runtime_revision, expected_generation: snapshot.runtime_generation }
  }
  const unsettled = (owner, id) => {
    const ownerKey = JSON.stringify([{ connectionId: owner.connectionId, profile: owner.profile }, id])
    for (const key of pending.keys()) {
      const parsed = JSON.parse(key)
      if (JSON.stringify(parsed.slice(0, 2)) === ownerKey) return parsed[2]
    }
    return null
  }
  const rename = async (owner, id, title, fence = null) => {
    const scope = { connectionId: owner.connectionId, profile: owner.profile }
    const ownerKey = JSON.stringify([scope, id])
    const key = JSON.stringify([scope, id, title])
    const path = `/api/sessions/${encodeURIComponent(id)}`
    let prepared = pending.get(key)
    if (!prepared && unsettled(owner, id) !== null) throw new Error('Previous rename needs reconciliation')
    if (!prepared) {
      prepared = (async () => {
        if (fence) return { request_id: newRequestId(), ...fence }
        let current
        try {
          current = await readFence(scope, id, path)
        } catch (error) {
          // An old backend may lack this endpoint. A session or profile 404 is
          // not proof that the endpoint is missing and must not bypass fencing.
          if (missingRoute.test(String(error))) return {}
          throw error
        }
        return { request_id: newRequestId(), ...current }
      })()
      pending.set(key, prepared)
    }
    let identity
    try { identity = await prepared } catch (error) { pending.delete(key); throw error }
    try {
      const result = await api({ ...scope, path, method: 'PATCH',
        body: { title, ...identity, profile: scope.profile } })
      if (!result?.ok) throw new Error('Title not saved')
      for (const other of pending.keys()) {
        if (JSON.stringify(JSON.parse(other).slice(0, 2)) === ownerKey) pending.delete(other)
      }
      return result
    } catch (error) {
      if (definiteRejection.test(String(error))) pending.delete(key)
      throw error
    }
  }
  rename.unsettled = unsettled
  rename.recover = async (owner, id, attemptedTitle) => {
    const scope = { connectionId: owner.connectionId, profile: owner.profile }
    const key = JSON.stringify([scope, id, attemptedTitle])
    const prepared = pending.get(key)
    if (prepared) {
      const identity = await prepared
      // An unfenced legacy write cannot safely be replayed after a timeout.
      if (!identity.request_id) throw new Error('Previous rename cannot be verified safely')
      try { await rename(scope, id, attemptedTitle) } catch (error) {
        if (!definiteRejection.test(String(error))) throw error
      }
    }
    const path = `/api/sessions/${encodeURIComponent(id)}`
    // Read the fence first. If the name changes before or after the second
    // read, the eventual write will conflict instead of overwriting it.
    const fence = await readFence(scope, id, path)
    const session = await api({ ...scope, path: `${path}?${new URLSearchParams({ profile: scope.profile })}` })
    if (!session || (session.title !== null && typeof session.title !== 'string')) throw new Error('Current title unavailable')
    return { title: (session.title || '').trim(), fence }
  }
  return rename
}
