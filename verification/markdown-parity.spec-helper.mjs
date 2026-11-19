import assert from 'node:assert/strict'

export async function verifyMarkdownParity({ app, page, expect, projectChat, screenshot,
  openThemeSettings, closeSettings, themeCard, before }) {
  await projectChat('Проверка каталога').click()
  const chat = page.locator('[data-chat-surface][data-session-anchor="workspace"]:visible')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'kak-oplatit-zarubezhny-servis' })
  await expect(turn).toBeVisible()
  const inline = turn.locator('code').filter({ hasText: 'kak-oplatit-zarubezhny-servis' })
  const github = turn.getByRole('link', { name: 'Программа поиска возможностей' })
  const local = turn.getByRole('link', { name: 'Локальная страница' })
  await expect(inline).toBeVisible()
  await expect(github).toBeVisible()
  await inline.scrollIntoViewIfNeeded()
  await page.mouse.move(250, 100)

  const measure = async () => ({
    code: await inline.evaluate(node => {
      const css = getComputedStyle(node)
      const parent = getComputedStyle(node.parentElement)
      return { html: node.outerHTML, font: css.fontFamily, size: css.fontSize, weight: css.fontWeight,
        line: css.lineHeight, padding: css.padding, radius: css.borderRadius, background: css.backgroundColor,
        color: css.color, parentSize: parent.fontSize, parentLine: parent.lineHeight }
    }),
    github: await github.evaluate(node => {
      const css = getComputedStyle(node)
      const icon = node.querySelector('svg')
      const iconStyle = icon && getComputedStyle(icon)
      return { html: node.outerHTML, color: css.color, weight: css.fontWeight, decoration: css.textDecorationLine,
        icon: iconStyle && { width: iconStyle.width, height: iconStyle.height, margin: iconStyle.marginInlineEnd,
          opacity: iconStyle.opacity, verticalAlign: iconStyle.verticalAlign } }
    }),
    block: await turn.locator('pre code').first().evaluate(node => {
      const css = getComputedStyle(node)
      return { font: css.fontFamily, size: css.fontSize, background: css.backgroundColor }
    }),
  })
  const dark = await measure()
  console.log('Markdown measurements', JSON.stringify(dark))
  await screenshot('markdown-dark.png')
  if (before) return { dark }

  assert.match(dark.code.font, /^ui-monospace/i)
  assert.equal(dark.code.size, '12.88px')
  assert.equal(dark.code.padding, '1px 6px')
  assert.equal(dark.code.radius, '6px')
  assert.equal(dark.code.parentSize, '14px')
  assert.equal(dark.code.parentLine, '22.75px')
  assert.equal(dark.github.color, 'rgb(153, 206, 255)')
  assert.equal(dark.github.weight, '500')
  assert.equal(dark.github.icon.width, '16px')
  assert.equal(dark.github.icon.height, '16px')
  assert.equal(dark.github.icon.opacity, '1')
  assert.notEqual(dark.block.font, dark.code.font)
  await github.hover()
  await expect(github).toHaveCSS('text-decoration-line', 'underline')
  await expect(github).toHaveAttribute('href', 'https://github.com/example/repo/blob/main/tool.py')
  // Capture the native browser action without contacting an outside website.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('hermes:openExternal')
    ipcMain.handle('hermes:openExternal', (_, url) => { globalThis.hcvMarkdownLink = url })
  })
  await github.click({ modifiers: ['Control'] })
  await expect.poll(() => app.evaluate(() => globalThis.hcvMarkdownLink))
    .toBe('https://github.com/example/repo/blob/main/tool.py')

  await page.setViewportSize({ width: 760, height: 760 })
  await expect(inline).toBeVisible()
  await screenshot('markdown-narrow.png')
  const narrow = await turn.evaluate(node => {
    const prose = [...node.querySelectorAll('.aui-md')].find(item => item.textContent.includes('kak-oplatit-zarubezhny-servis'))
    const bounds = prose.getBoundingClientRect()
    const elements = [...prose.querySelectorAll(':not(pre) > code, a.ref[href^="http"]')]
    return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, left: bounds.left, right: bounds.right,
      fragments: elements.flatMap(element => [...element.getClientRects()].map(rect => ({
        text: element.textContent, left: rect.left, right: rect.right,
      }))) }
  })
  console.log('Narrow markdown', JSON.stringify(narrow))
  assert(narrow.fragments.every(rect => rect.left >= narrow.left - 1 && rect.right <= narrow.right + 1))
  await page.setViewportSize({ width: 1440, height: 920 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  const light = await measure()
  assert.equal(light.github.color, 'rgb(1, 105, 204)')
  await screenshot('markdown-light.png')
  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  const native = await measure()
  assert.notEqual(native.code.font, dark.code.font)
  assert.notEqual(native.github.color, light.github.color)
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await local.click()
  await expect(page.locator('[data-preview-browser]')).toBeVisible({ timeout: 12000 })
  return { dark, light, native, narrow, githubNativeAction: true, localPreviewOpened: true }
}
