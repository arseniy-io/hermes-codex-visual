import {
  atom, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, host, useI18n, useValue,
} from '@hermes/plugin-sdk'
import { createElement as h } from 'react'
import { codexIconStyle, codexReference as codex } from './codex-reference.js'

const workspacePrefix = 'hermes-codex-visual-summary-'
const panePrefix = 'plugin-workspace:' + workspacePrefix
const names = {
  ru: { agents: 'Субагенты', sources: 'Источники', changes: 'Изменения', files: 'Файлы проекта', add: 'Добавить вкладку' },
  en: { agents: 'Subagents', sources: 'Sources', changes: 'Changes', files: 'Project files', add: 'Add tab' },
}
const glyphs = { agents: 'bots', sources: 'summarySources', changes: 'changes', files: 'folder' }
const copy = (locale) => names[locale?.split('-')[0]] || names.en
const paneId = kind => panePrefix + kind
const paneTab = kind => '[data-tree-tab="' + paneId(kind) + '"]'

function icon(kind) {
  const glyph = glyphs[kind]
  return h('span', { 'aria-hidden': true, 'data-hcv-icon': glyph, style: codexIconStyle(glyph) })
}

function Picker({ state, open }) {
  const menu = useValue(state)
  const { locale } = useI18n()
  if (!menu) return null
  const select = kind => () => open(kind)
  return h(DropdownMenu, { open: true, onOpenChange: value => { if (!value) state.set(null) } },
    h(DropdownMenuTrigger, { asChild: true }, h('span', {
      'aria-hidden': true, tabIndex: -1,
      style: { position: 'fixed', pointerEvents: 'none', ...menu.rect },
    })),
    h(DropdownMenuContent, {
      align: 'start', sideOffset: 4, 'data-hcv-summary-picker': '',
      onCloseAutoFocus: event => {
        event.preventDefault()
        if (menu.trigger.isConnected) menu.trigger.focus({ preventScroll: true })
      },
    },
    ...['agents', 'sources'].map(kind => h(DropdownMenuItem, { key: kind, onSelect: select(kind) },
      icon(kind), copy(locale)[kind])),
    h(DropdownMenuSeparator),
    ...['changes', 'files'].map(kind => h(DropdownMenuItem, { key: kind, onSelect: select(kind) },
      icon(kind), copy(locale)[kind]))))
}

// Use Hermes's pane tree for tab activation, closing, resizing, and maximizing.
export function registerSummaryPanes(ctx, active, views) {
  const menu = atom(null)
  const registrations = new Map()
  const open = kind => {
    if (kind === 'files') {
      host.revealPane('files')
      return
    }
    const render = views[kind]
    if (!render || !document.documentElement.matches(active) || typeof host.openWorkspace !== 'function') return
    const id = paneId(kind)
    if (registrations.has(kind)) { host.revealPane(id); return }
    const sibling = [...registrations.keys()].find(key => document.querySelector(paneTab(key) + '[aria-selected="true"]'))
      || [...registrations.keys()].find(key => document.querySelector(paneTab(key)))
    const dock = sibling ? { pane: paneId(sibling), pos: 'center' } : { pane: 'workspace', pos: 'right' }
    // Hermes's dedicated workspace API gives the tab its own close handler.
    // Closing a lone plugin contribution otherwise disables the entire plugin.
    const dispose = host.openWorkspace(workspacePrefix + kind, {
      dock, minWidth: '280px', title: copy(document.documentElement.lang)[kind],
      render: () => h('div', { 'data-hcv-summary-pane': kind }, render()),
      onClose: () => registrations.delete(kind),
    })
    registrations.set(kind, dispose)
    queue()
  }

  const plus = document.createElement('button')
  plus.type = 'button'
  plus.dataset.hcvSummaryAddTab = ''
  plus.setAttribute('aria-haspopup', 'menu')
  plus.addEventListener('pointerdown', event => event.stopPropagation())
  plus.addEventListener('click', () => {
    const { x, y, width, height } = plus.getBoundingClientRect()
    menu.set({ trigger: plus, rect: { left: x, top: y, width, height } })
  })
  let frame = 0
  function queue() {
    if (!frame) frame = requestAnimationFrame(syncStrip)
  }
  function syncStrip() {
    frame = 0
    const selected = document.querySelector('[data-tree-tab^="' + panePrefix + '"][aria-selected="true"]')
    const list = selected?.closest('[data-zone-tabstrip]')?.querySelector('[role="tablist"]')
    if (!list || !document.documentElement.matches(active)) { plus.remove(); return }
    plus.setAttribute('aria-label', copy(document.documentElement.lang).add)
    if (plus.parentNode !== list || plus !== list.lastElementChild) list.append(plus)
  }

  const close = () => {
    menu.set(null)
    for (const dispose of registrations.values()) dispose()
    registrations.clear()
    plus.remove()
  }
  const observer = new MutationObserver(() => {
    if (!document.documentElement.matches(active)) close()
    else queue()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  const stripObserver = new MutationObserver(queue)
  stripObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] })

  const tab = active + ' [data-zone-tabstrip] [role="tab"][data-tree-tab^="' + panePrefix + '"][aria-selected]:has(> .pane-tab-content):not([data-vertical])'
  const style = document.createElement('style')
  style.dataset.hcvSummaryPanes = ''
  style.textContent = [
    '@media (forced-colors: none) {',
    active + ' [data-hcv-summary-pane] { height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--hcv-chat); color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }',
    // App shell tab in Codex 961657.80cc563d2f.js, desktop tokens in 9ec44337a842.css.
    tab + ' { align-self: center; flex: 0 1 204px; min-inline-size: 72px; block-size: 32px; border-radius: 8px; border-inline-start-color: transparent; background-color: transparent; color: light-dark(rgb(26 28 31 / 50%), rgb(255 255 255 / 50%)); }',
    tab + ' .pane-tab-content .truncate { color: inherit; font: 430 13px/18.5714px var(--hcv-ui-font); letter-spacing: normal; text-transform: none; }',
    tab + ' .pane-tab-content > span:first-child { margin-inline: 0; }',
    tab + ':not([aria-selected="true"], [data-selected]):hover { background-color: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 8%)); color: var(--hcv-text); box-shadow: none; }',
    tab + '[data-selected] { background-color: var(--hcv-selected); color: var(--hcv-text); }',
    tab + '[aria-selected="true"] { background-color: light-dark(var(--hcv-chat), var(--hcv-selected)); color: var(--hcv-text); box-shadow: inset 0 0 0 .5px var(--hcv-hairline); }',
    ...Object.keys(views).map(kind => tab + paneTab(kind) + ' .pane-tab-content::before { content: ""; display: inline-block; inline-size: 16px; block-size: 16px; flex: none; margin-inline-start: 6px; background: currentColor; mask: ' + codexIconStyle(glyphs[kind]).mask + '; }'),
    active + ' [data-hcv-summary-picker] [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }',
    active + ' [data-hcv-summary-add-tab] { -webkit-app-region: no-drag; align-self: center; display: grid; place-items: center; flex: none; inline-size: ' + codex.quietControl.height + '; block-size: ' + codex.quietControl.height + '; margin-inline-start: 4px; border-radius: ' + codex.quietControl.radius + '; color: var(--hcv-muted); }',
    active + ' [data-hcv-summary-add-tab]::before { content: ""; display: block; inline-size: 16px; block-size: 16px; background: currentColor; mask: ' + codexIconStyle('plus').mask + '; }',
    active + ' [data-hcv-summary-add-tab]:hover { background: var(--hcv-hover); color: var(--hcv-text); }',
    tab + ':focus-visible, ' + active + ' [data-hcv-summary-add-tab]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }',
    active + ' [data-hcv-summary-picker] { min-inline-size: 170px; }',
    '}',
  ].join('\n')
  document.head.append(style)
  ctx.onDispose(() => {
    observer.disconnect()
    stripObserver.disconnect()
    if (frame) cancelAnimationFrame(frame)
    close()
    style.remove()
  })

  return {
    open,
    visibility: {
      agents: host.paneVisibility(paneId('agents')),
      sources: host.paneVisibility(paneId('sources')),
      changes: host.paneVisibility(paneId('changes')),
    },
    renderPicker: () => h(Picker, { state: menu, open }),
  }
}

