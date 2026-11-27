import { host } from '@hermes/plugin-sdk'
import { movedElementMatches } from './dom-changes.js'
import { openSavedTurnDiff, turnHistoryScope } from './turn-history-client.js'

const dockSelector = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [data-pane-hidden] *, [inert] *) [data-slot="composer-dock"]:not([data-popped-out])'
const dockMounts = '[data-chat-surface], [data-slot="composer-dock"]'
const blockingRequests = '[data-slot="tool-approval-card"], [data-slot="clarify-inline"]'
const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: .*)?$/
const metadata = /^(?:index [0-9a-f]+\.\.[0-9a-f]+(?: \d{6})?|(?:new|deleted) file mode \d{6})$/
const sizeLimit = 2 * 1024 * 1024

function readDiffFile(section) {
  const lines = section.replace(/\r?\n$/, '').split(/\r?\n/)
  const header = lines[0]
  let index = 1
  while (metadata.test(lines[index] || '')) index++
  if (index === lines.length) {
    const path = /^diff --git a\/([^\t\r\n]+) b\/\1$/.exec(header)?.[1]
    const mode = lines.find(line => /^(new|deleted) file mode /.test(line))
    return path && mode ? { path, added: 0, removed: 0, unifiedDiff: section } : null
  }

  const old = /^--- (?:a\/([^\t\r\n]+)|(\/dev\/null))$/.exec(lines[index++])
  const next = /^\+\+\+ (?:b\/([^\t\r\n]+)|(\/dev\/null))$/.exec(lines[index++])
  if (!old || !next || !(old[1] || next[1])) return null
  const path = next[1] || old[1]
  if (header !== 'diff --git a/' + (old[1] || path) + ' b/' + path) return null

  let oldLeft = 0, newLeft = 0, added = 0, removed = 0
  let hunks = 0, contentLine = false
  for (; index < lines.length; index++) {
    const line = lines[index]
    if (line === '\\ No newline at end of file' && contentLine) {
      contentLine = false
      continue
    }
    contentLine = false
    if (oldLeft || newLeft) {
      if (line[0] === '+' && newLeft) { newLeft--; added++ }
      else if (line[0] === '-' && oldLeft) { oldLeft--; removed++ }
      else if (line[0] === ' ' && oldLeft && newLeft) { oldLeft--; newLeft-- }
      else return null
      contentLine = true
      continue
    }
    const match = hunkHeader.exec(line)
    if (!match) return null
    oldLeft = Number(match[1] ?? 1)
    newLeft = Number(match[2] ?? 1)
    if (!Number.isSafeInteger(oldLeft) || !Number.isSafeInteger(newLeft) ||
        (old[2] && oldLeft) || (next[2] && newLeft)) return null
    hunks++
  }
  return hunks && !oldLeft && !newLeft ? { path, added, removed, unifiedDiff: section } : null
}

function readTurnDiff(diff) {
  if (typeof diff !== 'string' || diff.length > sizeLimit || diff.includes('\0')) return null
  if (!diff) return { files: [], added: 0, removed: 0, unifiedDiff: diff }
  if (!diff.startsWith('diff --git ')) return null
  const files = [], seen = new Set()
  let added = 0, removed = 0
  // The producer gives the complete current turn. A malformed section makes
  // the total unavailable, even if the other files could be counted.
  for (const section of diff.split(/(?=^diff --git )/m)) {
    const file = readDiffFile(section)
    if (!file || seen.has(file.path)) return null
    seen.add(file.path)
    files.push(file)
    added += file.added
    removed += file.removed
  }
  return { files, added, removed, unifiedDiff: diff }
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
  const anchor = element('div', 'composer-changes-anchor')
  const chip = element('button', 'composer-changes-chip')
  chip.type = 'button'
  const label = element('span', 'composer-changes-label')
  const totals = element('span', 'composer-changes-totals')
  const added = numberDisplay('composer-changes-added', '+')
  const removed = numberDisplay('composer-changes-removed', '−')
  const popover = element('div', 'composer-changes-popover')
  const list = element('ul', 'composer-changes-list')
  popover.id = 'hcv-composer-change-files'
  popover.hidden = true
  chip.setAttribute('aria-expanded', 'false')
  chip.setAttribute('aria-controls', popover.id)
  popover.append(list)
  totals.append(added.node, removed.node)
  chip.append(label, totals)
  anchor.append(chip, popover)
  rail.append(anchor)

  let currentKey, currentSnapshot, numberLocale, formatter, frame, sizeAnimation
  function closeFiles() {
    popover.hidden = true
    chip.setAttribute('aria-expanded', 'false')
  }
  function hide() {
    if (rail.isConnected) {
      closeFiles()
      rail.remove()
    }
    sizeAnimation?.cancel()
    currentKey = currentSnapshot = undefined
  }
  function review(path = null) {
    const session = host.state.activeSessionId.get()
    const address = key(...scope(), session)
    const snapshot = turns.get(address)?.snapshot
    if (!snapshot || address !== currentKey || snapshot !== currentSnapshot ||
        !host.state.busyBySession.get()[session] || !root.matches(active) ||
        (path && !snapshot.files.some(file => file.path === path))) return
    const historyScope = turnHistoryScope()
    if (!historyScope) return
    closeFiles()
    openSavedTurnDiff(historyScope, snapshot, path)
  }
  function renderFiles() {
    const rows = currentSnapshot.files.map(file => {
      const row = document.createElement('li')
      const button = element('button', 'composer-changes-file')
      button.type = 'button'
      button.title = file.path
      const name = element('span', 'composer-changes-file-name')
      name.textContent = file.path.split(/[\\/]/).at(-1)
      const plus = element('span', 'composer-changes-added')
      plus.textContent = '+' + formatter.format(file.added)
      const minus = element('span', 'composer-changes-removed')
      minus.textContent = '−' + formatter.format(file.removed)
      const counts = element('span', 'composer-changes-totals')
      counts.append(plus, minus)
      button.append(name, counts)
      button.addEventListener('click', () => review(file.path))
      row.append(button)
      return row
    })
    list.replaceChildren(...rows)
  }
  function showFiles() {
    if (!currentSnapshot || !popover.hidden) return
    renderFiles()
    popover.hidden = false
    chip.setAttribute('aria-expanded', 'true')
  }
  chip.addEventListener('click', () => review())
  anchor.addEventListener('pointerenter', showFiles)
  anchor.addEventListener('pointerleave', () => {
    if (!list.contains(document.activeElement)) closeFiles()
  })
  anchor.addEventListener('focusin', showFiles)
  anchor.addEventListener('focusout', event => {
    if (!anchor.contains(event.relatedTarget) && !anchor.matches(':hover')) closeFiles()
  })
  anchor.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || popover.hidden) return
    event.stopPropagation()
    if (list.contains(document.activeElement)) chip.focus()
    closeFiles()
  })

  function sync() {
    frame = 0
    if (!root.matches(active) || !contrast.matches) return hide()
    const session = host.state.activeSessionId.get()
    const address = key(...scope(), session)
    const snapshot = turns.get(address)?.snapshot
    if (!(snapshot?.added || snapshot?.removed) || !host.state.busyBySession.get()[session]) return hide()
    const dock = document.querySelector(dockSelector)
    if (!dock) return hide()
    const requests = dock.closest('[data-chat-surface]').querySelectorAll(blockingRequests)
    if ([...requests].some(node => !node.closest('[inert], [hidden], [aria-hidden="true"]'))) return hide()
    if (currentKey !== address || rail.parentElement !== dock) hide()
    const locale = root.lang.toLowerCase() || 'en'
    if (currentSnapshot === snapshot && numberLocale === locale) return
    if (numberLocale !== locale) {
      formatter = new Intl.NumberFormat(locale)
      numberLocale = locale
    }
    const oldWidth = rail.isConnected ? chip.getBoundingClientRect().width : 0
    sizeAnimation?.cancel()
    const plus = formatter.format(snapshot.added)
    const minus = formatter.format(snapshot.removed)
    const count = snapshot.files.length
    const text = changesLabel(count, locale, formatter.format(count))
    label.textContent = text
    added.update(plus)
    removed.update(minus)
    chip.setAttribute('aria-label', text + ', +' + plus + ', −' + minus)
    currentKey = address
    currentSnapshot = snapshot
    if (!popover.hidden) renderFiles()
    if (!rail.isConnected) dock.prepend(rail)
    const width = chip.getBoundingClientRect().width
    if (oldWidth && width && width !== oldWidth && motion.matches) {
      sizeAnimation = chip.animate([{ width: oldWidth + 'px' }, { width: width + 'px' }],
        { duration: 200, easing: 'ease-out' })
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync) }
  ctx.onEvent('message.start', event => {
    const address = eventKey(event)
    if (!acceptFrame(event, address, true)) return
    turns.set(address, { revision: 0 })
    schedule()
  })
  ctx.onEvent('hcv.turn_diff', event => {
    const address = eventKey(event), turn = turns.get(address), value = event.payload
    if (!turn || !acceptFrame(event, address) || value?.version !== 2 || !['codex_app_server', 'hermes_native'].includes(value.source)) return
    const owner = [value.agentSessionId, value.hermesTurnId]
    if (value.source === 'codex_app_server') owner.push(value.threadId, value.codexTurnId)
    if (!Number.isSafeInteger(value.revision) || value.revision !== turn.revision + 1 ||
        !owner.every(id => typeof id === 'string' && id.length > 0)) {
      turn.snapshot = null
      schedule()
      return
    }
    const identity = JSON.stringify([value.source, ...owner])
    if (turn.bridge && turn.bridge !== identity) {
      turn.snapshot = null
      schedule()
      return
    }
    turn.bridge = identity
    turn.revision = value.revision
    const parsed = readTurnDiff(value.diff)
    turn.snapshot = parsed ? { ...parsed,
      snapshotId: 'live:' + JSON.stringify([address, value.hermesTurnId, value.revision]) } : null
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
    if (!rail.isConnected && !turns.get(key(...scope(), session))?.snapshot) return
    if (records.some(record => {
      const target = record.target
      if (!(target instanceof Element)) return false
      if (record.type === 'attributes') {
        return target === root || target.contains(rail) || target.matches(dockMounts + ', ' + blockingRequests) ||
          Boolean(target.firstElementChild && target.querySelector(dockMounts + ', ' + blockingRequests))
      }
      if (movedElementMatches(record, blockingRequests)) return true
      if (target.closest('[data-slot="aui_thread-content"]')) return false
      return [...record.removedNodes].some(node => node === rail || node.contains?.(rail)) || movedElementMatches(record, dockMounts)
    })) schedule()
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-hermes-theme', 'lang', 'data-pane-hidden', 'data-popped-out', 'inert', 'hidden', 'aria-hidden'] })
  const stops = [host.state.busyBySession, host.state.activeSessionId, host.state.connectionId, host.state.profile].map(atom => atom.listen(schedule))
  contrast.addEventListener('change', schedule)
  ctx.onDispose(() => { cancelAnimationFrame(frame); observer.disconnect(); contrast.removeEventListener('change', schedule); stops.forEach(stop => stop()); turns.clear(); fences.clear(); hide() })
}



