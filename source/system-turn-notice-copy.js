
// Exact Hermes producer messages only. The caller must prove a system notice
// or an interrupted terminal row; plain assistant/user prose is never eligible.
const emptyTurnRecovery = 'Your request was not processed. Send it again if you still want me to carry it out.'
const partialTurnRecovery = 'This turn did not complete. Some actions may already have run; verify their effects before resending.'
const failed = new Map([
  [emptyTurnRecovery, 'Запрос не был обработан. Отправьте его ещё раз, если он по-прежнему нужен.'],
  [partialTurnRecovery, 'Этот ход не завершён. Часть действий уже могла выполниться. Проверьте их результат перед повторной отправкой.'],
  ['An automated delivery was interrupted and was not run again. Some actions may already have run; verify their effects.',
    'Автоматическое выполнение было прервано и не запускалось повторно. Часть действий уже могла выполниться. Проверьте их результат.'],
])
const waiting = /^Operation interrupted: waiting for model response \((\d+(?:\.\d+)?)s elapsed\)\.$/

export function translateTerminalNotice(value, { lang = 'ru', role, displayKind, interrupted = false, asyncResult = false } = {}) {
  if (!/^ru(?:-|$)/i.test(lang) || typeof value !== 'string') return value
  const system = role === 'system' || displayKind === 'failed_turn'
  // A background result is arbitrary model output unless its producer typed
  // it as a failed-turn notice separately. Never translate report quotations.
  if (asyncResult && displayKind !== 'failed_turn') return value
  if (system && failed.has(value)) return failed.get(value)
  const match = interrupted && (role === 'assistant' || system) && waiting.exec(value)
  if (!match) return value
  const seconds = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20, useGrouping: false }).format(Number(match[1]))
  return `Остановлено во время ожидания ответа модели (прошло ${seconds} с).`
}

const object = value => {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return null } }
  return value && typeof value === 'object' ? value : null
}

// Child transcripts keep the original typed row, unlike the AUI projection.
// Call after native visibility projection and before MessageTextContent.
export function translateTranscriptTurnNotice(row, value, lang = 'ru') {
  const metadata = object(row?.display_metadata)
  return translateTerminalNotice(value, { lang, role: row?.role,
    displayKind: row?.display_kind, interrupted: metadata?.interrupted === true,
    asyncResult: row?.display_kind === 'async_delegation_complete' })
}

export function translateInterruptedChildNotice(report, receipt, lang = 'ru') {
  if (!receipt?.agents?.length || !receipt.agents.every(agent => agent.status === 'interrupted')) return report
  return translateTerminalNotice(report, { lang, role: 'system', displayKind: 'failed_turn', interrupted: true, asyncResult: true })
}


export function turnRecoveryNotice(value) { return value === emptyTurnRecovery || value === partialTurnRecovery }

export function modelWaitInterruption(value) { return typeof value === 'string' && waiting.test(value) }

export function systemTurnNoticeText(value) { return failed.has(value) || modelWaitInterruption(value) }
