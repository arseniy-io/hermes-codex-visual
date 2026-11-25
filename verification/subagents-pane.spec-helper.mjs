import assert from 'node:assert/strict'
import { captureDisclosureMotion } from './disclosure-motion.spec-helper.mjs'

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
  const goal = await first.locator(name).getAttribute('title')
  assert((await first.getAttribute('aria-label')).startsWith(title + '. ' + goal))
  const src = await image.getAttribute('src')
  assert(src.startsWith('data:image/svg+xml,'))
  await screenshot('subagents-pane-active.png')
  await first.press('Enter')
  await expect(pane.locator(details).locator('h2')).toHaveText(title)
  const back = pane.getByRole('button', { name: 'Назад к субагентам' })
  await expect(back).toBeFocused()
  await expect(back).toHaveCSS('height', '24px')
  await expect(pane.locator(details).locator(avatar)).toHaveAttribute('src', src)
  const task = pane.locator('[data-hcv-agent-message="user"]').first()
  await expect(task).toBeVisible()
  // The stored task may include the native delegate preamble; the goal is
  // preserved verbatim inside that actual user row, not a summary label.
  await expect(task).toContainText(goal)
  await expect(pane.locator('[data-hcv-agent-transcript] > [data-hcv-agent-message]').first()).toHaveAttribute('data-hcv-agent-message', 'user')
  await expect(task).not.toContainText('--- Attached Context ---')
  await expect(pane.locator('[data-hcv-subagent-task]')).toHaveCount(0)
  await back.press('Enter')
  await expect(first).toBeFocused()
  await first.press('Enter')
  await expect(pane.locator(details).locator('h2')).toHaveText(title)
  return { pane, title, src, goal }
}

export async function verifyFinishedSubagents({ app, page, expect, screenshot, selection, response }) {
  const { pane, title, src, goal } = selection
  const done = group(pane, 'done')
  const entry = done.locator(rows).filter({ has: page.getByTitle(goal, { exact: true }) })
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
  await expect(detail.locator('[data-hcv-subagent-model]')).toContainText('mock-model')
  await expect(result).toContainText(response)
  await expect(result).toHaveAttribute('data-source', 'transcript')
  await expect(result.locator('[data-hcv-agent-transcript]')).toBeVisible()
  await expect(result.locator('[data-hcv-agent-message="user"]').first()).toContainText(goal)
  await expect(detail.getByRole('button', { name: 'Копировать' })).toBeVisible()
  if (process.env.HERMES_VISUAL_FOCUS === 'subagents-pane') {
    const command = result.locator('[data-hcv-agent-tool-toggle]').filter({ hasText: 'echo fixture-child-output' })
    await expect(command).toHaveCount(1)
    await expect(command).toHaveAttribute('aria-expanded', 'false')
    await command.click()
    const shell = result.locator('[data-hcv-terminal-details="shell"]')
    await expect(shell.locator('[data-hcv-terminal-code]')).toContainText('echo fixture-child-output')
    await expect(shell.locator('[data-hcv-terminal-output]')).toContainText('fixture-child-output')
    await expect(shell.locator('[data-hcv-terminal-status]')).toHaveText('Успех')
    await command.click()
    await expect(shell).toHaveCount(0)
  }
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
  await expect(pane.getByTitle(prior, { exact: true })).toHaveCount(0)
  await expect(group(pane, 'active').locator('h2')).toHaveText('Активные · 0')
  await expect(group(pane, 'done')).toHaveCount(0)
}

// Codex HBzQ/dqpP and 0729.steps values, shared with the main transcript.
// The lifecycle fixture supplies both exit0 and exit7 without running a shell.
export async function verifySubagentToolGeometry({ page, expect, detail, toolGroup }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const children = toolGroup.locator('..').locator(':scope > [data-hcv-agent-tool-children]')
  const checkMotion = async (panel, phase, trigger) => {
    const value = await captureDisclosureMotion({ expect, page, scope: detail, panel, phase, trigger })
    assert.deepEqual({ duration: value.duration, easing: value.easing },
      { duration: 300, easing: 'cubic-bezier(0.19, 1, 0.22, 1)' })
    if (phase === 'closing') await expect(panel).toHaveCount(0)
    else await expect(panel).not.toHaveAttribute('data-hcv-activity-motion')
  }
  await expect(toolGroup).toHaveCSS('font-size', '14px')
  await expect(toolGroup).toHaveCSS('line-height', '21px')
  await expect(toolGroup).toHaveCSS('color', 'rgba(255, 255, 255, 0.5)')
  await expect(toolGroup.locator('[data-hcv-agent-tool-summary]')).toHaveCSS('gap', '8px')
  await expect(toolGroup).toHaveCSS('gap', '4px')
  await expect(toolGroup.locator('[data-hcv-agent-tool-caret] > span')).toHaveCSS('width', '14px')
  await expect(toolGroup).toHaveAttribute('aria-expanded', 'false')
  await checkMotion(children, 'opening', () => toolGroup.click())
  await expect(children).toHaveCSS('padding-inline-start', '24px')
  await expect(children).toHaveCSS('gap', '12px')
  const guide = await children.evaluate(node => {
    const css = getComputedStyle(node, '::before')
    return { left: css.insetInlineStart, top: css.insetBlockStart, color: css.borderInlineStartColor }
  })
  assert.deepEqual(guide, { left: '8px', top: '12px', color: 'rgba(255, 255, 255, 0.08)' })
  const child = children.locator(':scope > [data-hcv-agent-tool] > button').first()
  const x = await children.evaluate(node => node.getBoundingClientRect().left)
  assert(Math.abs((await child.boundingBox()).x - x - 24) < .01)
  const repeat = children.locator(':scope > [data-hcv-agent-tool-repeat]')
  await expect(repeat).toHaveCount(1)
  const repeatToggle = repeat.locator(':scope > [data-hcv-agent-tool-toggle]')
  await expect(repeatToggle).toHaveText('Fetch file · 3 вызова')
  await expect(repeatToggle).toHaveAttribute('aria-expanded', 'false')
  // Repeats occupy the original range; success/failure commands stay after it.
  const order = await children.locator(':scope > [data-hcv-agent-tool] > button').allTextContents()
  assert.deepEqual(order, ['Fetch file · 3 вызова', 'node tools/check-agent.mjs',
    'Command failed (node tools/check-agent-fail.mjs)'])
  const repeatedChildren = repeat.locator(':scope > [data-hcv-agent-tool-children]')
  await checkMotion(repeatedChildren, 'opening', () => repeatToggle.click())
  await expect(repeatedChildren.locator(':scope > [data-hcv-agent-tool]')).toHaveCount(3)
  const firstCall = repeatedChildren.locator(':scope > [data-hcv-agent-tool] > button').first()
  const raw = firstCall.locator('..').locator('[data-hcv-agent-tool-detail]')
  await checkMotion(raw, 'opening', () => firstCall.click())
  await expect(raw.locator('[data-hcv-agent-tool-args] pre')).toContainText('"path": "README.md"')
  await expect(raw.locator('[data-hcv-agent-tool-args] pre')).toContainText('keep-user-label')
  await expect(raw.locator('[data-hcv-agent-tool-args] pre')).not.toContainText('hermes_tool_labels')
  await expect(raw).toContainText('Saved README content.')
  await checkMotion(repeatedChildren, 'closing', () => repeatToggle.click())
  await expect(repeatedChildren).toHaveCount(0)
  const failed = children.getByRole('button', { name: 'Command failed (node tools/check-agent-fail.mjs)', exact: true })
  await expect(failed).toBeVisible()
  const failure = failed.locator('..').locator('[data-hcv-terminal-details="shell"]')
  await checkMotion(failure, 'opening', () => failed.click())
  await expect(failure.locator('[data-hcv-terminal-status]')).toHaveText('Код выхода 7')
  await expect(failure).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.08)')
  await expect(failure).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.16)')
  const copy = failure.locator('button[data-hcv-terminal-copy="command"]')
  await failure.locator('[data-hcv-terminal-code]').hover()
  await copy.hover()
  const tip = page.locator('[data-hcv-terminal-copy-tip]')
  await expect(tip).toHaveText('Копировать команду')
  await expect(tip).toBeVisible()
  await expect(copy).not.toHaveAttribute('title')
  await expect(page.locator('[data-slot="tooltip-content"]:visible')).toHaveCount(0)
  await checkMotion(failure, 'closing', () => failed.click())
  await expect(failure).toHaveCount(0)
  await expect(tip).toBeHidden()
  await checkMotion(children, 'closing', () => toolGroup.click())
  await expect(children).toHaveCount(0)
  await checkMotion(children, 'opening', () => toolGroup.click())
  return { font: '14/21', labelGap: 8, caretGap: 4, indent: 24, guide: 8, exitCode: 7, sharedMotion: true, sharedTooltip: true, repeatedMcpCalls: 3, uiLabelsHidden: true }
}
