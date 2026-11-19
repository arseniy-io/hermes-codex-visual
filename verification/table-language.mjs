import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM(`<html lang="ru" data-hermes-theme="codex-workspace"><body>
  <div data-chat-surface><div data-slot="aui_assistant-message-content"><div class="aui-md-table">
    <table><thead><tr><th>Тема</th></tr></thead><tbody><tr><td>Значение</td></tr></tbody></table>
  </div></div></div></body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' })
const { window } = dom
const wrapper = window.document.querySelector('.aui-md-table')
const table = wrapper.querySelector('table')
Object.defineProperties(wrapper, { clientWidth: { value: 100 }, scrollWidth: { value: 200 } })
Object.defineProperty(table, 'offsetWidth', { value: 200 })
window.HTMLElement.prototype.checkVisibility = () => true
window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
window.HTMLDialogElement.prototype.close = function () { this.open = false }
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
Object.assign(window, { codexMask: () => '', codex: { font: 'sans-serif', tooltip: { padding: '0', radius: '0' } },
  mountStyle: () => {}, host: {}, committedFiber: () => null })
const frames = new Map()
let next = 0
window.requestAnimationFrame = callback => { frames.set(++next, callback); return next }
window.cancelAnimationFrame = id => frames.delete(id)
const disposers = []
const ctx = {
  onDispose: fn => disposers.push(fn), i18n: { t: () => '' },
  addEventListener(target, type, fn, options) {
    target.addEventListener(type, fn, options)
    disposers.push(() => target.removeEventListener(type, fn, options))
  },
}
const source = fs.readFileSync('source/chat-tables.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.registerTable = registerChatTables')
window.registerTable(ctx, 'html[data-hermes-theme="codex-workspace"]')
async function flush() {
  for (let pass = 0; pass < 20; pass++) {
    await Promise.resolve()
    if (!frames.size) { await Promise.resolve(); if (!frames.size) return }
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  throw new Error('Table observers did not settle')
}

try {
  await flush()
  assert.equal(wrapper.getAttribute('aria-label'), 'Прокручиваемая таблица')
  wrapper.querySelector('[data-hcv-table-action="expand"]').click()
  const dialog = window.document.querySelector('dialog')
  const region = dialog.querySelector('[role="region"]')
  const clone = dialog.querySelector('table')
  const close = dialog.querySelector('[data-hcv-table-action="close"]')
  region.scrollLeft = 30
  region.scrollTop = 20
  region.focus()
  window.document.documentElement.lang = 'en'
  await flush()
  assert.equal(wrapper.getAttribute('aria-label'), 'Scrollable table')
  assert.equal(dialog.getAttribute('aria-label'), 'Table preview')
  assert.equal(region.getAttribute('aria-label'), 'Scrollable table')
  assert.equal(close.getAttribute('aria-label'), 'Close table preview')
  assert.equal(dialog.querySelector('table'), clone, 'Changing language must not replace the open table')
  assert.equal(window.document.activeElement, region)
  assert.deepEqual([region.scrollLeft, region.scrollTop], [30, 20])
  window.document.documentElement.lang = 'ru'
  await flush()
  assert.equal(dialog.getAttribute('aria-label'), 'Предпросмотр таблицы')
  assert.equal(close.getAttribute('aria-label'), 'Закрыть предпросмотр таблицы')
  console.log('Table language, open preview, focus and scrolling passed.')
} finally {
  for (const dispose of disposers) dispose()
  dom.window.close()
}
