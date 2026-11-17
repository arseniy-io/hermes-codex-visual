import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const mark = '[data-hcv-activity-label]'
const icon = '[data-hcv-activity-icon]'
const motion = 'data-hcv-activity-motion'

export async function installActivityReadinessFixture(page) {
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
      } else upstream.send(message)
    })
  })
}

function maskHash(value) {
  const body = /data:image\/svg\+xml,([^")]+)/.exec(value)?.[1]
  return body ? createHash('sha256').update(decodeURIComponent(body)).digest('hex') : null
}

async function sampleMotion(expect, panel, phase, duration = 300) {
  await expect(panel).toHaveAttribute(motion, phase)
  const result = await panel.evaluate(async node => {
    const animation = node.getAnimations().find(item => item.effect.getKeyframes().some(frame => 'blockSize' in frame))
    await animation.ready
    animation.pause()
    const { duration } = animation.effect.getTiming()
    const frames = [0, duration / 4, duration].map(time => {
      animation.currentTime = time
      return { height: node.getBoundingClientRect().height, opacity: Number(getComputedStyle(node).opacity) }
    })
    const easing = animation.effect.getTiming().easing
    animation.finish()
    return { duration, easing, frames }
  })
  assert.equal(result.duration, duration)
  assert.equal(result.easing, duration === 300 ? 'cubic-bezier(0.19, 1, 0.22, 1)' : 'cubic-bezier(0.23, 1, 0.32, 1)')
  const [start, between, end] = phase === 'opening' ? result.frames : [...result.frames].reverse()
  assert(between.height > start.height && end.height > between.height, JSON.stringify(result))
  assert(between.opacity > start.opacity && end.opacity > between.opacity, JSON.stringify(result))
  return result
}

async function verifyTimeline({ page, expect, chat, screenshot, translationRequests }) {
  const history = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Лента проверки файлов готова.' })
  const steps = history.locator('button[data-hcv-turn-line]')
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const thought = history.getByRole('button', { name: 'Думал', exact: true })
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
  await thought.click()
  await expect(thought).toHaveAttribute('aria-expanded', 'true')
  const thoughtOpening = await sampleMotion(expect, body, 'opening')
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
  await thought.click()
  const thoughtClosing = await sampleMotion(expect, body, 'closing')
  await expect(body).toHaveCount(0)

  const read = history.getByRole('button', { name: 'Прочитал файлы', exact: true })
  await expect(read).toHaveAttribute('aria-expanded', 'false')
  await read.click()
  const details = history.locator('[data-tool-summary]:has(button[aria-expanded="true"]) + div').first()
  const readOpening = await sampleMotion(expect, details, 'opening')
  await expect(history.getByText('Прочитал fixture-note.md', { exact: true })).toBeVisible()
  await expect(details).toHaveCSS('padding-inline-start', '24px')
  await expect(details).toHaveCSS('gap', '12px')
  const readFile = history.getByRole('button', { name: 'Прочитал fixture-note.md', exact: true })
  await readFile.click()
  const file = readFile.locator('xpath=ancestor::*[@data-tool-row][1]').locator('pre')
  await expect(file).toHaveText(/Первый файл/)
  await expect(file).toHaveCSS('font-size', '12px')
  await screenshot('read-details.png')
  await readFile.click()
  await expect(file).toHaveCount(0)
  await read.click()
  const readClosing = await sampleMotion(expect, details, 'closing')
  await expect(read).toHaveAttribute('aria-expanded', 'false')

  const sources = history.getByRole('button', {
    name: /Прочитал скилл.*поиск по истории.*поиск в интернете.*прочитал страницы/i,
  })
  await expect(sources).toBeVisible()
  const mixed = history.locator('[data-hcv-activity-group="activityEdit"]').getByRole('button')
  await expect(mixed).toHaveAccessibleName('Отредактировал файл и выполнил команды')
  await expect(mixed).toHaveAttribute('aria-expanded', 'false')
  const edit = history.locator('[data-hcv-activity-member][data-tool-row]').first()
  await expect(edit).toBeHidden()
  await mixed.click()
  await expect(mixed).toHaveAttribute('aria-expanded', 'true')
  await expect(edit).toBeVisible()
  await expect(edit).toHaveCSS('padding-inline-start', '24px')
  const command = history.getByRole('button', { name: 'echo verify-file', exact: true })
  await expect(command).toBeVisible()
  await expect(history.getByRole('button', { name: 'echo verify-again', exact: true })).toBeVisible()
  const commandRows = history.locator('[data-hcv-activity-member][data-tool-group] > [data-tool-summary] + div')
  await expect(commandRows).toHaveCSS('padding-inline-start', '0px')
  assert.equal(await commandRows.locator('..').evaluate(node => getComputedStyle(node, '::before').insetBlockStart), '0px')
  const fileX = (await edit.locator('button').first().boundingBox()).x
  const commandX = (await command.boundingBox()).x
  assert.equal(fileX, commandX)
  await history.evaluate(turn => turn.scrollIntoView({ block: 'center' }))
  await page.mouse.move(280, 120)
  await screenshot('timeline.png')
  const diff = edit.locator('button[aria-expanded]').first()
  await expect(diff).toHaveAttribute('aria-expanded', 'false')
  await diff.click()
  await expect(edit.getByText(/Исправленный файл/)).toBeVisible()
  await diff.click()
  await command.click()
  const shell = history.locator('[data-hcv-terminal-details="shell"]')
  const shellOpening = await sampleMotion(expect, shell, 'opening')
  await expect(shell.getByText('Терминал', { exact: true })).toHaveCSS('font-size', '13px')
  await expect(shell.locator('pre')).toContainText('fixture verified')
  await expect(shell.locator('pre')).toHaveCSS('font-size', '13px')
  await expect(shell).toHaveCSS('border-top-width', '1px')
  await expect(shell).toHaveCSS('background-color', 'rgb(42, 42, 42)')
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
  await screenshot('shell-details.png')
  await command.click()
  const shellClosing = await sampleMotion(expect, shell, 'closing')
  await expect(shell).toHaveCount(0)
  await mixed.click()
  await expect(command).toBeHidden()
  await mixed.click()
  await expect(command).toBeVisible()
  await mixed.click()

  const receipt = chat.getByRole('button', { name: 'Субагент завершил работу · Проверка файлов', exact: true })
  await expect(receipt).toBeVisible()
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
  await steps.click()
  const turnPanel = history.locator(`[data-hcv-turn-step][${motion}]`).first()
  const turnClosing = await sampleMotion(expect, turnPanel, 'closing', 150)
  await expect(steps).toHaveAttribute('aria-expanded', 'false')
  await steps.press('Enter')
  const turnOpening = await sampleMotion(expect, turnPanel, 'opening')
  await expect(steps).toHaveAttribute('aria-expanded', 'true')
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
  await projectChat('Проверка каталога').click()
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Проверка оформления закончена.' })
  await expect(turn).toBeVisible()
  const telemetry = chat.getByRole('button', { name: 'Нет, спасибо', exact: true })
  if (await telemetry.isVisible()) await telemetry.click()
  const steps = turn.locator('button[data-hcv-turn-line]')
  if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
  const skill = turn.locator('[data-hcv-skill-link]').filter({ hasText: 'Мультролики с твоим героем' })
  const legacySkill = turn.locator('span[title$="/SKILL.md"]')
  const prose = turn.locator('.aui-md').filter({ hasText: 'Для сборки использую' }).first()
  await prose.scrollIntoViewIfNeeded()

  if (before) {
    await screenshot('activities.png')
    const history = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Лента проверки файлов готова.' })
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
    return {
      skillFileCard: await legacySkill.evaluate(span => getComputedStyle(span.parentElement).display),
      skillLabels: await turn.locator('[data-hcv-skill-link]').allTextContents(),
      nativeBrowserRows: await turn.locator('[data-tool-summary] button').allTextContents(),
      thinkingStyle, expanded, tape,
    }
  }
  await expect(skill).toBeVisible()
  await expect(skill).toHaveAttribute('href', /^#preview\//)
  await expect(legacySkill).toBeHidden()
  await expect(turn.locator('code').getByText('$fixture-skill', { exact: true })).toBeVisible()
  await expect(turn.locator('span[title$="/fixture-note.md"]')).toBeVisible()
  await expect(turn.locator('[data-tool-row][data-hcv-activity-icon="chatSkill"]')).toBeVisible()
  const browser = turn.locator(`${icon}[data-tool-summary]`).filter({ has: page.locator(mark).getByText('Использовал браузер и Chrome выполнил команды', { exact: true }) })
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
  const agent = turn.locator('[data-hcv-agent-activity="completed"]').filter({ hasText: 'Thread research завершил(-и) работу' })
  await expect(agent).toBeVisible()
  const failed = turn.locator('[data-tool-row]').filter({ has: page.locator('svg.text-destructive[aria-label]') })
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
    width: getComputedStyle(row.querySelector('img')).width, color: getComputedStyle(row).color,
  }))
  assert.equal(skillStyle.color, 'rgb(153, 206, 255)')
  assert.equal(skillStyle.weight, '500')
  assert.equal(skillStyle.display, 'inline')
  assert.equal(skillStyle.width, '16px')
  assert.equal(skillStyle.iconGap, '3px')
  assert.equal(rowStyle.color, 'rgb(139, 139, 139)')
  assert.equal(rowStyle.size, '14px')
  assert.equal(rowStyle.lineHeight, '21px')
  assert.equal(rowStyle.weight, '430')
  assert.equal(rowStyle.gap, '8px')
  assert.equal(rowStyle.width, '16px')
  assert.equal(agentStyle.gap, '6px')
  assert.equal(agentStyle.width, '16px')
  assert.equal(agentStyle.lineHeight, '20px')
  const maskSha256 = { skill: maskHash(skillStyle.mask), browser: maskHash(rowStyle.mask) }
  assert.equal(maskSha256.skill, 'cf5f6cd062f22cce9a3beeae612fbe72bab5c304fbd958a037925f78d19f8afb')
  assert.equal(maskSha256.browser, '6bb6168fe4a94f7495574909b6101a951e189cdd35e91d62582ef682ba4bd62c')
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
  await commandToggle.click()
  await expect(outputRow.getByText('fixture-output-one', { exact: true })).toBeHidden()

  const timeline = await verifyTimeline({ page, expect, chat, screenshot, translationRequests })
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
  await expect(legacySkill).not.toHaveCSS('display', 'none')
  return { skillStyle, rowStyle, agentStyle, maskSha256, lightColor, requests, timeline,
    clickPreview: true, enterClosesPreview: true, terminalDetails: true, errorPreserved: true, themeScoped: true }
}
