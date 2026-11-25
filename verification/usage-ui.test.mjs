import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['source/usage-page.js'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'usage-ui-test-stubs',
    setup(b) {
      b.onResolve({ filter: /^(react|@hermes\/plugin-sdk)$/ }, args => ({ path: args.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
        contents: args.path === 'react'
          ? 'export const createElement=()=>null,Fragment=null,useEffect=()=>{},useLayoutEffect=()=>{},useId=()=>"",useRef=()=>({}),useState=()=>[]'
          : 'export const host={},useValue=()=>null,DropdownMenu=null,DropdownMenuContent=null,DropdownMenuItem=null,DropdownMenuTrigger=null',
        loader: 'js',
      }))
    },
  }],
})
globalThis.document = { documentElement: { lang: 'en' } }
const module = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'))

test('credit balance is shown as a whole number', () => {
  assert.equal(module.formatAmount('61567.74', 0), '61,568')
  assert.equal(module.formatAmount('61567.4', 0), '61,567')
})

test('the known full reset is translated and other reset types retain their title', () => {
  globalThis.document.documentElement.lang = 'ru'
  try {
    assert.equal(module.resetTitle({ reset_type: 'codex_rate_limits', title: 'Full reset' }), 'Полный сброс')
    assert.equal(module.resetTitle({ reset_type: 'other', title: 'Different reset' }), 'Different reset')
    assert.equal(module.resetTitle({ reset_type: 'other' }), 'Сброс лимита')
  } finally {
    globalThis.document.documentElement.lang = 'en'
  }
})

test('the same OpenAI category is labelled by its actual grouping', () => {
  globalThis.document.documentElement.lang = 'ru'
  try {
    assert.equal(module.valueName('user', 'feature'), 'Чаты')
    assert.equal(module.valueName('user', 'trigger'), 'Пользователь')
    assert.equal(module.valueName('memory_consolidation', 'feature'), 'Обновления памяти')
    assert.equal(module.valueName('thread_description', 'feature'), 'Описания чатов')
    assert.equal(module.valueName('desktop_app', 'surface'), 'Codex Desktop')
    assert.equal(module.valueName('sdk', 'surface'), 'SDK')
    assert.equal(module.valueName('user', 'model'), 'user')
  } finally {
    globalThis.document.documentElement.lang = 'en'
  }
})

test('small nonzero usage remains visible and category aliases are merged', () => {
  assert.equal(module.percent(0), '0 %')
  assert.equal(module.percent(0.004), '< 0.01 %')
  assert.equal(module.percent(0.02), '0.02 %')
  assert.deepEqual(module.mergePlanBreakdown([
    { key: 'user', basis_points: 20 }, { key: 'chat', basis_points: 30 },
    { key: 'aeon_child', basis_points: 40 }, { key: 'agent_created_thread', basis_points: 10 },
    { key: 'memory', basis_points: 6 }, { key: 'memory_consolidation', basis_points: 4 },
    { key: 'title_generation', basis_points: 1 }, { key: 'thread_title', basis_points: 2 },
  ], 'feature'), [{ key: 'chat', basis_points: 50 }, { key: 'agent_created_thread', basis_points: 50 },
    { key: 'memory_consolidation', basis_points: 10 }, { key: 'thread_title', basis_points: 3 }])
})

test('UTC usage days do not shift to the previous date in a western time zone', () => {
  const before = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(module.dateLabel('2026-11-19', { day: 'numeric', month: 'short', year: 'numeric' }), 'Nov 19, 2026')
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

test('history aggregates actual daily values, merges child chats and preserves missing data', () => {
  const result = module.aggregateHistory([
    { date: '2026-11-17', attribution: [
      { thread_source: 'chat', model: 'sol', value: 2 },
      { thread_source: 'aeon_child', model: 'terra', value: 1 },
    ] },
    { date: '2026-11-18', attribution: [
      { thread_source: 'agent_created_thread', model: 'terra', value: '3' },
      { thread_source: 'chat', model: 'sol', value: 4 },
    ] },
    { date: '2026-11-19', attribution: null },
  ], 'feature')
  assert.equal(result.available, true)
  assert.equal(result.incomplete, true)
  assert.equal(result.total, 10)
  assert.deepEqual(result.categories, [['chat', 6], ['agent_created_thread', 4]])
  assert.deepEqual(result.stackOrder, ['agent_created_thread', 'chat'])
  assert.equal(result.chart[2].available, false)
  const models = module.aggregateHistory([{ attribution: [{ model: 'a', value: 2 }, { model: 'b', value: 3 }] }], 'model')
  assert.deepEqual(models.categories, [['b', 3], ['a', 2]])
})

test('history uses source keys for stacking but ranks colors by usage', () => {
  const result = module.aggregateHistory([{ date: '2026-11-17', attribution: [
    { thread_source: 'user', value: 9 }, { thread_source: 'subagent', value: 5 },
    { thread_source: 'aeon_child', value: 3 },
  ] }], 'feature')
  assert.deepEqual(result.categories.map(([name]) => name), ['chat', 'subagent', 'agent_created_thread'])
  assert.deepEqual(result.stackOrder, ['agent_created_thread', 'subagent', 'chat'])
})

test('unknown and empty amounts are not presented as zero', () => {
  assert.equal(module.formatAmount(null), '—')
  assert.equal(module.formatAmount(''), '—')
  assert.equal(module.formatAmount(0), '0')
  assert.equal(module.aggregateHistory([{ attribution: null }], 'feature').available, false)
  assert.equal(module.aggregateHistory([{ attribution: [] }], 'feature').available, true)
})

test('model breakdown uses weekly values and does not relabel credit shares', () => {
  const usage = { data_status: 'available', weekly_limit_percent: 2, balance_usage_credits: '0',
    groups: [{ model: 'sol', weekly_limit_percent: 1.5 }, { model: 'terra', weekly_limit_percent: 0.5 }] }
  assert.deepEqual(module.groupUsage(usage, 'model'), [{ name: 'sol', share: 75 }, { name: 'terra', share: 25 }])
  const credits = { data_status: 'available', weekly_limit_percent: 0, balance_usage_credits: '4',
    groups: [{ model: 'sol', balance_usage_credits: '3' }, { model: 'terra', balance_usage_credits: '1' }] }
  assert.deepEqual(module.groupUsage(credits, 'model'), [{ name: 'sol', share: null }, { name: 'terra', share: null }])
  assert.deepEqual(module.groupUsage({ ...usage, data_status: 'unavailable' }, 'model'), [])
  assert.deepEqual(module.groupUsage({ ...usage, groups: [{ model: 'sol', weekly_limit_percent: null }] }, 'model'),
    [{ name: 'sol', share: null }])
})
