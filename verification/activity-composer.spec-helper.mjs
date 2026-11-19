import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

async function capture(page, screenshot, name, locator, padding = 10) {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  const x = Math.max(0, Math.floor(box.x - padding))
  const y = Math.max(0, Math.floor(box.y - padding))
  await screenshot(name, { clip: {
    x, y,
    width: Math.min(viewport.width, Math.ceil(box.x + box.width + padding)) - x,
    height: Math.min(viewport.height, Math.ceil(box.y + box.height + padding)) - y,
  } })
}

export async function verifyActivityComposer({ page, expect, projectChat, screenshot, before, openThemeSettings, closeSettings }) {
  if (process.env.HERMES_VISUAL_DRAFT_ONLY === '1') {
    const { verifyDraftConsent } = await import('./draft-consent.spec-helper.mjs')
    const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible').first()
    const draftConsent = await verifyDraftConsent({ page, expect, chat, screenshot })
    return { draftConsent }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await projectChat('Время выполнения').click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]').first()
  const dock = chat.locator('[data-slot="composer-dock"]')
  const surface = dock.locator('[data-slot="composer-surface"]')
  const consent = dock.locator('[data-slot="status-row"]:has(> .status-row-icon > .codicon-graph)')
  const grip = dock.locator('[data-slot="status-drawer-toggle"]')
  const turn = (index) => chat.locator('[data-slot="aui_turn-pair"]').filter({
    hasText: `Проверка ${index} завершена.`,
  })
  const disclosure = (index) => turn(index).locator('button[data-hcv-turn-line]')
  await expect(consent).toBeVisible()
  await expect(disclosure(1)).toHaveText(before ? 'Шаги работы' : 'Выполнено за 1 мин 28 с')
  await turn(1).scrollIntoViewIfNeeded()
  await page.mouse.move(280, 120)
  await capture(page, screenshot, 'elapsed.png', turn(1))

  const elapsed = await disclosure(1).evaluate((node) => {
    const text = getComputedStyle(node)
    const arrow = getComputedStyle(node, '::after')
    const group = node.parentElement
    const reply = group.querySelector('.aui-md.prose p')
    const answer = getComputedStyle(reply)
    const prompt = group.closest('[data-slot="aui_turn-pair"]').querySelector('[data-slot="aui_user-inline-text"]')
    return {
      color: text.color, font: text.fontFamily, size: text.fontSize, weight: text.fontWeight,
      lineHeight: text.lineHeight, gap: text.gap, padding: text.padding, border: text.borderBottomWidth,
      arrowSize: arrow.width, arrowDuration: arrow.transitionDuration, arrowMask: arrow.maskImage,
      answer: { color: answer.color, size: answer.fontSize, lineHeight: answer.lineHeight,
        gap: reply.getBoundingClientRect().top - node.getBoundingClientRect().bottom },
      prompt: { color: getComputedStyle(prompt).color, size: getComputedStyle(prompt).fontSize },
    }
  })
  const mask = decodeURIComponent(elapsed.arrowMask.match(/data:image\/svg\+xml,([^"\)]+)/)[1])
  elapsed.arrowSha256 = createHash('sha256').update(mask).digest('hex')
  delete elapsed.arrowMask

  const heightAndFill = () => consent.evaluate((row) => {
    const dock = row.closest('[data-slot="composer-dock"]')
    const card = row.closest('[data-slot="composer-status-stack"]').firstElementChild
    const composer = dock.querySelector('[data-slot="composer-surface"]')
    const toggle = dock.querySelector('[data-slot="status-drawer-toggle"]')
    const cardRect = card.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    const text = row.querySelector('.status-row-content > span')
    const actions = [...row.querySelectorAll('button')]
    return {
      inset: cardRect.left - composerRect.left, widthDelta: cardRect.width - composerRect.width,
      seam: composerRect.top - cardRect.bottom,
      fills: [getComputedStyle(card).backgroundColor, getComputedStyle(composer).backgroundColor],
      radii: [getComputedStyle(card).borderTopLeftRadius, getComputedStyle(composer).borderTopLeftRadius,
        getComputedStyle(composer).borderBottomLeftRadius],
      gripOpacity: getComputedStyle(toggle).opacity,
      textWrap: getComputedStyle(text).whiteSpace,
      fits: text.scrollWidth <= text.clientWidth + 1 && actions.every((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left >= cardRect.left && rect.right <= cardRect.right && rect.bottom <= cardRect.bottom + 1
      }),
      actionSizes: actions.map(button => getComputedStyle(button).minHeight),
    }
  })
  const composer = await heightAndFill()
  await capture(page, screenshot, 'composer.png', dock, 6)
  console.log('Measured activity and composer', JSON.stringify({ elapsed, composer }))
  if (before) return { elapsed, composer }

  assert.equal(elapsed.color, 'rgba(255, 255, 255, 0.498)')
  assert.match(elapsed.font, /Segoe UI/)
  assert.equal(elapsed.size, '14px')
  assert.equal(elapsed.weight, '430')
  assert.equal(elapsed.lineHeight, '21px')
  assert.equal(elapsed.border, '0px')
  assert.equal(elapsed.padding, '0px')
  assert.equal(elapsed.gap, '4px')
  assert.equal(elapsed.arrowSize, '14px')
  assert.equal(elapsed.arrowDuration, '0.15s')
  assert.equal(elapsed.arrowSha256, 'ee88d4922f70be521afb12312993e412afe55f8bee71a33bc49c62a734fd2a73')
  assert.deepEqual([elapsed.answer.size, elapsed.prompt.size], ['14px', '14px'])
  assert.deepEqual([elapsed.answer.color, elapsed.prompt.color], ['rgb(223, 223, 223)', 'rgb(223, 223, 223)'])
  assert.equal(elapsed.answer.gap, 16)
  await expect(disclosure(2)).toHaveText('Выполнено за 2 ч 15 мин')
  await expect(disclosure(3)).toHaveText('Выполнено')
  await expect(disclosure(4)).toHaveText('Выполнено за 0 с')

  const details = turn(1).locator('[data-hcv-turn-step]')
  await expect(details.first()).toBeHidden()
  await disclosure(1).click()
  await expect(disclosure(1)).toHaveAttribute('aria-expanded', 'true')
  await expect(details.first()).toBeVisible()
  await expect.poll(() => disclosure(1).evaluate(button => getComputedStyle(button, '::after').transform))
    .toBe('matrix(0, 1, -1, 0, 0, 0)')
  await disclosure(1).click()
  await expect(details.first()).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => disclosure(1).evaluate(button => getComputedStyle(button, '::after').transitionProperty)).toBe('none')

  assert(Math.abs(composer.inset) < 1 && Math.abs(composer.widthDelta) < 1)
  assert(Math.abs(composer.seam) < 1, `Unexpected composer seam ${composer.seam}`)
  assert.equal(composer.fills[0], composer.fills[1])
  assert.deepEqual(composer.radii, ['22px', '0px', '22px'])
  assert.equal(composer.gripOpacity, '0')
  assert.equal(composer.textWrap, 'normal')
  assert(composer.fits)

  await page.setViewportSize({ width: 760, height: 820 })
  await expect.poll(async () => (await heightAndFill()).fits).toBe(true)
  await capture(page, screenshot, 'composer-narrow.png', dock)
  const narrow = await heightAndFill()
  await consent.getByRole('button', { name: 'Подробнее', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const input = surface.locator('[data-slot="composer-rich-input"]')
  await input.fill('Тестовый черновик')
  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'false')
  await expect(consent).toBeHidden()
  await expect(surface).toHaveCSS('border-top-left-radius', '22px')
  await grip.click()
  await expect(grip).toHaveAttribute('aria-expanded', 'true')
  await expect(input).toHaveText('Тестовый черновик')

  await page.setViewportSize({ width: 1440, height: 920 })
  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  const light = await heightAndFill()
  assert.deepEqual(light.fills, ['rgb(245, 245, 245)', 'rgb(245, 245, 245)'])
  assert(light.fits)
  await consent.getByRole('button', { name: 'Нет, спасибо', exact: true }).click()
  await expect(consent).toHaveCount(0)
  await expect(input).toHaveText('Тестовый черновик')
  await expect(surface).toHaveCSS('border-top-left-radius', '22px')
  return { elapsed, composer, narrow, light }
}
