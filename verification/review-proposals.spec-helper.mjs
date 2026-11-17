import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skillTitle = 'Скилл на проверке'
const memoryTitle = 'Память на проверке'
const before = '2. Проверь цену перед публикацией.'
const after = '2. Сверь цену и условия оплаты с первоисточником.'
const note = 'В отчётах по тестовому проекту сначала указывай дату проверки, затем перечисляй подтверждённые результаты.'
const declinedNote = 'Показывай черновые результаты без даты.'

export const seedReviewProposals = `
from tools import write_approval as wa
home = Path(sys.argv[1]).parent
skill = home / 'skills' / 'check-post' / 'SKILL.md'
skill.parent.mkdir(parents=True, exist_ok=True)
skill.write_text('\\n'.join(['---', 'name: check-post', 'description: Проверка черновика поста', '---',
    '# Проверка поста', '', '1. Сверь факты.', ${JSON.stringify(before)}, '']), encoding='utf-8')
wa.stage_write(wa.SKILLS, {
    'action': 'patch', 'name': 'check-post', 'file_path': 'SKILL.md',
    'old_string': ${JSON.stringify(before)}, 'new_string': ${JSON.stringify(after)},
}, summary=wa.skill_gist('patch', 'check-post', file_path='SKILL.md',
    old_string=${JSON.stringify(before)}, new_string=${JSON.stringify(after)}), origin='background_review')
for text in (${JSON.stringify(note)}, ${JSON.stringify(declinedNote)}):
    wa.stage_write(wa.MEMORY, {'action': 'add', 'target': 'user', 'content': text},
        summary='add to user profile: ' + text[:120], origin='background_review')
for index, title, prompt, answer in (
    (1, ${JSON.stringify(skillTitle)}, 'Мы нашли удачный порядок проверки постов.',
     'Предлагаю уточнить шаг проверки цены. Правка скилла ждёт подтверждения.'),
    (2, ${JSON.stringify(memoryTitle)}, 'Запомни формат отчёта для тестового проекта.',
     'Подготовил предложения для памяти.'),
):
    sid = f'20261116_21450{index}_aa002{index}'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, title)
    db.append_message(sid, 'user', prompt)
    db.append_message(sid, 'assistant', answer)
`

export async function verifyReviewProposals({ page, expect, projectChat, screenshot, sandbox, openThemeSettings, closeSettings, themeCard }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const composer = chat.locator('[data-slot="composer-rich-input"]')
  const stock = chat.locator('[data-slot="aui_system-message-root"]')
  const proposals = chat.locator('[data-hcv-proposals]')
  const skillFile = path.join(sandbox.hermesHome, 'skills', 'check-post', 'SKILL.md')
  const profileFile = path.join(sandbox.hermesHome, 'memories', 'USER.md')
  const pending = kind => fs.readdirSync(path.join(sandbox.hermesHome, 'pending', kind)).filter(name => name.endsWith('.json'))
  const send = async message => {
    await composer.fill(message)
    await composer.press('Enter')
  }
  const enter = async control => {
    await control.focus()
    await expect(control).toBeFocused()
    await page.keyboard.press('Enter')
  }
  const capture = async (name, target) => {
    await target.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const rect = await target.boundingBox()
    assert(rect)
    const { width, height } = page.viewportSize()
    const x = Math.max(0, Math.floor(rect.x) - 8)
    const y = Math.max(0, Math.floor(rect.y) - 8)
    await screenshot(name, { clip: {
      x, y, width: Math.min(width, Math.ceil(rect.x + rect.width) + 8) - x,
      height: Math.min(height, Math.ceil(rect.y + rect.height) + 8) - y,
    } })
  }

  const declineTelemetry = page.getByRole('button', { name: 'Нет, спасибо', exact: true }).first()
  if (await declineTelemetry.isVisible()) await declineTelemetry.click()
  await projectChat(skillTitle).click()
  await send('/skills pending')
  if (process.env.HERMES_VISUAL_PROPOSALS_BASELINE === '1') {
    const stockList = stock.filter({ hasText: /Pending skills writes/ })
    await expect(stockList).toBeVisible()
    const [name] = pending('skills')
    await send('/skills diff ' + name.slice(0, -5))
    await expect(stock.getByText(new RegExp(after.replace('.', '\\.'))).first()).toBeVisible()
    await capture('skill-before.png', stock.filter({ hasText: /Pending skill write [0-9a-f]+:/ }))
    await projectChat(memoryTitle).click()
    await send('/memory pending')
    const stockMemory = stock.filter({ hasText: /Pending memory writes/ })
    await expect(stockMemory).toBeVisible()
    await capture('memory-before.png', stockMemory)
    return { baseline: true }
  }

  const skill = proposals.getByRole('region', { name: 'Обновить скилл' })
  const show = skill.getByRole('button', { name: 'Посмотреть правку', exact: true })
  await expect(show).toBeVisible()
  await expect(skill.getByRole('button', { name: 'Принять', exact: true })).toHaveCount(0)
  assert(fs.readFileSync(skillFile, 'utf8').includes(before))
  await enter(show)
  await expect(skill.getByText(before, { exact: true })).toBeVisible()
  await expect(skill.getByText(after, { exact: true })).toBeVisible()
  await expect(stock.getByText(/Review full diff/).first()).toBeHidden()
  await capture('skill.png', skill)
  const measurements = await skill.evaluate(el => {
    const computed = getComputedStyle(el)
    const button = el.querySelector('[data-hcv-proposal-part="accept"]')
    return { background: computed.backgroundColor, radius: computed.borderRadius,
      textSize: getComputedStyle(el.querySelector('[data-hcv-proposal-part="text"]')).fontSize,
      buttonHeight: button.getBoundingClientRect().height }
  })
  await page.setViewportSize({ width: 740, height: 820 })
  const acceptSkill = skill.getByRole('button', { name: 'Принять', exact: true })
  await expect(acceptSkill).toBeVisible()
  assert(await skill.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  await capture('skill-narrow.png', skill)
  await page.setViewportSize({ width: 1440, height: 920 })
  await enter(acceptSkill)
  await expect(skill.getByRole('status')).toHaveText('Предложение принято')
  await expect(skill.getByRole('status')).toBeFocused()
  assert(fs.readFileSync(skillFile, 'utf8').includes(after))
  assert.equal(pending('skills').length, 0)

  await projectChat(memoryTitle).click()
  await send('/memory pending')
  const saved = proposals.getByRole('region', { name: 'Сохранить в память' }).filter({ hasText: note })
  const rejected = proposals.getByRole('region', { name: 'Сохранить в память' }).filter({ hasText: declinedNote })
  await expect(saved.getByText(note, { exact: true })).toBeVisible()
  await expect(rejected.getByText(declinedNote, { exact: true })).toBeVisible()
  const readMemory = () => fs.existsSync(profileFile) ? fs.readFileSync(profileFile, 'utf8') : ''
  assert(!readMemory().includes(note))
  await capture('memory.png', saved)

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await expect(saved).toBeVisible()
  await capture('memory-light.png', saved)

  await saved.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(saved.getByRole('status')).toHaveText('Предложение принято')
  assert(readMemory().includes(note))
  await rejected.getByRole('button', { name: 'Отклонить', exact: true }).click()
  await expect(rejected.getByRole('status')).toHaveText('Предложение отклонено')
  assert(!readMemory().includes(declinedNote))
  assert.equal(pending('memory').length, 0)

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(proposals).toHaveCount(0)
  await expect(stock.getByText(/Pending memory writes/).first()).toBeVisible()

  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await expect(proposals).toHaveCount(1)
  // Withdraw only the isolated module so the native watcher unloads it.
  const module = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
  fs.renameSync(module, module + '.withdrawn')
  await expect(page.locator('html[data-hermes-codex-visual]')).toHaveCount(0, { timeout: 18000 })
  await expect(page.locator('style[data-hcv-proposals-style], [data-hcv-review-notice]')).toHaveCount(0)
  await expect(stock.getByText(/Pending memory writes/).first()).toBeVisible()
  return measurements
}
