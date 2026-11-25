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
w.movedElementMatches=()=>false
w.turnHistoryScope=()=>JSON.stringify(['local','default',w.host.state.activeSessionId.get()])
w.openSavedTurnDiff=(scope,snapshot)=>opened.push({scope,snapshot})
const src=fs.readFileSync(process.argv[2] || path.resolve(dir,'../source/composer-changes.js'),'utf8').replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm,'').replace(/^export function /gm,'function ')
w.eval(src+`\nregisterComposerChanges(ctx, 'html[data-hermes-theme="codex-workspace"]')`)
const emit=(type,seq,payload,session='one')=>events.get(type)?.({session_id:session,connectionId:'local',profile:'default',seq,payload,replay_epoch:'replay-one',authority_epoch:21,execution_generation:seq >= 20 ? 2 : 1,admission_id:seq >= 20 ? 'admission-2' : 'admission-1'})
const msg=(rev,state,diff,overrides={})=>({version:1,source:'codex_app_server',agentSessionId:'stored-one',hermesTurnId:'turn-one',threadId:'thread-one',codexTurnId:'native-one',revision:rev,state,...(diff!==undefined?{diff}:{}),...overrides})
const diff='diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n'
async function flush(){for(let n=0;n<8;n++){await Promise.resolve();for(const [id,fn] of [...frames]){frames.delete(id);fn()}}}
try {
 emit('message.start',1,{}); emit('hcv.turn_diff',2,msg(1,'pending')); emit('hcv.turn_diff',3,msg(2,'observed',diff)); await flush()
 const chip=w.document.querySelector('[data-hcv-composer-changes-chip]')
 assert(chip&&!chip.hidden); assert.match(chip.getAttribute('aria-label'),/Отдельная подтверждённая правка, \+1, −1\. Могут быть и другие изменения/)
 // An old execution on the same session cannot replace or close this snapshot.
 const stale={session_id:'one',connectionId:'local',profile:'default',seq:4,replay_epoch:'replay-one',authority_epoch:21,execution_generation:0,admission_id:'old-admission'}
 events.get('hcv.turn_diff')({...stale,payload:msg(3,'unavailable')})
 events.get('message.complete')({...stale,payload:{}})
 await flush(); assert.equal(chip.hidden,false)
 chip.click();assert.equal(opened.length,1);assert.equal(opened[0].snapshot.unifiedDiff,diff)
 // A command invalidates synchronously, even before the scheduled repaint.
 emit('hcv.turn_diff',4,msg(3,'unavailable'));chip.click();assert.equal(opened.length,1);await flush()
 assert(chip.hidden);assert.equal(w.document.querySelector('[data-hcv-composer-changes-warning]').textContent,'Не все изменения удалось отследить')
 emit('hcv.turn_diff',5,msg(4,'observed',diff));await flush();assert(chip.hidden)
 // Another chat gets its own identity and cannot open the first snapshot.
 emit('message.start',10,{},'two'); w.host.state.activeSessionId.set('two'); await flush()
 const other=(rev,state,data)=>({version:1,source:'codex_app_server',agentSessionId:'stored-two',hermesTurnId:'turn-two',threadId:'thread-two',codexTurnId:'native-two',revision:rev,state,...data})
 emit('hcv.turn_diff',11,other(1,'pending'),'two');emit('hcv.turn_diff',12,other(2,'observed',{diff}),'two');await flush()
 chip.click();assert.equal(opened.length,2);assert.match(opened[1].scope,/two/);assert.match(opened[1].snapshot.snapshotId,/turn-two/)
 // A foreign turn identity or skipped revision invalidates, never opens stale data.
 emit('hcv.turn_diff',13,other(3,'observed',{diff,hermesTurnId:'foreign'}),'two');chip.click();assert.equal(opened.length,2);await flush();assert(chip.hidden)
 emit('message.complete',14,{},'two');await flush();assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 // Invalid diff bodies and unsupported tools cannot become exact counts.
 w.host.state.activeSessionId.set('one');emit('message.start',20,{});emit('hcv.turn_diff',21,msg(1,'pending'));emit('hcv.turn_diff',22,msg(2,'observed','--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n'));await flush()
 assert.equal(w.document.querySelector('[data-hcv-composer-changes-chip]').hidden,true)
 // A session replay gap blocks its old snapshot and future ambiguous frames.
 emit('session.replay_gap',23,{}); await flush()
 assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 emit('message.start',24,{});emit('hcv.turn_diff',25,msg(1,'pending'));emit('hcv.turn_diff',26,msg(2,'observed',diff));await flush()
 assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 // An unknown replay epoch has no comparable seq; clear synchronously and fail closed.
 w.host.state.activeSessionId.set('two');emit('message.start',30,{},'two')
 emit('hcv.turn_diff',31,other(1,'pending'),'two');emit('hcv.turn_diff',32,other(2,'observed',{diff}),'two');await flush()
 const current=w.document.querySelector('[data-hcv-composer-changes-chip]');assert(current&&!current.hidden)
 const before=opened.length
 events.get('message.start')({session_id:'two',connectionId:'local',profile:'default',seq:1,payload:{},replay_epoch:'replay-new',authority_epoch:21,execution_generation:3,admission_id:'new'})
 current.click();assert.equal(opened.length,before);await flush();assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 // Reconnection clears every tracked snapshot and does not revive it from replay.
 w.host.state.busyBySession.set({one:true,two:true,three:true});w.host.state.activeSessionId.set('three')
 emit('message.start',1,{},'three');emit('hcv.turn_diff',2,msg(1,'pending'),'three');emit('hcv.turn_diff',3,msg(2,'observed',diff),'three');await flush()
 const third=w.document.querySelector('[data-hcv-composer-changes-chip]');assert(third&&!third.hidden)
 events.get('gateway.reconnecting')({});third.click();assert.equal(opened.length,before);await flush()
 assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 emit('message.start',10,{},'three');emit('hcv.turn_diff',11,msg(1,'pending'),'three');emit('hcv.turn_diff',12,msg(2,'observed',diff),'three');await flush()
 assert.equal(w.document.querySelector('[data-hcv-composer-changes]'),null)
 console.log('PASS synthetic renderer: current snapshot only, invalidation before repaint, session/turn isolation, malformed diff, replay gap/epoch, reconnect')
} finally {for(const fn of dispose.reverse())fn();dom.window.close()}





