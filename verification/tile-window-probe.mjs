import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const referenceDesktop = fs.realpathSync(process.env.HERMES_VISUAL_FIXTURE_DESKTOP)
const resolveDesktop = createRequire(path.join(referenceDesktop, 'package.json')).resolve
const { expect, test } = await import(pathToFileURL(path.join(path.dirname(resolveDesktop('@playwright/test/package.json')), 'index.mjs')))

const agents = [
  { key:'main', prompt:'HCV_SCOPE_MAIN', id:'hcv-main-worker', taskName:'main_audit',
    child:'20261122_190001_a11aa1', result:'HCV_RESULT_MAIN_ONLY' },
  { key:'bravo', prompt:'HCV_SCOPE_BRAVO', id:'hcv-bravo-worker', taskName:'bravo_audit',
    child:'20261122_190002_b22bb2', result:'HCV_RESULT_BRAVO_ONLY' },
  { key:'charlie', prompt:'HCV_SCOPE_CHARLIE', id:'hcv-charlie-worker', taskName:'charlie_audit',
    child:'20261122_190003_c33cc3', result:'HCV_RESULT_CHARLIE_ONLY' },
]
const names = { main:'Main audit', bravo:'Bravo audit', charlie:'Charlie audit' }
const paneTab = '[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-agents"]'

function fixture() {
  let sequence = 0, holdBravo = false, pending = null, releaseCount = 0
  const byRuntime = new Map()
  const reply = (frame, route, result) => route.send(JSON.stringify({ jsonrpc:'2.0', id:frame.id, result }))
  const identity = agent => ({ available:true, subagent_id:agent.id, child_session_id:agent.child,
    running:false, rows:[{ role:'assistant', text:'HCV_COMPACT_RPC_ONLY' }] })
  return {
    intercept(frame, route) {
      if (frame.method === 'subagent.list' && byRuntime.has(frame.params?.session_id)) {
        const agent = byRuntime.get(frame.params.session_id)
        reply(frame, route, { subagents:[{ subagent_id:agent.id, goal:agent.goal, status:'running',
          started_at:Date.now()/1000, model:'mock-model' }], delegations:[] })
        return true
      }
      if (frame.method === 'session.transcript') {
        const agent = agents.find(item => item.id === frame.params?.subagent_id &&
          [item.stored, item.runtime].includes(frame.params?.session_id))
        if (agent) {
          if (agent.key === 'bravo' && holdBravo) { pending={frame,route,agent}; return true }
          reply(frame, route, identity(agent)); return true
        }
      }
      const agent = frame.method === 'prompt.submit' && agents.find(item => item.prompt === frame.params?.text)
      if (!agent) return false
      assert(agent.stored && agent.child, 'The saved test child must be seeded before dispatch')
      agent.runtime=frame.params.session_id
      byRuntime.set(agent.runtime,agent)
      const emit=(type,payload={})=>route.send(JSON.stringify({ jsonrpc:'2.0',method:'event',params:{ type,payload,
        session_id:agent.runtime,seq:++sequence,timestamp:Date.now()/1000 } }))
      reply(frame,route,{ admission_id:'hcv-tile-'+agent.key,ref:{session_id:agent.runtime},sequence:1,
        status:'started',outcome:null,authority_epoch:1,execution_generation:1 })
      setTimeout(()=>{
        const tool='hcv-delegate-'+agent.key
        emit('message.start')
        emit('tool.start',{name:'delegate_task',tool_id:tool,args:{tasks:[{goal:agent.goal,task_name:agent.taskName}]}})
        emit('subagent.start',{subagent_id:agent.id,child_session_id:agent.child,task_name:agent.taskName,
          agent_path:'/root/'+agent.taskName,goal:agent.goal,status:'running',model:'mock-model'})
        emit('tool.complete',{name:'delegate_task',tool_id:tool,result:{status:'dispatched',mode:'background',
          goals:[agent.goal],subagent_ids:[agent.id],task_names:[agent.taskName],agent_paths:['/root/'+agent.taskName],refused:[]}})
        emit('message.delta',{text:'HCV parent '+agent.key})
        emit('message.complete',{text:'HCV parent '+agent.key})
      },150)
      return true
    },
    hold() { holdBravo=true },
    isHeld() { return Boolean(pending) },
    release() {
      assert(pending,'Expected a delayed Bravo transcript proof')
      const item=pending;pending=null;holdBravo=false;releaseCount++
      try { reply(item.frame,item.route,identity(item.agent)); return true } catch { return false }
    },
    get released() { return releaseCount },
  }
}

async function sessionView(page, anchor) {
  return page.evaluate(anchor => {
    const root=[...document.querySelectorAll('[data-chat-surface]')].find(node=>node.dataset.sessionAnchor===anchor && node.getClientRects().length)
    if (!root) return null
    const keys=Object.keys(root), props=root[keys.find(key=>key.startsWith('__reactProps$'))]
    let fiber=root[keys.find(key=>key.startsWith('__reactFiber$'))]
    if (fiber?.memoizedProps!==props) fiber=fiber?.alternate
    if (fiber?.memoizedProps!==props) return null
    const views=new Set()
    for (let current=fiber;current;current=current.return) {
      const add=value=>{if (['primary','tile'].includes(value?.kind) && value.$storedId?.get && value.$runtimeId?.get && value.$cwd?.get) views.add(value)}
      add(current.memoizedProps?.value)
      for (let dep=current.dependencies?.firstContext;dep;dep=dep.next) add(dep.memoizedValue)
    }
    if (views.size!==1) return null
    const view=[...views][0]
    return { kind:view.kind, stored:view.$storedId.get(), runtime:view.$runtimeId.get(), cwd:view.$cwd.get(),
      busy:view.$busy?.get?.() }
  },anchor)
}

async function changeTileCwd(page, anchor, cwd) {
  return page.evaluate(async ({anchor,cwd})=>{
    const committed=element=>{
      if(!element)return null
      const keys=Object.keys(element),props=element[keys.find(key=>key.startsWith('__reactProps$'))]
      let fiber=element[keys.find(key=>key.startsWith('__reactFiber$'))]
      if(fiber?.memoizedProps!==props)fiber=fiber?.alternate
      return fiber?.memoizedProps===props?fiber:null
    }
    const surface=[...document.querySelectorAll('[data-chat-surface]')].find(node=>node.dataset.sessionAnchor===anchor && node.getClientRects().length)
    const views=new Set(),actions=new Set()
    for(let f=committed(surface);f;f=f.return){
      const add=value=>{if(value?.kind==='tile'&&value.$runtimeId?.get)views.add(value)}
      add(f.memoizedProps?.value)
      for(let dep=f.dependencies?.firstContext;dep;dep=dep.next)add(dep.memoizedValue)
    }
    for(let f=committed(document.querySelector('[data-slot="statusbar"]'));f;f=f.return)
      if(typeof f.memoizedProps?.actions?.changeSessionCwd==='function')actions.add(f.memoizedProps.actions.changeSessionCwd)
    if(views.size!==1||actions.size!==1)return false
    const runtime=[...views][0].$runtimeId.get()
    if(!runtime)return false
    await [...actions][0](cwd,runtime)
    return true
  },{anchor,cwd})
}

function seedChild(projectFolder, agent) {
  const root=fs.realpathSync(path.dirname(projectFolder))
  const relative=path.relative(fs.realpathSync(os.tmpdir()),root)
  assert(/^hermes-e2e-codex-visual-[^/\\]+$/.test(relative),'Refusing to write outside this isolated test profile')
  const home=path.join(root,'hermes-home'), database=path.join(home,'state.db')
  assert(fs.existsSync(database),'Isolated SessionDB must already exist')
  const repository=process.env.HERMES_VISUAL_TIMELINE_CORE ? fs.realpathSync(process.env.HERMES_VISUAL_TIMELINE_CORE)
    : path.resolve(process.env.HERMES_VISUAL_DESKTOP,'../..')
  const program=`
from pathlib import Path
from hermes_state import SessionDB
import sys
home,parent,child,worker,task,cwd,result=sys.argv[1:]
db=SessionDB(db_path=Path(home)/'state.db')
db.create_session(child,'subagent',parent_session_id=parent,cwd=cwd,profile_name='default',model='mock-model',
 model_config={'_subagent_id':worker,'_delegate_from':parent,'_task_name':task,'_agent_path':'/root/'+task})
db.set_session_hidden(child,True)
db.append_message(child,'user','Fixture request '+task)
db.append_message(child,'assistant',result)
`
  const result=spawnSync(process.env.HERMES_VISUAL_PYTHON,['-B','-X','utf8','-',home,agent.stored,agent.child,
    agent.id,agent.taskName,agent.cwd,agent.result],{cwd:repository,input:program,encoding:'utf8',windowsHide:true,
    env:{...process.env,HERMES_HOME:home,USERPROFILE:root,PYTHONPATH:repository,PYTHONDONTWRITEBYTECODE:'1'}})
  assert.equal(result.status,0,result.stderr||result.error?.message||'Could not seed isolated child')
}

async function ensureSummary(page) {
  const toggle=page.locator('[data-hcv-context-toggle]:visible')
  await expect(toggle).toHaveCount(1,{timeout:30000})
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click()
  const card=page.locator('[data-hcv-context-card]:visible')
  await expect(card).toBeVisible({timeout:20000})
  return card
}
async function openAgentList(page) {
  const card=await ensureSummary(page)
  await expect(card.locator('[data-hcv-open-subagents]')).toBeVisible({timeout:30000})
  await card.locator('[data-hcv-open-subagents]').click()
  const pane=page.locator('[data-hcv-subagents-pane]:visible')
  await expect(pane).toBeVisible({timeout:20000})
  return pane
}
async function closeAgentList(page) {
  const tab=page.locator(paneTab)
  if(await tab.count()){
    await tab.hover()
    await tab.getByRole('button',{name:'Закрыть',exact:true}).click()
    await expect(tab).toHaveCount(0)
  }
}

async function configureAndRead(page, value, expectedExisting='') {
  const card=await ensureSummary(page)
  await card.getByRole('button',{name:'Действия со сводкой'}).click()
  const item=page.getByRole('menuitem',{name:'Настроить локальное окружение'})
  await expect(item).toBeEnabled({timeout:20000})
  await item.click()
  const dialog=page.locator('[data-hcv-local-environment]:visible')
  await expect(dialog).toBeVisible()
  const inert=await page.locator('[data-chat-surface][data-hcv-summary-focused]').evaluate(node=>Boolean(node.closest('[inert]'))).catch(()=>null)
  await dialog.getByRole('button',{name:'Расширенные параметры'}).click()
  const cleanup=dialog.locator('#hcv-env-cleanup')
  await expect(cleanup).toHaveValue(expectedExisting)
  if(value!==null){
    await cleanup.fill(value)
    await dialog.getByRole('button',{name:'Сохранить',exact:true}).click()
    await expect(dialog).toHaveCount(0,{timeout:20000})
  }else { await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0,{timeout:20000}) }
  return inert
}

// Existing new-chat-welcome probe entry invokes this in the disposable profile.
// Only the gateway events / canonical proof responses are simulated; the
// native tiles, profile storage, React hooks, child SessionDB and dialog are real.
export async function probeNativeRight(page) {
  test.setTimeout(600000)
  const mode=process.env.HCV_TILE_PROBE_MODE || 'full'
  assert(['full','modal-only','agents-only'].includes(mode),'Unexpected tile test mode')
  const modalOnly=mode==='modal-only', agentsOnly=mode==='agents-only'
  await page.setViewportSize({width:1600,height:1100})
  await expect.poll(async()=>{const view=await sessionView(page,'workspace');return Boolean(view?.cwd && view.stored)}, {timeout:30000}).toBe(true)
  const first=await sessionView(page,'workspace')
  assert(first?.cwd && first.stored,'Expected the selected primary fixture session')
  const projectFolder=fs.realpathSync(first.cwd), root=fs.realpathSync(path.dirname(projectFolder))
  const relative=path.relative(fs.realpathSync(os.tmpdir()),root)
  assert(/^hermes-e2e-codex-visual-[^/\\]+$/.test(relative),'Expected a fresh disposable Hermes sandbox')
  const bravoDir=path.join(root,'hcv-second-workspace'), charlieDir=path.join(root,'hcv-third-workspace')
  assert(fs.statSync(bravoDir).isDirectory())
  fs.mkdirSync(charlieDir)
  const gate=fixture()
  const home=path.join(root,'hermes-home')
  const record=JSON.parse(fs.readFileSync(path.join(home,'gateway.pid'),'utf8'))
  console.log('HCV_TILE_SANDBOX',JSON.stringify({root,home,gatewayPid:record.pid}))
  page.on('websocket', socket=>{ try { const url=new URL(socket.url());
    if (['127.0.0.1','[::1]'].includes(url.hostname)) console.log('HCV_TILE_SOCKET',JSON.stringify({origin:url.origin,path:url.pathname}))
  } catch {} })
  const { installActivityReadinessFixture }=await import(pathToFileURL(path.join(process.cwd(),'verification/activity-parity.spec-helper.mjs')))
  await installActivityReadinessFixture(page,gate.intercept)
  await page.reload({waitUntil:'domcontentloaded',timeout:30000})
  const primaryChat=page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  await expect(primaryChat.locator('[data-slot="composer-rich-input"]')).toBeVisible({timeout:180000})
  const primaryTab=page.locator('[data-zone-tabstrip="grp-main"] [role="tab"][data-tree-tab="workspace"]')
  const initial=await sessionView(page,'workspace')
  assert(initial?.stored===first.stored,'The reload must preserve the chosen primary chat')
  const parent=agents[0];parent.stored=initial.stored;parent.cwd=projectFolder;parent.goal='Primary test task'
  const dispatch=async (chat,agent)=>{
    const editor=chat.locator('[data-slot="composer-rich-input"]')
    await editor.fill(agent.prompt);await editor.press('Enter')
    await expect(chat.getByText('HCV parent '+agent.key,{exact:false}).first()).toBeVisible({timeout:45000})
  }
  let pane
  if (!modalOnly) {
    seedChild(projectFolder,parent)
    await dispatch(primaryChat,parent)
    console.log('HCV_TILE_STAGE main-dispatched')
    pane=await openAgentList(page)
    await expect(pane.locator(`[data-hcv-subagent-row="${parent.id}"]`)).toContainText(names.main,{timeout:30000})
    await pane.locator(`[data-hcv-subagent-row="${parent.id}"]`).click()
    await expect(pane.locator('[data-hcv-subagent-result]')).toContainText(parent.result,{timeout:30000})
    await expect(pane.locator('[data-hcv-subagent-result]')).not.toContainText('HCV_COMPACT_RPC_ONLY')
    console.log('HCV_TILE_STAGE main-detail-verified')
    await closeAgentList(page)
  }

  const strip=page.locator('[data-zone-tabstrip="grp-main"]')
  async function addTile(agent,cwd,{withAgent=true}={}){
    const previous=await strip.locator('[role="tab"][data-tree-tab^="session-tile:"]').evaluateAll(
      nodes=>nodes.map(node=>node.getAttribute('data-tree-tab')))
    await strip.locator('button:has(> .codicon-add)').click()
    const selected=strip.locator('[role="tab"][data-tree-tab^="session-tile:"][aria-selected="true"]')
    await expect(selected).toBeVisible({timeout:30000})
    // The old tile can stay selected for a frame after clicking +. Wait for
    // the actual new anchor before finding or writing into its composer.
    await expect.poll(async()=>{const anchor=await selected.getAttribute('data-tree-tab');
      return Boolean(anchor && !previous.includes(anchor))},{timeout:30000}).toBe(true)
    const anchor=await selected.getAttribute('data-tree-tab')
    const chat=page.locator(`[data-chat-surface][data-session-anchor="${anchor}"]:visible`)
    await expect(chat.locator('[data-slot="composer-rich-input"]')).toBeVisible({timeout:30000})
    const editor=chat.locator('[data-slot="composer-rich-input"]')
    await editor.fill('HCV_WARMUP_'+agent.key);await editor.press('Enter')
    await expect(chat.locator('[data-slot="aui_user-message-root"]').filter({hasText:'HCV_WARMUP_'+agent.key})).toBeVisible({timeout:30000})
    // Wait for the *answer*, not merely the outgoing bubble: changing cwd
    // during an active generation can yield a stale-generation response.
    await expect(chat.getByText('Hello from the mock inference server! The full boot chain is working.',{exact:false}).first())
      .toBeVisible({timeout:90000})
    await expect.poll(async()=>{const view=await sessionView(page,anchor);return Boolean(view?.runtime && view.busy===false)},
      {timeout:30000}).toBe(true)
    console.log('HCV_TILE_STAGE warmup-finished',agent.key)
    assert(await changeTileCwd(page,anchor,cwd),'Expected native tile-specific cwd action')
    await expect.poll(async()=>path.normalize((await sessionView(page,anchor))?.cwd||''),{timeout:30000}).toBe(path.normalize(cwd))
    const current=await sessionView(page,anchor)
    agent.stored=current.stored;agent.cwd=cwd;agent.goal='Tile test task '+agent.key
    if (withAgent) {
      seedChild(projectFolder,agent)
      await dispatch(chat,agent)
      console.log('HCV_TILE_STAGE tile-dispatched',agent.key)
    }
    return {anchor,tab:strip.locator(`[role="tab"][data-tree-tab="${anchor}"]`),chat}
  }
  const bravo=await addTile(agents[1],bravoDir,{withAgent:!modalOnly})
  const bravoCard=await ensureSummary(page)
  await expect(bravoCard.locator('[data-hcv-summary-section="project"] [data-hcv-summary-heading]')).toHaveText('hcv-second-workspace',{timeout:30000})
  let delivered=null
  if (!modalOnly) {
  pane=await openAgentList(page)
  await expect(pane.locator(`[data-hcv-subagent-row="${agents[1].id}"]`)).toContainText(names.bravo,{timeout:30000})
  await expect(pane.locator(`[data-hcv-subagent-row="${parent.id}"]`)).toHaveCount(0)
  console.log('HCV_TILE_STAGE bravo-list-verified')
  gate.hold()
  await pane.locator(`[data-hcv-subagent-row="${agents[1].id}"]`).click()
  await expect.poll(()=>gate.isHeld(),{timeout:30000}).toBe(true)
  console.log('HCV_TILE_STAGE delayed-proof-armed')
  await primaryTab.click()
  // The primary pane may retain the previously selected detail. That is an
  // intentional part of the existing main-chat contract, not a hidden list.
  const mainDetail=pane.locator('[data-hcv-subagent-detail]')
  await expect(mainDetail.locator('h2')).toHaveText(names.main,{timeout:30000})
  await expect(mainDetail.locator('[data-hcv-subagent-result]')).toContainText(parent.result,{timeout:30000})
  console.log('HCV_TILE_STAGE delayed-proof-held')
  delivered=gate.release()
  assert(delivered,'The delayed proof must actually be sent after changing tabs')
  await page.waitForTimeout(500)
  await expect(mainDetail.locator('h2')).toHaveText(names.main)
  await expect(mainDetail.locator('[data-hcv-subagent-result]')).toContainText(parent.result)
  await expect(pane).not.toContainText(agents[1].result)
  await closeAgentList(page)
  await bravo.tab.click()
  pane=await openAgentList(page)
  const restoredBravo=pane.locator('[data-hcv-subagent-detail]:visible')
  if (!await restoredBravo.isVisible()) await pane.locator(`[data-hcv-subagent-row="${agents[1].id}"]`).click()
  await expect(pane.locator('[data-hcv-subagent-detail] h2')).toHaveText(names.bravo,{timeout:30000})
  await expect(pane.locator('[data-hcv-subagent-result]')).toContainText(agents[1].result,{timeout:30000})
  await expect(pane.locator('[data-hcv-subagent-result]')).not.toContainText(parent.result)
  await closeAgentList(page)

  console.log('HCV_TILE_STAGE bravo-detail-verified')
  }
  const charlie=await addTile(agents[2],charlieDir,{withAgent:!modalOnly})
  const charlieCard=await ensureSummary(page)
  await expect(charlieCard.locator('[data-hcv-summary-section="project"] [data-hcv-summary-heading]')).toHaveText('hcv-third-workspace',{timeout:30000})
  if (!modalOnly) {
  pane=await openAgentList(page)
  await expect(pane.locator(`[data-hcv-subagent-row="${agents[2].id}"]`)).toContainText(names.charlie,{timeout:30000})
  await expect(pane.locator(`[data-hcv-subagent-row="${agents[1].id}"]`)).toHaveCount(0)
  await pane.locator(`[data-hcv-subagent-row="${agents[2].id}"]`).click()
  await expect(pane.locator('[data-hcv-subagent-result]')).toContainText(agents[2].result,{timeout:30000})
  await expect(pane.locator('[data-hcv-subagent-result]')).not.toContainText(agents[1].result)
  await closeAgentList(page)

  console.log('HCV_TILE_STAGE charlie-detail-verified')
  }
  let inert=null
  if (!agentsOnly) {
    console.log('HCV_TILE_STAGE modal-start')
    inert=await configureAndRead(page,'echo HCV_CHARLIE_CLEANUP','')
    console.log('HCV_TILE_STAGE modal-save-verified',JSON.stringify({inert}))
    await configureAndRead(page,null,'echo HCV_CHARLIE_CLEANUP')
    await primaryTab.click()
    await configureAndRead(page,null,'')
    await bravo.tab.click()
    await configureAndRead(page,null,'')
    await charlie.tab.click()
    await configureAndRead(page,null,'echo HCV_CHARLIE_CLEANUP')
  }
  const result={mode,tabs:['main','bravo','charlie'],delayedProofDelivered:delivered,
    modalMadeChatInert:inert,isolatedDatabase:true,simulatedGateway:true}
  if(process.env.HCV_TILE_PROBE_EVIDENCE) {
    await page.screenshot({path:path.join(process.env.HCV_TILE_PROBE_EVIDENCE,`tile-summary-${mode}.png`)})
    fs.writeFileSync(path.join(process.env.HCV_TILE_PROBE_EVIDENCE,`tile-summary-${mode}.json`), JSON.stringify(result,null,2)+'\n')
  }
  console.log('HCV_TILE_SCOPE_PASS',JSON.stringify(result))
  return {exactBridge:false,rootRows:[],scopeTestPassed:true,...result}
}
