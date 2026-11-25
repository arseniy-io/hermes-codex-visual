import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyActiveSubagents, verifyFinishedSubagents, verifySubagentsScopeChanged } from './subagents-pane.spec-helper.mjs'

const longTitle = 'Лента и редактор'
const finalLine = 'Последний абзац длинного ответа.'
const editText = 'Проверь сокращённую формулировку.'
const delegationPrompt = 'Проверка делегирования трем исполнителям.'
const tilePrompt = 'Делегирование из соседнего чата.'
const tileGoal = 'Проверка соседней вкладки'
const goals = ['Карта источников', 'Проверка выводов', 'Вычитка примеров']
const taskNames = ['source_map', 'results_review', 'example_review']
const agentNames = ['Source map', 'Results review', 'Example review']
const tileTaskName = 'tile_review'
const tileAgentName = 'Tile review'
const subagentReply = 'Проверка пройдена.'

export async function verifyReplyActionsInteraction({ app, page, expect, openThemeSettings, closeSettings, themeCard }) {
  const line = 'Ответ 59. Контрольный текст для проверки длинного разговора.'
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const answer = chat.locator('[data-slot="aui_assistant-message-root"]').filter({ hasText: line })
  const actions = answer.locator('[data-slot="aui_msg-actions"]')
  const copy = actions.locator('.aui-message-actions-desktop button[data-size="icon"]').first()
  const tip = page.locator('[data-hcv-reply-copy-tip]')

  await actions.scrollIntoViewIfNeeded()
  await page.mouse.move(3, 90)
  await expect(tip).toBeHidden()
  await expect(actions).toHaveCSS('opacity', '0')
  await expect(actions.locator('time')).toHaveCSS('pointer-events', 'none')
  const layout = await actions.boundingBox()

  await answer.getByText(line, { exact: true }).hover()
  await expect(actions).toHaveCSS('opacity', '1')
  assert.deepEqual(await actions.boundingBox(), layout)
  await expect(actions.locator('button:visible')).toHaveCount(1)
  await copy.hover()
  await expect(copy).toHaveCSS('width', '26px')
  await expect(copy).toHaveCSS('height', '26px')
  await expect(copy.locator('svg')).toHaveCSS('width', '14px')
  await expect(copy).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(tip).toHaveText('Скопировать ответ')
  await expect(tip).toBeVisible()
  const [buttonBox, tipBox] = await Promise.all([copy.boundingBox(), tip.boundingBox()])
  assert(buttonBox && tipBox, 'Copy and its tooltip must both have layout boxes')
  assert(Math.abs(buttonBox.y - tipBox.y - tipBox.height - 5) <= 1, 'Tooltip gap above Copy')
  await expect(page.locator('[data-slot="tooltip-content"]:visible')).toHaveCount(0)
  await page.mouse.move(3, 90)
  await expect(actions).toHaveCSS('opacity', '0')
  await expect(tip).toBeHidden()

  // Simulate the real keyboard modality used by the floating composer's focus guard.
  await page.keyboard.down('Tab')
  await copy.evaluate(button => button.focus({ preventScroll: true }))
  await page.keyboard.up('Tab')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(copy).toBeFocused()
  assert(await copy.evaluate(button => button.matches(':focus-visible')))
  await expect(actions).toHaveCSS('opacity', '1')
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  await expect(copy).toBeFocused()

  // Replace only the text writer of this isolated Electron process. The
  // operating-system clipboard can change while a test is running.
  await app.evaluate(({ clipboard }) => {
    globalThis.hcvReplyClipboardWriter = clipboard.writeText
    clipboard.writeText = async text => { globalThis.hcvReplyClipboard = text }
  })
  try {
    await copy.press('Enter')
    await expect(copy).toHaveAttribute('aria-label', 'Скопировано')
    assert.equal(await app.evaluate(() => globalThis.hcvReplyClipboard), [
      line,
      '- Пункт проверки\n- Ещё один пункт.',
      '| A | B |\n| --- | --- |\n| 59 | 118 |',
      '[Источник](https://example.invalid/reference-59)',
    ].join('\n\n'))
  } finally {
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = globalThis.hcvReplyClipboardWriter
      delete globalThis.hcvReplyClipboard
      delete globalThis.hcvReplyClipboardWriter
    })
  }

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(actions.locator('button:visible')).toHaveCount(4)
  await expect(actions.locator('time')).toHaveCSS('pointer-events', 'auto')
  await expect(tip).toBeHidden()
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await expect(actions.locator('button:visible')).toHaveCount(1)
  return { datePreserved: true, tooltipGap: buttonBox.y - tipBox.y - tipBox.height,
    layoutStable: true, keyboardCopy: true, nativeThemeRestored: true }
}

export function makeChatFixture() {
  const { promise, resolve } = Promise.withResolvers()
  const children = new Set()
  return {
    release: resolve,
    children,
    async reply(request, send) {
      const lastUserIndex = request.messages.findLastIndex(({ role }) => role === 'user')
      const message = request.messages[lastUserIndex]?.content
      if (typeof message !== 'string') return false
      const inTile = message.includes(tilePrompt)
      if (message.includes(delegationPrompt) || inTile) {
        const returned = request.messages.slice(lastUserIndex + 1).some(({ role }) => role === 'tool')
        const tasks = inTile ? [tileGoal] : goals
        const sent = inTile ? 'Субагент получил задание.' : 'Субагенты получили задания.'
        const sending = inTile ? 'Передаю одно задание.' : 'Распределяю три задания.'
        send(returned ? sent : sending, returned ? [] : [
          { name: 'delegate_task', args: { tasks: tasks.map((goal, index) => ({ goal,
            task_name: inTile ? tileTaskName : taskNames[index] })) } },
        ])
        return true
      }
      const goal = [...goals, tileGoal].find(goal => message.includes(goal))
      if (goal && !message.startsWith('[ASYNC DELEGATION')) {
        children.add(goal)
        await promise
        const completed = request.messages.slice(lastUserIndex + 1).some(({ role }) => role === 'tool')
        // Only the isolated subagents-pane prompt runs a real harmless local
        // command. Its raw persisted result must reach the custom child feed.
        const command = process.env.HERMES_VISUAL_FOCUS === 'subagents-pane' && !completed
        send(command ? 'Проверяю вывод команды.' : subagentReply, command
          ? [{ name: 'terminal', args: { command: 'echo fixture-child-output' } }] : [])
        return true
      }
      return false
    },
  }
}


export async function verifyDraftSetup({ page, expect, screenshot }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const { verifyDraftConsent } = await import('./draft-consent.spec-helper.mjs')
  const draftConsent = await verifyDraftConsent({ page, expect, chat, screenshot })
  const bar = chat.locator('[data-hcv-draft-bar]')
  const input = chat.locator('[data-slot="composer-surface"] [contenteditable="true"]').first()
  await expect(bar).toBeVisible({ timeout: 15000 })
  const project = bar.getByRole('button', { name: 'Выбрать проект', exact: true })
  const device = bar.getByRole('button', { name: 'Работать в', exact: true })
  const gear = bar.getByRole('button', { name: 'Настроить локальную среду', exact: true })
  const menu = page.locator('[data-hcv-draft-menu="projects"]:popover-open')
  const branchMenu = page.locator('[data-hcv-draft-menu="git"]:popover-open')
  const openProjects = async () => {
    await project.click()
    await expect(menu.getByRole('searchbox')).toBeFocused()
  }
  const search = menu.getByRole('searchbox')
  const choose = async (name) => {
    await search.fill(name)
    await search.press('ArrowDown')
    const item = menu.getByRole('button', { name, exact: true })
    await expect(item).toBeFocused()
    await expect(item).toHaveCSS('outline-style', 'none')
    await expect(item).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await page.keyboard.press('Enter')
    await expect(project).toHaveText(name)
  }

  await expect(device).toHaveText('Этот компьютер')
  const stripGeometry = await bar.evaluate(element => {
    const box = element.getBoundingClientRect()
    const surface = element.parentElement.querySelector('[data-slot="composer-surface"]').getBoundingClientRect()
    const gear = element.querySelector(':scope > button:last-of-type')
    const button = gear.getBoundingClientRect()
    const icon = gear.firstElementChild.getBoundingClientRect()
    const device = element.querySelector('[data-hcv-draft-icon="laptop"]').getBoundingClientRect()
    return {
      height: box.height, leftInset: box.left - surface.left, rightInset: surface.right - box.right,
      gear: [button.width, button.height], gearRight: box.right - button.right,
      centerX: icon.left + icon.width / 2 - (button.left + button.width / 2),
      deviceY: device.top - icon.top,
    }
  })
  assert.deepEqual(stripGeometry, {
    height: 40, leftInset: 13, rightInset: 13, gear: [28, 28], gearRight: 8, centerX: 0, deviceY: 0,
  })
  await openProjects()
  await expect(menu.getByRole('button', { name: 'Сайт', exact: true })).toBeVisible()
  await expect(menu).toHaveCSS('width', '260px')
  const menuBox = await menu.boundingBox()
  const composerBox = await input.boundingBox()
  await search.fill('нет такого проекта 75b')
  await expect(menu.getByRole('status')).toHaveText('Проекты не найдены')
  const filteredBox = await menu.boundingBox()
  console.log('Project search geometry', JSON.stringify({ menuBox, filteredBox }))
  if (process.env.HERMES_VISUAL_AUDIT_BASELINE !== '1') {
    assert.deepEqual(filteredBox, menuBox)
    assert.deepEqual(await input.boundingBox(), composerBox)
  }
  await search.clear()
  await expect(menu.getByRole('button', { name: 'Сайт', exact: true })).toBeVisible()
  await screenshot('draft-projects.png')
  await choose('Сайт')
  await input.fill('Черновик при смене проекта.')
  await openProjects()
  await choose('Тестовый проект')
  await expect(input).toHaveText('Черновик при смене проекта.')
  await input.fill('')
  await gear.click()
  await expect(branchMenu.getByRole('button', { name: /Ветка.*main/ })).toBeVisible()
  await expect(branchMenu.getByRole('button', { name: 'Новое рабочее дерево' })).toBeEnabled()
  await expect(branchMenu).toHaveCSS('width', '260px')
  await expect(branchMenu).toHaveCSS('padding', '8px')
  const [settingsBox, gearBox] = await Promise.all([branchMenu.boundingBox(), gear.boundingBox()])
  assert.equal(settingsBox.x + settingsBox.width, gearBox.x + gearBox.width)
  assert.equal(gearBox.y - (settingsBox.y + settingsBox.height), 5)
  await screenshot('draft-settings.png')
  if (process.env.HERMES_VISUAL_DRAFT_DIAGNOSTIC === '1') await page.evaluate(() => {
    window.hcvDraftTrace = []
    const sidebar = document.querySelector('[data-tour="sessions-sidebar"]')
    const capture = () => {
      const view = sidebar?.querySelector('[data-sessions-mode]')
      const buttons = [...(sidebar?.querySelectorAll('button[aria-label*="worktree" i]') ?? [])].map(button => {
        const keys = Object.keys(button)
        const raw = button[keys.find(key => key.startsWith('__reactFiber$'))]
        let fiber = raw
        const props = button[keys.find(key => key.startsWith('__reactProps$'))]
        if (fiber?.memoizedProps !== props) fiber = fiber?.alternate
        const describe = start => {
          const chain = []
          for (let node = start; node && chain.length < 18; node = node.return) chain.push({
            type: typeof node.type === 'function' ? node.type.name : typeof node.type === 'string' ? node.type : node.tag,
            repo: node.memoizedProps?.repoPath, pendingRepo: node.pendingProps?.repoPath,
            propsMatch: node.memoizedProps === props,
          })
          return chain
        }
        let repoPath = ''
        for (let node = fiber; node; node = node.return) if (typeof node.memoizedProps?.repoPath === 'string') {
          repoPath = node.memoizedProps.repoPath
          break
        }
        return { label: button.getAttribute('aria-label'), repoPath, hasProps: Boolean(props), hasFiber: Boolean(raw),
          raw: describe(raw), alternate: describe(raw?.alternate), html: button.outerHTML.slice(0, 180) }
      })
      const next = JSON.stringify({ mode: view?.dataset.sessionsMode, project: view?.dataset.sessionsProject, buttons })
      if (window.hcvDraftTrace.at(-1) !== next && window.hcvDraftTrace.length < 30) window.hcvDraftTrace.push(next)
    }
    window.hcvDraftObserver = new MutationObserver(capture)
    if (sidebar) window.hcvDraftObserver.observe(sidebar, { subtree: true, childList: true, attributes: true })
    capture()
  })
  await branchMenu.getByRole('button', { name: 'Новое рабочее дерево' }).click()
  const worktreeDialog = page.getByRole('dialog', { name: 'Новый worktree', exact: true })
  try {
    await expect(worktreeDialog).toBeVisible()
  } catch (error) {
    if (process.env.HERMES_VISUAL_DRAFT_DIAGNOSTIC === '1') console.log('Draft worktree diagnostic', await page.evaluate(() => window.hcvDraftTrace))
    throw error
  } finally {
    if (process.env.HERMES_VISUAL_DRAFT_DIAGNOSTIC === '1') await page.evaluate(() => window.hcvDraftObserver?.disconnect())
  }
  await page.keyboard.press('Escape')
  await expect(worktreeDialog).toHaveCount(0)
  await gear.click()
  await branchMenu.getByRole('button', { name: /Ветка.*main/ }).click()
  await branchMenu.getByRole('button', { name: 'hcv-fixture-branch', exact: true }).click()
  await gear.click()
  await expect(branchMenu.getByRole('button', { name: /Ветка.*hcv-fixture-branch/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(branchMenu).toHaveCount(0)

  await openProjects()
  await menu.getByRole('button', { name: 'Новый проект', exact: true }).click()
  const projectDialog = page.getByRole('dialog', { name: 'Новый проект', exact: true })
  await expect(projectDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(projectDialog).toHaveCount(0)
  await openProjects()
  await menu.getByRole('button', { name: 'Работать без проекта' }).click()
  await expect(project).toHaveText('Без проекта')

  await device.click()
  const anchored = page.locator('[data-hcv-draft-native-menu="device"]')
  const nativeSwitcher = page.locator('[data-slot="statusbar"] [data-slot="connection-switcher"] [aria-haspopup="menu"]')
  await expect(anchored).toBeVisible()
  await expect(anchored).toHaveCSS('width', '280px')
  await expect(anchored.locator('[role="menuitemradio"][aria-checked="true"]')).toContainText('This device')
  await screenshot('draft-devices.png')
  const measureDeviceMenu = () => anchored.evaluate(element => {
    const anchor = document.querySelector('[data-hcv-draft-bar] [data-hcv-native-open]')
    const box = element.getBoundingClientRect()
    const target = anchor.getBoundingClientRect()
    const wrapper = element.closest('[data-radix-popper-content-wrapper]')
    const style = wrapper && getComputedStyle(wrapper)
    return { dx: box.left - target.left, dy: box.bottom - target.top,
      inset: style?.inset, position: style?.position, transform: style?.transform,
      directChild: wrapper && element.parentElement === wrapper,
      root: { theme: document.documentElement.dataset.hermesTheme, marker: document.documentElement.hasAttribute('data-hermes-codex-visual'), lang: document.documentElement.lang },
      chain: Array.from((function *() { for (let node = element; node && node !== document.body; node = node.parentElement) yield node })())
        .map(node => ({ tag: node.tagName, slot: node.getAttribute('data-slot'), wrapper: node.hasAttribute('data-radix-popper-content-wrapper'),
          style: node.getAttribute('style')?.slice(0, 500) })),
      stylesheet: Boolean(document.querySelector('style[data-hcv-draft-setup-style]')) }
  })
  let geometry = await measureDeviceMenu()
  if (process.env.HERMES_VISUAL_DRAFT_DIAGNOSTIC === '1') {
    const samples = [{ afterMs: 0, ...geometry }]
    for (let index = 1; index <= 10; index++) {
      await page.waitForTimeout(100)
      geometry = await measureDeviceMenu()
      samples.push({ afterMs: index * 100, ...geometry })
    }
    console.log('Draft device geometry over time', JSON.stringify(samples.map(({ afterMs, dx, dy, transform }) =>
      ({ afterMs, dx, dy, transform }))))
  }
  await expect.poll(async () => {
    geometry = await measureDeviceMenu()
    return { dx: geometry.dx, dy: geometry.dy }
  }, { timeout: 3000 }).toEqual({ dx: 0, dy: -4 })
  console.log(JSON.stringify({ nativeGatewayMenu: geometry }))
  expect(geometry.dy).toBe(-4)
  expect(geometry.dx).toBe(0)
  await anchored.getByRole('menuitemradio', { name: /Hermes VPS HTTPS/ }).click()
  await expect(device).toHaveText('Hermes VPS HTTPS (тест)', { timeout: 45000 })
  await expect(nativeSwitcher).toContainText('Hermes VPS HTTPS (тест)')
  await openProjects()
  await expect(menu.getByRole('button', { name: 'Серверный проект', exact: true })).toBeVisible({ timeout: 20000 })
  await expect(menu.getByRole('button', { name: 'Сайт', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await nativeSwitcher.click()
  const local = page.getByRole('menuitemradio', { name: 'This device', exact: true })
  await local.click()
  const confirmSwitch = page.getByRole('button', { name: 'Переключить', exact: true })
  // Recent Hermes can switch an idle draft immediately; other states require
  // a confirmation. Exercise whichever native path the test profile shows.
  await expect.poll(async () => await confirmSwitch.isVisible() ? 'confirm'
    : (await device.textContent())?.trim() === 'Этот компьютер' ? 'switched' : 'waiting', { timeout: 30000 }).not.toBe('waiting')
  if (await confirmSwitch.isVisible()) await confirmSwitch.click()
  await expect(device).toHaveText('Этот компьютер', { timeout: 45000 })
  await expect(nativeSwitcher).toContainText('This device')
  return { draftConsent, normalSetup: true, stripGeometry }
}

export async function verifyChatParity({
  app, page, expect, projectChat, screenshot, fixture, reference, reply, openThemeSettings, closeSettings, themeCard,
}) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const mainInput = chat.locator('[data-slot="composer-surface"] [contenteditable="true"]').first()
  const projectStrip = chat.locator('[data-hcv-draft-bar]')
  const selectChat = title => projectChat(title).click()
  const goBottom = () => viewport.evaluate(node => { node.scrollTop = node.scrollHeight })
  const layout = () => viewport.evaluate((node, lastText) => {
    const last = [...node.querySelectorAll('p')].find(p => p.textContent === lastText)
    const user = node.querySelector('[data-slot="aui_user-message-root"]')
    const dock = node.closest('[data-chat-surface]').querySelector('[data-slot="composer-surface"]')
    const actions = node.querySelector('[data-slot="aui_msg-actions"]')
    const box = node => node?.getBoundingClientRect()
    return {
      gap: Math.round(box(dock).top - box(last).bottom),
      gapAfterActions: Math.round(box(dock).top - box(actions).bottom),
      userPosition: getComputedStyle(user).position,
      promptAboveView: box(user).bottom <= box(node).top,
      endVisible: box(last).top >= box(node).top,
      distanceToBottom: node.scrollHeight - node.clientHeight - node.scrollTop,
    }
  }, finalLine)

  await selectChat(longTitle)
  if (!reference) await expect(projectStrip).toHaveCount(0)
  await expect(viewport.getByText(finalLine, { exact: true })).toBeAttached({ timeout: 25000 })
  await goBottom()
  await expect.poll(async () => (await layout()).distanceToBottom).toBeLessThanOrEqual(2)
  const atBottom = await layout()
  console.log(JSON.stringify({ atBottom, reference }))
  if (reference) {
    assert.equal(atBottom.userPosition, 'sticky')
    assert.equal(atBottom.promptAboveView, false)
    await screenshot('chat-before.png')
    await viewport.evaluate(node => { node.scrollTop = 0 })
    await viewport.locator('button.composer-human-message').first().click()
    const oldEdit = viewport.locator('[data-slot="aui_edit-composer-root"] .ui-prompt-input__container')
    await expect(oldEdit).toBeVisible()
    console.log(JSON.stringify({ oldEditRadius: await oldEdit.evaluate(node => getComputedStyle(node).borderRadius) }))
    await screenshot('edit-before.png')
    return
  }

  assert.equal(atBottom.userPosition, 'relative')
  assert.equal(atBottom.promptAboveView, true)
  assert.equal(atBottom.endVisible, true)
  assert(atBottom.gapAfterActions >= 0 && atBottom.gapAfterActions <= 24, JSON.stringify(atBottom))
  await page.mouse.move(0, 0)
  await screenshot('chat-bottom.png')
  await viewport.evaluate(node => { node.scrollTop = 0 })
  const bubble = viewport.locator('button.composer-human-message').first()
  await expect(bubble).toBeInViewport()
  const bar = viewport.locator('[data-slot="aui_user-bubble-actions"]').first()
  if (process.env.HERMES_VISUAL_MESSAGE_ACTIONS_REFERENCE === '1') {
    await bubble.hover()
    const inline = bar.locator('button:has(> .codicon-discard)')
    await expect(inline.locator('xpath=..')).toHaveCSS('opacity', '1')
    await screenshot('message-before.png', { clip: await bar.boundingBox(), timeout: 20000 })
    return
  }
  const toolbar = bar.locator('[data-hcv-message-actions]')
  const copyMessage = toolbar.getByRole('button', { name: 'Скопировать сообщение', exact: true })
  const editMessage = toolbar.locator('[data-hcv-edit-message]')
  const readMask = (item) => item.evaluate(node => getComputedStyle(node, '::before').maskImage)
  await expect(toolbar).toHaveCSS('opacity', '0')
  await expect(bubble).toHaveCSS('border-radius', '22px')
  await expect(bar.locator('[data-hcv-message-toggle]')).toBeVisible()
  await screenshot('message-idle.png', { timeout: 20000 })
  const beforeHover = await bubble.boundingBox()
  await bubble.hover({ position: { x: 25, y: 20 } })
  await expect(toolbar).toHaveCSS('opacity', '1')
  await expect(toolbar.locator('time')).toHaveText('13:13')
  await expect(bubble).toHaveCSS('border-top-width', '0px')
  assert.deepEqual(await bubble.boundingBox(), beforeHover)
  await expect(bar.locator('button:has(> .codicon-discard)')).toBeHidden()
  const copyMask = await readMask(copyMessage)
  assert.notEqual(copyMask, 'none')
  assert.notEqual(await readMask(editMessage), 'none')
  assert.notEqual(await readMask(editMessage), copyMask)
  await screenshot('message-hover.png', { timeout: 20000 })
  await copyMessage.hover()
  await expect(toolbar).toHaveCSS('opacity', '1')
  await page.mouse.move(12, 210)
  await expect(toolbar).toHaveCSS('opacity', '0')
  // Hermes returns synthetic focus to the composer outside a Tab gesture.
  await page.keyboard.down('Tab')
  await bubble.focus()
  await page.keyboard.up('Tab')
  await expect(bubble).toBeFocused()
  await expect(toolbar).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab')
  await expect(bar.locator('[data-hcv-message-toggle]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(copyMessage).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(editMessage).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(copyMessage).toBeFocused()
  // Isolate clipboard writes in this Electron process from the working OS clipboard.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('hermes:writeClipboard')
    ipcMain.handle('hermes:writeClipboard', (_event, text) => {
      globalThis.hcvFixtureClipboard = text
      return true
    })
  })
  await copyMessage.press('Enter')
  const copied = toolbar.getByRole('button', { name: 'Скопировано', exact: true })
  await expect(copied).toHaveAttribute('data-copied', '')
  assert.notEqual(await readMask(copied), copyMask)
  const source = Array.from({ length: 24 }, (_, index) =>
    'Сообщение, которое уходит вверх. Строка ' + String(index + 1).padStart(2, '0') + '.').join('\n') + ' `markdown`'
  assert.equal(await app.evaluate(() => globalThis.hcvFixtureClipboard), source)
  await expect(copyMessage).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(editMessage).toBeFocused()
  await page.keyboard.press('Enter')
  const edit = viewport.locator('[data-hcv-edit-controls]')
  const input = edit.getByRole('textbox')
  await expect(viewport.locator('[data-slot="aui_edit-composer-root"]')).toBeAttached()
  const auditBaseline = process.env.HERMES_VISUAL_AUDIT_BASELINE === '1'
  const supportsCorners = await page.evaluate(() => CSS.supports('corner-shape', 'superellipse(1.5)'))
  const editRadius = auditBaseline ? '24px' : supportsCorners ? '25px' : '20px'
  await expect(edit).toHaveCSS('border-radius', editRadius)
  if (!auditBaseline) {
    await expect(input).toHaveCSS('font-size', '14px')
    await expect(input).toHaveCSS('line-height', '21px')
  }
  await expect(input).toBeFocused()
  await screenshot('message-edit.png', { timeout: 20000 })
  await input.fill('Черновик для отмены.')
  await edit.getByRole('button', { name: 'Отмена', exact: true }).press('Enter')
  await expect(edit).toHaveCount(0)
  await expect(bubble).toContainText('Сообщение, которое уходит вверх')
  await bubble.hover({ position: { x: 25, y: 20 } })
  await editMessage.click({ button: 'right' })
  await page.locator('[data-hcv-message-menu]:popover-open').getByRole('button', { name: 'Восстановить чекпоинт' }).click()
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'Восстановить до этого чекпоинта?' })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await bubble.hover({ position: { x: 25, y: 20 } })
  await editMessage.click()
  await expect(input).toBeFocused()
  await screenshot('chat-edit.png')
  await page.setViewportSize({ width: 760, height: 550 })
  await expect(edit).toBeVisible()
  assert(await edit.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  await page.setViewportSize({ width: 1440, height: 920 })
  await input.fill(editText)
  await edit.locator('[data-hcv-edit-send]').click()
  await expect(viewport.getByText(reply, { exact: false }).first()).toBeVisible({ timeout: 25000 })
  await expect(bubble).toContainText(editText)

  await page.locator('[data-tour="sidebar-nav-new-session"]').locator('xpath=ancestor::button[1]').click()
  await expect(mainInput).toBeEditable()
  await expect(projectStrip).toBeVisible()
  await verifySubagentsParity({ app, page, expect, projectChat, screenshot, fixture })
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(viewport.locator('[data-hcv-agent-rows]')).toHaveCount(0)
  await expect(viewport.locator('[data-hcv-message-actions]')).toHaveCount(0)
  await expect(viewport.locator('[data-slot="aui_user-message-root"]').first()).toHaveCSS('position', 'sticky')
}

export async function verifySubagentsParity({ app, page, expect, projectChat, screenshot, fixture }) {
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const viewport = chat.locator('[data-slot="aui_thread-viewport"]')
  const mainInput = chat.locator('[data-slot="composer-surface"] [contenteditable="true"]').first()
  const summary = page.locator('[data-hcv-summary-agents]')
  const selectChat = title => projectChat(title).click()
  await selectChat('Проверка каталога')
  await expect(viewport.getByText('Проверь тестовый проект.', { exact: false }).first()).toBeAttached()
  await expect(chat.locator('[data-hcv-draft-bar]')).toHaveCount(0)
  await page.setViewportSize({ width: 1600, height: 920 })
  await mainInput.fill(delegationPrompt)
  await mainInput.press('Enter')
  await expect.poll(() => fixture.children.size, { timeout: 35000 }).toBe(3)
  try {
    await expect(summary.locator('[data-hcv-agent-counts]')).toHaveText('В работе: 3', { timeout: 10000 })
  } catch (error) {
    console.error(JSON.stringify({ subagentSummaryLayout: await page.evaluate(() => {
      const visible = (selector) => [...document.querySelectorAll(selector)]
        .find(node => node.checkVisibility({ visibilityProperty: true }))
      const rect = visible('[data-chat-surface][data-session-anchor="workspace"]')?.getBoundingClientRect()
      return { viewport: [innerWidth, innerHeight], workspace: rect && [rect.x, rect.width, rect.right],
        toolbarOffset: document.documentElement.style.getPropertyValue('--hcv-sidebar-right-offset'),
        toggle: Boolean(visible('[data-hcv-context-toggle]')), card: Boolean(visible('[data-hcv-context-card]')),
        agents: document.querySelectorAll('[data-hcv-summary-agents]').length }
    }) }))
    throw error
  }
  const delegationTurn = viewport.locator('[data-slot="aui_turn-pair"]').filter({ hasText: delegationPrompt }).last()
  const liveRows = delegationTurn.locator('[data-hcv-agent-activity="started"]')
  await expect(liveRows).toHaveCount(1)
  await expect(liveRows.locator('[data-hcv-agent-name]')).toHaveText(agentNames, { timeout: 30000 })
  await expect(liveRows).toHaveText('Source map, Results review и Example review начал(-и) работу')
  await expect(liveRows.locator('img')).toHaveCount(3)
  const liveIds = JSON.parse(await liveRows.getAttribute('data-hcv-agent-ids'))
  assert.equal(new Set(liveIds).size, 3)
  const observed = []
  for (const [index, name] of agentNames.entries()) {
    const link = liveRows.locator('[data-hcv-agent-name]').nth(index)
    const id = await link.getAttribute('data-hcv-agent-link')
    assert.equal(id, liveIds[index], 'Every name and avatar must keep its own child identity')
    observed.push({ id, name, src: await liveRows.locator('img').nth(index).getAttribute('src') })
  }
  await expect(delegationTurn.locator('button[data-hcv-agent-rows][aria-controls]')).toHaveCount(0)
  await expect(delegationTurn.locator('[data-delegate-card]:visible')).toHaveCount(0)
  const icons = async (target) => {
    const assets = await target.locator('img').evaluateAll(nodes => nodes.map(node => [node.getAttribute('src'), node.naturalWidth]))
    return assets.map(([src, width]) => [src.startsWith('data:image/svg+xml,'), width,
      createHash('sha256').update(src).digest('hex').slice(0, 16)])
  }
  await expect.poll(async () => (await icons(liveRows)).every(([svg, width]) => svg && width === 16)).toBe(true)
  const running = await icons(liveRows)
  const sortedIcons = values => values.toSorted((a, b) => a[2].localeCompare(b[2]))
  assert.deepEqual(sortedIcons(await icons(summary.locator('[data-hcv-open-subagents]'))), sortedIcons(running))
  await screenshot('subagents-running.png')
  const selection = await verifyActiveSubagents({ page, expect, screenshot, summary })
  for (const { id, name, src } of observed) {
    const entry = selection.pane.locator(`[data-hcv-subagent-row="${id}"]`)
    await expect(entry.locator('[data-hcv-subagent-name]')).toHaveText(name)
    await expect(entry.locator('[data-hcv-subagent-avatar]')).toHaveAttribute('src', src)
  }

  fixture.release()
  for (const { id, name, src } of observed) {
    const completion = viewport.locator('[data-hcv-agent-activity="completed"]')
      .filter({ has: page.locator(`[data-hcv-agent-name][data-hcv-agent-link="${id}"]`) })
    await expect(completion).toHaveCount(1, { timeout: 40000 })
    await expect(completion.locator(`[data-hcv-agent-name][data-hcv-agent-link="${id}"]`)).toHaveText(name)
    const names = await completion.locator('[data-hcv-agent-name]').allTextContents()
    await expect(completion).toHaveText(new Intl.ListFormat('ru', { type: 'conjunction' }).format(names) + ' завершил(-и) работу')
    const ids = JSON.parse(await completion.getAttribute('data-hcv-agent-ids'))
    await expect(completion.locator('img').nth(ids.indexOf(id))).toHaveAttribute('src', src)
    await expect(liveRows.locator(`[data-hcv-agent-name][data-hcv-agent-link="${id}"]`)).toHaveText(name)
  }
  const doneGroup = selection.pane.locator('[data-hcv-subagent-group="done"]')
  await expect(doneGroup.locator('h2')).toHaveText('Готово · 3', { timeout: 40000 })
  await expect(doneGroup.locator('[data-hcv-subagent-row][data-status="completed"]')).toHaveCount(3)
  for (const { id, name, src } of observed) {
    const entry = doneGroup.locator(`[data-hcv-subagent-row="${id}"]`)
    await expect(entry.locator('[data-hcv-subagent-name]')).toHaveText(name)
    await expect(entry.locator('[data-hcv-subagent-avatar]')).toHaveAttribute('src', src)
  }
  await expect(delegationTurn.locator('[data-delegate-card]:visible')).toHaveCount(0)
  await verifyFinishedSubagents({ app, page, expect, screenshot, selection, response: subagentReply })

  await selectChat('Ревью интерфейса')
  await expect(viewport.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)
  await verifySubagentsScopeChanged({ page, expect, prior: selection.goal })
  if (process.env.HERMES_VISUAL_FOCUS === 'subagents-pane') return
  // Split an already stored chat. A fresh draft tile in this Hermes build
  // can send Enter to the main runtime while its own session is unbound.
  const storedChat = projectChat('Проверка каталога')
  await storedChat.scrollIntoViewIfNeeded()
  const from = await storedChat.boundingBox()
  const to = await chat.boundingBox()
  assert(from && to, 'Expected a visible project chat and a workspace to split')
  // The composer is a link target in current Hermes. Drop on the side of the
  // chat body, away from that composer, to request a separate pane.
  const drop = { x: to.x + to.width * .93, y: to.y + to.height * .45 }
  assert(await chat.evaluate((node, point) => {
    const hit = document.elementFromPoint(point.x, point.y)
    return Boolean(hit && node.contains(hit) && !hit.closest('[data-slot="composer-root"]'))
  }, drop), 'Expected a split target in the chat body outside the composer')
  if (process.env.HERMES_VISUAL_DRAG_DIAGNOSTIC) {
    const points = { start: [from.x + Math.min(90, from.width / 2), from.y + from.height / 2],
      end: [drop.x, drop.y] }
    console.log('Split drag geometry', JSON.stringify(await page.evaluate(points => ({
      viewport: [innerWidth, innerHeight], points,
      hits: Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => {
        const node = document.elementFromPoint(x, y)
        return [name, node && { tag: node.tagName, html: node.outerHTML.slice(0, 500),
          ancestors: [...function* () { for (let el = node; el; el = el.parentElement) yield el }()].slice(0, 5)
            .map(el => ({ tag: el.tagName, slot: el.getAttribute('data-slot'), role: el.getAttribute('role') })) }]
      })),
    }), points)))
  }
  await page.mouse.move(from.x + Math.min(90, from.width / 2), from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 15 })
  await page.mouse.up()
  const tile = page.locator('[data-chat-surface][data-session-anchor^="session-tile:"]:visible')
  await expect(tile.getByText(delegationPrompt, { exact: true })).toBeAttached({ timeout: 15000 })
  const tileInput = tile.locator('[data-slot="composer-surface"] [contenteditable="true"]').first()
  await expect(tileInput).toBeEditable()
  await tileInput.click()
  await tileInput.fill(tilePrompt)
  const tileSend = tile.locator('[data-slot="composer-surface"] button[type="submit"]:visible')
  try {
    await expect(tileSend).toHaveAttribute('aria-label', /^(Отправить|Send)$/i, { timeout: 10000 })
    await tileSend.click()
  } catch (error) {
    console.error(JSON.stringify({ tileComposer: await tile.evaluate(node => ({
      anchor: node.getAttribute('data-session-anchor'), focused: node.contains(document.activeElement),
      draftLength: node.querySelector('[contenteditable="true"]')?.textContent?.length,
      submit: [...node.querySelectorAll('button[type="submit"]')].map(button => ({
        label: button.getAttribute('aria-label'), title: button.getAttribute('title'), disabled: button.disabled,
        visible: button.checkVisibility({ visibilityProperty: true }),
      })),
    })) }))
    throw error
  }
  await expect(tile.getByText(tilePrompt, { exact: true })).toBeAttached()
  await expect(viewport.getByText(tilePrompt, { exact: true })).toHaveCount(0)
  await expect.poll(() => fixture.children.has(tileGoal), { timeout: 35000 }).toBe(true)
  const tileReceipt = tile.locator('[data-hcv-agent-activity="completed"]')
    .filter({ hasText: tileAgentName + ' завершил(-и) работу' })
  await expect(tileReceipt).toBeAttached({ timeout: 40000 })
  await expect(tileReceipt).toHaveText(tileAgentName + ' завершил(-и) работу')
  await expect(tileReceipt.locator('[data-hcv-agent-name]')).toHaveAttribute('aria-label', 'Открыть субагента ' + tileAgentName)
  await expect(viewport.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await verifySubagentsScopeChanged({ page, expect, prior: tileGoal })
  await screenshot('subagents-pane-tile-isolation.png')
  console.log(JSON.stringify({ subagentChatIsolation: true, subagentTileIsolation: true }))
}
