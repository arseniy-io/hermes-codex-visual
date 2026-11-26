import { mountStyle } from './style-scope.js'
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

function rowMenu(actions, ctx) {
  const { t } = ctx.i18n
  const entry = actions.parentElement
  const dismiss = () => entry.querySelector('.status-row-dismiss .status-dismiss-button')
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
  const removeItem = item('queueTrash', () => dismiss()?.click())
  editItem.textContent = t('queueEdit')
  removeItem.textContent = t('queueDelete')
  const items = () => Array.from(popup.querySelectorAll('button:not([hidden], :disabled)'))

  trigger.popoverTargetElement = popup
  popup.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open'
    trigger.setAttribute('aria-expanded', String(opening))
    if (!opening) return

    const editButton = actions.querySelector(edit)
    const deleteButton = dismiss()
    editItem.disabled = !editButton || editButton.disabled
    removeItem.disabled = !deleteButton || deleteButton.disabled

    const rect = trigger.getBoundingClientRect()
    const maxHeight = 68
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
  const steerButton = menuButton('queueSteer')
  steerButton.dataset.hcvQueueSteer = ''
  steerButton.textContent = t('queueSteer')
  steerButton.setAttribute('aria-label', steerButton.textContent)
  const tip = document.createElement('div')
  tip.popover = 'manual'
  tip.dataset.hcvQueueTooltip = ''
  tip.textContent = t('queueSteerTip')
  steerButton.setAttribute('aria-description', tip.textContent)
  let timer
  const hideTip = () => { clearTimeout(timer); tip.hidePopover() }
  const showTip = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!steerButton.isConnected || steerButton.hidden || steerButton.disabled) return
      const bounds = steerButton.getBoundingClientRect()
      tip.style.left = `${bounds.left + bounds.width / 2}px`
      tip.style.top = `${bounds.top - 2}px`
      tip.showPopover()
      const rect = tip.getBoundingClientRect()
      if (rect.right > window.innerWidth - 8) tip.style.left = `${bounds.left + bounds.width / 2 - (rect.right - window.innerWidth + 8)}px`
      if (rect.left < 8) tip.style.left = `${bounds.left + bounds.width / 2 + 8 - rect.left}px`
    }, 500)
  }
  steerButton.addEventListener('pointerenter', showTip)
  steerButton.addEventListener('pointerleave', hideTip)
  steerButton.addEventListener('focus', () => { if (steerButton.matches(':focus-visible')) showTip() })
  steerButton.addEventListener('blur', hideTip)
  steerButton.addEventListener('keydown', event => { if (event.key === 'Escape') hideTip() })
  steerButton.addEventListener('click', () => {
    hideTip()
    actions.querySelector(steer)?.click()
  })
  actions.append(steerButton, tip, trigger, popup)
  return {
    sync() {
      const native = actions.querySelector(steer)
      steerButton.toggleAttribute('hidden', !native)
      steerButton.toggleAttribute('disabled', Boolean(native?.disabled))
      if (steerButton.hidden || steerButton.disabled) hideTip()
    },
    dispose() {
      hideTip()
      steerButton.remove()
      tip.remove()
      trigger.remove()
      popup.remove()
    },
  }
}

function QueueSurface({ ctx }) {
  const anchor = useRef(null)
  const { locale } = useI18n()

  useLayoutEffect(() => {
    const dock = anchor.current?.closest('[data-slot="composer-dock"]')
    if (!dock) return
    const menus = new Map()
    let current
    let ordering
    let expandedByPlugin = false

    const cleanSection = () => {
      for (const menu of menus.values()) menu.dispose()
      menus.clear()
      ordering?.dispose()
      ordering = undefined
      if (!current) return
      current.removeAttribute('data-hcv-queue')
      current.removeAttribute('aria-label')
      current.removeAttribute('role')
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
        if (panel) ordering = bindQueueOrder(dock, panel, ctx.i18n.t)
      }
      if (!panel) return
      if (!panel.hasAttribute('data-hcv-queue')) {
        panel.dataset.hcvQueue = ''
        panel.setAttribute('role', 'group')
        panel.setAttribute('aria-label', ctx.i18n.t('queueLabel'))
      }

      const collapsed = panel.querySelector('.status-section-trigger[aria-expanded="false"]')
      if (collapsed && !panel.closest('[inert]')) {
        expandedByPlugin = true
        collapsed.click()
      }

      const live = new Set(panel.querySelectorAll('.status-section-body > ' + row + ' > .status-row-actions'))
      for (const [actions, menu] of menus) {
        if (!live.has(actions)) {
          menu.dispose()
          menus.delete(actions)
        }
      }
      for (const actions of live) {
        let menu = menus.get(actions)
        if (!menu) {
          const controls = rowMenu(actions, ctx)
          const removeGrip = ordering.add(actions)
          menu = { sync: controls.sync, dispose: () => { controls.dispose(); removeGrip() } }
          menus.set(actions, menu)
        }
        menu.sync()
      }
      ordering.sync()
    }

    const observer = new MutationObserver(sync)
    observer.observe(dock, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['aria-expanded', 'inert', 'disabled'],
    })
    sync()
    return () => {
      observer.disconnect()
      cleanSection()
    }
  }, [ctx, locale])

  return h('span', { ref: anchor, hidden: true })
}

function queueStyles(active) {
  const panel = active + ' [data-hcv-queue]'
  const entry = panel + ' > .status-section-body > ' + row
  const soleQueue = '[data-slot="status-stack-content"] > :only-child > [data-hcv-queue]'
  const firstAgent = '[data-slot="status-stack-content"] > :first-child > [data-slot="composer-subagents"]'
  const secondQueue = '[data-slot="status-stack-content"] > :last-child:nth-child(2) > [data-hcv-queue]'
  // A hidden native agent roster must not change the queue-only geometry.
  const visibleQueueOnly = ':is(:has(' + soleQueue + '), :has(' + firstAgent + '):has(' + secondQueue + '))'
  const onlyQueue = stack + visibleQueueOnly
  const bareDock = active + ' [data-slot="composer-dock"]:not(:has(.coding-status-bar))' + visibleQueueOnly
  const queueRows = ' > .status-section-body > ' + row
  const visibleQueue = '.status-drawer:not([data-collapsed]) [data-hcv-queue]' + queueRows
  const attached = active + ' [data-slot="composer-dock"]:not([data-popped-out]):has(> ' + visibleQueue + ')'
  const lastQueue = '[data-slot="status-stack-content"] > :last-child > [data-hcv-queue]'
  const grip = entry + ' > [data-hcv-queue-grip]'
  const popup = active + ' [data-hcv-queue-menu]'
  const more = entry + ' [data-hcv-queue-more]'
  const deleteButton = entry + ' .status-dismiss-button'
  const steerButton = entry + ' [data-hcv-queue-steer]'
  const sendButton = entry + ' .status-row-actions > ' + send
  const primary = `:is(${steerButton}, ${sendButton})`
  const tooltip = active + ' [data-hcv-queue-tooltip]'
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
      grid-template-columns: 14px minmax(0, 1fr) auto 24px 24px;
      grid-template-areas: "icon text primary delete more";
      align-items: center;
      min-block-size: 32px;
      gap: 4px;
      padding: 2px 10px;
      background: transparent;
    }
    ${entry}:hover { background: transparent; }
    ${grip} {
      display: none;
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: 50%;
      translate: 0 -50%;
      place-items: center;
      inline-size: 23px;
      block-size: 24px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: color-mix(in srgb, var(--hcv-queue-muted, var(--hcv-muted)) 70%, transparent);
      touch-action: none;
      cursor: grab;
    }
    ${panel}[data-hcv-queue-reorder] > .status-section-body > ${row} > [data-hcv-queue-grip] { display: grid; }
    ${grip}::before {
      content: "";
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: 50%;
      translate: 0 -50%;
      inline-size: 14px;
      block-size: 14px;
      background: currentColor;
      mask: ${codexMask('queueGrip')} center / contain no-repeat;
      opacity: 0;
      transition: opacity 150ms cubic-bezier(.4, 0, .2, 1);
      pointer-events: none;
    }
    ${entry}:is(:hover, :focus-within, [data-hcv-queue-dragging]) > [data-hcv-queue-grip]::before { opacity: 1; }
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
    ${entry} > .status-row-content { grid-area: text; min-inline-size: 0; margin-inline-start: 4px; overflow: hidden; }
    ${entry} > .status-row-content p {
      display: block;
      max-block-size: none;
      font: 400 var(--hcv-queue-chat-size, 14px)/20px var(--hcv-ui-font);
      color: inherit;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    ${entry}:not(:has([data-slot="queue-lost-note"])) .status-row-content p + div { display: none; }

    ${entry} [data-slot="queue-lost-discard"] { grid-area: primary; }
    ${primary}, ${deleteButton}, ${more} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      block-size: 22px;
      min-inline-size: 24px;
      margin: 0;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--hcv-queue-muted, var(--hcv-muted));
      font: 400 13px/18px var(--hcv-ui-font);
      white-space: nowrap;
      cursor: pointer;
    }
    ${primary} { grid-area: primary; inline-size: auto; padding-inline: 8px; border-radius: 999px; }
    ${sendButton}::after { content: attr(aria-label); }
    ${deleteButton} { grid-area: delete; inline-size: 24px; block-size: 24px; }
    ${more} { grid-area: more; inline-size: 24px; block-size: 24px; }
    ${sendButton} { --hcv-queue-icon: ${codexMask('queueSteer')}; }
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
    ${primary}:not(:disabled):is(:hover, :focus-visible), ${deleteButton}:is(:hover, :focus-visible),
    ${more}:is(:hover, :focus-visible, [aria-expanded="true"]) {
      background: var(--hcv-hover-menu);
    }
    ${primary}:disabled { opacity: .5; cursor: default; }
    ${entry} .status-row-actions > :is(${edit}, ${steer}, button[aria-expanded]:not([data-hcv-queue-more])),
    ${steerButton}[hidden],
    ${entry}:has(> .status-row-actions > button > svg.tabler-icon-steering-wheel) .status-row-actions > ${send} { display: none; }
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
      border: 0;
      border-radius: var(--hcv-dropdown-radius);
      corner-shape: superellipse(1.5);
      background: var(--hcv-dropdown-background);
      color: var(--hcv-queue-text, var(--hcv-text));
      box-shadow: var(--hcv-dropdown-shadow);
      backdrop-filter: none;
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
      border-radius: var(--hcv-dropdown-row-radius);
      corner-shape: superellipse(1.5);
      text-align: start;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    ${popup} button[hidden] { display: none; }
    ${popup} button:disabled { opacity: .45; cursor: default; }
    ${tooltip} {
      position: fixed;
      inset: auto;
      translate: -50% -100%;
      box-sizing: border-box;
      margin: 0;
      inline-size: max-content;
      max-inline-size: calc(100vw - 16px);
      padding: 5px 12px;
      border: 1px solid var(--hcv-dropdown-outline);
      border-radius: 999px;
      background: var(--hcv-menu);
      color: var(--hcv-queue-text, var(--hcv-text));
      font: 400 13px/18px var(--hcv-ui-font);
      text-align: center;
      pointer-events: none;
    }
    @media (prefers-reduced-motion: reduce) {
      ${grip}::before { transition: none; }
    }
    @container (max-width: 350px) {
      ${sendButton}::after { display: none; }
      ${steerButton} { font-size: 0; padding-inline: 0; }
    }
  `
}

export function registerQueueAppearance(ctx, active) {
  ctx.i18n.register({
    en: {
      queueLabel: 'Queued messages', queueActions: 'Queued message actions', queueSteer: 'Steer',
      queueEdit: 'Edit message', queueDelete: 'Delete queued message',
      queueSteerTip: 'Submit without interrupting the model',
      queueMoveFailed: 'Could not confirm the new queue order',
      queueMove: 'Move queued message with Up or Down', queueMoved: (position, count) => `Position ${position} of ${count}`,
    },
    ru: {
      queueLabel: 'Очередь сообщений', queueActions: 'Действия с сообщением в очереди', queueSteer: 'Скорректировать',
      queueEdit: 'Редактировать сообщение', queueDelete: 'Удалить сообщение из очереди',
      queueSteerTip: 'Отправить, не прерывая работу модели',
      queueMoveFailed: 'Не удалось подтвердить новый порядок очереди',
      queueMove: 'Переместить сообщение в очереди стрелками вверх или вниз',
      queueMoved: (position, count) => `Позиция ${position} из ${count}`,
    },
  })
  const root = document.documentElement
  const sheet = document.createElement('style')
  sheet.dataset.hcvQueueStyle = ''
  sheet.textContent = queueStyles(active)
  mountStyle(ctx, sheet, { surface: '[data-hcv-queue], [data-hcv-queue-menu]' })

  let remove
  const sync = () => {
    if (root.matches(active)) {
      remove ??= ctx.register({
        id: 'queue-appearance',
        area: 'composer.top',
        render: () => h(QueueSurface, { ctx }),
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
