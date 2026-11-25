// A stop receipt is scoped to one real conversation and its gateway owner.
// Sending an interrupt is not itself evidence that the work has stopped.
export function turnControlKey(target) {
  if (!target?.connectionId || !target.profile || !target.runtimeId || !target.storedId) return null
  return JSON.stringify([target.connectionId, target.profile, target.storedId, target.runtimeId])
}

export function createTurnControl({ request, changed = () => {}, stopped = () => {}, storage, token = () => crypto.randomUUID() }) {
  const states = new Map()
  let disposed = false
  const storageKey = key => 'turn-stop-checkpoint:' + key
  const get = target => states.get(turnControlKey(target))
  const notify = () => { if (!disposed) changed() }
  const set = (key, value) => { states.set(key, value); notify(); return value }
  const valid = (target, result) => result && result.root_runtime_id === target.runtimeId &&
    result.root_stored_id === target.storedId
  const remember = (key, checkpoint) => {
    storage?.set(storageKey(key), checkpoint || null)
  }
  function reportStop(target, value) {
    if (value.phase === 'stopped' && value.checkpoint && value.attempt) stopped(target, value.attempt)
  }
  async function refresh(target) {
    const key = turnControlKey(target)
    if (!key || disposed || get(target)?.pending) return
    const previous = get(target)
    const checkpoint = get(target)?.checkpoint || storage?.get(storageKey(key), null)
    const params = { session_id: target.runtimeId }
    let result
    try {
      result = await request(target, 'session.tree_status', { ...params, ...(checkpoint ? { checkpoint_id: checkpoint } : {}) })
    } catch (error) {
      if (!checkpoint || !/\bstale_tree_checkpoint\b/.test(error?.message || '')) throw error
      if (disposed || states.get(key) !== previous) return
      result = await request(target, 'session.tree_status', params)
    }
    if (disposed || states.get(key) !== previous || !valid(target, result)) return
    const phase = result.state === 'stopped' ? 'stopped'
      : ['stopping', 'timeout', 'resuming'].includes(result.state) ? 'unknown' : 'idle'
    const value = set(key, { phase, checkpoint: result.checkpoint_id || null, receipt: result,
      lastAction: result.state === 'resuming' ? 'resume' : previous?.lastAction,
      attempt: previous?.attempt })
    remember(key, value.phase === 'stopped' || value.phase === 'unknown' ? value.checkpoint : null)
    reportStop(target, value)
    return value
  }
  async function stop(target, attempt) {
    const key = turnControlKey(target)
    if (!key || disposed) throw new Error('Unknown turn owner')
    const previous = get(target)
    if (previous?.pending) return previous.pending
    if (previous?.phase === 'stopped') return previous.receipt
    const state = { phase: 'stopping', checkpoint: previous?.lastAction === 'resume' ? null : previous?.checkpoint || null,
      requestId: previous?.lastAction === 'resume' ? token() : previous?.requestId || token(), lastAction: 'stop',
      attempt: previous?.lastAction === 'stop' && previous.attempt || attempt }
    // Defer the request one microtask so a second click sees this pending action.
    const pending = Promise.resolve().then(async () => {
      try {
        const result = await request(target, 'session.interrupt', {
          session_id: target.runtimeId, cascade: true, request_id: state.requestId,
          ...(state.checkpoint ? { checkpoint_id: state.checkpoint } : {}),
        })
        if (!valid(target, result)) throw new Error('Unknown stop result')
        if (disposed || states.get(key) !== state) return result
        state.receipt = result
        state.checkpoint = result.checkpoint_id || state.checkpoint
        state.phase = result.state === 'stopped' && state.checkpoint ? 'stopped' : 'unknown'
        remember(key, state.checkpoint)
        reportStop(target, state)
        return result
      } catch (error) {
        state.phase = 'unknown'
        state.error = error
        throw error
      } finally { state.pending = null; notify() }
    })
    state.pending = pending
    set(key, state)
    return pending
  }
  async function resume(target) {
    const key = turnControlKey(target), state = get(target)
    if (state?.pending) return state.pending
    if (!key || disposed || state?.phase !== 'stopped' || !state.checkpoint) throw new Error('No confirmed checkpoint')
    state.phase = 'resuming'
    state.lastAction = 'resume'
    const pending = Promise.resolve().then(async () => {
      try {
        const result = await request(target, 'session.continue_tree', {
          session_id: target.runtimeId, checkpoint_id: state.checkpoint,
        })
        if (!valid(target, result) || result.state !== 'resumed') throw new Error('Continuation was not confirmed')
        if (!disposed && states.get(key) === state) {
          remember(key, null)
          states.delete(key)
        }
        return result
      } catch (error) {
        // A lost reply may follow a successful start. Check the backend receipt
        // before offering another Continue, which could duplicate work.
        state.phase = 'unknown'
        state.error = error
        throw error
      } finally { state.pending = null; notify() }
    })
    state.pending = pending
    notify()
    return pending
  }
  function invalidate(target) {
    const key = turnControlKey(target)
    if (!key) return
    remember(key, null)
    states.delete(key)
    notify()
  }
  return { get, refresh, stop, resume, invalidate, dispose() { disposed = true; states.clear() } }
}
