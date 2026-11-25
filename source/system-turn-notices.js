import { nativeRenderedMessageRecord, nativeRenderedTextPart, nativeInterruptedDelegateActivity } from './native-rendered-message.js'
import { canonicalAgentReceipt } from './agent-receipt-matching.js'
import { translateTerminalNotice, translateInterruptedChildNotice, systemTurnNoticeText, modelWaitInterruption, turnRecoveryNotice } from './system-turn-notice-copy.js'

const rootSelector = '[data-chat-surface] :is([data-slot="aui_system-message-root"], [data-slot="aui_assistant-message-root"])'
const textParts = message => {
  const parts = message?.parts ?? message?.content
  return Array.isArray(parts) ? parts.filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text).join('\n') : ''
}

function ownedHistory(history, surface, record) {
  const current = history?.forSurface ? history.forSurface(surface) : history?.current?.()
  if (!current || !record) return null
  let scope
  try { scope = JSON.parse(current.scope) } catch { return null }
  if (!Array.isArray(scope) || ![record.runtimeId, record.storedId].filter(Boolean).includes(scope[2]) ||
      ![current.sessionId, current.requestedSessionId].filter(Boolean).includes(record.storedId)) return null
  return current
}

function completionKey(connectionId, profile, runtimeId, receipt) {
  if (![connectionId, profile, runtimeId, receipt?.submission_id].every(value => typeof value === 'string' && value) ||
      !Array.isArray(receipt.row_ids) || !receipt.row_ids.length ||
      !receipt.row_ids.every(id => Number.isSafeInteger(id) && id > 0) ||
      new Set(receipt.row_ids).size !== receipt.row_ids.length ||
      !Number.isSafeInteger(receipt.user_row_id) || !receipt.row_ids.includes(receipt.user_row_id)) return null
  return JSON.stringify([connectionId, profile.trim().toLowerCase(), runtimeId,
    receipt.submission_id, receipt.user_row_id, [...receipt.row_ids].sort((a, b) => a - b)])
}

// The original text is kept in a per-node record and restored on language or
// theme change/disposal. No message store, raw transcript or clipboard is edited.
export function registerSystemTurnNotices(ctx, active, history, {
  readRecord = nativeRenderedMessageRecord, readPart = nativeRenderedTextPart,
  readChildActivity = nativeInterruptedDelegateActivity,
} = {}) {
  const changes = new Map()
  const completions = new Map()
  const diagnostics = new Set()
  const root = document.documentElement
  let disposed = false, frame = 0
  const restore = (node, change) => { if (node.data === change.shown) node.data = change.original }
  const diagnosticMarker = 'data-hcv-stop-diagnostic'
  const clear = () => {
    for (const [node, change] of changes) restore(node, change)
    changes.clear()
    for (const node of diagnostics) node.removeAttribute(diagnosticMarker)
    diagnostics.clear()
  }
  function rememberDiagnostic(node, present) {
    present.add(node)
    if (!diagnostics.has(node)) node.setAttribute(diagnosticMarker, '')
  }
  function markDiagnostic(element, text, original, context, present) {
    if (context.role !== 'assistant' || !context.interrupted || context.asyncResult || !modelWaitInterruption(original)) return
    const block = text.parentElement?.closest?.('.aui-md')
    const raw = changes.get(text)?.original ?? text.data
    if (raw !== original || block?.textContent !== text.data || !element.contains(block)) return
    rememberDiagnostic(block, present)
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; sync() }) }
  const replace = (node, original, shown, present) => {
    const previous = changes.get(node)
    const raw = previous && node.data === previous.shown ? previous.original : node.data
    if (raw !== original || shown === original) return
    changes.set(node, { original, shown })
    present.add(node)
    if (node.data !== shown) node.data = shown
  }
  function sync() {
    if (disposed) return
    if (!root.matches(active)) { clear(); return }
    const present = new Set()
    const presentDiagnostics = new Set()
    for (const element of document.querySelectorAll(rootSelector)) {
      const record = readRecord(element)
      const message = record?.message
      if (!message || !['system', 'assistant'].includes(message.role) || message.role !== element.dataset.role) continue
      const current = ownedHistory(history, element.closest('[data-chat-surface]'), record)
      const row = current?.rows?.find(value => (value.row_id ?? value.id) === record.rowId)
      const original = textParts(message)
      const asyncResult = typeof message.asyncResult === 'string' ? message.asyncResult :
        typeof message.metadata?.custom?.asyncResult === 'string' ? message.metadata.custom.asyncResult : null
      const context = { lang: root.lang, role: message.role, displayKind: row?.display_kind ?? message.display_kind,
        interrupted: message.interrupted === true || message.metadata?.custom?.interrupted === true,
        asyncResult: Boolean(asyncResult) }
      if (message.role === 'system' && row?.role === 'assistant' && row.isStoredFailedTurn === true &&
          !asyncResult && turnRecoveryNotice(original)) rememberDiagnostic(element, presentDiagnostics)
      const shown = translateTerminalNotice(original, context)
      const receipt = asyncResult && current && canonicalAgentReceipt(record.rowId, current.receipts)
      const childShown = asyncResult && receipt ? translateInterruptedChildNotice(asyncResult, receipt, root.lang) : asyncResult
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        // A translated diagnostic must occupy the entire native text payload.
        // The same phrase inside a larger assistant answer stays untouched.
        markDiagnostic(element, text, original, context, presentDiagnostics)
        replace(text, original, shown, present)
        if (asyncResult) replace(text, asyncResult, childShown, present)
        const childActivity = readChildActivity(text.parentElement, message)
        const raw = changes.get(text)?.original ?? text.data
        if (childActivity?.activity.includes(raw)) replace(text, raw, translateInterruptedChildNotice(raw,
          { agents: [{ status: childActivity.status }] }, root.lang), present)
        const nativePart = readPart(text.parentElement)
        const parts = message.parts?.filter(part => part.type === 'text' && part.text === nativePart?.text &&
          (!Number.isSafeInteger(nativePart.sourceRowId) || nativePart.sourceRowId === part.sourceRowId)) || []
        if (parts.length !== 1) continue
        const part = parts[0]
        const partRow = current?.rows?.find(value => (value.row_id ?? value.id) === part.sourceRowId)
        // Live AUI parts have no sourceRowId yet. The native terminal event
        // already names the exact owner and persisted turn, including the
        // sender's submission and all row ids. Use that typed receipt until
        // hydration supplies the per-part row; never borrow the active chat.
        let scope
        try { scope = JSON.parse(current?.scope) } catch { /* No owned history yet. */ }
        const key = Array.isArray(scope) && completionKey(scope[0], scope[1], record.runtimeId, message.persistedTurn)
        const terminal = message.parts.filter(part => part.type === 'text').at(-1) === part
        const liveInterrupted = terminal && message.pending !== true && key && completions.get(key) === part.text
        // The timeline deliberately carries identities/metadata, never bodies.
        // The exact text comes from this part's native AUI runtime.
        if ((!partRow && !liveInterrupted) || partRow && (partRow.role !== message.role ||
            typeof partRow.content === 'string' && partRow.content !== part.text)) continue
        let metadata = partRow?.display_metadata
        if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata) } catch { metadata = null } }
        const partContext = { ...context, displayKind: partRow?.display_kind,
          interrupted: metadata?.interrupted === true || terminal && context.interrupted || Boolean(liveInterrupted) }
        markDiagnostic(element, text, part.text, partContext, presentDiagnostics)
        replace(text, part.text, translateTerminalNotice(part.text, partContext), present)
      }
    }
    for (const [node, change] of changes) if (!present.has(node) || !node.isConnected) {
      restore(node, change); changes.delete(node)
    }
    for (const node of diagnostics) if (!presentDiagnostics.has(node)) node.removeAttribute(diagnosticMarker)
    diagnostics.clear()
    for (const node of presentDiagnostics) diagnostics.add(node)
  }
  const content = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const known = changes.get(record.target)
        if (known && record.target.data === known.shown) continue
        const raw = record.target.data
        if (systemTurnNoticeText(raw) || known) { schedule(); return }
      } else if ((changes.size && record.removedNodes.length) || [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches(rootSelector) || node.querySelector(rootSelector) || node.closest(rootSelector)))) {
        schedule(); return
      }
    }
  })
  content.observe(document.body, { childList: true, subtree: true, characterData: true })
  const appearance = new MutationObserver(schedule)
  appearance.observe(root, { attributes: true, attributeFilter: ['lang', 'data-hermes-theme', 'data-hermes-codex-visual'] })
  const stopHistory = history?.subscribe?.(schedule)
  ctx.onEvent('message.complete', event => {
    const payload = event.payload
    const key = completionKey(event.connectionId, event.profile, event.session_id, payload?.persisted_turn)
    if (key && payload.status === 'interrupted' && typeof payload.text === 'string') {
      completions.set(key, payload.text.trim())
      if (completions.size > 256) completions.delete(completions.keys().next().value)
    }
    schedule()
  })
  ctx.onEvent('subagent.complete', schedule)
  ctx.onDispose(() => {
    disposed = true; cancelAnimationFrame(frame); content.disconnect(); appearance.disconnect(); stopHistory?.(); clear(); completions.clear()
  })
  sync()
}
