import { createElement as h } from 'react'
import { host, SESSION_ROW_AREAS } from '@hermes/plugin-sdk'
import { codexMask, codexReference as codex } from './codex-reference.js'
import { positionSidebarPreview } from './sidebar-projects.js'

const marker = '[data-hcv-preview-session]'
const preview = '[data-hcv-chat-preview]'
const row = '.row-hover:has(.hover-marquee-inner), [data-hcv-recents-fallback] > button'
const project = '[data-sessions-project]:not([data-sessions-mode])'

export function registerChatPreviewMarker(ctx) {
  ctx.register({
    id: 'chat-preview-session',
    area: SESSION_ROW_AREAS.trailing,
    data: { render: ({ sessionId }) => h('span', { 'data-hcv-preview-session': sessionId, hidden: true }) },
  })
}

function element(tag, attribute) {
  const node = document.createElement(tag)
  node.setAttribute(attribute, '')
  return node
}

function ageLabel(dateTime) {
  const seconds = (Date.now() - Date.parse(dateTime)) / 1000
  if (!Number.isFinite(seconds)) return ''
  const ru = document.documentElement.matches(':lang(ru)')
  if (seconds < 60) return ru ? 'сейчас' : 'now'
  const units = ru ? ['г', 'мес', 'н', 'д', 'ч', 'м'] : ['y', 'mo', 'w', 'd', 'h', 'm']
  const intervals = [31536000, 2592000, 604800, 86400, 3600, 60]
  const index = intervals.findIndex(interval => seconds >= interval)
  return `${Math.floor(seconds / intervals[index])}${units[index]}`
}

function scopeOf(node) {
  const group = node.closest('[data-gateway-group]')
  if (group) {
    try {
      const [connection, profile] = JSON.parse(group.dataset.gatewayGroup)
      return { connectionId: connection ?? 'local', profile }
    } catch { return {} }
  }
  return { connectionId: host.state.connectionId.get(), profile: host.state.profile.get() }
}

export function attachChatPreview(content) {
  const card = element('div', 'data-hcv-chat-preview')
  card.id = 'hcv-sidebar-chat-preview'
  card.setAttribute('role', 'tooltip')
  card.hidden = true
  const header = element('div', 'data-hcv-chat-preview-header')
  const subject = element('div', 'data-hcv-chat-preview-subject')
  const title = element('span', 'data-hcv-chat-preview-title')
  const computer = element('span', 'data-hcv-chat-preview-computer')
  const age = element('time', 'data-hcv-chat-preview-age')
  const folder = element('div', 'data-hcv-chat-preview-project')
  const folderLabel = document.createElement('span')
  folder.append(folderLabel)
  subject.append(title, computer)
  header.append(subject, age)
  card.append(header, folder)
  document.body.append(card)
  const mouse = matchMedia('(any-hover: hover) and (any-pointer: fine)')
  let pending
  let timer
  let open
  let button
  let description

  function close() {
    clearTimeout(timer)
    pending = null
    open?.removeAttribute('data-hcv-chat-preview-open')
    open = null
    if (button?.getAttribute('aria-describedby') === [description, card.id].filter(Boolean).join(' ')) {
      if (description) button.setAttribute('aria-describedby', description)
      else button.removeAttribute('aria-describedby')
    }
    button = null
    card.hidden = true
  }

  function setAge(dateTime) {
    age.textContent = ageLabel(dateTime)
    age.hidden = !age.textContent
    if (age.hidden) age.removeAttribute('datetime')
    else age.dateTime = dateTime
  }

  function position() {
    if (!open) return
    const rect = open.getBoundingClientRect()
    if (!rect.width || rect.bottom <= 0 || rect.top >= innerHeight || open.closest('[inert], [hidden]')) {
      close()
      return
    }
    positionSidebarPreview(card, rect)
  }

  async function show(target) {
    if (pending !== target || !target.isConnected || target.closest('[inert], [hidden]')) return
    if (target.querySelector('[data-row-actions] [aria-expanded="true"]')) return
    const titleNode = target.querySelector('.hover-marquee-inner') ?? target
    title.textContent = titleNode.textContent.trim()
    if (!title.textContent) return
    const { connectionId, profile } = scopeOf(target)
    const ru = document.documentElement.matches(':lang(ru)')
    computer.hidden = connectionId !== 'local'
    computer.setAttribute('role', 'img')
    computer.setAttribute('aria-label', ru ? 'Этот компьютер' : 'This device')
    folderLabel.textContent = target.closest(project)?.querySelector('[data-hcv-project-name]')?.textContent.trim() || ''
    folder.hidden = !folderLabel.textContent
    setAge(target.querySelector('time[datetime]')?.dateTime ?? target.dataset.hcvPreviewTime ?? '')
    open = target
    open.setAttribute('data-hcv-chat-preview-open', '')
    button = target.querySelector('button:has(.hover-marquee-inner)') ?? (target.matches('button') ? target : null)
    description = button?.getAttribute('aria-describedby')
    button?.setAttribute('aria-describedby', [description, card.id].filter(Boolean).join(' '))
    card.hidden = false
    position()
    const sessionId = target.querySelector(marker)?.dataset.hcvPreviewSession ?? target.dataset.hcvPreviewSession
    if (!age.hidden || !sessionId || !connectionId || !profile) return
    try {
      const query = new URLSearchParams({ profile })
      const result = await window.hermesDesktop.api({
        connectionId, profile, path: `/api/sessions/${encodeURIComponent(sessionId)}?${query}`, timeoutMs: 4000,
      })
      if (open !== target || scopeOf(target).connectionId !== connectionId || scopeOf(target).profile !== profile) return
      const seconds = Number(result?.last_active || result?.started_at)
      if (Number.isFinite(seconds) && seconds > 0) {
        const timestamp = new Date(seconds * 1000)
        if (Number.isFinite(timestamp.getTime())) setAge(timestamp.toISOString())
      }
      position()
    } catch { /* The title still describes the chat when its metadata is unavailable. */ }
  }

  function enter(event) {
    const target = event.target.closest?.(row)
    if (!target || !content.contains(target)) return
    if (event.target.closest('[data-row-actions], [data-reorder-handle]')) {
      close()
      return
    }
    const keyboard = event.type === 'focusin'
    if (keyboard ? !event.target.matches(':focus-visible') : (!mouse.matches || event.pointerType !== 'mouse' || event.buttons)) return
    if (target === pending) return
    close()
    pending = target
    timer = setTimeout(() => { void show(target) }, keyboard ? 0 : 350)
  }

  function leave(event) {
    if (pending?.contains(event.target) && !pending.contains(event.relatedTarget)) close()
  }
  const onEscape = event => { if (event.key === 'Escape') close() }
  content.addEventListener('pointerover', enter)
  content.addEventListener('pointerout', leave)
  content.addEventListener('focusin', enter)
  content.addEventListener('focusout', leave)
  content.addEventListener('scroll', close, true)
  document.addEventListener('pointerdown', close, true)
  document.addEventListener('keydown', onEscape, true)
  window.addEventListener('resize', close)
  const stopProfile = host.state.profile.listen(close)
  const stopConnection = host.state.connectionId.listen(close)
  return {
    sync() { if (pending && !pending.isConnected) close() },
    dispose() {
      close()
      stopProfile()
      stopConnection()
      content.removeEventListener('pointerover', enter)
      content.removeEventListener('pointerout', leave)
      content.removeEventListener('focusin', enter)
      content.removeEventListener('focusout', leave)
      content.removeEventListener('scroll', close, true)
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', onEscape, true)
      window.removeEventListener('resize', close)
      card.remove()
    },
  }
}

export function chatPreviewStyles(active) {
  const card = `${active} ${preview}`
  return `
  ${card} {
    position: fixed; z-index: 48; inline-size: min(320px, calc(100vw - 16px));
    box-sizing: border-box; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px;
    border-radius: 12px; background: var(--hcv-menu); color: var(--hcv-text);
    box-shadow: 0 0 0 .5px var(--hcv-hairline), 0 8px 16px -4px #00000030;
    font: 430 13px/20px var(--hcv-ui-font); pointer-events: none;
  }
  ${card}[hidden], ${card} [hidden] { display: none; }
  ${active}:has([data-hcv-chat-preview-open] .hover-marquee[data-state$="open"])
    [data-slot="tooltip-content"]:is([data-side="left"], [data-side="right"]) { visibility: hidden; }
  ${card} [data-hcv-chat-preview-header] {
    display: flex; align-items: baseline; gap: 12px; padding-block-end: 2px; min-inline-size: 0;
  }
  ${card} [data-hcv-chat-preview-subject] {
    display: flex; flex: 1; min-inline-size: 0; align-items: start; gap: 4px;
  }
  ${card} [data-hcv-chat-preview-title] {
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
    min-inline-size: 0; overflow: hidden; overflow-wrap: anywhere; font: 500 14px/20px var(--hcv-ui-font);
  }
  ${card} [data-hcv-chat-preview-computer] {
    flex: none; margin-block-start: 3px; inline-size: 14px; block-size: 14px;
    background: var(--hcv-sidebar-heading); mask: ${codexMask('chatPreviewComputer')} center / contain no-repeat;
  }
  ${card} [data-hcv-chat-preview-age] {
    flex: none; color: var(--hcv-sidebar-heading); font-size: 12px; white-space: nowrap;
  }
  ${card} [data-hcv-chat-preview-project] {
    display: flex; min-inline-size: 0; align-items: center; gap: 6px;
    overflow: hidden; white-space: nowrap;
  }
  ${card} [data-hcv-chat-preview-project] > span { overflow: hidden; text-overflow: ellipsis; }
  ${card} [data-hcv-chat-preview-project]::before {
    content: ''; flex: none; inline-size: 16px; block-size: 16px;
    background: var(--hcv-muted); mask: ${codexMask('folder')} center / contain no-repeat;
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${card} { border-radius: 15px; corner-shape: superellipse(1.5); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${card}:not([hidden]) { animation: hcv-chat-preview-in 150ms ${codex.enter}; }
    @keyframes hcv-chat-preview-in { from { opacity: 0; } }
  }
  `
}
