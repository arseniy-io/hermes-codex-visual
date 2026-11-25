import test from 'node:test'
import assert from 'node:assert/strict'
import { timestampSeparatorTimes as dates, timestampSeparatorParts as parts, savedTimelineMetadata } from '../source/chat-timestamp-data.js'
import { agentTranscriptTurns } from '../source/agent-transcript-turns.js'
process.env.TZ = 'Europe/Moscow'
const hour=3600000
const stamp=(turnId,phase,t,extra={})=>({hcv_timeline:{version:1,turnId,phase,turnStartedAtMs:t,opensExchange:true,...extra}})

test('first user date threshold is strictly one hour',()=>{
 assert.deepEqual(dates([[{role:'user',sentAtMs:1000}]],1000+hour),[null])
 assert.deepEqual(dates([[{role:'user',sentAtMs:1000}]],1001+hour),[1000])
})
test('subsequent user pause uses previous assistant and strict one hour',()=>{
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:1000}],[{role:'user',sentAtMs:1000+hour}]],2000+hour),[null,null])
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:1000}],[{role:'user',sentAtMs:1001+hour}]],2000+hour),[null,1001+hour])
})
test('consecutive assistant exchange threshold is strictly ten minutes',()=>{
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:1000}],[{role:'assistant',sentAtMs:601000}]]),[null,null])
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:1000}],[{role:'assistant',sentAtMs:601001}]]),[null,601001])
})
test('continuation never opens exchange but remains previous description',()=>{
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:0}],[{role:'assistant',opensExchange:false,sentAtMs:700000}],[{role:'assistant',sentAtMs:800000}]]),[null,null,null])
})
test('a group receives only its first qualifying date',()=>{
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:0}],[{role:'assistant',sentAtMs:700000},{role:'assistant',sentAtMs:1400000}]]),[null,700000])
})
test('unknown history blocks adjacency and first-user rule',()=>{
 assert.deepEqual(dates([null,[{role:'user',sentAtMs:0}]],2*hour),[null,null])
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:0}],null,[{role:'assistant',sentAtMs:2*hour}]]),[null,null,null])
})
test('explicit break only clears adjacency; invalid time cannot qualify',()=>{
 assert.deepEqual(dates([[{role:'assistant',sentAtMs:0}],[{role:'assistant',breaksPreviousAdjacency:true,sentAtMs:hour}]]),[null,null])
 assert.deepEqual(dates([[{role:'user',sentAtMs:NaN}],[{role:'assistant',sentAtMs:null}],[{role:'user',sentAtMs:hour}]],3*hour),[null,null,null])
})
test('same-turn commentary is not another exchange',()=>{
 const rows=[{id:1,role:'user',content:'task',display_metadata:stamp('t','input',0)},
  {id:2,role:'assistant',content:'comment',timestamp:900,display_metadata:stamp('t','work',0)},
  {id:3,role:'assistant',content:'done',timestamp:5000,display_metadata:stamp('t','final',0,{finalAssistantStartedAtMs:2*hour})}]
 const turns=agentTranscriptTurns(rows,{nowMs:5*hour})
 assert.equal(turns.length,1);assert.deepEqual(turns[0].descriptions,[{role:'user',sentAtMs:0,opensExchange:true},{role:'assistant',sentAtMs:2*hour,opensExchange:true}])
 assert.equal(turns[0].timestampSeparatorAtMs,0)
})
test('legacy completion timestamps never impersonate answer-start dates',()=>{
 const turns=agentTranscriptTurns([{id:1,role:'user',content:'a',timestamp:0},{id:2,role:'assistant',content:'done',timestamp:100},
  {id:3,role:'user',content:'b',timestamp:9000}],{nowMs:4*hour})
 assert.equal(turns[0].descriptions[1].sentAtMs,null); assert.equal(turns[1].timestampSeparatorAtMs,null)
})
test('legacy first input retains its known timestamp',()=>{
 assert.equal(agentTranscriptTurns([{role:'user',content:'task',timestamp:100}],{nowMs:2*hour})[0].timestampSeparatorAtMs,100000)
})
test('pagination partial history and compaction introduce explicit breaks',()=>{
 const input={id:1,role:'user',content:'task',timestamp:100}
 assert.equal(agentTranscriptTurns([input],{nowMs:2*hour,historyComplete:false})[1].timestampSeparatorAtMs,null)
 const turns=agentTranscriptTurns([{id:0,row_kind:'compaction',role:'system',content:'summary'},input],{nowMs:2*hour})
 assert.equal(turns[0].descriptions,null);assert.equal(turns[1].timestampSeparatorAtMs,null)
})
test('synthetic continuation user is a system notice and suppresses final date',()=>{
 const rows=[{id:1,role:'assistant',content:'done',display_metadata:stamp('a','final',0,{finalAssistantStartedAtMs:1000})},
  {id:2,role:'user',display_kind:'auto_continue',content:'resume',display_metadata:stamp('b','input',2*hour,{opensExchange:false})},
  {id:3,role:'assistant',content:'continued',display_metadata:stamp('b','final',2*hour,{opensExchange:false,finalAssistantStartedAtMs:3*hour})}]
 const turns=agentTranscriptTurns(rows);assert.equal(turns.length,2);assert.deepEqual(turns[1].descriptions,[{role:'assistant',sentAtMs:3*hour,opensExchange:false}]);assert.equal(turns[1].timestampSeparatorAtMs,null)
})
test('durable JSON sidecar accepted, invalid unversioned or no native identity rejected',()=>{
 assert.equal(savedTimelineMetadata({display_metadata:JSON.stringify(stamp('t','final',0))}).turnId,'t')
 assert.equal(savedTimelineMetadata({display_metadata:{hcv_timeline:{turnId:'t',turnStartedAtMs:0}}}),null)
 assert.equal(savedTimelineMetadata({display_metadata:stamp('', 'final',0)}),null)
})
test('RU today/vesterday dates match source casing, comma and weighted day split',()=>{
 const now=Date.UTC(2026,10,21,13,0);const sent=Date.UTC(2026,10,21,11,16)
 assert.deepEqual(parts(sent,'ru',now),{date:'сегодня',time:'14:16',join:', ',includeAt:false,label:'сегодня, 14:16',iso:'2026-11-21T11:16:00.000Z'})
 assert.equal(parts(sent-86400000,'ru',now).date,'вчера');assert.equal(parts(sent,'en',now).date,'Today')
})
test('dates use local calendar days and future dates clamp to today',()=>{
 const now=Date.UTC(2026,10,21,0,1);const sent=Date.UTC(2026,10,20,23,59)
 assert.equal(parts(sent,'ru',now).date,'сегодня')
 assert.equal(parts(now+86400000,'ru',now).date,'сегодня')
})
test('two-seven days use weekday; older dates include locale at delimiter',()=>{
 const now=Date.UTC(2026,10,21,12)
 assert.equal(parts(now-2*86400000,'ru',now).date,'четверг')
 assert.equal(parts(now-7*86400000,'ru',now).includeAt,false)
 assert.equal(parts(now-8*86400000,'ru',now).join,' в ')
 assert.match(parts(now-366*86400000,'ru',now).date,/2025/)
})
