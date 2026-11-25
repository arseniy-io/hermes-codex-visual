import { repeatedActivityPresentation } from './chat-activity-labels.js'

// The main transcript uses this same predicate for consecutive successful
// calls. A failed, blocked, active, unknown or different tool breaks the run.
// Compare neighbours first, then format each finished run once (linear work).
export function agentToolUnits(parts, russian) {
  const units = []
  for (const [index, part] of parts.entries()) {
    const last = units.at(-1)
    if (last && repeatedActivityPresentation([last.parts.at(-1), part], russian)) last.parts.push(part)
    else units.push({ key: part.toolCallId || 'tool-' + index, parts: [part] })
  }
  return units.map(unit => ({ ...unit, view: repeatedActivityPresentation(unit.parts, russian) }))
}

// Hermes connector-tools.ts reserves this top-level key for UI labels.
// Actual tool labels, context, nested fields and the original part.args
// remain data for describeActivity and execution; only the painted JSON is
// filtered. Never strip a family of keys based on a guessed prefix.
export function agentToolArgsText(part) {
  const args = part.args
  if (!part.argsText || !args || typeof args !== 'object' || Array.isArray(args) ||
      !Object.hasOwn(args, 'hermes_tool_labels')) return part.argsText || ''
  const visible = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'hermes_tool_labels'))
  return JSON.stringify(visible, null, 2)
}
