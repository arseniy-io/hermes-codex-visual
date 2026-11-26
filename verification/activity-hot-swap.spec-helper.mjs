import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function measure(turn) {
  return turn.evaluate(root => {
    const prose = text => [...root.querySelectorAll('.aui-md')].find(node => node.textContent.includes(text))
    const rect = node => node.getBoundingClientRect()
    const agent = root.querySelector('button[data-hcv-agent-rows][aria-controls] [data-hcv-agent-activity]')
    const receipt = root.querySelector('[data-slot="aui_background-result"] [data-hcv-agent-activity="completed"]') ||
      root.querySelector('[data-slot="aui_background-result"] button')
    const before = prose('Текст перед запуском агента.')
    const middle = prose('Текст перед уведомлением агента.')
    const after = prose('Текст после уведомления агента.')
    return {
      beforeAgent: rect(agent).top - rect(before).bottom,
      afterAgent: rect(middle).top - rect(agent).bottom,
      beforeReceipt: rect(receipt).top - rect(middle).bottom,
      afterReceipt: rect(after).top - rect(receipt).bottom,
      agent: agent.innerText, receipt: receipt.innerText,
    }
  })
}

export async function verifyActivityHotSwap({ page, expect, projectChat, sandbox, screenshot }) {
  const replacement = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
  assert(replacement, 'Set HERMES_VISUAL_REPLACEMENT_PLUGIN to the new module')
  await projectChat('Интервалы уведомлений').click()
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Проверь интервалы уведомления агента.' })
  const status = turn.locator('button[data-hcv-agent-rows][aria-controls] [data-hcv-agent-activity]')
  const receipt = turn.locator('[data-slot="aui_background-result"]')
  await expect(status).toBeVisible({ timeout: 30000 })
  await expect(receipt).toBeVisible()
  const before = await measure(turn)
  await screenshot('activity-hot-swap-before.png')

  const input = chat.locator('[data-slot="composer-rich-input"]')
  const draft = 'Черновик при обновлении ленты'
  await input.fill(draft)
  const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
  const previousSha256 = sha(plugin)
  const candidateSha256 = sha(replacement)
  const staged = plugin + '.activity-swap-staging'
  fs.copyFileSync(replacement, staged, fs.constants.COPYFILE_EXCL)
  fs.renameSync(staged, plugin)
  await expect(status).toHaveText('Субагент передан(-ы) в работу', { timeout: 30000 })
  await expect(turn.locator('[data-hcv-agent-activity="started"]')).toHaveCount(0)
  const completion = receipt.locator('[data-hcv-agent-activity="completed"]')
  await expect(completion).toHaveText('Субагент завершил(-и) работу')
  await expect(completion.locator('img')).toHaveAttribute('src', await status.locator('img').getAttribute('src'))
  await expect(input).toHaveText(draft)
  const after = await measure(turn)
  assert.deepEqual([after.beforeAgent, after.afterAgent, after.beforeReceipt, after.afterReceipt], [16, 16, 16, 16])
  const report = receipt.locator('button[data-hcv-agent-rows]')
  await report.click()
  await expect(turn.getByText('Отчёт об интервалах.', { exact: true })).toBeVisible()
  await report.click()
  await screenshot('activity-hot-swap-after.png')
  return { previousSha256, candidateSha256, before, after, sameChat: true, draftPreserved: true, reportOpens: true }
}
