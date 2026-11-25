import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../source/local-environment.js', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('export function registerLocalEnvironment('), source.indexOf('\nfunction styles('))
  .replace('export function ', 'function ')

function fixture({ delayed = false, pauseAt = delayed ? 1 : 0 } = {}) {
  let current = true, resolvePath, release, registered, run
  const stored = new Map(), writes = []
  const atom = initial => { let value=initial; return { get:()=>value, set:next=>{value=next} } }
  const root = { matches: () => true }
  const document = { documentElement: root, createElement: () => ({ dataset:{}, remove(){} }) }
  const host = { state: { connectionId: { get: () => 'local' }, profile: { get: () => 'default' } }, notify() {} }
  const ctx = { storage: { get: (k, fallback) => stored.get(k) || fallback, set: (k,v) => { stored.set(k,v); writes.push(k) } },
    os: { writeClipboard: async () => true }, register: value => { registered = value }, onDispose: cb => { release=cb } }
  let paths = 0
  const checkedLocalPath = async (_desktop, cwd) => {
    paths++
    if (paths === pauseAt) return new Promise(resolve => { resolvePath = () => resolve(cwd) })
    return cwd
  }
  const dependencies = { document, atom, host, desktopPlatform: ()=>'win32', localPathKey: value=>value.toLowerCase(),
    styles: () => '', mountStyle() {}, window: { hermesDesktop: {} }, checkedLocalPath,
    readWorkspaceTrees: async () => [], runLocalScript: options => { run=options; return () => {} },
    crypto: { randomUUID: ()=>'new-revision' }, TITLEBAR_AREAS: { center:'center' }, h: (_component,props)=>props,
    EnvironmentSlot: () => {}, words: () => ({ setup:'setup', saved:'saved', path:'path' }),
    emptyEnvironment: name => ({ name, setup:{}, cleanup:{}, actions:[] }), folderName: value=>value.split('/').at(-1),
    scriptFor: (scripts, platform) => scripts[platform] || scripts.default || '', platforms: [] }
  const create = new Function(...Object.keys(dependencies), code+'\nreturn registerLocalEnvironment')
  const api = create(...Object.values(dependencies))(ctx, '[active]')
  return { api, writes, stop() {current=false}, isCurrent: () => current, resolve() {resolvePath?.()},
    get model() { return registered.render().model.get() }, get save() { return registered.render().save },
    get run() { return run }, close() { release() } }
}

test('changing focus while local settings are being opened cannot open a dialog for the prior tile', async () => {
  const f = fixture({ delayed:true })
  try {
    const pending = f.api.open({ cwd:'C:/repo-a', projectName:'A', isCurrent:f.isCurrent })
    f.stop(); f.resolve()
    assert.equal(await pending, false)
    assert.equal(f.model, null)
    assert.equal(f.writes.length, 0)
  } finally { f.close() }
})

test('changing focus before saving prevents settings and setup script writes', async () => {
  const f = fixture()
  try {
    assert.equal(await f.api.open({ cwd:'C:/repo-a', projectName:'A', isCurrent:f.isCurrent }), true)
    const target = f.model
    f.stop()
    await assert.rejects(f.save(target, {name:'changed',setup:{},cleanup:{},actions:[]}, 'echo setup'), /path/)
    assert.equal(f.writes.length, 0)
    assert.equal(f.run, undefined)
  } finally { f.close() }
})

test('a permitted tile setup carries its focus guard into every asynchronous terminal step', async () => {
  const f = fixture()
  try {
    assert.equal(await f.api.open({ cwd:'C:/repo-a', projectName:'A', isCurrent:f.isCurrent }), true)
    await f.save(f.model, {name:'changed',setup:{},cleanup:{},actions:[]}, 'echo setup')
    assert.equal(f.writes.length, 1)
    assert.equal(f.run.cwd, 'C:/repo-a')
    assert.equal(f.run.stillLocal(), true)
    f.stop()
    assert.equal(f.run.stillLocal(), false)
  } finally { f.close() }
})


test('changing focus during the save path check prevents the write', async () => {
  const f = fixture({ pauseAt: 4 })
  try {
    assert.equal(await f.api.open({ cwd:'C:/repo-a', projectName:'A', isCurrent:f.isCurrent }), true)
    const pending = f.save(f.model, {name:'changed',setup:{},cleanup:{},actions:[]}, 'echo setup')
    f.stop(); f.resolve()
    await assert.rejects(pending, /path/)
    assert.equal(f.writes.length, 0)
    assert.equal(f.run, undefined)
  } finally { f.close() }
})
