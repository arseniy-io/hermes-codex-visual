import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { anchorTurnCard } from '../source/turn-card-scroll.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../source/turns.js', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('const response ='), source.indexOf('export function registerTurnExperience'))

function fixture() {
  const dom = new JSDOM('<html lang="ru"><body><div data-chat-surface data-composer-target="main"><div data-slot="aui_changed-files"><div><span>Files</span><button>Review</button></div><div></div></div></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  window.anchorTurnCard = anchorTurnCard
  window.eval(`const host={state:{cwd:{get:()=>'/project'}}}; const committedFiber=()=>null;
    const clearTurnFilePreview=()=>{},syncTurnFilePreview=()=>{},clearTurnFilePreviewRows=()=>{},syncTurnFilePreviewRows=()=>{};
    ${code}\n globalThis.paintFiles=showFiles; globalThis.disposeFiles=clearFiles;`)
  const card = window.document.querySelector('[data-slot="aui_changed-files"]')
  for (const name of ['one.txt','two.txt','three.txt','four.txt','five.txt']) {
    const row = window.document.createElement('button')
    const label = window.document.createElement('span'); label.className='truncate'; label.textContent=name
    row.append(label); card.children[1].append(row)
  }
  const state={files:null}
  return { window, card, state, paint:()=>window.paintFiles(state,card), close:()=>dom.window.close() }
}

test('the expanded list remains open when Hermes replaces its review control', () => {
  const f=fixture()
  try {
    f.paint()
    const more=f.card.querySelector('[data-hcv-files-more]')
    more.focus(); more.click()
    assert.equal(more.getAttribute('aria-expanded'),'true')
    const native=f.card.querySelector('[data-hcv-file-review]')
    const replacement=native.cloneNode(true)
    replacement.removeAttribute('data-hcv-file-review')
    native.replaceWith(replacement)
    f.paint()
    const fresh=f.card.querySelector('[data-hcv-files-more]')
    assert(fresh)
    assert.equal(fresh.getAttribute('aria-expanded'),'true')
    assert(f.card.hasAttribute('data-hcv-files-open'))
    assert.equal(f.window.document.activeElement,fresh)
    fresh.click()
    assert.equal(fresh.getAttribute('aria-expanded'),'false')
    assert(!f.card.hasAttribute('data-hcv-files-open'))
  } finally { f.close() }
})

test('separate response groups do not share expansion state', () => {
  const first=fixture(), second=fixture()
  try {
    first.paint(); second.paint()
    first.card.querySelector('[data-hcv-files-more]').click()
    assert(first.card.hasAttribute('data-hcv-files-open'))
    assert(!second.card.hasAttribute('data-hcv-files-open'))
  } finally { first.close(); second.close() }
})

test('a list that shrinks to three files starts closed if it grows again', () => {
  const f=fixture()
  try {
    f.paint()
    f.card.querySelector('[data-hcv-files-more]').click()
    const list=f.card.children[1]
    list.lastElementChild.remove(); list.lastElementChild.remove()
    f.paint()
    assert(!f.card.hasAttribute('data-hcv-files-open'))
    assert(!f.card.querySelector('[data-hcv-files-more]'))
    for (const name of ['new-four.txt','new-five.txt']) {
      const row=f.window.document.createElement('button')
      const label=f.window.document.createElement('span')
      label.className='truncate'; label.textContent=name
      row.append(label); list.append(row)
    }
    f.paint()
    assert.equal(f.card.querySelector('[data-hcv-files-more]').getAttribute('aria-expanded'),'false')
    assert(!f.card.hasAttribute('data-hcv-files-open'))
  } finally { f.close() }
})
