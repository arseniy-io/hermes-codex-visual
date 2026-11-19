import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// The same trusted, local JSDOM dependency as runtime-dom-performance.mjs.
// This checks source observation without a Desktop process or a real profile.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM(`<html><body><div id="chat"><div data-slot="aui_thread-content">
  <div class="aui-md"><a href="https://example.invalid/doc"><span>Первое имя</span></a><p id="ordinary">Обычный текст</p></div>
  <div data-slot="aui_assistant-message-content"><div data-test-preview><span title="/tmp/file.md">Старый файл</span><button>Открыть</button></div></div>
</div></div></body></html>`, { runScripts: 'outside-only' })
const { window } = dom
let snapshot = null
let cleanup
let next = 0
let scheduled = 0
const frames = new Map()
window.requestAnimationFrame = callback => { scheduled++; frames.set(++next, callback); return next }
window.cancelAnimationFrame = id => frames.delete(id)
window.useState = initial => [snapshot ?? initial, value => { snapshot = typeof value === 'function' ? value(snapshot) : value }]
window.useEffect = effect => { cleanup = effect() }
window.previewResourceCard = '[data-test-preview]'
const source = fs.readFileSync('source/summary-sources.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export \{[^\n]*\n/gm, '')
  .replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.runSources = useChatSources')
window.runSources(() => window.document.querySelector('#chat'), 'one', true)

async function flush() {
  for (let pass = 0; pass < 20; pass++) {
    await Promise.resolve()
    if (!frames.size) {
      await Promise.resolve()
      if (!frames.size) return
    }
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  throw new Error('Source observers did not settle')
}

try {
  await flush()
  const names = () => snapshot.rows.map(row => row.name)
  assert.deepEqual([...names()].sort(), ['Первое имя', 'Старый файл'].sort())

  const beforeOrdinary = scheduled
  for (let i = 0; i < 40; i++) {
    window.document.querySelector('#ordinary').firstChild.data = `Слово ${i}`
    await flush()
  }
  assert.equal(scheduled, beforeOrdinary, 'Ordinary streaming text should not schedule a source scan')

  window.document.querySelector('a span').firstChild.data = 'Новое имя'
  await flush()
  assert(names().includes('Новое имя'), 'A changed link label must appear in sources')
  assert(!names().includes('Первое имя'))

  window.document.querySelector('[data-test-preview] span').firstChild.data = 'Новый файл'
  await flush()
  assert(names().includes('Новый файл'), 'A changed preview label must appear in sources')

  const link = window.document.querySelector('a')
  link.remove()
  await flush()
  assert(!names().includes('Новое имя'), 'Removing a source must remove its row')
  const afterRemoval = scheduled
  link.firstChild.firstChild.data = 'Отключённая ссылка'
  await flush()
  assert.equal(scheduled, afterRemoval, 'Removed sources must no longer be observed')

  cleanup()
  const afterCleanup = scheduled
  window.document.querySelector('[data-test-preview] span').firstChild.data = 'После отключения'
  await flush()
  assert.equal(scheduled, afterCleanup, 'Disposal must disconnect the observers')
  console.log('Source labels, unrelated streaming, removal and disposal passed.')
} finally {
  dom.window.close()
}
