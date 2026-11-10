import { host } from '@hermes/plugin-sdk'
import { codexIconRules, codexIconStyle, codexReference as codex } from './codex-reference.js'
import { nativeProjectActivity } from './sidebar-recents.js'
import { attachSidebarChatOrder, sidebarChatOrderStyles } from './sidebar-chat-order.js'

const media = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const folderRows = '[data-sessions-project]:not([data-sessions-mode])'
const scope = '[data-sessions-mode="projects"]'
const projectSection = '[data-hcv-projects-section]'
const sectionHeader = '[data-hcv-projects-header]'
const projectRow = '[data-hcv-project-row]'
const sectionActions = '[data-hcv-projects-actions]'
const previewCard = '[data-hcv-project-preview]'
const sectionMotion = codex.disclosure

function el(tag, attributes = {}, text) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

function glyph(name) {
  const node = el('span', { 'aria-hidden': 'true', 'data-hcv-icon': name })
  Object.assign(node.style, codexIconStyle(name))
  return node
}

function projectStatus() {
  return el('span', { 'data-hcv-project-status': '', role: 'status', hidden: '' })
}

function showStatus(indicator, kind, t) {
  if (indicator.dataset.hcvProjectStatus !== kind) indicator.dataset.hcvProjectStatus = kind
  if (kind) {
    const label = t(kind)
    if (indicator.getAttribute('aria-label') !== label) indicator.setAttribute('aria-label', label)
  }
  const hidden = !kind
  if (indicator.hidden !== hidden) indicator.hidden = hidden
}

function blockSize(node) {
  const style = getComputedStyle(node)
  return {
    height: `${node.offsetHeight}px`,
    paddingBlockStart: style.paddingBlockStart,
    paddingBlockEnd: style.paddingBlockEnd,
  }
}

// Only the presentation waits to finish closing. The final click still goes
// through Hermes' own disclosure button and its persisted collapse state.
// Nothing is reparented or copied; the closing list stops receiving input.
export function disclosure(button, native, region, regionId, timing = sectionMotion) {
  const direct = button === native
  const initialExpanded = button.getAttribute('aria-expanded')
  const initialControls = button.getAttribute('aria-controls')
  let pending = false
  let forwarding = false
  let motion
  let marked
  function nativeClick() {
    forwarding = true
    try {
      native.click()
    } finally {
      forwarding = false
    }
  }
  const restoreId = () => {
    if (marked?.id === regionId) marked.removeAttribute('id')
    marked = undefined
  }
  function cancel() {
    const previous = motion
    motion = undefined
    if (!previous) return
    previous.height.cancel()
    previous.fade.cancel()
    previous.node.removeAttribute('data-hcv-disclosure-motion')
    if (previous.closing && !previous.wasInert) previous.node.inert = false
  }
  function play(node, opening, from, startOpacity) {
    cancel()
    if (!node.isConnected || media()) {
      if (!opening && native.isConnected) nativeClick()
      return
    }
    const natural = blockSize(node)
    if (!node.offsetHeight) {
      if (!opening && native.isConnected) nativeClick()
      return
    }
    const wasInert = node.inert
    if (!opening) node.inert = true
    node.setAttribute('data-hcv-disclosure-motion', '')
    const empty = { height: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px' }
    const height = node.animate(
      [from || empty, opening ? natural : empty],
      { duration: timing.heightTime, easing: timing.ease, fill: 'both' },
    )
    const fade = node.animate(
      [{ opacity: startOpacity, scale: opening && !from ? '.98' : '1' }, { opacity: opening ? 1 : 0, scale: opening ? '1' : '.98' }],
      { duration: opening ? timing.enterTime : timing.exitTime, delay: opening && !from ? timing.enterDelay : 0, easing: timing.ease, fill: 'both' },
    )
    const current = motion = { node, height, fade, closing: !opening, wasInert }
    height.onfinish = () => {
      if (motion !== current) return
      if (!opening && native.isConnected && region() === node) nativeClick()
      cancel()
    }
  }
  function onClick(event) {
    if (forwarding) return
    const node = region()
    const reduced = media()
    if (!node || reduced) {
      pending = !node && !reduced
      if (!direct) nativeClick()
      return
    }
    if (direct) event.stopPropagation()
    const dimensions = blockSize(node)
    const opacity = Number(getComputedStyle(node).opacity)
    const opening = Boolean(motion?.closing)
    button.setAttribute('aria-expanded', String(opening))
    play(node, opening, dimensions, opacity)
  }
  function onReducedMotion(event) {
    if (!event.matches || !motion) return
    const closing = motion.closing && motion.node === region()
    cancel()
    if (closing && native.isConnected) nativeClick()
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  button.addEventListener('click', onClick, direct)
  reducedMotion.addEventListener('change', onReducedMotion)
  return {
    sync() {
      const node = region()
      if (motion && motion.node !== node) cancel()
      if (node && pending) {
        pending = false
        play(node, true, null, 0)
      }
      if (marked !== node) {
        restoreId()
        if (node && !node.id) {
          node.id = regionId
          marked = node
        }
      }
      const expanded = Boolean(node && !motion?.closing)
      if (button.getAttribute('aria-expanded') !== String(expanded)) button.setAttribute('aria-expanded', String(expanded))
      const controlId = node?.id
      if (controlId && button.getAttribute('aria-controls') !== controlId) button.setAttribute('aria-controls', controlId)
      else if (!controlId) button.removeAttribute('aria-controls')
    },
    dispose() {
      cancel()
      restoreId()
      button.removeEventListener('click', onClick, direct)
      reducedMotion.removeEventListener('change', onReducedMotion)
      if (direct) {
        if (initialExpanded === null) button.removeAttribute('aria-expanded')
        else button.setAttribute('aria-expanded', String(Boolean(region())))
        if (initialControls === null) button.removeAttribute('aria-controls')
        else button.setAttribute('aria-controls', initialControls)
      }
    },
  }
}

function openNativeEdit(trigger, alive) {
  if (!trigger?.isConnected) return
  trigger.focus({ preventScroll: true })
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  requestAnimationFrame(() => {
    if (!alive()) return
    const menu = document.getElementById(trigger.getAttribute('aria-controls'))
    const edit = menu?.querySelector('[role="menuitem"]:has(> .codicon-edit)') ||
      menu?.querySelector('[role="menuitem"]:has(> .codicon-symbol-color)')
    edit?.click()
  })
}

function projectPreview(content, t) {
  const card = el('section', { 'data-hcv-project-preview': '' })
  card.hidden = true
  const title = el('span')
  const heading = el('header')
  heading.append(glyph('folder'), title)
  const count = el('span')
  const sessions = el('div', { 'data-hcv-project-preview-row': '' })
  sessions.append(glyph('messages'), count)
  const summary = el('div', { 'data-hcv-project-preview-summary': '' })
  summary.append(heading, sessions)
  const path = el('span')
  const folder = el('div', { 'data-hcv-project-preview-row': '', 'data-hcv-project-preview-path': '' })
  folder.append(glyph('folder'), path)
  const edit = el('button', { type: 'button', 'data-hcv-project-preview-row': '' })
  const editLabel = el('span')
  edit.append(glyph('settings'), editLabel)
  const footer = el('div', { 'data-hcv-project-preview-edit': '' })
  footer.append(edit)
  card.append(summary, folder, footer)
  document.body.append(card)

  let hovered
  let showing
  let timer
  let delay
  let cache
  let alive = true
  const supportsHover = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
  function close() {
    clearTimeout(timer)
    clearTimeout(delay)
    hovered = undefined
    showing?.row.removeAttribute('data-hcv-preview-open')
    showing = undefined
    card.hidden = true
  }
  function position() {
    if (!showing || !showing.row.isConnected || !content.isConnected) return close()
    const rect = showing.row.getBoundingClientRect()
    if (rect.bottom <= 0 || rect.top >= innerHeight) return close()
    const width = card.offsetWidth
    const height = card.offsetHeight
    const gap = codex.sidebar.previewOffset
    const left = rect.right + width + gap + 8 <= innerWidth ? rect.right + gap : rect.left - width - gap
    card.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`
    card.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.top))}px`
  }
  async function projectData(id) {
    const connection = host.state.connectionId.get()
    const profile = host.state.profile.get()
    if (!profile || !connection || host.state.gateway.get() !== 'open') return
    const key = JSON.stringify([connection, profile])
    const scopeMatches = () => connection === host.state.connectionId.get() && profile === host.state.profile.get()
    if (cache?.key !== key || Date.now() >= cache.until) {
      const result = (async () => {
        const routes = await host.profileRoutes().catch(() => [])
        if (!alive || !scopeMatches()) return []
        const route = routes.find(entry => entry.connectionId === connection && entry.profile === profile)
        const params = { preview_limit: 1 }
        const response = route
          ? await host.requestProfile(route, 'projects.tree', params, 5000)
          : await host.request('projects.tree', params, 5000)
        return Array.isArray(response?.projects) ? response.projects : []
      })().catch(() => [])
      cache = { key, until: Date.now() + 30_000, result }
    }
    const projects = await cache.result
    return scopeMatches() ? projects.find(item => item.id === id) : undefined
  }
  async function show(entry) {
    if (!alive || !entry.row.isConnected || hovered !== entry) return
    showing?.row.removeAttribute('data-hcv-preview-open')
    showing = entry
    entry.row.setAttribute('data-hcv-preview-open', '')
    card.setAttribute('aria-label', t('projectDetails'))
    editLabel.textContent = t('editProject')
    title.textContent = entry.name.textContent
    sessions.hidden = true
    folder.hidden = true
    footer.hidden = !entry.menu
    card.hidden = false
    position()
    const data = await projectData(entry.id)
    if (!alive || showing !== entry || !data) return
    if (Number.isFinite(data.sessionCount)) {
      count.textContent = t('projectChats', data.sessionCount)
      sessions.hidden = false
    }
    if (typeof data.path === 'string' && data.path) {
      path.textContent = data.path
      folder.hidden = false
    }
    position()
  }
  function deferClose() {
    clearTimeout(timer)
    clearTimeout(delay)
    delay = setTimeout(close, 110)
  }
  function onPointerDown(event) {
    if (!card.contains(event.target)) close()
  }
  function onEscape(event) {
    if (event.key === 'Escape' && showing) close()
  }
  edit.addEventListener('click', () => {
    const entry = showing
    close()
    openNativeEdit(entry?.menu, () => alive && entry?.row.isConnected)
  })
  card.addEventListener('pointerenter', () => clearTimeout(delay))
  card.addEventListener('pointerleave', deferClose)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onEscape, true)
  content.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  const stopProfile = host.state.profile.subscribe(() => { cache = undefined; close() })
  const stopConnection = host.state.connectionId.subscribe(() => { cache = undefined; close() })
  return {
    attach(entry) {
      const enter = (event) => {
        if (!supportsHover.matches || event.pointerType !== 'mouse' || event.buttons || !entry.menu) return
        clearTimeout(delay)
        clearTimeout(timer)
        hovered = entry
        timer = setTimeout(() => { void show(entry) }, 350)
      }
      entry.name.addEventListener('pointerenter', enter)
      entry.row.addEventListener('pointerleave', deferClose)
      return () => {
        entry.name.removeEventListener('pointerenter', enter)
        entry.row.removeEventListener('pointerleave', deferClose)
        if (hovered === entry || showing === entry) close()
      }
    },
    dispose() {
      alive = false
      close()
      stopProfile()
      stopConnection()
      content.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onEscape, true)
      card.remove()
    },
  }
}

export function attachProjects(content, t, storage) {
  const rows = new Map()
  const preview = projectPreview(content, t)
  const chatOrder = attachSidebarChatOrder(content, storage)
  let section
  let reveal

  function clearSection() {
    if (!section) return
    section.motion.dispose()
    section.group.removeAttribute('data-hcv-projects-section')
    section.header.removeAttribute('data-hcv-projects-header')
    section.native.removeAttribute('data-hcv-native-project-action')
    section.actions?.removeAttribute('data-hcv-projects-actions')
    section.button.remove()
    section.status.remove()
    section = undefined
  }
  function clearRow(key, entry) {
    entry.detach()
    entry.motion?.dispose()
    entry.row.removeAttribute('data-hcv-project-row')
    entry.link.removeAttribute('data-hcv-native-project-action')
    entry.toggle?.removeAttribute('data-hcv-native-project-action')
    entry.name.remove()
    entry.status.remove()
    rows.delete(key)
  }
  function syncSection(tree) {
    const filter = tree?.querySelector(':scope > [data-slot="sidebar-group"] > div button:has(> .codicon-list-filter)')
    const group = filter?.closest('[data-slot="sidebar-group"]')
    const header = group?.firstElementChild
    const native = header?.querySelector(':scope > button:not([data-hcv-section-toggle])')
    if (section?.native !== native) clearSection()
    if (!native) return
    if (!section) {
      const button = el('button', { type: 'button', 'data-hcv-section-toggle': '' })
      const label = document.createTextNode('')
      const status = projectStatus()
      button.append(label, glyph('sidebarDisclosure'))
      native.before(button)
      native.setAttribute('data-hcv-native-project-action', '')
      group.setAttribute('data-hcv-projects-section', '')
      header.setAttribute('data-hcv-projects-header', '')
      const actions = native.nextElementSibling
      actions?.setAttribute('data-hcv-projects-actions', '')
      header.append(status)
      const region = () => group.querySelector(':scope > [data-slot="sidebar-group-content"]')
      section = { native, button, group, header, actions, label, status, motion: disclosure(button, native, region, 'hcv-projects-list') }
    }
    const text = t('projects')
    if (section.label.data !== text) section.label.data = text
    section.motion.sync()
  }
  return {
    sync() {
      const view = content.querySelector('[data-sessions-mode]')
      const mode = view?.dataset.sessionsMode
      if (reveal && (reveal.connection !== host.state.connectionId.get() || reveal.profile !== host.state.profile.get())) reveal = undefined
      if (mode === 'project') {
        chatOrder.sync([])
        // Hermes can enter a project after launch from the palette, project
        // creation, or a restored scope. Use its own back action each time.
        const back = view.querySelector('button[class~="group/back"]')
        const id = view.dataset.sessionsProject
        if (back && (reveal?.back !== back || reveal.id !== id)) {
          reveal = { back, id, connection: host.state.connectionId.get(), profile: host.state.profile.get() }
          back.click()
        }
        return
      }
      if (mode && mode !== 'projects') reveal = undefined
      const tree = content.querySelector(scope)
      syncSection(tree)
      const activity = nativeProjectActivity(tree)
      if (section) {
        const collapsedStatus = [...activity.values()].includes('working') ? 'working' : activity.size ? 'unread' : ''
        showStatus(section.status, section.button.ariaExpanded === 'false' ? collapsedStatus : '', t)
      }
      const seen = new Set()
      const projectLists = []
      for (const item of tree?.querySelectorAll(folderRows) || []) {
        const row = item.querySelector(':scope > [class~="group/workspace"]')
        const link = row?.querySelector(':scope > div > button[data-slot="row-button"]')
        const text = link?.textContent.trim()
        if (!text) continue
        const toggle = row.querySelector(':scope > div > button[data-row-actions]:has(> .codicon-chevron-right)')
        seen.add(item)
        let entry = rows.get(item)
        if (entry && (entry.link !== link || entry.toggle !== toggle)) {
          clearRow(item, entry)
          entry = undefined
        }
        if (!entry) {
          const name = el(toggle ? 'button' : 'span', {
            ...(toggle ? { type: 'button', 'data-row-actions': '' } : {}),
            'data-hcv-project-name': '',
          }, text)
          const status = projectStatus()
          link.before(name)
          row.append(status)
          row.setAttribute('data-hcv-project-row', '')
          link.setAttribute('data-hcv-native-project-action', '')
          toggle?.setAttribute('data-hcv-native-project-action', '')
          const id = item.dataset.sessionsProject
          const region = () => item.querySelector(':scope > div.grid:not([data-hcv-project-row])')
          const motion = toggle ? disclosure(name, toggle, region, `hcv-project-${encodeURIComponent(id)}`) : null
          entry = { row, name, link, toggle, id, region, motion, status, menu: row.querySelector('[data-row-actions] button[aria-haspopup="menu"]') }
          entry.detach = preview.attach(entry)
          rows.set(item, entry)
        } else if (entry.name.textContent !== text) entry.name.textContent = text
        entry.motion?.sync()
        projectLists.push({ project: entry.id, list: entry.region() })
        showStatus(entry.status, entry.name.ariaExpanded === 'true' ? '' : activity.get(entry.id) || '', t)
      }
      for (const [key, entry] of rows) if (!seen.has(key)) clearRow(key, entry)
      chatOrder.sync(projectLists)
      if (section && reveal) {
        if (section.button.ariaExpanded === 'false') {
          if (reveal.header !== section.button) {
            reveal.header = section.button
            section.button.click()
          }
        } else {
          const entry = [...rows.values()].find(row => row.id === reveal.id)
          if (entry) {
            reveal = undefined
            if (entry.name.ariaExpanded === 'false') entry.name.click()
            entry.row.scrollIntoView({ block: 'nearest' })
          }
        }
      }
    },
    dispose() {
      chatOrder.dispose()
      for (const [key, entry] of rows) clearRow(key, entry)
      clearSection()
      preview.dispose()
    },
  }
}

export function projectSidebarStyles(active) {
  const section = `${active} ${projectSection}`
  const header = `${active} ${sectionHeader}`
  const toggle = `${sectionHeader} > [data-hcv-section-toggle]`
  const caret = '[data-hcv-icon="sidebarDisclosure"]'
  const row = `${active} ${projectRow}`
  const preview = `${active} ${previewCard}`
  const actions = `${header} ${sectionActions}`
  const status = '[data-hcv-project-status]'
  const unread = '[data-hcv-project-status="unread"]:not([hidden])'
  const unreadHeader = `${header}:has(> ${unread})`
  const readAction = 'button:has(> .codicon-check-all)'
  return `
  ${sidebarChatOrderStyles(active)}
  ${active} [data-hcv-native-project-action] { display: none !important; }
  ${active} [data-tour="sessions-sidebar"] [data-sessions-mode="project"]:has(button[class~="group/back"]) { visibility: hidden; }
  ${active} [data-hcv-disclosure-motion] {
    flex: 0 0 auto;
    min-block-size: 0;
    box-sizing: border-box;
    overflow: clip;
    transform-origin: center bottom;
  }
  ${row} > div:has(> [data-hcv-project-name]) { gap: 8px; padding-block: 0; }
  ${row} [data-hcv-project-name] {
    min-inline-size: 0;
    flex: 1 1 auto;
    align-self: stretch;
    align-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: start;
    border-radius: 8px;
    color: var(--hcv-text);
    font: 400 13px/20px var(--hcv-ui-font);
  }
  ${row} button[data-hcv-project-name] { cursor: pointer; }
  ${row} { position: relative; }
  ${row}[data-hcv-preview-open] { background: var(--hcv-hover); }
  ${row}:has(> ${status}:not([hidden])) { padding-inline-end: 23px; }
  ${row} > ${status} {
    position: absolute; inset-inline-end: 5px; inset-block-start: 50%; translate: 0 -50%;
  }
  ${row}:has(> [data-row-actions]):is(:hover, :has(:focus-visible), [data-hcv-preview-open]) > ${status} { opacity: 0; }
  ${header} { min-block-size: 32px; padding: 0 4px 0 8px; column-gap: 0; }
  ${active} ${toggle} {
    display: flex; align-items: center; gap: 4px; min-block-size: 28px;
    flex: 1 1 0; min-inline-size: 0; align-self: stretch;
    border-radius: 7px; background-color: transparent; color: var(--hcv-sidebar-heading);
    font: 500 13px/18px var(--hcv-ui-font); cursor: pointer;
  }
  ${active} ${toggle} ${caret} { inline-size: 12px; block-size: 12px; flex: none; opacity: 0; }
  ${active} ${toggle}[aria-expanded="false"] ${caret} { rotate: -90deg; opacity: 1; }
  ${section}:hover ${toggle} ${caret}, ${active} ${toggle}:focus-visible ${caret} { opacity: 1; }
  ${actions} button { opacity: 0; inline-size: 26px; block-size: 26px; border-radius: 7px; }
  ${header}:is(:hover, :focus-within) ${sectionActions} button,
  ${actions}:has(button:is([aria-expanded="true"], [data-state="open"])) button { opacity: 1; }
  ${actions} > :has(.codicon-list-filter) { order: -1; }
  ${actions} > ${readAction} { display: none; }
  ${unreadHeader} ${sectionActions} > ${readAction} {
    display: grid; order: 1; position: relative; opacity: 1; inline-size: 20px; block-size: 20px;
  }
  ${unreadHeader}:has(${sectionActions} > button > .codicon-check-all) > ${unread} { display: none; }
  ${actions} > ${readAction} .codicon-check-all { opacity: 0; }
  ${actions} > ${readAction}::after {
    content: ''; position: absolute; inset: 0; margin: auto;
    inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--hcv-unread);
  }
  ${codexIconRules(`${actions} .codicon-list-filter`, 'more')}
  ${codexIconRules(`${actions} .codicon-add`, 'plus')}
  ${preview} {
    position: fixed; z-index: 48; inline-size: min(${codex.sidebar.previewWidth}px, calc(100vw - 16px));
    display: flex; flex-direction: column; gap: 6px;
    max-block-size: calc(100vh - 16px); overflow: auto; padding: 8px; border-radius: ${codex.sidebar.previewRadius}px;
    background: var(--hcv-menu); box-shadow: 0 0 0 .5px var(--hcv-hairline), 0 8px 16px -4px #00000030;
    color: var(--hcv-text); font: 400 13px/20px var(--hcv-ui-font);
    opacity: 1; scale: 1; transform-origin: left top;
  }
  ${preview}[hidden] { display: none; opacity: 0; scale: .97; pointer-events: none; }
  ${preview} [hidden] { display: none; }
  ${preview} [data-hcv-project-preview-summary] { display: flex; flex-direction: column; gap: 4px; }
  ${preview} :is(header, [data-hcv-project-preview-row]):not([hidden]) {
    display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 6px;
  }
  ${preview} header { font: 500 14px/24px var(--hcv-ui-font); }
  ${preview} header > :last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${preview} :is([data-hcv-project-preview-path], [data-hcv-project-preview-edit]) {
    border-block-start: 1px solid var(--hcv-hairline); padding-block-start: 6px;
  }
  ${preview} [data-hcv-project-preview-path] > :last-child { word-break: break-all; }
  ${preview} [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; color: var(--hcv-muted); }
  ${preview} button { inline-size: 100%; text-align: start; border-radius: 6px; cursor: pointer; }
  ${active} :is(${sectionHeader}, ${previewCard}) button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (hover: hover) and (pointer: fine) {
    ${preview} button:hover { background: var(--hcv-hover); }
  }
  @media (any-hover: none) {
    ${actions} button { opacity: 1; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${preview} { transition: opacity 150ms var(--hcv-enter), scale 150ms var(--hcv-enter), display 150ms allow-discrete; }
    ${preview}[hidden] { transition: opacity 100ms var(--hcv-exit), scale 100ms var(--hcv-exit), display 100ms allow-discrete; }
    @starting-style { ${preview}:not([hidden]) { opacity: 0; scale: .95; } }
    ${active} ${toggle} ${caret} { transition: opacity 150ms var(--hcv-enter), rotate 150ms var(--hcv-enter); }
  }
`
}
