import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { agentTranscriptPainted, agentTranscriptRole, agentTranscriptVisibleText } from '../source/agent-transcript-visibility.js'
const body = fs.readFileSync(new URL('../source/system-turn-notice-copy.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/export (async )?function /g, '$1function ')
const { translateTerminalNotice, translateTranscriptTurnNotice, translateInterruptedChildNotice } =
  new Function('nativeRenderedMessageRecord', 'canonicalAgentReceipt', body +
    ';return { translateTerminalNotice, translateTranscriptTurnNotice, translateInterruptedChildNotice }')(() => null, () => null)

const failed = 'Your request was not processed. Send it again if you still want me to carry it out.'
const waiting = 'Operation interrupted: waiting for model response (402.4s elapsed).'

test('only typed or projected failed-turn system notices receive the exact translation', () => {
  assert.equal(translateTerminalNotice(failed, { role: 'assistant' }), failed)
  assert.equal(translateTerminalNotice(failed, { role: 'user' }), failed)
  assert.match(translateTerminalNotice(failed, { role: 'system' }), /^Запрос не был обработан\./)
  assert.match(translateTerminalNotice(failed, { role: 'assistant', displayKind: 'failed_turn' }), /^Запрос не был обработан\./)
  assert.equal(translateTerminalNotice(failed, { role: 'system', lang: 'en' }), failed)
})

test('the interrupted waiting diagnostic requires a real interrupted flag and preserves elapsed data', () => {
  assert.equal(translateTerminalNotice(waiting, { role: 'assistant' }), waiting)
  assert.equal(translateTerminalNotice(waiting, { role: 'user', interrupted: true }), waiting)
  assert.equal(translateTerminalNotice(waiting, { role: 'assistant', interrupted: true }),
    'Остановлено во время ожидания ответа модели (прошло 402,4 с).')
  const extra = waiting + '\nquoted by the assistant'
  assert.equal(translateTerminalNotice(extra, { role: 'assistant', interrupted: true }), extra)
})

test('a background child report is not translated merely because it quotes a known sentence', () => {
  assert.equal(translateTerminalNotice(failed, { role: 'system', asyncResult: true }), failed)
  assert.match(translateTerminalNotice(failed, { role: 'system', asyncResult: true, displayKind: 'failed_turn' }), /^Запрос не был обработан\./)
})

test('child transcript rows retain the producer type and never translate a normal model quotation', () => {
  assert.match(translateTranscriptTurnNotice({ role: 'assistant', display_kind: 'failed_turn' }, failed), /^Запрос не был обработан\./)
  assert.equal(translateTranscriptTurnNotice({ role: 'assistant' }, failed), failed)
  assert.equal(translateTranscriptTurnNotice({ role: 'assistant', display_kind: 'failed_turn' }, failed, 'en'), failed)
  assert.match(translateTranscriptTurnNotice({ role: 'assistant', display_metadata: '{"interrupted":true}' }, waiting), /402,4 с/)
})

test('child report fallback requires a canonical interrupted receipt for every child', () => {
  assert.equal(translateInterruptedChildNotice(failed, null), failed)
  assert.equal(translateInterruptedChildNotice(failed, { agents: [{ status: 'completed' }] }), failed)
  assert.equal(translateInterruptedChildNotice(failed, { agents: [{ status: 'interrupted' }, { status: 'completed' }] }), failed)
  assert.match(translateInterruptedChildNotice(failed, { agents: [{ status: 'interrupted' }] }), /^Запрос не был обработан\./)
  const quoted = 'Model report: ' + failed
  assert.equal(translateInterruptedChildNotice(quoted, { agents: [{ status: 'interrupted' }] }), quoted)
})

test('the actual child transcript block builder calls the typed translator with its current locale', () => {
  const source = fs.readFileSync(new URL('../source/agent-transcript-data.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replace(/export (async )?function /g, '$1function ')
  const blocks = new Function('agentTranscriptPainted', 'agentTranscriptRole', 'agentTranscriptVisibleText',
    'translateTranscriptTurnNotice', source + ';return agentTranscriptBlocks')(
      agentTranscriptPainted, agentTranscriptRole, agentTranscriptVisibleText, translateTranscriptTurnNotice)
  const rows = [{ id: 1, role: 'assistant', content: failed, display_kind: 'failed_turn' },
    { id: 2, role: 'assistant', content: failed }]
  assert.match(blocks(rows, { lang: 'ru' })[0].text, /^Запрос не был обработан\./)
  assert.equal(blocks(rows, { lang: 'ru' })[1].text, failed)
  assert.equal(blocks(rows, { lang: 'en' })[0].text, failed)
})
