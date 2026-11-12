import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const prompt = 'Проверь живой счётчик правок.'
const finished = 'Тестовые правки завершены.'

export function makeComposerFixture(folder) {
  const next = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const content = Array.from({ length: 420 }, (_, index) => 'строка ' + (index + 1)).join('\n') + '\n'
  const file = path.join(folder, 'live-lines.txt')
  return {
    next: next.resolve, finish: finish.resolve, file, content,
    async reply(request, send) {
      const user = request.messages.findLastIndex(row => row.role === 'user')
      if (!request.messages[user]?.content?.includes?.(prompt)) return false
      const completed = request.messages.slice(user + 1).filter(row => row.role === 'tool').length
      if (!completed) {
        send('Записываю тестовый файл.', [{ id: 'call_hcv_lines', name: 'write_file', args: { path: file, content } }])
      } else if (completed === 1) {
        await next.promise
        send('Проверяю повторную правку и ещё один файл.', [
          { id: 'call_hcv_replace', name: 'patch', args: { mode: 'replace', path: file, old_string: 'строка 1\n', new_string: 'первая строка\n' } },
          { id: 'call_hcv_new', name: 'write_file', args: { path: path.join(folder, 'live-extra.txt'), content: 'ещё одна\n' } },
          { id: 'call_hcv_failed', name: 'patch', args: { mode: 'replace', path: path.join(folder, 'never-created.txt'), old_string: 'x', new_string: 'y' } },
        ])
      } else {
        await finish.promise
        send(finished, [])
      }
      return true
    },
  }
}

export async function verifyComposerSize({ page, expect, screenshot, projectChat }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const dock = chat.locator('[data-slot="composer-dock"]')
  const draftBar = dock.locator('[data-hcv-draft-bar]')
  const surface = dock.locator('[data-slot="composer-surface"]')
  const editor = surface.locator('[data-slot="composer-rich-input"]')
  const plus = surface.locator('button:has(> .codicon-add)').first()
  const capture = async name => screenshot(name, { clip: await dock.boundingBox() })
  const measure = async () => {
    const [body, input, control] = await Promise.all([surface, editor, plus].map(node => node.boundingBox()))
    return {
      width: body.width, height: body.height, editor: input.height,
      top: input.y - body.y, left: input.x - body.x,
      gap: control.y - (input.y + input.height),
      control: control.height, bottom: body.y + body.height - (control.y + control.height),
    }
  }

  await expect(draftBar).toBeVisible()
  await expect(editor).toBeEditable()
  if (process.env.HERMES_VISUAL_COMPOSER_SIZE_BEFORE === '1') {
    await expect.poll(measure).toMatchObject({ width: 662, height: 100, top: 16 })
    await capture('new-chat.png')
    console.log(JSON.stringify({ composerBefore: await measure() }))
    return
  }

  const compact = { width: 736, height: 98, editor: 40, top: 14, left: 12, gap: 8, control: 28, bottom: 8 }
  await expect.poll(measure).toEqual(compact)
  await expect(editor).toHaveCSS('line-height', '20px')
  await expect(surface).toHaveCSS('border-radius', '22px')
  await capture('new-chat.png')

  const lines = count => Array.from({ length: count }, (_, index) => `Строка черновика ${index + 1}`).join('\n')
  await editor.click()
  await page.keyboard.insertText(lines(5))
  await expect.poll(measure).toMatchObject({ height: 158, editor: 100, gap: 8 })
  await capture('multiline.png')
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(lines(30))
  await expect.poll(() => editor.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
  await expect(surface.locator('button[type="submit"]')).toBeVisible()
  await editor.fill('')
  await expect.poll(measure).toEqual(compact)

  await projectChat('Ревью интерфейса').click()
  await expect(draftBar).toHaveCount(0)
  await expect.poll(measure).toEqual(compact)
  await page.setViewportSize({ width: 760, height: 620 })
  await expect.poll(async () => (await measure()).width).toBeLessThan(compact.width)
  await editor.fill('Черновик в узком окне')
  const send = surface.locator('button[type="submit"]')
  await expect(send).toBeVisible()
  const [body, button] = await Promise.all([surface.boundingBox(), send.boundingBox()])
  assert(body.x >= 0 && body.x + body.width <= 760)
  assert(button.x >= body.x && button.x + button.width <= body.x + body.width)
  await capture('narrow.png')
  console.log(JSON.stringify({ composer: compact, narrowWidth: body.width }))
}

export async function verifyComposerLive({ page, expect, screenshot, fixture, readMode }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const form = chat.locator('form[data-slot="composer-root"]')
  const surface = form.locator('[data-slot="composer-surface"]')
  const editor = surface.locator('[data-slot="composer-rich-input"]')
  const plus = surface.locator('button:has(> .codicon-add)').first()
  const mode = surface.locator('[data-hcv-approval]')
  const model = surface.locator('[data-tour="model-pill"]')
  const approvalMenu = page.locator('[data-hcv-approval-menu]')
  const chip = chat.locator('[data-hcv-composer-changes-chip]')

  await expect(editor).toBeEditable()
  await expect(mode).toBeVisible()
  await expect(page.locator('[data-hcv-approval-source]')).toBeHidden()
  const [inputBox, plusBox, modeBox, modelBox, surfaceBox] = await Promise.all(
    [editor, plus, mode, model, surface].map(locator => locator.boundingBox()),
  )
  assert.equal(surfaceBox.height, 98)
  assert.equal(plusBox.width, 28)
  assert.equal(plusBox.height, 28)
  assert(inputBox.y + inputBox.height < plusBox.y)
  assert.equal(plusBox.y, modeBox.y)
  assert.equal(plusBox.y, modelBox.y)
  await screenshot('composer-two-rows.png')

  const rest = await plus.evaluate(button => getComputedStyle(button).backgroundColor)
  await plus.hover()
  await expect(plus).not.toHaveCSS('background-color', rest)
  await plus.click()
  await expect(plus).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(plus).toHaveAttribute('aria-expanded', 'false')

  await editor.fill('/')
  const suggestions = form.locator('[data-slot="composer-completion-drawer"][role="listbox"]')
  const suggested = suggestions.locator('button').first()
  await expect(suggested).toBeVisible()
  await expect(suggestions).toHaveCSS('padding-top', '4px')
  await expect(suggestions).toHaveCSS('box-shadow', 'none')
  await expect(suggestions).toHaveCSS('backdrop-filter', 'none')
  await expect(suggested).toHaveCSS('border-radius', /^(12|15)px$/)
  await suggested.hover()
  await expect(suggested).toHaveCSS('background-color', /^rgba\(255, 255, 255, 0\.0(?:78|8)\)$/)
  await screenshot('composer-suggestions.png')
  await editor.press('Escape')
  await expect(suggestions).toHaveCount(0)
  await editor.fill('')

  for (const [label, nextLabel, value] of [[/^Ручной/, 'Ручной', 'manual'], [/^Выкл/, 'Выкл', 'off'], [/^Умный/, 'Умный', 'smart']]) {
    await mode.click()
    const row = approvalMenu.getByRole('menuitemradio', { name: label })
    await expect(approvalMenu).toHaveCSS('padding-top', '4px')
    await expect(approvalMenu).toHaveCSS('border-top-width', '0px')
    await expect(row).toHaveCSS('align-items', 'center')
    await expect(row.locator(':scope > span:first-child > span:first-child')).toHaveCSS('font-size', '13px')
    await expect(row.locator(':scope > span:first-child > span:nth-child(2)')).toHaveCSS('line-height', '14px')
    await row.hover()
    await expect(row).toHaveCSS('background-color', /^rgba\(255, 255, 255, 0\.0(?:78|8)\)$/)
    if (value === 'off') await screenshot('composer-approval-hover.png')
    await row.click()
    await expect(mode).toHaveText(nextLabel)
    await expect.poll(readMode).toBe(value)
    await mode.click()
    await expect(row).toHaveAttribute('aria-checked', 'true')
    if (value === 'off') {
      await expect(mode).toHaveCSS('color', 'rgb(255, 133, 73)')
      await screenshot('composer-approval.png')
    }
    await page.keyboard.press('Escape')
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(chip).toHaveCount(0)
  await editor.fill(prompt)
  await editor.press('Enter')
  await expect(chip).toHaveAttribute('aria-label', 'Изменен 1 файл, +420, −0', { timeout: 45000 })
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.content)
  const units = chip.locator('[data-hcv-composer-changes-added] [data-hcv-changes-digit]').last()
  await expect(units.locator('[data-hcv-changes-reel]')).toHaveCSS('transition-duration', '0.3s')
  await units.evaluate(node => { node.dataset.hcvTestUnits = '' })
  await editor.fill('Сообщение ждёт в очереди.')
  await editor.press('Enter')
  const queue = chat.getByRole('group', { name: 'Очередь сообщений' })
  await expect(queue).toBeVisible()
  const [chipBox, queueBox] = await Promise.all([chip.boundingBox(), queue.boundingBox()])
  assert(chipBox.y + chipBox.height < queueBox.y)
  assert.equal(chipBox.height, 34)
  await screenshot('composer-live-changes.png')

  fixture.next()
  await expect(chip).toHaveAttribute('aria-label', 'Изменено 2 файла, +422, −1', { timeout: 45000 })
  await expect(units).toHaveAttribute('data-hcv-test-units', '')
  fixture.finish()
  await expect(chat.getByText(finished, { exact: true })).toBeVisible({ timeout: 45000 })
  await expect(chip).toHaveCount(0)
  console.log(JSON.stringify({ surfaceHeight: surfaceBox.height, controlsHeight: plusBox.height, approvals: 3,
    firstDiff: [1, 420, 0], secondDiff: [2, 422, 1], rollingDigit: true, hiddenOnFinish: true }))
}
