import { host } from '@hermes/plugin-sdk'
import { movedElementMatches } from './dom-changes.js'
import { openSavedTurnDiff, turnHistoryScope } from './turn-history-client.js'

const dockSelector = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [data-pane-hidden] *, [inert] *) [data-slot="composer-dock"]:not([data-popped-out])'
const dockMounts = '[data-chat-surface], [data-slot="composer-dock"]'
const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/
const sizeLimit = 2 * 1024 * 1024

// Deliberately accepts one complete, ordinary text section only. In doubt the
// UI withholds counts and the review action rather than guessing.
function parseObservedDiff(diff) {
  if (typeof diff !== 'string' || diff.length > sizeLimit || diff.includes('\0')) return null
  if (!diff) return { files: [], added: 0, removed: 0, unifiedDiff: '' }
  let oldPath, newPath, oldLeft = 0, newLeft = 0, hunks = 0, added = 0, removed = 0, headers = 0
  for (const line of diff.split(/\r?\n/)) {
    if (oldLeft || newLeft) {
      if (line.startsWith('\\ No newline at end of file')) continue
      const prefix = line[0]
      if (prefix === '+' && newLeft) { newLeft--; added++ }
      else if (prefix === '-' && oldLeft) { oldLeft--; removed++ }
      else if (prefix === ' ' && oldLeft && newLeft) { oldLeft--; newLeft-- }
      else return null
      continue
    }
    const header = line.match(hunkHeader)
    if (header) {
      if (oldPath === undefined || newPath === undefined) return null
      oldLeft = Number(header[1] ?? 1); newLeft = Number(header[2] ?? 1); hunks++
      if (!Number.isSafeInteger(oldLeft) || !Number.isSafeInteger(newLeft)) return null
    } else if (line.startsWith('--- ')) {
      if (oldPath !== undefined || headers++) return null
      oldPath = line.slice(4).split('\t')[0]
    } else if (line.startsWith('+++ ')) {
      if (oldPath === undefined || newPath !== undefined) return null
      newPath = line.slice(4).split('\t')[0]
    } else if (line.startsWith('diff --git ') && (oldPath !== undefined || newPath !== undefined)) return null
    else if (line.startsWith('rename ') || line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) return null
  }
  if (oldLeft || newLeft || !hunks || !oldPath || !newPath || oldPath.startsWith('"') || newPath.startsWith('"')) return null
  const clean = path => path === '/dev/null' ? null : path.replace(/^[ab]\//, '')
  const before = clean(oldPath), after = clean(newPath)
  if (!after || (before && before !== after) || /[\r\n\0]/.test(after)) return null
  return { files: [{ path: after, added, removed, unifiedDiff: diff }], added, removed, unifiedDiff: diff }
}

function element(tag, part) {
  const node = document.createElement(tag)
  node.setAttribute('data-hcv-' + part, '')
  return node
}

function numberDisplay(part, sign) {
  const wrap = element('span', part)
  const digits = element('span', 'changes-digits')
  wrap.append(sign, digits)
  const columns = new Map()
  let shown
  return {
    node: wrap,
    update(text) {
      if (text === shown) return
      shown = text
      const chars = [...text].reverse()
      const next = []
      let position = 0
      for (const char of chars) {
        if (!/^[0-9]$/.test(char)) {
          next.push(document.createTextNode(char))
          continue
        }
        let column = columns.get(position)
        if (!column) {
          column = element('span', 'changes-digit')
          const reel = element('span', 'changes-reel')
          for (const digit of '0123456789') {
            const cell = document.createElement('span')
            cell.textContent = digit
            reel.append(cell)
          }
          column.append(reel)
          columns.set(position, column)
        }
        column.firstChild.style.transform = 'translateY(-' + char + 'lh)'
        next.push(column)
        position++
      }
      // Reuse digit columns by place value so existing reels keep their transition.
      next.reverse().forEach((node, index) => {
        if (digits.childNodes[index] !== node) digits.insertBefore(node, digits.childNodes[index] || null)
      })
      while (digits.childNodes.length > next.length) digits.lastChild.remove()
      for (const index of columns.keys()) if (index >= position) columns.delete(index)
      wrap.dataset.value = text
    },
  }
}

function changesLabel(count, locale, formatted) {
  if (!locale.startsWith('ru')) return formatted + (count === 1 ? ' file changed' : ' files changed')
  const plural = new Intl.PluralRules('ru').select(count)
  if (plural === 'one') return 'Изменен ' + formatted + ' файл'
  return 'Изменено ' + formatted + (plural === 'few' ? ' файла' : ' файлов')
}

export function registerComposerChanges(ctx, active) {
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')
  const turns = new Map()
  const fences = new Map()
  const norm = value => String(value || 'default').trim().toLowerCase()
  const key = (connection, profile, session) => JSON.stringify([connection, norm(profile), session])
  const scope = () => [host.state.connectionId.get(), host.state.profile.get()]
  const eventKey = event => {
    if (!event?.session_id || event.replayed || !event.connectionId || !('profile' in event)) return null
    return key(event.connectionId, event.profile, event.session_id)
  }
  // Plugin events fan out before the desktop's own stale-frame filter.
  // Require the exact running admission on every frame we consume.
  const executionStamp = event => {
    const epoch = event?.authority_epoch
    const generation = event?.execution_generation
    const admission = event?.admission_id
    if (!((typeof epoch === 'number' && Number.isSafeInteger(epoch)) || (typeof epoch === 'string' && epoch))) return null
    if (!Number.isSafeInteger(generation) || generation < 0 || typeof admission !== 'string' || !admission) return null
    return JSON.stringify([String(epoch), generation, admission])
  }
  // seq is ordered only within the gateway's replay epoch. Keep a fence after
  // completion and fail closed if a different epoch cannot be ordered safely.
  function acceptFrame(event, address, startsTurn = false) {
    const stamp = executionStamp(event), epoch = event?.replay_epoch
    if (!address || !stamp || typeof epoch !== 'string' || !epoch || !Number.isSafeInteger(event.seq)) return false
    let fence = fences.get(address)
    if (!fence) {
      if (!startsTurn || fences.size >= 64) return false
      fence = { epoch, authority: String(event.authority_epoch), generation: event.execution_generation,
        stamp, seq: event.seq, blocked: false }
      fences.set(address, fence)
      return true
    }
    if (fence.blocked) return false
    if (fence.epoch !== epoch || fence.authority !== String(event.authority_epoch)) {
      fence.blocked = true; turns.delete(address); schedule(); return false
    }
    if (event.seq <= fence.seq) return false
    if (startsTurn) {
      if (event.execution_generation <= fence.generation) return false
      fence.generation = event.execution_generation; fence.stamp = stamp
    } else if (stamp !== fence.stamp) return false
    fence.seq = event.seq
    return true
  }
  const rail = element('div', 'composer-changes')
  const chip = element('button', 'composer-changes-chip')
  chip.type = 'button'
  const warning = element('div', 'composer-changes-warning')
  warning.setAttribute('role', 'status')
  const label = element('span', 'composer-changes-label')
  const coverage = element('span', 'composer-changes-coverage')
  const totals = element('span', 'composer-changes-totals')
  const added = numberDisplay('composer-changes-added', '+')
  const removed = numberDisplay('composer-changes-removed', '−')
  totals.append(added.node, removed.node); chip.append(label, totals, coverage); rail.append(chip, warning)
  let currentKey, currentRevision, lastCounts, numberLocale, formatter, frame, sizeAnimation
  function hide() {
    sizeAnimation?.cancel(); rail.remove(); currentKey = currentRevision = lastCounts = undefined
  }
  chip.addEventListener('click', () => {
    const session = host.state.activeSessionId.get()
    const address = key(...scope(), session)
    const turn = turns.get(address)
    if (address !== currentKey || !turn || turn.state !== 'observed' || turn.revision !== currentRevision || !turn.snapshot?.unifiedDiff) return
    const historyScope = turnHistoryScope()
    if (!historyScope || !host.state.busyBySession.get()[session]) return
    // Same immutable event snapshot, never the repo's uncommitted Git diff.
    openSavedTurnDiff(historyScope, { ...turn.snapshot,
      snapshotId: 'live:' + encodeURIComponent(turn.hermesTurnId) + ':' + turn.revision }, null)
  })
  function sync() {
    frame = 0
    if (!root.matches(active) || !contrast.matches) return hide()
    const session = host.state.activeSessionId.get()
    const address = key(...scope(), session)
    const turn = turns.get(address)
    const relevant = turn && (turn.state === 'unavailable' || (turn.state === 'observed' && turn.snapshot?.files.length))
    const dock = relevant && document.querySelector(dockSelector)
    if (!dock || !host.state.busyBySession.get()[session]) return hide()
    if (currentKey !== address || rail.parentElement !== dock) hide()
    const locale = root.lang.toLowerCase() || 'en'
    if (numberLocale !== locale) { formatter = new Intl.NumberFormat(locale); numberLocale = locale }
    const warningMode = turn.state === 'unavailable'
    if (!warningMode && lastCounts?.revision === turn.revision && lastCounts.locale === locale && currentKey === address) return
    const oldWidth = rail.isConnected ? chip.getBoundingClientRect().width : 0
    sizeAnimation?.cancel()
    warning.hidden = !warningMode; chip.hidden = warningMode
    if (warningMode) {
      warning.textContent = locale.startsWith('ru') ? 'Не все изменения удалось отследить' : 'Some changes could not be tracked'
    } else {
      const plus = formatter.format(turn.snapshot.added), minus = formatter.format(turn.snapshot.removed)
      const ru = locale.startsWith('ru')
      const text = ru ? 'Отдельная подтверждённая правка' : 'Individual confirmed edit'
      const caveat = ru ? 'Могут быть и другие изменения' : 'Other changes may exist'
      label.textContent = text; coverage.textContent = caveat; added.update(plus); removed.update(minus)
      chip.setAttribute('aria-label', text + ', +' + plus + ', −' + minus + '. ' + caveat)
      chip.title = turn.snapshot.files[0].path
    }
    if (!rail.isConnected) dock.prepend(rail)
    const width = chip.hidden ? 0 : chip.getBoundingClientRect().width
    if (oldWidth && width && width !== oldWidth && motion.matches) sizeAnimation = chip.animate([{width:oldWidth+'px'},{width:width+'px'}], {duration:200,easing:'ease-out'})
    currentKey = address; currentRevision = turn.revision; lastCounts = { revision: turn.revision, locale }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync) }
  const invalidate = turn => { turn.state = 'unavailable'; turn.snapshot = null; schedule() }
  ctx.onEvent('message.start', event => {
    const address = eventKey(event)
    if (!acceptFrame(event, address, true)) return
    turns.set(address, { since: event.seq, stamp: executionStamp(event), revision: 0, state: 'unknown' })
    schedule()
  })
  ctx.onEvent('tool.complete', event => {
    const address = eventKey(event), turn = turns.get(address)
    if (!turn || !acceptFrame(event, address) || turn.bridge || !['edit_file','write_file','patch','terminal'].includes(event.payload?.name)) return
    // Other runtimes don't yet have a complete, owner-bound capture stream.
    invalidate(turn)
  })
  ctx.onEvent('hcv.turn_diff', event => {
    const address = eventKey(event), turn = turns.get(address), value = event.payload
    if (!turn || !acceptFrame(event, address) || !value || value.version !== 1 || value.source !== 'codex_app_server') return
    if (!Number.isSafeInteger(value.revision) || value.revision !== turn.revision + 1 || !value.hermesTurnId || !value.threadId || !value.codexTurnId || !value.agentSessionId) return invalidate(turn)
    const identity = JSON.stringify([value.agentSessionId, value.hermesTurnId, value.threadId, value.codexTurnId])
    if (turn.bridge && turn.bridge !== identity) return invalidate(turn)
    if (!turn.bridge && value.state !== 'pending' && value.state !== 'unavailable') return invalidate(turn)
    if (turn.state === 'unavailable' && turn.bridge) return
    turn.bridge = identity; turn.hermesTurnId = value.hermesTurnId; turn.revision = value.revision
    if (value.state === 'pending') { turn.state = 'pending'; turn.snapshot = null }
    else if (value.state === 'unavailable') { turn.state = 'unavailable'; turn.snapshot = null }
    else if (value.state === 'observed') {
      const parsed = parseObservedDiff(value.diff)
      if (!parsed) return invalidate(turn)
      turn.snapshot = parsed; turn.state = 'observed'
    } else return invalidate(turn)
    schedule()
  })
  for (const type of ['message.complete', 'message.error']) ctx.onEvent(type, event => {
    const address = eventKey(event), turn = turns.get(address)
    if (turn && acceptFrame(event, address) && turns.delete(address)) schedule()
  })
  ctx.onEvent('session.replay_gap', event => {
    const address = eventKey(event)
    if (!address) return
    const fence = fences.get(address)
    if (fence) fence.blocked = true
    else if (fences.size < 64) fences.set(address, { blocked: true })
    turns.delete(address); schedule()
  })
  ctx.onEvent('gateway.reconnecting', () => {
    for (const fence of fences.values()) fence.blocked = true
    turns.clear(); schedule()
  })
  const observer = new MutationObserver(records => {
    const session = host.state.activeSessionId.get()
    if (!rail.isConnected && !turns.get(key(...scope(), session))) return
    if (records.some(record => {
      const target = record.target
      if (!(target instanceof Element)) return false
      if (record.type === 'attributes') return target === root || target.contains(rail) || target.matches(dockMounts) || Boolean(target.firstElementChild && target.querySelector(dockMounts))
      if (target.closest('[data-slot="aui_thread-content"]')) return false
      return [...record.removedNodes].some(node => node === rail || node.contains?.(rail)) || movedElementMatches(record, dockMounts)
    })) schedule()
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-hermes-theme','lang','data-pane-hidden','data-popped-out','inert','hidden'] })
  const stops = [host.state.busyBySession, host.state.activeSessionId, host.state.connectionId, host.state.profile].map(atom => atom.listen(schedule))
  contrast.addEventListener('change', schedule)
  ctx.onDispose(() => { cancelAnimationFrame(frame); observer.disconnect(); contrast.removeEventListener('change', schedule); stops.forEach(stop => stop()); turns.clear(); fences.clear(); hide() })
}



