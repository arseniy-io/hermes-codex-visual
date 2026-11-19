import assert from 'node:assert/strict'

export async function verifyDraftConsent({ page, expect, chat, screenshot }) {
  const bar = chat.locator('[data-hcv-draft-bar]')
  const dock = chat.locator('[data-slot="composer-dock"]')
  const surface = dock.locator('[data-slot="composer-surface"]')
  const input = surface.locator('[data-slot="composer-rich-input"]')
  const consent = dock.locator('[data-slot="status-row"]:has(> .status-row-icon > .codicon-graph)')
  const grip = dock.locator('[data-slot="status-drawer-toggle"]')
  const project = bar.getByRole('button', { name: 'Выбрать проект', exact: true })
  const menu = page.locator('[data-hcv-draft-menu="projects"]:popover-open')
  const baseline = process.env.HERMES_VISUAL_DRAFT_CONSENT_BEFORE === '1'
  const capture = async name => {
    const box = await dock.boundingBox()
    const view = page.viewportSize()
    const x = Math.max(0, Math.floor(box.x - 8))
    const y = Math.max(0, Math.floor(box.y - 8))
    await screenshot(name, { clip: { x, y,
      width: Math.min(view.width, Math.ceil(box.x + box.width + 8)) - x,
      height: Math.min(view.height, Math.ceil(box.y + box.height + 8)) - y } })
  }
  const measure = () => dock.evaluate(dock => {
    const bar = dock.querySelector('[data-hcv-draft-bar]')
    const row = dock.querySelector('[data-slot="status-row"]:has(> .status-row-icon > .codicon-graph)')
    const card = row?.closest('[data-slot="composer-status-stack"]')?.firstElementChild
    const surface = dock.querySelector('[data-slot="composer-surface"]')
    const box = node => {
      const r = node.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const a = box(bar), b = box(card), c = box(surface)
    const buttons = [...row.querySelectorAll('button')]
    const controls = [...bar.querySelectorAll(':scope > button')]
    return {
      bar: a, card: b, surface: c,
      order: [...dock.children].map(node => node.matches('[data-hcv-draft-bar]') ? 'bar'
        : node.matches('.status-drawer') ? 'drawer' : node.getAttribute('data-slot') || 'other'),
      colors: [bar, card, surface].map(node => getComputedStyle(node).backgroundColor),
      radii: [card, surface].map(node => getComputedStyle(node).borderTopLeftRadius),
      fits: buttons.every(node => {
        const rect = node.getBoundingClientRect()
        return rect.left >= b.left - 1 && rect.right <= b.right + 1 && rect.bottom <= b.bottom + 1
      }),
      barButtonsAccessible: controls.every(node => {
        const rect = node.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return node === hit || node.contains(hit)
      }),
    }
  })
  await expect(consent).toBeVisible({ timeout: 20000 })
  const before = await measure()
  console.log('Draft consent initial geometry', JSON.stringify(before))
  await capture(baseline ? 'draft-consent-before.png' : 'draft-consent-dark.png')
  if (baseline) return { baseline: true, initial: before }

  const check = data => {
    assert(data.order.indexOf('bar') < data.order.indexOf('drawer'))
    assert(data.order.indexOf('drawer') < data.order.indexOf('composer-root'))
    assert(data.bar.top < data.card.top && data.card.top < data.surface.top)
    assert(Math.abs(data.card.bottom - data.surface.top) < 1, 'Consent card should meet the composer')
    assert(Math.abs(data.card.left - data.surface.left) < 1)
    assert(Math.abs(data.card.width - data.surface.width) < 1)
    assert.equal(data.colors[1], data.colors[2])
    assert.equal(data.radii[1], '0px')
    assert(data.fits, 'Consent actions must fit')
    assert(data.barButtonsAccessible, 'Project bar buttons must remain clickable')
  }
  check(before)
  await project.click()
  await menu.getByRole('button', { name: 'Работать без проекта' }).click()
  await expect(project).toHaveText('Без проекта')
  await expect(consent).toBeVisible()
  check(await measure())
  await input.fill('Черновик при проверке плашки.')
  await project.click()
  await menu.getByRole('button', { name: 'Тестовый проект', exact: true }).click()
  await expect(project).toHaveText('Тестовый проект')
  await expect(consent).toBeVisible()
  await expect(input).toHaveText('Черновик при проверке плашки.')
  const withProject = await measure()
  check(withProject)
  await capture('draft-consent-project.png')
  await project.click()
  await menu.getByRole('button', { name: 'Работать без проекта' }).click()
  await expect(project).toHaveText('Без проекта')
  await expect(consent).toBeVisible()
  await expect(input).toHaveText('Черновик при проверке плашки.')
  check(await measure())

  await consent.getByRole('button', { name: 'Подробнее', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'false')
  await expect(consent).toBeHidden()
  await expect(bar).toBeVisible()
  await expect(input).toHaveText('Черновик при проверке плашки.')
  await capture('draft-consent-collapsed.png')
  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  await expect(consent).toBeVisible()
  check(await measure())

  await page.setViewportSize({ width: 760, height: 820 })
  await expect.poll(async () => (await measure()).fits).toBe(true)
  const narrow = await measure()
  check(narrow)
  await capture('draft-consent-narrow.png')

  await page.setViewportSize({ width: 1440, height: 920 })
  await page.keyboard.press('Control+,')
  await page.getByText(/^(Внешний вид|Appearance)$/).first().click()
  await page.getByText(/^(Тема|Theme)$/).first().click()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await page.keyboard.press('Escape')
  await expect(consent).toBeVisible()
  const light = await measure()
  check(light)
  await capture('draft-consent-light.png')
  await page.keyboard.press('Control+,')
  await page.getByText(/^(Внешний вид|Appearance)$/).first().click()
  await page.getByText(/^(Тема|Theme)$/).first().click()
  await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'dark')

  await consent.getByRole('button', { name: 'Нет, спасибо', exact: true }).click()
  await expect(consent).toHaveCount(0)
  await expect(bar).toBeVisible()
  await expect(input).toHaveText('Черновик при проверке плашки.')
  await expect(surface).toHaveCSS('border-top-left-radius', '22px')
  await capture('draft-consent-dismissed.png')
  await input.fill('')
  console.log('Draft consent checked geometry', JSON.stringify({ dark: before, narrow, light }))
  return { baseline: false, dark: before, withProject, narrow, light }
}
