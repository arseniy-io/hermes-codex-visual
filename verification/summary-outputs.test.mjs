import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

// Use the same local React and DOM packages as the verified Desktop fixture.
const appRequire = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/hermes-agent/apps/desktop/package.json'))
const { JSDOM } = appRequire('jsdom')

test('output rows expand in Codex-sized batches, open, collapse, and reset for a new chat', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: 'https://example.invalid/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = appRequire('react')
  const { createRoot } = appRequire('react-dom/client')
  const result = await build({
    stdin: { contents: "export { CompactSummaryItems } from './source/summary-sources-view.js'", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'],
    plugins: [{
      name: 'stub-sdk',
      setup(builder) {
        builder.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'stub' }))
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: "export const useI18n = () => ({locale: 'ru'}); export const DropdownMenu = () => null, DropdownMenuContent = () => null, DropdownMenuItem = () => null, DropdownMenuTrigger = () => null;",
        }))
      },
    }],
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, appRequire)
  const { CompactSummaryItems } = module.exports
  const root = createRoot(document.querySelector('main'))
  try {
    const opened = []
    const rows = Array.from({ length: 63 }, (_, index) => ({
      kind: 'artifacts', key: String(index), name: `file-${index}`,
      action: { click() { opened.push(index) } },
    }))
    const render = key => React.createElement(CompactSummaryItems, {
      key, kind: 'outputs', rows, disclosure: { expanded: true, onToggle() {} },
      onOpenSource: row => row.action.click(),
    })
    const list = () => document.querySelector('ul')
    const toggle = () => document.querySelector('.hcv-summary-more')
    await React.act(() => root.render(render('chat-1')))
    assert.equal(list().children.length, 6)
    assert.equal(toggle().textContent, 'Показать ещё 50')
    assert.equal(toggle().getAttribute('aria-expanded'), 'false')
    assert.equal(toggle().getAttribute('aria-controls'), list().id)
    await React.act(() => toggle().click())
    assert.equal(list().children.length, 56)
    assert.equal(toggle().textContent, 'Показать ещё 7')
    await React.act(() => toggle().click())
    assert.equal(list().children.length, 63)
    assert.equal(toggle().textContent, 'Свернуть')
    assert.equal(toggle().getAttribute('aria-expanded'), 'true')
    for (const button of list().querySelectorAll('button')) await React.act(() => button.click())
    assert.deepEqual(opened, Array.from({ length: 63 }, (_, index) => index))
    await React.act(() => toggle().click())
    assert.equal(list().children.length, 6)
    await React.act(() => toggle().click())
    await React.act(() => root.render(render('chat-2')))
    assert.equal(list().children.length, 6)
    assert.equal(toggle().textContent, 'Показать ещё 50')
  } finally {
    await React.act(() => root.unmount())
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    dom.window.close()
  }
})
