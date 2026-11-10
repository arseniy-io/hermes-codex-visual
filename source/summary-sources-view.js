import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, useI18n } from '@hermes/plugin-sdk'
import { createElement as h, useId, useRef, useState } from 'react'
import { codexIconStyle } from './codex-reference.js'

const labels = {
  ru: {
    title: 'Источники', showAll: 'Показать все', add: 'Добавить источник',
    addHint: 'Прикрепить файлы или подключить приложения', attach: 'Прикрепить файлы или папки', plugins: 'Использовать плагины',
    connectors: 'Коннекторы', connector: 'Коннектор Hermes', image: 'Изображение', file: 'Файл', folder: 'Папка', link: 'Ссылка',
    attached: 'Прикреплено к разговору', provided: 'Предоставлено в разговоре', fromChat: 'Из разговора',
    empty: 'Нет активных источников', loading: 'Загрузка…', unavailable: 'Источники недоступны',
  },
  en: {
    title: 'Sources', showAll: 'View all', add: 'Add source',
    addHint: 'Attach files or connect apps', attach: 'Attach files or folders', plugins: 'Use plugins',
    connectors: 'Connectors', connector: 'Hermes connector', image: 'Image', file: 'File', folder: 'Folder', link: 'Link',
    attached: 'Attached to the conversation', provided: 'Provided in the conversation', fromChat: 'From the conversation',
    empty: 'No active sources', loading: 'Loading…', unavailable: 'Sources unavailable',
  },
}

const composerAdd = '[data-slot="composer-root"] button[aria-haspopup="menu"]:has(> .codicon-add)'

function icon(name) {
  return h('span', { 'aria-hidden': true, className: 'hcv-source-glyph', style: codexIconStyle(name) })
}

// The 20px source disclosure glyph in Codex's 790272.8f3bb9e423.js (lBcl).
function viewAllIcon() {
  return h('svg', { 'aria-hidden': true, className: 'hcv-sources-all-icon', viewBox: '0 0 20 20', fill: 'currentColor' },
    h('path', { d: 'M16.6345 5.83331C16.6345 4.81987 15.813 3.99835 14.7996 3.99835C13.7863 3.99855 12.9646 4.81999 12.9646 5.83331C12.9646 6.84663 13.7863 7.66808 14.7996 7.66827C15.813 7.66827 16.6345 6.84676 16.6345 5.83331ZM3.36499 14.1663C3.36499 15.1798 4.18651 16.0013 5.19995 16.0013C6.21339 16.0013 7.03491 15.1798 7.03491 14.1663C7.03471 13.153 6.21327 12.3314 5.19995 12.3314C4.18663 12.3314 3.36519 13.153 3.36499 14.1663ZM17.9646 5.83331C17.9646 7.58129 16.5475 8.99835 14.7996 8.99835C13.2785 8.99818 12.0078 7.92497 11.7039 6.49445L11.6667 6.49835H11.3347C10.5362 6.49835 9.96426 6.49872 9.54565 6.52081C9.21098 6.53848 9.04089 6.56873 8.96069 6.59113L8.90796 6.60968C8.41777 6.86301 8.2248 7.46527 8.47632 7.95636L8.50757 8.00323C8.55968 8.068 8.68066 8.19148 8.94312 8.4007C9.27097 8.66203 9.73648 8.99501 10.3865 9.45929L11.239 10.0716C11.489 10.2539 11.7044 10.4155 11.8855 10.5599C12.2255 10.8309 12.5425 11.1144 12.7078 11.4368L12.8054 11.6536C13.206 12.6785 12.8306 13.8502 11.9089 14.4515L11.7029 14.5716C11.381 14.7379 10.9584 14.785 10.5242 14.8079C10.0619 14.8323 9.44766 14.8314 8.66479 14.8314H8.33276C8.31992 14.8314 8.30734 14.8282 8.29468 14.8275C7.9907 16.2581 6.72124 17.3314 5.19995 17.3314C3.45197 17.3314 2.03491 15.9143 2.03491 14.1663C2.03511 12.4185 3.45209 11.0013 5.19995 11.0013C6.72066 11.0013 7.99008 12.0743 8.29468 13.5042C8.30731 13.5035 8.31995 13.5013 8.33276 13.5013H8.66479C9.46362 13.5013 10.0362 13.5019 10.4548 13.4798C10.9013 13.4562 11.0544 13.4096 11.0925 13.39L11.1804 13.3382C11.5766 13.0799 11.7385 12.5765 11.5662 12.136L11.5242 12.0433C11.5046 12.0051 11.4062 11.8788 11.0564 11.5999C10.8925 11.4693 10.6943 11.3206 10.4558 11.1468L9.61304 10.5413C8.97593 10.0862 8.47599 9.72927 8.11401 9.44073C7.81659 9.20364 7.53702 8.95681 7.36108 8.68292L7.29272 8.56378C6.70695 7.42066 7.15568 6.0189 8.29663 5.42902L8.42163 5.3714C8.7241 5.25059 9.09524 5.21275 9.47534 5.19269C9.93756 5.16829 10.5518 5.16827 11.3347 5.16827H11.6667L11.7039 5.1712C12.0082 3.74114 13.2788 2.66845 14.7996 2.66827C16.5475 2.66827 17.9646 4.08533 17.9646 5.83331Z' }))
}

function connectorRows(connectors) {
  return (connectors ?? []).map(({ name }) => ({ kind: 'source', key: name, name }))
}

function sourceLabel(row, copy) {
  return row.name || ({ image: copy.image, folder: copy.folder, link: copy.link }[row.kind] ?? copy.file)
}

function sourceDescription(row, copy) {
  if (row.kind === 'source') return copy.connector
  if (!row.attached) return copy.fromChat
  return row.kind === 'link' ? copy.provided : copy.attached
}

function SourceRow({ row, expanded = false, copy, onOpenSource, onConnectors }) {
  const name = sourceLabel(row, copy)
  const open = row.kind === 'source' ? onConnectors && (() => onConnectors(row.name))
    : row.action && onOpenSource && (() => onOpenSource(row))
  const props = { className: 'hcv-source-row', title: name }
  const content = h('span', { className: 'hcv-source-leading', 'aria-hidden': true }, row.thumbnail
    ? h('img', { className: 'hcv-source-thumbnail', src: row.thumbnail, alt: '', draggable: false })
    : icon(row.kind))
  const text = h('span', { className: 'hcv-source-text' },
    h('span', { className: 'hcv-source-title', dir: 'auto' }, name),
    expanded && row.meta && h('span', { className: 'hcv-source-meta', dir: 'auto' }, row.meta))
  return h('li', { 'data-hcv-source-row': row.kind },
    h(open ? 'button' : 'div', open ? { ...props, type: 'button', 'aria-label': name, onClick: open } : props, content, text),
    expanded && h('p', { className: 'hcv-source-description' }, sourceDescription(row, copy)))
}

function sourceList(rows, props) {
  return rows.map(row => h(SourceRow, { ...props, key: `${row.kind}:${row.key}`, row }))
}

function openComposerMenu(getChat) {
  const chat = getChat?.()
  requestAnimationFrame(() => {
    if (!chat?.isConnected || getChat() !== chat) return
    const add = chat.querySelector(composerAdd)
    if (!add || add.disabled || add.getAttribute('aria-expanded') === 'true') return
    // Radix's trigger is driven by pointerdown or the same Enter action used
    // here. Keep all of Hermes's native file, folder and link routes in one place.
    add.focus({ preventScroll: true })
    add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
}

export function CompactSources({ rows = [], connectors, loading, onExpand, onConnectors, onOpenSource, getChat }) {
  const { locale } = useI18n()
  const copy = labels[locale] || labels.en
  const contentId = useId()
  const [expanded, setExpanded] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const movingFocus = useRef(false)
  const items = [...rows, ...connectorRows(connectors)]
  const showMenu = () => setMenuOpen(true)
  function menuAction(action) {
    movingFocus.current = true
    action()
  }

  return h('section', { 'data-hcv-sources-compact': '', 'data-collapsed': !expanded || undefined, 'aria-label': copy.title },
    h('header', null,
      h('button', {
        className: 'hcv-sources-heading', type: 'button', 'aria-controls': contentId, 'aria-expanded': expanded,
        onClick: () => setExpanded(value => !value),
      }, h('span', null, copy.title), !expanded && items.length > 0 && h('span', { className: 'hcv-sources-count' }, items.length),
      h('span', { className: 'hcv-sources-chevron' }, icon('down'))),
      h(DropdownMenu, { open: menuOpen, onOpenChange: setMenuOpen, modal: false },
        h(DropdownMenuTrigger, { asChild: true }, h('button', {
          type: 'button', className: 'hcv-sources-add', 'aria-label': copy.add, title: copy.addHint,
        }, icon('plus'))),
        h(DropdownMenuContent, {
          align: 'end', sideOffset: 4, 'data-hcv-sources-add-menu': '',
          onCloseAutoFocus: event => {
            if (movingFocus.current) event.preventDefault()
            movingFocus.current = false
          },
        },
        h(DropdownMenuItem, { disabled: !onConnectors, onSelect: () => menuAction(() => onConnectors()) }, icon('plugins'), copy.plugins),
        h(DropdownMenuItem, { disabled: !getChat, onSelect: () => menuAction(() => openComposerMenu(getChat)) }, icon('attach'), copy.attach)))),
    h('div', { id: contentId, className: 'hcv-sources-disclosure', inert: !expanded, 'aria-hidden': !expanded },
      h('div', { className: 'hcv-sources-compact-content' }, items.length ? [
        h('ul', { key: 'list', 'aria-label': copy.title }, ...sourceList(items.slice(0, 3), { copy, onOpenSource, onConnectors })),
        h('button', { key: 'expand', type: 'button', className: 'hcv-source-row hcv-sources-all', onClick: onExpand },
          h('span', { className: 'hcv-source-leading' }, viewAllIcon()), h('span', null, copy.showAll)),
      ] : loading ? h('p', { role: 'status', className: 'hcv-sources-state' }, copy.loading)
        : h('button', { type: 'button', className: 'hcv-source-row hcv-sources-empty', onClick: showMenu }, copy.addHint))))
}

export function SourcesPane({ rows = [], connectors, loading, onConnectors, onOpenSource }) {
  const { locale } = useI18n()
  const copy = labels[locale] || labels.en
  const items = [...rows, ...connectorRows(connectors)]
  return h('div', { 'data-hcv-sources-pane': '' }, items.length
    ? h('ul', { 'aria-label': copy.title }, ...sourceList(items, { expanded: true, copy, onOpenSource, onConnectors }))
    : h('p', { role: 'status', className: 'hcv-sources-state' }, loading ? copy.loading : connectors == null ? copy.unavailable : copy.empty),
  onConnectors && h('button', { type: 'button', className: 'hcv-sources-connectors', onClick: () => onConnectors() }, icon('source'), copy.connectors))
}

export function registerSummarySources(ctx, active) {
  const compact = `${active} [data-hcv-sources-compact]`
  const pane = `${active} [data-hcv-sources-pane]`
  const view = `${active} :is([data-hcv-sources-compact], [data-hcv-sources-pane])`
  const menu = `${active} [data-hcv-sources-add-menu]`
  const style = document.createElement('style')
  style.dataset.hcvSummarySources = ''
  style.textContent = `
    ${view} { color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); text-align: start; min-inline-size: 0; }
    ${view} ul { list-style: none; margin: 0; padding: 0; }
    ${view} :is(button, p) { margin: 0; }
    ${view} button { appearance: none; background: transparent; border: 0; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }
    ${view} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${view} .hcv-source-leading { display: grid; place-items: center; flex: 0 0 18px; inline-size: 18px; }
    ${view} .hcv-source-text { display: flex; flex: 1; flex-direction: column; min-inline-size: 0; }
    :is(${view}, ${menu}) .hcv-source-glyph { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
    ${view} .hcv-source-thumbnail {
      display: block; inline-size: 18px; block-size: 18px; border-radius: 3px;
      border: 1px solid var(--hcv-hairline); object-fit: cover;
    }
    ${view} .hcv-source-row { inline-size: 100%; min-inline-size: 0; display: flex; align-items: center; }
    ${view} .hcv-sources-state { padding-block: 4px; color: var(--hcv-muted); }

    ${compact} { border-block-start: 1px solid var(--hcv-hairline); padding-block-start: 6px; }
    ${compact} > header { display: flex; align-items: center; gap: 8px; min-block-size: 28px; color: var(--hcv-muted); }
    ${compact} .hcv-sources-heading {
      display: flex; align-items: center; gap: 4px; flex: 1; min-inline-size: 0;
      padding: 2px 4px; margin-inline-start: -4px; border-radius: 8px;
    }
    ${compact} .hcv-sources-chevron { display: grid; place-items: center; opacity: 0; }
    ${compact} .hcv-sources-chevron > span { inline-size: 12px; block-size: 12px; }
    ${compact} .hcv-sources-heading:is(:hover, :focus-visible) .hcv-sources-chevron { opacity: 1; }
    ${compact}[data-collapsed] .hcv-sources-chevron { opacity: 1; rotate: -90deg; }
    ${compact} .hcv-sources-count { color: color-mix(in srgb, var(--hcv-text) 45%, transparent); }
    ${compact} .hcv-sources-add {
      display: grid; place-items: center; inline-size: 24px; block-size: 24px; padding: 0; margin-inline-end: -6px;
      border-radius: 7px; color: color-mix(in srgb, var(--hcv-text) 40%, transparent);
    }
    ${compact} .hcv-sources-add:is(:hover, [data-state="open"]) { color: var(--hcv-text); background: color-mix(in srgb, var(--hcv-text) 8%, transparent); }
    ${compact} .hcv-sources-disclosure { display: grid; grid-template-rows: 1fr; opacity: 1; }
    ${compact}[data-collapsed] .hcv-sources-disclosure { grid-template-rows: 0fr; opacity: 0; }
    ${compact} .hcv-sources-compact-content { min-block-size: 0; overflow: clip; margin-inline: -8px; padding-inline: 8px; }
    ${compact} .hcv-sources-compact-content > ul { display: flex; flex-direction: column; gap: 2px; padding-block-start: 2px; }
    ${compact} .hcv-source-row {
      position: relative; isolation: isolate; gap: 12px; min-block-size: 28px;
      padding: 4px 0; border-radius: 6px; color: var(--hcv-muted);
    }
    ${compact} button.hcv-source-row:not(.hcv-sources-all):not(.hcv-sources-empty):hover::before {
      content: ''; position: absolute; z-index: -1; inset: 0 -8px; border-radius: 6px;
      background: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    }
    ${compact} .hcv-source-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    ${compact} :is(.hcv-sources-all, .hcv-sources-empty) { color: color-mix(in srgb, var(--hcv-text) 40%, transparent); }
    ${compact} :is(.hcv-sources-all, .hcv-sources-empty):hover { color: var(--hcv-text); }
    ${compact} .hcv-sources-all-icon { inline-size: 20px; block-size: 20px; max-inline-size: none; }
    ${menu} { min-inline-size: 200px; z-index: calc(var(--z-modal-backdrop, 120) - 1); }

    ${pane} { flex: 1; block-size: 100%; min-block-size: 0; overflow: auto; background: var(--hcv-chat); }
    ${pane} > ul { padding-inline: 16px; }
    ${pane} [data-hcv-source-row] { padding-block: 16px; border-block-end: 1px solid var(--hcv-hairline); }
    ${pane} [data-hcv-source-row]:last-child { border-block-end: 0; }
    ${pane} .hcv-source-row { gap: 8px; padding: 0; border-radius: 8px; }
    ${pane} .hcv-source-text { gap: 2px; }
    ${pane} .hcv-source-title { font: 500 13px/18.5714px var(--hcv-ui-font); overflow-wrap: anywhere; }
    ${pane} .hcv-source-meta { font: 12px/16px var(--hcv-ui-font); color: var(--hcv-muted); word-break: break-all; }
    ${pane} .hcv-source-description { margin-block-start: 12px; padding-inline-start: 24px; color: var(--hcv-muted); }
    ${pane} .hcv-sources-state { margin: 12px 16px 0; }
    ${pane} .hcv-sources-connectors {
      display: flex; align-items: center; gap: 8px; margin: 0 16px 16px; padding: 4px 8px;
      border-radius: 8px; color: var(--hcv-muted);
    }
    ${pane} .hcv-sources-connectors:hover { color: var(--hcv-text); background: var(--hcv-hover); }
    @media (prefers-reduced-motion: no-preference) {
      ${compact} .hcv-sources-disclosure { transition: grid-template-rows 160ms ease-out, opacity 140ms ease-out; }
      ${compact} .hcv-sources-chevron { transition: rotate 160ms ease-out, opacity 140ms ease-out; }
    }
  `
  document.head.append(style)
  ctx.onDispose(() => style.remove())
}
