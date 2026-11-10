import { host } from '@hermes/plugin-sdk'
import { committedFiber } from './sidebar-recents.js'

const rowButton = 'button[data-slot="row-button"]'
const ordered = 'data-hcv-ordered-chats'
const orderProperty = '--hcv-chat-order'
const dragging = 'data-hcv-reordering-chat'

function sessionRow(row) {
  const button = row.querySelector(':scope > ' + rowButton)
  for (let fiber = committedFiber(button); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    const session = props?.session
    if (typeof session?.id === 'string' && typeof props.onResume === 'function') {
      const key = JSON.stringify([session.profile || 'default', session._lineage_root_id ?? session.id])
      return { key, branch: Boolean(props.branchStem), row, button }
    }
  }
  return null
}

function groupsIn(list) {
  const groups = []
  let group
  for (const [index, row] of Array.from(list.children).entries()) {
    const session = sessionRow(row)
    if (!session) { group = undefined; continue }
    if (!group) { group = { index, chats: [] }; groups.push(group) }
    const parent = group.chats.at(-1)
    if (session.branch && parent) parent.rows.push(row)
    else group.chats.push({ key: session.key, button: session.button, rows: [row] })
  }
  return groups
}

function orderedChats(chats, ranks) {
  const known = chats.filter(chat => ranks.has(chat.key)).sort((a, b) => ranks.get(a.key) - ranks.get(b.key))
  let index = 0
  return chats.map(chat => ranks.has(chat.key) ? known[index++] : chat)
}

function storageKey(project) {
  const connection = host.state.connectionId.get()
  const profile = host.state.profile.get()
  return connection && profile && project
    ? 'sidebar-chat-order:' + JSON.stringify([connection, profile, project]) : ''
}

function savedOrder(storage, key) {
  const value = storage.get(key, [])
  return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : []
}

function sameOrder(left, right) {
  return left.every((chat, index) => chat === right[index])
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

// Observe the same pointer gesture Hermes owns. A drop inside the source
// list only changes ordering; the native handler still owns the workspace.
export function attachSidebarChatOrder(content, storage) {
  const lists = new Map()
  const styled = new Set()
  const line = document.createElement('div')
  line.dataset.hcvChatDropLine = ''
  line.setAttribute('aria-hidden', 'true')
  let drag
  let frame = 0

  function restore(list) {
    list.removeAttribute(ordered)
    for (const row of list.children) row.style.removeProperty(orderProperty)
    styled.delete(list)
  }

  function sync(projectLists) {
    lists.clear()
    for (const { project, list } of projectLists) {
      const key = storageKey(project)
      if (!key || !list) continue
      const groups = groupsIn(list)
      if (!groups.length) continue
      const order = savedOrder(storage, key)
      const ranks = new Map(order.map((id, index) => [id, index]))
      const children = [...list.children]
      let shifted = false
      for (const group of groups) {
        const sorted = orderedChats(group.chats, ranks)
        if (!sameOrder(group.chats, sorted)) {
          const rows = sorted.flatMap(chat => chat.rows)
          children.splice(group.index, rows.length, ...rows)
          shifted = true
        }
        group.chats = sorted
      }
      if (shifted) {
        list.setAttribute(ordered, '')
        children.forEach((row, index) => row.style.setProperty(orderProperty, String(index)))
        styled.add(list)
      } else if (styled.has(list)) restore(list)
      lists.set(list, { key, project, groups })
    }
    for (const list of styled) if (!lists.has(list)) restore(list)
    if (drag && !lists.has(drag.list)) end()
  }

  function position(x, y) {
    const entry = lists.get(drag.list)
    if (!entry || entry.key !== drag.key || entry.key !== storageKey(entry.project) ||
        !drag.list.isConnected || drag.list.closest('[hidden], [inert], [data-pane-hidden]') ||
        !contains(content.getBoundingClientRect(), x, y) ||
        !contains(drag.list.getBoundingClientRect(), x, y)) return null
    const group = entry.groups.find(({ chats }) => chats.some(chat => chat.key === drag.chat))
    if (!group || new Set(group.chats.map(chat => chat.key)).size !== group.chats.length) return null
    const geometry = group.chats.map(chat => {
      const first = chat.rows[0].getBoundingClientRect()
      const bottom = chat.rows.at(-1).getBoundingClientRect().bottom
      return { chat, first, bottom }
    })
    if (y < geometry[0].first.top || y > geometry.at(-1).bottom) return null
    const others = geometry.filter(item => item.chat.key !== drag.chat)
    const before = others.findIndex(item => y <= (item.first.top + item.bottom) / 2)
    const index = before < 0 ? others.length : before
    const target = others[index] || others.at(-1)
    if (!target) return null
    const next = others.map(item => item.chat)
    next.splice(index, 0, group.chats.find(chat => chat.key === drag.chat))
    if (sameOrder(group.chats, next)) return null
    return { group: group.chats, next, rect: target.first, y: before < 0 ? target.bottom : target.first.top }
  }

  function draw() {
    frame = 0
    const target = drag?.point && position(...drag.point)
    document.documentElement.toggleAttribute(dragging, Boolean(target))
    if (!target) { line.remove(); return }
    line.style.left = (target.rect.left + 6) + 'px'
    line.style.width = Math.max(0, target.rect.width - 12) + 'px'
    line.style.top = (target.y - 1) + 'px'
    if (!line.isConnected) document.body.append(line)
  }

  function move(event) {
    if (event.pointerId !== drag.pointer) return
    if (!drag.point && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return
    drag.point = [event.clientX, event.clientY]
    if (!frame) frame = requestAnimationFrame(draw)
  }

  function end() {
    drag = undefined
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    line.remove()
    document.documentElement.removeAttribute(dragging)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', keydown, true)
    window.removeEventListener('blur', end)
  }

  function release(event) {
    if (event.pointerId !== drag.pointer) return
    const target = drag.point && position(event.clientX, event.clientY)
    const key = drag.key
    end()
    if (!target) return
    const visible = new Set(target.group.map(chat => chat.key))
    const previous = [...new Set([...savedOrder(storage, key), ...visible])]
    let index = 0
    storage.set(key, previous.map(id => visible.has(id) ? target.next[index++].key : id))
    sync([...lists].map(([list, entry]) => ({ list, project: entry.project })))
  }

  function cancel(event) {
    if (event.pointerId === drag.pointer) end()
  }

  function keydown(event) {
    if (event.key === 'Escape') end()
  }

  function press(event) {
    if (drag || !event.isPrimary || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        !(event.target instanceof Element) || event.target.closest('[data-row-actions], [data-reorder-handle], [contenteditable="true"]')) return
    const button = event.target.closest(rowButton)
    const list = button?.parentElement?.parentElement
    const entry = lists.get(list)
    const chat = entry?.groups.find(group => group.chats.length > 1 && group.chats.some(item => item.button === button))
      ?.chats.find(item => item.button === button)
    if (!chat || entry.key !== storageKey(entry.project)) return
    drag = { list, key: entry.key, chat: chat.key, pointer: event.pointerId, x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', end)
  }

  content.addEventListener('pointerdown', press, true)
  return {
    sync,
    dispose() {
      content.removeEventListener('pointerdown', press, true)
      end()
      for (const list of styled) restore(list)
      lists.clear()
    },
  }
}

export function sidebarChatOrderStyles(active) {
  return `
    ${active} [${ordered}] { reading-flow: grid-order; }
    ${active} [${ordered}] > * { order: var(${orderProperty}, 0); }
    ${active} [data-hcv-chat-drop-line] {
      position: fixed;
      z-index: 100;
      height: 2px;
      border-radius: 999px;
      pointer-events: none;
      background: var(--hcv-focus);
    }
    ${active}[${dragging}] body { cursor: grabbing !important; }
    ${active}[${dragging}] [data-slot="chat-drop-overlay"],
    ${active}[${dragging}] [data-tree-group] > .pointer-events-none.absolute.inset-0.z-40:has(> .border-dashed) {
      visibility: hidden;
    }
  `
}
