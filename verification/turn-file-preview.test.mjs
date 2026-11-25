import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const matching = fs.readFileSync(new URL('../source/turn-file-matching.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const preview = fs.readFileSync(new URL('../source/turn-file-preview.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')

function fixture() {
  const dom = new JSDOM('<html lang="ru"><body><div data-slot="aui_assistant-message-root"><div data-slot="aui_assistant-message-content"><div class="aui-md"></div></div><div data-slot="aui_changed-files"><div><span data-hcv-files-title></span></div><div></div></div></div></body></html>', { runScripts: 'outside-only' })
  const { window } = dom
  window.eval(`
    const previewResourceCard = 'div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics):has(> span.truncate[title] + button)';
    const committedFiber = element => element.testFiber;
    const chatStyles = {}; const mountCSS = () => {};
    ${matching}\n${preview}
    globalThis.sync = syncTurnFilePreview; globalThis.clear = clearTurnFilePreview;
    globalThis.syncRows = syncTurnFilePreviewRows; globalThis.clearRows = clearTurnFilePreviewRows;
  `)
  const doc = window.document
  const files = { card: doc.querySelector('[data-slot="aui_changed-files"]'), name: doc.querySelector('[data-hcv-files-title]') }
  function addCard(target, href = '#media:test', label = 'File: report.md', existingParagraph = null) {
    const paragraph = existingParagraph || doc.createElement('p')
    const card = doc.createElement('div')
    card.innerHTML = '<span><svg class="tabler-icon-device-desktop-analytics"></svg></span><span class="truncate"></span><button>Folder</button><button>Preview</button>'
    card.children[1].title = target
    card.testFiber = { return: { memoizedProps: { target }, return: { memoizedProps: { href, children: label } } } }
    paragraph.append(card)
    if (!existingParagraph) doc.querySelector('.aui-md').append(paragraph)
    return { paragraph, card }
  }
  function addRow(target) {
    const row = doc.createElement('button')
    files.card.children[1].append(row)
    return { row, path: target, basename: target.split('/').at(-1) }
  }
  return { window, files, addCard, addRow, close: () => dom.window.close() }
}

test('merge only the matching delivery, preserve its preview and restore the card on cleanup', () => {
  const f = fixture()
  try {
    const one = f.addCard('C:\\project\\review\\report.md')
    const other = f.addCard('C:\\project\\docs\\report.md')
    const prose = f.addCard('C:\\project\\review\\report.md', '#preview:test', 'мой отчёт')
    let opened = 0
    let revealed = 0
    one.card.lastElementChild.addEventListener('click', () => opened++)
    one.card.children[2].addEventListener('click', () => revealed++)
    f.window.sync(f.files, 'C:\\project\\review\\report.md', 'C:\\project', 'report.md', true)
    assert(one.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!other.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!prose.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert.equal(f.files.name.textContent, 'Изменён report.md')
    f.files.previewLink.click()
    f.files.previewSecondary.click()
    assert.equal(opened, 1)
    assert.equal(revealed, 1)
    f.files.previewLink.focus()
    f.window.clear(f.files)
    assert(!one.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!f.files.previewLink)
    assert.equal(f.window.document.activeElement, one.card.lastElementChild)
  } finally { f.close() }
})

test('merge matching deliveries into separate rows and keep each native action', () => {
  const f = fixture()
  try {
    const rows = ['/project/a/report.md', '/project/b/report.md', '/project/third.md',
      '/project/fourth.md', '/project/fifth.md'].map(f.addRow)
    const first = f.addCard('/project/a/report.md')
    const second = f.addCard('/project/b/report.md')
    const unrelated = f.addCard('/elsewhere/report.md')
    let opened = 0
    let revealed = 0
    first.card.lastElementChild.addEventListener('click', () => opened++)
    second.card.children[2].addEventListener('click', () => revealed++)
    f.window.syncRows(f.files, rows, '/project', true)
    assert(first.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(second.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!unrelated.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert.equal(f.files.card.children[1].querySelectorAll(':scope > button').length, 5)
    assert.equal(rows[0].row.nextElementSibling.dataset.hcvFileRowActions, '')
    assert.equal(rows[1].row.nextElementSibling.dataset.hcvFileRowActions, '')
    assert.equal(rows[0].row.nextElementSibling.querySelector('[data-hcv-file-row-preview]').getAttribute('aria-label'),
      'Открыть файл /project/a/report.md')
    assert.equal(rows[1].row.nextElementSibling.querySelector('[data-hcv-file-row-preview]').getAttribute('aria-label'),
      'Открыть файл /project/b/report.md')
    assert.equal(rows[0].row.style.getPropertyValue('--hcv-file-grid-row'), '1')
    assert.equal(rows[4].row.style.getPropertyValue('--hcv-file-grid-row'), '5')
    rows[0].row.nextElementSibling.querySelector('[data-hcv-file-row-preview]').click()
    rows[1].row.nextElementSibling.querySelector('[data-hcv-file-row-secondary]').click()
    assert.equal(opened, 1)
    assert.equal(revealed, 1)
    first.card.lastElementChild.disabled = true
    f.window.syncRows(f.files, rows, '/project', true)
    assert.equal(rows[0].row.nextElementSibling.querySelector('[data-hcv-file-row-preview]').disabled, true)
    first.card.lastElementChild.disabled = false
    f.window.syncRows(f.files, rows, '/project', true)
    assert.equal(f.files.card.querySelectorAll('[data-hcv-file-row-actions]').length, 2)
    second.paragraph.remove()
    f.window.syncRows(f.files, rows, '/project', true)
    assert.equal(f.files.card.querySelectorAll('[data-hcv-file-row-actions]').length, 1)
    assert(!rows[1].row.hasAttribute('data-hcv-file-preview-row'))
    rows[0].row.nextElementSibling.querySelector('[data-hcv-file-row-preview]').focus()
    f.window.clearRows(f.files)
    assert(!first.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!f.files.card.children[1].hasAttribute('data-hcv-file-preview-list'))
    assert.equal(rows[4].row.style.getPropertyValue('--hcv-file-grid-row'), '')
    assert.equal(f.window.document.activeElement, first.card.lastElementChild)
  } finally { f.close() }
})

test('do not merge a delivery if multiple rows have the same full path', () => {
  const f = fixture()
  try {
    const rows = ['/project/report.md', '/project/report.md'].map(f.addRow)
    const delivered = f.addCard('/project/report.md')
    f.window.syncRows(f.files, rows, '/project', true)
    assert(!delivered.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert.equal(f.files.card.querySelectorAll('[data-hcv-file-row-actions]').length, 0)
  } finally { f.close() }
})

test('do not infer identity through parent segments that may cross symlinks', () => {
  const f = fixture()
  try {
    const delivered = f.addCard('/project/report.md')
    const row = f.addRow('/project/link/../report.md')
    f.window.syncRows(f.files, [row], '/project', true)
    assert(!delivered.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    f.window.sync(f.files, 'file:///project/link/%2e%2e/report.md', '/project', 'report.md', true)
    assert(!delivered.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
  } finally { f.close() }
})

test('merge multiple cards sharing a paragraph without hiding unrelated content', () => {
  const f = fixture()
  try {
    const rows = ['/project/a.md', '/project/b.md'].map(f.addRow)
    const first = f.addCard('/project/a.md')
    const second = f.addCard('/project/b.md', '#media:test', 'File: b.md', first.paragraph)
    const unrelated = f.addCard('/project/elsewhere.md', '#media:test', 'File: other.md', first.paragraph)
    f.window.syncRows(f.files, rows, '/project', true)
    assert(first.card.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(second.card.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!unrelated.card.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!first.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    f.window.clearRows(f.files)
    first.paragraph.append(f.window.document.createTextNode(' Не удалять текст.'))
    f.window.syncRows(f.files, rows, '/project', true)
    assert(!first.card.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!second.card.hasAttribute('data-hcv-merged-preview-wrapper'))
  } finally { f.close() }
})

test('keep both cards when identity is ambiguous or multiple deliveries match', () => {
  const f = fixture()
  try {
    const one = f.addCard('/project/report.md')
    f.window.sync(f.files, 'report.md', '', 'report.md', true)
    assert(!one.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    const two = f.addCard('/project/report.md')
    f.window.sync(f.files, '/project/report.md', '/project', 'report.md', true)
    assert(!one.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
    assert(!two.paragraph.hasAttribute('data-hcv-merged-preview-wrapper'))
  } finally { f.close() }
})
