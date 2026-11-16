import { mountStyle } from './style-scope.js'
import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { registerChatImages } from './chat-images.js'
import { registerChatSkills } from './chat-skills.js'
import { activityPresentation } from './chat-activity-labels.js'

const surface = '[data-chat-surface]:not([data-hud-shell] *)'
const rowSelector = '[data-tool-row][data-slot="tool-block"]'
const summarySelector = '[data-tool-group] > [data-tool-summary]'
const activitySelector = `${rowSelector}, ${summarySelector}`
const iconAttribute = 'data-hcv-activity-icon'
const nativeLabel = 'data-hcv-activity-native-label'
const customLabel = 'data-hcv-activity-label'
const favicon = 'data-hcv-activity-favicon'
const toolIcons = new Map([
  ['terminal', 'activityTerminal'], ['execute_code', 'activityTerminal'],
  ['read_file', 'activityRead'], ['list_files', 'folder'],
  ['search_files', 'activitySearch'], ['web_search', 'activitySearch'], ['session_search_recall', 'activitySearch'],
  ['write_file', 'activityEdit'], ['edit_file', 'activityEdit'], ['patch', 'activityEdit'],
  ['vision_analyze', 'activityImage'], ['image_generate', 'activityImage'],
])

function nativeIcon(entry, part) {
  if (entry.hasAttribute('data-tool-summary')) {
    // ToolRunHeader receives the native, category-ordered run summary.
    // These verbs are constants in Hermes run-summary.ts, independent of locale.
    const verb = entry.querySelector('button')?.textContent.trim().split(/\s/, 1)[0]
    if (['Edited', 'Editing'].includes(verb)) return 'activityEdit'
    if (['Explored', 'Exploring'].includes(verb)) return 'activityRead'
    if (['Ran', 'Running'].includes(verb)) return 'activityTerminal'
    if (['Used', 'Using'].includes(verb)) return 'activityIntegration'
    return null
  }
  const name = part?.toolName
  return toolIcons.get(name) ?? (name?.startsWith('mcp_') ? 'activityIntegration' : null)
}

function runParts(summary) {
  // ToolRun has its slice indices even while the individual rows are unmounted.
  // Read that message's scope, which also works for background chat panes.
  let first, last
  for (let fiber = committedFiber(summary.parentElement); fiber; fiber = fiber.return) {
    if (fiber.stateNode instanceof Element && fiber.stateNode.hasAttribute('data-role')) break
    const props = fiber.memoizedProps
    if (first === undefined && Number.isInteger(props?.startIndex) && Number.isInteger(props?.endIndex)) {
      first = Math.max(0, props.startIndex)
      last = props.endIndex
    }
    if (first === undefined) continue
    for (let context = fiber.dependencies?.firstContext; context; context = context.next) {
      const client = context.memoizedValue
      if (!client?.message?.source) continue
      try {
        const { content } = client.message().__internal_getRuntime()?.getState() || {}
        if (Array.isArray(content)) return content.slice(first, last + 1).filter(part => part.type === 'tool-call')
      } catch { /* A detached or unrecognized message scope keeps native copy. */ }
    }
  }
  return []
}

const findTitle = (entry, summary) => (summary ? entry : entry.firstElementChild)
  ?.querySelector(':scope > div > button > span:first-child > span:first-child')

export function registerChatActivity(ctx, active) {
  const chat = `${active} ${surface}`
  const row = `${chat} ${rowSelector}`
  const summary = `${chat} ${summarySelector}`
  const group = `${chat} [data-tool-group][data-slot="tool-block"]`
  const toggle = `:is(${row} > :first-child, ${summary}) > div > button`
  const title = `${toggle} > span:first-child > span:first-child`
  const glyph = `${title} > span:first-child:has(> :is(svg, .codicon, [role="status"]))`
  const caret = `${toggle}[aria-expanded] > span:nth-child(2) > .codicon-chevron-right`
  const output = `${row}[data-tool-open]:not([data-file-edit]) > :nth-child(2)`
  const preview = `${output} > div:has(> [data-slot="aui_markdown-image"])`
  const thumb = `${preview} [data-slot="aui_markdown-image"]:has(img)`
  const copy = `${output} > button[class~="group-hover/tool-block:opacity-100"]`
  const icons = [...new Set([...toolIcons.values(), 'activityIntegration', 'activityBrowser', 'chatSkill'])]

  const style = document.createElement('style')
  style.setAttribute('data-hcv-chat-activity-style', '')
  style.textContent = `
@media (forced-colors: none) {
  ${chat} {
    --hcv-activity-text: light-dark(#5d5d5d, #8b8b8b);
    --hcv-activity-glyph: color-mix(in oklab, var(--hcv-text) 60%, transparent);
    --hcv-activity-border: light-dark(#0d0d0d1a, #ffffff1f);
    --hcv-activity-font: var(--codex-chat-font-size, 14px);
    --hcv-activity-mono: ui-monospace, "SFMono-Regular", "SF Mono", menlo, consolas, "Liberation Mono", monospace;
  }
  :is(${row}, ${summary}) {
    --conversation-tool-font-size: var(--hcv-activity-font);
    --conversation-scaffold-text: var(--hcv-activity-text);
    --conversation-scaffold-meta: var(--hcv-activity-text);
    --ui-text-tertiary: var(--hcv-activity-text);
    opacity: 1;
    font-family: ${codex.font};
    font-weight: 430;
    line-height: 1.5;
  }
  ${row}:not([data-file-edit]), ${row}:not([data-file-edit]) > :first-child {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }
  ${group}, ${group} > div:has(> ${rowSelector}) { --tool-row-gap: 4px; }
  ${summary}:has(button[aria-expanded="true"]) + div:not([data-tool-ticker]) {
    margin-block-start: 4px;
    margin-inline-start: 8px;
    padding-inline-start: 16px;
    border-inline-start: 1px solid var(--hcv-activity-border);
  }
  ${toggle} { align-items: start; gap: 4px; padding: 0; border-radius: 6px; }
  ${toggle}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${toggle}:not(:disabled):is(:hover, :focus-visible) { --conversation-scaffold-text: var(--hcv-text); }
  ${title} { gap: 8px; }
  ${glyph} { inline-size: 16px; block-size: 16px; color: var(--hcv-activity-glyph); }
  ${title} > [${nativeLabel}] { display: none; }
  ${title} > [${customLabel}] {
    display: block; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: var(--hcv-activity-font); line-height: 1.5; color: var(--conversation-scaffold-text);
  }
  ${title} > img[${favicon}] {
    inline-size: 16px; block-size: 16px; flex: none; border-radius: 4px; object-fit: contain;
  }
  ${title}:has(> img[${favicon}]) > span:first-of-type:has(> :is(svg[aria-hidden="true"], .codicon)) { display: none; }
  ${glyph} > :is(svg, .codicon):not([aria-label]) { color: inherit; }
  ${caret} { inline-size: 12px !important; block-size: 12px !important; color: var(--hcv-activity-glyph); }
  ${codexIconRules(caret, 'right')}
  ${toggle}[aria-expanded="true"] > span:nth-child(2) { opacity: 1; }
  ${icons.map(icon => `
    ${chat} [${iconAttribute}="${icon}"] { --hcv-activity-icon: ${codexMask(icon)}; }
  `).join('')}
  ${glyph}:is(${row}[${iconAttribute}] *) > :is(svg[aria-hidden="true"], .codicon):not([aria-label]) {
    inline-size: 16px !important;
    block-size: 16px !important;
    background-color: currentColor;
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${glyph}:is(${row}[${iconAttribute}] *) > svg[aria-hidden="true"] > *,
  ${glyph}:is(${row}[${iconAttribute}] *) > .codicon:not([aria-label])::before { visibility: hidden; }
  :is(
    ${title}:is(${summary}[${iconAttribute}] *),
    ${title}:is(${row}[${iconAttribute}] *):not(:has(> span:first-child > :is(svg, .codicon, [role="status"])))
  ):not(:has(> img[${favicon}]))::before {
    content: "";
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    background: var(--hcv-activity-glyph);
    mask: var(--hcv-activity-icon) center / contain no-repeat;
  }
  ${output} { margin-block-start: 4px; padding: 0; gap: 4px; }
  ${output} :is(pre, code, .font-mono) { font-family: var(--hcv-activity-mono); font-size: 12px; line-height: 1.5; }
  ${output} pre, ${output} > .font-mono {
    border: 0;
    border-radius: 6px;
    background: var(--hcv-hover);
    padding: 8px 12px;
  }
  ${output}:has(> button) pre, ${output}:has(> button) > .font-mono { padding-inline-end: 36px; }
  ${output} > button { inset-block-start: 4px; inset-inline-end: 8px; color: var(--hcv-activity-text); }
  /* PuGl in 720744.158c9ed7b0.js uses a hover/focus copy action with duration-basic. */
  ${codexIconRules(`${copy} > svg.tabler-icon-copy`, 'copy')}
  ${codexIconRules(`${copy} > svg.tabler-icon-check`, 'messageCopied')}
  @media (hover: hover) {
    ${copy} { opacity: 0; }
    ${output}:hover > button[class~="group-hover/tool-block:opacity-100"], ${copy}:focus-visible { opacity: 1; }
  }
  @media (hover: none) { ${copy} { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) {
    ${copy} { transition: opacity 150ms var(--hcv-ease); }
    ${caret} { transition: transform 300ms var(--hcv-ease); }
  }
  ${preview} { border: 0; border-radius: 0; }
  ${thumb} {
    inline-size: 80px !important;
    block-size: 80px;
    aspect-ratio: 1 !important;
    margin: 0;
    border: 1px solid light-dark(#0d0d0d26, #ffffff33);
    border-radius: 10px;
  }
  ${thumb} > span { inline-size: 100%; block-size: 100%; }
  ${thumb} img { inline-size: 100%; block-size: 100%; object-fit: cover; border-radius: 8px; box-shadow: none; }
  ${thumb} [data-slot="aui_zoomable-image"] > button:has(> svg.tabler-icon-download) {
    inset-inline-end: 4px;
    inset-block-start: 4px;
    inline-size: 24px;
    block-size: 24px;
  }
  ${thumb} :focus-visible, ${thumb} button:focus-visible > img { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) { :is(${caret}, ${copy}) { transition: none; } }
}
`
  mountStyle(ctx, style, { surface: '[data-slot="tool-block"]' })

  const pending = new Set()
  const siteEntries = new WeakMap()
  const siteIcons = new Map()
  const forcedColors = window.matchMedia('(forced-colors: active)')
  const enabled = () => document.documentElement.matches(active) && !forcedColors.matches
  let frame = 0
  let disposed = false
  let connected
  function clearLabel(title) {
    title?.querySelector(`:scope > [${nativeLabel}]`)?.removeAttribute(nativeLabel)
    title?.querySelector(`:scope > [${customLabel}]`)?.remove()
  }
  function setLabel(title, value) {
    const native = title?.querySelector(':scope > span[class~="whitespace-nowrap"][class~="max-w-full"]')
    if (!native || !value || native.classList.contains('text-destructive') ||
      native.classList.contains('text-amber-700')) return clearLabel(title)
    let label = title.querySelector(`:scope > [${customLabel}]`)
    if (!label) {
      label = document.createElement('span')
      label.setAttribute(customLabel, '')
      native.after(label)
    }
    if (label.textContent !== value) label.textContent = value
    native.setAttribute(nativeLabel, '')
  }
  function showSite(title, data) {
    const current = title.querySelector(`:scope > img[${favicon}]`)
    if (!data) return current?.remove()
    if (current?.getAttribute('src') === data) return
    const img = current || document.createElement('img')
    img.setAttribute(favicon, '')
    img.setAttribute('aria-hidden', 'true')
    img.alt = ''
    img.draggable = false
    img.src = data
    if (!current) title.prepend(img)
  }
  // The desktop already resolves and caches site icons. Resolve the origin
  // once, only from visible browser activity, never from message prose.
  const sites = new IntersectionObserver(records => {
    for (const { target: entry, isIntersecting } of records) {
      if (!isIntersecting || !enabled()) continue
      sites.unobserve(entry)
      const state = siteEntries.get(entry)
      const resolve = window.hermesDesktop?.resolveFavicon
      if (!state || !resolve) continue
      let task = siteIcons.get(state.site)
      if (!task) {
        if (siteIcons.size >= 64) siteIcons.delete(siteIcons.keys().next().value)
        task = Promise.resolve().then(() => resolve(state.site)).then(src =>
          /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif);base64,/i.test(src || '') ? src : '',
        ).catch(() => '')
        siteIcons.set(state.site, task)
      }
      void task.then(src => {
        if (!disposed && enabled() && entry.isConnected && siteEntries.get(entry) === state) showSite(state.title, src)
      })
    }
  })
  function setSite(entry, title, site) {
    const previous = siteEntries.get(entry)
    if (previous?.site === site && previous?.title === title) return
    if (previous) {
      showSite(previous.title, '')
      sites.unobserve(entry)
      siteEntries.delete(entry)
    }
    if (site && title) {
      siteEntries.set(entry, { site, title })
      sites.observe(entry)
    }
  }
  function collect(node) {
    if (!(node instanceof Element)) return
    const parent = node.closest(activitySelector)
    if (parent) pending.add(parent)
    else for (const entry of node.querySelectorAll(activitySelector)) pending.add(entry)
  }
  function flush() {
    frame = 0
    for (const entry of pending) {
      if (!entry.isConnected || !entry.closest(surface)) continue
      const summary = entry.hasAttribute('data-tool-summary')
      const props = committedFiber(entry)?.return?.memoizedProps
      const part = props?.part
      const live = summary ? props?.live : Boolean(part && part.result === undefined && part.completedAt == null &&
        entry.closest('[data-message-streaming="true"]'))
      const parts = summary ? runParts(entry) : part?.toolName ? [part] : []
      const view = activityPresentation(parts, live, document.documentElement.lang.toLowerCase().startsWith('ru'))
      const icon = view?.icon ?? nativeIcon(entry, part)
      if (icon) entry.setAttribute(iconAttribute, icon)
      else entry.removeAttribute(iconAttribute)
      const title = findTitle(entry, summary)
      setLabel(title, view?.label)
      setSite(entry, title, view?.site)
    }
    pending.clear()
  }
  const observer = new MutationObserver(records => {
    for (const { target, addedNodes, removedNodes } of records) {
      const entry = (target instanceof Element ? target : target.parentElement)?.closest(activitySelector)
      if (entry) pending.add(entry)
      else for (const node of addedNodes) collect(node)
      // Do not let an observed, collapsed browser row keep an old chat alive.
      for (const node of removedNodes) {
        if (!(node instanceof Element) || node.isConnected) continue
        if (siteEntries.has(node)) setSite(node)
        for (const entry of node.querySelectorAll(activitySelector)) if (siteEntries.has(entry)) setSite(entry)
      }
    }
    if (pending.size && !frame) frame = requestAnimationFrame(flush)
  })
  function clearActivity() {
    for (const entry of document.querySelectorAll(`[${iconAttribute}]`)) {
      siteEntries.delete(entry)
      entry.removeAttribute(iconAttribute)
    }
    for (const node of document.querySelectorAll(`[${nativeLabel}]`)) node.removeAttribute(nativeLabel)
    for (const node of document.querySelectorAll(`[${customLabel}], img[${favicon}]`)) node.remove()
  }
  function sync() {
    const next = enabled()
    if (connected === next) return
    connected = next
    observer.disconnect()
    sites.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    pending.clear()
    if (next) {
      collect(document.body)
      flush()
      observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    } else clearActivity()
  }
  const theme = new MutationObserver(sync)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.addEventListener(forcedColors, 'change', sync)
  sync()
  ctx.onDispose(() => {
    disposed = true
    observer.disconnect()
    theme.disconnect()
    sites.disconnect()
    cancelAnimationFrame(frame)
    clearActivity()
    style.remove()
  })
  registerChatImages(ctx, active)
  registerChatSkills(ctx, active)
}
