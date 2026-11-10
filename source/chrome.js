import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  host, TITLEBAR_AREAS, useTheme,
} from '@hermes/plugin-sdk'
import { codexIconStyle, codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { attachProjects, projectSidebarStyles } from './sidebar-projects.js'
import { createRecentRows, NativeRecentRows, projectGroupingAction } from './sidebar-recents.js'
import { attachSidebarCron, sidebarCronStyles } from './sidebar-cron.js'

function icon(name) {
  return h('span', { 'aria-hidden': true, 'data-hcv-icon': name, style: codexIconStyle(name) })
}

const sideSelector = '[data-tour="sessions-sidebar"]'
const filterButton = 'button:has(> .codicon-list-filter)'
const filterSelector = `${sideSelector} ${filterButton}`
const flatSelector = '[data-sessions-mode="flat"]:has(button > .codicon-list-filter)'
const newChatSelector = `${sideSelector} button:has(> [data-tour="sidebar-nav-new-session"])`
const selectedTerminal = '[data-tree-tab="terminal"][aria-selected="true"]'
export const toolbarOffsetEvent = 'hcv:toolbar-offset'

const russianPlurals = new Intl.PluralRules('ru')
const sidebarCopy = {
  en: {
    projects: 'Projects',
    recent: 'Recent', recentActions: 'Recent chats actions', newChat: 'New chat',
    refreshRecent: 'Refresh recent chats', findSession: 'Find a session',
    recentEmpty: 'No chats', recentLoading: 'Loading…', recentProfile: 'Open a Hermes profile',
    recentUnavailable: 'Recent chats unavailable. Reopen this list.', recentRefreshError: 'Could not refresh recent chats',
    recentOpenError: 'Could not open the chat. Reopen this list.', untitledChat: 'Untitled chat',
    projectDetails: 'Project details', editProject: 'Edit project', working: 'Working', unread: 'Unread chats',
    projectChats: count => `${count} ${count === 1 ? 'chat' : 'chats'}`,
    noTerminals: 'No open terminals', terminalShortcut: 'Use the New terminal shortcut to start a shell.',
    terminalUnbound: 'Set a shortcut for New terminal in Keyboard shortcuts.',
  },
  ru: {
    projects: 'Проекты',
    recent: 'Недавние', recentActions: 'Действия с недавними', newChat: 'Новый чат',
    refreshRecent: 'Обновить недавние', findSession: 'Найти сеанс',
    recentEmpty: 'Нет чатов', recentLoading: 'Загрузка…', recentProfile: 'Откройте нужный профиль Hermes',
    recentUnavailable: 'Список недоступен. Откройте его повторно.', recentRefreshError: 'Не удалось обновить недавние чаты',
    recentOpenError: 'Чат не открылся. Обновите список.', untitledChat: 'Чат без названия',
    projectDetails: 'О проекте', editProject: 'Редактировать проект', working: 'В работе', unread: 'Есть непрочитанные чаты',
    projectChats: count => `${count} ${({ one: 'чат', few: 'чата' })[russianPlurals.select(count)] || 'чатов'}`,
    noTerminals: 'Нет открытых терминалов', terminalShortcut: 'Запустите оболочку сочетанием «Новый терминал».',
    terminalUnbound: 'Задайте сочетание «Новый терминал» в настройках клавиатуры.',
  },
}

function visibleControl(selector) {
  return [...document.querySelectorAll(selector)].find((control) =>
    !control.disabled && !control.closest('[inert], [hidden]') &&
    control.getClientRects().length && getComputedStyle(control).visibility === 'visible',
  )
}

function newChat() {
  const native = visibleControl(newChatSelector)
  if (native) native.click()
  else host.newChat()
}

function openGrouping() {
  const trigger = visibleControl(filterSelector)
  if (!trigger) return
  trigger.focus({ preventScroll: true })
  // Radix handles Enter/pointerdown on its trigger, rather than click.
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

function edit(command) {
  const input = visibleControl('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]')
  if (!input) return
  input.focus()
  if (command === 'selectAll') document.execCommand(command)
  else input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: command === 'redo', bubbles: true, cancelable: true,
  }))
}

function WindowMenus({ menus }) {
  const [current, setCurrent] = useState(null)
  const leaveTimer = useRef(0)
  const keepOpen = () => clearTimeout(leaveTimer.current)

  useEffect(() => {
    const wide = window.matchMedia('(forced-colors: none) and (min-width: 800px) and (min-height: 480px)')
    const dismiss = () => {
      keepOpen()
      setCurrent(null)
    }
    wide.addEventListener('change', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      keepOpen()
      wide.removeEventListener('change', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  function leave(event, label) {
    if (event.pointerType !== 'mouse') return
    keepOpen()
    // Let the pointer cross the gap between the trigger and the portaled menu.
    leaveTimer.current = setTimeout(() => {
      setCurrent(previous => previous?.label === label && previous.preview ? null : previous)
    }, 160)
  }

  return h('nav', { 'aria-label': 'Меню окна', 'data-hcv-window-menu': '' }, menus.map(([label, items]) => {
    const open = current?.label === label
    const preview = open && current.preview
    const change = (next) => {
      keepOpen()
      setCurrent(previous => next ? { label, preview: false } : previous?.label === label ? null : previous)
    }
    const engage = (event) => {
      event.preventDefault()
      change(true)
      document.getElementById(event.currentTarget.getAttribute('aria-controls'))?.focus({ preventScroll: true })
    }
    return h(DropdownMenu, { key: label, modal: false, open, onOpenChange: change },
      h(DropdownMenuTrigger, { asChild: true }, h('button', {
        type: 'button',
        'data-hcv-menu-button': '',
        onPointerEnter: (event) => {
          if (event.pointerType !== 'mouse' || event.buttons) return
          keepOpen()
          setCurrent(previous => previous?.label === label ? previous : { label, preview: true })
        },
        onPointerLeave: (event) => leave(event, label),
        onPointerDown: (event) => {
          if (preview && event.button === 0 && !event.ctrlKey) engage(event)
        },
        onKeyDown: (event) => {
          if (preview && ['Enter', ' ', 'ArrowDown'].includes(event.key)) engage(event)
        },
        onClick: (event) => {
          if (event.detail === 0) change(!open || preview)
        },
      }, label)),
      // Unmount the previous popup immediately when moving between triggers.
      open && h(DropdownMenuContent, {
        align: 'start',
        'data-hcv-window-menu-content': '',
        onPointerEnter: keepOpen,
        onPointerLeave: (event) => leave(event, label),
        onOpenAutoFocus: (event) => { if (preview) event.preventDefault() },
        onCloseAutoFocus: (event) => {
          if (preview || document.querySelector('[data-hcv-menu-button][aria-expanded="true"]')) event.preventDefault()
        },
        onInteractOutside: (event) => {
          if (event.target.closest?.('[data-hcv-menu-button]')) event.preventDefault()
        },
      }, items.map(([title, run, disabled]) => h(DropdownMenuItem, {
        key: title,
        disabled: typeof disabled === 'function' ? disabled() : disabled,
        // Mouse preview leaves the typing focus where it was.
        onPointerMove: (event) => { if (preview && event.pointerType === 'mouse') event.preventDefault() },
        onPointerLeave: (event) => { if (preview && event.pointerType === 'mouse') event.preventDefault() },
        onSelect: () => setTimeout(run, 0),
      }, title))),
    )
  }))
}

function WindowChrome({ themeName, recentRows }) {
  const selected = useTheme().themeName === themeName
  const [historyState, setHistoryState] = useState({ back: false, forward: false })

  useEffect(() => {
    if (!selected || !window.navigation) return
    const update = () => setHistoryState({ back: window.navigation.canGoBack, forward: window.navigation.canGoForward })
    update()
    window.navigation.addEventListener('currententrychange', update)
    return () => window.navigation.removeEventListener('currententrychange', update)
  }, [selected])

  if (!selected) return null
  const menus = [
    ['Файл', [['Новый чат', newChat], ['Файлы проекта', () => host.revealPane('files')], ['Настройки', () => host.navigate('/settings')]]],
    ['Правка', [['Отменить ввод', () => edit('undo')], ['Повторить ввод', () => edit('redo')], ['Выделить текст ввода', () => edit('selectAll')]]],
    ['Вид', [['Сеансы', () => host.revealPane('sessions')], ['Боты', () => host.revealPane('hermes-bots:pane')],
      ['Группировка проектов и чатов', openGrouping, () => !visibleControl(filterSelector)],
      ['Правая панель', () => visibleControl('[data-tour="right-pane-toggle"]')?.click()]]],
    ['Справка', [['О программе', () => host.navigate('/settings?tab=about')]]],
  ]
  return h(Fragment, null,
    h('div', { 'data-hcv-history': '' },
      h('button', { type: 'button', 'aria-label': 'Назад', title: 'Назад', disabled: !historyState.back, onClick: () => history.back() }, icon('back')),
      h('button', { type: 'button', 'aria-label': 'Вперёд', title: 'Вперёд', disabled: !historyState.forward, onClick: () => history.forward() }, icon('forward')),
    ),
    h(WindowMenus, { menus }),
    h(NativeRecentRows, { rows: recentRows }),
  )
}

function element(tag, attrs = {}, text) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text) node.textContent = text
  return node
}

function appendIcon(node, name) {
  const glyph = element('span', { 'aria-hidden': 'true', 'data-hcv-icon': name })
  Object.assign(glyph.style, codexIconStyle(name))
  node.append(glyph)
}

function sidebarButton(label, symbol, onClick) {
  const button = element('button', { type: 'button', 'aria-label': label, title: label })
  appendIcon(button, symbol)
  if (onClick) button.addEventListener('click', onClick)
  return button
}

function recentsControl(groupId, rows, t) {
  const area = element('div', { 'data-hcv-recents': '' })
  const id = `hcv-recents-${groupId}`
  const body = element('div', { id, 'data-hcv-recents-body': '' })
  const list = element('div', { 'data-hcv-recents-list': '' })
  const fallback = element('div', { 'data-hcv-recents-fallback': '', hidden: '' })
  body.append(list, fallback)
  body.inert = true
  const button = element('button', { type: 'button', 'aria-expanded': 'false', 'aria-controls': id })
  const label = document.createTextNode('')
  button.dataset.hcvRecentsToggle = ''
  button.append(label)
  appendIcon(button, 'sidebarDisclosure')
  const header = element('div', { 'data-hcv-recents-header': '' })
  const actions = element('div', { 'data-hcv-recents-actions': '' })
  const popup = element('div', { popover: 'auto', 'data-hcv-recents-menu': '' })
  const more = sidebarButton(t('recentActions'), 'more', () => {
    const rect = more.getBoundingClientRect()
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - 218, rect.left))}px`
    popup.style.top = `${Math.max(8, rect.bottom + 84 < window.innerHeight ? rect.bottom + 4 : rect.top - 84)}px`
  })
  more.popoverTargetElement = popup
  more.setAttribute('aria-expanded', 'false')
  popup.addEventListener('toggle', (event) => more.setAttribute('aria-expanded', String(event.newState === 'open')))
  const add = sidebarButton(t('newChat'), 'newChat', newChat)
  const refresh = element('button', { type: 'button', autofocus: '' })
  const all = element('button', { type: 'button' })
  function localize() {
    label.data = t('recent')
    more.title = t('recentActions')
    more.setAttribute('aria-label', more.title)
    add.title = t('newChat')
    add.setAttribute('aria-label', add.title)
    refresh.textContent = t('refreshRecent')
    all.textContent = t('findSession')
  }
  const dismiss = () => { if (popup.matches(':popover-open')) popup.hidePopover() }
  refresh.addEventListener('click', () => {
    dismiss()
    const source = rows.get()
    if (source?.container === list && source.refresh) {
      void Promise.resolve().then(source.refresh).catch(error =>
        host.notifyError(error, t('recentRefreshError')))
    } else void show()
  })
  all.addEventListener('click', () => { dismiss(); host.navigate('/command-center?section=sessions') })
  popup.append(refresh, all)
  actions.append(more, add)
  header.append(button, actions)
  let generation = 0
  let nativeUpdates
  const close = () => {
    ++generation
    clearInterval(nativeUpdates)
    area.removeAttribute('data-hcv-recents-open')
    body.inert = true
    fallback.removeAttribute('aria-busy')
    button.setAttribute('aria-expanded', 'false')
    dismiss()
  }
  const reset = () => {
    close()
    rows.clear(list)
  }
  async function show() {
    if (!area.isConnected) return
    const request = ++generation
    clearInterval(nativeUpdates)
    area.setAttribute('data-hcv-recents-open', '')
    body.inert = false
    button.setAttribute('aria-expanded', 'true')
    const update = () => rows.update(area.parentElement, list, t('recentEmpty'))
    if (update()) {
      list.hidden = false
      fallback.hidden = true
      // The native list can change while every project row is collapsed.
      nativeUpdates = setInterval(() => { if (!update()) void show() }, 400)
      return
    }
    rows.clear(list)
    list.hidden = true
    fallback.hidden = false
    fallback.textContent = t('recentLoading')
    fallback.setAttribute('aria-busy', 'true')
    const profile = host.state.profile.get()
    const connection = host.state.connectionId.get()
    const current = () => request === generation && fallback.isConnected && host.state.profile.get() === profile && host.state.connectionId.get() === connection
    try {
      if (!profile || !connection) {
        fallback.textContent = t('recentProfile')
        return
      }
      const query = new URLSearchParams({ recents_profile: profile, recents_limit: '12', recents_exclude: 'cron,tool', cron_limit: '1', messaging_limit: '1' })
      const result = await window.hermesDesktop.api({ connectionId: connection, path: `/api/profiles/sessions/sidebar?${query}`, timeoutMs: 8000 })
      if (!current()) return
      fallback.textContent = ''
      for (const session of (result.recents?.sessions ?? []).filter(session => session.id && !session.pinned).slice(0, 12)) {
        const title = session.title?.trim() || t('untitledChat')
        const row = element('button', { type: 'button', title }, title)
        row.addEventListener('click', async () => {
          if (!current()) return
          try {
            await host.openSession(session.id)
          } catch {
            if (current()) fallback.textContent = t('recentOpenError')
          }
        })
        fallback.append(row)
      }
      if (!fallback.childElementCount) fallback.textContent = t('recentEmpty')
    } catch {
      if (current()) fallback.textContent = t('recentUnavailable')
    } finally {
      if (current()) fallback.removeAttribute('aria-busy')
    }
  }
  button.addEventListener('click', () => {
    if (area.hasAttribute('data-hcv-recents-open')) close()
    else void show()
  })
  area.append(header, body, popup)
  return {
    area,
    localize,
    reset,
    show,
    remove() {
      reset()
      area.remove()
    },
  }
}

function sidebarMenuBehavior(content) {
  const triggerSelector = '[data-sessions-mode] :is([class~="group/workspace"], .row-hover) [data-row-actions] button[aria-haspopup="menu"][aria-expanded="true"][aria-controls]'
  let open
  let returnFocus

  function clear() {
    open?.menu.removeAttribute('data-hcv-sidebar-menu')
    open?.menu.style.removeProperty('--hcv-sidebar-menu-shift')
    open?.menu.style.removeProperty('--hcv-sidebar-menu-origin')
    open = undefined
  }

  function handleEscape(event) {
    // Hermes suppresses its own focus return so selecting Appearance can
    // open a second popover. Restore only when Escape dismissed the menu.
    if (event.key === 'Escape' && open?.menu.contains(event.target)) returnFocus = open
  }

  document.addEventListener('keydown', handleEscape, true)
  return {
    sync() {
      if (returnFocus && !returnFocus.menu.isConnected) {
        const { trigger } = returnFocus
        returnFocus = undefined
        if (trigger.isConnected && document.activeElement === document.body) trigger.focus({ preventScroll: true })
      }
      const trigger = content.querySelector(triggerSelector)
      const menu = trigger && document.getElementById(trigger.getAttribute('aria-controls'))
      const wrapper = menu?.closest('[data-radix-popper-content-wrapper]')
      if (!wrapper || !menu.matches('[data-slot="dropdown-menu-content"][data-state="open"]')) {
        if (open && !open.menu.isConnected) clear()
        return
      }
      if (open?.menu !== menu) {
        clear()
        open = { menu, trigger }
        menu.setAttribute('data-hcv-sidebar-menu', '')
      }
      // Keep Radix in charge of flipping and vertical collision. Translate
      // horizontally toward the center of the window and clamp to its edges.
      const rect = trigger.getBoundingClientRect()
      const base = wrapper.getBoundingClientRect()
      const width = menu.offsetWidth
      const center = rect.left + rect.width / 2
      const left = Math.max(8, Math.min(window.innerWidth - width - 8,
        center < window.innerWidth / 2 ? rect.left : rect.right - width))
      const origin = Math.max(0, Math.min(width, center - left))
      menu.style.setProperty('--hcv-sidebar-menu-shift', `${left - base.left}px`)
      menu.style.setProperty('--hcv-sidebar-menu-origin', `${origin}px ${menu.dataset.side === 'top' ? 'bottom' : 'top'}`)
    },
    dispose() {
      document.removeEventListener('keydown', handleEscape, true)
      returnFocus = undefined
      clear()
    },
  }
}

function newTerminalShortcut() {
  let binding
  try {
    binding = JSON.parse(localStorage.getItem('hermes.desktop.keybinds'))?.['view.newTerminal']
  } catch {
    // Match the native keybind store's default for unreadable settings.
  }
  const combo = Array.isArray(binding) ? binding.find(value => typeof value === 'string') : 'ctrl+shift+`'
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const labels = { ctrl: 'Ctrl', mod, meta: mod, alt: 'Alt', shift: 'Shift' }
  return combo?.split('+').map(key => labels[key] || key.toUpperCase()).join(' + ')
}

function attachSidebarHeader(group, t) {
  const bar = element('header', { 'data-hcv-sidebar-bar': '' })
  const search = sidebarButton('Поиск чатов', 'search')
  const bell = sidebarButton('Уведомления', 'bell', () => host.navigate('/settings?tab=notifications'))
  search.dataset.hcvSearchToggle = ''
  bell.dataset.hcvNotifications = ''
  search.setAttribute('aria-expanded', 'false')
  bar.append(element('span', { 'data-hcv-brand': '' }, 'Hermes'), bell, search)
  group.setAttribute('data-hcv-sidebar-shell', '')
  let terminalEmpty
  function syncTerminal() {
    const surface = group.querySelector(`:scope > [data-panel-header] ${selectedTerminal}`) &&
      document.querySelector('[data-persistent-terminal]:not(:has(> [data-terminal]))')
    if (!surface) {
      terminalEmpty?.remove()
      return
    }
    if (!terminalEmpty) {
      terminalEmpty = element('div', { 'data-hcv-terminal-empty': '' })
      terminalEmpty.append(element('p'), element('p'), element('kbd'))
    }
    const shortcut = newTerminalShortcut()
    const [title, description, keys] = terminalEmpty.children
    const copy = [t('noTerminals'), t(shortcut ? 'terminalShortcut' : 'terminalUnbound'), shortcut || '']
    for (const [index, node] of [title, description, keys].entries()) {
      if (node.textContent !== copy[index]) node.textContent = copy[index]
    }
    if (terminalEmpty.parentElement !== surface) surface.append(terminalEmpty)
  }
  return {
    group,
    search,
    sync(content) {
      const parent = group.querySelector(':scope > [data-panel-header]') || content
      if (parent && bar.parentElement !== parent) parent.prepend(bar)
      if (search.hidden !== !content) search.hidden = !content
      syncTerminal()
    },
    remove() {
      bar.remove()
      terminalEmpty?.remove()
      group.removeAttribute('data-hcv-sidebar-shell')
    },
  }
}

function flatRecents(recentRows, t) {
  let flatHeader
  let previousFlatLabel
  const flatList = element('div', { 'data-hcv-flat-list': '' })

  function localizeFlatHeader() {
    if (!flatHeader) return
    const label = t('recent')
    flatHeader.setAttribute('data-hcv-flat-recent', label)
    flatHeader.setAttribute('aria-label', label)
  }
  function updateFlatHeader(next) {
    if (flatHeader === next) return
    if (flatHeader) {
      flatHeader.removeAttribute('data-hcv-flat-recent')
      if (previousFlatLabel === null) flatHeader.removeAttribute('aria-label')
      else flatHeader.setAttribute('aria-label', previousFlatLabel)
    }
    flatHeader = next
    if (flatHeader) {
      previousFlatLabel = flatHeader.getAttribute('aria-label')
      localizeFlatHeader()
    }
  }
  function syncFlatList(flat) {
    const nativeFlat = flat && recentRows.update(flat, flatList)
    if (nativeFlat) {
      if (flatList.nextElementSibling !== nativeFlat) nativeFlat.before(flatList)
    } else {
      recentRows.clear(flatList)
      flatList.remove()
    }
    const root = nativeFlat && flatList.firstElementChild ? flatList : flat
    updateFlatHeader(root?.querySelector(':scope > [data-slot="sidebar-group"] > :first-child:has(button > .codicon-list-filter) > button'))
  }
  return { sync: syncFlatList, localize: localizeFlatHeader }
}

function attachSidebar(content, group, recentRows, t, { search }) {
  let searchField
  let searchOpen = false
  let chooseGrouping
  let projectRequest
  const searchFieldId = `hcv-search-${group.dataset.treeGroup}`
  const toggleSearch = () => {
    if (searchOpen) closeSearch(true)
    else openSearch()
  }
  search.addEventListener('click', toggleSearch)
  const recent = recentsControl(group.dataset.treeGroup, recentRows, t)
  const sidebarMenu = sidebarMenuBehavior(content)
  const projectsLabel = document.createTextNode('')
  const projectsButton = element('button', {
    type: 'button',
    'data-hcv-show-projects': '',
    'aria-expanded': 'false',
  })
  projectsButton.append(projectsLabel)
  appendIcon(projectsButton, 'sidebarDisclosure')
  function localize() {
    recent.localize()
    projectsLabel.data = t('projects')
  }
  localize()
  projectsButton.addEventListener('click', () => {
    if (!chooseGrouping || projectRequest) return
    const recentGroup = projectsButton.parentElement?.querySelector('[data-hcv-flat-recent]')
      ?.closest('[data-slot="sidebar-group"]')
    projectRequest = {
      keepRecentOpen: Boolean(recentGroup?.querySelector(':scope > [data-slot="sidebar-group-content"]')),
      restoreFocus: document.activeElement === projectsButton,
    }
    chooseGrouping('project')
  })
  const reset = () => {
    projectRequest = undefined
    recent.reset()
  }
  const stopProfile = host.state.profile.subscribe(reset)
  const stopConnection = host.state.connectionId.subscribe(reset)
  function showSearch(open) {
    searchOpen = open && Boolean(searchField)
    searchField?.toggleAttribute('data-hcv-search-open', searchOpen)
    search.setAttribute('aria-expanded', String(searchOpen))
  }
  function openSearch() {
    showSearch(true)
    searchField?.querySelector('input')?.focus({ preventScroll: true })
  }
  function closeSearch(restoreFocus) {
    // The native clear action resets React's query and the gateway results together.
    const clear = searchField?.querySelector('button:has(.codicon-close)')
    const input = searchField?.querySelector('input')
    if (clear) clear.click()
    else if (input?.value) {
      const { set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      set.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    showSearch(false)
    if (restoreFocus) search.focus({ preventScroll: true })
  }
  function clearSearchField() {
    searchField?.removeAttribute('data-hcv-search-field')
    searchField?.removeAttribute('data-hcv-search-open')
    if (searchField?.id === searchFieldId) searchField.removeAttribute('id')
    search.removeAttribute('aria-controls')
  }
  function onSearchKey(event) {
    if (!searchOpen || event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    closeSearch(true)
  }
  function onSearchResult(event) {
    if (!searchOpen || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    if (!event.target.closest?.('[data-sessions-mode="search"] button[data-slot="row-button"]')) return
    // Let React finish the native click before clearing the rows it used.
    queueMicrotask(() => { if (!event.defaultPrevented) closeSearch(false) })
  }
  function onOutsidePress(event) {
    if (searchOpen && !group.contains(event.target)) closeSearch(false)
  }
  content.addEventListener('click', onSearchResult)
  group.addEventListener('keydown', onSearchKey, true)
  document.addEventListener('pointerdown', onOutsidePress, true)
  // Hermes dispatches this for its existing session-search shortcut.
  window.addEventListener('hermes:focus-session-search', openSearch, true)
  return {
    content,
    group,
    localize,
    sync(flat) {
      const input = content.querySelector(':scope > div > div > input[type="text"][placeholder]')
      const field = input?.parentElement?.parentElement
      if (field !== searchField) {
        clearSearchField()
        searchField = field
        if (field) {
          field.setAttribute('data-hcv-search-field', '')
          if (!field.id) field.id = searchFieldId
          search.setAttribute('aria-controls', field.id)
        }
        showSearch(searchOpen || input === document.activeElement || Boolean(input?.value))
      }
      search.disabled = !searchField
      const tree = content.querySelector('[data-sessions-mode="projects"]')
      if (tree && recent.area.parentElement !== tree) {
        recent.reset()
        tree.append(recent.area)
      }
      else if (!tree && recent.area.isConnected) recent.remove()
      chooseGrouping = flat && projectGroupingAction(flat.querySelector(filterButton))
      if (chooseGrouping && projectsButton.parentElement !== flat) flat.prepend(projectsButton)
      else if (!chooseGrouping) projectsButton.remove()
      const projectsToggle = tree?.querySelector('[data-hcv-projects-header] [data-hcv-section-toggle]')
      if (projectRequest && projectsToggle) {
        const { keepRecentOpen, restoreFocus } = projectRequest
        projectRequest = undefined
        if (projectsToggle.getAttribute('aria-expanded') === 'false') projectsToggle.click()
        if (keepRecentOpen) void recent.show()
        if (restoreFocus) projectsToggle.focus({ preventScroll: true })
      } else if (!tree && !flat) {
        projectRequest = undefined
      }
      sidebarMenu.sync()
    },
    remove() {
      search.removeEventListener('click', toggleSearch)
      search.setAttribute('aria-expanded', 'false')
      clearSearchField()
      content.removeEventListener('click', onSearchResult)
      group.removeEventListener('keydown', onSearchKey, true)
      document.removeEventListener('pointerdown', onOutsidePress, true)
      window.removeEventListener('hermes:focus-session-search', openSearch, true)
      stopProfile()
      stopConnection()
      recent.remove()
      projectsButton.remove()
      sidebarMenu.dispose()
    },
  }
}

function registerSidebar(ctx, active, recentRows) {
  const wide = window.matchMedia('(forced-colors: none) and (min-width: 800px) and (min-height: 480px)')
  const contrast = window.matchMedia('(forced-colors: none)')
  const flatList = flatRecents(recentRows, ctx.i18n.t)
  let projects
  let cron
  let projectContent
  let mounted
  let header
  let anchors = []
  let queued
  const setToolbarOffset = (value) => {
    const property = '--hcv-sidebar-right-offset'
    const style = document.documentElement.style
    const offset = value > 0 ? `${value}px` : ''
    if (style.getPropertyValue(property) === offset) return
    if (offset) style.setProperty(property, offset)
    else style.removeProperty(property)
    window.dispatchEvent(new Event(toolbarOffsetEvent))
  }
  const sync = () => {
    queued = undefined
    const enabled = contrast.matches && document.documentElement.matches(active)
    // Use Hermes' pane marker. A tab can change visibility without changing
    // its size, and a native overlay can temporarily make the pane inert.
    const sidebar = enabled
      ? [...document.querySelectorAll(`${sideSelector} > [data-slot="sidebar-content"]`)].find(node =>
          !node.closest('[data-pane-hidden], [hidden]') && node.getClientRects().length,
        )
      : null
    if (projectContent !== sidebar) {
      projects?.dispose()
      cron?.dispose()
      projectContent = sidebar
      projects = sidebar ? attachProjects(sidebar, ctx.i18n.t, ctx.storage) : undefined
      cron = sidebar ? attachSidebarCron(sidebar, ctx.storage) : undefined
    }
    projects?.sync()
    cron?.sync()
    const content = wide.matches ? sidebar : null
    const group = enabled && wide.matches
      ? (content?.closest('[data-tree-group]') ??
        document.querySelector('[data-tree-tab="sessions"]')?.closest('[data-tree-group]') ??
        document.querySelector('[data-tree-group="grp-sessions"][data-window-top]:not([data-pane-host])'))
      : null
    const compatible = group?.clientWidth >= 190 && (content || group.querySelector(':scope > [data-panel-header]'))
    const workspace = group && document.querySelector('[data-tree-group="grp-main"][data-window-top]')
    const targets = [...new Set([content, group, workspace].filter(Boolean))]
    if (targets.length !== anchors.length || targets.some((node, index) => node !== anchors[index])) {
      resize.disconnect()
      for (const node of targets) resize.observe(node)
      anchors = targets
    }
    const railBox = group?.getBoundingClientRect()
    const workspaceBox = workspace?.getBoundingClientRect()
    // The fixed toolbar belongs to the chat edge when the sessions zone is
    // physically on its right. The measured offset follows resize and swap.
    const rightRail = railBox?.width > 0 && workspaceBox?.width > 0 && railBox.left >= workspaceBox.right - 2
    setToolbarOffset(rightRail ? Math.max(0, window.innerWidth - workspaceBox.right) : 0)
    if (mounted && (mounted.content !== content || mounted.group !== group || !compatible)) {
      mounted.remove()
      mounted = undefined
    }
    if (header && (header.group !== group || !compatible)) {
      header.remove()
      header = undefined
    }
    if (compatible && !header) header = attachSidebarHeader(group, ctx.i18n.t)
    header?.sync(content)
    if (header && content && !mounted) mounted = attachSidebar(content, group, recentRows, ctx.i18n.t, header)
    const flat = sidebar?.querySelector(flatSelector)
    mounted?.sync(flat)
    flatList.sync(flat)
  }
  const schedule = () => { if (queued === undefined) queued = requestAnimationFrame(sync) }
  const stopBusy = host.state.busyBySession.listen(schedule)
  ctx.i18n.onLocaleChange(() => {
    mounted?.localize()
    flatList.localize()
    schedule()
  })
  const resize = new ResizeObserver(schedule)
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'aria-expanded', 'aria-selected', 'data-sessions-mode', 'data-sessions-project', 'data-working', 'data-side', 'inert', 'hidden', 'data-pane-hidden'],
    childList: true,
    subtree: true,
  })
  wide.addEventListener('change', schedule)
  contrast.addEventListener('change', schedule)
  window.addEventListener('resize', schedule)
  ctx.onDispose(() => {
    stopBusy()
    observer.disconnect()
    resize.disconnect()
    wide.removeEventListener('change', schedule)
    contrast.removeEventListener('change', schedule)
    window.removeEventListener('resize', schedule)
    setToolbarOffset(0)
    if (queued !== undefined) cancelAnimationFrame(queued)
    mounted?.remove()
    flatList.sync(undefined)
    header?.remove()
    projects?.dispose()
    cron?.dispose()
  })
  schedule()
}

export function registerWorkspaceChrome(ctx, themeName) {
  ctx.i18n.register(sidebarCopy)
  const active = `html[data-hermes-codex-visual][data-hermes-theme="${themeName}"]`
  const shell = `${active}:has([data-hcv-window-menu])`
  const side = `${shell} [data-hcv-sidebar-shell]`
  const sidebarStrip = `${active} :is([data-hcv-sidebar-shell] > [data-panel-header] [data-zone-tabstrip], [data-zone-tabstrip="grp-sessions"])`
  const sidebarTab = `${sidebarStrip} > [role="tablist"] > [role="tab"]:has(> .pane-tab-content)`
  const sidebarTerminal = `${active}:has([data-hcv-sidebar-shell] > [data-panel-header] ${selectedTerminal}) [data-persistent-terminal]`
  const sidebarRow = `${active} ${sideSelector} [data-sessions-mode] .row-hover:not([class~="group/workspace"])`
  const flat = `${active} ${sideSelector} [data-sessions-mode="flat"]`
  const rowMore = '[data-row-actions] > button[aria-haspopup="menu"]:has(> .codicon-kebab-vertical)'
  const recentsButton = '[data-hcv-recents-actions] button, [data-hcv-recents-menu] button, [data-hcv-recents-fallback] button'
  const recentToggle = '[data-hcv-recents-toggle]'
  const caret = '[data-hcv-icon="sidebarDisclosure"]'
  const flatRecent = '[data-hcv-flat-recent]'
  const flatCaret = `${flatRecent} > .codicon-chevron-right`
  const flatGroup = `${flat} [data-slot="sidebar-group"]`
  const flatOpenGroup = `${flatGroup}:has(> [data-slot="sidebar-group-content"])`
  const neutralHeadings = `${side} :is([data-hcv-recents-toggle], [data-hcv-show-projects], [data-hcv-flat-recent])`
  const chromeButton = `${shell} :is([data-hcv-history] button, [data-hcv-menu-button], [data-hcv-sidebar-bar] button, ${recentsButton})`
  const recentRows = createRecentRows()
  const stylesheet = element('style', { 'data-hcv-chrome-styles': '' })
  stylesheet.textContent = `
@media (forced-colors: none) {
  ${active} {
    --hcv-sidebar-heading: light-dark(color-mix(in oklab, var(--hcv-text) 50%, transparent), rgb(255 255 255 / 50%));
  }
  ${projectSidebarStyles(active)}
  ${sidebarCronStyles(active)}
  ${flat} [data-hcv-flat-list] { display: contents; }
  ${flat} [data-hcv-flat-list]:has(> [data-slot="sidebar-group"]) + [data-slot="sidebar-group"] { display: none; }
  ${flat} ${flatRecent} { flex: 1 1 0; align-self: stretch; }
  ${codexIconRules(`${flat} ${flatCaret}`, 'sidebarDisclosure')}
  ${flat} ${flatCaret} { rotate: -90deg; opacity: 1; }
  ${flatOpenGroup} ${flatCaret} { rotate: none; opacity: 0; }
  ${flatOpenGroup}:hover ${flatCaret}, ${flatOpenGroup} ${flatRecent}:focus-visible > .codicon-chevron-right { opacity: 1; }
  ${flat} [data-hcv-flat-recent] > span:has(> .dither) { display: none; }
  ${flat} [data-hcv-flat-recent]::before {
    content: attr(data-hcv-flat-recent);
    padding-inline-start: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
  }
  ${sidebarStrip} > [role="tablist"] { gap: 2px; align-items: center; }
  ${sidebarStrip} > button { margin-inline: 1px; }
  ${sidebarTab} {
    block-size: 28px;
    min-block-size: 28px;
    max-block-size: 28px;
    margin-inline: 0;
    padding-inline: 7px;
  }
  ${sidebarTab} > .pane-tab-content,
  ${sidebarTab} > .pane-tab-content > :has(> .truncate) { margin-inline: 0; padding-inline: 0; }
  ${sidebarTab} .pane-tab-content .truncate { font-size: 12px; line-height: 16px; }
  ${sidebarTab}[data-closeable] { --pane-tab-close-width: 16px; padding-inline-end: 17px; }
  ${sidebarTab}[data-closeable]:hover > .pane-tab-content { mask-image: none; }
  ${sidebarTerminal} > [data-terminal] { padding-block-start: 8px; padding-inline-start: 10px; }
  ${sidebarTerminal} > [data-hcv-terminal-empty] {
    display: grid;
    justify-items: start;
    gap: 6px;
    padding: 12px 14px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${sidebarTerminal} > [data-hcv-terminal-empty] > p:first-child { color: var(--hcv-text); font-weight: 600; }
  ${sidebarTerminal} > [data-hcv-terminal-empty] kbd {
    padding-inline: 5px;
    border-radius: 5px;
    background: var(--hcv-hover);
    color: var(--hcv-text);
  }
  ${sidebarTerminal} > [data-hcv-terminal-empty] kbd:empty,
  ${sidebarTerminal}:has(> [data-terminal]) > [data-hcv-terminal-empty] { display: none; }
  ${sidebarRow} ${rowMore} {
    inline-size: 24px;
    block-size: 24px;
    border-radius: 7px;
    color: var(--hcv-muted);
    opacity: 0;
    pointer-events: none;
  }
  ${sidebarRow}:is(:hover, :focus-within) ${rowMore},
  ${sidebarRow} ${rowMore}:is(:focus-visible, [aria-expanded="true"]) { opacity: 1; pointer-events: auto; }
  ${sidebarRow} ${rowMore}:is(:hover, :focus-visible, [aria-expanded="true"]) {
    color: var(--hcv-text);
    background: var(--hcv-hover);
  }
  ${sidebarRow} ${rowMore}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (any-hover: none) {
    ${sidebarRow} ${rowMore} { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${sidebarRow} ${rowMore} { transition: opacity 120ms var(--hcv-ease), color 120ms var(--hcv-ease), background-color 120ms var(--hcv-ease); }
  }
}
@media (forced-colors: none) and (min-width: 800px) and (min-height: 480px) {
  ${shell} [data-tree-split="spl-root"] { padding-block-start: 39px; }
  ${shell} [data-titlebar-cluster="left"] {
    inset-inline-start: 5px;
    inset-block-start: 5px;
    gap: 4px;
  }
  ${shell} [data-titlebar-cluster="right"] {
    inset-block-start: 51px;
    right: calc(13px + var(--hcv-sidebar-right-offset, 0px));
  }
  ${shell} :is([data-hcv-history], [data-hcv-window-menu]) { display: flex; align-items: center; gap: 3px; }
  ${shell} [data-hcv-history] { order: -1; }
  ${chromeButton} {
    display: flex;
    align-items: center;
    color: var(--hcv-muted);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  ${shell} :is([data-hcv-history] button, [data-hcv-sidebar-bar] button) {
    inline-size: 28px;
    block-size: 28px;
    justify-content: center;
  }
  ${shell} [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
  ${shell} [data-hcv-menu-button] { block-size: 28px; padding-inline: 8px; font-size: 13px; }
  ${shell} [data-hcv-window-menu-content][data-state] { animation: none; }
  ${chromeButton}:not(:disabled, [data-hcv-recents-menu] button):is(:hover, :focus-visible, [data-state="open"]) {
    color: var(--hcv-text);
    background: var(--hcv-hover);
  }
  ${shell} [data-hcv-history] button:disabled { opacity: .32; cursor: default; }

  ${shell} [data-tree-group="grp-main"][data-window-top] > [data-panel-header]:has([data-zone-tabstrip]) {
    block-size: 48px !important;
    align-items: center;
    background: var(--hcv-chat);
    padding-inline: 20px 168px;
  }
  ${shell} [data-tree-group="grp-main"] > [data-panel-header]:has([data-zone-tabstrip]) > [style*="--panel-titlebar-left"] {
    inline-size: 0 !important;
  }
  ${shell} [data-tree-group="grp-main"] [data-zone-tabstrip] {
    position: static;
    background: transparent;
    box-shadow: none;
    border: 0;
  }
  ${shell} [data-tree-tab="workspace"] { font-size: 13px; text-transform: none; box-shadow: none; background: transparent; }
  ${shell} [data-tree-tab="workspace"] :is(span, .truncate) { font-size: 13px; font-weight: 600; letter-spacing: normal; text-transform: none; }
  ${shell} [data-tree-tab="workspace"]::before {
    content: '';
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: ${codexMask('folder')} center / contain no-repeat;
  }

  ${side} { border-start-start-radius: 12px; background: var(--hcv-sidebar); }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]) {
    block-size: 46px !important;
  }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]):has([data-zone-tabstrip]) {
    block-size: 78px !important;
  }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]) [data-zone-tabstrip] {
    position: absolute;
    inset: auto 6px 4px;
    block-size: 28px;
    background: transparent;
  }
  ${side} [data-hcv-sidebar-bar] {
    display: flex;
    align-items: center;
    block-size: 46px;
    flex: none;
    order: -2;
    gap: 3px;
    padding-inline: 6px 0;
  }
  ${side} > [data-panel-header] > [data-hcv-sidebar-bar] {
    position: absolute;
    inset: 0 0 auto;
    padding-inline: 15px 8px;
  }
  ${side} [data-hcv-sidebar-bar] [data-hcv-brand] {
    flex: 1;
    font: 600 16px/20px var(--hcv-ui-font, system-ui, sans-serif);
    letter-spacing: -.015em;
    color: var(--hcv-text);
  }
  ${side} [data-hcv-sidebar-bar] button {
    position: relative;
    color: var(--hcv-muted);
    transition: color 150ms var(--hcv-ease), background-color 150ms var(--hcv-ease);
  }
  ${side} [data-hcv-sidebar-bar] button:focus-visible {
    outline: 1px solid var(--hcv-focus);
    outline-offset: -1px;
  }
  ${side} [data-hcv-sidebar-bar] button:disabled { opacity: .4; cursor: default; }
  ${side} [data-hcv-sidebar-bar] button[hidden] { display: none; }
  ${side} [data-hcv-search-toggle][aria-expanded="true"] { background: var(--hcv-hover); }
  ${side} [data-hcv-search-field]:not([data-hcv-search-open]) { display: none; }
  ${side} [data-hcv-search-field] {
    order: -1;
    padding: 0 0 8px;
  }
  ${side} [data-hcv-search-field] > div {
    display: flex;
    inline-size: 100%;
    padding-inline: 8px;
    border: 1px solid var(--hcv-stroke);
    border-radius: 8px;
    background: var(--hcv-menu);
    opacity: 1;
  }
  ${side} [data-hcv-search-field] > div:focus-within { border-color: var(--hcv-focus); }
  ${side} [data-hcv-search-field] input { font-size: 13px; }
  ${side} [data-slot="sidebar-content"] > [data-slot="sidebar-group"]:has([data-slot="sidebar-menu"]) {
    padding-block: 2px 10px;
  }
  ${side} [data-slot="sidebar-menu"] > li > button {
    min-block-size: 32px;
    padding-inline: 8px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 430;
  }
  ${side} [data-sessions-mode="projects"] > [data-slot="sidebar-group"] {
    flex: none;
    min-block-size: 0;
    overflow: visible;
  }
  ${side} [data-sessions-mode="projects"] > [data-slot="sidebar-group"] > [data-slot="sidebar-group-content"] { overflow: visible; }
  ${side} [data-sessions-mode]:not([data-sessions-mode="search"]) > [data-slot="sidebar-group"]:first-of-type:has([data-slot="sidebar-group-content"] > div > span > .codicon-pin):not(:has([data-row-actions])) { display: none; }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child span:has(> .dither) {
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    color: var(--hcv-muted);
  }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child span > .dither { display: none; }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child button:not(${flatRecent}) > .codicon-chevron-right { opacity: 1; }
  ${codexIconRules(`${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child button:not(${flatRecent}) > .codicon-chevron-right`, 'right')}
  ${side} [data-sessions-mode="projects"] .row-hover { min-block-size: 28px; border-radius: 9px; }
  ${side} [data-sessions-project]:not([data-sessions-mode]) :is(.codicon-folder-library, .codicon-repo)::before {
    content: '';
    display: block;
    inline-size: 15px;
    block-size: 15px;
    background: currentColor;
    mask: ${codexMask('folder')} center / contain no-repeat;
  }
  ${side} [data-sessions-project]:not([data-sessions-mode]):has(> .grid + .grid) .codicon-folder-library::before { mask-image: ${codexMask('folderOpen')}; }
  ${codexIconRules(`${side} [data-sessions-project]:not([data-sessions-mode]) .codicon-home`, 'home')}
  ${side} [data-hcv-recents] { margin-block: 12px 5px; }
  ${side} [data-hcv-recents-header] { display: flex; align-items: center; justify-content: space-between; padding-inline: 0 4px; min-block-size: 32px; }
  ${side} :is(${recentsButton}) { min-block-size: 30px; gap: 5px; padding-inline: 8px; font-size: 13px; }
  ${side} :is([data-hcv-recents-toggle], [data-hcv-show-projects]) {
    display: flex;
    align-items: center;
    align-self: stretch;
    min-inline-size: 0;
    gap: 4px;
    min-block-size: 28px;
    padding-inline: 8px;
    border-radius: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
  }
  ${side} ${recentToggle} { flex: 1 1 0; }
  ${side} [data-hcv-show-projects] { flex: none; }
  ${neutralHeadings}, ${neutralHeadings}:hover { background-color: transparent; color: var(--hcv-sidebar-heading); }
  ${neutralHeadings}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${side} :is(${recentToggle}, [data-hcv-show-projects]) ${caret} { inline-size: 12px; block-size: 12px; flex: none; opacity: 0; }
  ${side} :is(${recentToggle}, [data-hcv-show-projects])[aria-expanded="false"] ${caret} { rotate: -90deg; opacity: 1; }
  ${side} [data-hcv-recents]:hover ${recentToggle} ${caret}, ${side} ${recentToggle}:focus-visible ${caret} { opacity: 1; }
  ${side} [data-hcv-recents-actions] { display: flex; align-items: center; gap: 1px; opacity: 0; pointer-events: none; }
  ${side} [data-hcv-recents-header]:is(:hover, :focus-within) [data-hcv-recents-actions],
  ${side} [data-hcv-recents-actions]:has([aria-expanded="true"]) { opacity: 1; pointer-events: auto; }
  ${side} [data-hcv-recents-actions] button { inline-size: 26px; min-block-size: 26px; justify-content: center; padding: 0; }
  ${side} [data-hcv-recents-actions] [data-hcv-icon] { inline-size: 14px; block-size: 14px; }
  ${side} [data-hcv-recents-body] { display: grid; grid-template-rows: 0fr; opacity: 0; }
  ${side} [data-hcv-recents-open] [data-hcv-recents-body] { grid-template-rows: 1fr; opacity: 1; }
  ${side} [data-hcv-recents-menu] {
    position: fixed; inset: auto; margin: 0; padding: 6px; inline-size: 210px;
    border: 1px solid var(--hcv-hairline); border-radius: var(--hcv-menu-radius);
    background: var(--hcv-menu); color: var(--hcv-text); box-shadow: var(--hcv-menu-shadow);
    opacity: 0; scale: .95; pointer-events: none; transform-origin: top left;
  }
  ${side} [data-hcv-recents-menu]:popover-open { opacity: 1; scale: 1; pointer-events: auto; }
  ${side} [data-hcv-recents-menu] button {
    inline-size: 100%; color: var(--hcv-text); text-align: start; border-radius: var(--hcv-popup-button-radius);
  }
  @media (any-hover: none) {
    ${side} [data-hcv-recents-actions] { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${side} ${recentToggle} ${caret}, ${flat} ${flatCaret} { transition: opacity 150ms var(--hcv-enter), rotate 150ms var(--hcv-enter); }
    ${side} [data-hcv-recents-actions] { transition: opacity 150ms var(--hcv-ease); }
    ${side} [data-hcv-recents-body] {
      transition: grid-template-rows ${codex.disclosure.heightTime}ms ${codex.disclosure.ease}, opacity ${codex.disclosure.exitTime}ms ${codex.disclosure.ease};
    }
    ${side} [data-hcv-recents-open] [data-hcv-recents-body] {
      transition-delay: 0ms, ${codex.disclosure.enterDelay}ms;
      transition-duration: ${codex.disclosure.heightTime}ms, ${codex.disclosure.enterTime}ms;
    }
    ${side} [data-hcv-recents-menu] {
      transition: opacity 100ms var(--hcv-exit), scale 100ms var(--hcv-exit), display 100ms allow-discrete, overlay 100ms allow-discrete;
    }
    ${side} [data-hcv-recents-menu]:popover-open {
      transition: opacity 150ms var(--hcv-enter), scale 150ms var(--hcv-enter), display 150ms allow-discrete, overlay 150ms allow-discrete;
    }
    @starting-style { ${side} [data-hcv-recents-menu]:popover-open { opacity: 0; scale: .95; } }
  }
  ${side} :is([data-hcv-recents-list], [data-hcv-recents-fallback]) { min-block-size: 0; overflow: hidden; padding-inline: 5px; font-size: 12px; }
  ${side} [data-hcv-recents-list] > [data-slot="sidebar-group"] { padding: 0; }
  ${side} [data-hcv-recents-list] > [data-slot="sidebar-group"] > :first-child { display: none; }
  /* The native virtual list owns scrolling once it has enough rows. */
  ${side} [data-hcv-recents-list] .hcv-recent-scroll .hcv-recent-scroll {
    block-size: min(40vh, 320px);
  }
  ${side} [data-hcv-recents-fallback]:not([hidden]) { display: grid; gap: 2px; }
  ${side} [data-hcv-recents-fallback] button { display: block; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${side} [data-hcv-recent-empty] { padding: 6px 8px; color: var(--hcv-muted); }
}
@media (prefers-reduced-motion: reduce) {
  ${active} [data-hcv-sidebar-bar] button { transition: none; }
}
@media (forced-colors: active), (max-width: 799px), (max-height: 479px) {
  ${active} :is([data-hcv-history], [data-hcv-window-menu]) { display: none; }
}
`
  document.head.append(stylesheet)
  ctx.onDispose(() => stylesheet.remove())
  ctx.register({ id: 'window-menu', area: TITLEBAR_AREAS.left, render: () => h(WindowChrome, { themeName, recentRows }) })
  registerSidebar(ctx, active, recentRows)
}
