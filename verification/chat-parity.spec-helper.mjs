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
const subagentReply = 'Проверка пройдена.'

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
          { name: 'delegate_task', args: { tasks: tasks.map(goal => ({ goal })) } },
        ])
        return true
      }
      const goal = [...goals, tileGoal].find(goal => message.includes(goal))
      if (goal && !message.startsWith('[ASYNC DELEGATION')) {
        children.add(goal)
        await promise
        send(subagentReply)
        return true
      }
      return false
    },
  }
}


export async function verifyDraftSetup({ page, expect, screenshot }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
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
    const surface = element.nextElementSibling.querySelector('[data-slot="composer-surface"]').getBoundingClientRect()
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
  await branchMenu.getByRole('button', { name: 'Новое рабочее дерево' }).click()
  const worktreeDialog = page.getByRole('dialog', { name: 'Новый worktree', exact: true })
  await expect(worktreeDialog).toBeVisible()
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
  const geometry = await anchored.evaluate(element => {
    const anchor = document.querySelector('[data-hcv-draft-bar] [data-hcv-native-open]')
    const box = element.getBoundingClientRect()
    const target = anchor.getBoundingClientRect()
    const wrapper = element.closest('[data-radix-popper-content-wrapper]')
    const style = wrapper && getComputedStyle(wrapper)
    return { dx: box.left - target.left, dy: box.bottom - target.top,
      inset: style?.inset, position: style?.position, transform: style?.transform }
  })
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
  await page.getByRole('button', { name: 'Переключить', exact: true }).click()
  await expect(device).toHaveText('Этот компьютер', { timeout: 45000 })
  await expect(nativeSwitcher).toContainText('This device')
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
  const liveRow = viewport.locator('[data-hcv-agent-activity="started"]')
  await expect(liveRow).toHaveCount(1)
  await expect(liveRow).toContainText('начал(-и) работу')
  await expect(liveRow.locator('img')).toHaveCount(3)
  const icons = async (target) => {
    const assets = await target.locator('img').evaluateAll(nodes => nodes.map(node => [node.getAttribute('src'), node.naturalWidth]))
    return assets.map(([src, width]) => [src.startsWith('data:image/svg+xml,'), width,
      createHash('sha256').update(src).digest('hex').slice(0, 16)])
  }
  await expect.poll(async () => (await icons(liveRow)).every(([svg, width]) => svg && width === 16)).toBe(true)
  const running = await icons(liveRow)
  assert.deepEqual(await icons(summary.locator('[data-hcv-open-subagents]')), running)
  await screenshot('subagents-running.png')
  const selection = await verifyActiveSubagents({ page, expect, screenshot, summary })

  fixture.release()
  const finished = viewport.locator('[data-hcv-agent-activity="completed"]')
  await expect(finished).toHaveCount(1, { timeout: 40000 })
  await expect(finished).toContainText('завершил(-и) работу')
  await expect(liveRow).toHaveCount(0)
  assert.deepEqual(await icons(finished), running)
  const details = finished.locator('xpath=ancestor::button')
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(viewport.locator('[data-delegate-card]')).toBeVisible()
  const delegateRows = viewport.locator('[data-delegate-card] > div')
  await expect(delegateRows).toHaveCount(3)
  await expect(delegateRows.first()).toHaveCSS('border-top-width', '0px')
  await expect(delegateRows.first().locator('[data-hcv-delegate-avatar]')).toHaveCSS('width', '16px')
  await expect(delegateRows.first().locator('.codicon-agent')).toBeHidden()
  if (process.env.HERMES_VISUAL_FOCUS === 'subagents-pane' && process.env.HERMES_VISUAL_ACTIVITY_RELEASE) {
    await screenshot('subagents-expanded.png')
  }
  await details.click()
  await verifyFinishedSubagents({ app, page, expect, screenshot, selection, response: subagentReply })

  await selectChat('Ревью интерфейса')
  await expect(viewport.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)
  await verifySubagentsScopeChanged({ page, expect, prior: selection.title })
  // Split an already stored chat. A fresh draft tile in this Hermes build
  // can send Enter to the main runtime while its own session is unbound.
  const storedChat = projectChat('Проверка каталога')
  await storedChat.scrollIntoViewIfNeeded()
  const from = await storedChat.boundingBox()
  const to = await chat.boundingBox()
  assert(from && to, 'Expected a visible project chat and a workspace to split')
  await page.mouse.move(from.x + Math.min(90, from.width / 2), from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * .84, { steps: 15 })
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
  await expect(tile.getByRole('button', { name: 'Subagent Task Completed: ' + tileGoal, exact: true }))
    .toBeAttached({ timeout: 40000 })
  await expect(viewport.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  await verifySubagentsScopeChanged({ page, expect, prior: tileGoal })
  await screenshot('subagents-pane-tile-isolation.png')
  console.log(JSON.stringify({ subagentChatIsolation: true, subagentTileIsolation: true }))
}
