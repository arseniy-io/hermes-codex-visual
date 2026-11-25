import { committedFiber } from './sidebar-recents.js'
import { previewResourceCard } from './chat-resources.js'
import { codexMask } from './codex-reference.js'
import { turnFileKey } from './turn-file-matching.js'
import { chatStyles, mountCSS } from './style-scope.js'

function safeFileKey(path, cwd) {
  if (typeof path !== 'string') return null
  let decoded = path
  if (/^file:/i.test(path)) {
    try { decoded = decodeURIComponent(path) } catch { return null }
  }
  // A parent segment can cross a symlink, so lexical normalization alone
  // cannot establish that two paths actually name the same file.
  const parent = /(?:^|[\\/])\.\.(?:[\\/]|$)/
  if (parent.test(decoded) || parent.test(cwd || '')) return null
  return turnFileKey(path, cwd)
}

// A normal prose link has its own label and stays where the author wrote it.
// MEDIA and Preview markers are standalone delivered-file cards instead.
function isDelivery(card, body) {
  for (let fiber = committedFiber(card)?.return; fiber && !(fiber.stateNode instanceof Element); fiber = fiber.return) {
    const { href, children } = fiber.memoizedProps || {}
    if (typeof href !== 'string') continue
    return /^#media:/i.test(href) || (/^#preview[:/]/i.test(href) &&
      typeof children === 'string' && /^preview\s*:/i.test(children))
  }
  return !card.closest('.aui-md') && card.parentElement?.parentElement === body
}

function deliveryContainer(card, body) {
  const wrapper = card.parentElement
  if (!wrapper || !(wrapper.matches('p') || wrapper.parentElement === body)) return null
  const nodes = [...wrapper.childNodes]
  const whitespace = node => node.nodeType === Node.TEXT_NODE && !node.textContent.trim()
  if (nodes.every(node => node === card || whitespace(node))) return wrapper
  // Several delivered cards may share one paragraph. Hide only this card if
  // every other child is another card or whitespace; never drop prose.
  return nodes.every(node => whitespace(node) || (node instanceof Element && node.matches(previewResourceCard)))
    ? card : null
}

function deliveries(files, cwd) {
  const root = files.card.closest('[data-slot="aui_assistant-message-root"]')
  const body = root?.querySelector(':scope > [data-slot="aui_assistant-message-content"]')
  if (!body) return []
  const matches = []
  for (const card of body.querySelectorAll(previewResourceCard)) {
    const target = card.querySelector(':scope > span.truncate[title]')?.getAttribute('title')
    const preview = card.querySelector(':scope > button:last-child')
    const secondary = card.querySelector(':scope > button:not(:last-child)')
    const wrapper = deliveryContainer(card, body)
    const key = safeFileKey(target, cwd)
    if (key && preview && secondary && wrapper && isDelivery(card, body)) {
      matches.push({ card, wrapper, preview, secondary, target, key })
    }
  }
  return matches
}

function matchingDelivery(files, path, cwd) {
  const key = safeFileKey(path, cwd)
  if (!key) return null
  const matches = deliveries(files, cwd).filter(candidate => candidate.key === key)
  return matches.length === 1 ? matches[0] : null
}

export function clearTurnFilePreview(files) {
  const focused = document.activeElement === files.previewLink || document.activeElement === files.previewSecondary
  files.previewDelivery?.wrapper.removeAttribute('data-hcv-merged-preview-wrapper')
  if (focused) files.previewDelivery?.preview.focus({ preventScroll: true })
  files.previewLink?.remove()
  files.previewSecondary?.remove()
  files.previewDelivery = null
  files.previewLink = null
  files.previewSecondary = null
}

export function syncTurnFilePreview(files, path, cwd, basename, russian) {
  const found = path && matchingDelivery(files, path, cwd)
  if (!found) return clearTurnFilePreview(files)
  if (files.previewDelivery?.wrapper !== found.wrapper || !files.previewLink?.isConnected) {
    clearTurnFilePreview(files)
    const link = document.createElement('button')
    link.type = 'button'
    link.setAttribute('data-hcv-generated', '')
    link.setAttribute('data-hcv-files-preview', '')
    link.addEventListener('click', () => files.previewDelivery?.preview.click())
    const secondary = document.createElement('button')
    secondary.type = 'button'
    secondary.setAttribute('data-hcv-generated', '')
    secondary.setAttribute('data-hcv-files-preview-secondary', '')
    secondary.addEventListener('click', () => files.previewDelivery?.secondary.click())
    files.previewLink = link
    files.previewSecondary = secondary
    files.name.replaceChildren(document.createTextNode(russian ? 'Изменён ' : 'Edited '), link, secondary)
  }
  files.previewDelivery = found
  found.wrapper.setAttribute('data-hcv-merged-preview-wrapper', '')
  const link = files.previewLink
  const prefix = russian ? 'Изменён ' : 'Edited '
  if (link.previousSibling?.nodeType === Node.TEXT_NODE && link.previousSibling.data !== prefix) {
    link.previousSibling.data = prefix
  }
  if (link.textContent !== basename) link.textContent = basename
  link.title = found.target
  link.disabled = found.preview.disabled
  link.setAttribute('aria-label', russian ? `Открыть файл ${basename}` : `Open file ${basename}`)
  const secondary = files.previewSecondary
  const secondaryLabel = found.secondary.getAttribute('aria-label') || found.secondary.textContent.trim()
  secondary.setAttribute('aria-label', secondaryLabel)
  secondary.title = secondaryLabel
  secondary.disabled = found.secondary.disabled
  secondary.dataset.kind = found.secondary.querySelector('svg.tabler-icon-folder-open') ? 'folder' : 'download'
}

function clearRowPreview(entry) {
  const focused = entry.actions.contains(document.activeElement)
  entry.delivery.wrapper.removeAttribute('data-hcv-merged-preview-wrapper')
  if (focused) entry.delivery.preview.focus({ preventScroll: true })
  window.clearTimeout(entry.blurTimer)
  entry.row.removeEventListener('focus', entry.onFocus)
  entry.row.removeEventListener('blur', entry.onBlur)
  entry.actions.removeEventListener('focusin', entry.onFocus)
  entry.actions.removeEventListener('focusout', entry.onBlur)
  entry.row.removeAttribute('data-hcv-file-preview-row')
  entry.actions.remove()
}

export function clearTurnFilePreviewRows(files) {
  for (const entry of files.previewRows?.values() || []) clearRowPreview(entry)
  files.previewRows?.clear()
  for (const row of files.previewGridRows || []) row.style.removeProperty('--hcv-file-grid-row')
  files.previewGridRows = null
  files.card.children[1]?.removeAttribute('data-hcv-file-preview-list')
}

export function syncTurnFilePreviewRows(files, rows, cwd, russian) {
  const candidates = deliveries(files, cwd)
  const entries = new Map()
  const rowKeys = new Map()
  const cardKeys = new Map()
  for (const item of rows) {
    const key = safeFileKey(item.path, cwd)
    if (!key) continue
    const list = rowKeys.get(key) || []
    list.push(item)
    rowKeys.set(key, list)
  }
  for (const candidate of candidates) {
    const list = cardKeys.get(candidate.key) || []
    list.push(candidate)
    cardKeys.set(candidate.key, list)
  }
  for (const [key, sameRows] of rowKeys) {
    const sameCards = cardKeys.get(key) || []
    if (sameRows.length === 1 && sameCards.length === 1) {
      entries.set(sameRows[0].row, { item: sameRows[0], delivery: sameCards[0] })
    }
  }
  const list = files.card.children[1]
  if (!list || !entries.size) return clearTurnFilePreviewRows(files)
  files.previewRows ||= new Map()
  for (const [row, entry] of files.previewRows) {
    if (entries.get(row)?.delivery.wrapper === entry.delivery.wrapper && row.isConnected) continue
    clearRowPreview(entry)
    files.previewRows.delete(row)
  }
  const currentRows = new Set(rows.map(item => item.row))
  for (const row of files.previewGridRows || []) if (!currentRows.has(row)) row.style.removeProperty('--hcv-file-grid-row')
  files.previewGridRows = currentRows
  list.setAttribute('data-hcv-file-preview-list', '')
  rows.forEach((item, index) => {
    item.row.style.setProperty('--hcv-file-grid-row', String(index + 1))
    const match = entries.get(item.row)
    if (!match) return
    let entry = files.previewRows.get(item.row)
    if (!entry) {
      const actions = document.createElement('div')
      actions.setAttribute('data-hcv-generated', '')
      actions.setAttribute('data-hcv-file-row-actions', '')
      const preview = document.createElement('button')
      preview.type = 'button'
      preview.setAttribute('data-hcv-file-row-preview', '')
      const secondary = document.createElement('button')
      secondary.type = 'button'
      secondary.setAttribute('data-hcv-file-row-secondary', '')
      actions.append(preview, secondary)
      entry = { row: item.row, actions, preview, secondary, delivery: match.delivery }
      entry.onFocus = () => {
        window.clearTimeout(entry.blurTimer)
        entry.actions.setAttribute('data-hcv-file-row-focused', '')
      }
      entry.onBlur = () => {
        window.clearTimeout(entry.blurTimer)
        entry.blurTimer = window.setTimeout(() => {
          if (document.activeElement !== entry.row && !entry.actions.contains(document.activeElement)) {
            entry.actions.removeAttribute('data-hcv-file-row-focused')
          }
        }, 0)
      }
      entry.row.addEventListener('focus', entry.onFocus)
      entry.row.addEventListener('blur', entry.onBlur)
      actions.addEventListener('focusin', entry.onFocus)
      actions.addEventListener('focusout', entry.onBlur)
      preview.addEventListener('click', () => entry.delivery.preview.click())
      secondary.addEventListener('click', () => entry.delivery.secondary.click())
      files.previewRows.set(item.row, entry)
    }
    entry.delivery = match.delivery
    entry.actions.style.setProperty('--hcv-file-grid-row', String(index + 1))
    if (item.row.nextElementSibling !== entry.actions) item.row.after(entry.actions)
    item.row.setAttribute('data-hcv-file-preview-row', '')
    match.delivery.wrapper.setAttribute('data-hcv-merged-preview-wrapper', '')
    const displayPath = item.path || item.basename
    const previewLabel = russian ? `Открыть файл ${displayPath}` : `Open file ${displayPath}`
    entry.preview.setAttribute('aria-label', previewLabel)
    entry.preview.title = previewLabel
    entry.preview.disabled = match.delivery.preview.disabled
    const secondaryLabel = match.delivery.secondary.getAttribute('aria-label') || match.delivery.secondary.textContent.trim()
    entry.secondary.setAttribute('aria-label', `${secondaryLabel} (${displayPath})`)
    entry.secondary.title = secondaryLabel
    entry.secondary.disabled = match.delivery.secondary.disabled
    entry.secondary.dataset.kind = match.delivery.secondary.querySelector('svg.tabler-icon-folder-open') ? 'folder' : 'download'
  })
}

export function registerTurnFilePreviewStyle(ctx, active) {
  const chat = `${active} [data-chat-surface]`
  const card = `${chat} [data-slot="aui_changed-files"][data-hcv-file-card]`
  mountCSS(ctx, 'data-hcv-turn-file-preview-style', `
    ${chat} [data-hcv-merged-preview-wrapper] { display: none !important; }
    ${chat} p:has(> [data-hcv-merged-preview-wrapper]):not(:has(> :not([data-hcv-merged-preview-wrapper]))) {
      display: none !important;
    }
    ${card} [data-hcv-files-title]:has(> [data-hcv-files-preview]) {
      display: flex; align-items: baseline;
    }
    ${card} [data-hcv-files-preview] {
      position: relative; z-index: 2; pointer-events: auto; flex: 0 1 auto; min-inline-size: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-inline-start: .25em;
      padding: 0; border: 0; background: transparent; color: inherit;
      font: inherit; text-align: start;
    }
    ${card} [data-hcv-files-preview-secondary] {
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      visibility: hidden; pointer-events: none; inline-size: 0; block-size: 0; padding: 0;
      border: 0; background: transparent; color: var(--hcv-file-description);
    }
    ${card} [data-hcv-files-title]:is(:hover, :focus-within) > [data-hcv-files-preview-secondary] {
      visibility: visible; pointer-events: auto; inline-size: 20px; block-size: 20px; margin-inline-start: 3px;
    }
    ${card} [data-hcv-files-preview-secondary]::before {
      content: ''; inline-size: 14px; block-size: 14px; background: currentColor;
      mask: ${codexMask('download')} center / contain no-repeat;
    }
    ${card} [data-hcv-files-preview-secondary][data-kind="folder"]::before {
      mask-image: ${codexMask('folderOpen')};
    }
    @media (hover: none) {
      ${card} [data-hcv-files-preview-secondary] {
        visibility: visible; pointer-events: auto; inline-size: 20px; block-size: 20px; margin-inline-start: 3px;
      }
    }
    ${card} > [data-hcv-file-preview-list] {
      display: grid; grid-template-columns: minmax(0, 1fr) auto;
    }
    ${card} > [data-hcv-file-preview-list] > button {
      grid-column: 1 / -1; grid-row: var(--hcv-file-grid-row);
    }
    ${card} [data-hcv-file-row-actions] {
      grid-column: 2; grid-row: var(--hcv-file-grid-row); z-index: 2; align-self: center;
      display: flex; visibility: hidden; pointer-events: none; padding-inline-end: 8px;
    }
    ${card} [data-hcv-file-row-actions] > button {
      display: inline-flex; align-items: center; justify-content: center; inline-size: 22px; block-size: 22px;
      padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--hcv-file-description);
    }
    ${card} [data-hcv-file-row-actions] > button:hover { background: var(--hcv-file-hover); }
    ${card} [data-hcv-file-row-actions] > button::before {
      content: ''; inline-size: 14px; block-size: 14px; background: currentColor;
      mask: ${codexMask('inlineFileDocument')} center / contain no-repeat;
    }
    ${card} [data-hcv-file-row-secondary]::before { mask-image: ${codexMask('download')}; }
    ${card} [data-hcv-file-row-secondary][data-kind="folder"]::before { mask-image: ${codexMask('folderOpen')}; }
    ${card} [data-hcv-file-preview-row]:is(:hover, :focus-visible) + [data-hcv-file-row-actions],
    ${card} [data-hcv-file-row-actions]:is(:hover, :focus-within, [data-hcv-file-row-focused]) { visibility: visible; pointer-events: auto; }
    ${card} [data-hcv-file-preview-row]:is(:hover, :focus-visible) [data-hcv-files-totals],
    ${card} [data-hcv-file-preview-row]:has(+ [data-hcv-file-row-actions]:is(:hover, :focus-within, [data-hcv-file-row-focused])) [data-hcv-files-totals] {
      visibility: hidden;
    }
    ${card} [data-hcv-file-preview-row]:is(:hover, :focus-visible) [data-hcv-file-path],
    ${card} [data-hcv-file-preview-row]:has(+ [data-hcv-file-row-actions]:is(:hover, :focus-within, [data-hcv-file-row-focused])) [data-hcv-file-path] {
      padding-inline-end: 44px;
    }
    ${card}[data-hcv-files-foldable]:not([data-hcv-files-open]) > [data-hcv-file-preview-list] > button:nth-of-type(n + 4) + [data-hcv-file-row-actions] {
      display: none;
    }
    @media (hover: none) {
      ${card} [data-hcv-file-row-actions] { visibility: visible; pointer-events: auto; }
      ${card} [data-hcv-file-preview-row] { padding-inline-end: 52px; }
    }
  `, chatStyles)
}
