import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createPrimaryHistoryTargetReader, samePrimaryHistoryTarget } from '../source/primary-turn-history-owner.js'
const atom = value => ({ get: () => value, set: next => { value = next } })
function fixture() {
 const state = { focusedSessionId: atom('runtime'), focusedStoredSessionId: atom('stored'),
   focusedSessionOwner: atom({ connectionId:'remote', profile:'worker' }),
   connectionId:atom('local'), profile:atom('default') }
 const surface={ isConnected:true }
 const view={ kind:'primary', $runtimeId:atom('runtime'), $storedId:atom('stored') }
 let nativeOwner=null
 const read=createPrimaryHistoryTargetReader({state,readView:()=>({view,nativeOwner})})
 return {state,surface,view,read:()=>read(surface),owner: next=>nativeOwner=next}
}
const body=fs.readFileSync(new URL('../source/turn-history-client.js',import.meta.url),'utf8')
 .replace(/^import[^\n]*\n/gm,'').replace(/export (async )?function /g,'$1function ')
function client(api) {
 const calls=[],host={state:{}},ctx={onDispose(){},rest(){throw new Error('ambient REST must not be called')}}
 const c=new Function('host','h','MessageTextContent','window',body+';return {setTurnHistoryContext,requestTurnHistory,readSavedTurnChanges,applySavedTurnChanges}')(
   host,()=>{},null,{hermesDesktop:{api:async request=>{calls.push(request);return api(request)}}})
 c.setTurnHistoryContext(ctx)
 return {c,calls}
}
function ownerFor(f) { const target=f.read();return {...target,isCurrent:()=>samePrimaryHistoryTarget(target,f.read())} }

test('primary native route wins over unrelated ambient socket state',()=>{
 const f=fixture();f.owner({connectionId:'remote',profile:'worker'})
 const target=f.read();assert.equal(target.connectionId,'remote');assert.equal(target.profile,'worker')
 f.state.connectionId.set('other-ambient');f.state.profile.set('unrelated')
 assert(samePrimaryHistoryTarget(target,f.read()))
})
test('exact focused proof survives tile focus only for that mounted view/runtime/stored tuple',()=>{
 const f=fixture(),target=f.read();assert(target)
 f.state.focusedSessionId.set('tile-runtime');f.state.focusedStoredSessionId.set('tile-stored')
 f.state.focusedSessionOwner.set({connectionId:'other',profile:'tile'})
 assert(samePrimaryHistoryTarget(target,f.read()))
 f.view.$runtimeId.set('replaced-runtime');assert.equal(f.read(),null)
})
test('unproved primary never borrows ambient or another focused tile owner',()=>{
 const f=fixture();f.state.focusedSessionId.set('tile');assert.equal(f.read(),null)
})
test('conflicting native and exact focused proof fail closed',()=>{
 const f=fixture();f.owner({connectionId:'different',profile:'worker'});assert.equal(f.read(),null)
})
test('primary timeline and undo use the exact proven route, ignoring caller overrides',async()=>{
 const f=fixture(),owner=ownerFor(f)
 const {c,calls}=client(async()=>({data:{sessionId:'stored',parentId:'stored',scope:'backend',turns:[]}}))
 await c.requestTurnHistory(owner.scope,'/turn-timeline',undefined,owner)
 await c.readSavedTurnChanges(owner.scope,'stored','stored',owner)
 await c.applySavedTurnChanges(owner.scope,'stored','stored',{scope:'backend',snapshotId:'saved',revision:0},'undo',owner)
 assert.equal(calls.length,3)
 assert(calls.every(call=>call.connectionId==='remote'&&call.profile==='worker'&&call.path.startsWith('/api/plugins/hermes-codex-visual/turn-')))
})
test('same IDs under a changed primary owner reject late results and mutation attempts',async()=>{
 const f=fixture(),owner=ownerFor(f);let release
 const {c,calls}=client(()=>new Promise(done=>release=done))
 const pending=c.requestTurnHistory(owner.scope,'/turn-timeline',undefined,owner)
 f.state.focusedSessionOwner.set({connectionId:'neighbor',profile:'worker'})
 release({data:{rows:[]}})
 await assert.rejects(pending,/Chat owner changed/)
 await assert.rejects(c.applySavedTurnChanges(owner.scope,'stored','stored',{snapshotId:'saved'},'undo',owner),/Chat owner changed/)
 assert.equal(calls.length,1)
})
test('draft controller passes explicit owner to timeline, snapshots, diff and apply',()=>{
 const s=fs.readFileSync(new URL('../source/chat-turn-history.js',import.meta.url),'utf8')
 assert(!s.includes('turnHistoryScope'))
 assert.match(s,/await readTurnTimeline\(owner, value\)/)
 for(const line of s.split('\n').filter(line=>/await readSavedTurnChanges|onReview:|onApply:/.test(line))) {
   assert.match(line,/(?:owner|data\.owner)\)/)
 }
 assert.match(s,/host\.state\.focusedSessionOwner/)
 assert.match(s,/scheduleRead\(\)[\s\S]*?observer\.observe/)
})
