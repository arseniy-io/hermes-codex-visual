import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Render the actual components with a local locale fixture. No app state or
// network is touched, and the same components are reused across language changes.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const dom = new JSDOM('<html lang="ru"><body><main id="meter"></main><main id="chrome"></main></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const { window } = dom
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
let locale = 'ru'
Object.assign(window, {
  h: React.createElement, Fragment: React.Fragment, useState: React.useState,
  useEffect: React.useEffect, useLayoutEffect: React.useLayoutEffect,
  useI18n: () => ({ locale }), useTheme: () => ({ themeName: 'test' }),
  Tip: ({ label, children }) => React.createElement('div', null, label, children),
  WindowMenus: ({ menus, label }) => React.createElement('nav', { 'aria-label': label },
    menus.map(([id, name, items]) => React.createElement('section', { key: id },
      React.createElement('strong', null, name), items.map(([title], index) => title && React.createElement('span', { key: index }, title))))),
  NativeRecentRows: () => null, icon: () => null, host: {},
  newChat: () => {}, edit: () => {}, openGrouping: () => {}, visibleControl: () => null,
  filterSelector: '', windowMenuShortcut: () => () => '',
})
const meterSource = fs.readFileSync('source/context-meter.js', 'utf8')
const chromeSource = fs.readFileSync('source/chrome.js', 'utf8')
window.eval(meterSource.slice(meterSource.indexOf('const numbers ='), meterSource.indexOf('\nfunction ContextMeter()')) + '\nwindow.ContextReadout = ContextReadout')
window.eval(chromeSource.slice(chromeSource.indexOf('function WindowChrome('), chromeSource.indexOf('\nfunction element(')) + '\nwindow.WindowChrome = WindowChrome')
const meter = createRoot(window.document.getElementById('meter'))
const chrome = createRoot(window.document.getElementById('chrome'))
const render = () => React.act(async () => {
  meter.render(React.createElement(window.ContextReadout, { context: { used: 64000, max: 256000 } }))
  chrome.render(React.createElement(window.WindowChrome, { themeName: 'test', recentRows: {} }))
})
try {
  await render()
  assert.equal(document.querySelector('[data-hcv-context-meter]').getAttribute('aria-label'), 'Использование контекста: 25%')
  assert.match(document.querySelector('[data-hcv-context-detail]').textContent, /Использовано 64 к \/ 256 к токенов/)
  assert.equal(document.querySelector('nav').getAttribute('aria-label'), 'Меню окна')
  assert.match(document.querySelector('nav').textContent, /Файл.*Новый чат.*Справка/)
  locale = 'en-US'
  await render()
  assert.equal(document.querySelector('[data-hcv-context-meter]').getAttribute('aria-label'), 'Context usage: 25%')
  assert.match(document.querySelector('[data-hcv-context-detail]').textContent, /25% used \(75% left\).*Used 64k \/ 256k tokens/)
  assert.equal(document.querySelector('nav').getAttribute('aria-label'), 'Window menu')
  assert.match(document.querySelector('nav').textContent, /File.*New chat.*Help/)
  assert.equal(document.querySelector('[data-hcv-history] button').getAttribute('aria-label'), 'Back')
  locale = 'ru'
  await render()
  assert.equal(document.querySelector('[data-hcv-context-meter]').getAttribute('aria-label'), 'Использование контекста: 25%')
  assert.equal(document.querySelector('nav').getAttribute('aria-label'), 'Меню окна')
  console.log('Context meter and window menu switch languages without remounting.')
} finally {
  await React.act(async () => { meter.unmount(); chrome.unmount() })
  dom.window.close()
}
