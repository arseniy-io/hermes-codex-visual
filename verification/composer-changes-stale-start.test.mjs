import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(path.join(process.env.LOCALAPPDATA,'hermes/source-archive/hermes-agent-main/package.json'))
const {JSDOM}=require('jsdom')
const source=process.argv[2] || path.resolve(import.meta.dirname,'../source/composer-changes.js')
assert(source,'pass the exact composer-changes candidate as argv[2]')
const dom=new JSDOM('<html lang="ru" data-hermes-theme="codex-workspace"><body><div data-chat-surface data-composer-target="main"><div data-slot="composer-dock"></div></div></body></html>',{runScripts:'outside-only'})
const w=dom.window, events=new Map(), frames=new Map(), dispose=[], opened=[]
let nextFrame=0
w.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame}; w.cancelAnimationFrame=id=>frames.delete(id)
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
const atom=v=>{const f=new Set();return {get:()=>v,set(x){v=x;for(const fn of f)fn()},listen(fn){f.add(fn);return()=>f.delete(fn)}}}
w.host={state:{connectionId:atom('local'),profile:atom('default'),activeSessionId:atom('chat-one'),busyBySession:atom({'chat-one':true})}}
w.ctx={onEvent:(name,fn)=>events.set(name,fn),onDispose:fn=>dispose.push(fn)}
w.movedElementMatches=()=>false
w.turnHistoryScope=()=>JSON.stringify(['local','default',w.host.state.activeSessionId.get()])
w.openSavedTurnDiff=(scope,snapshot)=>opened.push({scope,snapshot})
const src=fs.readFileSync(source,'utf8').replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm,'').replace(/^export function /gm,'function ')
w.eval(src+`\nregisterComposerChanges(ctx, 'html[data-hermes-theme="codex-workspace"]')`)
const emit=(type,seq,payload,gen,admission)=>events.get(type)?.({session_id:'chat-one',connectionId:'local',profile:'default',seq,payload,replay_epoch:'replay-one',authority_epoch:21,execution_generation:gen,admission_id:admission})
const msg=(rev,label,diff)=>({version:2,source:'codex_app_server',agentSessionId:'stored-one',hermesTurnId:'turn-'+label,threadId:'thread-one',codexTurnId:'native-'+label,revision:rev,diff})
const diff=label=>`diff --git a/${label}.txt b/${label}.txt\n--- a/${label}.txt\n+++ b/${label}.txt\n@@ -1 +1 @@\n-old\n+new\n`
async function flush(){for(let n=0;n<8;n++){await Promise.resolve();for(const [id,fn] of [...frames]){frames.delete(id);fn()}}}
try {
 // Current newer generation, valid patch.
 emit('message.start',20,{},2,'admission-new'); emit('hcv.turn_diff',22,msg(1,'new',diff('new')),2,'admission-new'); await flush()
 const chip=w.document.querySelector('[data-hcv-composer-changes-chip]'); assert(chip&&!chip.hidden)
 chip.click(); assert.equal(opened.at(-1).snapshot.unifiedDiff,diff('new'))
 // Old generation is delivered later through plugin fan-out. Both start and
 // subsequent frames keep their original execution stamp and sequence.
 emit('message.start',1,{},1,'admission-old'); emit('hcv.turn_diff',3,msg(1,'old',diff('old')),1,'admission-old'); await flush()
 chip.click()
 const actual=opened.at(-1).snapshot.unifiedDiff
 if(actual===diff('old')) {
   console.error('FAIL: stale admission replaced the current patch and opened old.txt')
   process.exitCode=1
 } else {
   assert.equal(actual,diff('new')); console.log('PASS: stale start and frames rejected')
 }
} finally {for(const fn of dispose.reverse())fn();dom.window.close()}

