import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export async function verifySavedMainTurns({ page, expect, projectChat, projectFolder,
  singleEditPrompt, editsPrompt, singleFile, newFiles, seedLine, screenshot, hermesHome, pythonPath }) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const decline = page.getByRole('button', { name: 'Нет, спасибо', exact: true }).first()
  if (await decline.isVisible()) await decline.click()
  await projectChat('Ревью интерфейса').click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  const cards = chat.locator('[data-hcv-saved-turn-card]')
  const dates = chat.locator('[data-hcv-timestamp-separator]')
  await expect(dates).toHaveCount(1, { timeout: 15000 })
  const initialDate = await dates.locator('time').getAttribute('datetime')
  assert(Date.now() - Date.parse(initialDate) > 3600000)
  await expect(dates).toHaveAttribute('role', 'separator')
  await expect(dates.locator('time')).toHaveCSS('font-size', '14px')
  await expect(dates.locator('time')).toHaveCSS('line-height', '20px')
  await expect(dates.locator('[data-hcv-timestamp-day]')).toHaveCSS('font-weight', '500')
  await screenshot('saved-main-date.png', { timeout: 30000 })
  const send = async (prompt, answer) => {
    await editor.fill(prompt); await editor.press('Enter')
    await expect(chat.getByText(answer, { exact: true })).toBeVisible({ timeout: 60000 })
  }
  await send(singleEditPrompt, 'Изменил один тестовый файл.')
  try { await expect(cards).toHaveCount(1, { timeout: 30000 }) }
  catch (error) {
    console.log('Saved history diagnostic', JSON.stringify(await page.evaluate(async (joinSource) => {
      const values = new Set(), views = [], messages = []
      const node = document.querySelector('[data-chat-surface][data-composer-target="main"] [data-slot="aui_user-message-root"]')
      let fiber = node?.[Object.keys(node || {}).find(key => key.startsWith('__reactFiber$'))]
      for (; fiber; fiber = fiber.return) {
        if (fiber.memoizedProps?.value) values.add(fiber.memoizedProps.value)
        for (let dep = fiber.dependencies?.firstContext; dep; dep = dep.next) values.add(dep.memoizedValue)
      }
      for (const value of values) if (value?.$messages?.get) views.push({
        runtimeId: value.$runtimeId?.get(), storedId: value.$storedId?.get(),
        rows: value.$messages.get().map(row => ({ id: row.id, rowId: row.rowId, role: row.role })) })
      for (const value of values) if (typeof value?.message === 'function') {
        try { const state = value.message().__internal_getRuntime?.()?.getState?.();
          messages.push({ source: value.message.source, id: state?.id, role: state?.role }) } catch { messages.push({ error: true }) }
      }
      const probes = {}
      for (const endpoint of ['turn-timeline', 'turn-changes']) {
        try {
          const response = await window.hermesDesktop.api({ profile: 'default', passive: true, timeoutMs: 5000,
            path: '/api/plugins/hermes-codex-visual/' + endpoint + '?session_id=20261108_124501_aab001&parent_session_id=20261108_124501_aab001' })
          probes[endpoint] = response
        } catch (probe) { probes[endpoint] = String(probe) }
      }
      const committed = element => {
        if (!element) return null
        const keys = Object.keys(element)
        let item = element[keys.find(key => key.startsWith('__reactFiber$'))]
        const props = element[keys.find(key => key.startsWith('__reactProps$'))]
        if (item?.memoizedProps !== props) item = item?.alternate
        return item?.memoizedProps === props ? item : null
      }
      const read = new Function('committedFiber', joinSource + '; return nativeRenderedMessageRecord')(committed)
      const surface = node?.closest('[data-chat-surface]')
      const turns = [...(surface?.querySelectorAll('[data-slot="aui_turn-pair"]') || [])].map(turn => {
        const prompt = turn.querySelector(':scope > [data-slot="aui_user-message-root"]')
        const record = prompt && read(prompt)
        return { prompt: Boolean(prompt), committed: Boolean(committed(prompt)), rowId: record?.rowId,
          storedId: record?.storedId, runtimeId: record?.runtimeId,
          assistants: turn.querySelectorAll('[data-slot="aui_assistant-message-root"]').length,
          actions: turn.querySelectorAll('[data-slot="aui_msg-actions"]').length }
      })
      return { views, messages, elementId: node?.closest('[data-message-id]')?.getAttribute('data-message-id'), probes,
        turns, hidden: document.hidden, theme: document.documentElement.getAttribute('data-hermes-theme'),
        forcedColors: matchMedia('(forced-colors: none)').matches, anchor: surface?.getAttribute('data-session-anchor'),
        dates: surface?.querySelectorAll('[data-hcv-timestamp-separator]').length }
    }, fs.readFileSync(new URL('../source/native-rendered-message.js', import.meta.url), 'utf8')
      .replace(/^import[^\n]*\n/gm, '').replace(/export function /g, 'function '))))
    throw error
  }
  const first = cards.first()
  await expect(first.locator('[data-hcv-turn-card-title]')).toHaveText('Изменён ' + path.basename(singleFile))
  await expect(first.locator('[data-hcv-turn-card-added]').first()).toHaveText('+2')
  await expect(first.locator('[data-hcv-turn-card-removed]').first()).toHaveText('−0')
  const file = path.join(projectFolder, singleFile), after = fs.readFileSync(file)
  const snapshot = await first.getAttribute('data-snapshot-id')
  await first.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Повторно применить', exact: true })).toBeEnabled()
  await expect(page.getByText('Changes reverted', { exact: true }).first()).toBeVisible()
  assert.equal(fs.readFileSync(file, 'utf8'), seedLine + '\n')
  await expect(page.getByRole('dialog', { name: 'Восстановить до этого чекпоинта?' })).toHaveCount(0)
  await first.getByRole('button', { name: 'Повторно применить', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  await expect(page.getByText('Changes reapplied', { exact: true }).first()).toBeVisible()
  assert(fs.readFileSync(file).equals(after))
  await page.mouse.move(3, 80)
  await screenshot('saved-main-one-file.png', { timeout: 30000 })

  await send(editsPrompt, 'Изменил пять файлов и закончил проверку.')
  await expect(cards).toHaveCount(2, { timeout: 30000 })
  const second = cards.last()
  await expect(second.locator('[data-hcv-turn-card-title]')).toHaveText('Изменено 5 файлов')
  await expect(second.locator('[data-hcv-turn-card-file]')).toHaveCount(3)
  const cardShadow = await second.evaluate(node => getComputedStyle(node).boxShadow)
  assert.notEqual(cardShadow, 'none')
  assert.doesNotMatch(cardShadow, /inset/)
  await expect(second).toHaveCSS('overflow', 'hidden')
  const more = second.locator('[data-hcv-turn-card-more]')
  await more.scrollIntoViewIfNeeded()
  const header = second.locator('[data-hcv-turn-card-header]')
  await header.evaluate(node => {
    const viewport = node.closest('[data-slot="aui_thread-viewport"]')
    const turn = node.closest('[data-slot="aui_turn-pair"]')
    window.__hcvCardPosition = []
    let count = 0
    const sample = () => {
      window.__hcvCardPosition.push({ top: node.getBoundingClientRect().top, scroll: viewport?.scrollTop,
        viewport: Boolean(viewport), turn: Boolean(turn), height: turn?.getBoundingClientRect().height })
      if (++count < 90) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  const beforeExpand = (await header.boundingBox()).y
  await more.click()
  await expect(second.locator('[data-hcv-turn-card-file]')).toHaveCount(5)
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const afterExpand = (await header.boundingBox()).y
  if (Math.abs(afterExpand - beforeExpand) > 1) console.log('HCV_CARD_POSITION', JSON.stringify(await page.evaluate(() => window.__hcvCardPosition)))
  assert(Math.abs(afterExpand - beforeExpand) <= 1, `Card header moved: ${beforeExpand} -> ${afterExpand}`)
  await page.waitForTimeout(800)
  const settledExpand = (await header.boundingBox()).y
  assert(Math.abs(settledExpand - beforeExpand) <= 1, `Card header moved after settling: ${beforeExpand} -> ${settledExpand}`)
  await page.mouse.move(3, 80)
  await screenshot('saved-main-expanded-card.png', { timeout: 30000 })
  await more.click()
  await expect(second.locator('[data-hcv-turn-card-file]')).toHaveCount(3)
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await more.click()
  await expect(second.locator('[data-hcv-turn-card-file]')).toHaveCount(3)
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  const row = second.locator('[data-hcv-turn-card-file]').nth(1)
  await row.scrollIntoViewIfNeeded()
  await page.mouse.move(3, 80)
  const normalFileBackground = await row.evaluate(node => getComputedStyle(node).backgroundColor)
  await row.hover()
  const hoveredFileBackground = await row.evaluate(node => getComputedStyle(node).backgroundColor)
  assert.notEqual(hoveredFileBackground, normalFileBackground)
  await screenshot('saved-files-hover.png', { timeout: 30000 })
  console.log('Saved file row backgrounds', JSON.stringify({ normalFileBackground, hoveredFileBackground, cardShadow }))
  await second.getByRole('button', { name: 'Показать еще 2 файла', exact: true }).click()
  await expect(second.locator('[data-hcv-turn-card-file]')).toHaveCount(5)
  for (const name of newFiles) assert(fs.existsSync(path.join(projectFolder, name)))
  const secondSnapshot = await second.getAttribute('data-snapshot-id')
  const savedFiles = new Map([singleFile, ...newFiles].map(name => [name, fs.readFileSync(path.join(projectFolder, name))]))
  await second.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(second.getByRole('button', { name: 'Повторно применить', exact: true })).toBeEnabled()
  assert(fs.readFileSync(file).equals(after), 'Undo only the selected later turn')
  await second.getByRole('button', { name: 'Повторно применить', exact: true }).click()
  await expect(second.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  for (const [name, bytes] of savedFiles) assert(fs.readFileSync(path.join(projectFolder, name)).equals(bytes))
  await page.mouse.move(3, 80)
  await screenshot('saved-main-many-files.png', { timeout: 30000 })

  // A manual edit must cause a conflict, preserving those bytes.
  const manual = Buffer.from(fs.readFileSync(file, 'utf8').replace('Первая строка.', 'Manual change.'))
  fs.writeFileSync(file, manual)
  await first.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  await expect(page.getByText('Не удалось отменить изменения', { exact: true }).first()).toBeVisible()
  assert(fs.readFileSync(file).equals(manual), 'A conflicting old turn cannot overwrite a manual edit')
  fs.writeFileSync(file, savedFiles.get(singleFile))

  await projectChat('Проверка каталога').click()
  await expect(chat.locator('[data-hcv-saved-turn-card]')).toHaveCount(0)
  await projectChat('Ревью интерфейса').click()
  await expect(cards).toHaveCount(2, { timeout: 30000 })
  await expect(dates.locator('time')).toHaveAttribute('datetime', initialDate)
  await expect(cards.first()).toHaveAttribute('data-snapshot-id', snapshot)
  await expect(cards.last()).toHaveAttribute('data-snapshot-id', secondSnapshot)
  await send('Создай контрольную заметку для проверки истории.', 'Контрольная заметка сохранена.')
  await expect(cards).toHaveCount(3, { timeout: 30000 })
  await expect(cards.last().locator('[data-hcv-turn-card-title]')).toHaveText('Изменён timeline-native-write.txt')
  await cards.first().getByRole('button', { name: 'Просмотреть изменения', exact: true }).click()
  const diff = page.locator('[data-hcv-saved-turn-diff]:visible')
  await expect(diff).toContainText('Первая строка.')
  await expect(diff).toContainText('Вторая строка.')
  await screenshot('saved-main-history-review.png', { timeout: 30000 })
  const raw = spawnSync(pythonPath, ['-B', '-c',
    'import sqlite3,json,sys; d=sqlite3.connect(sys.argv[1]); rows=d.execute("SELECT display_metadata FROM messages WHERE display_metadata IS NOT NULL").fetchall(); m=[json.loads(x[0]) for x in rows]; print(json.dumps({"finals":[x["hcv_timeline"] for x in m if x.get("hcv_timeline",{}).get("phase")=="final"],"captures":sum(x.get("hcv_file_changes",{}).get("version")==1 for x in m)}))',
    path.join(hermesHome, 'state.db')], { encoding: 'utf8' })
  assert.equal(raw.status, 0, raw.stderr)
  const metadata = JSON.parse(raw.stdout)
  assert(metadata.captures > 0, 'Native write result reached durable display metadata')
  assert(metadata.finals.length >= 2, 'Actual native final responses preserve producer timing')
  for (const final of metadata.finals) assert(final.completedAtMs >= final.finalAssistantStartedAtMs && final.finalAssistantStartedAtMs >= final.turnStartedAtMs)
  return { savedSnapshots: 3, sourceMainDateSeparator: true, actualUndoReapply: true, olderSnapshotStable: true, manualConflictPreserved: true,
    nativeCapturedWrites: metadata.captures, producerFinals: metadata.finals.length }
}
