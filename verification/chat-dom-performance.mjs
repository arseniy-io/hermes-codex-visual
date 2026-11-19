import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Isolated DOM operation counts, not browser frame timings or process memory.
// Dependencies come from the existing, trusted Hermes source archive.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const [beforeDir = path.join(root, 'evidence/v01584-source-before'),
  afterDir = path.join(root, 'source'), output] = process.argv.slice(2)
const require = createRequire(path.join(process.env.LOCALAPPDATA,
  'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const helper = fs.readFileSync(path.join(root, 'source/sidebar-recents.js'), 'utf8')
  .match(/export function committedFiber\(element\) \{[\s\S]*?(?=\nexport function nativeDraftWorkspaceAction)/)?.[0]
assert(helper, 'The current committedFiber helper must be recognizable')
const active = 'html[data-hermes-theme="codex-workspace"]'
const candidate = 'div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics):has(> span.truncate[title] + button)'
const fileControl = '[data-hcv-file-reference-control]'

function fixture() {
  const dom = new JSDOM('<html lang="ru" data-hermes-theme="codex-workspace"><body></body></html>',
    { runScripts: 'outside-only' })
  const { window } = dom
  const { document } = window
  const metrics = { queries: 0, queriesAll: 0, fiberReads: 0, markedVisits: 0, frames: 0 }
  const frames = new Map()
  const media = new Map()
  const disposers = []
  let id = 0
  window.requestAnimationFrame = fn => (frames.set(++id, fn), id)
  window.cancelAnimationFrame = key => frames.delete(key)
  window.matchMedia = query => {
    if (!media.has(query)) {
      const state = new window.EventTarget()
      state.matches = false
      media.set(query, state)
    }
    return media.get(query)
  }
  window.Element.prototype.getClientRects = function () { return this.isConnected ? [{ width: 80, height: 80 }] : [] }
  for (const prototype of [window.Element.prototype, window.Document.prototype]) {
    for (const [name, counter] of [['querySelector', 'queries'], ['querySelectorAll', 'queriesAll']]) {
      const original = prototype[name]
      prototype[name] = function (...args) { metrics[counter]++; return original.apply(this, args) }
    }
  }
  window.hcvMeasuredSet = class extends window.Set {
    *[Symbol.iterator]() { for (const value of super[Symbol.iterator]()) { metrics.markedVisits++; yield value } }
  }
  window.ctx = {
    addEventListener(target, event, handler, options) {
      target.addEventListener(event, handler, options)
      disposers.push(() => target.removeEventListener(event, handler, options))
    },
    onDispose: fn => disposers.push(fn),
  }
  window.hcvMetrics = metrics
  const prelude = `const version = '19.0.0';
    ${helper.replace('export function committedFiber', 'function actualCommittedFiber')}
    function committedFiber(element) { hcvMetrics.fiberReads++; return actualCommittedFiber(element) }
    const codexMask = () => 'none', svgMask = () => 'none', localAssets = null;
    const codex = { enter: 'linear', exit: 'linear', enterTime: '200ms', exitTime: '200ms', font: 'sans-serif' };
    const chatStyles = {}; const mountCSS = () => {};
  `
  function load(file, entry, instrumentImages = false) {
    let source = fs.readFileSync(file, 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
    if (instrumentImages) {
      assert(source.includes('const marked = new Set()'), 'Image marker instrumentation must attach to the real Set')
      source = source.replace('const marked = new Set()', 'const marked = globalThis.hcvMarked = new globalThis.hcvMeasuredSet()')
    }
    window.eval(prelude + source + `\n${entry}(window.ctx, ${JSON.stringify(active)}${entry === 'registerChatFileLinks' ? ', ' + JSON.stringify(candidate) : ''})`)
  }
  async function settle() {
    for (let pass = 0; pass < 30; pass++) {
      await Promise.resolve()
      if (!frames.size) { await Promise.resolve(); if (!frames.size) return }
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) { metrics.frames++; callback(1000 + pass * 16) }
    }
    throw new Error('DOM updates did not settle')
  }
  function reset() { for (const key of Object.keys(metrics)) metrics[key] = 0 }
  async function measure(action) { reset(); action(); await settle(); return { ...metrics } }
  function fiber(element, props = {}, parent = null) {
    element.__reactProps$hcv = props
    element.__reactFiber$hcv = { memoizedProps: props, stateNode: element, return: parent }
  }
  function retained() {
    const result = { total: 0, detached: 0 }
    window.hcvMarked?.forEach(node => { result.total++; if (!node.isConnected) result.detached++ })
    return result
  }
  function close() { for (const dispose of disposers.reverse()) dispose(); dom.window.close() }
  return { window, document, load, settle, measure, fiber, retained, media, close }
}

async function verifyFiles(directory, count, expectImprovement) {
  const f = fixture()
  const { document: doc, window } = f
  const chat = doc.createElement('div')
  chat.setAttribute('data-chat-surface', '')
  chat.innerHTML = '<div data-slot="aui_assistant-message-content"><div class="aui-md"></div></div>'
  doc.body.append(chat)
  const markdown = chat.querySelector('.aui-md')
  let opened = 0
  function makeCard(index) {
    const card = doc.createElement('div')
    card.innerHTML = '<span><svg class="tabler-icon-device-desktop-analytics"></svg></span><span class="truncate"></span><button>Показать</button><button>Открыть</button>'
    const title = card.children[1]
    title.title = `/tmp/file-${index}.md`
    title.textContent = `file-${index}.md`
    const targetProps = { target: title.title }
    const linkProps = { href: '#preview/' + index, children: `Файл ${index}` }
    f.fiber(card, {}, { memoizedProps: targetProps, return: { memoizedProps: linkProps } })
    card.lastElementChild.addEventListener('click', () => opened++)
    return { card, title, targetProps, linkProps }
  }
  const cards = Array.from({ length: count }, (_, i) => makeCard(i))
  markdown.append(...cards.map(item => item.card))
  try {
    f.load(path.join(directory, 'chat-file-links.js'), 'registerChatFileLinks')
    await f.settle()
    assert.equal(markdown.querySelectorAll(fileControl).length, count)
    const text = doc.createTextNode('Продолжение')
    const appendText = await f.measure(() => markdown.append(text))
    const characterData = await f.measure(() => { text.data += ' ответа' })
    const paragraph = doc.createElement('p')
    paragraph.textContent = 'Новый абзац без файлов'
    const appendParagraph = await f.measure(() => markdown.append(paragraph))
    const added = [makeCard(count), makeCard(count + 1)]
    const nested = doc.createElement('section')
    nested.append(...added.map(item => item.card))
    const appendCards = await f.measure(() => markdown.append(nested))
    assert.equal(markdown.querySelectorAll(fileControl).length, count + 2)
    if (expectImprovement) {
      for (const measurement of [appendText, characterData, appendParagraph]) assert.equal(measurement.fiberReads, 0)
      assert(appendCards.fiberReads <= 4, 'Only the two newly mounted cards may be read, including their initial control insertion')
    } else {
      for (const measurement of [appendText, characterData, appendParagraph]) assert(measurement.fiberReads >= count)
    }
    const first = cards[0]
    const control = () => first.card.querySelector(fileControl)
    await f.measure(() => { first.card.lastElementChild.disabled = true })
    assert.equal(control().disabled, true)
    await f.measure(() => { first.card.lastElementChild.disabled = false })
    control().click()
    assert.equal(opened, 1)
    first.linkProps.children = ''
    await f.measure(() => { first.title.firstChild.data = 'Новое имя из текста' })
    assert.equal(control().textContent, 'Новое имя из текста')
    await f.measure(() => first.title.append(doc.createTextNode(' с дополнением')))
    assert.equal(control().textContent, 'Новое имя из текста с дополнением')
    first.targetProps.target = '/tmp/renamed.md'
    first.linkProps.href = '#preview/renamed'
    first.linkProps.children = 'Переименованная ссылка'
    await f.measure(() => { first.title.title = first.targetProps.target })
    assert.equal(control().title, '/tmp/renamed.md')
    assert.equal(control().textContent, 'Переименованная ссылка')
    const replacement = doc.createElement('button')
    replacement.textContent = 'Новая кнопка'
    replacement.addEventListener('click', () => opened++)
    await f.measure(() => first.card.lastElementChild.replaceWith(replacement))
    control().click()
    assert.equal(opened, 2, 'The inline control must use the replaced native preview button')
    await f.measure(() => replacement.remove())
    assert.equal(control(), null, 'An incomplete native card must lose its inline control')
    await f.measure(() => first.card.append(replacement))
    assert(control(), 'Adding the native control back must restore the inline link')
    const colors = f.media.get('(forced-colors: active)')
    colors.matches = true
    colors.dispatchEvent(new window.Event('change'))
    await f.settle()
    assert.equal(markdown.querySelectorAll(fileControl).length, 0)
    colors.matches = false
    colors.dispatchEvent(new window.Event('change'))
    await f.settle()
    assert.equal(markdown.querySelectorAll(fileControl).length, count + 2)
    doc.documentElement.setAttribute('data-hermes-theme', 'nous')
    await f.settle()
    assert.equal(markdown.querySelectorAll(fileControl).length, 0)
    doc.documentElement.setAttribute('data-hermes-theme', 'codex-workspace')
    await f.settle()
    assert.equal(markdown.querySelectorAll(fileControl).length, count + 2)
    return { appendText, characterData, appendParagraph, appendCards,
      nativeControlsReplaced: true, disabledAndFallbackLabel: true, themeAndForcedColors: true }
  } finally { f.close() }
}

async function verifyImages(directory, expectImprovement) {
  const f = fixture()
  const { document: doc, window } = f
  const chat = doc.createElement('div')
  chat.setAttribute('data-chat-surface', '')
  chat.innerHTML = '<div id="history"><div data-tool-row data-slot="tool-block"><div><button aria-expanded="true"><span class="text-(--conversation-scaffold-text)">Analyzed 1 image</span></button></div><div id="output">Результат</div></div></div>'
  const composer = doc.createElement('div')
  composer.setAttribute('data-slot', 'composer-surface')
  composer.innerHTML = '<div data-slot="composer-attachments"><div class="group/attachment"><button><span><img></span></button><button>Удалить</button></div><div class="group/attachment"><button><span><img></span></button><button>Удалить</button></div></div>'
  doc.body.append(chat, composer)
  const row = chat.querySelector('[data-tool-row]')
  const visionPart = { toolName: 'vision_analyze', result: 'ok' }
  f.fiber(row, {}, { memoizedProps: { part: visionPart } })
  const opens = []
  const restores = []
  let dialog
  const thumbnails = [...composer.querySelectorAll('.group\\/attachment > button:first-child')]
  thumbnails.forEach((thumbnail, index) => thumbnail.addEventListener('click', () => {
    opens.push(index)
    dialog = doc.createElement('div')
    dialog.setAttribute('data-slot', 'dialog-content')
    dialog.setAttribute('data-variant', 'media-lightbox')
    dialog.dataset.state = 'open'
    dialog.innerHTML = '<div class="group/lightbox"><img></div>'
    const current = dialog
    f.fiber(dialog, { copy: { resetZoom() {} }, onOpenChange(open) {
      assert.equal(open, false)
      current.dataset.state = 'closed'
      current.remove()
      restores.push(() => current.dispatchEvent(new window.Event('focusScope.autoFocusOnUnmount')))
    } }, { stateNode: composer, memoizedProps: { attachment: { kind: 'image' } } })
    doc.body.append(dialog)
  }))
  try {
    f.load(path.join(directory, 'chat-images.js'), 'registerChatImages', true)
    await f.settle()
    assert(row.hasAttribute('data-hcv-viewed-image'))
    const token = row.querySelector('#output').firstChild
    let tokenWork = { markedVisits: 0, frames: 0 }
    for (let i = 0; i < 30; i++) {
      const work = await f.measure(() => { token.data += '.' })
      tokenWork.markedVisits += work.markedVisits
      tokenWork.frames += work.frames
    }
    if (expectImprovement) assert.equal(tokenWork.markedVisits, 0, 'Text tokens must not traverse all retained image markers')
    else assert(tokenWork.markedVisits >= 60)
    const unrelated = doc.createElement('p')
    doc.body.append(unrelated)
    await f.settle()
    const unrelatedRemoval = await f.measure(() => unrelated.remove())
    assert.equal(unrelatedRemoval.markedVisits, 0, 'Unrelated removals must not traverse retained image markers')
    thumbnails[0].click()
    await f.settle()
    assert(dialog.hasAttribute('data-hcv-image-viewer'))
    dialog.querySelector('[data-hcv-image-page="next"]').click()
    await f.settle()
    const afterPagingRemoval = f.retained()
    if (expectImprovement) assert.equal(afterPagingRemoval.detached, 0)
    else assert(afterPagingRemoval.detached > 0)
    restores.shift()()
    await f.settle()
    assert.deepEqual(opens, [0, 1], 'Cleanup must preserve native focus restoration before opening the next image')
    dialog.remove()
    await f.settle()
    const afterPureDialogRemoval = f.retained()
    if (expectImprovement) assert.equal(afterPureDialogRemoval.detached, 0)
    else assert(afterPureDialogRemoval.detached > 0)
    const history = doc.getElementById('history')
    const movedRow = history.firstElementChild
    movedRow.remove()
    history.append(movedRow)
    await f.settle()
    assert(movedRow.hasAttribute('data-hcv-viewed-image'), 'A connected move must preserve decoration')
    history.remove()
    await f.settle()
    const afterPureChatRemoval = f.retained()
    if (expectImprovement) assert.equal(afterPureChatRemoval.detached, 0)
    else assert(afterPureChatRemoval.detached > 0)
    chat.append(history)
    await f.settle()
    visionPart.isError = true
    token.data += '!'
    await f.settle()
    assert.equal(movedRow.hasAttribute('data-hcv-viewed-image'), false)
    history.remove()
    await f.settle()
    const afterFailedRowRemoval = f.retained()
    if (expectImprovement) assert.equal(afterFailedRowRemoval.detached, 0)
    return { tokenWork, unrelatedRemoval, afterPagingRemoval, afterPureDialogRemoval, afterPureChatRemoval,
      afterFailedRowRemoval, nativeFocusRestorationAndNextImage: true, connectedMove: true }
  } finally { f.close() }
}

const results = { kind: 'isolated DOM operation counts; no rendering or process-memory claim',
  substitutions: 'CSS mounting and icon data omitted; React 19 fiber properties, media/focus events and layout visibility supplied by fixtures',
  jsdom: require('jsdom/package.json').version, before: {}, after: {}, sources: {} }
for (const [name, directory] of [['before', beforeDir], ['after', afterDir]]) {
  results.sources[name] = Object.fromEntries(['chat-file-links.js', 'chat-images.js'].map(file => [file, {
    path: path.resolve(directory, file), sha256: createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'),
  }]))
  for (const count of [10, 40, 90]) results[name][count] = await verifyFiles(directory, count, name === 'after')
  results[name].images = await verifyImages(directory, name === 'after')
}
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
