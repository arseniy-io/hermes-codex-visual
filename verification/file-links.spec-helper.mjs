import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export async function verifyFileLinks({ app, page, expect, projectChat, screenshot,
  openThemeSettings, closeSettings, themeCard, before }) {
  await projectChat('Проверка каталога').click()
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Сверил' })
  await expect(turn).toBeVisible()
  const file = turn.locator('span[title$="План-проекта.md"]').first().locator('..')
  await expect(file).toHaveCount(1)
  if (!before) {
    const plan = turn.getByRole('button', { name: 'план проекта', exact: true })
    const notes = turn.getByRole('button', { name: 'рабочие заметки', exact: true })
    await expect(plan).toBeVisible()
    await expect(notes).toBeVisible()
    await expect(turn.locator('[data-hcv-file-reference-control]')).toHaveCount(2)
    await page.mouse.move(0, 0)
    const paragraph = plan.locator('xpath=ancestor::p[1]')
    await expect(paragraph).toHaveText('Сверил план проекта и рабочие заметки.', { useInnerText: true })
    const dark = await plan.evaluate(node => {
      const css = getComputedStyle(node)
      const icon = node.querySelector('[aria-hidden="true"]')
      return { color: css.color, font: css.fontFamily, size: css.fontSize, weight: css.fontWeight,
        display: css.display, label: node.textContent, title: node.title,
        icon: getComputedStyle(icon, '::before').maskImage,
        iconWidth: getComputedStyle(icon, '::before').width,
        iconHeight: getComputedStyle(icon, '::before').height }
    })
    assert.equal(dark.color, 'rgb(153, 206, 255)')
    assert.equal(dark.size, '14px')
    assert.equal(dark.weight, '500')
    assert.equal(dark.iconWidth, '16px')
    assert.equal(dark.iconHeight, '16px')
    assert.match(dark.icon, /^url\(/)
    const encodedSvg = /data:image\/svg\+xml,([^"\)]+)/.exec(dark.icon)?.[1]
    assert(encodedSvg)
    assert.equal(createHash('sha256').update(decodeURIComponent(encodedSvg)).digest('hex'),
      'ff198ffb01ea1aca05915b5ef56d69e8af3e0e8840da414574a15cbf8a426efd')
    const auxiliaryMetrics = await plan.locator('..').locator('[data-hcv-file-reference-secondary]').evaluate(node => {
      const css = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return { width: rect.width, cssWidth: css.width, inlineSize: css.inlineSize, minWidth: css.minWidth,
        padding: css.padding, border: css.borderWidth, margin: css.margin, display: css.display, visibility: css.visibility }
    })
    console.log('File link auxiliary geometry', JSON.stringify(auxiliaryMetrics))
    await expect(turn.getByRole('link', { name: 'справку', exact: true })).toBeVisible()
    await expect(turn.locator('[data-hcv-skill-link]').filter({ hasText: 'инструкцию' })).toBeVisible()
    const delivery = turn.locator('span[title$="План-проекта.md"]').last().locator('..')
    await expect(delivery).not.toHaveAttribute('data-hcv-file-reference', '')
    await expect(delivery).toBeVisible()
    await expect(delivery.getByRole('button', { name: 'Открыть предпросмотр', exact: true })).toBeVisible()

    await paragraph.scrollIntoViewIfNeeded()
    const box = await paragraph.boundingBox()
    const viewport = page.viewportSize()
    const x = Math.max(0, Math.floor(box.x - 12))
    const y = Math.max(0, Math.floor(box.y - 12))
    await screenshot('file-links-after.png', { clip: { x, y,
      width: Math.min(viewport.width, Math.ceil(box.x + box.width + 12)) - x,
      height: Math.min(viewport.height, Math.ceil(box.y + box.height + 12)) - y } })

    await plan.evaluate(node => {
      globalThis.hcvFileKeyTrace = []
      const record = event => globalThis.hcvFileKeyTrace.push({ type: event.type, key: event.key,
        detail: event.detail, prevented: event.defaultPrevented })
      for (const name of ['keydown', 'keyup', 'click']) node.addEventListener(name, record)
      node.parentElement.querySelector(':scope > button:last-child').addEventListener('click', event => {
        globalThis.hcvFileKeyTrace.push({ type: 'native-preview-click', detail: event.detail })
      })
    })
    await plan.click()
    let rendered = page.locator('[data-preview-markdown]')
    if (!(await rendered.isVisible())) await page.getByRole('button', { name: /^предпросмотр$/i }).click()
    await expect(rendered.getByText('Содержимое плана для проверки просмотра.', { exact: true })).toBeVisible()
    await page.keyboard.down('Tab')
    await plan.focus()
    await page.keyboard.up('Tab')
    await expect(plan).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rendered).toBeHidden()
    console.log('File link enter trace', JSON.stringify(await page.evaluate(() => globalThis.hcvFileKeyTrace)))
    const nativePreview = plan.locator('..').locator(':scope > button:last-child')
    await expect(nativePreview).toHaveText('Открыть предпросмотр')
    await page.keyboard.down('Tab')
    await plan.focus()
    await page.keyboard.up('Tab')
    await expect(plan).toBeFocused()
    await page.keyboard.press('Space')
    console.log('File link keyboard trace', JSON.stringify(await page.evaluate(() => globalThis.hcvFileKeyTrace)))
    await expect(rendered).toBeVisible()
    await page.keyboard.down('Tab')
    await plan.focus()
    await page.keyboard.up('Tab')
    await expect(plan).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rendered).toBeHidden()

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('hermes:fs:reveal')
      ipcMain.handle('hermes:fs:reveal', (_, target) => { globalThis.hcvFileReferenceRevealed = target; return true })
    })
    await page.keyboard.down('Tab')
    await plan.focus()
    await page.keyboard.up('Tab')
    const secondary = plan.locator('..').locator('[data-hcv-file-reference-secondary]')
    await expect(secondary).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(secondary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => app.evaluate(() => globalThis.hcvFileReferenceRevealed)).toMatch(/План-проекта\.md$/)

    await page.setViewportSize({ width: 760, height: 760 })
    await expect(plan).toBeVisible()
    const narrow = await paragraph.evaluate(node => {
      const parent = node.getBoundingClientRect()
      return { left: parent.left, right: parent.right,
        links: [...node.querySelectorAll('[data-hcv-file-reference-control]')].flatMap(link =>
          [...link.getClientRects()].map(rect => ({ left: rect.left, right: rect.right }))) }
    })
    assert(narrow.links.every(rect => rect.left >= narrow.left - 1 && rect.right <= narrow.right + 1))
    await page.setViewportSize({ width: 1440, height: 920 })

    await page.emulateMedia({ forcedColors: 'active' })
    await expect(turn.locator('[data-hcv-file-reference-control]')).toHaveCount(0)
    await expect(file).toBeVisible()
    await page.emulateMedia({ forcedColors: 'none' })
    await expect(plan).toBeVisible()
    await openThemeSettings()
    await page.getByText(/^(Светлая|Light)$/).first().click()
    await closeSettings()
    await expect(plan).toHaveCSS('color', 'rgb(1, 105, 204)')
    await openThemeSettings()
    await themeCard('Nous').click()
    await closeSettings()
    await expect(turn.locator('[data-hcv-file-reference-control]')).toHaveCount(0)
    await expect(file).toBeVisible()
    await openThemeSettings()
    await themeCard('Codex').click()
    await closeSettings()
    await expect(plan).toBeVisible()

    const summary = page.locator('[data-hcv-context-card]')
    await summary.getByRole('button', { name: 'Показать все', exact: true }).click()
    const sources = page.locator('[data-hcv-sources-pane]:visible')
    const source = sources.getByRole('button', { name: 'План-проекта.md', exact: true })
    await expect(source).toBeVisible()
    await source.click()
    await expect(plan.locator('..').locator(':scope > button:last-child')).toHaveText('Скрыть')
    return { dark, narrow, filePreviewByMouseAndKeyboard: true, secondaryAction: true,
      explicitDeliveryCard: true, skillPreserved: true, summarySource: true, themeAndForcedColors: true }
  }
  await expect(file).toBeVisible()
  await file.scrollIntoViewIfNeeded()
  const probe = await file.evaluate(card => {
    const native = Object.keys(card).find(key => key.startsWith('__reactFiber$'))
    let fiber = card[native]
    const trace = []
    for (let n = fiber; n && trace.length < 12; n = n.return) {
      const props = n.memoizedProps || {}
      const label = value => typeof value === 'string' ? value
        : Array.isArray(value) ? value.map(label).join('') : value?.props ? label(value.props.children) : ''
      trace.push({ type: typeof n.type === 'string' ? n.type : n.type?.name,
        element: n.stateNode instanceof Element, target: props.target, href: props.href,
        path: props.path, label: label(props.children) })
    }
    return { html: card.outerHTML, display: getComputedStyle(card).display, trace }
  })
  console.log('File reference baseline', JSON.stringify(probe))
  const box = await turn.boundingBox()
  const viewport = page.viewportSize()
  const x = Math.max(0, Math.floor(box.x - 12))
  const y = Math.max(0, Math.floor(box.y - 12))
  await screenshot('file-links-before.png', { clip: { x, y,
    width: Math.min(viewport.width, Math.ceil(box.x + box.width + 12)) - x,
    height: Math.min(viewport.height, Math.ceil(box.y + box.height + 12)) - y } })
  return { probe }
}
