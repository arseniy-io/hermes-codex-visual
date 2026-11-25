import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileActivityData, fileActivityLabel } from '../source/chat-file-activity.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const { createElement: h } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const call = (diff, extra = {}) => ({ toolName: 'patch', args: { path: 'folder/file.py' },
  result: { diff, ...extra }, completedAt: 1 })
const patch = '--- a/file.py\n+++ b/file.py\n@@ -1 +1,2 @@\n-old\n+new\n+extra\n'

test('returned patch statistics keep both numbers, including zero and the actual Russian thousands separator', () => {
  const diff = '--- /dev/null\n+++ b/file.py\n@@ -0,0 +1,1216 @@\n' + '+line\n'.repeat(1216)
  const data = fileActivityData(call(diff), true)
  assert.equal(data.caption, 'Создано')
  assert.equal(data.added, '+1\u00a0216')
  assert.equal(data.removed, '−0')
  assert.equal(data.marker, 'add')
  const update = fileActivityData(call(patch), true)
  assert.deepEqual([update.caption, update.added, update.removed, update.marker], ['Редактирование', '+2', '−1', null])
})

test('created marker requires the saved add operation, rather than the write tool name or a guessed creation flag', () => {
  assert.equal(fileActivityData({ ...call(patch), toolName: 'write_file' }, true).marker, null)
  assert.equal(fileActivityData(call(patch, { created: true }), true).marker, null)
  assert.equal(fileActivityData(call(patch, { files_created: ['folder/file.py'] }), true).marker, 'add')
  assert.equal(fileActivityData(call(patch, { files_created: ['other.py'] }), true).marker, null)
  assert.equal(fileActivityData(call(patch, { files_created: 'folder/file.py' }), true).marker, null)
})

test('unconfirmed, failed, multi-file or unknown changes do not manufacture one-file statistics', () => {
  assert.equal(fileActivityData(undefined, true), null)
  assert.equal(fileActivityData({ toolName: 'write_file', args: { path: 'file.py' } }, true), null)
  assert.equal(fileActivityData(call(patch, { success: false }), true), null)
  assert.equal(fileActivityData(call(patch + patch), true), null)
  const noDiff = fileActivityData(call('', { success: true }), true)
  assert.equal(noDiff.added, null)
  assert.equal(noDiff.removed, null)
  assert.equal(noDiff.marker, null)
})

test('header-like content inside a hunk cannot turn an update into a file creation or deletion', () => {
  const data = fileActivityData(call('--- a/file.py\n+++ b/file.py\n@@ -1 +1 @@\n--- /dev/null\n+++ /dev/null\n'), true)
  assert.equal(data.caption, 'Редактирование')
  assert.equal(data.added, '+1')
  assert.equal(data.removed, '−1')
  assert.equal(data.marker, null)
})

test('the native DOM and child React labels preserve identical spacing, passive path semantics and the owning disclosure', () => {
  const dom = new JSDOM('<!doctype html><button id="native"><span id="original">file.py</span></button>')
  try {
    const document = dom.window.document
    const create = (tag, attributes, ...children) => {
      const node = document.createElement(tag)
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
      node.append(...children.filter(child => child != null && child !== false))
      return node
    }
    const data = fileActivityData(call(patch), true)
    const original = document.querySelector('#original')
    const owner = original.parentElement
    let toggles = 0
    owner.addEventListener('click', () => toggles++)
    const label = fileActivityLabel(data, create)
    owner.append(label)
    const rendered = new JSDOM(renderToStaticMarkup(fileActivityLabel(data, h)))
    assert.equal(label.textContent, 'Редактирование file.py +2 −1')
    assert.equal(rendered.window.document.body.textContent, label.textContent)
    assert.equal(label.querySelector('[data-hcv-file-activity-name]').title, 'folder/file.py')
    assert.equal(label.querySelector('[role="link"], a, button'), null)
    label.querySelector('[data-hcv-file-activity-name]').click()
    assert.equal(toggles, 1)
    assert.equal(original.parentElement, owner)
    label.remove()
    assert.equal(owner.firstElementChild, original)
    rendered.window.close()
  } finally { dom.window.close() }
})

test('opening the file diff follows the Codex expanded caption without repeating the path or counters', () => {
  const data = fileActivityData(call(patch), true, true)
  const rendered = renderToStaticMarkup(fileActivityLabel(data, h))
  assert.equal(data.caption, 'Отредактированный файл')
  assert.equal(rendered.includes('data-hcv-file-activity-counts'), false)
  assert.equal(rendered.includes('data-hcv-file-activity-name'), false)
})
