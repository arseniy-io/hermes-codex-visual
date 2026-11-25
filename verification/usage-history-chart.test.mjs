import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  stdin: {
    contents: `export { historyChartModel, historyShare, historyPeriodLabel, historyTransition, UsageHistoryCard } from './source/usage-history-chart.js';
      export { aggregateHistory, valueName, percent, dateLabel } from './source/usage-page.js';
      export { __render, __reset } from 'react'`,
    resolveDir: process.cwd(), loader: 'js',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'usage-history-test-stubs',
    setup(b) {
      b.onResolve({ filter: /^(react|@hermes\/plugin-sdk)$/ }, args => ({ path: args.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
        contents: args.path === 'react' ? `
          let state = [], cursor = 0;
          export const createElement = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x !== false && x !== null && x !== undefined) });
          export const Fragment = 'fragment', useEffect = () => {}, useLayoutEffect = () => {}, useId = () => '';
          export const useState = initial => { const i = cursor++; if (!(i in state)) state[i] = initial;
            return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; };
          export const useRef = initial => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; };
          export const __reset = () => { state = []; cursor = 0; };
          export const __render = (component, props) => { cursor = 0; return component(props); };`
          : 'export const host = {}, useValue = () => null, DropdownMenu = null, DropdownMenuContent = null, DropdownMenuItem = null, DropdownMenuTrigger = null', loader: 'js',
      }))
    },
  }],
})
globalThis.document = { documentElement: { lang: 'ru' } }
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
const history = {
  units: 'percent', start_date: '2026-11-17', end_date: '2026-11-19', data: [
    { date: '2026-11-17', attribution: [
      { thread_source: 'user', value: 4 }, { thread_source: 'subagent', value: 2 },
    ] },
    { date: '2026-11-18', attribution: [
      { thread_source: 'user', value: 1 }, { thread_source: 'subagent', value: 1 },
      { thread_source: 'aeon_child', value: 2 },
    ] },
    { date: '2026-11-19', attribution: [] },
  ],
}

test('legend changes from period totals to selected day without changing colors or stack order', () => {
  const whole = mod.historyChartModel(history, 'feature', mod.aggregateHistory)
  const selected = mod.historyChartModel(history, 'feature', mod.aggregateHistory, 1)
  assert.deepEqual(whole.categories.map(row => [row.name, row.share, row.color]), [
    ['chat', 50, '#66b5ff'], ['subagent', 30, '#f59a56'], ['agent_created_thread', 20, '#74d58b'],
  ])
  assert.deepEqual(selected.categories.map(row => [row.name, row.share, row.color]), [
    ['chat', 25, '#66b5ff'], ['subagent', 25, '#f59a56'], ['agent_created_thread', 50, '#74d58b'],
  ])
  assert.deepEqual(selected.stackedCategories.map(row => row.name), ['chat', 'subagent', 'agent_created_thread'])
  assert.equal(mod.historyShare(.03), '<0,1 %')
  assert.equal(mod.historyShare(50.04), '50 %')
  assert.equal(mod.historyShare(50.06), '50,1 %')
})

test('empty, missing and invalid usage are not invented or shown as percentages', () => {
  const empty = mod.historyChartModel(history, 'feature', mod.aggregateHistory, 2)
  assert.deepEqual(empty.categories.map(row => row.share), [null, null, null])
  assert.equal(mod.historyShare(empty.categories[0].share), '—')
  assert.equal(mod.historyChartModel({ ...history, units: 'credits' }, 'feature', mod.aggregateHistory), null)
  assert.equal(mod.historyChartModel({ ...history, data: [] }, 'feature', mod.aggregateHistory), null)
  assert.equal(mod.historyChartModel({ ...history, data: [{ attribution: null }] }, 'feature', mod.aggregateHistory), null)
  const incompleteHistory = { ...history, data: [history.data[0], { date: '2026-11-18', attribution: [
    { thread_source: 'user', value: 1 }, { thread_source: 'subagent', value: null },
  ] }] }
  const incomplete = mod.historyChartModel(incompleteHistory, 'feature', mod.aggregateHistory, 1)
  assert.equal(incomplete.incomplete, true)
  assert.ok(incomplete.categories.every(category => category.share === null))
  assert.ok(mod.historyChartModel(incompleteHistory, 'feature', mod.aggregateHistory).categories.every(category => category.share === null))
})

test('the range is formatted in UTC and shows its year', () => {
  const before = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const text = mod.historyPeriodLabel(history.start_date, history.end_date, mod.dateLabel)
    assert.match(text, /17/)
    assert.match(text, /19/)
    assert.match(text, /2026/)
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

test('period transition direction follows the previous and next periods', () => {
  assert.equal(mod.historyTransition({ start_date: '2026-11-20' }, { start_date: '2026-11-13' }), 'previous')
  assert.equal(mod.historyTransition({ start_date: '2026-11-13' }, { start_date: '2026-11-20' }), 'next')
  assert.equal(mod.historyTransition({ start_date: '2026-11-20' }, { start_date: '2026-11-20' }), null)
  assert.equal(mod.historyTransition({}, { start_date: '2026-11-20' }), null)
})

function find(node, attr) {
  if (!node || typeof node !== 'object') return []
  return [...(Object.prototype.hasOwnProperty.call(node.props, attr) ? [node] : []), ...node.children.flatMap(child => find(child, attr))]
}
function contents(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''
  return node.children.map(contents).join('')
}

test('hover previews a day, leaving restores the period, clicking pins it and Escape clears it', () => {
  mod.__reset()
  const props = { history, group: 'feature', offset: 0, onOffsetChange: () => {}, aggregateHistory: mod.aggregateHistory,
    valueName: mod.valueName, percent: mod.percent, dateLabel: mod.dateLabel,
    t: { previous: 'Назад', next: 'Вперёд', history: 'История', unavailable: 'Нет данных', incomplete: 'Неполные данные' } }
  const render = () => mod.__render(mod.UsageHistoryCard, props)
  let card = render()
  assert.match(contents(find(card, 'data-u-history-heading')[0]), /17.*19.*2026/)
  let days = find(card, 'data-u-history-day')
  days[1].props.onPointerEnter()
  card = render()
  assert.match(contents(find(card, 'data-u-history-heading')[0]), /18/)
  assert.equal(find(card, 'data-u-history-legend-item')[0].children[1].children[0], '25 %')
  assert.equal(find(card, 'data-u-history-day')[1].props['data-u-history-active'], '')
  find(card, 'data-u-history-plot')[0].props.onPointerLeave()
  card = render()
  assert.match(contents(find(card, 'data-u-history-heading')[0]), /17.*19.*2026/)
  days = find(card, 'data-u-history-day')
  days[1].props.onPointerEnter(); days[1].props.onFocus(); days[1].props.onClick()
  card = render()
  find(card, 'data-u-history-plot')[0].props.onPointerLeave()
  find(card, 'data-u-history-day')[1].props.onBlur()
  card = render()
  assert.match(contents(find(card, 'data-u-history-heading')[0]), /18/)
  let prevented = false
  find(card, 'data-u-history-day')[1].props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true } })
  card = render()
  assert.equal(prevented, true)
  assert.match(contents(find(card, 'data-u-history-heading')[0]), /17.*19.*2026/)
})

test('keyboard arrows, Home and End move through the days', () => {
  mod.__reset()
  const props = { history, group: 'feature', offset: 0, onOffsetChange: () => {}, aggregateHistory: mod.aggregateHistory,
    valueName: mod.valueName, percent: mod.percent, dateLabel: mod.dateLabel,
    t: { previous: 'Назад', next: 'Вперёд', history: 'История', unavailable: 'Нет данных', incomplete: 'Неполные данные' } }
  const card = mod.__render(mod.UsageHistoryCard, props)
  const days = find(card, 'data-u-history-day')
  let focused = null
  days.forEach((day, index) => day.props.ref({ focus: () => { focused = index } }))
  let prevented = false
  days[1].props.onKeyDown({ key: 'ArrowRight', preventDefault: () => { prevented = true } })
  assert.equal(focused, 2); assert.equal(prevented, true)
  days[1].props.onKeyDown({ key: 'Home', preventDefault() {} })
  assert.equal(focused, 0)
  days[1].props.onKeyDown({ key: 'End', preventDefault() {} })
  assert.equal(focused, 2)
  assert.deepEqual(days.map(day => day.props.tabIndex), [0, -1, -1])
})

test('an empty period is distinguished from an unavailable breakdown', () => {
  const props = { group: 'feature', offset: 0, onOffsetChange: () => {}, aggregateHistory: mod.aggregateHistory,
    valueName: mod.valueName, percent: mod.percent, dateLabel: mod.dateLabel,
    t: { previous: 'Назад', next: 'Вперёд', history: 'История', chartUnavailable: 'Разбивка недоступна',
      unavailable: 'Нет данных', incomplete: 'Неполные данные' } }
  mod.__reset()
  let card = mod.__render(mod.UsageHistoryCard, { ...props, history: { ...history, data: [] } })
  assert.equal(contents(find(card, 'data-u-history-unavailable')[0]), 'За этот период нет данных.')
  mod.__reset()
  card = mod.__render(mod.UsageHistoryCard, { ...props, history: { ...history, units: 'credits' } })
  assert.equal(contents(find(card, 'data-u-history-unavailable')[0]), 'Разбивка недоступна')
})
