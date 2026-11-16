import assert from 'node:assert/strict'

const summaryPane = kind => '[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-' + kind + '"]'
const heading = '[data-hcv-summary-heading]'
const disclosure = '[data-hcv-summary-disclosure]'

export async function verifySummaryParity({ page, expect, projectChat, screenshot, beforeRelease, tabHeader, responseMode }) {
  await projectChat('Проверка каталога').click()
  const card = page.locator('[data-hcv-context-card]:visible')
  const agents = card.locator('[data-hcv-open-subagents]')
  await expect(agents).toBeVisible()
  await expect(card.getByRole('button', { name: 'Изменения', exact: true }).first()).toBeEnabled()
  if (tabHeader) return verifyTabHeader({ page, expect, agents, screenshot, before: tabHeader === 'before' })
  await expect(card).toHaveCSS('width', beforeRelease ? '300px' : '280px')
  const cardShot = async name => {
    const clip = await card.boundingBox()
    assert(clip)
    await screenshot(name, { clip })
  }
  const facts = { card: await card.boundingBox() }

  if (!beforeRelease && !responseMode) {
    const sections = card.locator('[data-hcv-summary-section]')
    const site = sections.filter({ has: page.getByRole('button', { name: 'site', exact: true }) })
    const outputs = sections.filter({ has: page.getByRole('button', { name: 'Результаты', exact: true }) })
    await expect(outputs.getByRole('button', { name: 'fixture-note.md', exact: true })).toBeVisible()
    try {
      await expect(site.getByRole('button', { name: 'Изменения', exact: true })).toBeEnabled({ timeout: 18000 })
    } catch (error) {
      const heads = await sections.locator(heading).allTextContents()
      const folders = await page.locator('[data-ref="folder"]').evaluateAll(nodes =>
        nodes.map(node => ({ title: node.getAttribute('data-directive-id'), slot: node.dataset.slot,
          attached: Boolean(node.closest('[data-slot="aui_user-message-root"]')) })))
      console.log(JSON.stringify({ heads, folders }))
      throw error
    }
    await expect(sections).toHaveCount(6)
    facts.sections = await sections.locator(heading).allTextContents()
    const requests = sections.filter({ has: page.getByRole('button', { name: 'Запросы на включение изменений', exact: true }) })
    await expect(requests.getByRole('button', { name: 'Проверка правок сайта', exact: true })).toBeVisible()

    const first = sections.first().locator(heading)
    await page.mouse.move(0, 0)
    await expect(first.locator('[data-hcv-summary-chevron]')).toHaveCSS('opacity', '0')
    await first.hover()
    await expect(first.locator('[data-hcv-summary-chevron]')).toHaveCSS('opacity', '1')
    assert(await card.evaluate(node => node.scrollWidth <= node.clientWidth), 'Summary content fits the card width')
    await cardShot('summary.png')
    facts.card = await card.boundingBox()

    for (const section of await sections.all()) {
      const button = section.locator(heading)
      const body = section.locator(disclosure)
      const full = (await card.boundingBox()).height
      await button.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(body).toHaveAttribute('inert', '')
      await expect.poll(async () => (await card.boundingBox()).height).toBeLessThan(full - 15)
      await expect(card.locator('[data-hcv-summary-heading][aria-expanded="false"]')).toHaveCount(1)
      await button.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
    }

    const sources = sections.filter({ has: page.getByRole('button', { name: 'Источники', exact: true }) })
    await sources.locator(heading).click()
    await cardShot('summary-collapsed.png')
    await site.getByRole('button', { name: 'Изменения', exact: true }).click()
    await expect(page.locator('[data-hcv-changes-pane]:visible')).toContainText('page.md')
    await page.locator(summaryPane('changes')).getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(page.locator(summaryPane('changes'))).toHaveCount(0)
    await expect(sources.locator(heading)).toHaveAttribute('aria-expanded', 'false')
  } else {
    await cardShot('summary.png')
  }

  await agents.click()
  const pane = page.locator('[data-hcv-subagents-pane]:visible')
  const tab = page.locator(summaryPane('agents'))
  const row = goal => pane.getByRole('button', { name: new RegExp(goal) })
  const result = pane.locator('[data-hcv-subagent-result]')
  const back = pane.getByRole('button', { name: 'Назад к субагентам' })
  const firstAgent = row('Проверить описание сайта')
  const lastAgent = row('Сверить сохранённый отчёт')
  await expect(lastAgent).toBeVisible()
  await lastAgent.hover()
  facts.agentHover = await lastAgent.evaluate(node => getComputedStyle(node).backgroundColor)
  await screenshot('subagents-list.png')
  await lastAgent.press('Enter')
  await expect(back).toBeFocused()

  if (beforeRelease) {
    await expect(result).toContainText('Передано')
    await expect(result).not.toContainText('Сохранённый ответ 2.')
    await screenshot('subagent-detail.png')
    return facts
  }

  await expect(result).toHaveAttribute('data-source', 'transcript', { timeout: 20000 })
  await expect(result).toContainText('Сохранённый ответ 2.')
  await expect(result).not.toContainText('Сохранённый ответ 0.')
  await expect(result.locator('li')).toHaveCount(2)
  await expect(pane.locator('[data-hcv-subagent-model]')).toHaveText('mock-model', { timeout: 15000 })
  const steps = pane.locator('[data-hcv-subagent-activity-log]')
  await expect(steps).toContainText('40')
  await steps.locator('summary').click()
  await expect(steps.getByText('read_file', { exact: true })).toBeVisible()
  await steps.locator('summary').click()
  if (responseMode) {
    await page.mouse.move(0, 0)
    facts.response = await measureAgentResponse(pane)
    const clip = await pane.boundingBox()
    assert(clip)
    await screenshot('subagent-response.png', { clip })
  }
  await expect(tab).toHaveCSS('width', '220px')
  await expect(tab.getByRole('button', { name: 'Закрыть', exact: true }).locator('xpath=..')).toHaveCSS('opacity', '1')
  const rect = await pane.boundingBox()
  assert(rect)
  const sashes = await page.locator('[role="separator"][data-sash-overlap="trailing"]:visible').all()
  const borders = await Promise.all(sashes.map(sash => sash.boundingBox()))
  const sashIndex = borders.findIndex(box => box && box.height > 120 && Math.abs(rect.x - box.x) < 16)
  assert(sashIndex >= 0, 'Expected a resize handle for the right pane')
  const sashBounds = borders[sashIndex]
  const x = sashBounds.x + sashBounds.width / 2
  const y = sashBounds.y + 150
  await dragSash(page, x, y, -70)
  await expect.poll(async () => (await pane.boundingBox()).width).toBeGreaterThan(rect.width + 35)
  facts.agentPane = { before: rect.width, expanded: (await pane.boundingBox()).width }
  await screenshot('subagent-detail.png')
  if (responseMode === 'after') {
    const expandedBounds = await sashes[sashIndex].boundingBox()
    assert(expandedBounds)
    await dragSash(page, expandedBounds.x + expandedBounds.width / 2, y, 220)
    await expect.poll(async () => (await pane.boundingBox()).width).toBeLessThan(490)
    facts.narrowResponse = await measureAgentResponse(pane)
    await verifyAgentResponse({ page, expect, pane, result, facts })
    await result.locator('[data-hcv-table-scroll]').evaluate(node => { node.scrollLeft = 0 })
    const clip = await pane.boundingBox()
    assert(clip)
    await screenshot('subagent-table-narrow.png', { clip })
  }
  await back.press('Enter')
  await expect(lastAgent).toBeFocused()
  await firstAgent.click()
  await expect(result).toContainText('Сохранённый ответ 0.')
  await expect(result).not.toContainText('Сохранённый ответ 2.')
  if (responseMode === 'after') {
    const code = result.locator('pre code')
    await expect(code).toContainText('Сохранённый ответ 0.')
    assert.deepEqual(JSON.parse(await code.textContent()), { answer: 'Сохранённый ответ 0.', checks: ['text', 'table'] })
    const clip = await pane.boundingBox()
    assert(clip)
    await screenshot('subagent-json.png', { clip })
  }
  await back.press('Enter')
  await row('Пропустить занятую задачу').click()
  await expect(result).toContainText('Тестовый слот недоступен')
  await expect(result).not.toContainText('Сохранённый ответ')
  await back.press('Enter')

  await projectChat('Ревью интерфейса').click()
  await expect(pane.getByText('Сверить сохранённый отчёт', { exact: true })).toHaveCount(0)
  await expect(result).toHaveCount(0)
  await tab.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(tab).toHaveCount(0)
  facts.history = 'canonical stored child transcripts and refused-task result'
  return facts
}

async function dragSash(page, x, y, distance) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  try {
    await page.mouse.move(x + distance, y, { steps: 5 })
  } finally {
    await page.mouse.up()
  }
}

function measureAgentResponse(pane) {
  return pane.evaluate(node => {
    const result = node.querySelector('[data-hcv-subagent-result]')
    const feed = node.querySelector('[data-hcv-subagent-feed]')
    const paragraph = result.querySelector('p')
    const table = result.querySelector('table')
    const styles = element => {
      const css = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height,
        font: css.fontFamily, size: css.fontSize, lineHeight: css.lineHeight, weight: css.fontWeight,
        color: css.color, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
    }
    return {
      pane: styles(node), feed: styles(feed), result: styles(result), paragraph: styles(paragraph),
      activity: styles(node.querySelector('[data-hcv-subagent-activity-log] summary')),
      table: styles(table), tableScroll: styles(table.parentElement),
      actions: styles(node.querySelector('[data-hcv-subagent-actions]')),
    }
  })
}

async function verifyAgentResponse({ page, expect, pane, result, facts }) {
  await expect(result.getByRole('link', { name: 'описание проверки' })).toHaveAttribute('href', 'https://example.invalid/review')
  await expect(result.getByRole('heading', { name: 'Проверка файла' })).toBeVisible()
  await expect(result.locator('pre')).toContainText('const result = "fixture"')
  await expect(pane.locator('[data-hcv-subagent-actions] time')).toHaveAttribute('datetime', /T.*Z$/)

  const scroll = result.locator('[data-hcv-table-scroll]')
  await expect(scroll).toHaveAttribute('data-hcv-table-overflow', '')
  await page.evaluate(() => {
    const exec = document.execCommand.bind(document)
    document.execCommand = (command, ...args) => {
      if (command !== 'copy') return exec(command, ...args)
      const clipboardData = new DataTransfer()
      window.dispatchEvent(new ClipboardEvent('copy', { clipboardData, cancelable: true }))
      window.fixtureSubagentTableCopy = clipboardData.getData('text/plain')
      return true
    }
  })
  await scroll.getByRole('button', { name: 'Копировать таблицу' }).press('Enter')
  await expect.poll(() => page.evaluate(() => window.fixtureSubagentTableCopy)).toContain('**Первая.**')
  const expand = scroll.getByRole('button', { name: 'Развернуть таблицу' })
  await expand.press('Enter')
  const modal = page.getByRole('dialog', { name: 'Предпросмотр таблицы' })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('cell', { name: 'Готово' })).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(expand).toBeFocused()
  await scroll.evaluate(node => { node.scrollLeft = node.scrollWidth })
  await expect.poll(() => scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
  assert(facts.narrowResponse.feed.scrollWidth <= facts.narrowResponse.feed.clientWidth, 'The response does not scroll sideways as a whole')
}

async function verifyTabHeader({ page, expect, agents, screenshot, before }) {
  await agents.click()
  const tab = page.locator(summaryPane('agents'))
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const strip = tab.locator('xpath=ancestor::div[@data-zone-tabstrip][1]')
  const close = tab.getByRole('button', { name: 'Закрыть', exact: true })
  const plus = strip.getByRole('button', { name: 'Добавить вкладку', exact: true })
  await expect(plus).toBeVisible()
  const facts = await tab.evaluate(node => {
    const rect = element => element?.getBoundingClientRect().toJSON()
    const zone = node.closest('[data-tree-group]')
    const header = node.closest('[data-panel-header]')
    const strip = node.closest('[data-zone-tabstrip]')
    const seam = zone.parentElement.querySelector(':scope > [data-sash-overlap="trailing"] > span')
    const close = node.querySelector(':scope > span > button')
    const plus = strip.querySelector('[data-hcv-summary-add-tab]')
    const props = element => {
      const style = getComputedStyle(element)
      return { fill: style.backgroundColor, outline: style.boxShadow, radius: style.borderRadius, opacity: style.opacity }
    }
    return {
      frame: rect(header), strip: rect(strip), tab: rect(node), close: rect(close), plus: rect(plus),
      bounds: props(node), seam: seam && props(seam), closeIcon: getComputedStyle(close, '::before').width,
      headerLine: getComputedStyle(header, '::after').backgroundColor,
      mainFrame: rect(document.querySelector('[data-tree-group="grp-main"] > [data-panel-header]')),
    }
  })
  if (!before) {
    assert.equal(facts.frame.height, 48)
    assert.equal(facts.tab.height, 30)
    assert.equal(facts.tab.width, 220)
    assert(Math.abs(facts.tab.x - facts.frame.x - 7) <= 1)
    assert.equal(facts.bounds.fill, 'rgb(42, 42, 42)')
    assert.match(facts.bounds.outline, /rgb\(76, 76, 76\)/)
    assert.equal(facts.headerLine, 'rgb(43, 43, 43)')
    assert.equal(facts.seam?.opacity, '1')
    assert.equal(facts.closeIcon, '14px')
    assert(Math.abs(facts.tab.right - (facts.close.x + facts.close.width / 2) - 16) < 1)
    assert(Math.abs(facts.plus.x + facts.plus.width / 2 - facts.tab.right - 21) < 1)
  }
  await page.mouse.move(0, 0)
  const x = Math.max(0, facts.frame.x - 16)
  const y = Math.max(0, facts.frame.y - 20)
  await screenshot('tab-strip.png', { clip: { x, y, width: facts.frame.right - x, height: 160 } })
  await plus.click()
  const menu = page.locator('[data-hcv-summary-picker]')
  await expect(menu.getByRole('menuitem', { name: 'Источники', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(plus).toBeFocused()
  await close.click()
  await expect(tab).toHaveCount(0)
  await expect(agents).toBeVisible()
  return facts
}
