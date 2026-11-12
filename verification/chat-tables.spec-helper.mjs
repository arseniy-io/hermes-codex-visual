import assert from 'node:assert/strict'

const short = [
  '| Предмет | Цвет | Количество |',
  '| --- | --- | ---: |',
  '| Зонт | Жёлтый | 7 |',
  '| Чашка | Синяя | 14 |',
  '| Мяч | Зелёный | 3 |',
  '| Блокнот | Красный | 22 |',
].join('\n')
const rich = [
  '| Поле | Значение |',
  '| :--- | :---: |',
  '| **Формат** | `a\\|b` |',
  '| [Справка](https://example.invalid/table-docs) | Кириллица |',
].join('\n')
const row = (values) => '| ' + values.join(' | ') + ' |'
const columns = Array.from({ length: 19 }, (_, index) => index ? 'Колонка ' + index : 'Номер записи')
const wide = [
  row(columns),
  row(columns.map(() => '---:')),
  ...Array.from({ length: 28 }, (_, index) => row(columns.map((_, column) => 10000 + index * 20 + column))),
].join('\n')
const prompt = 'Покажи новую таблицу для проверки.'
const liveStart = [
  'Таблица из нового ответа.',
  '',
  '| Шаг | Результат |',
  '| --- | --- |',
  '| Начало | Первая строка |',
].join('\n')
const liveEnd = '\n| Конец | Вторая строка |\n\nОтвет завершён.'

export function makeTableFixture() {
  const held = Promise.withResolvers()
  return {
    saved: ['Обычная таблица.', short, 'Таблица с форматированием.', rich, 'Большая таблица.', wide].join('\n\n'),
    release: held.resolve,
    async reply(res, request) {
      const last = request.messages.findLast(message => message.role === 'user')
      if (typeof last?.content !== 'string' || !last.content.includes(prompt)) return false
      const identity = { id: 'chatcmpl-table-fixture', model: request.model, created: 1 }
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          ...identity, object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: liveStart + liveEnd }, finish_reason: 'stop' }],
        }))
        return true
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
        ...identity, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`)
      res.once('close', held.resolve)
      chunk({ role: 'assistant', content: liveStart + '\n' })
      await held.promise
      if (!res.destroyed) {
        chunk({ content: liveEnd.slice(1) })
        chunk({}, 'stop')
        res.end('data: [DONE]\n\n')
      }
      return true
    },
  }
}

export async function verifyChatTables({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, fixture }) {
  const capture = process.env.HERMES_VISUAL_SKIP_SCREENSHOTS !== '1'
  const root = page.locator('html')
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const tableWrap = (header) => chat.locator('[data-hcv-table-scroll]').filter({ has: page.getByRole('columnheader', { name: header, exact: true }) })
  const action = (surface, name) => surface.locator(`[data-hcv-table-action="${name}"]`)
  const dialog = page.getByRole('dialog', { name: 'Предпросмотр таблицы' })
  const tip = page.locator('[data-hcv-table-tip]')
  await projectChat('Проверка каталога').click()
  const small = tableWrap('Предмет')
  const simple = small.getByRole('table')
  const head = simple.getByRole('columnheader', { name: 'Предмет' })
  const firstCell = simple.getByRole('cell', { name: 'Зонт' })
  const numeric = simple.getByRole('cell', { name: '7', exact: true })
  const expand = action(small, 'expand')
  try {
    await expect(simple.getByRole('row')).toHaveCount(5, { timeout: 25000 })
  } catch (error) {
    console.log(JSON.stringify(await page.evaluate(() => ({
      chat: document.querySelector('[data-chat-surface][data-session-anchor="workspace"]')?.textContent.includes('Обычная таблица.'),
      turns: document.querySelectorAll('[data-slot="aui_turn-pair"]').length,
      tables: Array.from(document.querySelectorAll('table')).map(node => ({
        slot: node.closest('[data-slot="aui_assistant-message-content"]')?.dataset.slot,
        parent: node.parentElement.className, marked: node.hasAttribute('data-hcv-markdown-table'),
      })),
    }))))
    throw error
  }
  await small.scrollIntoViewIfNeeded()
  await page.mouse.move(1, 80)
  await expect(small.locator('[data-hcv-table-toolbar] > div')).toHaveCSS('opacity', '0')
  await expect(small).toHaveCSS('border-top-width', '0px')
  await expect(simple).toHaveCSS('font-size', '12.25px')
  await expect(head).toHaveCSS('font-weight', '600')
  await expect(head).toHaveCSS('padding-top', '7px')
  await expect(head).toHaveCSS('min-width', '128px')
  await expect(firstCell).toHaveCSS('padding-top', '8.75px')
  await expect(firstCell).toHaveCSS('border-bottom-width', '1px')
  await expect(numeric).toHaveCSS('text-align', 'right')
  await expect(numeric).toHaveCSS('white-space', 'nowrap')
  if (capture) await screenshot('table-rest.png')

  await small.hover()
  await expect(small.locator('[data-hcv-table-toolbar] > div')).toHaveCSS('opacity', '1')
  await expect(expand).toHaveCSS('width', '36px')
  await expand.hover()
  await expect(tip).toHaveText('Развернуть таблицу')
  await expect(tip).toBeVisible()
  if (capture) await screenshot('table-hover.png')
  await expand.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('table').getByRole('row')).toHaveCount(5)
  await expect(dialog.getByRole('cell', { name: 'Красный' })).toBeVisible()
  await expect(action(dialog, 'close')).toBeFocused()
  await expect(action(dialog, 'close')).toHaveCSS('width', '40px')
  const panel = await dialog.locator('[data-hcv-table-panel]').boundingBox()
  assert(panel && Math.abs(panel.width - 458) < 2 && Math.abs(panel.height - 278) < 3)
  if (capture) await screenshot('table-expanded.png')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(expand).toBeFocused()
  await page.keyboard.press('Space')
  await expect(dialog).toBeVisible()
  await page.mouse.click(50, 110)
  await expect(dialog).toHaveCount(0)

  // Intercept the browser clipboard event inside the test renderer.
  await page.evaluate(() => {
    const original = document.execCommand.bind(document)
    document.execCommand = (command, ...args) => {
      if (command !== 'copy') return original(command, ...args)
      const clipboard = new DataTransfer()
      document.activeElement.dispatchEvent(new ClipboardEvent('copy', { clipboardData: clipboard, bubbles: true, cancelable: true }))
      globalThis.hcvTableCopy = { plain: clipboard.getData('text/plain'), html: clipboard.getData('text/html') }
      return true
    }
  })
  const richTable = tableWrap('Значение')
  const copy = action(richTable, 'copy')
  await richTable.hover()
  await copy.click()
  await expect(copy).toHaveAttribute('data-copied', '')
  const copied = await page.evaluate(() => globalThis.hcvTableCopy)
  assert.equal(copied.plain.trim(), rich)
  assert.match(copied.html, /<table\b/)
  assert.match(copied.html, /<strong>Формат<\/strong>/)
  assert.match(copied.html, /https:\/\/example.invalid\/table-docs/)
  assert(!/\sdata-md-col-handle(?:=|\s|>)/.test(copied.html))

  const large = tableWrap('Номер записи')
  await large.scrollIntoViewIfNeeded()
  await expect(large).toHaveAttribute('role', 'region')
  const dimensions = (element) => ({
    width: element.clientWidth, content: element.scrollWidth, left: element.scrollLeft,
    height: element.clientHeight, contentHeight: element.scrollHeight,
  })
  const inline = await large.evaluate(dimensions)
  assert(inline.content > inline.width)
  await large.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await large.evaluate(dimensions)).left).toBeGreaterThan(0)
  const largeExpand = action(large, 'expand')
  await large.hover()
  await largeExpand.click()
  const scroll = dialog.getByRole('region')
  await expect(scroll.getByRole('row')).toHaveCount(29)
  const full = await scroll.evaluate(dimensions)
  assert(full.contentHeight > full.height && full.content > full.width)
  if (capture) await screenshot('table-wide.png')
  await scroll.evaluate(node => node.scrollTo(node.scrollWidth, node.scrollHeight))
  await expect.poll(async () => (await scroll.evaluate(dimensions)).left).toBeGreaterThan(0)
  await expect(scroll.getByRole('cell', { name: '10558', exact: true })).toBeInViewport()
  await action(dialog, 'close').click()

  const composer = chat.locator('[data-slot="composer-surface"] [contenteditable="true"]').first()
  await composer.fill(prompt)
  await composer.press('Enter')
  const newTable = tableWrap('Шаг')
  await expect(newTable.getByRole('cell', { name: 'Первая строка' })).toBeVisible({ timeout: 35000 })
  fixture.release()
  await expect(newTable.getByRole('cell', { name: 'Вторая строка' })).toBeVisible()
  await expect(chat.getByText('Ответ завершён.', { exact: true })).toBeVisible()
  await newTable.hover()
  await action(newTable, 'expand').click()
  await expect(dialog.getByRole('row')).toHaveCount(3)
  await action(dialog, 'close').click()

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(root).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await small.hover()
  await expand.click()
  await expect(dialog.getByRole('cell', { name: 'Зонт' })).toBeVisible()
  if (capture) await screenshot('table-expanded-light.png')
  await action(dialog, 'close').click()
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(root).not.toHaveAttribute('data-hermes-theme', 'codex-workspace')
  await expect(chat.locator('[data-hcv-table-scroll]')).toHaveCount(0)
  await expect(chat.getByRole('columnheader', { name: 'Предмет' })).toBeAttached()
  console.log(JSON.stringify({ saved: true, richCopy: true, hover: true, keyboardAndFocus: true, wideAndLong: true, live: true, lightAndDark: true, themeScoped: true }))
}
