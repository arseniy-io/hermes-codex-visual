import assert from 'node:assert/strict'

const parent = '20261108_124503_aab003'
const title = 'Сохранённые агенты'
const cases = [
  { worker: 'sa-0-cafe1101', child: '20261121_100001_1e9a01', name: 'Saved history audit',
    goal: 'Проверь сохранённую историю именованного агента. '.repeat(12) + 'Не меняй исходные файлы.',
    report: 'Именованный сохранённый агент завершил проверку.' },
  { worker: 'sa-0-cafe1102', child: '20261121_100002_1e9a02', name: 'Субагент',
    goal: 'Проверь старую историю, где имя никогда не сохранялось. '.repeat(12) + 'Не меняй исходные файлы.',
    report: 'Старый агент без имени завершил проверку.' },
]

export async function verifyLegacyAgentHistory({ page, expect, projectChat, screenshot }) {
  await projectChat(title).click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  await expect(chat.getByText('Сохранённый результат 2 получен.', { exact: true })).toBeVisible({ timeout: 30000 })
  const steps = chat.locator('button[data-hcv-turn-line]')
  for (let index = 0; index < await steps.count(); index++) {
    const button = steps.nth(index)
    if (await button.getAttribute('aria-expanded') === 'false') await button.click()
  }
  const probe = await page.evaluate(async parent => window.hermesDesktop.api({ profile: 'default', passive: true,
    timeoutMs: 8000, path: '/api/plugins/hermes-codex-visual/turn-timeline?session_id=' + parent }), parent)
  assert.equal(probe.sessionId, parent)
  assert.equal(probe.receipts.length, 2)
  const projected = probe.receipts.flatMap(receipt => receipt.agents)
  const icons = new Map()
  for (const [index, item] of cases.entries()) {
    const canonical = projected.find(agent => agent.subagent_id === item.worker)
    assert(canonical, 'Expected actual backend receipt projection for ' + item.worker)
    assert.equal(canonical.child_session_id, item.child)
    assert.equal(canonical.task_name, index === 0 ? 'saved_history_audit' : undefined)
    assert.equal(canonical.agent_path, index === 0 ? '/root/saved_history_audit' : undefined)
    const row = chat.locator(`[data-hcv-agent-activity="completed"][data-hcv-agent-ids*='"${item.worker}"']`)
    await expect(row).toHaveCount(1, { timeout: 15000 })
    await expect(row).toHaveText(item.name + ' завершил(-и) работу')
    const image = row.locator('img')
    await expect(image).toBeVisible()
    await expect(image).toHaveCSS('width', '16px')
    await expect(image).toHaveCSS('height', '16px')
    const src = await image.getAttribute('src')
    assert(src?.startsWith('data:image/svg+xml,'), 'Expected canonical child avatar')
    icons.set(item.worker, src)
  }
  await screenshot('legacy-agents-restored.png')
  for (const item of cases) {
    const row = chat.locator(`[data-hcv-agent-activity="completed"][data-hcv-agent-ids*='"${item.worker}"']`)
    await row.locator(`[data-hcv-agent-link="${item.worker}"][data-hcv-agent-name]`).click()
    const detail = page.locator('[data-hcv-subagents-pane]:visible [data-hcv-subagent-detail]')
    await expect(detail.locator('h2')).toHaveText(item.name)
    await expect(detail.locator('[data-hcv-subagent-model]')).toHaveText('GPT-6.1 Sol · Max')
    await expect(detail.locator('[data-hcv-agent-message="user"]').first()).toHaveText(item.goal)
    await expect(detail.locator('[data-hcv-agent-message="assistant"] .aui-md').last()).toHaveText(item.report)
    await expect(detail).not.toContainText('Compact identity projection.')
    await screenshot(item.worker === cases[0].worker ? 'legacy-agent-named-pane.png' : 'legacy-agent-unnamed-pane.png')
    await detail.getByRole('button', { name: 'Назад к субагентам' }).click()
  }
  // A fresh restore must reproduce the same exact icons and saved names.
  await projectChat('Ревью интерфейса').click()
  await projectChat(title).click()
  for (const item of cases) {
    const row = chat.locator(`[data-hcv-agent-activity="completed"][data-hcv-agent-ids*='"${item.worker}"']`)
    await expect(row).toHaveText(item.name + ' завершил(-и) работу')
    await expect(row.locator('img')).toHaveAttribute('src', icons.get(item.worker))
  }
  await projectChat('Проверка каталога').click()
  return { actualStoredReceipts: 2, childIdentityFromModelConfig: true, unnamedHistoryRetainsNoInventedName: true,
    stableCanonicalChildAvatars: true, nativeAncestryRpcAndRawChildTranscript: true,
    receiptRowIds: probe.receipts.map(receipt => receipt.row_id) }
}
