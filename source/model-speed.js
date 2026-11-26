import { host, queryClient } from '@hermes/plugin-sdk'
import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { mountCSS } from './style-scope.js'
import { tooltipCopy } from './tooltip-copy.js'
import { codexModelName, compactEffort, effortMenuLabel, modelLabel, modelSpeedDescription, providerName } from './model-speed-data.js'

const pill = '[data-slot="composer-surface"] button[data-tour="model-pill"]'
const regularPill = `${pill}:has(> span.truncate)`
const effort = '[data-slot="composer-surface"] [data-testid="reasoning-pill"]'
const effortButton = '[data-testid="reasoning-pill"]'
const catalog = '[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"])'
const menus = '[data-slot="dropdown-menu-sub-content"], [data-slot="dropdown-menu-content"]'
const header = `${catalog} [class~="group/label"] > span.truncate`
const tip = '[data-slot="tooltip-content"]'
const modelOptions = '[data-hcv-model-options]'
const speedOption = '[data-hcv-speed-option]'
const standardSpeed = '[data-hcv-standard-speed]'
const speedHeading = '[data-hcv-speed-heading]'
const speedDescription = '[data-hcv-speed-description]'
const marked = `[data-hcv-model-label], [data-hcv-model-speed], [data-hcv-provider-label], [data-hcv-effort-ultra], ${modelOptions}, ${speedOption}`
const optionsLabel = ':scope > [data-slot="dropdown-menu-label"]'
const acceleratedTier = tier => tier === 'fast' || tier === 'priority' || tier === 'ultrafast'

// Read the native menu's owning row; never guess a model from a displayed name.
function menuModel(node) {
  for (let fiber = committedFiber(node); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof props?.model === 'string' && typeof props?.provider === 'string' &&
        typeof props?.onSetOptions === 'function') return props
  }
  return null
}

// ModelPill calls useSessionView(). React retains that exact context value in
// its committed dependencies, including each pane's own tier atoms.
function sessionView(node) {
  for (let fiber = committedFiber(node); fiber; fiber = fiber.return) {
    for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
      const view = dependency.memoizedValue
      if (typeof view?.$model?.get === 'function' && typeof view?.$fast?.get === 'function') return view
    }
    const view = fiber.memoizedProps?.value
    if (typeof view?.$model?.get === 'function' && typeof view?.$fast?.get === 'function') return view
  }
  return null
}

function catalogQuery(node) {
  const view = sessionView(node)
  if (typeof view?.$runtimeId?.get !== 'function') return null
  for (let fiber = committedFiber(node); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof props?.requestGateway !== 'function' || typeof props.profile !== 'string') continue
    const key = ['model-options', props.profile.trim() || 'default', view.$runtimeId.get() || 'global']
    if (props.ownerConnectionId) key.push('owner', props.ownerConnectionId)
    return queryClient?.getQueryCache().find({ queryKey: key, exact: true })
  }
  return null
}

function setAttribute(node, name, value) {
  if (value == null || value === '') {
    if (node.hasAttribute(name)) node.removeAttribute(name)
  } else if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

export function registerModelSpeed(ctx, active) {
  const root = document.documentElement
  let disposed = false, frame = 0
  let observed = []
  const views = new Map()
  const writtenText = new Map()
  const controlLabels = new Map()
  const added = new Set()
  const catalogRetries = new Map()

  function stopCatalogRetry(menu) {
    const retry = catalogRetries.get(menu)
    if (!retry) return
    retry.stopped = true
    clearTimeout(retry.timer)
    catalogRetries.delete(menu)
  }

  function recoverColdCatalog(label, native) {
    const menu = label.closest(menus)
    const query = catalogQuery(label)
    if (!menu || !query) return
    const existing = catalogRetries.get(menu)
    if (existing && existing.query === query && existing.model === native.model && existing.provider === native.provider) return
    stopCatalogRetry(menu)
    const retry = { query, model: native.model, provider: native.provider, attempts: 0, timer: 0, stopped: false }
    catalogRetries.set(menu, retry)
    function poll() {
      if (retry.stopped || catalogRetries.get(menu) !== retry) return
      if (disposed || !menu.isConnected || !root.matches(active) ||
          catalogQuery(label) !== query) { stopCatalogRetry(menu); return }
      const current = menuModel(label)
      const caps = query.state.data?.providers?.find(row => row.slug === retry.provider)?.capabilities?.[retry.model]
      if (!current || current.model !== retry.model || current.provider !== retry.provider ||
          caps?.fast !== false || caps.ultrafast !== false ||
          menu.querySelector(speedOption)) { stopCatalogRetry(menu); return }
      if (query.state.status !== 'success' || query.state.fetchStatus !== 'idle') {
        retry.timer = setTimeout(poll, 1000)
        return
      }
      retry.attempts++
      void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false })
        .catch(() => {}).finally(() => {
          if (retry.stopped) return
          if (retry.attempts >= 5) { retry.exhausted = true; return }
          retry.timer = setTimeout(poll, 1000)
        })
    }
    poll()
  }

  function editText(element, format) {
    const node = element && [...element.childNodes].find(child => child.nodeType === 3)
    if (!node) return
    const previous = writtenText.get(node)
    const original = node.data === previous?.value ? previous.original : node.data
    const value = format(original)
    if (value !== original) writtenText.set(node, { original, value })
    else writtenText.delete(node)
    if (node.data !== value) node.data = value
    return value
  }

  function editTooltip(trigger, format) {
    const accessible = document.getElementById(trigger.getAttribute('aria-describedby') || '')
    const label = accessible?.closest(tip)?.querySelector('[data-slot="tooltip-label"]')
    if (label) {
      editText(label, format)
      editText(accessible, format)
    }
  }

  function editControlLabel(button, format) {
    const title = button.getAttribute('aria-label')
    const previous = controlLabels.get(button)
    const original = previous?.value === title ? previous.original : title
    const value = original && format(original)
    if (value && value !== original) controlLabels.set(button, { original, value })
    else controlLabels.delete(button)
    setAttribute(button, 'aria-label', value)
  }

  function writeElement(parent, marker, tag, text, before = null) {
    let node = parent.querySelector(`:scope > ${marker}`)
    if (!node) {
      node = document.createElement(tag)
      node.setAttribute(marker.slice(1, -1), '')
      added.add(node)
    }
    if (node.parentElement !== parent || node.nextElementSibling !== before) parent.insertBefore(node, before)
    if (node.textContent !== text) node.textContent = text
    return node
  }

  function removeElement(node) {
    node.remove()
    added.delete(node)
  }

  function resetPresentation() {
    for (const menu of catalogRetries.keys()) stopCatalogRetry(menu)
    for (const node of added) node.remove()
    added.clear()
    for (const [node, { original, value }] of writtenText) if (node.data === value) node.data = original
    writtenText.clear()
    for (const [button, { original, value }] of controlLabels) {
      if (button.getAttribute('aria-label') === value) button.setAttribute('aria-label', original)
    }
    controlLabels.clear()
    for (const node of document.querySelectorAll(marked)) {
      for (const key of ['model-label', 'model-speed', 'provider-label', 'model-options', 'speed-option', 'effort-ultra']) node.removeAttribute(`data-hcv-${key}`)
    }
    for (const dispose of views.values()) for (const off of dispose) off()
    views.clear()
  }

  function labelText() {
    const seen = new Set()
    for (const button of document.querySelectorAll(pill)) editControlLabel(button, tooltipCopy)
    for (const node of document.querySelectorAll(`${pill} > span.truncate`)) {
      const view = sessionView(node)
      if (!view) {
        setAttribute(node, 'data-hcv-model-label', '')
        setAttribute(node.parentElement, 'data-hcv-model-speed', '')
        continue
      }
      seen.add(view)
      if (!views.has(view)) views.set(view, [view.$fast, view.$serviceTier].filter(Boolean).map(atom => atom.listen(schedule)))
      const tier = view.$serviceTier?.get(), fast = view.$fast.get()
      const speed = tier === 'ultrafast' ? 'ultrafast' : fast || tier === 'priority' || tier === 'fast' ? 'fast' : ''
      // When no speed tier is on, a model ID ending in -fast is part of the
      // actual model name and must not become a speed indicator.
      const name = editText(node, original => speed ? modelLabel(original).name : codexModelName(original))
      setAttribute(node, 'data-hcv-model-label', name)
      setAttribute(node.parentElement, 'data-hcv-model-speed', speed)
      if (name) editTooltip(node.parentElement, original => original.replace(/^(Модель|Model)(?: ·)? .+$/iu, (_, label) => `${label} ${name}`))
    }
    for (const button of document.querySelectorAll(effort)) {
      const label = editText(button.querySelector(':scope > span'), original => compactEffort(original, root.lang))
      setAttribute(button, 'data-hcv-effort-ultra', label === 'Ultra' ? 'true' : '')
      editTooltip(button, original => effortMenuLabel(original, root.lang))
      editControlLabel(button, original => effortMenuLabel(original, root.lang))
    }
    for (const [view, dispose] of views) if (!seen.has(view)) { for (const off of dispose) off(); views.delete(view) }
    for (const node of document.querySelectorAll(header)) {
      const value = node.textContent.trim(), short = providerName(value)
      setAttribute(node, 'data-hcv-provider-label', short !== value ? short : '')
    }
  }
  function options() {
    const isRu = /^ru(?:-|$)/i.test(root.lang)
    const speedLanguage = isRu || !root.lang || /^en(?:-|$)/i.test(root.lang)
    for (const menu of document.querySelectorAll(menus)) {
      const label = menu.querySelector(optionsLabel)
      const native = menuModel(label)
      if (!native) {
        if (menu.hasAttribute('data-hcv-model-options')) {
          menu.removeAttribute('data-hcv-model-options')
          for (const node of menu.querySelectorAll(`${standardSpeed}, ${speedHeading}, ${speedDescription}`)) removeElement(node)
        }
        continue
      }
      menu.setAttribute('data-hcv-model-options', '')
      for (const row of menu.querySelectorAll('[data-slot="dropdown-menu-radio-item"]')) editText(row, original => effortMenuLabel(original, root.lang))
      if (!speedLanguage) continue
      const rows = []
      const items = [...menu.querySelectorAll(':scope > [data-slot="dropdown-menu-item"]')]
      for (const row of items) {
        const control = row.querySelector(':scope > [data-slot="switch"][role="switch"]')
        const name = (control?.getAttribute('aria-label') || '').trim().toLowerCase()
        const kind = /^(?:быстрая|быстрый|fast)$/.test(name) ? 'fast' :
          /^(?:ультрабыстрая|ультрабыстрый|ultrafast)$/.test(name) ? 'ultrafast' : ''
        setAttribute(row, 'data-hcv-speed-option', kind)
        if (kind) {
          rows.push(row)
          editText(row, original => isRu ? (kind === 'fast' ? 'Быстрый' : 'Ультрабыстрый') : original)
          writeElement(row, speedDescription, 'span', modelSpeedDescription(kind, native, root.lang))
        } else {
          const description = row.querySelector(speedDescription)
          if (description) removeElement(description)
          editText(row, original => original)
        }
      }
      const reset = items.find(row => /^(?:Использовать стандартную скорость|Use standard speed)$/iu.test(row.textContent.trim()))
      if (!rows.length && native.provider === 'openai-codex') recoverColdCatalog(label, native)
      else stopCatalogRetry(menu)
      if (!rows.length && !reset && native.provider !== 'openai-codex') {
        for (const node of menu.querySelectorAll(`${standardSpeed}, ${speedHeading}`)) removeElement(node)
        continue
      }
      const before = rows[0] || reset || menu.querySelector(':scope > [data-slot="dropdown-menu-separator"]')
      let standard = menu.querySelector(standardSpeed)
      if (reset) {
        if (standard) removeElement(standard)
        standard = null
      } else {
        standard = writeElement(menu, standardSpeed, 'div', isRu ? 'Стандартный' : 'Standard', before)
        setAttribute(standard, 'role', 'menuitemradio')
        setAttribute(standard, 'tabindex', '-1')
        const activeTier = native.provider === 'openai-codex' && acceleratedTier(native.serviceTier)
        setAttribute(standard, 'aria-disabled', rows.length || activeTier ? '' : 'true')
        const accelerated = activeTier || rows.some(row => row.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true')
        setAttribute(standard, 'aria-checked', String(!accelerated))
      }
      writeElement(menu, speedHeading, 'div', isRu ? 'Скорость' : 'Speed', standard || before)
    }
    for (const menu of catalogRetries.keys()) if (!menu.isConnected) stopCatalogRetry(menu)
    for (const node of added) if (!node.isConnected) added.delete(node)
    for (const node of writtenText.keys()) if (!node.isConnected) writtenText.delete(node)
    for (const node of controlLabels.keys()) if (!node.isConnected) controlLabels.delete(node)
  }
  function sync() {
    frame = 0
    if (disposed) return
    for (const node of observed) node.disconnect()
    observed = []
    if (!root.matches(active)) {
      resetPresentation()
      return
    }
    labelText()
    options()
    for (const node of document.querySelectorAll(`${pill}, ${effort}, ${menus}, ${tip}`)) {
      const observer = new MutationObserver(schedule)
      observer.observe(node, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['aria-checked', 'aria-describedby', 'aria-label'] })
      observed.push(observer)
    }
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(sync) }
  function activate(event) {
    if (!root.matches(active) || !(event.target instanceof Element)) return
    const standard = event.target.closest(`${standardSpeed}:not([aria-disabled="true"])`)
    const option = event.target.closest(speedOption)
    if (!standard && !option && event.type === 'keydown' && event.key === 'ArrowDown') {
      const item = event.target.closest('[role^="menuitem"]')
      const nextStandard = item?.parentElement?.querySelector(`:scope > ${standardSpeed}:not([aria-disabled="true"])`)
      let previous = nextStandard?.previousElementSibling
      while (previous && !previous.matches('[role^="menuitem"]')) previous = previous.previousElementSibling
      if (previous === item) {
        event.preventDefault(); event.stopPropagation(); nextStandard.focus()
      }
      return
    }
    if (!standard && !option) return
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) {
      if (event.key === 'ArrowDown' && standard) {
        const next = standard.parentElement.querySelector('[data-hcv-speed-option]')
        if (next) { event.preventDefault(); event.stopPropagation(); next.focus() }
      } else if (event.key === 'ArrowUp' && standard) {
        let previous = standard.previousElementSibling
        while (previous && !previous.matches('[role^="menuitem"]')) previous = previous.previousElementSibling
        if (previous) { event.preventDefault(); event.stopPropagation(); previous.focus() }
      } else if (event.key === 'ArrowUp' && option) {
        const previous = option.previousElementSibling
        if (previous?.hasAttribute('data-hcv-standard-speed')) {
          event.preventDefault(); event.stopPropagation(); previous.focus()
        }
      }
      return
    }
    if (option && event.target.closest('[role="switch"]')) return
    const control = standard ? standard.parentElement.querySelector('[data-hcv-speed-option] [role="switch"][aria-checked="true"]') :
      option.querySelector('[role="switch"]')
    event.preventDefault(); event.stopPropagation()
    if (control) control.click()
    else if (standard) {
      const native = menuModel(standard.parentElement.querySelector(optionsLabel))
      if (native?.provider === 'openai-codex' && acceleratedTier(native.serviceTier)) native.onSetOptions({ serviceTier: 'normal' })
    }
  }
  document.addEventListener('click', activate, true)
  document.addEventListener('keydown', activate, true)
  const mounts = new MutationObserver(records => {
    const surfaces = `${pill}, ${effort}, ${menus}, ${tip}`
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
      (node.matches(surfaces) || node.querySelector(surfaces))))) schedule()
  })
  mounts.observe(document.body, { subtree: true, childList: true })
  const theme = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'lang')) resetPresentation()
    schedule()
  })
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  const subscriptions = [host.state.profile, host.state.connectionId].map(atom => atom.listen(() => {
    schedule()
  }))
  const unsubscribeCatalog = queryClient?.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === 'model-options' &&
        document.querySelector(modelOptions)) schedule()
  })

  mountCSS(ctx, 'data-hcv-model-speed-style', `
    ${active} ${header}[data-hcv-provider-label] { font-size: 0; text-transform: none; }
    ${active} ${header}[data-hcv-provider-label]::after { content: attr(data-hcv-provider-label); font: 400 13px/18px var(--hcv-ui-font); }
    ${active} ${pill} > [data-testid="model-pinned-dot"] { display: none; }
    ${active} ${modelOptions} {
      box-sizing: border-box;
      inline-size: min(248px, calc(100vw - 24px));
      max-inline-size: calc(100vw - 24px);
    }
    ${active} ${modelOptions} :is(${speedHeading}, ${standardSpeed}, ${speedOption}) {
      margin-inline: 3px;
    }
    ${active} ${modelOptions} ${speedHeading} {
      border-block-start: 1px solid var(--hcv-hairline);
      color: var(--hcv-dropdown-muted);
      font: 600 11px/16px var(--hcv-ui-font);
      margin-block-start: 3px;
      padding: 5px 7px 2px;
    }
    ${active} ${modelOptions} :is(${standardSpeed}, ${speedOption}) {
      padding: 4px 7px;
      border-radius: 5px;
      color: var(--hcv-dropdown-text);
      font: 400 13px/18px var(--hcv-ui-font);
    }
    ${active} ${modelOptions} ${speedOption} {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 16px;
      column-gap: 8px;
      row-gap: 1px;
    }
    ${active} ${modelOptions} ${speedOption} > [role="switch"] { grid-area: 1 / 2 / span 2; }
    ${active} ${modelOptions} ${speedDescription} {
      grid-area: 2 / 1;
      color: var(--hcv-dropdown-muted);
      font: 400 11px/15px var(--hcv-ui-font);
      white-space: pre-line;
    }
    ${active} ${modelOptions} ${standardSpeed} {
      display: flex;
      align-items: center;
      min-block-size: 28px;
      cursor: default;
    }
    ${active} ${modelOptions} [data-slot="dropdown-menu-radio-item"] {
      min-block-size: 28px;
      font: 400 13px/18px var(--hcv-ui-font);
    }
    ${active} ${pill}[data-hcv-model-speed]::before {
      content: ''; inline-size: 14px; block-size: 14px; flex: none; background: currentColor;
    }
    ${active} ${pill}[data-hcv-model-speed="fast"]::before { mask: ${codexMask('speedFast')} center / contain no-repeat; }
    ${active} ${pill}[data-hcv-model-speed="ultrafast"]::before { mask: ${codexMask('speedUltrafast')} center / contain no-repeat; }
    @media (forced-colors: none) {
      ${active} ${regularPill}, ${active} ${effort} {
        align-items: center;
        border-radius: 9999px;
        block-size: var(--composer-control-size, 28px);
        font: 400 14px/18px var(--hcv-ui-font);
        padding-inline: 8px;
        --chrome-action-hover: var(--hcv-composer-hover, var(--hcv-dropdown-hover));
      }
      ${active} ${regularPill} { color: var(--hcv-text); gap: 4px; }
      ${active} ${regularPill}:has(+ ${effortButton}) {
        border-start-start-radius: calc(var(--composer-control-size, 28px) / 2) !important;
        border-end-start-radius: calc(var(--composer-control-size, 28px) / 2) !important;
        border-start-end-radius: 0 !important;
        border-end-end-radius: 0 !important;
        margin-inline-end: calc(-1 * var(--composer-control-gap, 4px));
        padding-inline-end: 3px;
      }
      ${active} ${effort} {
        border-start-start-radius: 0 !important;
        border-end-start-radius: 0 !important;
        border-start-end-radius: calc(var(--composer-control-size, 28px) / 2) !important;
        border-end-end-radius: calc(var(--composer-control-size, 28px) / 2) !important;
        color: var(--hcv-text);
        padding-inline: 3px 6px;
      }
      ${active} ${regularPill} > span.truncate,
      ${active} ${effort} > span {
        font: 400 14px/18px var(--hcv-ui-font);
      }
      ${active} ${effort} > span {
        color: var(--hcv-muted);
      }
      ${active} ${effort}[data-hcv-effort-ultra] > span { color: #924ff7; }
      ${active} :is(${regularPill}, ${effort}):is(:hover, [aria-expanded="true"]):not(:disabled),
      ${active} ${regularPill}:has(+ ${effortButton}:is(:hover, [aria-expanded="true"]):not(:disabled)),
      ${active} ${regularPill}:is(:hover, [aria-expanded="true"]):not(:disabled) + ${effortButton} {
        background-color: var(--chrome-action-hover) !important;
      }
      ${active} :is(${regularPill}, ${effort}):focus-visible {
        outline: 2px solid var(--hcv-focus);
        outline-offset: -2px;
      }
      ${active} ${regularPill} > svg, ${active} ${effort} > svg { display: none; }
      ${active} ${speedOption} > [role="switch"] { position: relative; width: 16px; height: 16px; border: 0; box-shadow: none; background: transparent !important; }
      ${active} ${speedOption} > [role="switch"] > * { display: none; }
      ${active} ${speedOption} > [role="switch"][aria-checked="true"]::after { content: ''; position: absolute; inset: 0; background: currentColor; mask: ${codexMask('check')} center / contain no-repeat; }
      ${active} ${modelOptions} ${standardSpeed}:not([aria-disabled="true"]):is(:hover, :focus-visible) { background: var(--hcv-dropdown-hover); }
      ${active} ${standardSpeed}[aria-checked="true"]::after { content: ''; margin-inline-start: auto; inline-size: 16px; block-size: 16px; background: currentColor; mask: ${codexMask('check')} center / contain no-repeat; }
    }
    @media (forced-colors: active) {
      ${active} ${modelOptions} ${speedOption} { grid-template-columns: minmax(0, 1fr) auto; }
      ${active} ${pill}[data-hcv-model-speed]::before { background: ButtonText; forced-color-adjust: none; }
      ${active} ${standardSpeed}:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
      ${active} ${standardSpeed}[aria-checked="true"]::after { content: '✓'; margin-inline-start: auto; }
    }
  `)
  ctx.onDispose(() => {
    disposed = true
    mounts.disconnect(); theme.disconnect(); cancelAnimationFrame(frame)
    document.removeEventListener('click', activate, true)
    document.removeEventListener('keydown', activate, true)
    for (const node of observed) node.disconnect()
    for (const off of subscriptions) off()
    unsubscribeCatalog?.()
    resetPresentation()
  })
  sync()
}
