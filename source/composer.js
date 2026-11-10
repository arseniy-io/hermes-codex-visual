import { host } from '@hermes/plugin-sdk'
import { registerQueueAppearance, queueingPreference } from './queue.js'
import { registerComposerLayout } from './composer-layout.js'

const composer = 'form[data-slot="composer-root"]'
const editor = '[data-slot="composer-rich-input"][contenteditable="true"]'
const drawer = '[data-slot="composer-completion-drawer"][role="listbox"]'
const slashMenu = `${drawer}:has(> button > :is([data-ref="command"], [data-ref="skill"], [data-ref="theme"]))`
const queueButton = '[data-slot="composer-surface"] button[type="button"]:has(> svg.tabler-icon-layers-intersect-2)'
const voiceStartIcon = 'svg.tabler-icon-wave-sine'
const voiceStartGroup = `[data-slot="composer-surface"] span:has(> button[type="button"] > ${voiceStartIcon})`
const voiceStartItem = `[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-checkbox-item"]) > [data-slot="dropdown-menu-item"]:has(> ${voiceStartIcon})`
const menuSeparator = '[data-slot="dropdown-menu-separator"]'
const attachments = '[data-slot="composer-attachments"]'
const queuedEdit = '[data-slot="composer-surface"] [class~="bg-accent/18"]:has(> div > button + button)'
const russianGroups = {
  Session: 'Сеанс',
  Sessions: 'Сеансы',
  Configuration: 'Настройки',
  'Tools & Skills': 'Инструменты и навыки',
  Info: 'Информация',
  Exit: 'Выход',
  Commands: 'Команды',
  'Plugin commands': 'Команды плагинов',
  Skills: 'Навыки',
  Themes: 'Темы',
  Options: 'Варианты',
}

function isBusy(form) {
  const focused = host.state.focusedSessionId.get()
  if (form.dataset.tour === 'composer') {
    const primary = host.state.activeSessionId.get()
    return primary === focused ? host.state.busy.get() : host.state.busyBySession.get()[primary] === true
  }

  const target = form.closest('[data-floating-composer-target]')?.dataset.floatingComposerTarget
    ?? form.closest('[data-composer-target]')?.dataset.composerTarget
  return target === `tile:${host.state.focusedStoredSessionId.get()}` && host.state.busy.get()
}

function isSlashCommand(input) {
  if (/^\/[^\s/]*(?:\s|$)/.test(input.innerText.trimStart())) return true

  // A selected slash command lives in a non-editable chip with its raw text
  // in data-ref-text. Only a chip at the start of the draft is a command.
  const chip = input.querySelector('[data-slash-kind][data-ref-text^="/"]')
  if (!chip) return false
  const prefix = document.createRange()
  prefix.setStart(input, 0)
  prefix.setEndBefore(chip)
  return !prefix.toString().trim()
}

function shouldQueue(form, input) {
  return isBusy(form) && !form.querySelector(queuedEdit)
    && (form.querySelector(attachments) || !isSlashCommand(input))
}

function queueWithNativeShortcut(event, input) {
  event.preventDefault()
  event.stopPropagation()
  // Hermes re-reads the live editor and moves text and attachments together.
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true, cancelable: true, composed: true,
  }))
}

function registerQueueShortcut(ctx, enabled, queueing) {
  const composing = new WeakSet()
  const inputOf = event => event.target instanceof Element ? event.target.closest(editor) : null
  ctx.addEventListener(document, 'compositionstart', event => {
    const input = inputOf(event)
    if (input) composing.add(input)
  }, true)
  ctx.addEventListener(document, 'compositionend', event => {
    const input = inputOf(event)
    if (input) composing.delete(input)
  }, true)

  ctx.addEventListener(document, 'keydown', event => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.ctrlKey || event.metaKey
      || event.altKey || event.isComposing || event.keyCode === 229 || !enabled()) return

    const input = inputOf(event)
    const form = input?.closest(composer)
    if (!form) return
    composing.delete(input) // Chromium's current non-composing keydown also clears Hermes' stale flag.

    if (event.shiftKey) {
      // Avoid picking the highlighted suggestion with a line break.
      if (form.querySelector(drawer)) event.stopPropagation()
      return
    }

    const empty = !input.innerText.trim() && !form.querySelector(attachments)
    if ((queueing() || empty) && shouldQueue(form, input)) queueWithNativeShortcut(event, input)
  }, true)

  ctx.addEventListener(document, 'submit', event => {
    if (event.defaultPrevented || !enabled() || !queueing() || !event.submitter) return
    const form = event.target
    if (!(form instanceof HTMLFormElement) || !form.matches(composer) || !form.querySelector(queueButton)) return

    const input = form.querySelector(editor)
    if (input && !composing.has(input) && shouldQueue(form, input)) queueWithNativeShortcut(event, input)
  }, true)
}

function registerSlashGroups(ctx, root, enabled) {
  ctx.i18n.register({
    en: { slashGroups: Object.fromEntries(Object.keys(russianGroups).map(label => [label, label])) },
    ru: { slashGroups: russianGroups },
  })

  let form
  const translated = new Map()
  const restore = () => {
    for (const [text, { original, label }] of translated) {
      if (text.data === label) text.data = original
    }
    translated.clear()
  }

  const sync = () => {
    if (!enabled()) {
      restore()
      return
    }

    for (const text of translated.keys()) {
      if (!text.isConnected) translated.delete(text)
    }

    for (const heading of form?.querySelectorAll(`${slashMenu} > div`) ?? []) {
      const text = heading.firstChild
      if (heading.childNodes.length !== 1 || text?.nodeType !== Node.TEXT_NODE) continue
      const previous = translated.get(text)
      const original = previous?.label === text.data ? previous.original : text.data
      const group = original.trim()
      if (!Object.hasOwn(russianGroups, group)) {
        translated.delete(text)
        continue
      }
      const label = ctx.i18n.t(`slashGroups.${group}`)
      if (text.data !== label) text.data = label
      if (label !== original) translated.set(text, { original, label })
      else translated.delete(text)
    }
  }

  const observer = new MutationObserver(sync)
  const watch = node => {
    const next = node instanceof Element ? node.closest(editor)?.closest(composer) : null
    if (!next || next === form) return
    observer.disconnect()
    restore()
    form = next
    observer.observe(form, { subtree: true, childList: true, characterData: true })
    sync()
  }
  const theme = new MutationObserver(sync)
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.addEventListener(document, 'focusin', event => watch(event.target))
  ctx.i18n.onLocaleChange(sync)
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    restore()
  })
  watch(document.activeElement)
}

export function registerComposer(ctx, active) {
  const root = document.documentElement
  const enabled = () => root.matches(active)
  const menu = `${active} ${composer} [data-slot="composer-completion-drawer"]`
  const slash = `${active} ${composer} ${slashMenu}`
  const rowTip = `${active}:has(${slashMenu} > button:is([data-state="delayed-open"], [data-state="instant-open"])) [data-slot="tooltip-content"]`
  const sheet = document.createElement('style')
  sheet.dataset.hcvComposer = ''
  sheet.textContent = `
    ${active} ${composer} ${queueButton} { display: none; }
    ${active} ${composer} ${voiceStartGroup},
    ${active} ${voiceStartItem},
    ${active} ${voiceStartItem} + ${menuSeparator},
    ${active} ${voiceStartItem} + ${menuSeparator} + ${menuSeparator} { display: none; }
    @media (forced-colors: none) {
      ${menu} {
        inline-size: min(380px, calc(100% - 16px));
        max-block-size: min(336px, calc(100dvh - 144px));
        margin-block-end: 6px;
        padding: 6px;
        border: 1px solid var(--hcv-hairline);
        border-radius: var(--hcv-menu-radius);
        background: var(--hcv-menu);
        box-shadow: var(--hcv-menu-shadow);
        color: var(--hcv-text);
        font: 400 13px/18px var(--hcv-ui-font);
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--hcv-text) 20%, transparent) transparent;
      }
      ${slash} > div:not(:has(*)) {
        padding-inline: 8px;
        text-transform: none;
        letter-spacing: normal;
        font: inherit;
        color: var(--hcv-muted);
      }
      ${slash} > button {
        gap: 8px;
        min-block-size: 28px;
        padding: 4px 8px;
        border-radius: 8px;
      }
      ${menu} > button:is(:hover, [data-highlighted]):not(:disabled) {
        background: var(--hcv-hover-menu);
      }
      ${slash} > button > [data-ref],
      ${slash} > button > span:nth-child(3) { color: var(--hcv-muted); }
      ${slash} > button > span:nth-child(2) { max-inline-size: 60%; }
      ${rowTip} {
        max-inline-size: min(240px, calc(100vw - 24px), var(--radix-tooltip-content-available-width, 240px));
      }
      ${rowTip} span:has(> [data-slot="tooltip-arrow"]) { display: none; }
    }
  `
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
  registerSlashGroups(ctx, root, enabled)
  registerComposerLayout(ctx, active)
  const queueing = () => queueingPreference(ctx)
  registerQueueShortcut(ctx, enabled, queueing)
  registerQueueAppearance(ctx, active, queueing)
}

