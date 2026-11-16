import { codexMask } from './codex-reference.js'
import { committedFiber } from './sidebar-recents.js'
import { chatStyles, mountCSS } from './style-scope.js'

const scope = '[data-chat-surface]:not([data-hud-shell] *) [data-slot="aui_assistant-message-content"]'
const candidate = 'div:has(> span[title$="SKILL.md" i]):has(> button:last-child)'
const marked = '[data-hcv-skill-card]'
const link = '[data-hcv-skill-link]'
const label = '[data-hcv-skill-label]'
const preview = card => card.querySelector(':scope > button:last-child')

function plainText(value, depth = 0) {
  if (typeof value === 'string') return value
  if (depth > 4) return ''
  if (Array.isArray(value)) return value.map(child => plainText(child, depth + 1)).join('')
  return plainText(value?.props?.children, depth + 1)
}

function displayName(value) {
  const text = plainText(value).trim()
  if (!text.startsWith('$')) return text
  const question = text.indexOf('?')
  if (question < 0) return text.slice(1)
  const fields = new URLSearchParams(text.slice(question + 1))
  return fields.get('label')?.trim() || (fields.has('label') || fields.has('icon') ? text.slice(1, question) : text.slice(1))
}

function skillLinkInfo(card) {
  // MarkdownLink renders native file previews and passes their original
  // target to PreviewAttachment. Use the Markdown's own label if provided.
  let target = ''
  for (let node = committedFiber(card)?.return; node && !(node.stateNode instanceof Element); node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.target === 'string') target ||= props.target
    if (target && typeof props?.href === 'string') {
      const leaf = /(?:^|[\\/])SKILL\.md$/i.test(target)
      const file = /^(?:file:\/\/\/|[a-z]:[\\/]|\/(?!\/)|~[\\/]|\.{1,2}[\\/])/i.test(target)
      if (!leaf || !file || !preview(card)) return null
      const name = displayName(props.children) ||
        target.split(/[\\/]/).at(-2) || 'SKILL.md'
      return { name, target }
    }
  }
  return null
}

export function registerChatSkills(ctx, active) {
  const cardCSS = `${active} ${scope} ${marked}`
  const linkCSS = `${cardCSS} > ${link}`
  mountCSS(ctx, 'data-hcv-chat-skill-style', `
    ${cardCSS} { display: contents; }
    ${cardCSS} > :not(${link}) { display: none !important; }
    ${linkCSS} {
      display: inline; padding: 0; color: light-dark(#0169cc, #99ceff) !important;
      font-weight: 500; white-space: nowrap; cursor: pointer; text-decoration: none !important;
    }
    ${linkCSS} > ${label} { white-space: normal; overflow-wrap: break-word; }
    ${linkCSS} > [aria-hidden] {
      box-sizing: content-box; vertical-align: middle; align-items: center; display: inline-flex;
      block-size: 1em; padding-inline-end: 3px; transform: translateY(calc(.5ex - .5cap));
    }
    ${linkCSS} > [aria-hidden]::before {
      content: ""; inline-size: 16px; block-size: 16px; background: currentColor;
      mask: ${codexMask('chatSkill')} center / contain no-repeat;
    }
    ${linkCSS}:is(:hover, :focus-visible) > ${label} { text-decoration: underline; text-underline-offset: 2px; }
    ${linkCSS}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; border-radius: 2px; }
    @media (forced-colors: active) { ${linkCSS} > [aria-hidden]::before { background: LinkText; forced-color-adjust: none; } }
  `, chatStyles)

  const pending = new Set()
  let frame = 0
  function clear(card) {
    card.querySelector(`:scope > ${link}`)?.remove()
    card.removeAttribute('data-hcv-skill-card')
  }
  function update(card) {
    const info = skillLinkInfo(card)
    if (!info) return clear(card)
    let anchor = card.querySelector(`:scope > ${link}`)
    if (!anchor) {
      anchor = document.createElement('a')
      anchor.setAttribute('data-hcv-skill-link', '')
      const icon = document.createElement('span')
      icon.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.setAttribute('data-hcv-skill-label', '')
      anchor.append(icon, text)
      const open = event => {
        event.preventDefault()
        preview(card)?.click()
      }
      anchor.addEventListener('click', open)
      anchor.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.repeat) open(event)
      })
      // Keep the native preview button mounted and let it resolve the path
      // against the owning chat. The inline link is its sole visible control.
      card.prepend(anchor)
    }
    const href = '#preview/' + encodeURIComponent(info.target)
    if (anchor.getAttribute('href') !== href) {
      anchor.setAttribute('href', href)
      anchor.title = info.target
    }
    if (anchor.lastChild.textContent !== info.name) anchor.lastChild.textContent = info.name
    card.setAttribute('data-hcv-skill-card', '')
  }
  function collect(node) {
    if (!(node instanceof Element) || node.closest(link)) return
    const card = node.closest(`:is(${candidate}, ${marked})`)
    if (card?.closest(scope)) pending.add(card)
    if (node.closest(scope) || node.querySelector(scope)) {
      for (const entry of node.querySelectorAll(candidate)) if (entry.closest(scope)) pending.add(entry)
    }
  }
  function flush() {
    frame = 0
    for (const card of pending) if (card.isConnected && card.closest(scope)) update(card)
    pending.clear()
  }
  const schedule = () => {
    if (pending.size && !frame) frame = requestAnimationFrame(flush)
  }
  const enabled = () => document.documentElement.matches(active)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') collect(record.target)
      else for (const node of record.addedNodes) collect(node)
    }
    schedule()
  })
  function sync() {
    observer.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    pending.clear()
    if (enabled()) {
      collect(document.body)
      schedule()
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
    } else {
      for (const card of document.querySelectorAll(marked)) clear(card)
    }
  }
  const theme = new MutationObserver(sync)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  sync()
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    cancelAnimationFrame(frame)
    pending.clear()
    for (const card of document.querySelectorAll(marked)) clear(card)
  })
}
