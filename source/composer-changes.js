import { host } from '@hermes/plugin-sdk'

const dockSelector = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [data-pane-hidden] *, [inert] *) [data-slot="composer-dock"]:not([data-popped-out])'
const editTools = new Set(['edit_file', 'patch', 'write_file'])
const ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g
const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/

function resultRecord(value) {
  try {
    const record = typeof value === 'string' ? JSON.parse(value) : value
    return record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  } catch {
    return {}
  }
}

function filePath(value) {
  const path = value?.trim().split('\t')[0]
  return path && path !== '/dev/null' ? path.replace(/^[ab]\//, '') : ''
}

function pathKey(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
}

function changedFiles(payload) {
  const result = resultRecord(payload.result)
  if (payload.error || result.error || result.success === false) return []
  // Hermes's inline preview can be truncated. Prefer the full patch result.
  const diff = [result.diff, result.inline_diff, payload.inline_diff].find(value => typeof value === 'string' && value.trim())
  if (!diff) return []
  const args = payload.args || {}
  const fallback = [result.resolved_path, args.path, args.file, args.filepath, result.path, result.file, result.filepath]
    .find(value => typeof value === 'string' && value.trim())?.trim()
  const sections = []
  let file
  let hunk
  let oldPath
  function section(path) {
    hunk = null
    file = { path, added: 0, removed: 0 }
    sections.push(file)
  }
  for (const line of diff.replace(ansi, '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      hunk = null
      continue
    }
    const header = line.match(hunkHeader)
    if (header) {
      if (!file) section(fallback)
      const oldLines = Number(header[1] ?? 1)
      const newLines = Number(header[2] ?? 1)
      // The header gives the exact total even for a clipped new-file preview.
      const countBody = oldLines > 0 && newLines > 0
      if (!countBody) {
        file.added += newLines
        file.removed += oldLines
      }
      hunk = { oldLines, newLines, countBody }
    } else if (hunk && (hunk.oldLines || hunk.newLines) && /^[ +\-]/.test(line)) {
      if (line[0] !== '+') hunk.oldLines = Math.max(0, hunk.oldLines - 1)
      if (line[0] !== '-') hunk.newLines = Math.max(0, hunk.newLines - 1)
      if (hunk.countBody && line[0] === '+') file.added++
      if (hunk.countBody && line[0] === '-') file.removed++
    } else if (line.startsWith('--- ')) {
      oldPath = filePath(line.slice(4))
    } else if (line.startsWith('+++ ')) {
      section(filePath(line.slice(4)) || oldPath)
    } else if (/^(?:[ab]\/|\/dev\/null|[A-Za-z]:[\\/]).+ → /.test(line)) {
      const [from, to] = line.split(' → ')
      section(filePath(to) || filePath(from))
    }
  }
  const files = sections.filter(row => row.added || row.removed)
  if (files.length === 1 && fallback) files[0].path = fallback
  return files.filter(row => row.path).map(row => ({ ...row, path: pathKey(row.path) }))
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
  const turns = new Map()
  const key = (connection, profile, session) => JSON.stringify([connection, profile, session])
  const scope = () => [host.state.connectionId.get(), host.state.profile.get()]
  const eventKey = event => event.session_id && !event.replayed
    ? key(event.connectionId || scope()[0], event.profile || scope()[1], event.session_id) : null
  const rail = element('div', 'composer-changes')
  const chip = element('div', 'composer-changes-chip')
  const label = element('span', 'composer-changes-label')
  const totals = element('span', 'composer-changes-totals')
  const added = numberDisplay('composer-changes-added', '+')
  const removed = numberDisplay('composer-changes-removed', '−')
  totals.append(added.node, removed.node)
  chip.append(label, totals)
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  for (const child of chip.children) child.setAttribute('aria-hidden', 'true')
  rail.append(chip)
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')
  let currentKey
  let lastText
  let sizeAnimation
  let frame
  function hide() {
    sizeAnimation?.cancel()
    rail.remove()
    currentKey = undefined
    lastText = undefined
  }
  function sync() {
    frame = 0
    if (!root.matches(active) || !contrast.matches) return hide()
    const session = host.state.activeSessionId.get()
    const address = key(...scope(), session)
    const turn = turns.get(address)
    const dock = turn?.paths.size && document.querySelector(dockSelector)
    if (!dock || !host.state.busyBySession.get()[session]) return hide()
    if (currentKey !== address || rail.parentElement !== dock) hide()
    const locale = root.lang.toLowerCase() || 'en'
    const formatter = new Intl.NumberFormat(locale)
    const text = changesLabel(turn.paths.size, locale, formatter.format(turn.paths.size))
    const plus = formatter.format(turn.added)
    const minus = formatter.format(turn.removed)
    const accessible = text + ', +' + plus + ', −' + minus
    if (accessible === lastText && currentKey === address) return
    const oldWidth = rail.isConnected ? chip.getBoundingClientRect().width : 0
    sizeAnimation?.cancel()
    label.textContent = text
    added.update(plus)
    removed.update(minus)
    chip.setAttribute('aria-label', accessible)
    if (!rail.isConnected) dock.prepend(rail)
    const width = chip.getBoundingClientRect().width
    if (oldWidth && width !== oldWidth && motion.matches) {
      sizeAnimation = chip.animate([{ width: oldWidth + 'px' }, { width: width + 'px' }], { duration: 200, easing: 'ease-out' })
    }
    lastText = accessible
    currentKey = address
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync) }
  ctx.onEvent('message.start', event => {
    const address = eventKey(event)
    if (!address) return
    turns.set(address, { since: event.seq, calls: new Set(), paths: new Set(), added: 0, removed: 0 })
    if (turns.size > 64) turns.delete(turns.keys().next().value)
    schedule()
  })
  ctx.onEvent('tool.complete', event => {
    const payload = event.payload
    if (!editTools.has(payload?.name) || !payload.tool_id) return
    const turn = turns.get(eventKey(event))
    if (!turn || event.seq < turn.since || turn.calls.has(payload.tool_id)) return
    const files = changedFiles(payload)
    if (!files.length) return
    turn.calls.add(payload.tool_id)
    for (const row of files) {
      turn.paths.add(row.path)
      turn.added += row.added
      turn.removed += row.removed
    }
    schedule()
  })
  ctx.onEvent('message.complete', event => {
    if (turns.delete(eventKey(event))) schedule()
  })
  const observer = new MutationObserver(schedule)
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-hermes-theme', 'lang', 'data-pane-hidden', 'data-popped-out'],
  })
  const unsubscribe = [host.state.busyBySession, host.state.activeSessionId, host.state.connectionId, host.state.profile]
    .map(atom => atom.listen(schedule))
  contrast.addEventListener('change', schedule)
  ctx.onDispose(() => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    contrast.removeEventListener('change', schedule)
    for (const off of unsubscribe) off()
    hide()
  })
}
