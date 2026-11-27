import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const prompt = 'Проверь живой счётчик правок.'
const finished = 'Тестовые правки завершены.'

export function makeComposerFixture(folder) {
  const file = path.join(folder, 'a-kimi.txt')
  const created = path.join(folder, 'b-kimi.txt')
  const base = 'Исходная строка Kimi\n'
  const keep = 'Уже было изменено до ответа\n'
  const first = 'Первая правка Kimi\nЕщё строка Kimi\n'
  const second = 'Последняя правка Kimi\n'
  const added = 'Новый файл Kimi\nВторая строка нового файла\n'
  const replace = (id, old_string, new_string) => ({
    id, name: 'patch', args: { mode: 'replace', path: file, old_string, new_string },
  })
  const steps = [
    { id: 'call_hcv_status', name: 'terminal', args: { command: 'git status --short', workdir: folder } },
    replace('call_hcv_first', base, first),
    replace('call_hcv_second', first, second),
    { id: 'call_hcv_create', name: 'write_file', args: { path: created, content: added } },
    { id: 'call_hcv_restore', name: 'patch', args: {
      mode: 'patch', patch: ['*** Begin Patch', '*** Update File: ' + file, '@@',
        '-' + second.trimEnd(), '+' + base.trimEnd(), '*** Delete File: ' + created, '*** End Patch'].join('\n'),
    } },
    replace('call_hcv_final', base, second),
  ]
  const gates = steps.map(() => Promise.withResolvers())
  const results = []
  return {
    file, created, base, keep, first, second, added, results,
    begin() { fs.writeFileSync(file, base + keep) },
    advance(step) { gates[step].resolve() },
    release() { for (const gate of gates) gate.resolve() },
    async reply(request, send) {
      const user = request.messages.findLastIndex(row => row.role === 'user')
      if (!request.messages[user]?.content?.includes?.(prompt)) return false
      const tools = request.messages.slice(user + 1).filter(row => row.role === 'tool')
      if (tools.length) {
        results[tools.length - 1] = tools.at(-1).content
        await gates[tools.length - 1].promise
      }
      const step = steps[tools.length]
      send(step ? '' : finished, step ? [step] : [])
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
  // A fresh profile may have the native consent card attached above the
  // composer. Dismiss it in this isolated profile before measuring the
  // standalone rounded surface; draft-consent tests the attached state.
  const consent = dock.locator('[data-slot="status-row"]:has(> .status-row-icon > .codicon-graph)')
  if (await consent.isVisible()) {
    await consent.getByRole('button', { name: 'Нет, спасибо', exact: true }).click()
    await expect(consent).toHaveCount(0)
  }
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

export async function verifyComposerLive({ page, expect, screenshot, fixture, readMode, projectChat }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const form = chat.locator('form[data-slot="composer-root"]')
  const surface = form.locator('[data-slot="composer-surface"]')
  const editor = surface.locator('[data-slot="composer-rich-input"]')
  const plus = surface.locator('button:has(> .codicon-add)').first()
  const mode = surface.locator('[data-hcv-approval]')
  const model = surface.locator('[data-tour="model-pill"]')
  const approvalMenu = page.locator('[data-hcv-approval-menu]')
  const chip = chat.locator('[data-hcv-composer-changes-chip]')
  const rail = chat.locator('[data-hcv-composer-changes]')

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
  const grip = chat.locator('[data-slot="status-drawer-toggle"]')
  // A fresh isolated profile can initially show the native consent drawer.
  const consent = chat.locator('[data-slot="status-row"]:has(> .status-row-icon > .codicon-graph)')
  if (await consent.isVisible()) {
    await consent.getByRole('button', { name: 'Нет, спасибо', exact: true }).click()
    await expect(consent).toHaveCount(0)
  }
  await projectChat('Ревью интерфейса').click()
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  const kebab = chat.locator('.coding-status-bar button:has(> .codicon-kebab-vertical)')
  // The native branch actions exist only in profiles with worktree actions.
  if (await kebab.count()) {
    await expect(kebab).toBeHidden()
    // The hidden icon must not remove the native branch actions.
    const branch = chat.locator('.coding-status-bar')
    const branchButton = branch.locator('button:has(> .codicon-git-branch)')
    const branchMenu = page.getByRole('menu').filter({ has: page.getByRole('menuitem') })
    await branch.click({ button: 'right' })
    await expect(branchMenu).toBeVisible()
    const mouseItems = await branchMenu.getByRole('menuitem').allTextContents()
    assert(mouseItems.length > 0, 'Right-click should expose native branch actions')
    await page.keyboard.press('Escape')
    await expect(branchMenu).toBeHidden()
    await page.keyboard.press('Tab')
    await branchButton.focus()
    console.log('Branch keyboard focus', JSON.stringify(await page.evaluate(() => ({
      tag: document.activeElement?.tagName, className: document.activeElement?.className,
      inBranch: Boolean(document.activeElement?.closest('.coding-status-bar')),
    }))))
    await expect(branchButton).toBeFocused()
    assert(await branchButton.evaluate(node => node.matches(':focus-visible')))
    await expect(branchButton).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Shift+F10')
    await expect(branchMenu).toBeVisible()
    assert.deepEqual(await branchMenu.getByRole('menuitem').allTextContents(), mouseItems)
    await page.keyboard.press('Escape')
    await expect(branchMenu).toBeHidden()
  }
  await expect(rail).toHaveCount(0)
  fixture.begin()
  await editor.fill(prompt)
  await editor.press('Enter')
  await expect.poll(() => fixture.results[0], { timeout: 45000 }).toMatch(/a-kimi\.txt/)
  await expect(rail).toHaveCount(0)
  await screenshot('composer-live-unchanged.png')

  const expectLabel = async label => expect(chip).toHaveAccessibleName(label, { timeout: 45000 })
  fixture.advance(0)
  await expectLabel('Изменен 1 файл, +2, −1')
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.first + fixture.keep)
  fixture.advance(1)
  await expectLabel('Изменен 1 файл, +1, −1')
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.second + fixture.keep)
  fixture.advance(2)
  await expectLabel('Изменено 2 файла, +3, −1')
  assert.equal(fs.readFileSync(fixture.created, 'utf8'), fixture.added)

  const popover = chat.locator('[data-hcv-composer-changes-popover]')
  await expect(popover).toBeHidden()
  const lineCenters = await chip.evaluate(node => {
    const center = selector => {
      const box = node.querySelector(selector).getBoundingClientRect()
      return box.y + box.height / 2
    }
    return [center('[data-hcv-composer-changes-label]'), center('[data-hcv-composer-changes-totals]')]
  })
  assert(Math.abs(lineCenters[0] - lineCenters[1]) < 1)
  await page.mouse.move(1100, 460)
  await screenshot('composer-live-changes.png')
  await chip.hover()
  await expect(popover).toBeVisible()
  const files = popover.getByRole('button')
  await expect(files).toHaveCount(2)
  await expect(files.nth(0)).toHaveAccessibleName(/a-kimi\.txt\s*\+1\s*−1/)
  await expect(files.nth(1)).toHaveAccessibleName(/b-kimi\.txt\s*\+2\s*−0/)
  await screenshot('composer-live-files.png')
  await files.nth(1).click()
  const review = page.locator('[data-hcv-saved-turn-diff]:visible')
  await expect(review).toContainText('Новый файл Kimi')
  await expect(review).not.toContainText('Последняя правка Kimi')
  await chip.click()
  await expect(review).toContainText('Последняя правка Kimi')
  await expect(review).not.toContainText('Первая правка Kimi')

  fixture.advance(3)
  await expect.poll(() => Boolean(fixture.results[4]), { timeout: 45000 }).toBe(true)
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.base + fixture.keep)
  assert.equal(fs.existsSync(fixture.created), false)
  await expect(rail).toHaveCount(0)
  await screenshot('composer-live-restored.png')
  fixture.advance(4)
  await expectLabel('Изменен 1 файл, +1, −1')
  fixture.advance(5)
  await expect(chat.getByText(finished, { exact: true })).toBeVisible({ timeout: 45000 })
  await expect(rail).toHaveCount(0)
  console.log(JSON.stringify({ surfaceHeight: surfaceBox.height, controlsHeight: plusBox.height,
    nativeEdits: true, repeatedFileCount: 1, files: 2, added: 3, removed: 1, oneLine: true,
    opensWholeTurnAndFile: true, readOnlyHidden: true, zeroHidden: true, completionHidden: true }))
}
