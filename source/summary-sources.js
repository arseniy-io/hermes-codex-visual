import { useEffect, useState } from 'react'
import { previewResourceCard } from './chat-resources.js'

export { CompactSummaryItems, CompactSources, SourcesPane, registerSummarySources } from './summary-sources-view.js'

const transcript = '[data-slot="aui_thread-content"]'
const filePreview = `[data-slot="aui_assistant-message-content"] ${previewResourceCard} > button:last-child`
const candidates = [
  '[data-slot="aui_directive-chip"]:is([data-ref="file"], [data-ref="folder"], [data-ref="image"], [data-ref="url"])',
  ':is([data-slot="aui_embedded-images"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-image"]) img',
  '[data-slot="aui_artifact-card"]:is(button, a[href])',
  filePreview,
  '.aui-md a[href]',
].join(', ')
const directiveKinds = new Map([['file', 'artifacts'], ['folder', 'folder'], ['image', 'image']])
const sourceNodes = 'a[href], img, [data-slot="aui_directive-chip"], [data-slot="aui_artifact-card"], svg.tabler-icon-device-desktop-analytics'
const sourceContainer = 'a[href], [data-slot="aui_directive-chip"], [data-slot="aui_artifact-card"], div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics)'
const userMessage = '[data-slot="aui_user-message-root"]'
const userAttachment = userMessage + ' + div:not([data-slot]):has(> [data-slot="aui_directive-text"])'

function httpLink(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

function isPullRequest(link) {
  return link?.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(link.pathname) ||
    link?.hostname === 'gitlab.com' && /\/-\/merge_requests\/\d+\/?$/.test(link.pathname)
}

function sourceFrom(node) {
  // Hermes renders attachment rows next to the sticky user bubble.
  const attached = Boolean(node.closest(userMessage + ', ' + userAttachment))
  if (node instanceof HTMLImageElement) {
    const action = node.closest('button')
    const src = node.currentSrc || node.getAttribute('src')
    if (!action || !src || !node.complete || !node.naturalWidth) return null
    // Reuse an image Hermes already resolved. Never fetch a remote thumbnail
    // simply because there is an external link in the conversation.
    const thumbnail = /^(?:blob:|file:|hermes-[a-z-]+:|data:image\/(?:png|jpe?g|gif|webp|avif|bmp);)/i.test(src) ? src : null
    const alt = node.alt.trim() || action.title?.trim() || ''
    const path = /^(?:[a-z]:[/\\]|[/\\])/i.test(alt) ? alt : null
    const name = path ? path.split(/[/\\]/).at(-1) : alt
    const section = !attached && node.closest('[data-slot="aui_generated-image"]') ? 'outputs' : undefined
    return { kind: 'image', key: src, name, meta: path, thumbnail, attached, action, section }
  }

  if (node.matches(filePreview)) {
    const label = node.parentElement?.querySelector(':scope > span[title]')
    const name = label?.textContent.trim()
    return name ? { kind: 'artifacts', key: label.title, name, meta: label.title, attached, action: node,
      section: attached ? undefined : 'outputs' } : null
  }
  const reference = node.dataset.directiveId
  const kind = directiveKinds.get(node.dataset.ref) ||
    (node.dataset.slot === 'aui_artifact-card' ? 'artifacts' : 'link')
  const link = kind === 'link' && httpLink(node.getAttribute('href') || reference)
  if (kind === 'link' && !link) return null
  const label = node.querySelector('.truncate')?.textContent.trim() || node.textContent.trim() || link?.hostname || null
  const name = kind === 'folder' && label && label === reference
    ? label.split(/[/\\]/).filter(Boolean).at(-1) || label : label
  const action = node.matches('button, a[href]') ? node : null
  const section = isPullRequest(link) ? 'pullRequests'
    : !attached && node.dataset.slot === 'aui_artifact-card' ? 'outputs' : undefined
  return { kind, key: reference || link?.href || name, name, meta: link?.href || reference, attached, action, section }
}

export function useChatSources(getChat, scopeKey, enabled) {
  const [snapshot, setSnapshot] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let chat = null
    let body = null
    // Text changes inside a source must update its label, without observing
    // every streamed text node in the rest of the conversation.
    const labels = new MutationObserver(queue)
    const content = new MutationObserver(records => {
      if (records.some(({ type, target, addedNodes, removedNodes }) =>
        (type === 'attributes' && target.matches('a, img')) ||
        target.closest(sourceContainer) ||
        [addedNodes, removedNodes].some(nodes => Array.prototype.some.call(nodes, node =>
          node instanceof Element && (node.matches(sourceNodes) || node.querySelector(sourceNodes)),
        )))) queue()
    })
    // The primary chat is replaced by navigation. Only the mounted transcript
    // is scanned; there is no separate history, file or network request.
    const mounts = new MutationObserver((records) => {
      if (!chat?.isConnected || !body?.isConnected || records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some((node) =>
          node instanceof Element && (node.matches(transcript) || node.querySelector(transcript)),
        ))) queue()
    })
    function collect() {
      frame = 0
      chat = getChat()
      const next = chat?.querySelector(transcript)
      if (next !== body) {
        content.disconnect()
        body?.removeEventListener('load', queue, true)
        body = next
        if (body) {
          content.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'alt', 'title'] })
          body.addEventListener('load', queue, true)
        }
      }
      const unique = new Map()
      const nodes = [...(body?.querySelectorAll(candidates) || [])]
      labels.disconnect()
      for (const node of nodes) {
        // The label of a file preview sits next to its action button.
        const label = node.matches(filePreview) ? node.parentElement : node
        if (!(node instanceof HTMLImageElement) && label) {
          labels.observe(label, { characterData: true, subtree: true })
        }
      }
      for (const node of nodes.reverse()) {
        const row = sourceFrom(node)
        const key = row && `${row.kind}:${row.key}`
        if (key && !unique.has(key)) unique.set(key, row)
      }
      const rows = [...unique.values()]
      setSnapshot((old) => old?.scopeKey === scopeKey && old.rows.length === rows.length &&
        rows.every((row, i) => row.action === old.rows[i].action && row.key === old.rows[i].key &&
          row.name === old.rows[i].name && row.thumbnail === old.rows[i].thumbnail &&
          row.kind === old.rows[i].kind && row.meta === old.rows[i].meta && row.attached === old.rows[i].attached &&
          row.section === old.rows[i].section)
        ? old : { scopeKey, rows })
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(collect)
    }
    mounts.observe(document.body, { childList: true, subtree: true })
    queue()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      mounts.disconnect()
      content.disconnect()
      labels.disconnect()
      body?.removeEventListener('load', queue, true)
    }
  }, [getChat, scopeKey, enabled])
  return enabled && snapshot?.scopeKey === scopeKey ? snapshot.rows : []
}
