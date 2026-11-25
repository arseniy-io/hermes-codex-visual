import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const serviceHeader = '[ASYNC DELEGATION BATCH COMPLETE'

export function personalQueueFixture() {
  const id = randomUUID().slice(0, 8)
  const prompt = 'Поручи отдельную проверку ' + id
  const goal = 'Проверь тестовую запись и верни результат ' + id
  const result = 'Проверочный результат субагента ' + randomUUID()
  const followup = serviceHeader + ' - test] Это ввёл пользователь ' + id
  const answer = 'Основной агент получил точный результат ' + id
  const followupAnswer = 'Сообщение пользователя обработано ' + id
  const childGate = Promise.withResolvers()
  const parentGate = Promise.withResolvers()
  const arrivals = []
  let waiting = false
  let childModel

  return {
    prompt, followup, result, answer, followupAnswer, arrivals,
    get ready() { return waiting && Boolean(childModel) },
    get childModel() { return childModel },
    releaseChild: childGate.resolve,
    releaseParent: parentGate.resolve,
    async reply(request, send) {
      const index = request.messages.findLastIndex(item => item.role === 'user')
      const message = request.messages[index]?.content
      if (typeof message !== 'string') return false
      if (message === followup) {
        arrivals.push({kind: 'user', model: request.model})
        send(followupAnswer)
      } else if (message.includes(serviceHeader) && message.includes(result)) {
        arrivals.push({kind: 'service', model: request.model})
        send(answer)
      } else if (message.includes(goal)) {
        childModel = request.model
        await childGate.promise
        send(result)
      } else if (message === prompt) {
        const tool = request.messages.slice(index + 1).find(item => item.role === 'tool')
        if (tool) {
          const receipt = JSON.parse(tool.content)
          assert.equal(receipt.status, 'dispatched', 'Expected the native delegate_task to dispatch a child')
          waiting = true
          await parentGate.promise
          send('Поручение отправлено.')
        } else {
          send('Поручаю проверку.', [{name: 'delegate_task', args: {background: true,
            tasks: [{task_name: 'queue_probe', goal}]}}])
        }
      } else {
        return false
      }
      return true
    }
  }
}

const ledgerRead = [
  'import json, sqlite3, sys',
  'from pathlib import Path',
  'with sqlite3.connect(Path(sys.argv[1]).as_uri()+"?mode=ro", uri=True) as db:',
  '    db.row_factory = sqlite3.Row',
  '    key, followup = sys.argv[2:]',
  '    rows = db.execute("select admission_id,target_session_id,seq,status,payload_json from session_admissions order by seq")',
  '    deliveries = []',
  '    for row in rows:',
  '        payload = json.loads(row["payload_json"])',
  '        text = payload.get("text", "")',
  '        if key in text or followup == text:',
  '            receipt = dict(row)',
  '            receipt.pop("payload_json")',
  '            receipt["kind"] = (payload.get("local_automation_v1") or {}).get("display_kind") if key in text else "human"',
  '            deliveries.append(receipt)',
  '    child = [dict(row) for row in db.execute("select id,parent_session_id,model from sessions where source = ? and id in (select session_id from messages where instr(content, ?) > 0 and role = ?)", ("subagent", key, "assistant"))]',
  '    saved = [dict(row) for row in db.execute("select session_id,display_kind from messages where instr(content,?)>0 and display_kind=?", (key,"async_delegation_complete"))]',
  '    print(json.dumps({"deliveries":deliveries,"child":child,"saved":saved}))',
].join('\n')

export async function verifyPersonalQueue({ page, expect, projectChat, screenshot, fixture, pythonPath, sandbox }) {
  const selectChat = () => projectChat('Проверка каталога').press('Enter', { timeout: 20000 })
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible').first()
  const input = () => chat.locator('[data-slot="composer-surface"] [contenteditable="true"]:visible').first()
  const dock = chat.locator('[data-slot="composer-dock"]')
  const queue = dock.locator('[data-hcv-queue]')
  const rows = queue.locator('[data-slot="status-row"]:visible')
  const counts = page.locator('[data-hcv-summary-agents] [data-hcv-agent-counts]:visible').first()
  const send = async text => {
    await input().fill(text)
    await input().press('Enter')
  }
  const readLedger = () => {
    const db = path.join(sandbox.hermesHome, 'state.db')
    const read = spawnSync(pythonPath, ['-I', '-B', '-X', 'utf8', '-c', ledgerRead, db, fixture.result, fixture.followup],
      { encoding: 'utf8', windowsHide: true, timeout: 4000 })
    assert.equal(read.status, 0, read.error?.message || read.stderr)
    return JSON.parse(read.stdout)
  }
  await selectChat()
  await send(fixture.prompt)
  await expect.poll(() => fixture.ready, { timeout: 45000 }).toBe(true)
  assert.equal(fixture.childModel, 'kimi-for-coding', 'The child must use the Kimi route')
  fixture.releaseChild()
  await expect.poll(() => readLedger().deliveries.map(row => [row.kind, row.status]), { timeout: 25000 })
    .toEqual([['async_delegation_complete', 'queued']])
  await expect(counts).toHaveText('Готово: 1')
  await expect(queue).toHaveCount(0)
  assert.deepEqual(fixture.arrivals, [], 'No result may reach the busy parent yet')
  await screenshot('personal-queue-service-only.png')

  await send(fixture.followup)
  const assertQueue = async () => {
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(fixture.followup)
    await expect(rows.first().locator('.status-dismiss-button')).toHaveCount(1)
  }
  await assertQueue()
  await expect.poll(() => readLedger().deliveries.map(row => [row.kind,row.status]))
    .toEqual([['async_delegation_complete', 'queued'], ['human', 'queued']])
  await screenshot('personal-queue-user.png')
  // A reload asks the authority for a fresh snapshot while both entries are
  // still durable. A live event alone cannot prove this route.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await selectChat()
  await assertQueue()
  await expect(counts).toHaveText(/^(Готово|Передано): 1$/)
  const before = readLedger()
  assert.equal(before.child.length, 1)

  fixture.releaseParent()
  await expect.poll(() => readLedger().deliveries.map(row => row.status), { timeout: 45000 }).toEqual(['terminal', 'terminal'])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await selectChat()
  await expect(chat.getByText(fixture.answer, { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(chat.getByText(fixture.followupAnswer, { exact: true })).toBeVisible()
  await expect(queue).toHaveCount(0)
  await expect(counts).toBeVisible()
  const after = readLedger()
  assert.deepEqual(after.deliveries.map(row => [row.admission_id, row.status]),
    before.deliveries.map(row => [row.admission_id, 'terminal']))
  assert.deepEqual(after.child, before.child)
  assert.equal(after.saved.length, 1)
  assert.equal(after.saved[0].session_id, before.child[0].parent_session_id)
  assert.deepEqual(fixture.arrivals, [{kind: 'service', model: 'mock-model'}, {kind: 'user', model: 'mock-model'}])

  return { before, after, arrivals: fixture.arrivals, childModel: fixture.childModel, reloadedPending: true, reloadedHistory: true }
}

