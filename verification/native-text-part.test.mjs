import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
const body=fs.readFileSync(new URL('../source/native-rendered-message.js',import.meta.url),'utf8')
 .replace(/^import[^\n]*\n/gm,'').replace(/export function/g,'function')
const readers=new Function('committedFiber',body+';return {nativeRenderedTextPart,nativeInterruptedDelegateActivity}')(()=>null)
const fiber=(props,next=null)=>({memoizedProps:props,return:next})
test('the native AUI text part carries its exact durable source identity',()=>{
 const expected={type:'text',text:'diagnostic',sourceRowId:15}
 const part=()=>({__internal_getRuntime:()=>({getState:()=>expected})});part.source={source:'message',index:2}
 assert.equal(readers.nativeRenderedTextPart({},()=>fiber({value:{part}})),expected)
})
test('native interrupted activity requires the exact dispatch identity and typed interrupted row',()=>{
 const row={id:'sa-1',sessionId:'child-1',status:'interrupted',activity:['Operation interrupted: waiting for model response (2.5s elapsed).']}
 const message={parts:[{type:'tool-call',toolName:'delegate_task',result:{subagent_ids:['sa-1']}}]}
 assert.equal(readers.nativeInterruptedDelegateActivity({},message,()=>fiber({row})),row)
 assert.equal(readers.nativeInterruptedDelegateActivity({},{parts:[]},()=>fiber({row})),null)
 assert.equal(readers.nativeInterruptedDelegateActivity({},message,()=>fiber({row:{...row,status:'completed'}})),null)
 assert.equal(readers.nativeInterruptedDelegateActivity({},message,()=>fiber({row:{...row,id:'foreign'}})),null)
})
