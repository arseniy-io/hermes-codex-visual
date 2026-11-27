import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const dir=path.dirname(fileURLToPath(import.meta.url))
const require=createRequire(path.join(process.env.LOCALAPPDATA,'hermes/source-archive/hermes-agent-main/package.json'))
const {JSDOM}=require('jsdom')
const dom=new JSDOM('<html lang="ru" data-hermes-theme="codex-workspace"><body><div data-chat-surface data-composer-target="main"><div data-slot="composer-dock"></div></div></body></html>',{runScripts:'outside-only'})
const w=dom.window, events=new Map(), frames=new Map(), dispose=[], opened=[]
let nextFrame=0
w.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame}; w.cancelAnimationFrame=id=>frames.delete(id)
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
const atom=v=>{const f=new Set();return {get:()=>v,set(x){v=x;for(const fn of f)fn()},listen(fn){f.add(fn);return()=>f.delete(fn)}}}
w.host={state:{connectionId:atom('local'),profile:atom('default'),activeSessionId:atom('one'),busyBySession:atom({one:true,two:true})}}
w.ctx={onEvent:(name,fn)=>events.set(name,fn),onDispose:fn=>dispose.push(fn)}
w.movedElementMatches = (record, selector) => [...record.addedNodes, ...record.removedNodes]
  .some(node => node.matches?.(selector) || node.querySelector?.(selector))
w.turnHistoryScope=()=>JSON.stringify(['local','default',w.host.state.activeSessionId.get()])
w.openSavedTurnDiff = (scope, snapshot, path) => opened.push({ scope, snapshot, path })
const src=fs.readFileSync(process.argv[2] || path.resolve(dir,'../source/composer-changes.js'),'utf8').replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm,'').replace(/^export function /gm,'function ')
w.eval(src+`\nregisterComposerChanges(ctx, 'html[data-hermes-theme="codex-workspace"]')`)
const emit=(type,seq,payload,session='one')=>events.get(type)?.({session_id:session,connectionId:'local',profile:'default',seq,payload,replay_epoch:'replay-one',authority_epoch:21,execution_generation:seq >= 20 ? 2 : 1,admission_id:seq >= 20 ? 'admission-2' : 'admission-1'})
const msg = (revision, diff, session = 'one') => ({
  version: 2, source: 'codex_app_server', agentSessionId: 'stored-' + session,
  hermesTurnId: 'turn-' + session, threadId: 'thread-' + session,
  codexTurnId: 'native-' + session, revision, diff,
})
const patch = (path, added, removed) =>
  'diff --git a/' + path + ' b/' + path + '\n--- a/' + path + '\n+++ b/' + path +
  '\n@@ -' + (removed ? '1' : '0') + ',' + removed + ' +1,' + added + ' @@\n' +
  '-old\n'.repeat(removed) + '+new\n'.repeat(added)
const one = patch('source/a.js', 2, 1)
const four = patch('source/a.js', 7, 6) + patch('space b.js', 200, 0) +
  patch('c.js', 58, 0) + patch('d.js', 1, 0)
const rail = () => w.document.querySelector('[data-hcv-composer-changes]')
const chip = () => rail()?.querySelector('[data-hcv-composer-changes-chip]')
const list = () => rail()?.querySelector('[data-hcv-composer-changes-popover]')
async function flush() {
  for (let n = 0; n < 8; n++) {
    await Promise.resolve()
    for (const [id, fn] of [...frames]) { frames.delete(id); fn() }
  }
}
try {
  emit('message.start', 1, {})
  emit('tool.complete', 2, { name: 'terminal', is_error: false, result: 'git status --short' })
  emit('tool.complete', 3, { name: 'patch', is_error: false, result: { success: true, diff: one } })
  emit('hcv.turn_diff', 4, { ...msg(1, one), version: 1, state: 'observed' })
  await flush()
  assert.equal(rail(), null, 'Partial edit events have no aggregate')
  emit('hcv.turn_diff', 5, msg(1, ''))
  await flush()
  assert.equal(rail(), null, 'Empty authoritative snapshot')
  emit('hcv.turn_diff', 6, msg(2, one))
  await flush()
  assert.equal(chip().getAttribute('aria-label'), 'Изменен 1 файл, +2, −1')
  chip().click()
  assert.equal(opened.at(-1).snapshot.unifiedDiff, one)
  assert.equal(opened.at(-1).path, null)
  
  emit('hcv.turn_diff', 7, msg(3, four))
  await flush()
  assert.equal(chip().getAttribute('aria-label'), 'Изменено 4 файла, +266, −6')
  assert.equal(chip().querySelector('[data-hcv-composer-changes-label]').textContent, 'Изменено 4 файла')
  assert.equal(list().hidden, true)
  chip().focus()
  assert.equal(list().hidden, false)
  const files = [...list().querySelectorAll('button')]
  assert.deepEqual(files.map(button => button.title), ['source/a.js', 'space b.js', 'c.js', 'd.js'])
  files[1].click()
  assert.equal(opened.at(-1).path, 'space b.js')
  assert.equal(opened.at(-1).snapshot.files[1].unifiedDiff, patch('space b.js', 200, 0))
  
  const blocker = w.document.createElement('div')
  blocker.dataset.slot = 'tool-approval-card'
  w.document.querySelector('[data-chat-surface]').append(blocker)
  await flush()
  assert.equal(rail(), null, 'An active approval takes priority')
  blocker.setAttribute('inert', '')
  await flush()
  assert(chip(), 'Same turn restores the summary once the approval closes')
  emit('hcv.turn_diff', 8, msg(4, ''))
  await flush()
  assert.equal(rail(), null, 'A full revert removes the total')
  emit('hcv.turn_diff', 9, msg(5, four + patch('partial.txt', 1, 1).replace('+new\n', '')))
  await flush()
  assert.equal(rail(), null, 'A malformed file cannot leave partial counts')
  emit('hcv.turn_diff', 10, msg(6, one))
  await flush()
  assert(chip(), 'A later complete snapshot can render')
  
  // Late frames from a previous admission cannot replace or close it.
  const stale = { session_id: 'one', connectionId: 'local', profile: 'default', seq: 11,
    replay_epoch: 'replay-one', authority_epoch: 21, execution_generation: 0, admission_id: 'old-admission' }
  events.get('hcv.turn_diff')({ ...stale, payload: msg(7, '') })
  events.get('message.complete')({ ...stale, payload: {} })
  await flush()
  assert.equal(chip().getAttribute('aria-label'), 'Изменен 1 файл, +2, −1')
  const previous = chip()
  w.host.state.activeSessionId.set('two')
  emit('message.start', 12, {}, 'two')
  await flush()
  assert.equal(rail(), null)
  const openedBeforeSwitch = opened.length
  previous.click()
  assert.equal(opened.length, openedBeforeSwitch)
  emit('hcv.turn_diff', 13, msg(1, one, 'two'), 'two')
  await flush()
  chip().click()
  assert.match(opened.at(-1).scope, /two/)
  assert.match(opened.at(-1).snapshot.snapshotId, /turn-two/)
  emit('hcv.turn_diff', 14, msg(2, one, 'foreign'), 'two')
  await flush()
  assert.equal(rail(), null, 'Changes with another native identity are withheld')
  emit('message.complete', 15, {}, 'two')
  await flush()
  assert.equal(rail(), null)
  w.host.state.activeSessionId.set('one')
  await flush()
  assert(chip(), 'Switching back shows the still-running turn')
  events.get('gateway.reconnecting')({})
  previous.click()
  assert.equal(opened.length, openedBeforeSwitch + 1)
  await flush()
  assert.equal(rail(), null, 'Unproven replay after reconnect clears the summary')
  // Native Hermes follows the same snapshot protocol without Codex thread ids.
  w.host.state.busyBySession.set({ one: true, two: true, native: true })
  w.host.state.activeSessionId.set('native')
  emit('message.start', 1, {}, 'native')
  const native = (revision, diff) => ({
    version: 2, source: 'hermes_native', agentSessionId: 'kimi-native-session',
    hermesTurnId: 'kimi-native-turn', revision, diff,
  })
  emit('hcv.turn_diff', 2, native(1, four), 'native')
  await flush()
  assert.equal(chip().getAttribute('aria-label'), 'Изменено 4 файла, +266, −6')
  emit('hcv.turn_diff', 3, native(2, ''), 'native')
  await flush()
  assert.equal(rail(), null)
  console.log('PASS complete totals, empty/reverted/partial hiding, file list and review, blocker, owner switch and reconnect')
} finally {
  for (const fn of dispose.reverse()) fn()
  dom.window.close()
}
