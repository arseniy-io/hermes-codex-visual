import { useI18n } from '@hermes/plugin-sdk'
import { createElement as h, useLayoutEffect, useRef } from 'react'
import { codexMask } from './codex-reference.js'
import { bindQueueOrder } from './queue-order.js'

const stack = '[data-slot="composer-status-stack"]'
const section = '[data-slot="status-section"]'
const row = '[data-slot="status-row"]'
const edit = 'button:has(> svg.tabler-icon-pencil)'
const steer = 'button:has(> svg.tabler-icon-steering-wheel)'
const send = 'button:has(> svg.tabler-icon-corner-down-left)'
const modeKey = 'queueFollowUps'

function menuButton(icon) {
  const button = document.createElement('button')
  button.type = 'button'
  button.style.setProperty('--hcv-queue-icon', codexMask(icon))
  return button
}

function rowMenu(actions, ctx, queueing) {
  const { t } = ctx.i18n
  const trigger = menuButton('queueMore')
  trigger.dataset.hcvQueueMore = ''
  trigger.setAttribute('aria-label', t('queueActions'))
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  const popup = document.createElement('div')
  popup.popover = 'auto'
  popup.dataset.hcvQueueMenu = ''
  popup.setAttribute('role', 'menu')
  popup.setAttribute('aria-label', t('queueActions'))

  const item = (icon, run) => {
    const button = menuButton(icon)
    button.setAttribute('role', 'menuitem')
    button.tabIndex = -1
    button.addEventListener('click', () => {
      popup.hidePopover()
      run()
    })
    popup.append(button)
    return button
  }
  const editItem = item('queueEdit', () => actions.querySelector(edit)?.click())
  const sendItem = item('queueSteer', () => actions.querySelector(send)?.click())
  const modeItem = item('queueFollowUp', () => ctx.storage.set(modeKey, !queueing()))
  const items = () => Array.from(popup.querySelectorAll('button:not([hidden], :disabled)'))

  trigger.popoverTargetElement = popup
  popup.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open'
    trigger.setAttribute('aria-expanded', String(opening))
    if (!opening) return

    const editButton = actions.querySelector(edit)
    const sendButton = actions.querySelector(send)
    editItem.textContent = t('queueEdit')
    editItem.disabled = !editButton || editButton.disabled
    sendItem.textContent = t('queueNext')
    sendItem.hidden = !sendButton || !actions.querySelector(steer)
    sendItem.disabled = !sendButton || sendButton.disabled
    modeItem.textContent = t(queueing() ? 'queueOff' : 'queueOn')

    const rect = trigger.getBoundingClientRect()
    const maxHeight = 92
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px'
    const below = rect.bottom + maxHeight + 8 < window.innerHeight
    popup.style.top = below ? rect.bottom + 4 + 'px' : 'auto'
    popup.style.bottom = below ? 'auto' : window.innerHeight - rect.top + 4 + 'px'
  })
  popup.addEventListener('toggle', event => {
    if (event.newState === 'open') items()[0]?.focus({ preventScroll: true })
  })
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!popup.matches(':popover-open')) trigger.click()
      else items()[0]?.focus()
    }
  })
  popup.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      popup.hidePopover()
      trigger.focus()
      return
    }

    const buttons = items()
    const current = buttons.indexOf(document.activeElement)
    const last = buttons.length - 1
    if (last < 0) return
    let index
    switch (event.key) {
      case 'ArrowDown': index = (current + 1) % buttons.length; break
      case 'ArrowUp': index = current <= 0 ? last : current - 1; break
      case 'Home': index = 0; break
      case 'End': index = last; break
      default: return
    }
    event.preventDefault()
    buttons[index].focus()
  })
  actions.append(trigger, popup)
  return () => {
    trigger.remove()
    popup.remove()
  }
}

function QueueSurface({ ctx, queueing }) {
  const anchor = useRef(null)
  const { locale, t: { composer: copy } } = useI18n()

  useLayoutEffect(() => {
    const dock = anchor.current?.closest('[data-slot="composer-dock"]')
    if (!dock) return
    const menus = new Map()
    let current
    let ordering
    let expandedByPlugin = false

    const cleanSection = () => {
      for (const dispose of menus.values()) dispose()
      menus.clear()
      ordering?.dispose()
      ordering = undefined
      if (!current) return
      current.removeAttribute('data-hcv-queue')
      current.removeAttribute('aria-label')
      current.removeAttribute('role')
      current.style.removeProperty('--hcv-queue-steer-label')
      if (expandedByPlugin && current.isConnected) {
        current.querySelector('.status-section-trigger[aria-expanded="true"]')?.click()
      }
      expandedByPlugin = false
    }

    const sync = () => {
      // The native queue header has a layer icon (pause icon while parked).
      // Other sections in the status stack use their own icons.
      const icon = dock.querySelector(stack + ' .status-section-trigger > .status-section-icon > :is(.codicon-layers, .codicon-debug-pause)')
      const panel = icon?.closest(section)
      if (panel !== current) {
        cleanSection()
        current = panel
        if (panel) ordering = bindQueueOrder(dock, panel, ctx.i18n.t, copy)
      }
      if (!panel) return
      if (!panel.hasAttribute('data-hcv-queue')) {
        panel.dataset.hcvQueue = ''
        panel.setAttribute('role', 'group')
        panel.setAttribute('aria-label', ctx.i18n.t('queueLabel'))
        panel.style.setProperty('--hcv-queue-steer-label', JSON.stringify(ctx.i18n.t('queueSteer')))
      }

      const collapsed = panel.querySelector('.status-section-trigger[aria-expanded="false"]')
      if (collapsed && !panel.closest('[inert]')) {
        expandedByPlugin = true
        collapsed.click()
      }

      const live = new Set(panel.querySelectorAll('.status-section-body > ' + row + ' > .status-row-actions'))
      for (const [actions, dispose] of menus) {
        if (!live.has(actions)) {
          dispose()
          menus.delete(actions)
        }
      }
      for (const actions of live) {
        if (menus.has(actions)) continue
        const removeMenu = rowMenu(actions, ctx, queueing)
        const removeGrip = ordering.add(actions)
        menus.set(actions, () => {
          removeMenu()
          removeGrip()
        })
      }
      ordering.sync()
    }

    const observer = new MutationObserver(sync)
    observer.observe(dock, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['aria-expanded', 'inert'],
    })
    sync()
    return () => {
      observer.disconnect()
      cleanSection()
    }
  }, [ctx, locale, copy, queueing])

  return h('span', { ref: anchor, hidden: true })
}

function queueStyles(active) {
  const panel = active + ' [data-hcv-queue]'
  const entry = panel + ' > .status-section-body > ' + row
  const soleQueue = '[data-slot="status-stack-content"] > :only-child > [data-hcv-queue]'
  const onlyQueue = stack + ':has(' + soleQueue + ')'
  const bareDock = active + ' [data-slot="composer-dock"]:has(' + stack + ' ' + soleQueue + '):not(:has(.coding-status-bar))'
  const queueRows = ' > .status-section-body > ' + row
  const visibleQueue = '.status-drawer:not([data-collapsed]) [data-hcv-queue]' + queueRows
  const attached = active + ' [data-slot="composer-dock"]:not([data-popped-out]):has(> ' + visibleQueue + ')'
  const lastQueue = '[data-slot="status-stack-content"] > :last-child > [data-hcv-queue]'
  const grip = entry + ' > [data-hcv-queue-grip]'
  const popup = active + ' [data-hcv-queue-menu]'
  const more = entry + ' [data-hcv-queue-more]'
  const deleteButton = entry + ' .status-dismiss-button'
  const primary = entry + ' .status-row-actions > :is(' + steer + ', ' + send + ')'
  return `
    ${active}[data-hermes-mode="dark"] {
      --hcv-queue-text: #dfdfdf;
      --hcv-queue-muted: #969696;
    }
    ${active} ${onlyQueue} > div {
      /* Codex insets the tray 13px. Hermes reserves a 5px grab margin. */
      margin-inline: 18px;
      background: transparent;
      backdrop-filter: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    ${bareDock} [data-slot="status-drawer-toggle"][aria-expanded="true"] { display: none; }
    ${attached} {
      /* attached-uA8vni in Codex 0b2d31a9d760.css: radius + one unit. */
      --hcv-queue-overlap: 20px;
    }
    ${attached} > .status-drawer:has(${lastQueue}) {
      margin-block-end: calc(-1 * var(--hcv-queue-overlap));
    }
    ${attached} ${lastQueue} { padding-block-end: var(--hcv-queue-overlap); }
    ${attached} > [data-slot="composer-root"] { z-index: 1; }
    ${panel} {
      background: var(--hcv-menu);
      border: 1px solid var(--hcv-stroke);
      border-block-end: 0;
      border-radius: 16px 16px 0 0;
      container-type: inline-size;
      overflow: clip;
      color: var(--hcv-queue-text, var(--hcv-text));
      font-family: var(--hcv-ui-font);
    }
    ${panel} > .status-section-header:not(:has(.codicon-debug-pause)) { display: none; }
    ${panel} > .status-section-body {
      display: grid;
      row-gap: 1px;
      max-block-size: 30dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    ${entry} {
      position: relative;
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto 22px 22px;
      grid-template-areas: "icon text primary delete more";
      align-items: center;
      min-block-size: 29px;
      gap: 4px;
      padding: 2px 9px;
      background: transparent;
    }
    ${entry}:hover { background: transparent; }
    ${grip} {
      display: none;
      position: absolute;
      inset-inline-start: 1px;
      inset-block-start: 50%;
      translate: 0 -50%;
      place-items: center;
      inline-size: 11px;
      block-size: 20px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: color-mix(in srgb, var(--hcv-queue-muted, var(--hcv-muted)) 70%, transparent);
      opacity: 0;
      cursor: grab;
    }
    ${panel}[data-hcv-queue-reorder] > .status-section-body > ${row} > [data-hcv-queue-grip] { display: grid; }
    ${grip}::before {
      content: "";
      inline-size: 14px;
      block-size: 14px;
      background: currentColor;
      mask: ${codexMask('queueGrip')} center / contain no-repeat;
    }
    ${entry}:is(:hover, :focus-within, [data-hcv-queue-dragging]) > [data-hcv-queue-grip] { opacity: 1; }
    ${grip}:focus-visible { outline: 1px solid var(--hcv-focus); }
    ${entry}[data-hcv-queue-dragging] { opacity: .6; cursor: grabbing; }
    ${entry}[data-hcv-queue-drop]::after {
      content: "";
      position: absolute;
      inset-inline: 10px;
      block-size: 1px;
      background: var(--hcv-focus);
      pointer-events: none;
    }
    ${entry}[data-hcv-queue-drop="before"]::after { inset-block-start: 0; }
    ${entry}[data-hcv-queue-drop="after"]::after { inset-block-end: 0; }
    ${entry} > :is(.status-row-actions, .status-row-dismiss) { display: contents; opacity: 1; }
    ${entry} > .status-row-icon {
      grid-area: icon;
      color: color-mix(in srgb, var(--hcv-queue-muted, var(--hcv-muted)) 70%, transparent);
      width: 14px;
      height: 14px;
      background: currentColor;
      mask: ${codexMask('queueFollowUp')} center / contain no-repeat;
    }
    ${entry} > .status-row-icon > *,
    ${entry} :is(.status-dismiss-button, ${steer}, ${send}) > svg,
    ${deleteButton} > * { display: none; }
    ${entry} > .status-row-content { grid-area: text; margin-inline-start: 2px; }
    ${entry} > .status-row-content p { font: 400 13px/20px var(--hcv-ui-font); color: inherit; }
    ${entry} .status-row-actions > ${edit},
    ${entry}:has(> .status-row-actions > button > svg.tabler-icon-steering-wheel) .status-row-actions > ${send} { display: none; }
    ${primary}, ${deleteButton}, ${more} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      block-size: 22px;
      min-inline-size: 22px;
      margin: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--hcv-queue-muted, var(--hcv-muted));
      font: 400 12px/18px var(--hcv-ui-font);
      cursor: pointer;
    }
    ${primary} { grid-area: primary; inline-size: auto; padding-inline: 5px; }
    ${primary}::after { content: attr(aria-label); }
    ${entry} .status-row-actions > ${steer}::after { content: var(--hcv-queue-steer-label); }
    ${deleteButton} { grid-area: delete; inline-size: 22px; }
    ${more} { grid-area: more; inline-size: 22px; }
    ${primary} { --hcv-queue-icon: ${codexMask('queueSteer')}; }
    ${deleteButton} { --hcv-queue-icon: ${codexMask('queueTrash')}; }
    ${primary}::before, ${deleteButton}::before, ${more}::before,
    ${popup} button::before {
      content: "";
      display: block;
      inline-size: 14px;
      block-size: 14px;
      flex: none;
      background: currentColor;
      mask: var(--hcv-queue-icon) center / contain no-repeat;
    }
    ${primary}:is(:hover, :focus-visible), ${deleteButton}:is(:hover, :focus-visible),
    ${more}:is(:hover, :focus-visible, [aria-expanded="true"]) {
      color: var(--hcv-queue-text, var(--hcv-text));
      background: var(--hcv-hover-menu);
    }
    ${primary}:focus-visible, ${deleteButton}:focus-visible, ${more}:focus-visible {
      outline: 1px solid var(--hcv-focus);
      outline-offset: -1px;
    }
    ${popup} {
      position: fixed;
      inset: auto;
      margin: 0;
      inline-size: max-content;
      max-inline-size: calc(100vw - 16px);
      padding: 4px;
      border: 1px solid var(--hcv-stroke);
      border-radius: 16px;
      background: var(--hcv-menu);
      color: var(--hcv-queue-text, var(--hcv-text));
      box-shadow: var(--hcv-menu-shadow);
      font: 400 13px/18px var(--hcv-ui-font);
    }
    ${popup} button {
      display: flex;
      align-items: center;
      inline-size: 100%;
      min-block-size: 26px;
      gap: 7px;
      padding: 3px 7px;
      border: 0;
      border-radius: 8px;
      text-align: start;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    ${popup} button[hidden] { display: none; }
    ${popup} button:disabled { opacity: .45; cursor: default; }
    @container (max-width: 350px) {
      ${primary}::after { display: none; }
    }
  `
}

export function registerQueueAppearance(ctx, active, queueing) {
  ctx.i18n.register({
    en: {
      queueLabel: 'Queued messages', queueActions: 'Queued message actions', queueSteer: 'Steer',
      queueEdit: 'Edit message', queueNext: 'Send next',
      queueOff: 'Turn off queueing', queueOn: 'Turn on queueing',
      queueMove: 'Move queued message with Up or Down', queueMoved: (position, count) => `Position ${position} of ${count}`,
    },
    ru: {
      queueLabel: 'Очередь сообщений', queueActions: 'Действия с сообщением в очереди', queueSteer: 'Скорректировать',
      queueEdit: 'Редактировать сообщение', queueNext: 'Отправить следующим',
      queueOff: 'Выключить постановку в очередь', queueOn: 'Включить постановку в очередь',
      queueMove: 'Переместить сообщение в очереди стрелками вверх или вниз',
      queueMoved: (position, count) => `Позиция ${position} из ${count}`,
    },
  })
  const root = document.documentElement
  const sheet = document.createElement('style')
  sheet.dataset.hcvQueueStyle = ''
  sheet.textContent = queueStyles(active)
  document.head.append(sheet)

  let remove
  const sync = () => {
    if (root.matches(active)) {
      remove ??= ctx.register({
        id: 'queue-appearance',
        area: 'composer.top',
        render: () => h(QueueSurface, { ctx, queueing }),
      })
    } else if (remove) {
      remove()
      remove = undefined
    }
  }
  const theme = new MutationObserver(sync)
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.onDispose(() => {
    theme.disconnect()
    remove?.()
    sheet.remove()
  })
  sync()
}


export function queueingPreference(ctx) {
  return ctx.storage.get(modeKey, true)
}
