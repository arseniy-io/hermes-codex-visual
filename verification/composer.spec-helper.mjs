import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

export async function verifyComposer({ page, expect, screenshot, mock, prompt, sandbox, pythonPath }) {
  const form = page.locator('form[data-slot="composer-root"][data-tour="composer"]:visible')
  const input = form.getByRole('textbox', { name: 'Сообщение' })
  const menu = form.getByRole('listbox')
  const tray = page.getByRole('group', { name: 'Очередь сообщений' })
  const rows = tray.locator('[data-slot="status-row"]')
  const more = row => row.getByRole('button', { name: 'Действия с сообщением в очереди' })
  const popup = page.getByRole('menu', { name: 'Действия с сообщением в очереди' })
  const queueControl = form.getByRole('button', { name: 'Вставить сообщение в очередь', includeHidden: true })
  const sent = text => mock.receivedPrompts.filter(value => value === text).length

  await input.fill('/')
  await expect(menu.locator('button').first()).toBeVisible({ timeout: 20000 })
  await expect(menu).toHaveCSS('border-radius', '20px')
  await expect(menu.getByText('Сеанс', { exact: true })).toBeAttached()
  await expect(menu.locator('button[data-highlighted]')).toHaveCount(1)
  const firstChoice = await menu.locator('button[data-highlighted]').textContent()
  await input.press('ArrowDown')
  await expect(menu.locator('button[data-highlighted]')).not.toHaveText(firstChoice)
  await input.press('Escape')
  await expect(menu).toHaveCount(0)

  await input.fill('/stat')
  await menu.getByText('/status', { exact: true }).click({ timeout: 15000 })
  await expect(menu).toHaveCount(0)
  await expect(input.locator('[data-ref-text="/status"]')).toHaveCount(1)

  await input.fill(prompt)
  // Current Hermes does not mount the queue action until a reply is running.
  await expect(queueControl).toHaveCount(0)
  await input.press('Enter')
  await expect.poll(() => sent(prompt), { timeout: 40000 }).toBe(1)
  await expect(form.getByRole('button', { name: /^(Стоп|Приостановить)$/ }).first()).toBeVisible()

  const firstLine = 'Первое сообщение в очереди.'
  const secondLine = 'Вторая строка черновика.'
  await input.fill(firstLine)
  await input.press('End')
  await input.press('Shift+Enter')
  await page.keyboard.insertText(secondLine)
  await expect.poll(() => input.evaluate(node => node.innerText)).toBe(firstLine + '\n' + secondLine)
  await expect(tray).toHaveCount(0)

  await input.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(tray).toHaveCSS('border-top-left-radius', '16px')
  await expect(tray.locator('.status-section-header')).toBeHidden()
  await expect(rows.first()).toContainText(firstLine)
  await expect(rows.first().locator('.status-row-content p')).toHaveCSS('white-space', 'nowrap')
  await expect(rows.first().locator('.status-row-content p')).toHaveCSS('text-overflow', 'ellipsis')
  await expect(rows.first().locator('.status-row-actions button[aria-expanded]:not([data-hcv-queue-more])')).toBeHidden()
  await expect(input).toHaveText('')

  await more(rows.first()).click()
  await expect(popup.getByRole('menuitem')).toHaveText(['Редактировать сообщение', 'Удалить сообщение из очереди'])
  await page.keyboard.press('Escape')
  if (process.env.HERMES_VISUAL_QUEUE_APPEARANCE_ONLY === '1') {
    const first = rows.first()
    const second = 'Слово '.repeat(45).trim() + '\nВторая строка вложенного сообщения.'
    await input.fill(second)
    await input.press('Enter')
    await expect(rows).toHaveCount(2)
    const measure = p => p.evaluate(node => {
      const style = getComputedStyle(node)
      return { rowHeight: node.closest('[data-slot="status-row"]').getBoundingClientRect().height,
        height: node.getBoundingClientRect().height, lineHeight: style.lineHeight, fontSize: style.fontSize,
        clipped: node.scrollWidth > node.clientWidth }
    })
    const long = await measure(rows.last().locator('.status-row-content p'))
    const short = await measure(first.locator('.status-row-content p'))
    assert.equal(long.rowHeight, short.rowHeight)
    assert.equal(long.height, parseFloat(long.lineHeight))
    assert.equal(long.clipped, true)
    await more(rows.last()).click()
    await screenshot('queue-parity-menu.png')
    await popup.getByRole('menuitem', { name: 'Удалить сообщение из очереди' }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(firstLine)
    await screenshot('queue-parity-single-line.png')
    let expected = firstLine + '\n' + secondLine
    let expectedDelivery
    if (process.env.HERMES_VISUAL_QUEUE_DIAGNOSTIC === '1') {
      console.log('Sanitized queue capabilities', await page.evaluate(() => Object.values(JSON.parse(
        localStorage.getItem('hermes.desktop.composerQueue.v1') ?? '{}')).flat().map(({ serverStatus, serverControls }) => ({
          serverStatus, serverControls,
        }))))
      const probe = spawnSync(pythonPath, ['-I', '-B', '-X', 'utf8', '-c', `
import sqlite3, json, sys
from pathlib import Path
db = Path(sys.argv[1]).resolve(strict=True)
assert db.parent.parent.name.startswith('hermes-e2e-codex-visual-')
with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True) as conn:
    rows = conn.execute("""SELECT s.source, a.payload_json FROM session_admissions a
        JOIN sessions s ON s.id = a.target_session_id WHERE a.status = 'queued'""").fetchall()
    print(json.dumps([{'source': source, 'keys': sorted(json.loads(payload))} for source, payload in rows]))
`, sandbox.hermesHome + '/state.db'], { encoding: 'utf8' })
      assert.equal(probe.status, 0, probe.stderr)
      console.log('Isolated plain prompt metadata', JSON.parse(probe.stdout))
    }
    if (process.env.HERMES_VISUAL_QUEUE_OWNER_ACTIONS === '1') {
      await more(first).click()
      await popup.getByRole('menuitem', { name: 'Редактировать сообщение' }).click()
      await expect.poll(() => input.evaluate(node => node.innerText), { timeout: 10000 }).toBe(expected)
      expected = 'Первое сообщение успешно отредактировано.'
      await input.fill(expected)
      await input.press('Enter')
      await expect(rows).toHaveCount(1)
      await expect(rows.first().locator('p')).toHaveText(expected)
      const correction = 'Немедленная корректировка тестового ответа.'
      await input.fill(correction)
      await input.press('Enter')
      await expect(rows).toHaveCount(2)
      if (process.env.HERMES_VISUAL_QUEUE_OWNER_REORDER === '1') {
        const waiting = 'Это сообщение отправится раньше отредактированного.'
        await input.fill(waiting)
        await input.press('Enter')
        await expect(rows).toHaveCount(3)
        await expect(tray).toHaveAttribute('data-hcv-queue-reorder', '')
        const grip = entry => entry.locator('[data-hcv-queue-grip]')
        const ink = entry => grip(entry).evaluate(node => getComputedStyle(node, '::before').opacity)
        await page.mouse.move(0, 0)
        await expect.poll(() => ink(rows.first())).toBe('0')
        await rows.last().hover()
        await expect.poll(() => ink(rows.last())).toBe('1')
        await screenshot('queue-parity-grip.png')
        await grip(rows.last()).dragTo(rows.first(), { targetPosition: { x: 85, y: 5 } })
        await expect(rows.locator('p')).toHaveText([waiting, expected, correction])
        await grip(rows.first()).press('ArrowDown')
        await expect(rows.locator('p')).toHaveText([expected, waiting, correction])
        await grip(rows.first()).dragTo(rows.nth(1), { targetPosition: { x: 85, y: 26 } })
        await expect(rows.locator('p')).toHaveText([waiting, expected, correction])
        expectedDelivery = [waiting, expected]
      }
      const control = rows.last().getByRole('button', { name: 'Скорректировать' })
      await control.hover()
      await expect(rows.last().locator('[data-hcv-queue-tooltip]:popover-open')).toHaveText('Отправить, не прерывая работу модели')
      await screenshot('queue-parity-steer.png')
      await control.click()
      await expect(rows.locator('p')).toHaveText(expectedDelivery ?? [expected])
      await expect(form.getByRole('button', { name: /^(Стоп|Приостановить)$/ }).first()).toBeVisible()
      assert.equal(sent(expected), 0, 'Steer must not drain the other queued prompt')
      console.log('Verified editing in the canonical queue and native steer without interrupt')
    }
    mock.releaseHeldStream()
    await expect.poll(() => sent(expected), { timeout: 45000 }).toBe(1)
    if (expectedDelivery) {
      assert.deepEqual(mock.receivedPrompts.filter(text => expectedDelivery.includes(text)), expectedDelivery)
      console.log('Verified drag and ArrowDown change the gateway delivery order', JSON.stringify(expectedDelivery))
    }
    assert.equal(sent(second), 0, 'Deletion must reach the actual queue owner')
    console.log('Verified real queue single-line rows, two menu actions and deletion', JSON.stringify({ short, long }))
    return
  }
  // Empty Enter now sends the head of the queue immediately in Hermes, so it
  // would remove the row whose edit, order and drain this fixture exercises.
  assert.deepEqual(mock.receivedPrompts, [prompt])

  if (process.env.HERMES_VISUAL_DIAGNOSE_SERVER_QUEUE === '1') {
    const extra = ['Диагностика очереди 2.', 'Диагностика очереди 3.']
    for (const [index, text] of extra.entries()) {
      await input.fill(text)
      await input.press('Enter')
      await expect(rows).toHaveCount(index + 2, { timeout: 15000 })
      await expect(input).toHaveText('')
    }
    const grip = rows.first().locator('[data-hcv-queue-grip]')
    const snapshot = async () => ({
      order: await rows.locator('p').allTextContents(),
      canReorder: await tray.getAttribute('data-hcv-queue-reorder'),
      gripVisible: await grip.isVisible(),
      queues: await page.evaluate(() => {
        const queues = JSON.parse(localStorage.getItem('hermes.desktop.composerQueue.v1') || '{}')
        return Object.values(queues).map(entries => entries.map(entry => ({
          text: entry.text, serverStatus: entry.serverStatus || null, serverControls: entry.serverControls || null,
        })))
      }),
    })
    await expect.poll(async () => {
      const data = await snapshot()
      return data.queues.flat().filter(entry => entry.serverStatus === 'queued').length
    }).toBe(3)
    const before = await snapshot()
    console.log('Server-owned queue', JSON.stringify(before))
    await expect(tray).not.toHaveAttribute('data-hcv-queue-reorder', '')
    await expect(grip).toBeHidden()
    await more(rows.first()).click()
    await expect(popup.getByRole('menuitem', { name: 'Редактировать сообщение' })).toBeDisabled()
    await page.keyboard.press('Escape')
    mock.releaseHeldStream()
    await expect.poll(() => mock.receivedPrompts.slice(), { timeout: 45000 })
      .toEqual([prompt, firstLine + '\n' + secondLine, ...extra])
    console.log('Server queue received order', JSON.stringify(mock.receivedPrompts))
    return
  }
  await more(rows.first()).press('ArrowDown')
  const edit = popup.getByRole('menuitem', { name: 'Редактировать сообщение' })
  await expect(edit).toBeFocused()
  await expect(edit).toHaveCSS('outline-style', 'none')
  await expect(edit).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await edit.press('Enter')
  await expect(form.getByText('Редактирование хода в очереди в композере')).toBeVisible()
  const edited = 'Изменённое сообщение в очереди.'
  await input.fill(edited)
  await input.press('Enter')
  await expect(form.getByText('Редактирование хода в очереди в композере')).toHaveCount(0)
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(edited)

  const clicked = 'Сообщение со стрелки отправки.'
  await input.fill(clicked)
  await form.getByRole('button', { name: 'Отправить', exact: true }).click()
  for (const text of ['Третье сообщение.', 'Убрать из очереди.']) {
    await input.fill(text)
    await input.press('Enter')
  }
  await expect(rows).toHaveCount(4)
  await expect(input).toHaveText('')
  const surface = form.locator('[data-slot="composer-surface"]')
  const box = await tray.boundingBox()
  const composer = await surface.boundingBox()
  assert(box && composer && Math.abs(box.x - composer.x - 13) <= 1)
  assert(Math.abs(composer.width - box.width - 26) <= 2)
  await expect(form.locator('[data-slot="status-drawer-toggle"]')).toBeHidden()
  await expect(rows.first()).toHaveCSS('height', '32px')
  await expect(rows.first().locator('button:has(> svg.tabler-icon-pencil)')).toBeHidden()
  await expect(rows.first().locator('button:has(> svg.tabler-icon-corner-down-left)')).toBeHidden()
  assert(Math.abs(box.y + box.height - composer.y - 20) <= 1, 'Queue must tuck 20px behind the composer')
  await expect(surface).toHaveCSS('height', '98px')
  const editor = await input.boundingBox()
  const toolbar = await form.locator('[class~="[grid-area:menu]"]').boundingBox()
  assert(editor && toolbar && editor.y + editor.height < toolbar.y, 'Editor and controls must use separate rows')
  const control = rows.first().getByRole('button', { name: 'Скорректировать' })
  await expect(control).toBeVisible()
  await control.hover()
  await expect(rows.first().locator('[data-hcv-queue-tooltip]:popover-open')).toHaveText('Отправить, не прерывая работу модели')
  assert.deepEqual(mock.receivedPrompts, [prompt])
  const clip = {
    x: Math.floor(composer.x) - 12, y: Math.floor(box.y) - 12,
    width: Math.ceil(composer.width) + 24, height: Math.ceil(composer.y + composer.height - box.y) + 24,
  }
  const grip = row => row.getByRole('button', { name: /Переместить сообщение в очереди/ })
  const gripInk = target => target.evaluate(node => getComputedStyle(node, '::before').opacity)
  await page.mouse.move(0, 0)
  await expect.poll(() => gripInk(grip(rows.first()))).toBe('0')
  await rows.first().hover()
  await expect.poll(() => gripInk(grip(rows.first()))).toBe('1')
  await screenshot('queue.png', { clip })
  await more(rows.first()).click()
  await expect(popup.getByRole('menuitem')).toHaveText(['Редактировать сообщение', 'Удалить сообщение из очереди'])
  await expect(popup).toHaveCSS('border-radius', '16px')
  await screenshot('queue-actions.png', { clip })

  await page.keyboard.press('Escape')
  await grip(rows.first()).dragTo(rows.nth(2), { targetPosition: { x: 100, y: 22 } })
  await expect(rows.locator('p')).toHaveText([clicked, 'Третье сообщение.', edited, 'Убрать из очереди.'])
  await grip(rows.nth(1)).press('ArrowUp')
  await expect(rows.locator('p')).toHaveText(['Третье сообщение.', clicked, edited, 'Убрать из очереди.'])
  await rows.last().getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(rows).toHaveCount(3)
  assert.deepEqual(mock.receivedPrompts, [prompt])

  mock.releaseHeldStream()
  await expect.poll(() => mock.receivedPrompts.slice(), { timeout: 45000 }).toEqual([prompt, 'Третье сообщение.', clicked, edited])
  await expect(tray).toHaveCount(0)
  console.log('Verified queue overlap, stacked input, hover handle, drag and keyboard order, edit, delete and drain')
}
