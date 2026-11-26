import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const atom = value => {
  const listeners = new Set()
  return { get: () => value, set: next => { value = next; for (const fn of listeners) fn(next) },
    listen: fn => { listeners.add(fn); return () => listeners.delete(fn) } }
}
const host = { state: {}, getGateway: () => null, notify: () => {} }
globalThis.__hcvActivityTestSdk = { host, atom }
const result = await build({
  entryPoints: [process.env.HCV_ACTIVITY_CENTER_SOURCE || 'source/activity-center.js'], bundle: true, write: false,
  platform: 'node', format: 'esm', plugins: [{ name: 'activity-ui-test', setup(b) {
    b.onResolve({ filter: /^(react|@hermes\/plugin-sdk)$|^\.\/(codex-reference|style-scope)\.js$/ }, args => ({ path: args.path, namespace: 'activity-stub' }))
    b.onLoad({ filter: /.*/, namespace: 'activity-stub' }, args => ({ loader: 'js', contents:
      args.path === 'react' ? 'export const createElement=(type,props,...children)=>({type,props,children})'
        : args.path === '@hermes/plugin-sdk' ? `export const {host,atom}=globalThis.__hcvActivityTestSdk;
            export const useValue=value=>value.get();export const Button='Button',Dialog='Dialog',DialogContent='DialogContent',
            DialogDescription='DialogDescription',DialogHeader='DialogHeader',DialogTitle='DialogTitle',TITLEBAR_AREAS={center:'center'};`
          : args.path.includes('codex-reference') ? 'export const codexMask=()=>"none"'
            : 'export const mountCSS=()=>{}' }))
  } }],
})
const ui = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'))
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const skill = { id: 'aaaabbbb', kind: 'skills', names: ['check-post'], version: 'v1', summary: 'Three file changes', origin: 'background_review', created_at: 1795078068 }
const memory = { id: 'ccccdddd', kind: 'memory', names: [], version: 'v2', summary: 'A note', origin: 'background_review', created_at: 1795078069 }
const snapshot = (items = [skill, memory], scope = 'scope-default', invalid_count = 0) => ({ schema: 1, scope, items, invalid_count,
  history_available: true, running: [], recent: [] })
const detail = (item = skill, scope = 'scope-default') => ({ ...item, scope, signature: 'signature-' + item.id,
  applicable: true, reason: '', preview: '## op 1/3: SKILL.md\n-full before\n+full after\n\n## op 2/3: references/check.md\n+all details\n\n## op 3/3: references/final.md\n+Последняя строка',
  explanation: { status: 'ready', text: 'Проверять результат и сохранять подтверждённые сведения.' },
  changes: [{ name: 'check-post', file: 'SKILL.md', action: 'patch', before: 'full before', after: 'full after',
    fragments: [{ before: 'before', after: 'after' }] }] })

function setup(rest) {
  const dom = new JSDOM('<!doctype html><html lang="ru" data-hermes-theme="codex-workspace"><body><header data-hcv-sidebar-bar><span>Hermes</span><button data-hcv-notifications>Bell</button></header></body></html>', { url: 'https://fixture.local' })
  const names = ['document', 'window', 'localStorage', 'MutationObserver']
  const before = new Map(names.map(name => [name, globalThis[name]]))
  for (const name of names) globalThis[name] = name === 'document' ? dom.window.document : name === 'window' ? dom.window : dom.window[name]
  host.state = { connectionId: atom('local'), profile: atom('default'), gateway: atom('open') }
  const socket = {}
  host.getGateway = () => socket
  const notices = []
  host.notify = input => notices.push(input)
  const disposers = [], calls = []
  let contribution
  const ctx = { rest: async (route, options) => { calls.push({ route, options }); return rest(route, options) },
    onDispose: fn => disposers.push(fn), register: value => { contribution = value }, onEvent: () => {},
    addEventListener: (target, name, fn) => { target.addEventListener(name, fn); disposers.push(() => target.removeEventListener(name, fn)) } }
  const controller = ui.registerActivityCenter(ctx, ':root[data-hermes-theme="codex-workspace"]')
  const model = () => contribution.render().props.model.get()
  const view = () => { const element = contribution.render(); return element.type(element.props) }
  return { dom, controller, model, view, notices, calls, cleanup: () => {
    for (const dispose of disposers.reverse()) dispose()
    dom.window.close()
    for (const [name, value] of before) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value }
  } }
}

test('unknown queue is ?, then the global button shows readable pending without a chat', async () => {
  const query = deferred(), e = setup(() => query.promise)
  try {
    assert.equal(document.querySelector('[data-hcv-activity-count]').textContent, '?')
    query.resolve(snapshot())
    await flush()
    assert.equal(document.querySelector('[data-hcv-activity-count]').textContent, '2')
    assert.equal(document.querySelector('[data-hcv-activity-button]').nextElementSibling.dataset.hcvNotifications, '')
    assert.equal(e.notices.length, 1)
    await e.controller.refresh()
    assert.equal(e.notices.length, 1, 'polling must not repeat a notice for the same versions')
    e.controller.open()
    await flush()
    assert(e.model().open)
    assert.equal(e.calls.every(call => !('session_id' in (call.options?.body || {}))), true)
  } finally { e.cleanup() }
})

test('late old-profile responses never become a new-profile snapshot', async () => {
  const query = deferred()
  let n = 0
  const e = setup(() => ++n === 1 ? query.promise : snapshot([memory], 'scope-writer'))
  try {
    host.state.profile.set('writer')
    await flush()
    assert.equal(e.model().snapshot?.scope, 'scope-writer', 'switching must not wait for the previous list')
    query.resolve(snapshot([skill]))
    await flush()
    assert.equal(e.model().profile, 'writer')
    assert.equal(e.model().snapshot.scope, 'scope-writer')
    assert.deepEqual(e.model().snapshot.items.map(item => item.id), ['ccccdddd'])
    assert.equal(e.notices.length, 1)
    assert.match(e.notices[0].message, /writer/)
  } finally { e.cleanup() }
})

test('complete detail is required and unknown decisions stay locked until refresh and new review', async () => {
  let behavior = 'unknown'
  let items = [skill, memory]
  const e = setup((route, options) => {
    if (route === '/activity') return snapshot(items)
    if (route === '/activity/skills/aaaabbbb') return detail()
    if (options?.method === 'POST') {
      if (behavior === 'unknown') throw new Error('transport timeout')
      items = [memory]
      return { scope: 'scope-default', status: 'approved' }
    }
    throw new Error(route)
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
    await e.controller.inspect(skill)
    assert.match(e.model().detail.preview, /op 3\/3/)
    assert.match(e.model().detail.preview, /Последняя строка/)
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 1)
    assert.deepEqual(e.model().locked, ['skills:aaaabbbb'])
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 1)
    await e.controller.refresh(true)
    assert.equal(e.model().selected, null)
    behavior = 'success'
    await e.controller.inspect(skill)
    await e.controller.decide('approve')
    assert.deepEqual(e.calls.filter(call => call.options?.method === 'POST').at(-1).options.body,
      { scope: 'scope-default', version: 'v1', signature: 'signature-aaaabbbb' })
    assert.equal(e.model().snapshot.items.length, 1)
    assert.match(e.model().message, /принято/)
  } finally { e.cleanup() }
})

test('reopening shows the saved explanation while the source is being checked', async () => {
  const checked = deferred()
  let reopened = false
  const e = setup(route => route === '/activity' ? snapshot() : reopened ? checked.promise : detail())
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    e.controller.close()
    e.controller.open()
    await flush()
    reopened = true
    const request = e.controller.inspect(skill)
    assert.equal(e.model().busy, 'detail')
    assert.match(JSON.stringify(e.view()), /Проверять результат и сохранять подтверждённые сведения/)
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
    checked.resolve({ ...detail(), signature: 'changed-source',
      explanation: { status: 'ready', text: 'Пояснение изменённой правки.' } })
    await request
    assert.match(JSON.stringify(e.view()), /Пояснение изменённой правки/)
    assert.equal(e.controller.savedExplanation(skill).text, 'Пояснение изменённой правки.')
    assert.equal(e.controller.savedExplanation({ ...skill, version: 'replaced' }), null)
  } finally { e.cleanup() }
})

test('a pending explanation blocks the decision and navigation changes clear it', async () => {
  const e = setup(route => route === '/activity' ? snapshot() :
    { ...detail(), explanation: { status: 'pending', text: '' } })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
    e.controller.back()
    e.controller.section('recent')
    e.controller.filter('memory')
    assert.equal(e.model().section, 'recent')
    assert.equal(e.model().filter, 'memory')
    assert.equal(e.model().detail, null)
    e.controller.close()
    e.controller.open()
    assert.equal(e.model().section, 'proposals')
    assert.equal(e.model().filter, 'all')
  } finally { e.cleanup() }
})

test('invalid records keep the count unknown; stale detail does not enable a decision', async () => {
  const e = setup(route => route === '/activity' ? snapshot([skill], 'scope-default', 1) : { ...detail(), version: 'changed' })
  try {
    await flush()
    assert.equal(document.querySelector('[data-hcv-activity-count]').textContent, '?')
    await e.controller.inspect(skill)
    assert.equal(e.model().detail, null)
    await e.controller.decide('reject')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
  } finally { e.cleanup() }
})

test('disconnect clears a loaded preview even when the gateway object is reused', async () => {
  const e = setup(route => route === '/activity' ? snapshot() : detail())
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    assert(e.model().detail)
    host.state.gateway.set('closed')
    assert.equal(e.model().snapshot, null)
    assert.equal(e.model().detail, null)
    assert.equal(e.model().open, false)
    assert.equal(document.querySelector('[data-hcv-activity-count]').textContent, '?')
    const before = e.calls.length
    await e.controller.decide('approve')
    await e.controller.refresh(true)
    assert.equal(e.calls.length, before, 'disconnected calls must not reach REST')
    host.state.gateway.set('open')
    await flush()
    assert.equal(e.model().snapshot.items.length, 2)
    assert.equal(e.model().detail, null, 'reconnect needs a new explicit review')
    assert.equal(e.notices.length, 1, 'reconnecting the same backend scope must not repeat its notice')
  } finally { e.cleanup() }
})

test('notification deduplication includes the authoritative backend scope', async () => {
  let scope = 'scope-one'
  const e = setup(() => snapshot([skill], scope))
  try {
    await flush()
    assert.equal(e.notices.length, 1)
    scope = 'scope-two'
    await e.controller.refresh(true)
    assert.equal(e.notices.length, 2, 'a replaced backend profile must not inherit another queue’s seen marker')
    assert.notEqual(e.notices[0].id, e.notices[1].id)
  } finally { e.cleanup() }
})

test('unload removes the button and does not announce a late response', async () => {
  const query = deferred(), e = setup(() => query.promise)
  e.cleanup()
  query.resolve(snapshot())
  await flush()
  assert.equal(e.notices.length, 0)
})

for (const action of ['approve', 'reject', 'explanation']) test('profile switch during ' + action + ' refreshes immediately', async () => {
  const pending = deferred()
  const e = setup((route, options) => {
    if (options?.method === 'POST') return pending.promise
    if (route === '/activity') return host.state.profile.get() === 'writer'
      ? snapshot([memory], 'scope-writer') : snapshot([skill])
    return { ...detail(), explanation: { status: action === 'explanation' ? 'error' : 'ready', text: '' } }
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    const request = action === 'explanation' ? e.controller.retryExplanation() : e.controller.decide(action)
    host.state.profile.set('writer')
    await flush()
    assert.equal(e.model().snapshot?.scope, 'scope-writer', 'switching must not wait for the previous action')
    pending.resolve(action === 'explanation' ? { scope: 'scope-default', explanation: { status: 'ready', text: 'OK' } }
      : { scope: 'scope-default', status: action === 'approve' ? 'approved' : 'rejected' })
    await request
    await flush()
    assert.equal(e.model().snapshot?.scope, 'scope-writer')
    assert.equal(e.model().open, false)
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 1)
  } finally { e.cleanup() }
})

test('an explicit refresh requested during an explanation retry is not lost', async () => {
  const pending = deferred()
  const e = setup((route, options) => options?.method === 'POST' ? pending.promise : route === '/activity'
    ? snapshot([skill]) : { ...detail(), explanation: { status: 'error', text: '' } })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    const retry = e.controller.retryExplanation()
    e.controller.refresh(true)
    pending.resolve({ scope: 'scope-default', explanation: { status: 'ready', text: 'OK' } })
    await retry
    await flush()
    assert.equal(e.model().selected, null)
    assert.equal(e.model().snapshot.scope, 'scope-default')
  } finally { e.cleanup() }
})

test('an unconfirmed proposal exposes its complete fallback preview and cannot be applied', async () => {
  const e = setup(route => route === '/activity' ? snapshot([skill]) : {
    ...detail(), applicable: false, reason: 'Результат не подтверждён', changes: [],
    preview: 'Результат не подтверждён\n\n{"old_string":"old","new_string":"new"}',
    explanation: { status: 'unavailable', text: '' },
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    const rendered = JSON.stringify(e.view())
    assert.match(rendered, /data-hcv-activity-preview/)
    assert.match(rendered, /old_string/)
    assert.match(rendered, /new_string/)
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
  } finally { e.cleanup() }
})

test('missing skill files explain their content and link only a single exact creation match', async () => {
  const files = { ...skill, names: ['new-skill'], skill_action: 'files' }
  const create = { ...skill, id: 'abcdabcd', names: ['new-skill'], version: 'create-v1', skill_action: 'create' }
  const unrelated = { ...create, id: 'eeeeeeee', names: ['another-skill'] }
  let items = [files, create, unrelated]
  const e = setup(route => route === '/activity' ? snapshot(items) : {
    ...detail(files), applicable: false, reason: 'Указанный навык сейчас не найден',
    changes: [], missing_skill: 'new-skill', preview: 'Full record',
    proposed_files: [{ file: 'references/guide.md', heading: 'Reference guide', content: '# Reference guide\nFull text' }],
    explanation: { status: 'unavailable', text: '' },
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(files)
    let view = JSON.stringify(e.view())
    assert.match(view, /Файлы навыка/)
    assert.match(view, /Предлагается записать в навык эти файлы/)
    assert.match(view, /Reference guide · references\/guide.md/)
    assert.match(view, /Full text/)
    assert.match(view, /Рассмотреть создание навыка/)
    assert.doesNotMatch(view, /Краткое описание недоступно/)
    await e.controller.decide('approve')
    assert.equal(e.calls.filter(call => call.options?.method === 'POST').length, 0)
    items = [files, unrelated]
    await e.controller.refresh(true)
    await e.controller.inspect(files)
    view = JSON.stringify(e.view())
    assert.match(view, /сначала создайте или восстановите навык/)
    assert.doesNotMatch(view, /Рассмотреть создание навыка/)
    items = [files, create, { ...create, id: 'dddddddd' }]
    await e.controller.refresh(true)
    await e.controller.inspect(files)
    view = JSON.stringify(e.view())
    assert.match(view, /В очереди есть предложение создать навык/)
    assert.doesNotMatch(view, /Рассмотреть создание навыка/)
  } finally { e.cleanup() }
})

test('full-rewrite patch receives a visible warning', async () => {
  const e = setup(route => route === '/activity' ? snapshot([skill]) : {
    ...detail(), changes: [{ ...detail().changes[0], full_replacement: true }],
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    assert.match(JSON.stringify(e.view()), /Предложение включает удаление или полную замену/)
  } finally { e.cleanup() }
})

test('when fragments are too complex the full file remains available', async () => {
  const e = setup(route => route === '/activity' ? snapshot([skill]) : {
    ...detail(), explanation: { status: 'unavailable', text: '' },
    changes: [{ ...detail().changes[0], fragments: [], fragments_unavailable: true }],
  })
  try {
    await flush()
    e.controller.open()
    await flush()
    await e.controller.inspect(skill)
    const rendered = JSON.stringify(e.view())
    // Changes is a component; invoke it to examine its native details/summary content.
    const tree = e.view()
    function find(value) {
      if (!value || typeof value !== 'object') return null
      if (typeof value.type === 'function' && value.type.name === 'Changes') return value.type(value.props)
      for (const child of (value.children || []).flat(Infinity)) { const result = find(child); if (result) return result }
      return null
    }
    const changes = JSON.stringify(find(tree))
    assert.match(rendered, /data-hcv-activity-detail/)
    assert.match(changes, /Не удалось выделить изменённые фрагменты/)
    assert.match(changes, /full before/)
    assert.match(changes, /full after/)
  } finally { e.cleanup() }
})
