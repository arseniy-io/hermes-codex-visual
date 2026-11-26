import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const project = process.env.HCV_MODEL_SPEED_REPOSITORY || path.resolve(import.meta.dirname, '..')
const source = process.env.HCV_MODEL_SPEED_SOURCE || path.join(project, 'source/model-speed.js')
const projectRequire = createRequire(path.join(project, 'package.json'))
const { build } = projectRequire('esbuild')
const atom = initial => {
  let value = initial
  const listeners = new Set()
  return { get: () => value, set: next => { value = next; for (const fn of listeners) fn(next) },
    listen: fn => { listeners.add(fn); return () => listeners.delete(fn) } }
}
const host = { state: { connectionId: atom('local'), profile: atom('default') } }
globalThis.__hcvTestHost = host
globalThis.__hcvTestReact = React
let cachedCatalog
const catalogRefreshes = []
const catalogKey = ['model-options', 'default', 'fixture-session', 'owner', 'local']
globalThis.__hcvTestQueryClient = {
  getQueryCache: () => ({
    find: ({ queryKey, exact }) => exact && JSON.stringify(queryKey) === JSON.stringify(catalogKey) ? cachedCatalog : null,
    subscribe: () => () => {},
  }),
  refetchQueries: async options => { catalogRefreshes.push(options) },
}
// Bundle the real source and real committedFiber, replacing only host SDK/React imports.
const bundled = await build({
  stdin: { contents: `export { registerModelSpeed } from ${JSON.stringify(source)};
    export { registerStyleScope } from ${JSON.stringify(path.join(path.dirname(source), 'style-scope.js'))};`,
    resolveDir: project, sourcefile: 'model-speed-test-entry.js' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'test-only-host', setup(plugin) {
    plugin.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'test-only' }))
    plugin.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'test-only' }))
    plugin.onLoad({ filter: /.*/, namespace: 'test-only' }, args => ({ contents: args.path === 'sdk'
      ? 'export const host = globalThis.__hcvTestHost; export const queryClient = globalThis.__hcvTestQueryClient'
      : 'export const { version, createElement, isValidElement, useSyncExternalStore } = globalThis.__hcvTestReact',
      loader: 'js' }))
  } }],
})
const { registerModelSpeed, registerStyleScope } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'))
const h = React.createElement
const wait = () => new Promise(resolve => setTimeout(resolve, 100))

test('options label native speed and effort controls, even when the fast catalog loads late', async () => {
  const dom = new JSDOM('<html lang="ru" data-hermes-theme="Codex"><head></head><body><main></main></body></html>', {
    pretendToBeVisual: true, url: 'https://localhost/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.location = dom.window.location
  globalThis.Node = dom.window.Node
  globalThis.Element = dom.window.Element
  globalThis.MutationObserver = dom.window.MutationObserver
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
  const SessionView = React.createContext(null)
  const model = atom('gpt-6.2-sol'), fast = atom(false), tier = atom('normal'), catalogAvailable = atom(false), resetVisible = atom(true), showMenu = atom(true)
  const view = { $model: model, $fast: fast, $serviceTier: tier, $runtimeId: atom('fixture-session') }
  cachedCatalog = {
    queryKey: catalogKey,
    state: { status: 'success', fetchStatus: 'idle', data: {
      providers: [{ slug: 'openai-codex', capabilities: { 'gpt-6.2-sol': { fast: false, ultrafast: false }, 'gpt-6.1-terra': { fast: false, ultrafast: false } } }],
    } },
  }
  const useAtom = a => React.useSyncExternalStore(a.listen, a.get, a.get)
  function Pill() {
    const state = React.useContext(SessionView)
    const selected = useAtom(state.$serviceTier), on = useAtom(state.$fast)
    const slug = useAtom(state.$model)
    const text = `${slug.endsWith('-fast') ? 'GPT-6.2-sol' : slug}${selected === 'ultrafast' ? ' · Ultrafast' : on || slug.endsWith('-fast') ? ' · Fast' : ''}`
    const tooltip = `Модель · ChatGPT or Codex Subscription: ${slug}`
    return h('div', { 'data-slot': 'composer-surface' },
      h('button', { 'data-tour': 'model-pill', 'aria-describedby': 'model-tooltip', 'aria-label': tooltip }, h('span', { className: 'truncate' }, text),
        h('span', { 'data-testid': 'model-pinned-dot', role: 'img', 'aria-label': 'Модель закреплена' })),
      h('button', { 'data-testid': 'reasoning-pill', 'aria-label': 'Усилия: Максимум (на этом маршруте отправляется Очень высокое)' },
        h('span', null, 'Max→XHigh')),
      h('div', { 'data-slot': 'tooltip-content' },
        h('div', { 'data-slot': 'tooltip-label' }, tooltip),
        h('span', { role: 'tooltip', id: 'model-tooltip' }, tooltip)))
  }
  function ModelOptions(props) {
    const selected = useAtom(tier)
    const available = useAtom(catalogAvailable)
    const offerReset = useAtom(resetVisible)
    // Approximate the host menu's own arrow navigation for ordinary items;
    // the plugin has to insert Standard between those native items.
    const nativeArrows = event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
      const current = event.target.closest('[role^="menuitem"]')
      const items = [...event.currentTarget.children].filter(node => node.matches('[role^="menuitem"]'))
      const next = items[items.indexOf(current) + (event.key === 'ArrowDown' ? 1 : -1)]
      if (next) { event.preventDefault(); next.focus() }
    }
    return h('div', { 'data-slot': 'dropdown-menu-sub-content', onKeyDown: nativeArrows },
      h('div', { 'data-slot': 'dropdown-menu-label' }, 'Опции'),
      h('div', { 'data-slot': 'dropdown-menu-item', role: 'menuitem', tabIndex: -1, 'data-previous-option': '' }, 'Размышление'),
      available ? h('div', { 'data-slot': 'dropdown-menu-item', role: 'menuitem', tabIndex: -1 }, 'Быстрая',
        h('button', { 'data-slot': 'switch', role: 'switch', 'aria-label': 'Быстрая',
          'aria-checked': selected === 'priority', onClick: () => { const value = tier.get() === 'priority' ? 'normal' : 'priority'; tier.set(value); fast.set(value !== 'normal') } })) : null,
      available ? h('div', { 'data-slot': 'dropdown-menu-item', role: 'menuitem', tabIndex: -1 }, 'Ультрабыстрая',
        h('button', { 'data-slot': 'switch', role: 'switch', 'aria-label': 'Ультрабыстрая',
          'aria-checked': selected === 'ultrafast', onClick: () => { const value = tier.get() === 'ultrafast' ? 'normal' : 'ultrafast'; tier.set(value); fast.set(value !== 'normal') } })) : null,
      !available && selected !== 'normal' && offerReset ? h('div', { 'data-slot': 'dropdown-menu-item', role: 'menuitem',
        'data-native-standard': '', onClick: () => { tier.set('normal'); fast.set(false) } }, 'Использовать стандартную скорость') : null,
      h('div', { 'data-slot': 'dropdown-menu-separator', role: 'separator' }),
      h('div', { 'data-slot': 'dropdown-menu-radio-item', role: 'menuitemradio', tabIndex: -1 }, 'Максимум (на этом маршруте отправляется Очень высокое)'))
  }
  function Catalog(props) {
    React.useContext(SessionView)
    const serviceTier = useAtom(tier)
    return h(ModelOptions, { model: useAtom(model), provider: 'openai-codex', serviceTier, onSetOptions: patch => {
      tier.set(patch.serviceTier)
      fast.set(patch.serviceTier !== 'normal')
    } })
  }
  function App() {
    const show = useAtom(showMenu)
    return h(SessionView.Provider, { value: view }, h(Pill),
      show && h(Catalog, { profile: 'default', ownerConnectionId: 'local', requestGateway() {} }))
  }
  const reactRoot = createRoot(document.querySelector('main'))
  reactRoot.render(h(App))
  await wait()
  const disposers = [], requests = []
  const ctx = { onDispose: fn => disposers.push(fn), addEventListener: (target, name, fn) => {
    target.addEventListener(name, fn); disposers.push(() => target.removeEventListener(name, fn))
  }, rest: async path => {
    requests.push(path)
    return { models: { 'gpt-6.2-sol': { fast: { multiplier: 2, increased_usage: true } } } }
  } }
  registerStyleScope(ctx, 'Codex')
  registerModelSpeed(ctx, 'html[data-hermes-theme="Codex"]')
  await wait()
  const button = document.querySelector('[data-tour="model-pill"]')
  const label = button.querySelector('span')
  const pinDot = button.querySelector('[data-testid="model-pinned-dot"]')
  assert.equal(window.getComputedStyle(pinDot).display, 'none')
  assert.equal(document.querySelector('[data-slot="tooltip-label"]').textContent, 'Модель GPT-6.2 Sol')
  assert.equal(document.querySelector('#model-tooltip').textContent, 'Модель GPT-6.2 Sol')
  assert.equal(button.getAttribute('aria-label'), 'Модель ChatGPT or Codex Subscription: gpt-6.2-sol')
  assert.equal(label.textContent, 'GPT-6.2 Sol')
  assert.equal(label.dataset.hcvModelLabel, 'GPT-6.2 Sol')
  assert.equal(button.dataset.hcvModelSpeed, undefined)
  assert.equal(document.querySelector('[data-hcv-standard-speed]').getAttribute('aria-checked'), 'true')
  assert.equal(document.querySelector('[data-hcv-standard-speed]').getAttribute('aria-disabled'), 'true')
  assert.equal(document.querySelector('[data-hcv-speed-heading]').textContent, 'Скорость')
  assert.equal(document.querySelector('[data-hcv-speed-option]'), null)
  assert.deepEqual(catalogRefreshes, [{ queryKey: catalogKey, exact: true, type: 'active' }])
  // An empty result more than once must still be retried. Closing the menu
  // cancels future attempts; reopening and changing the model starts its own.
  await new Promise(resolve => setTimeout(resolve, 1150))
  assert.equal(catalogRefreshes.length, 2)
  showMenu.set(false)
  await wait()
  await new Promise(resolve => setTimeout(resolve, 1150))
  assert.equal(catalogRefreshes.length, 2)
  showMenu.set(true)
  await wait()
  assert.equal(catalogRefreshes.length, 3)
  model.set('gpt-6.1-terra')
  await wait()
  assert.equal(catalogRefreshes.length, 4)
  model.set('gpt-6.2-sol')
  await wait()
  assert.equal(catalogRefreshes.length, 5)
  catalogAvailable.set(true)
  await wait()
  await new Promise(resolve => setTimeout(resolve, 1150))
  assert.equal(catalogRefreshes.length, 5)
  await wait()
  const standard = document.querySelector('[data-hcv-standard-speed]')
  assert.equal(standard.hasAttribute('aria-disabled'), false)
  const previous = document.querySelector('[data-previous-option]')
  previous.focus()
  previous.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
  assert.equal(document.activeElement, standard)
  standard.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }))
  assert.equal(document.activeElement, previous)
  standard.focus()
  standard.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
  assert.equal(document.activeElement.dataset.hcvSpeedOption, 'fast')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
  assert.equal(document.activeElement.dataset.hcvSpeedOption, 'ultrafast')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
  assert.equal(document.activeElement.getAttribute('data-slot'), 'dropdown-menu-radio-item')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }))
  assert.equal(document.activeElement.dataset.hcvSpeedOption, 'ultrafast')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }))
  assert.equal(document.activeElement.dataset.hcvSpeedOption, 'fast')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }))
  assert.equal(document.activeElement, standard)
  assert.equal(document.querySelector('[data-hcv-speed-option="fast"] [data-hcv-speed-description]').textContent, 'Скорость 2×\nЛимит и кредиты 2×')
  assert.match(document.querySelector('[data-hcv-speed-option="ultrafast"] [data-hcv-speed-description]').textContent, /^Скорость до 4,5×\nЛимит.*6×/u)
  assert.equal(document.querySelector('[data-testid="reasoning-pill"] > span').textContent, 'Max')
  assert.equal(document.querySelector('[data-testid="reasoning-pill"]').getAttribute('aria-label'), 'Усилия: Max')
  assert.equal(document.querySelector('[data-slot="dropdown-menu-radio-item"]').textContent, 'Max')
  assert.deepEqual(requests, [])
  document.querySelector('[aria-label="Быстрая"]').click()
  await wait()
  assert.equal(button.dataset.hcvModelSpeed, 'fast')
  assert.equal(label.dataset.hcvModelLabel, 'GPT-6.2 Sol')
  assert.equal(document.querySelector('[data-hcv-standard-speed]').getAttribute('aria-checked'), 'false')
  document.querySelector('[aria-label="Ультрабыстрая"]').click()
  await wait()
  assert.equal(button.dataset.hcvModelSpeed, 'ultrafast')
  assert.equal(label.dataset.hcvModelLabel, 'GPT-6.2 Sol')
  document.querySelector('[data-hcv-standard-speed]').click()
  await wait()
  assert.equal(button.dataset.hcvModelSpeed, undefined)
  assert.equal(document.querySelector('[data-hcv-standard-speed]').getAttribute('aria-checked'), 'true')
  model.set('gpt-6.2-sol-fast')
  await wait()
  assert.equal(button.dataset.hcvModelSpeed, undefined)
  assert.equal(label.dataset.hcvModelLabel, 'GPT-6.2 Sol · Fast')
  model.set('gpt-6.2-sol')
  await wait()
  host.state.profile.set('different')
  await wait()
  assert.deepEqual(requests, [])
  tier.set('ultrafast'); fast.set(true); catalogAvailable.set(false)
  await wait()
  assert.equal(document.querySelector('[data-hcv-standard-speed]'), null)
  assert.equal(document.querySelector('[data-native-standard]').textContent, 'Использовать стандартную скорость')
  document.querySelector('[data-native-standard]').click()
  await wait()
  assert.equal(tier.get(), 'normal')
  assert.equal(button.hasAttribute('data-hcv-model-speed'), false)
  tier.set('ultrafast'); fast.set(true); resetVisible.set(false)
  await wait()
  const activeStandard = document.querySelector('[data-hcv-standard-speed]')
  assert.equal(activeStandard.getAttribute('aria-checked'), 'false')
  activeStandard.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }))
  await wait()
  assert.equal(tier.get(), 'normal')
  assert.equal(activeStandard.getAttribute('aria-checked'), 'true')
  assert.equal(catalogRefreshes.length, 6)
  document.documentElement.dataset.hermesTheme = 'other'
  await wait()
  assert.equal(document.querySelector('[data-hcv-standard-speed]'), null)
  assert.notEqual(window.getComputedStyle(pinDot).display, 'none')
  assert.equal(button.getAttribute('aria-label'), 'Модель · ChatGPT or Codex Subscription: gpt-6.2-sol')
  assert.equal(document.querySelector('[data-hcv-speed-heading]'), null)
  assert.equal(document.querySelector('[data-testid="reasoning-pill"] > span').textContent, 'Max→XHigh')
  assert.equal(document.querySelector('[data-slot="dropdown-menu-radio-item"]').textContent, 'Максимум (на этом маршруте отправляется Очень высокое)')
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(button.hasAttribute('data-hcv-model-speed'), false)
  reactRoot.unmount()
  dom.window.close()
})
