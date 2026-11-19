import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html><body><button id="source" aria-controls="menu"></button><button id="anchor"></button><div id="wrapper" data-radix-popper-content-wrapper><div id="menu" data-state="open"></div></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const { window } = dom
window.menuWidths = { device: 280, git: 260 }
window.labels = () => ({ location: 'Работать в' })
const source = fs.readFileSync('source/draft-setup.js', 'utf8')
const node = source.slice(source.indexOf('function node('), source.indexOf('\nfunction icon('))
const functions = source.slice(source.indexOf('function position('), source.indexOf('\nfunction normalized('))
window.eval(node + '\n' + functions + '\nwindow.startNativeMenu = startNativeMenu')
const doc = window.document
const sourceButton = doc.getElementById('source')
const anchor = doc.getElementById('anchor')
const menu = doc.getElementById('menu')
const wrapper = doc.getElementById('wrapper')
anchor.getBoundingClientRect = () => ({ left: 400, right: 500, top: 600 })
const frame = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
const stop = window.startNativeMenu(sourceButton, anchor)
try {
  await frame()
  assert.equal(wrapper.style.getPropertyValue('--hcv-draft-left'), '400px')
  assert.equal(wrapper.style.getPropertyValue('--hcv-draft-bottom'), `${window.innerHeight - 596}px`)
  assert.equal(menu.getAttribute('data-hcv-draft-native-menu'), 'device')
  assert.equal(menu.querySelector('[data-hcv-draft-menu-heading]').textContent, 'Работать в')
  anchor.getBoundingClientRect = () => ({ left: 300, right: 400, top: 500 })
  window.dispatchEvent(new window.Event('resize'))
  await frame()
  assert.equal(wrapper.style.getPropertyValue('--hcv-draft-left'), '300px')
  stop()
  assert.equal(wrapper.style.getPropertyValue('--hcv-draft-left'), '')
  assert.equal(menu.hasAttribute('data-hcv-draft-native-menu'), false)
  assert.equal(anchor.getAttribute('aria-expanded'), 'false')
  console.log('Device menu positioning follows the anchor and cleans up on close.')
} finally {
  stop()
  dom.window.close()
}
