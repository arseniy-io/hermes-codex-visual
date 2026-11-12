import assert from 'node:assert/strict'

const panel = '[data-hcv-subagents-pane]:visible'
const avatar = '[data-hcv-subagent-avatar]'
const rows = '[data-hcv-subagent-row]'
const details = '[data-hcv-subagent-detail]'
const name = '[data-hcv-subagent-name]'
const group = (pane, kind) => pane.locator('[data-hcv-subagent-group="' + kind + '"]')

export async function verifyActiveSubagents({ page, expect, screenshot, summary }) {
  const trigger = summary.locator('[data-hcv-open-subagents]')
  await expect(trigger).toBeVisible()
  await trigger.press('Enter')
  const pane = page.locator(panel)
  const active = group(pane, 'active')
  await expect(active.locator('h2')).toContainText('Активные · 3')
  await expect(active.locator(rows)).toHaveCount(3)
  await expect(group(pane, 'done')).toHaveCount(0)
  const first = active.locator(rows).first()
  const image = first.locator(avatar)
  await expect(image).toHaveCSS('width', '24px')
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(16)
  const title = await first.locator(name).textContent()
  const src = await image.getAttribute('src')
  assert(src.startsWith('data:image/svg+xml,'))
  await screenshot('subagents-pane-active.png')
  await first.press('Enter')
  await expect(pane.locator(details).locator('h2')).toHaveText(title)
  const back = pane.getByRole('button', { name: 'Назад к субагентам' })
  await expect(back).toBeFocused()
  await expect(back).toHaveCSS('height', '24px')
  await expect(pane.locator(details).locator(avatar)).toHaveAttribute('src', src)
  await back.press('Enter')
  await expect(first).toBeFocused()
  await first.press('Enter')
  await expect(pane.locator(details).locator('h2')).toHaveText(title)
  return { pane, title, src }
}

export async function verifyFinishedSubagents({ app, page, expect, screenshot, selection, response }) {
  const { pane, title, src } = selection
  const done = group(pane, 'done')
  const entry = done.locator(rows).filter({ has: page.getByText(title, { exact: true }) })
  const detail = pane.locator(details)
  const result = detail.locator('[data-hcv-subagent-result]')
  const back = pane.getByRole('button', { name: 'Назад к субагентам' })
  await expect(detail.locator('h2')).toHaveText(title)
  await expect(result).toContainText(response, { timeout: 40000 })
  await expect(done.locator('h2')).toHaveText('Готово · 3')
  await back.press('Enter')
  await expect(entry).toBeFocused()
  await expect(group(pane, 'active').locator('h2')).toHaveText('Активные · 0')
  await expect(group(pane, 'active')).toContainText('Нет активных субагентов')
  await expect(done.locator(rows)).toHaveCount(3)
  await expect(entry.locator(avatar)).toHaveAttribute('src', src)
  await expect(entry).toHaveCSS('height', '40px')
  await expect(entry).toHaveCSS('border-top-left-radius', '10px')
  await page.mouse.move(0, 0)
  await screenshot('subagents-pane-done.png')
  await entry.click()
  await expect(detail.locator('h2')).toHaveText(title)
  await expect(detail.locator(avatar)).toHaveAttribute('src', src)
  await expect(detail.locator('[data-hcv-subagent-model]')).not.toBeEmpty()
  await expect(result).toContainText(response)
  await expect(detail.getByRole('button', { name: 'Копировать' })).toBeVisible()
  const native = detail.getByRole('button', { name: 'Открыть подробности в Hermes' })
  await expect(native).toBeVisible()
  await screenshot('subagents-pane-detail.png')
  const [watch] = await Promise.all([app.waitForEvent('window', { timeout: 18000 }), native.click()])
  try {
    await expect(watch.locator('[data-chat-surface]').getByText(response, { exact: true }).first()).toBeVisible({ timeout: 18000 })
  } finally {
    await watch.close()
  }
  console.log(JSON.stringify({ subagentResult: await result.getAttribute('data-source'), subagentNativeWatch: true }))
}

export async function verifySubagentsScopeChanged({ page, expect, prior }) {
  const pane = page.locator(panel)
  await expect(pane).toBeVisible()
  await expect(pane.locator(details)).toHaveCount(0)
  await expect(pane.getByText(prior, { exact: true })).toHaveCount(0)
  await expect(group(pane, 'active').locator('h2')).toHaveText('Активные · 0')
  await expect(group(pane, 'done')).toHaveCount(0)
}
