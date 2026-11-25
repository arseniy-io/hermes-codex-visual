import { movedElementMatches } from './dom-changes.js'

const assistant = '[data-slot="aui_assistant-message-root"]'
const response = '[data-slot="aui_response-group"]'
const live = '[data-message-streaming="true"], [data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"]'

const rows = '[data-slot="aui_turn-pair"], [data-slot="aui_user-message-root"], ' + assistant + ', ' + response
const loading = '[data-slot="aui_response-loading"]'
const activity = '[data-slot="aui_turn-activity"]'
const footer = '[data-slot="aui_msg-actions"], [data-slot="aui_changed-files"]'

export function savedTurnMutation(record) {
  if (record.type === 'attributes') {
    if (record.attributeName === 'data-message-streaming') return record.target.dataset.messageStreaming !== 'true' ? 'read' : 'paint'
    if (record.target.matches(activity)) return record.target.dataset.state !== 'active' ? 'read' : 'paint'
    return null
  }
  if (movedElementMatches(record, [rows, loading, activity].join(', '))) return 'read'
  return movedElementMatches(record, footer) ? 'paint' : null
}

// Codex TurnDiffContent is a turn resource after any terminal outcome, not
// an assistant action. Interrupted tool-only turns often have no msg-actions.
export function savedTurnCardAnchor(turn) {
  if (turn.querySelector(live)) return null
  return [...turn.querySelectorAll(assistant)].at(-1) || turn.querySelector(response) || turn
}

export function placeSavedTurnCard(card, anchor) {
  let footer = anchor.querySelector('[data-slot="aui_msg-actions"]')
  while (footer?.parentElement && footer.parentElement !== anchor) footer = footer.parentElement
  if (footer?.parentElement === anchor) {
    if (card.nextSibling !== footer) anchor.insertBefore(card, footer)
  } else if (card.parentElement !== anchor) anchor.append(card)
}
