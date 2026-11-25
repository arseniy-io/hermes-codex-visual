import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { measureComposerBottomGap, verifyComposerBottomGap } from './composer-bottom-gap.spec-helper.mjs'

export async function verifyTurnControl({ page, expect, projectChat, projectFolder, screenshot, pythonPath, releaseChild, readCalls, childWaiting }) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  let tiled = false
  const chat = () => page.locator(tiled
    ? '[data-chat-surface][data-session-anchor^="session-tile:"]:visible'
    : '[data-chat-surface][data-session-anchor="workspace"]:visible').last()
  const englishNotices = () => chat().getByText(/Operation interrupted: waiting for model response|Your request was not processed/)
    .and(page.locator(':visible'))
  const send = async text => {
    const input = chat().locator('[data-slot="composer-surface"] :is([contenteditable="true"], textarea)').first()
    const surfaces = await page.locator('[data-chat-surface]:visible').evaluateAll(nodes =>
      nodes.map(node => ({ anchor: node.dataset.sessionAnchor, target: node.dataset.composerTarget,
        editors: [...node.querySelectorAll('[contenteditable],textarea')].map(input => input.outerHTML.slice(0, 180)) })))
    console.log('Turn-control composer', JSON.stringify(surfaces))
    await input.fill(text); await input.press('Enter')
  }
  const rpc = (method, params = {}) => page.evaluate(async ({ method, params }) => {
    const host = window.__HERMES_PLUGIN_SDK__.host
    const owner = host.state.focusedSessionOwner.get()
    if (!owner?.connectionId || !owner.profile) throw new Error('Unproven focused session owner')
    return host.requestProfile({ ...owner, targetProfile: owner.profile }, method,
      { session_id: host.state.focusedSessionId.get(), ...params }, 75000)
  }, { method, params })
  const alive = filename => {
    const file = path.join(projectFolder, filename)
    if (!fs.existsSync(file)) return null
    const pid = Number(fs.readFileSync(file, 'utf8'))
    assert(Number.isSafeInteger(pid) && pid > 0)
    const result = spawnSync(pythonPath, ['-B', '-c',
      'import psutil,sys;print(int(psutil.pid_exists(int(sys.argv[1]))))', String(pid)], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim() === '1'
  }
  const heldPid = 'hcv-stopped-process.pid', neighborPid = 'hcv-neighbor-process.pid'
  let neighbor
  try {
    await projectChat('Ревью интерфейса').click({ timeout: 45000 })
    await send('HCV_NEIGHBOR_PROCESS')
    try {
      await expect(chat().getByText('HCV_NEIGHBOR_READY', { exact: true }).or(
        chat().getByRole('button', { name: 'Показать подробности ошибки' }))).toBeVisible({ timeout: 30000 })
      if (await chat().getByRole('button', { name: 'Показать подробности ошибки' }).isVisible()) throw new Error('Native turn failed')
      await expect(chat().getByText('HCV_NEIGHBOR_READY', { exact: true })).toBeVisible({ timeout: 30000 })
    } catch (error) {
      const details = chat().getByRole('button', { name: 'Показать подробности ошибки' })
      if (await details.isVisible()) await details.click()
      console.log('Native turn failure', await chat().innerText())
      throw error
    }
    await expect.poll(() => alive(neighborPid)).toBe(true)
    neighbor = await page.evaluate(() => ({ runtimeId: window.__HERMES_PLUGIN_SDK__.host.state.focusedSessionId.get(),
      owner: window.__HERMES_PLUGIN_SDK__.host.state.focusedSessionOwner.get() }))

    await projectChat('Проверка каталога').click({ modifiers: ['Control'] })
    tiled = true
    await page.evaluate(() => {
      const host = window.__HERMES_PLUGIN_SDK__.host
      window.__hcvStopCompletions = []
      window.__hcvStopCompletionOff = host.onEvent('message.complete', event => {
        if (window.__hcvStopCompletions.length < 32) {
          window.__hcvStopCompletions.push({ connectionId: event.connectionId, profile: event.profile,
            session_id: event.session_id, payload: event.payload })
        }
      })
    })
    await send('HCV_STOP_ROOT')
    await expect.poll(() => alive(heldPid), { timeout: 30000 }).toBe(true)
    let before
    await expect(async () => {
      if (process.env.HCV_INPROC === '1') before = await rpc('subagent.list')
      else {
        assert(childWaiting(), 'The actual child provider wait has not begun')
        const root = await page.evaluate(() => window.__HERMES_PLUGIN_SDK__.host.state.focusedStoredSessionId.get())
        const query = spawnSync(pythonPath, ['-B', '-c',
          'import sqlite3,json,sys;from pathlib import Path;home=Path(sys.argv[1]);assert home.name=="hermes-home" and home.parent.name.startswith("hermes-e2e-codex-visual-");' +
          'c=sqlite3.connect((home/"state.db").as_uri()+"?mode=ro",uri=True);root=sys.argv[2];' +
          'children=c.execute("SELECT id FROM sessions WHERE parent_session_id=? AND source=\'subagent\'",(root,)).fetchall();assert len(children)==1;' +
          'results=[json.loads(r[0]) for r in c.execute("SELECT content FROM messages WHERE session_id=? AND role=\'tool\' AND tool_name=\'delegate_task\'",(root,))];' +
          'result=next((r for r in reversed(results) if isinstance(r,dict) and len(r.get("subagent_ids",[]))==1),None);' +
          'print(json.dumps({"source":"native-owner-store-and-provider-wait","subagents":[{"child_session_id":children[0][0],"subagent_id":result["subagent_ids"][0] if result else None,"goal":"HCV_CHILD_WAIT HCV_STOP","status":"running"}]}))',
          path.join(path.dirname(projectFolder), 'hermes-home'), root], { encoding: 'utf8', windowsHide: true })
        assert.equal(query.status, 0, query.stderr)
        before = JSON.parse(query.stdout)
      }
      assert(before.subagents.some(child => child.goal?.includes('HCV_CHILD_WAIT') && child.status === 'running'))
    }).toPass({ timeout: 30000 })
    const child = before.subagents.find(item => item.goal?.includes('HCV_CHILD_WAIT'))
    assert(child.child_session_id)
    if (process.env.HCV_INPROC === '1') assert(child.subagent_id)
    const composerAction = mode => chat().locator(`[data-hcv-turn-composer-action="${mode}"]`)
    const pause = composerAction('pause')
    await expect(pause).toHaveAccessibleName('Приостановить')
    await expect(pause.locator('svg')).toHaveAttribute('viewBox', '0 0 20 20')
    await expect(pause.locator('path')).toHaveAttribute('d', 'M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z')
    assert.deepEqual(await pause.locator('svg').evaluate(node => [getComputedStyle(node).width, getComputedStyle(node).height]), ['16px', '16px'])
    await screenshot('turn-control-running.png', { animations: 'allow' })
    const stop = process.env.HCV_STOP_FROM_BUBBLE === '1'
      ? chat().locator('[data-slot="aui_user-message-root"]').getByRole('button', { name: /^(Стоп|Остановить|Stop)$/ })
      : pause
    console.log('Pre-stop checkpoint', JSON.stringify(await rpc('session.tree_status')))
    await stop.click()
    const assertStopped = async (prompt, commentary) => {
      const pair = chat().locator('[data-slot="aui_turn-pair"]')
        .filter({ has: page.locator('[data-slot="aui_user-message-root"]').getByText(prompt, { exact: true }) })
      const line = pair.locator('[data-hcv-turn-stop-line]')
      await expect(line).toHaveText(/Вы остановили выполнение через .+/, { timeout: 75000 })
      await expect(line.locator('time')).toHaveAttribute('datetime', /^PT\d+S$/)
      const typography = await line.evaluate(node => {
        const style = getComputedStyle(node)
        return { border: style.borderInlineStartWidth, color: style.color,
          timeColor: getComputedStyle(node.querySelector('time')).color,
          size: style.fontSize, activitySize: style.getPropertyValue('--hcv-activity-font').trim() }
      })
      assert.equal(typography.border, '0px')
      assert.equal(typography.color, typography.timeColor)
      assert.equal(typography.size, typography.activitySize)
      await expect(chat().locator('[data-hcv-turn-control-panel]:visible')).toHaveCount(0)
      await expect(pair.locator('[data-slot="aui_assistant-message-stopped"]:visible, [data-hcv-stop-diagnostic]:visible')).toHaveCount(0)
      await expect(pair.locator('[data-hcv-turn-folded], button[data-hcv-turn-line]')).toHaveCount(0)
      if (commentary) {
        const prose = pair.getByText(commentary, { exact: true })
        await expect(prose).toBeVisible()
        assert(await prose.evaluate(node => {
          const pair = node.closest('[data-slot="aui_turn-pair"]')
          const stop = pair.querySelector('[data-hcv-turn-stop-line]')
          const activities = [...pair.querySelectorAll('[data-hcv-activity-group], [data-tool-summary], [data-tool-row]')]
          return Boolean(stop.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            activities.some(activity => activity.getClientRects().length &&
              (node.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING))
        }), 'The stop notice, preceding commentary and at least one command remain in order')
      }
      return line.locator('time').getAttribute('datetime')
    }
    const initialElapsed = await assertStopped('HCV_STOP_ROOT', 'Запускаю тестовую работу.')
    const stopped = await rpc('session.tree_status')
    assert.equal(stopped.state, 'stopped', JSON.stringify(stopped))
    assert.equal(stopped.remaining.length, 0, JSON.stringify(stopped))
    if (!child.subagent_id) {
      // Managed CLI can still be inside its synchronous delegate tool call.
      // The owner DB already proved the child's original durable id. Its
      // original runtime subagent id first becomes observable in Stop's
      // pre-interrupt native snapshot, then must survive Continue unchanged.
      const identity = spawnSync(pythonPath, ['-B', '-c',
        'import json,sys,os;from pathlib import Path;home=Path(sys.argv[1]);sid,cpid=sys.argv[2:4];' +
        'values=[json.loads(p.read_text(encoding="utf-8")) for p in (home/"cache/hcv-stop-checkpoints").glob("*.json")];' +
        'cp=next(c for c in values if c["checkpoint_id"]==cpid and c["owner"]["profile_home"]==os.path.normcase(str(home.resolve())));' +
        'node=next(n for n in cp["nodes"] if n["stored_id"]==sid);assert node["subagent_id"];print(json.dumps(node))',
        path.join(path.dirname(projectFolder), 'hermes-home'), child.child_session_id, stopped.checkpoint_id],
      { encoding: 'utf8', windowsHide: true })
      assert.equal(identity.status, 0, identity.stderr)
      const node = JSON.parse(identity.stdout)
      assert.equal(node.stored_id, child.child_session_id)
      child.subagent_id = node.subagent_id
      before.runtimeIdentitySource = 'pre-interrupt-native-checkpoint'
    }
    await expect.poll(() => alive(heldPid)).toBe(false)
    assert.equal(alive(neighborPid), true, 'A stop must preserve another conversation’s background process')
    const card = chat().locator('[data-hcv-saved-turn-card]')
    await expect(card).toHaveCount(1, { timeout: 20000 })
    const recordBody = fs.readFileSync(new URL('../source/native-rendered-message.js', import.meta.url), 'utf8')
      .replace(/^import[^\n]*\n/gm, '').replace(/export function/g, 'function')
    const captureNotices = async () => chat().locator('[data-role="assistant"], [data-role="system"]').evaluateAll((nodes, code) => {
      const fiber = node => {
        const keys = Object.keys(node), props = node[keys.find(key => key.startsWith('__reactProps$'))]
        let value = node[keys.find(key => key.startsWith('__reactFiber$'))]
        if (value?.memoizedProps !== props) value = value?.alternate
        return props && value?.memoizedProps === props ? value : null
      }
      const { read, readPart } = new Function('committedFiber', code + ';return {read:nativeRenderedMessageRecord,readPart:nativeRenderedTextPart}')(fiber)
      return nodes.filter(node => read(node)?.message.parts?.some(part => part.type === 'text' &&
        /Operation interrupted: waiting for model response|Your request was not processed/.test(part.text)))
        .map(node => {
          const record = read(node)
          return { role: node.dataset.role, shown: node.innerText, record: record && { ...record,
            message: { ...record.message, parts: record.message.parts.filter(part => part.type === 'text') } },
          leaves: [...node.querySelectorAll('*')].filter(element => [...element.childNodes].some(child =>
            child.nodeType === 3 && /Operation interrupted:|Your request was not processed/.test(child.data)))
            .map(element => ({ html: element.outerHTML.slice(0, 200), part: readPart(element) })) }
        })
    }, recordBody)
    await expect(englishNotices()).toHaveCount(0)
    const liveNotices = await captureNotices()
    const wireCompletions = await page.evaluate(() => window.__hcvStopCompletions)
    const stopBindings = await page.evaluate(() => ({
      requests: [...document.querySelectorAll('[data-slot="aui_user-message-root"][data-message-id]')]
        .map(node => node.dataset.messageId),
      saved: Object.keys(localStorage).filter(key => key.includes('.stopped-turn:')),
    }))
    console.log('Stop row bindings', JSON.stringify(stopBindings))
    // In-process completion carries the persisted reply. A forcibly stopped
    // managed worker can settle without a captured result/receipt; its actual
    // checkpoint, history, child identity and resumed result are checked below.
    if (process.env.HCV_INPROC === '1') assert(wireCompletions.some(event =>
      event.session_id === stopped.root_runtime_id && event.payload?.status === 'interrupted' &&
      event.payload?.persisted_turn?.submission_id), 'The live in-process turn has its native typed completion receipt')
    console.log('Native terminal records', JSON.stringify(liveNotices))
    const cardHandle = await card.elementHandle()
    for (let attempt = 0; attempt < 2; attempt++) {
      const again = await rpc('session.interrupt', { cascade: true, checkpoint_id: stopped.checkpoint_id })
      assert.equal(again.checkpoint_id, stopped.checkpoint_id)
      assert.equal(again.state, 'stopped')
    }
    await expect(card).toHaveCount(1)
    assert(await cardHandle.evaluate(node => node.isConnected), 'Repeat Stop preserves the same saved card')
    assert.equal(await assertStopped('HCV_STOP_ROOT', 'Запускаю тестовую работу.'), initialElapsed)
    assert.equal(alive(neighborPid), true)
    await screenshot('turn-stopped-tile-card.png', { animations: 'allow' })
    const pausedCalls = readCalls()
    await page.waitForTimeout(2000)
    assert.equal(readCalls(), pausedCalls, 'A stopped task must not wake the model without Continue')
    await expect(englishNotices()).toHaveCount(0)
    await expect(chat().getByText(/^\[ASYNC DELEGATION BATCH COMPLETE/).and(page.locator(':visible'))).toHaveCount(0)
    const gap = await verifyComposerBottomGap({ page, expect, screenshot, includeNarrow: true })

    if (process.env.HCV_RESUME_AFTER_RELOAD === '1') {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.reload()
      await expect(page.getByRole('button', { name: 'Бэкенд готов', exact: true })).toBeVisible({ timeout: 45000 })
      if (!await chat().count()) await projectChat('Проверка каталога').click({ modifiers: ['Control'], timeout: 30000 })
      assert.equal(await assertStopped('HCV_STOP_ROOT', 'Запускаю тестовую работу.'), initialElapsed)
      await expect(card).toHaveCount(1)
    }

    const play = composerAction('resume')
    await expect(play).toHaveAccessibleName('Возобновить')
    await expect(play.locator('path')).toHaveAttribute('d', 'M6 14.7227V5.27693C6 4.29057 7.08894 3.6928 7.9211 4.22235L15.3428 8.94526C16.1147 9.43645 16.1147 10.5632 15.3428 11.0544L7.92109 15.7773C7.08894 16.3069 6 15.7091 6 14.7227Z')
    assert.deepEqual(await play.locator('svg').evaluate(node => [getComputedStyle(node).width, getComputedStyle(node).height]), ['16px', '16px'])
    await screenshot('turn-control-resume.png', { animations: 'allow' })
    assert(await play.evaluate(button =>
      !!button.closest('[class~="[grid-area:controls]"]') &&
      button.previousElementSibling.matches('span:has(> button > svg.tabler-icon-wave-sine)')))
    const draft = chat().locator('[data-slot="composer-rich-input"][contenteditable="true"]')
    await draft.fill('Новый черновик')
    await expect(play).toHaveCount(0)
    await expect(chat().locator('form[data-slot="composer-root"] button[type="submit"]')).toBeEnabled()
    await draft.fill('')
    await expect(play).toBeVisible()
    await play.click()
    let resumed
    await expect(async () => {
      resumed = await rpc('session.tree_status', { checkpoint_id: stopped.checkpoint_id })
      assert.equal(resumed.state, 'resumed', JSON.stringify(resumed))
    }).toPass({ timeout: 30000 })
    assert(resumed.children_resumed.some(item => item.stored_id === child.child_session_id && item.subagent_id === child.subagent_id),
      'The restored child retains its exact saved conversation and identity')
    releaseChild()
    await expect(chat().getByText('HCV_ROOT_RESUMED', { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(chat().locator('[data-slot="composer-surface"] span:has(> button > svg.tabler-icon-wave-sine)'))
      .toHaveCount(1, { timeout: 30000 })
    await expect(card).toHaveCount(1)
    assert.equal(alive(neighborPid), true)
    if (await englishNotices().count()) {
      console.log('Remaining terminal records', JSON.stringify(await captureNotices()))
      console.log('Native terminal source rows', JSON.stringify(await page.evaluate(async sid => {
        const host = window.__HERMES_PLUGIN_SDK__.host, owner = host.state.focusedSessionOwner.get()
        const reply = await window.hermesDesktop.api({ ...owner, passive: true,
          path: '/api/plugins/hermes-codex-visual/turn-timeline?' + new URLSearchParams({ session_id: sid, limit: '400' }) })
        return (reply.data ?? reply).rows?.filter(row => /Operation interrupted:|Your request was not processed/.test(row.content || ''))
      }, stopped.root_stored_id)))
    }
    await expect(englishNotices()).toHaveCount(0)
    await screenshot('turn-continued-child-result.png', { animations: 'allow' })

    const composerStop = () => composerAction('pause')
    const waitForPrompt = async prompt => {
      const count = readCalls()
      await send(prompt)
      await expect.poll(readCalls, { timeout: 30000 }).toBeGreaterThan(count)
    }
    const snapshotStopOwner = () => chat().evaluate(surface => {
      const keys = Object.keys(surface)
      const props = surface[keys.find(key => key.startsWith('__reactProps$'))]
      let fiber = surface[keys.find(key => key.startsWith('__reactFiber$'))]
      if (fiber?.memoizedProps !== props) fiber = fiber?.alternate
      let view
      for (; fiber && !view; fiber = fiber.return) {
        const values = [fiber.memoizedProps?.value]
        for (let dep = fiber.dependencies?.firstContext; dep; dep = dep.next) values.push(dep.memoizedValue)
        view = values.find(value => ['primary', 'tile'].includes(value?.kind) && typeof value.$messages?.get === 'function')
      }
      return {
        started: view?.$turnStartedAt?.get(), phase: surface.dataset.hcvTurnControl,
        users: view?.$messages.get().filter(message => message.role === 'user')
          .map(message => ({ id: message.id, rowId: message.rowId, hidden: message.hidden })),
        visible: [...surface.querySelectorAll('[data-slot="aui_user-message-root"][data-message-id]')]
          .map(node => ({ id: node.dataset.messageId,
            text: node.querySelector('.composer-human-message')?.textContent?.trim().slice(0, 70) })),
        notes: Object.keys(localStorage).filter(key => key.includes('.stopped-turn:')),
      }
    })
    await waitForPrompt('HCV_STOP_EMPTY')
    console.log('Empty turn before Pause', JSON.stringify(await snapshotStopOwner()))
    await composerStop().click()
    let emptyElapsed
    try {
      emptyElapsed = await assertStopped('HCV_STOP_EMPTY')
    } catch (error) {
      console.log('Empty turn after Pause', JSON.stringify(await snapshotStopOwner()))
      throw error
    }

    await page.setViewportSize({ width: 790, height: 650 })
    const beforeCommand = readCalls()
    await send('HCV_STOP_COMMAND')
    await expect.poll(readCalls, { timeout: 30000 }).toBeGreaterThan(beforeCommand + 1)
    // Resize and sending a new prompt can leave the native reader scrolled up.
    // Measure from the bottom of a long transcript as a reader would.
    await measureComposerBottomGap(page)
    await composerStop().click()
    const commandElapsed = await assertStopped('HCV_STOP_COMMAND', 'Выполняю тестовую команду.')
    const measureCommandGap = () => chat().evaluate(surface => {
      const pair = [...surface.querySelectorAll('[data-hcv-turn-stopped]')].at(-1)
      const dock = surface.querySelector('[data-slot="composer-dock"]')
      const editor = dock?.querySelector('[data-slot="composer-surface"]')
      const items = [...(pair?.querySelectorAll('[data-hcv-activity-group] > button, [data-tool-summary] > div > button, [data-tool-row] > :first-child > div > button') || [])]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      if (!editor || !items.length) return null
      const last = Math.max(...items.map(item => item.getBoundingClientRect().bottom))
      const zoom = Number(surface.currentCSSZoom) || 1
      const editorTop = editor.getBoundingClientRect().top
      return { dock: (dock.getBoundingClientRect().top - last) / zoom, editor: (editorTop - last) / zoom,
        statusRows: [...dock.querySelectorAll('[data-slot="status-row"]')]
          .filter(node => node.getClientRects().length && node.getBoundingClientRect().bottom <= editorTop)
          .map(node => node.innerText.trim()) }
    })
    const naturallyFollowingGap = await measureCommandGap()
    const lastTurnGap = await measureComposerBottomGap(page)
    const commandGap = await measureCommandGap()
    console.log('Stopped last command clearance', JSON.stringify({ commandGap, naturallyFollowingGap,
      scopes: lastTurnGap.map(value => ({ footerGap: value.gapToFooter, editorGap: value.gapToEditor,
        hasActions: value.last.hasActions, last: value.last.slot, distanceToBottom: value.distanceToBottom })) }))
    await screenshot('turn-stopped-after-command.png', { animations: 'allow' })
    assert(commandGap && Math.abs(commandGap.dock - 32) <= 1,
      'Expected about 32px from the last visible tool to the composer dock: ' + JSON.stringify(commandGap))
    await expect(chat().getByText('Запрос не был обработан. Отправьте его ещё раз, если он по-прежнему нужен.', { exact: true })
      .and(page.locator(':visible'))).toHaveCount(0)
    await waitForPrompt('HCV_STOP_NEXT')
    await expect(chat().getByText('HCV_NEW_REPLY', { exact: true })).toBeVisible({ timeout: 20000 })
    await expect(chat().locator('[data-hcv-turn-stop-line]')).toHaveCount(3)
    return { before, stopped, resumed, neighborPreserved: true, singleStop: true, cardPreserved: true,
      resumedAfterReload: process.env.HCV_RESUME_AFTER_RELOAD === '1', pausedCalls, gap, liveNotices, wireCompletions,
      presentation: { initialElapsed, emptyElapsed, commandElapsed, commandGap } }
  } finally {
    await page.evaluate(() => {
      window.__hcvStopCompletionOff?.()
      delete window.__hcvStopCompletionOff
      delete window.__hcvStopCompletions
    }).catch(() => {})
    releaseChild?.()
    if (neighbor?.runtimeId) await page.evaluate(async neighbor => {
      await window.__HERMES_PLUGIN_SDK__.host.requestProfile({ ...neighbor.owner, targetProfile: neighbor.owner.profile },
        'session.interrupt', { session_id: neighbor.runtimeId, cascade: true }, 75000)
    }, neighbor).catch(() => {})
    // Exact synthetic command identity is checked before killing a fixture
    // left behind by a failed assertion; never terminate by PID alone.
    for (const filename of [heldPid, neighborPid]) {
      const file = path.join(projectFolder, filename)
      if (fs.existsSync(file)) spawnSync(pythonPath, ['-B', '-c',
        'import psutil,sys;from pathlib import Path;p=Path(sys.argv[1]);pid=int(p.read_text());' +
        '\ntry:\n q=psutil.Process(pid)\n if p.as_posix() in " ".join(q.cmdline()).replace(chr(92),"/"): q.kill();q.wait(10)' +
        '\nexcept psutil.NoSuchProcess: pass', file], { encoding: 'utf8', windowsHide: true })
    }
  }
}
