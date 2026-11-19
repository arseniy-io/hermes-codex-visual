import { mountStyle } from './style-scope.js'
import {
  atom, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, host, useI18n, useValue,
} from '@hermes/plugin-sdk'
import { createElement as h } from 'react'
import { codexIconStyle, codexReference as codex } from './codex-reference.js'
import { movedElementMatches } from './dom-changes.js'

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
  let disposed = false
  const open = kind => {
    if (kind === 'files') {
      host.revealPane('files')
      return
    }
    const render = views[kind]
    if (disposed || !render || !document.documentElement.matches(active) || typeof host.openWorkspace !== 'function') return
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
      onClose: () => {
        registrations.delete(kind)
        queue()
      },
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
    if (!disposed && !frame) frame = requestAnimationFrame(syncStrip)
  }
  function syncStrip() {
    frame = 0
    if (disposed || !registrations.size) { plus.remove(); return }
    // openWorkspace currently accepts only a static title. Update our own
    // text-only captions in place: re-registering fronts a different tab and
    // loses the user's selection. Keep the native pane, content and handlers.
    const language = copy(document.documentElement.lang)
    for (const kind of registrations.keys()) {
      for (const tab of document.querySelectorAll(paneTab(kind))) {
        const caption = tab.querySelector('.pane-tab-content .truncate')
        if (caption?.childNodes.length === 1 && caption.firstChild.nodeType === Node.TEXT_NODE &&
            caption.firstChild.nodeValue !== language[kind]) caption.firstChild.nodeValue = language[kind]
        if (tab.getAttribute('aria-label') !== language[kind]) tab.setAttribute('aria-label', language[kind])
      }
    }
    const selected = document.querySelector('[data-tree-tab^="' + panePrefix + '"][aria-selected="true"]')
    const list = selected?.closest('[data-zone-tabstrip]')?.querySelector('[role="tablist"]')
    if (!list || !document.documentElement.matches(active)) { plus.remove(); return }
    const label = copy(document.documentElement.lang).add
    if (plus.getAttribute('aria-label') !== label) plus.setAttribute('aria-label', label)
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
  const stripObserver = new MutationObserver(records => {
    if (!registrations.size) return
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (!(target instanceof Element)) return false
      if (record.type === 'attributes') return target.matches('[role="tab"][data-tree-tab]')
      if (target.closest('[data-zone-tabstrip]')) return true
      // Transcript and pane contents cannot mount the host's tab strip.
      if (target.closest('[data-slot="aui_thread-content"], [data-hcv-summary-pane]')) return false
      return movedElementMatches(record, '[data-zone-tabstrip]')
    })) queue()
  })
  stripObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-label'] })

  const summaryTab = '[role="tab"][data-tree-tab^="' + panePrefix + '"]:not([data-vertical])'
  const selectedTab = summaryTab + '[aria-selected="true"]'
  const sideStrip = '[data-zone-tabstrip]:not([data-zone-tabstrip="grp-main"], [data-zone-tabstrip="grp-sessions"])'
  const header = active + ' [data-panel-header]:has(> ' + sideStrip + ' ' + selectedTab + ')'
  const singleRow = active + ' [data-panel-header]:has(> ' + sideStrip + ':not(.absolute) ' + selectedTab + ')'
  const strip = active + ' ' + sideStrip + ':has(' + selectedTab + ')'
  const track = '[data-tree-split].flex-row > div:has(> [data-tree-group] > [data-panel-header] > ' + sideStrip + ' ' + selectedTab + ')'
  const seam = active + ' ' + track + ' > [data-sash-overlap="trailing"]'
  const line = 'light-dark(rgb(26 28 31 / 12%), #2b2b2b)'
  const tab = active + ' [data-zone-tabstrip] ' + summaryTab + '[aria-selected]:has(> .pane-tab-content)'
  const selected = tab + ':is([aria-selected="true"], [data-selected])'
  const closeControl = tab + ' > span > button'
  const style = document.createElement('style')
  style.dataset.hcvSummaryPanes = ''
  style.textContent = [
    '@media (forced-colors: none) {',
    active + ' [data-hcv-summary-pane] { height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--hcv-chat); color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }',
    // Right panel and close control in Codex 983280.4074749967.js. Let the
    // host keep its extra controls row when the tab strip wraps below it.
    header + ' { background: var(--hcv-chat); }',
    singleRow + ' { min-block-size: 48px; }',
    header + '::after { content: ""; position: absolute; inset-inline: 0; inset-block-end: 0; block-size: .5px; background: ' + line + '; pointer-events: none; }',
    strip + ' { background: transparent; }',
    strip + ':not(.absolute) { block-size: auto; }',
    strip + ' > [role="tablist"] { padding-inline-start: 7px; }',
    seam + ' > span:first-child { background: ' + line + '; opacity: 1; }',
    tab + ' { align-self: center; flex: 0 1 220px; min-inline-size: 72px; max-inline-size: 220px; block-size: 30px; min-block-size: 30px; max-block-size: 30px; margin-inline: 0; padding-inline-start: 8px; border-radius: 8px; border-inline-start-color: transparent; background-color: transparent; color: var(--hcv-muted); }',
    tab + '[data-closeable] { --pane-tab-close-width: 32px; padding-inline-end: var(--pane-tab-close-width); }',
    tab + ' .pane-tab-content .truncate { color: inherit; font: 430 13px/18.5714px var(--hcv-ui-font); letter-spacing: normal; text-transform: none; }',
    tab + ' .pane-tab-content > :first-child { padding-inline: 4px; margin-inline: 0; }',
    tab + ':not([aria-selected="true"], [data-selected]):hover { background-color: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 8%)); color: var(--hcv-text); box-shadow: none; }',
    tab + '[data-selected] { background-color: var(--hcv-selected); color: var(--hcv-text); }',
    tab + '[aria-selected="true"] { background-color: light-dark(var(--hcv-chat), #2a2a2a); color: light-dark(var(--hcv-text), #dfdfdf); box-shadow: inset 0 0 0 .5px light-dark(rgb(26 28 31 / 21%), #4c4c4c); }',
    selected + ' > span:has(> button), ' + tab + ':focus-visible > span:has(> button) { opacity: 1; pointer-events: auto; }',
    closeControl + ' .codicon-close { display: none; }',
    closeControl + '::before { content: ""; inline-size: 14px; block-size: 14px; background: currentColor; mask: ' + codexIconStyle('close').mask + '; }',
    ...Object.keys(views).map(kind => tab + paneTab(kind) + ' .pane-tab-content::before { content: ""; display: inline-block; inline-size: 16px; block-size: 16px; flex: none; background: currentColor; mask: ' + codexIconStyle(glyphs[kind]).mask + '; }'),
    active + ' [data-hcv-summary-picker] [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }',
    active + ' [data-hcv-summary-add-tab] { -webkit-app-region: no-drag; align-self: center; display: grid; place-items: center; flex: none; inline-size: 28px; block-size: 28px; margin-inline-start: 7px; border-radius: ' + codex.quietControl.radius + '; color: var(--hcv-muted); }',
    active + ' [data-hcv-summary-add-tab]::before { content: ""; display: block; inline-size: 16px; block-size: 16px; background: currentColor; mask: ' + codexIconStyle('plus').mask + '; }',
    active + ' [data-hcv-summary-add-tab]:hover { background: var(--hcv-hover); color: var(--hcv-text); }',
    tab + ':focus-visible, ' + active + ' [data-hcv-summary-add-tab]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }',
    active + ' [data-hcv-summary-picker] { min-inline-size: 170px; }',
    '}',
  ].join('\n')
  mountStyle(ctx, style, { surface: '[data-tree-tab^="' + panePrefix + '"]' })
  ctx.onDispose(() => {
    disposed = true
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

