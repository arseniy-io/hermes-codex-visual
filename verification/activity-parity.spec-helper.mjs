import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { captureDisclosureMotion } from './disclosure-motion.spec-helper.mjs'

const mark = '[data-hcv-activity-label]'
const icon = '[data-hcv-activity-icon]'
const motion = 'data-hcv-activity-motion'

export async function installActivityReadinessFixture(page, intercept) {
  const replies = {
    'setup.status': { provider_configured: true, ready: true, free_tier_route: false },
    'setup.runtime_check': { ok: true, provider: 'custom', model: 'mock-model', free_tier_route: false },
  }
  await page.routeWebSocket(url => url.protocol === 'ws:' && url.hostname === '127.0.0.1' &&
    url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (frame.id != null && Object.hasOwn(replies, frame.method)) {
        route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: replies[frame.method] }))
      } else if (!intercept?.(frame, route)) upstream.send(message)
    })
  })
}

const filePrompt = 'Проверь раскрытие правки одного файла.'
const fileComment = 'Сейчас отредактирую тестовый файл.'
const fileAnswer = 'Одиночная правка завершена.'
const fileTool = { name: 'patch', tool_id: 'activity-solo-patch' }
const fileName = 'fixture-solo.md'
const changedLine = 'Новая строка одиночной правки.'

export function createStandaloneFileFixture() {
  let emit
  return {
    intercept(frame, route) {
      if (frame.method !== 'prompt.submit' || frame.params?.text !== filePrompt) return false
      const sessionId = frame.params.session_id
      emit = (type, payload = {}) => route.send(JSON.stringify({
        jsonrpc: '2.0', method: 'event', params: { type, payload, session_id: sessionId },
      }))
      route.send(JSON.stringify({
        jsonrpc: '2.0', id: frame.id,
        result: { admission_id: 'hcv-solo-file', ref: { session_id: sessionId }, sequence: 1,
          status: 'started', outcome: null, authority_epoch: 1, execution_generation: 1 },
      }))
      setTimeout(() => {
        emit('message.start')
        emit('message.delta', { text: fileComment })
        emit('message.interim', { text: fileComment, already_streamed: true })
        emit('tool.start', { ...fileTool, args: { mode: 'replace', path: fileName } })
      }, 150)
      return true
    },
    completeEdit() {
      emit('tool.complete', { ...fileTool, result: { success: true, diff:
        ['--- a/' + fileName, '+++ b/' + fileName, '@@ -1 +1 @@', '-Старая строка.', '+' + changedLine].join('\n'),
      } })
    },
    finish() {
      emit('message.delta', { text: fileAnswer })
      emit('message.complete', { text: fileAnswer })
    },
  }
}

export async function verifyStandaloneFileDisclosure({ page, expect, screenshot, fixture }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await editor.fill(filePrompt)
  await editor.press('Enter')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: filePrompt })
  await expect(turn.getByText(fileComment, { exact: true })).toBeVisible()
  const row = turn.locator('[data-tool-row]')
  await expect(row).toBeVisible()
  await expect(turn.locator('[data-hcv-activity-group]')).toHaveCount(0)
  const toggle = row.locator(':scope > :first-child button').first()
  await turn.evaluate(root => {
    const panelHeights = []
    const observer = new MutationObserver(() => {
      const panel = root.querySelector('[data-file-edit][data-tool-row] > :nth-child(2)')
      if (panel) panelHeights.push(panel.getBoundingClientRect().height)
    })
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-file-edit'] })
    root.readFileDiffHeights = () => {
      observer.disconnect()
      delete root.readFileDiffHeights
      return panelHeights
    }
  })
  fixture.completeEdit()
  await expect(row.locator('[data-hcv-file-activity-label]')).toHaveText('Редактирование ' + fileName + ' +1 −1')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(row.locator(':scope > :nth-child(2)')).toHaveCount(0)
  const firstHeights = await turn.evaluate(root => root.readFileDiffHeights())
  assert(firstHeights.every(height => height === 0), JSON.stringify(firstHeights))
  await screenshot('standalone-file-folded.png', { locator: turn })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(row.getByText(changedLine, { exact: true })).toBeVisible()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(row.getByText(changedLine, { exact: true })).toHaveCount(0)
  fixture.finish()
  await expect(turn.getByText(fileAnswer, { exact: true })).toBeVisible()
  return { initialDiffHeights: firstHeights, defaultFolded: true, openedByClick: true, closedByKeyboard: true }
}

function maskHash(value) {
  const body = /data:image\/svg\+xml,([^")]+)/.exec(value)?.[1]
  return body ? createHash('sha256').update(decodeURIComponent(body)).digest('hex') : null
}

async function sampleMotion(expect, page, scope, panel, phase, trigger, duration = 300) {
  const result = await captureDisclosureMotion({ expect, page, scope, panel, phase, trigger })
  assert.equal(result.duration, duration)
  assert.equal(result.easing, duration === 300 ? 'cubic-bezier(0.19, 1, 0.22, 1)' : 'cubic-bezier(0.23, 1, 0.32, 1)')
  const [start, between, end] = phase === 'opening' ? result.frames : [...result.frames].reverse()
  assert(between.height > start.height && end.height > between.height, JSON.stringify(result))
  assert(between.opacity > start.opacity && end.opacity > between.opacity, JSON.stringify(result))
  return result
}

async function verifyTimeline({ app, page, expect, chat, screenshot, translationRequests }) {
  const history = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Лента проверки файлов готова.' })
  const steps = history.locator('button[data-hcv-turn-line]')
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const readGroup = history.locator('[data-hcv-activity-group="activityRead"] > button').first()
  await expect(readGroup).toHaveAccessibleName('Прочитал файлы')
  await expect(readGroup).toHaveAttribute('aria-expanded', 'false')
  const readMember = history.locator('[data-hcv-activity-member][data-tool-group]').first()
  const readOpening = await sampleMotion(expect, page, history, readMember, 'opening', () => readGroup.click())
  const thought = history.locator('[data-slot="aui_thinking-disclosure"] > div:first-child > button').first()
  const caret = thought.locator(':scope > span:nth-child(2)')
  const body = history.locator('[data-slot="aui_thinking-body"]')
  await thought.scrollIntoViewIfNeeded()
  await page.mouse.move(280, 120)
  await expect(thought).toHaveAttribute('aria-expanded', 'false')
  await expect(caret).toHaveCSS('opacity', '0')
  await expect(thought.locator(mark)).toHaveCSS('font-size', '14px')
  await expect(thought.locator(mark)).toHaveCSS('line-height', '21px')
  await expect(thought.locator(mark)).toHaveCSS('font-weight', '430')
  await expect(caret.locator('.codicon-chevron-right')).toHaveCSS('width', '14px')
  await thought.hover()
  await expect(caret).toHaveCSS('opacity', '1')
  const thoughtOpening = await sampleMotion(expect, page, history, body, 'opening', () => thought.click())
  await expect(thought).toHaveAttribute('aria-expanded', 'true')
  await expect(caret).toHaveCSS('opacity', '1')
  await expect(body.locator('p').first()).toHaveText('Сохраняю исходный абзац.')
  await expect(body.locator('p').nth(1)).toHaveText('Второй абзац с inline code.')
  await expect(body.locator('code')).toHaveText('inline code')
  await expect(body).toHaveCSS('max-block-size', '140px')
  await expect(body).toHaveCSS('padding-inline-start', '0px')
  await expect(body.locator('p').first()).toHaveCSS('font-size', '14px')
  await expect(body.locator('p').first()).toHaveCSS('line-height', '22.75px')
  await expect(body.locator('h2')).toHaveCSS('font-weight', '600')
  const gaps = await body.evaluate(node => {
    const [first, second, third] = node.querySelectorAll('p')
    const heading = node.querySelector('h2')
    const gap = (a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().bottom
    return [gap(first, second), gap(second, heading), gap(heading, third)]
  })
  if (gaps.join() !== '4,8,4') {
    const layout = await body.evaluate(node => {
      const sample = node.querySelector('h2')
      return [sample, sample.parentElement, sample.parentElement.parentElement, sample.closest('[data-slot="aui_reasoning-text"]')]
        .map(element => ({ tag: element.tagName, class: element.className, parent: element.parentElement.tagName,
          siblings: [...element.parentElement.children].slice(0, 4).map(child => child.tagName) }))
    })
    assert.fail('Unexpected gaps ' + JSON.stringify({ gaps, layout }))
  }
  const scrolling = await body.evaluate(node => {
    node.scrollTop = node.scrollHeight
    const result = { client: node.clientHeight, content: node.scrollHeight, top: node.scrollTop }
    node.scrollTop = 0
    return result
  })
  assert(scrolling.top > 0 && scrolling.content > scrolling.client)
  await history.evaluate(turn => turn.scrollIntoView({ block: 'center' }))
  await expect(body.getByText('Заметки к проверке', { exact: true })).toBeVisible()
  await expect(body.locator('ul')).toHaveCSS('padding-inline-start', '16px')
  await expect(body.locator('ol')).toHaveCSS('padding-inline-start', '32px')
  await expect(history.getByRole('button', { name: /Перевести на русский|Показать оригинал/ })).toHaveCount(0)
  await screenshot('reasoning-russian.png')
  const thoughtClosing = await sampleMotion(expect, page, history, body, 'closing', () => thought.click())
  await expect(body).toHaveCount(0)

  const details = readMember.locator(':scope > [data-tool-summary] + div')
  await expect(history.getByText('Прочитал fixture-note.md', { exact: true })).toBeVisible()
  await expect(readMember).toHaveCSS('padding-inline-start', '24px')
  await expect(details).toHaveCSS('padding-inline-start', '0px')
  await expect(details).toHaveCSS('gap', '12px')
  const readFile = history.getByRole('button', { name: 'Прочитал fixture-note.md', exact: true })
  await readFile.click()
  const file = readFile.locator('xpath=ancestor::*[@data-tool-row][1]').locator('pre')
  await expect(file).toHaveText(/Первый файл/)
  await expect(file).toHaveCSS('font-size', '12px')
  await screenshot('read-details.png')
  await readFile.click()
  await expect(file).toHaveCount(0)
  const readClosing = await sampleMotion(expect, page, history, readMember, 'closing', () => readGroup.click())
  await expect(readGroup).toHaveAttribute('aria-expanded', 'false')

  const sources = history.getByRole('button', {
    name: /Прочитал файлы.*поиск по истории.*поиск в интернете.*прочитал страницы/i,
  })
  await expect(sources).toBeVisible()
  const mixed = history.locator('[data-hcv-activity-group="activityEdit"]').getByRole('button')
  await expect(mixed).toHaveAccessibleName('Отредактировал файл выполнил команды')
  await expect(mixed).toHaveAttribute('aria-expanded', 'false')
  const edit = history.locator('[data-hcv-activity-member][data-tool-row]').first()
  await expect(edit).toBeHidden()
  await mixed.click()
  await expect(mixed).toHaveAttribute('aria-expanded', 'true')
  await expect(edit).toBeVisible()
  await expect(edit).toHaveCSS('padding-inline-start', '24px')
  const command = history.getByRole('button', { name: 'echo verify-file', exact: true }).and(history.locator('button'))
  await expect(command).toBeVisible()
  await expect(history.getByRole('button', { name: 'echo verify-again', exact: true })).toBeVisible()
  const commandRows = history.locator('[data-hcv-activity-member][data-tool-group] > [data-tool-summary] + div')
  await expect(commandRows).toHaveCSS('padding-inline-start', '0px')
  assert.equal(await commandRows.locator('..').evaluate(node => getComputedStyle(node, '::before').insetBlockStart), '0px')
  const fileX = (await edit.locator('button').first().boundingBox()).x
  const commandX = (await command.boundingBox()).x
  assert.equal(fileX, commandX)
  await expect(edit).not.toHaveAttribute(motion)
  await expect(edit).toHaveCSS('padding-block-start', '12px')
  const fileGap = await history.evaluate(node => {
    const rows = [...node.querySelectorAll('[data-hcv-activity-member][data-tool-row]')].slice(0, 2)
    const [first, second] = rows.map(row => row.querySelector('button').getBoundingClientRect())
    return second.top - first.bottom
  })
  assert.equal(fileGap, 12)
  await history.evaluate(turn => turn.scrollIntoView({ block: 'center' }))
  await page.mouse.move(280, 120)
  await screenshot('timeline.png')
  const fileRow = edit.locator('[data-hcv-file-activity-label]')
  await expect(fileRow).toHaveText('Редактирование fixture-note.md +1 −1')
  await expect(fileRow.locator('[data-hcv-file-activity-name]')).toHaveCSS('text-decoration-style', 'dotted')
  await expect(fileRow.locator('[data-hcv-file-activity-name]')).toHaveCSS('text-decoration-thickness', '0.5px')
  await expect(fileRow.locator('[data-hcv-file-activity-name]')).toHaveCSS('text-underline-offset', '2px')
  await expect(fileRow.locator('[role="link"], a, button')).toHaveCount(0)
  await expect(fileRow.locator('[data-hcv-file-activity-counts]')).toHaveCSS('font-size', '13px')
  await expect(fileRow.locator('[data-hcv-file-activity-counts]')).toHaveCSS('font-family', await fileRow.evaluate(node => getComputedStyle(node).fontFamily))
  await expect(fileRow.locator('[data-hcv-file-activity-added]')).toHaveCSS('color', await fileRow.locator('[data-hcv-file-activity-removed]').evaluate(node => getComputedStyle(node).color))
  await expect(fileRow.locator('[data-hcv-file-activity-marker]')).toHaveCount(0)
  const diff = edit.locator('button[aria-expanded]').first()
  await expect(diff).toHaveAttribute('aria-expanded', 'false')
  await diff.click()
  await expect(edit.getByText(/Исправленный файл/)).toBeVisible()
  await expect(fileRow).toHaveText('Отредактированный файл')
  await expect(fileRow.locator('[data-hcv-file-activity-counts]')).toHaveCount(0)
  await diff.click()
  await expect(edit.getByText(/Исправленный файл/)).toHaveCount(0)
  const shell = history.locator('[data-hcv-terminal-details="shell"]')
  const shellOpening = await sampleMotion(expect, page, history, shell, 'opening', () => command.click())
  await expect(shell.getByText('Shell', { exact: true })).toHaveCSS('font-size', '13px')
  await expect(shell.getByText('Shell', { exact: true })).toHaveCSS('line-height', '18.5714px')
  await expect(shell.locator('pre')).toContainText('fixture verified')
  await expect(shell.locator('pre')).toHaveCSS('font-size', '13px')
  await expect(shell).toHaveCSS('border-top-width', '1px')
  await expect(shell).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.08)')
  await expect(shell).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.16)')
  const shellRadius = await shell.evaluate(() => CSS.supports('corner-shape', 'superellipse(1.5)'))
  await expect(shell).toHaveCSS('border-top-left-radius', shellRadius ? '12.5px' : '10px')
  await expect(shell).toHaveCSS('margin-inline-start', '24px')
  await expect(shell).toHaveCSS('margin-block-start', '12px')
  await expect(shell.locator('[data-hcv-terminal-status]')).toHaveText('Успех')
  assert(Math.abs(shellOpening.frames.at(-1).height - (await shell.boundingBox()).height) < 1,
    'The terminal panel must not jump after opening')
  const terminalScroll = await shell.locator('pre').evaluate(pre => {
    const viewport = pre.closest('[data-hcv-terminal-details] > div')
    return { height: viewport.getBoundingClientRect().height, clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight, width: viewport.clientWidth, scrollWidth: viewport.scrollWidth }
  })
  assert(terminalScroll.height === 144 && terminalScroll.scrollHeight > terminalScroll.clientHeight && terminalScroll.scrollWidth > terminalScroll.width)
  const commandCode = shell.locator('[data-hcv-terminal-code]')
  const copyCommand = shell.locator('button[data-hcv-terminal-copy="command"]')
  const copyOutput = shell.locator('button[data-hcv-terminal-copy="output"]')
  await expect(commandCode).toHaveAttribute('role', 'button')
  await expect(commandCode).toHaveAttribute('tabindex', '0')
  await expect(copyCommand).toHaveAttribute('data-hcv-terminal-copy-label', 'Копировать команду')
  await expect(copyOutput).toHaveAttribute('data-hcv-terminal-copy-label', 'Копировать вывод')
  await expect(copyCommand).not.toHaveAttribute('title')
  await expect(copyOutput).not.toHaveAttribute('title')
  await shell.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await copyCommand.hover()
  const copyTip = page.locator('[data-hcv-terminal-copy-tip]')
  await expect(copyTip).toHaveText('Копировать команду')
  await expect(copyTip).toBeVisible()
  await expect(copyTip).toHaveCSS('font-size', '13px')
  await expect(copyTip).toHaveCSS('line-height', '18px')
  await expect(copyTip).toHaveCSS('padding-inline-start', '12px')
  await expect(copyTip).toHaveCSS('padding-block-start', '5px')
  const copyTipGap = await copyTip.evaluate((tip, selector) => {
    const button = document.querySelector(selector)
    return button.getBoundingClientRect().top - tip.getBoundingClientRect().bottom
  }, '[data-hcv-terminal-details="shell"] button[data-hcv-terminal-copy="command"]')
  assert(Math.abs(copyTipGap - 5) < 1)
  await expect(page.locator('[data-slot="tooltip-content"]:visible')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(copyTip).toBeHidden()
  await expect(copyCommand).toHaveCSS('width', '24px')
  await expect(copyOutput).toHaveCSS('width', '24px')
  await page.mouse.move(0, 0)
  await expect(copyCommand).toHaveCSS('opacity', '0')
  await commandCode.hover()
  await expect(copyCommand).toHaveCSS('opacity', '1')
  await expect(copyOutput).toHaveCSS('opacity', '0')
  await shell.locator('[data-hcv-terminal-output]').hover()
  await expect(copyOutput).toHaveCSS('opacity', '1')
  // A long displayed command exercises the source two-line clamp and its
  // keyboard expansion independently of the short stored command fixture.
  const commandMarkup = await commandCode.innerHTML()
  await commandCode.evaluate(code => code.append(document.createTextNode('\nsecond fixture line\nthird fixture line')))
  await expect(commandCode).toHaveCSS('-webkit-line-clamp', '2')
  const collapsedCommandHeight = await commandCode.evaluate(code => code.getBoundingClientRect().height)
  await page.keyboard.down('Tab')
  await commandCode.focus()
  await page.keyboard.up('Tab')
  await commandCode.press('Enter')
  await expect(commandCode).toHaveAttribute('data-hcv-terminal-expanded')
  assert((await commandCode.boundingBox()).height > collapsedCommandHeight)
  await commandCode.evaluate((code, html) => {
    code.innerHTML = html
    code.removeAttribute('data-hcv-terminal-expanded')
  }, commandMarkup)
  // Copy uses the installed host SDK path. Only this isolated process's
  // clipboard writer is replaced; the owner's operating-system clipboard
  // is never changed by these checks.
  await app.evaluate(({ clipboard }) => {
    globalThis.hcvActivityClipboardWriter = clipboard.writeText
    globalThis.hcvActivityClipboard = []
    clipboard.writeText = text => { globalThis.hcvActivityClipboard.push(text) }
  })
  try {
    await commandCode.hover()
    await copyCommand.click()
    await expect(copyCommand).toHaveAttribute('aria-label', 'Скопировано')
    assert.equal((await app.evaluate(() => globalThis.hcvActivityClipboard)).at(-1), 'echo verify-file')
    await shell.locator('[data-hcv-terminal-output]').hover()
    await copyOutput.click()
    await expect(copyOutput).toHaveAttribute('aria-label', 'Скопировано')
    assert.match((await app.evaluate(() => globalThis.hcvActivityClipboard)).at(-1), /^fixture verified/)
  } finally {
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = globalThis.hcvActivityClipboardWriter
      delete globalThis.hcvActivityClipboardWriter
    })
  }
  await page.emulateMedia({ contrast: 'more' })
  await expect(shell).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.16)')
  const contrastScroll = await shell.evaluate(shell => {
    const sample = document.createElement('div')
    sample.style.scrollbarColor = 'CanvasText Canvas'
    shell.append(sample)
    const value = getComputedStyle(sample).scrollbarColor
    sample.remove()
    return value
  })
  await expect(shell.locator('[data-hcv-terminal-output]')).toHaveCSS('scrollbar-color', contrastScroll)
  await page.emulateMedia({ contrast: 'no-preference' })
  await screenshot('shell-details.png')
  const shellClosing = await sampleMotion(expect, page, history, shell, 'closing', () => command.click())
  await expect(shell).toHaveCount(0)
  await mixed.click()
  await expect(command).toBeHidden()
  await mixed.click()
  await expect(command).toBeVisible()
  await mixed.click()

  const receipt = chat.locator('[data-slot="aui_background-result"] button').filter({
    has: page.locator('[data-hcv-activity-label][title="Проверка файлов"]'),
  })
  await expect(receipt).toBeVisible()
  await expect(receipt.locator('[data-hcv-activity-label]')).toHaveText('Субагент завершил(-и) работу')
  await expect(receipt.locator('[data-hcv-activity-label]')).toHaveAttribute('title', 'Проверка файлов')
  await receipt.evaluate(button => button.scrollIntoView({ block: 'center' }))
  await receipt.click()
  await expect(receipt).toHaveAttribute('aria-expanded', 'true')
  await expect(chat.getByText('Пробный отчёт субагента.', { exact: true })).toBeVisible()
  await receipt.click()
  const thinking = await thought.locator(mark).evaluate(label => {
    const css = getComputedStyle(label)
    return { family: css.fontFamily, size: css.fontSize, weight: css.fontWeight, line: css.lineHeight }
  })
  const caretHash = maskHash(await caret.locator('.codicon-chevron-right').evaluate(glyph => getComputedStyle(glyph).maskImage))
  assert.equal(caretHash, 'ee88d4922f70be521afb12312993e412afe55f8bee71a33bc49c62a734fd2a73')
  const turnPanel = history.locator(`[data-hcv-turn-step][${motion}]`).first()
  const turnClosing = await captureDisclosureMotion({ expect, page, scope: history, panel: turnPanel, phase: 'closing', trigger: () => steps.click() })
  assert.equal(turnClosing.duration, 200)
  const [closeStart, heightDelay, closeEnd] = turnClosing.frames
  assert.equal(closeStart.height, heightDelay.height)
  assert(closeStart.opacity > heightDelay.opacity && heightDelay.opacity > closeEnd.opacity)
  assert(closeEnd.height < heightDelay.height)
  await expect(steps).toHaveAttribute('aria-expanded', 'false')
  // Hermes returns scripted focus to the composer unless it is handling a
  // keyboard-navigation gesture. Hold Tab while setting the starting focus.
  await page.keyboard.down('Tab')
  await steps.focus()
  await page.keyboard.up('Tab')
  await expect(steps).toBeFocused()
  let turnOpening
  try {
    turnOpening = await sampleMotion(expect, page, history, turnPanel, 'opening', () => page.keyboard.press('Enter'), 150)
  } catch (error) {
    console.log('Turn opening diagnostic:', JSON.stringify(await history.evaluate(node => ({
      expanded: node.querySelector('button[data-hcv-turn-line]')?.getAttribute('aria-expanded'),
      focused: document.activeElement?.outerHTML.slice(0, 400),
      steps: node.querySelectorAll('[data-hcv-turn-step]').length,
      motion: [...node.querySelectorAll('[data-hcv-activity-motion]')].map(el => el.getAttribute('data-hcv-activity-motion')),
    }))))
    throw error
  }
  await expect(steps).toHaveAttribute('aria-expanded', 'true')
  await readGroup.click()
  await thought.click()
  await expect(body).toBeVisible()
  await thought.dblclick()
  await expect(body).not.toHaveAttribute(motion)
  await expect(thought).toHaveAttribute('aria-expanded', 'true')
  await thought.click()
  await expect(body).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(caret.locator('.codicon-chevron-right')).toHaveCSS('transition-property', 'none')
  await thought.click()
  await expect(body).toBeVisible()
  await expect(body).not.toHaveAttribute(motion)
  await thought.click()
  await expect(body).toHaveCount(0)
  const older = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Старый ход сохранён.' })
  const olderSteps = older.locator('[data-hcv-turn-line]')
  if (await olderSteps.getAttribute('aria-expanded') !== 'true') await olderSteps.click()
  await older.getByRole('button', { name: 'Думал', exact: true }).click()
  await expect(older.getByText('Original text from a saved turn.', { exact: true })).toBeVisible()
  await expect(chat.getByRole('button', { name: /Перевести на русский|Показать оригинал/ })).toHaveCount(0)
  assert.equal(translationRequests.length, 0)
  return { thinking, caretHash, originalBody: true, bodyScroll: scrolling, bodyGaps: gaps,
    motion: { thoughtOpening, thoughtClosing, readOpening, readClosing, shellOpening, shellClosing,
      turnOpening, turnClosing, rapidReverse: true, reduced: true }, terminalScroll,
    translationRequests: 0,
    mixedGroup: true, groupStepsIndent: 24, groupStepsGap: 12, receipt: true }
}

async function verifyContinuedCommentary({ chat, expect, projectChat, screenshot }) {
  await projectChat('Продолжение после лимита').click()
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Продолжай проверку отчёта.' })
  const steps = turn.locator('button[data-hcv-turn-line]')
  const comments = ['Проверяю сохранённые данные.', 'Сверяю подготовленный отчёт.']
    .map(text => turn.getByText(text, { exact: true }))
  const reply = turn.getByText('Отчёт готов к отправке.', { exact: true })
  await expect(reply).toBeVisible()
  await expect(steps).toHaveAttribute('aria-expanded', 'false')
  for (const comment of comments) await expect(comment).toBeHidden()
  await expect(turn.getByText('Все данные сверены.', { exact: true })).toBeVisible()
  await screenshot('continued-commentary-collapsed.png')
  await steps.click()
  for (const comment of comments) await expect(comment).toBeVisible()
  await expect(reply).toBeVisible()
  await screenshot('continued-commentary-expanded.png')
  await steps.click()
  for (const comment of comments) await expect(comment).toBeHidden()
  await expect(reply).toBeVisible()
}

export async function verifyActivityParity({ page, app, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, translationRequests }) {
  const before = process.env.HERMES_VISUAL_ACTIVITY_BEFORE === '1'
  const fixtureIcon = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#292929"/><path d="M5 5h6M8 5v6" stroke="white" stroke-width="1.4"/></svg>',
  ).toString('base64')
  await app.evaluate(({ ipcMain }, image) => {
    globalThis.hcvActivityFaviconRequests = []
    ipcMain.removeHandler('hermes:resolveFavicon')
    ipcMain.handle('hermes:resolveFavicon', (_event, url) => {
      globalThis.hcvActivityFaviconRequests.push(url)
      return url === 'https://www.threads.com' ? image : ''
    })
  }, fixtureIcon)
  await page.setViewportSize({ width: 1440, height: 960 })
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const catalogChat = projectChat('Проверка каталога')
  if (!before) {
    await verifyContinuedCommentary({ chat, expect, projectChat, screenshot })
    // The preview can omit this fixture chat when newer chats fill its four slots.
    if (!(await catalogChat.isVisible())) {
      const project = catalogChat.locator('xpath=ancestor::*[@data-sessions-project][1]')
      await project.locator('[data-hcv-project-more] > button').click()
    }
  }
  await catalogChat.click()
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Проверка оформления закончена.' })
  // Native history can initially mount only its last page. Load the earlier
  // fixture turns with the same action a reader uses before inspecting them.
  const earlier = chat.getByRole('button', { name: /^(Показать ранние сообщения|Show earlier messages)$/ })
  for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
    if (!(await earlier.isVisible())) break
    const first = await chat.locator('[data-slot="aui_turn-pair"]').first().textContent()
    await earlier.click()
    await expect.poll(async () => !(await earlier.isVisible()) ||
      await chat.locator('[data-slot="aui_turn-pair"]').first().textContent() !== first,
    { timeout: 30000 }).toBe(true)
  }
  await expect(turn).toBeVisible()
  const telemetry = chat.getByRole('button', { name: 'Нет, спасибо', exact: true })
  if (await telemetry.isVisible()) await telemetry.click()
  const steps = turn.locator('button[data-hcv-turn-line]')
  if (!before) {
    await expect(steps).toHaveAttribute('aria-expanded', 'false')
    await expect(turn.getByText('Проверка оформления закончена.', { exact: true })).toBeVisible()
    await expect(turn.getByText('Сначала проверяю подключения браузера.', { exact: true })).toBeHidden()
    await expect(steps).toHaveCSS('font-variant-numeric', 'tabular-nums')
    await screenshot('completed-turn-collapsed.png', { locator: turn })
  }
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  const skill = turn.locator('[data-hcv-skill-link]').filter({ hasText: 'Мультролики с твоим героем' })
  const legacySkill = turn.locator('span[title$="/SKILL.md"]')
  const prose = turn.locator('.aui-md').filter({ hasText: 'Для сборки использую' }).first()
  await prose.scrollIntoViewIfNeeded()
  const proseStyle = await prose.evaluate(node => {
    const first = node.querySelector('p')
    if (!first) throw new Error('Expected a paragraph in the activity fixture')
    const second = document.createElement('p')
    second.textContent = 'Второй абзац для замера.'
    first.after(second)
    const css = getComputedStyle(first)
    const gap = second.getBoundingClientRect().top - first.getBoundingClientRect().bottom
    const result = { font: css.fontFamily, size: css.fontSize, weight: css.fontWeight,
      line: css.lineHeight, color: css.color, gap, paragraphMargin: getComputedStyle(second).marginBlockStart }
    second.remove()
    return result
  })
  console.log('Activity prose style', JSON.stringify(proseStyle))

  if (before) {
    await screenshot('activities.png')
    const skillFileCard = await legacySkill.evaluate(span => getComputedStyle(span.parentElement).display)
    const skillLabels = await turn.locator('[data-hcv-skill-link]').allTextContents()
    const nativeBrowserRows = await turn.locator('[data-tool-summary] button').allTextContents()
    await projectChat('Ход проверки файлов').click()
    const history = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Лента проверки файлов готова.' })
    await expect(history).toBeVisible()
    const historySteps = history.locator('button[data-hcv-turn-line]')
    if (await historySteps.getAttribute('aria-expanded') !== 'true') await historySteps.click()
    const thinking = history.locator('[data-slot="aui_thinking-disclosure"] button[aria-expanded]')
    await thinking.scrollIntoViewIfNeeded()
    await page.mouse.move(280, 120)
    await screenshot('timeline.png')
    const thinkingStyle = await thinking.evaluate(button => {
      const label = button.querySelector('span span span') || button.querySelector('span span')
      const style = getComputedStyle(label)
      return { label: button.innerText, size: style.fontSize, lineHeight: style.lineHeight,
        font: style.fontFamily, caret: button.children[1]?.getBoundingClientRect().width }
    })
    await thinking.click()
    const oldBody = history.locator('[data-slot="aui_thinking-body"]')
    const expanded = await oldBody.evaluate(node => {
      const css = getComputedStyle(node)
      return { maxHeight: css.maxBlockSize, marginTop: css.marginBlockStart, paddingBottom: css.paddingBlockEnd,
        client: node.clientHeight, content: node.scrollHeight }
    })
    await screenshot('reasoning-before.png')
    await thinking.click()
    const tape = await history.locator('[data-slot="aui_assistant-message-content"]').evaluateAll(nodes => nodes.flatMap(node =>
      [...node.children].filter(child => child.matches('[data-slot="tool-block"]')).map(child => ({
        group: child.hasAttribute('data-tool-group'), label: child.querySelector('button')?.innerText,
      }))))
    return { skillFileCard, skillLabels, nativeBrowserRows, thinkingStyle, expanded, tape, proseStyle }
  }
  assert.equal(proseStyle.size, '14px')
  assert.equal(proseStyle.weight, '430')
  assert.equal(proseStyle.line, '22.75px')
  assert.equal(proseStyle.color, 'rgb(223, 223, 223)')
  assert.equal(proseStyle.gap, 14)
  assert.match(proseStyle.font, /Segoe UI/)
  const progress = turn.getByText('Сначала проверяю подключения браузера.', { exact: true })
  await expect(progress).toBeVisible()
  await steps.click()
  await expect(progress).toBeHidden()
  await steps.click()
  await expect(progress).toBeVisible()
  await expect(skill).toBeVisible()
  await expect(skill).toHaveAttribute('href', /^#preview\//)
  await expect(legacySkill).toBeHidden()
  await expect(turn.locator('code').getByText('$fixture-skill', { exact: true })).toBeVisible()
  const note = turn.getByRole('button', { name: 'Памятку', exact: true })
  await expect(note).toBeVisible()
  await expect(note).toHaveAttribute('title', /[\\/]fixture-note\.md$/)
  await expect(turn.getByText('Прочитал навык fixture-skill', { exact: true })).toBeVisible()
  const browser = turn.locator(`${icon}[data-tool-summary]`).filter({ has: page.locator(mark).getByText('Использовал браузер и Chrome Devtools', { exact: true }) })
  await expect(browser).toBeVisible()
  const site = turn.locator(mark).getByText('Проверяю Threads в новой вкладке Chrome', { exact: true })
  await site.scrollIntoViewIfNeeded()
  await expect(site).toBeVisible()
  const siteImage = site.locator('..').locator('img[data-hcv-activity-favicon]')
  await expect(siteImage).toHaveAttribute('src', fixtureIcon)
  await expect.poll(() => siteImage.evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
  await expect(siteImage).toHaveCSS('width', '16px')
  const command = turn.locator('[data-tool-summary]').filter({ has: page.locator(mark).getByText('Выполнил команды', { exact: true }) })
  await expect(command).toBeVisible()
  const integration = turn.locator('[data-tool-row][data-hcv-activity-icon="activityIntegration"]').locator(mark)
  await expect(integration).toHaveText('Вызвал инструмент')
  assert.match(await integration.evaluate(label => getComputedStyle(label.parentElement, '::before').maskImage), /^url\(/)
  const agent = turn.locator('[data-hcv-agent-activity="completed"]')
  await expect(agent).toBeVisible()
  await expect(agent).toHaveText('Субагент завершил(-и) работу')
  await expect(agent.locator('[data-hcv-agent-name]')).toHaveText('Субагент')
  await expect(agent.locator('img')).toHaveCount(0)
  await expect(turn.locator('[data-hcv-agent-activity="started"]')).toHaveCount(0)
  // This unsupported browser error remains native; known MCP errors are checked in activity-bundles.
  const failed = turn.locator('[data-tool-row]:not([data-hcv-activity-failed])')
    .filter({ has: page.locator('svg.text-destructive[aria-label]') })
  await expect(failed).toBeVisible()
  await expect(failed.locator(mark)).toHaveCount(0)
  await expect(failed.locator('[data-hcv-activity-favicon]')).toHaveCount(0)

  const skillStyle = await skill.evaluate(link => {
    const style = getComputedStyle(link)
    const icon = link.firstElementChild
    const glyph = getComputedStyle(icon, '::before')
    return { color: style.color, weight: style.fontWeight, display: style.display, width: glyph.width,
      iconGap: getComputedStyle(icon).paddingInlineEnd, mask: glyph.maskImage }
  })
  const rowStyle = await browser.locator(mark).evaluate(label => {
    const row = label.parentElement
    const glyph = getComputedStyle(row, '::before')
    const style = getComputedStyle(label)
    return { color: style.color, size: style.fontSize, lineHeight: style.lineHeight, weight: style.fontWeight,
      gap: getComputedStyle(row).gap, width: glyph.width, mask: glyph.maskImage }
  })
  const agentStyle = await agent.evaluate(row => ({
    gap: getComputedStyle(row).gap, lineHeight: getComputedStyle(row).lineHeight,
    images: row.querySelectorAll('img').length, color: getComputedStyle(row).color,
  }))
  assert.equal(skillStyle.color, 'rgb(153, 206, 255)')
  assert.equal(skillStyle.weight, '500')
  assert.equal(skillStyle.display, 'inline')
  assert.equal(skillStyle.width, '16px')
  assert.equal(skillStyle.iconGap, '3px')
  assert.equal(rowStyle.color, 'rgba(255, 255, 255, 0.5)')
  assert.equal(rowStyle.size, '14px')
  assert.equal(rowStyle.lineHeight, '21px')
  assert.equal(rowStyle.weight, '430')
  assert.equal(rowStyle.gap, '8px')
  assert.equal(rowStyle.width, '16px')
  assert.equal(agentStyle.gap, '6px')
  assert.equal(agentStyle.images, 0)
  assert.equal(agentStyle.lineHeight, '20px')
  const maskSha256 = { skill: maskHash(skillStyle.mask), browser: maskHash(rowStyle.mask) }
  assert.equal(maskSha256.skill, 'cf5f6cd062f22cce9a3beeae612fbe72bab5c304fbd958a037925f78d19f8afb')
  assert.equal(maskSha256.browser, '6bb6168fe4a94f7495574909b6101a951e189cdd35e91d62582ef682ba4bd62c')
  // Exercise the live glyph structure used by Hermes without running an
  // external browser: preserve the named status while replacing its frames.
  const liveBrowser = await browser.evaluate(summary => {
    const row = document.createElement('div')
    row.setAttribute('data-slot', 'tool-block')
    row.setAttribute('data-tool-row', '')
    row.setAttribute('data-hcv-activity-icon', 'activityBrowser')
    row.innerHTML = '<div><div><button><span><span><span><span role="status" aria-label="Running"><span class="glyph-spinner" aria-hidden="true">⠇</span></span></span><span>Browser</span></span></span></button></div></div>'
    summary.parentElement.append(row)
    const glyph = row.querySelector('[role="status"]').parentElement
    const result = { mask: getComputedStyle(glyph).maskImage,
      opacity: getComputedStyle(row.querySelector('.glyph-spinner')).opacity,
      name: row.querySelector('[role="status"]').getAttribute('aria-label') }
    row.remove()
    return result
  })
  assert.equal(maskHash(liveBrowser.mask), maskSha256.browser)
  assert.equal(liveBrowser.opacity, '0')
  assert.equal(liveBrowser.name, 'Running')
  const thoughtClock = await browser.evaluate(summary => {
    const thought = document.createElement('div')
    thought.setAttribute('data-slot', 'aui_thinking-disclosure')
    thought.innerHTML = '<div><button><span><span><span data-hcv-activity-label>Думаю</span></span></span></button><span><span><span class="tabular-nums">3s</span></span></span></div>'
    summary.parentElement.append(thought)
    const label = thought.querySelector('[data-hcv-activity-label]')
    const clock = thought.querySelector('.tabular-nums')
    const values = node => {
      const css = getComputedStyle(node)
      return [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight, css.color]
    }
    const result = { label: values(label), clock: values(clock) }
    thought.remove()
    return result
  })
  assert.deepEqual(thoughtClock.clock, thoughtClock.label)
  delete skillStyle.mask
  delete rowStyle.mask
  const requests = await app.evaluate(() => globalThis.hcvActivityFaviconRequests.filter(url => url.includes('threads.com')))
  assert.deepEqual(requests, ['https://www.threads.com'])
  await prose.scrollIntoViewIfNeeded()
  await page.mouse.move(290, 130)
  await screenshot('activities.png')

  await page.bringToFront()
  const nativePreview = skill.locator('..').locator(':scope > button:last-child')
  await expect(nativePreview).toBeEnabled()
  await nativePreview.evaluate(button => button.addEventListener('click', () => {
    button.setAttribute('data-fixture-preview-clicked', 'true')
  }, { once: true }))
  await skill.click()
  await expect(nativePreview).toHaveAttribute('data-fixture-preview-clicked', 'true')
  await expect(page.getByText('Инструкция из отдельного профиля.', { exact: true })).toBeVisible({ timeout: 12000 })
  // Explicitly deliver Enter to the link; window focus is managed by the
  // OS during isolated tests, so native key delivery can go to another window.
  await skill.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await expect(page.getByText('Инструкция из отдельного профиля.', { exact: true })).toBeHidden()
  const commandToggle = command.locator('button[aria-expanded]')
  await commandToggle.click()
  const outputRow = turn.locator('[data-tool-row][data-hcv-activity-icon="activityTerminal"]').filter({
    has: page.getByRole('button', { name: 'echo fixture-one', exact: true }),
  }).first()
  await outputRow.locator('button[aria-expanded]').click()
  await expect(outputRow.getByText('fixture-output-one', { exact: true })).toBeVisible()
  if (process.env.HERMES_VISUAL_TYPOGRAPHY) {
    await expect(outputRow.locator('[data-hcv-terminal-details="shell"]')).toBeVisible()
    await expect(outputRow.getByText('fixture-output-one', { exact: true })).toHaveCSS('font-size', '13px')
    const outputFont = await outputRow.getByText('fixture-output-one', { exact: true }).evaluate(node => {
      const css = getComputedStyle(node)
      return { family: css.fontFamily, size: css.fontSize }
    })
    assert.match(outputFont.family, /^ui-monospace/)
    assert.equal(outputFont.size, '13px')
    await screenshot('terminal-output.png')
  }
  await commandToggle.click()
  await expect(outputRow.getByText('fixture-output-one', { exact: true })).toBeHidden()

  await projectChat('Интервалы уведомлений').click()
  const spacingTurn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Проверь интервалы уведомления агента.' })
  await expect(spacingTurn).toBeVisible()
  const spacingSteps = spacingTurn.locator('button[data-hcv-turn-line]')
  if (await spacingSteps.count() && await spacingSteps.getAttribute('aria-expanded') !== 'true') await spacingSteps.click()
  const spacingReceipt = spacingTurn.locator('[data-slot="aui_background-result"]')
  const spacingAgent = spacingTurn.locator('[data-hcv-agent-activity="dispatched"]')
  await expect(spacingAgent).toHaveCount(0)
  await expect(spacingTurn.locator('[data-hcv-agent-activity="started"]')).toHaveCount(0)
  const spacingCompletion = spacingReceipt.locator('[data-hcv-agent-activity="completed"]')
  await expect(spacingCompletion).toHaveCount(1)
  await expect(spacingReceipt).toHaveAttribute('data-hcv-agent-receipt', '')
  // This old record has no stored child id. No blank img or fabricated badge.
  await expect(spacingCompletion.locator('img')).toHaveCount(0)
  const spacingLabel = spacingCompletion.locator('[data-hcv-agent-name]')
  await expect(spacingLabel).toHaveText('Субагент')
  const spacing = await spacingTurn.evaluate(node => {
    const rect = element => element.getBoundingClientRect()
    const prose = text => [...node.querySelectorAll('.aui-md')].find(element => element.textContent.includes(text))
    const receipt = node.querySelector('[data-slot="aui_background-result"] [data-hcv-agent-activity="completed"]')
    const middle = prose('Текст перед уведомлением агента.')
    const after = prose('Текст после уведомления агента.')
    return {
      beforeReceipt: rect(receipt).top - rect(middle).bottom,
      afterReceipt: rect(after).top - rect(receipt).bottom,
    }
  })
  console.log('Agent timeline spacing', JSON.stringify(spacing))
  assert.deepEqual(spacing, { beforeReceipt: 16, afterReceipt: 16 })
  await expect(spacingReceipt.locator('button[data-hcv-agent-name]')).toBeEnabled()
  await projectChat('Ход проверки файлов').click()
  await expect(chat.getByText('Лента проверки файлов готова.', { exact: true })).toBeVisible()
  const timeline = await verifyTimeline({ app, page, expect, chat, screenshot, translationRequests })
  await projectChat('Проверка каталога').click()
  await expect(turn).toBeVisible()
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  await page.setViewportSize({ width: 760, height: 760 })
  await expect(skill).toBeVisible()
  await skill.scrollIntoViewIfNeeded()
  await expect.poll(() => skill.evaluate(link => link.closest('p')?.getBoundingClientRect().right ?? 0)).toBeLessThanOrEqual(760)
  await screenshot('narrow.png')
  await page.setViewportSize({ width: 1440, height: 960 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  const lightColor = await skill.evaluate(link => getComputedStyle(link).color)
  assert.equal(lightColor, 'rgb(1, 105, 204)')
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(skill).toHaveCount(0)
  await expect(turn.locator(mark)).toHaveCount(0)
  await expect(chat.locator('[data-hcv-activity-group]')).toHaveCount(0)
  await expect(chat.locator('[data-hcv-activity-member]')).toHaveCount(0)
  await expect(chat.locator('[data-hcv-activity-empty-owner]')).toHaveCount(0)
  await expect(legacySkill).not.toHaveCSS('display', 'none')
  return { skillStyle, rowStyle, agentStyle, maskSha256, proseStyle, liveBrowser: { opacity: liveBrowser.opacity, name: liveBrowser.name }, lightColor, requests, timeline,
    clickPreview: true, enterClosesPreview: true, terminalDetails: true, errorPreserved: true, themeScoped: true }
}
