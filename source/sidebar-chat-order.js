import { host } from '@hermes/plugin-sdk'
import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'

const rowButton = 'button[data-slot="row-button"]'
const ordered = 'data-hcv-sidebar-ordered'
const orderProperty = '--hcv-sidebar-order'
const localDrag = 'data-hcv-reordering-sidebar'
const lifted = 'data-hcv-sidebar-lifted'

function sessionRows(list) {
  const chats = []
  for (const row of list.children) {
    const button = row.querySelector(rowButton)
    for (let fiber = committedFiber(button); fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps
      const session = props?.session
      if (typeof session?.id !== 'string' || typeof props.onResume !== 'function') continue
      const parent = chats.at(-1)
      const profile = session.profile || 'default'
      const lineage = session._lineage_root_id ?? session.id
      const key = JSON.stringify([profile, lineage])
      if (props.branchStem && parent) parent.rows.push(row)
      else chats.push({ key, id: session.id, profile, anchor: row, button, rows: [row] })
      break
    }
  }
  const counts = new Map()
  for (const chat of chats) counts.set(chat.key, (counts.get(chat.key) ?? 0) + 1)
  for (const chat of chats) if (counts.get(chat.key) > 1) chat.key = JSON.stringify([chat.profile, chat.id])
  return chats
}

function nativeProjectOrder(item) {
  for (let fiber = committedFiber(item); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof props?.onReorderProjects === 'function') return props.onReorderProjects
  }
}

function scopeKey() {
  const connection = host.state.connectionId.get()
  const profile = host.state.profile.get()
  return connection && profile ? [connection, profile] : null
}

function savedOrder(storage, key) {
  const value = storage.get(key, [])
  return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : []
}

function applyRanks(items, order) {
  const ranks = new Map(order.map((id, index) => [id, index]))
  const ranked = items.filter(item => ranks.has(item.key)).sort((a, b) => ranks.get(a.key) - ranks.get(b.key))
  let index = 0
  return items.map(item => ranks.has(item.key) ? ranked[index++] : item)
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

// Chat presses still reach Hermes' pointer drag. Only project presses use
// our own gesture, since the native sortable shifts whole project blocks.
export function attachSidebarOrder(content, storage) {
  const lists = new Map()
  const styled = new Set()
  const line = document.createElement('div')
  const ghost = document.createElement('div')
  const label = document.createElement('span')
  line.dataset.hcvChatDropLine = ''
  ghost.dataset.hcvSidebarDragGhost = ''
  ghost.append(label)
  for (const node of [line, ghost]) node.setAttribute('aria-hidden', 'true')
  let bindings
  let drag
  let frame = 0
  let clearClick

  function restore(list) {
    list.removeAttribute(ordered)
    for (const row of list.children) row.style.removeProperty(orderProperty)
    styled.delete(list)
  }

  function register(list, items, key, kind, nativeOrder) {
    if (!list || items.length === 0 || new Set(items.map(item => item.key)).size !== items.length) return
    const order = nativeOrder ? [] : savedOrder(storage, key)
    const ranked = applyRanks(items, order)
    if (ranked.some((item, index) => item !== items[index])) {
      const itemRows = new Set(items.flatMap(item => item.rows))
      const remaining = ranked.flatMap(item => item.rows)
      let index = 0
      list.setAttribute(ordered, kind)
      const children = [...list.children]
      // Move all visible chats in the project. Date dividers and other
      // controls retain their slots and collapsed dates remain reachable.
      const reordered = children.map(row => itemRows.has(row) ? remaining[index++] : row)
      reordered.forEach((row, rank) => row.style.setProperty(orderProperty, String(rank)))
      styled.add(list)
    } else if (styled.has(list)) restore(list)
    lists.set(list, { key, kind, items: ranked, nativeOrder })
  }

  function sync(nextBindings) {
    bindings = nextBindings
    lists.clear()
    const scope = scopeKey()
    if (scope) {
      for (const { project, list } of bindings.chats) {
        if (list) register(list, sessionRows(list), 'sidebar-chat-order:' + JSON.stringify([...scope, project]), 'chat')
      }
      const projectGroups = new Map()
      for (const { item, row, name, id } of bindings.projects) {
        if (id === '__no_project__') continue
        const list = item.parentElement
        if (!projectGroups.has(list)) projectGroups.set(list, [])
        projectGroups.get(list).push({ key: id, anchor: row, button: name, rows: [item] })
      }
      for (const [list, items] of projectGroups) {
        const positions = new Map([...list.children].map((row, index) => [row, index]))
        items.sort((a, b) => positions.get(a.rows[0]) - positions.get(b.rows[0]))
        const reorder = nativeProjectOrder(items[0].rows[0])
        register(list, items, 'sidebar-project-order:' + JSON.stringify(scope), 'project', reorder)
      }
    }
    for (const list of styled) if (!lists.has(list)) restore(list)
    if (drag && lists.get(drag.list)?.key !== drag.key) end()
  }

  function targetAt(x, y) {
    const entry = lists.get(drag.list)
    if (!entry || entry.key !== drag.key || JSON.stringify(scopeKey()) !== drag.scope ||
        !drag.list.isConnected || drag.list.closest('[hidden], [inert], [data-pane-hidden]') ||
        !contains(content.getBoundingClientRect(), x, y) ||
        !contains(drag.list.getBoundingClientRect(), x, y)) return null
    const from = entry.items.findIndex(item => item.key === drag.item)
    if (from < 0) return null
    const geometry = entry.items.map(item => ({
      rect: item.anchor.getBoundingClientRect(),
      bottom: item.rows.at(-1).getBoundingClientRect().bottom,
    }))
    if (y < geometry[0].rect.top || y > geometry.at(-1).bottom) return null
    // The midpoint picks before/after. For an expanded project, the lower
    // half includes its chats, so the line lands after the complete block.
    const before = geometry.findIndex(({ rect, bottom }) => y <= (rect.top + bottom) / 2)
    const slot = before < 0 ? geometry.length : before
    const index = slot > from ? slot - 1 : slot
    if (index === from) return { entry }
    const { rect, bottom } = geometry[slot] ?? geometry.at(-1)
    return { entry, from, index, rect, y: slot === geometry.length ? bottom : rect.top }
  }

  function draw() {
    frame = 0
    if (!drag?.point) return
    const [x, y] = drag.point
    const target = targetAt(x, y)
    const within = Boolean(target)
    document.documentElement.toggleAttribute(localDrag, within)
    if (drag.kind === 'chat') drag.source.toggleAttribute(lifted, within)
    if (within || drag.kind === 'project') {
      ghost.style.transform = `translate3d(${x - drag.offsetX}px, ${y - drag.offsetY}px, 0)`
      if (!ghost.isConnected) document.body.append(ghost)
    } else ghost.remove()
    if (!target?.rect) { line.remove(); return }
    line.style.left = `${target.rect.left + 8}px`
    line.style.width = `${Math.max(0, target.rect.width - 16)}px`
    line.style.top = `${target.y - 1}px`
    if (!line.isConnected) document.body.append(line)
  }

  function move(event) {
    if (event.pointerId !== drag.pointer) return
    if (!drag.point) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return
      if (drag.kind === 'project') {
        drag.source.setAttribute(lifted, '')
        try { drag.source.setPointerCapture(event.pointerId) } catch {}
      }
      label.textContent = drag.label
      ghost.dataset.hcvSidebarDragGhost = drag.kind
    }
    drag.point = [event.clientX, event.clientY]
    if (!frame) frame = requestAnimationFrame(draw)
  }

  function end() {
    const previous = drag
    drag = undefined
    previous?.source.removeAttribute(lifted)
    if (previous?.kind === 'project') {
      if (previous.source.hasPointerCapture(previous.pointer)) previous.source.releasePointerCapture(previous.pointer)
    }
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    line.remove()
    ghost.remove()
    document.documentElement.removeAttribute(localDrag)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', keydown, true)
    window.removeEventListener('blur', end)
    content.removeEventListener('scroll', redraw, true)
  }

  function redraw() {
    if (drag?.point && !frame) frame = requestAnimationFrame(draw)
  }

  function suppressClick(pointer, afterRelease) {
    clearClick?.()
    let timer
    const reset = () => {
      clearTimeout(timer)
      window.removeEventListener('click', block, true)
      window.removeEventListener('pointerup', disarm, true)
      window.removeEventListener('pointerdown', reset, true)
      clearClick = undefined
    }
    const disarm = event => {
      if (event.pointerId === pointer) timer = setTimeout(reset, 0)
    }
    const block = event => {
      if (!event.detail) return
      event.preventDefault()
      event.stopImmediatePropagation()
      reset()
    }
    clearClick = reset
    window.addEventListener('click', block, true)
    window.addEventListener('pointerdown', reset, true)
    if (afterRelease) timer = setTimeout(reset, 0)
    else window.addEventListener('pointerup', disarm, true)
  }

  function commit({ entry, from, index }) {
    const keys = entry.items.map(item => item.key)
    const visible = new Set(keys)
    keys.splice(index, 0, keys.splice(from, 1)[0])
    const previous = [...new Set([...savedOrder(storage, entry.key), ...visible])]
    let offset = 0
    storage.set(entry.key, previous.map(id => visible.has(id) ? keys[offset++] : id))
    if (entry.nativeOrder) entry.nativeOrder(keys)
    else sync(bindings)
  }

  function release(event) {
    if (event.pointerId !== drag.pointer) return
    const target = drag.point && targetAt(event.clientX, event.clientY)
    const sidebarDrop = drag.point && drag.kind === 'chat' &&
      contains(content.getBoundingClientRect(), event.clientX, event.clientY)
    if (drag.point && drag.kind === 'project') suppressClick(drag.pointer, true)
    end()
    // Hermes flushes its last move before committing. Give a sidebar
    // release a denied workspace point, even if a pane snapshot overlaps it.
    if (sidebarDrop) window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: -1, clientY: -1, pointerId: event.pointerId,
    }))
    if (target?.rect) commit(target)
  }

  function cancel(event) {
    if (event.pointerId === drag.pointer) end()
  }

  function keydown(event) {
    if (event.key !== 'Escape') return
    if (drag.point && drag.kind === 'project') {
      event.preventDefault()
      event.stopPropagation()
      suppressClick(drag.pointer, false)
    }
    end()
  }

  function press(event) {
    if (drag || !event.isPrimary || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        !(event.target instanceof Element) || event.target.closest('[contenteditable="true"]')) return
    const name = event.target.closest('[data-hcv-project-name]')
    const project = event.target.closest('[data-hcv-project-row]')
    const button = event.target.closest(rowButton)
    if (!name && event.target.closest('[data-row-actions], [data-reorder-handle], [data-slot="switch"]')) return
    let list = (project ?? button)?.parentElement
    while (list && list !== content && !lists.has(list)) list = list.parentElement
    const entry = lists.get(list)
    if (!entry || entry.items.length < 2) return
    const item = entry.items.find(item => project ? item.anchor === project : item.button === button)
    if (!item) return
    if (project) event.stopPropagation()
    const rect = item.anchor.getBoundingClientRect()
    const title = item.button.querySelector('.hover-marquee-inner')?.textContent || item.button.textContent
    drag = {
      list, item: item.key, key: entry.key, kind: entry.kind, source: item.anchor,
      scope: JSON.stringify(scopeKey()), pointer: event.pointerId, x: event.clientX, y: event.clientY,
      label: title.trim(), offsetX: Math.min(event.clientX - rect.left, 32), offsetY: event.clientY - rect.top,
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', end)
    content.addEventListener('scroll', redraw, true)
  }

  content.addEventListener('pointerdown', press, true)
  return {
    sync,
    dispose() {
      content.removeEventListener('pointerdown', press, true)
      end()
      clearClick?.()
      for (const list of styled) restore(list)
      lists.clear()
    },
  }
}

export function sidebarOrderStyles(active) {
  return `
    ${active} [${ordered}] { reading-flow: grid-order; }
    ${active} [${ordered}] > * { order: var(${orderProperty}, 0); }
    ${active} [${ordered}="chat"] > [class~="group/workspace"]:has(> button[aria-expanded="true"]) {
      display: none;
    }
    ${active} [data-hcv-chat-drop-line] {
      --hcv-drop-ring: light-dark(#0169cc, #0285ff);
      position: fixed;
      z-index: 100;
      height: 2px;
      border-radius: 999px;
      pointer-events: none;
      background: var(--hcv-drop-ring);
    }
    ${active} [data-hcv-chat-drop-line]::before {
      content: '';
      position: absolute;
      inset: -3px auto auto -4px;
      inline-size: 8px;
      block-size: 8px;
      border: 2px solid var(--hcv-drop-ring);
      border-radius: 50%;
      background: light-dark(#ededed, #181818);
    }
    ${active} [data-hcv-sidebar-drag-ghost] {
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      max-inline-size: 320px;
      block-size: 32px;
      padding-inline: 8px;
      border: 1px solid light-dark(#0d0d0d1a, #ffffff1f);
      border-radius: 10px;
      corner-shape: superellipse(1.5);
      background: light-dark(#ededed, #181818);
      color: light-dark(#282828, #dcdcdc);
      font: 400 14px/21px var(--hcv-ui-font);
      opacity: .7;
      box-shadow: 0 4px 8px -2px #0000001a;
      pointer-events: none;
    }
    ${active} [data-hcv-sidebar-drag-ghost] > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    ${active} [data-hcv-sidebar-drag-ghost]::before {
      content: '';
      flex: none;
      inline-size: 20px;
      block-size: 20px;
      background: currentColor;
      mask: ${codexMask('chatTab')} center / 16px 16px no-repeat;
    }
    ${active} [data-hcv-sidebar-drag-ghost="project"]::before {
      mask-image: ${codexMask('folder')};
      mask-size: 14px 14px;
    }
    ${active} [${lifted}] { opacity: .2 !important; }
    ${active}[${localDrag}] body { cursor: grabbing !important; }
    ${active}[${localDrag}] body > div[style*="z-index: 9999"][style*="max-width: 16rem"][style*="will-change: transform"],
    ${active}[${localDrag}] [data-slot="chat-drop-overlay"],
    ${active}[${localDrag}] [data-tree-group] > .pointer-events-none.absolute.inset-0.z-40:has(> .border-dashed) {
      visibility: hidden;
    }
  `
}
