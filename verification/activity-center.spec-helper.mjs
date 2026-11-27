import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skillName = 'activity-review-check'
const descriptionBefore = 'description: Проверка тестового отчёта'
const descriptionAfter = 'description: Проверка тестового отчёта с источниками'
const ruleBefore = '1. Проверь тестовый отчёт.'
const ruleAfter = '1. Сверь дату и подтверждённые результаты тестового отчёта.'
const supportBefore = 'Источник проверен не был.'
const supportAfter = 'Источник проверен в отдельном тестовом профиле.'
const acceptedNote = 'Для тестового отчёта сначала указывай дату проверки. ' + 'Перечисляй только подтверждённые результаты. '.repeat(12) + 'КОНЕЦ ТЕСТОВОЙ ЗАМЕТКИ.'
const rejectedNote = 'Пропускать проверку тестового отчёта.'
const newDescription = 'Сверяет тестовые отчёты.'
export const newSkillPurpose = 'Когда проверяешь отчёт, навык сверит цифры с источниками. Ты получишь список расхождений.'
const overlongDescription = 'Сверяет отчёты, отмечает найденные ошибки и собирает список источников для повторной проверки.'

// Appended to the existing isolated projectSeedProgram: Path/sys/db and the
// selected HERMES_HOME are already supplied by the sandbox fixture.
export const seedActivityProposals = `
from tools import write_approval as wa
import importlib.util, json
activity_home = Path(sys.argv[1]).parent
activity_spec = importlib.util.spec_from_file_location('isolated_activity_backend',
    activity_home / 'plugins' / 'hermes-codex-visual' / 'activity.py')
activity_backend = importlib.util.module_from_spec(activity_spec)
activity_spec.loader.exec_module(activity_backend)
activity_skill = activity_home / 'skills' / '${skillName}'
(activity_skill / 'references').mkdir(parents=True, exist_ok=True)
(activity_skill / 'SKILL.md').write_text('\\n'.join(['---', 'name: ${skillName}', ${JSON.stringify(descriptionBefore)}, '---',
    '# Проверка отчёта', '', ${JSON.stringify(ruleBefore)}, '']), encoding='utf-8')
(activity_skill / 'references' / 'check.md').write_text(${JSON.stringify(supportBefore)} + '\\n', encoding='utf-8')
wa.stage_write(wa.SKILLS, {'action': 'batch', 'operations': [
    {'action': 'patch', 'name': '${skillName}', 'file_path': 'SKILL.md',
     'old_string': ${JSON.stringify(descriptionBefore)}, 'new_string': ${JSON.stringify(descriptionAfter)}},
    {'action': 'patch', 'name': '${skillName}', 'file_path': 'SKILL.md',
     'old_string': ${JSON.stringify(ruleBefore)}, 'new_string': ${JSON.stringify(ruleAfter)}},
    {'action': 'patch', 'name': '${skillName}', 'file_path': 'references/check.md',
     'old_string': ${JSON.stringify(supportBefore)}, 'new_string': ${JSON.stringify(supportAfter)}},
]}, summary='batch(3 ops: patch, patch, patch) on ${skillName}', origin='background_review')
activity_created = wa.stage_write(wa.SKILLS, {'action': 'batch', 'operations': [
    {'action': 'create', 'name': 'activity-missing-fixture', 'content': '---\\nname: activity-missing-fixture\\ndescription: ${newDescription}\\n---\\nNew skill content.\\n'},
]}, summary='create activity fixture', origin='foreground')
activity_backend.proposal_notification(tool_name='skill_manage', session_id='20261108_124501_aab001',
    result=json.dumps({'success': True, 'staged': True, 'pending_id': activity_created['id']}))
wa.stage_write(wa.SKILLS, {'action': 'batch', 'operations': [
    {'action': 'write_file', 'name': 'activity-missing-fixture', 'file_path': 'references/first.md', 'file_content': '# First guide\\nFirst proposed reference.'},
    {'action': 'write_file', 'name': 'activity-missing-fixture', 'file_path': 'references/second.md', 'file_content': '# Second guide\\nSecond proposed reference.'},
]}, summary='missing skill references', origin='background_review')
wa.stage_write(wa.SKILLS, {'action': 'create', 'name': 'activity-invalid-fixture',
    'content': '\\n'.join(['---', 'name: activity-invalid-fixture', 'description: ${overlongDescription}', '---', 'Synthetic instructions.'])},
    summary='create invalid activity fixture', origin='background_review')
for activity_note in (${JSON.stringify(acceptedNote)}, ${JSON.stringify(rejectedNote)}):
    wa.stage_write(wa.MEMORY, {'action': 'add', 'target': 'user', 'content': activity_note},
        summary='add to user profile: ' + activity_note[:120], origin='background_review')
`

export async function verifyActivityCenter({ page, expect, screenshot, sandbox, openThemeSettings, closeSettings }) {
  const button = page.locator('[data-hcv-activity-button]')
  const count = button.locator('[data-hcv-activity-count]')
  const panel = page.locator('[data-hcv-activity]')
  const pendingFiles = kind => fs.readdirSync(path.join(sandbox.hermesHome, 'pending', kind)).filter(file => file.endsWith('.json'))
  const pendingCount = () => pendingFiles('skills').length + pendingFiles('memory').length
  const cacheDir = path.join(sandbox.hermesHome, 'plugin-data', 'hermes-codex-visual', 'activity-explanations')
  const cacheFiles = () => fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter(file => file.endsWith('.json')) : []
  const skill = path.join(sandbox.hermesHome, 'skills', skillName)
  const skillFile = path.join(skill, 'SKILL.md')
  const supportFile = path.join(skill, 'references', 'check.md')
  const memoryFile = path.join(sandbox.hermesHome, 'memories', 'USER.md')
  const readMemory = () => fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8') : ''
  const nativeMessagesBefore = await page.locator('[data-slot="aui_system-message-root"]').count()
  const buttonRadii = {}
  const measureButtons = async state => {
    const buttons = await panel.locator('[data-slot="button"]').evaluateAll(nodes => nodes.map(node => ({
      label: node.textContent.trim(), radius: getComputedStyle(node).borderRadius,
    })))
    assert(buttons.length > 0, 'Expected the panel action buttons')
    // Codex 26.1111.2228.0: L4lx default/cardAction/dialogAction -> rounded-full;
    // 66582da7ee6b.css (--radius-full) is 9999px, independently read from ASAR.
    for (const item of buttons) assert.equal(item.radius, '9999px', `${state}: ${item.label}`)
    buttonRadii[state] = buttons
  }

  assert.equal(pendingCount(), 6, 'Only the isolated seed should be queued')
  await expect(button).toBeVisible()
  await expect(count).toHaveText('6')
  assert(await button.evaluate(node => node.nextElementSibling?.hasAttribute('data-hcv-notifications')),
    'Activity belongs immediately before the notification-settings button')
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Профиль Hermes: default', { exact: true })).toBeVisible()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(6)
  await panel.getByRole('button', { name: 'Навыки', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(4)
  await panel.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Все', exact: true }).click()
  const createdRow = panel.locator('[data-hcv-activity-item]').filter({ hasText: newDescription })
  const creationTitle = panel.getByRole('heading', { name: 'Предложение создать новый навык', exact: true })
  const accept = panel.getByRole('button', { name: 'Принять', exact: true })
  const back = panel.getByRole('button', { name: 'К предложениям', exact: true })
  const fullText = panel.getByRole('button', { name: 'Полный текст', exact: true })
  await expect(createdRow).toContainText('activity-missing-fixture')
  await expect(createdRow.getByText('Проект «Тестовый проект»', { exact: true })).toBeVisible()
  await createdRow.getByRole('button', { name: 'Посмотреть предложение', exact: true }).click()
  await expect(creationTitle).toBeVisible()
  await expect(panel.getByText('Проект «Тестовый проект»', { exact: true })).toBeVisible()
  await expect(panel.getByText(newSkillPurpose, { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(accept).toBeEnabled()
  await expect(panel.locator('details')).toHaveCount(0)
  await expect(panel.getByText(/Профиль Hermes/)).toHaveCount(0)
  await fullText.click()
  await expect(panel.locator('[data-hcv-activity-preview]')).toContainText('New skill content.')
  await panel.getByRole('button', { name: 'К предложению', exact: true }).click()
  await expect(creationTitle).toBeVisible()
  await expect(panel.locator('[data-hcv-activity-preview]')).toHaveCount(0)
  await back.click()

  const missingRow = panel.locator('[data-hcv-activity-item]').filter({ hasText: 'Файлы навыка' })
  await expect(missingRow).toContainText('activity-missing-fixture')
  await missingRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  await expect(creationTitle).toBeVisible()
  await expect(panel.getByText(newSkillPurpose, { exact: true })).toBeVisible()
  await expect(panel.getByText('Проект «Тестовый проект»', { exact: true })).toBeVisible()
  await expect(accept).toBeEnabled()
  await expect(panel.locator('details')).toHaveCount(0)
  const compactSize = await panel.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
  await measureButtons('compactProposal')
  await screenshot('activity-skill-creation.png')
  await page.setViewportSize({ width: 450, height: 820 })
  await expect.poll(() => panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1 &&
    node.getBoundingClientRect().width < innerWidth), { message: 'The compact proposal must fit a narrow window' }).toBe(true)
  await screenshot('activity-linked-skill-narrow.png')
  await page.setViewportSize({ width: 1440, height: 920 })
  await panel.getByRole('button', { name: 'Отдельное предложение по файлам', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'Предложение изменить файлы навыка', exact: true })).toBeVisible()
  await expect(accept).toBeDisabled()
  await expect(panel.locator('details')).toHaveCount(0)
  const fileList = panel.locator('[data-hcv-activity-compact-footer] ul')
  await expect(fileList.locator('li')).toHaveText(['references/first.md', 'references/second.md'])
  await fullText.click()
  await expect(panel.locator('[data-hcv-activity-preview]')).toContainText('First proposed reference.')
  await expect(panel.locator('[data-hcv-activity-preview]')).toContainText('Second proposed reference.')
  await panel.getByRole('button', { name: 'К предложению', exact: true }).click()
  await back.click()
  await panel.getByRole('button', { name: 'Сейчас', exact: true }).click()
  await expect(panel.getByText('Сейчас нет подтверждённых фоновых проверок.')).toBeVisible()
  await panel.getByRole('button', { name: 'Недавнее', exact: true }).click()
  await expect(panel.getByText('Здесь появятся результаты новых проверок и решений.')).toBeVisible()
  await panel.getByRole('button', { name: 'Предложения', exact: true }).click()
  await measureButtons('darkList')
  await panel.getByRole('button', { name: 'Обновить', exact: true }).hover()
  await measureButtons('darkHover')
  await screenshot('activity-list.png')
  await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toHaveCount(0)
  assert.equal(await page.locator('[data-slot="aui_system-message-root"]').count(), nativeMessagesBefore,
    'The global queue must not add slash command output to the chat')
  const skillRow = panel.locator('[data-hcv-activity-item]').filter({ has: page.getByRole('heading', { name: skillName, exact: true }) })
  const earlierCache = new Set(cacheFiles())
  await skillRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  const explanation = panel.locator('[data-hcv-activity-explanation]')
  const preview = panel.locator('[data-hcv-activity-changes]')
  await expect(explanation).toContainText('Сверять дату и результаты тестового отчёта с источниками.', { timeout: 30000 })
  const [skillCache] = cacheFiles().filter(file => !earlierCache.has(file))
  assert(skillCache, 'The ready explanation must be saved to the isolated profile')
  const savedSkill = path.join(cacheDir, skillCache)
  const firstSaved = fs.statSync(savedSkill).mtimeMs
  await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toBeEnabled()
  assert.equal(await preview.evaluate(node => node.open), false, 'Changed fragments start collapsed')
  await preview.locator('summary').first().click()
  await expect(preview).toBeVisible()
  await measureButtons('darkPreview')
  for (const text of [descriptionBefore.replace('description:', 'Описание:'), descriptionAfter.replace('description:', 'Описание:'),
    ruleBefore, ruleAfter, supportBefore, supportAfter]) {
    await expect(preview).toContainText(text)
  }
  await expect(preview).toContainText('references/check.md')
  await preview.locator('[data-hcv-activity-full] > summary').first().click()
  await expect(preview.locator('[data-hcv-activity-full]').first()).toContainText(descriptionBefore)
  assert.equal(pendingCount(), 6)
  assert(fs.readFileSync(skillFile, 'utf8').includes(ruleBefore))
  await preview.locator('summary').first().focus()
  await expect(preview.locator('summary').first()).toBeFocused()
  await page.keyboard.press('PageDown')
  await screenshot('activity-skill-full.png')

  await page.setViewportSize({ width: 740, height: 820 })
  await expect(panel).toBeVisible()
  assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'The narrow dialog must not overflow horizontally')
  assert(await preview.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Long full text must wrap')
  await screenshot('activity-narrow.png')
  await page.setViewportSize({ width: 1440, height: 920 })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(button).toBeFocused()

  await openThemeSettings()
  await page.getByText(/^(Светлая|Light)$/, { exact: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light')
  await closeSettings()
  await button.click()
  await skillRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  await expect(explanation).toContainText('Сверять дату и результаты тестового отчёта с источниками.', { timeout: 30000 })
  await preview.locator('summary').first().click()
  await expect(preview).toContainText(supportAfter)
  assert.equal(fs.statSync(savedSkill).mtimeMs, firstSaved, 'Reopening preserves the saved explanation')
  await measureButtons('lightPreview')
  await screenshot('activity-light.png')
  await panel.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(panel.getByText('Предложение принято.', { exact: true })).toBeVisible()
  assert(!fs.existsSync(savedSkill), 'Approval removes the pending explanation cache')
  await expect(count).toHaveText('5')
  assert(fs.readFileSync(skillFile, 'utf8').includes(descriptionAfter))
  assert(fs.readFileSync(skillFile, 'utf8').includes(ruleAfter))
  assert.equal(fs.readFileSync(supportFile, 'utf8').replaceAll('\r\n', '\n'), supportAfter + '\n')
  assert.equal(pendingFiles('skills').length, 3)

  const acceptedRow = panel.locator('[data-hcv-activity-item]').filter({ hasText: 'Для тестового отчёта сначала указывай дату проверки.' })
  await acceptedRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  await expect(explanation).toContainText('Сверять дату и результаты тестового отчёта с источниками.', { timeout: 30000 })
  await preview.locator('summary').first().click()
  await expect(preview).toContainText('КОНЕЦ ТЕСТОВОЙ ЗАМЕТКИ.')
  await expect(preview).toContainText(acceptedNote)
  assert(!readMemory().includes(acceptedNote))
  await panel.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(count).toHaveText('4')
  assert(readMemory().includes(acceptedNote), 'Native memory approval must apply the complete note')
  const rejectedRow = panel.locator('[data-hcv-activity-item]').filter({ hasText: rejectedNote })
  const beforeReject = new Set(cacheFiles())
  await rejectedRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  await expect(explanation).toContainText('Сверять дату и результаты тестового отчёта с источниками.', { timeout: 30000 })
  const [rejectedCache] = cacheFiles().filter(file => !beforeReject.has(file))
  assert(rejectedCache, 'Rejection must have a saved explanation to transfer to history')
  await preview.locator('summary').first().click()
  await expect(preview).toContainText(rejectedNote)
  await panel.getByRole('button', { name: 'Отклонить', exact: true }).click()
  await expect(panel.getByText('Предложение отклонено.', { exact: true })).toBeVisible()
  assert(!cacheFiles().includes(rejectedCache))
  assert(!readMemory().includes(rejectedNote))
  assert.equal(pendingCount(), 3)
  await expect(count).toHaveText('3')
  await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(3)
  await panel.getByRole('button', { name: 'Недавнее', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(3)
  await expect(panel.locator('[data-hcv-activity-item]').filter({ hasText: 'Сверять дату и результаты тестового отчёта с источниками.' })).toHaveCount(3)
  await expect(panel.getByText(/Принято/)).toHaveCount(2)
  await expect(panel.getByText(/Отклонено/)).toHaveCount(1)
  await panel.getByRole('button', { name: 'Навыки', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Память', exact: true }).click()
  await expect(panel.locator('[data-hcv-activity-item]')).toHaveCount(2)
  await screenshot('activity-empty.png')
  await panel.getByRole('button', { name: 'Предложения', exact: true }).click()
  await panel.getByRole('button', { name: 'Все', exact: true }).click()
  await createdRow.getByRole('button', { name: 'Посмотреть предложение', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toBeEnabled({ timeout: 30000 })
  await panel.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(panel.getByText('Навык «activity-missing-fixture» создан.', { exact: true })).toBeVisible()
  assert(fs.existsSync(path.join(sandbox.hermesHome, 'skills/activity-missing-fixture/SKILL.md')))
  assert(!fs.existsSync(path.join(sandbox.hermesHome, 'skills/activity-missing-fixture/references/first.md')),
    'Creating a skill must not approve a separate files proposal')
  await missingRow.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toBeEnabled({ timeout: 30000 })
  await panel.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(panel.getByText('Файлы навыка сохранены.', { exact: true })).toBeVisible()
  assert.equal(fs.readFileSync(path.join(sandbox.hermesHome, 'skills/activity-missing-fixture/references/first.md'), 'utf8').replaceAll('\r\n', '\n'), '# First guide\nFirst proposed reference.')
  assert.equal(fs.readFileSync(path.join(sandbox.hermesHome, 'skills/activity-missing-fixture/references/second.md'), 'utf8').replaceAll('\r\n', '\n'), '# Second guide\nSecond proposed reference.')
  const invalidRow = panel.locator('[data-hcv-activity-item]').filter({ hasText: 'activity-invalid-fixture' })
  await invalidRow.getByRole('button', { name: 'Посмотреть предложение', exact: true }).click()
  await expect(panel.getByText('Проект не определён', { exact: true })).toBeVisible()
  await expect(panel.getByText(/Создание заблокировано. Длина описания \d+, допустимо до \d+ символов\./)).toBeVisible()
  await expect(accept).toBeDisabled()
  assert(!fs.existsSync(path.join(sandbox.hermesHome, 'skills/activity-invalid-fixture')))
  await screenshot('activity-skill-creation-refused.png')
  await panel.getByRole('button', { name: 'Отклонить', exact: true }).click()
  await expect(panel.getByText('Предложение отклонено.', { exact: true })).toBeVisible()
  assert.equal(pendingCount(), 0)
  await expect(count).toBeHidden()
  await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(panel.getByText('Нет предложений, ожидающих решения.', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(button).toBeFocused()
  return { nativeQueue: true, explanation: true, sectionsAndFilters: true, decisionHistory: true,
    savedExplanation: true, decisionCacheCleared: true,
    fullBatch: true, fullMemory: true, createPreview: true, missingSkillPreview: true, linkedCreationAndFiles: true, approvedSkill: true,
    compactSize, creationRefusal: true, plainPurpose: true, actualProject: true,
    approvedMemory: true, rejectedMemory: true,
    pending: pendingCount(), keyboard: true, narrow: true, light: true, buttonRadii }
}

// Optional failure-only phase. These requests are intercepted in Electron main;
// it exercises UI uncertainty without sending mutations to the native backend.
export async function installActivityUiFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    if (globalThis.__hcvActivityFixture) throw new Error('activity fixture already installed')
    const previous = ipcMain._invokeHandlers.get('hermes:api')
    if (typeof previous !== 'function') throw new Error('Hermes API handler missing')
    const item = { id: 'aabbccdd', kind: 'skills', names: ['fixture-only'], summary: 'Fixture-only queue',
      origin: 'background_review', created_at: 1795078068, version: 'fixture-v1' }
    const state = { previous, calls: [], behavior: 'ready', items: [item], invalid: 0 }
    globalThis.__hcvActivityFixture = state
    ipcMain.removeHandler('hermes:api')
    ipcMain.handle('hermes:api', async (event, request) => {
      const full = String(request?.path || '')
      const prefix = '/api/plugins/hermes-codex-visual/activity'
      if (!full.startsWith(prefix)) return previous(event, request)
      const url = new URL('http://fixture' + full)
      state.calls.push({ path: url.pathname, method: request.method || 'GET', body: request.body || null, profile: request.profile || null })
      if (state.behavior === 'error') throw new Error('HTTP 503 isolated activity fixture')
      const scope = 'fixture-activity-only'
      if (request.method === 'POST') {
        if (state.behavior === 'unknown') {
          await new Promise(resolve => { state.releaseDecision = resolve })
          throw new Error('Isolated unconfirmed transport')
        }
        if (state.behavior === 'stale') throw new Error('HTTP 409 stale isolated proposal')
        state.items = []
        return { scope, status: url.pathname.endsWith('/approve') ? 'approved' : 'rejected' }
      }
      if (url.pathname === prefix) return { schema: 1, scope, items: state.items, invalid_count: state.invalid,
        history_available: true, running: [], recent: [] }
      const submitted = state.behavior === 'submitted'
      const complex = state.behavior === 'complex'
      return { ...item, scope, signature: 'fixture-signature', applicable: !submitted,
        reason: submitted ? 'Результат не подтверждён' : '', preview: 'FULL FIXTURE PREVIEW\nПоследняя строка',
        explanation: submitted || complex ? { status: 'unavailable', text: '' }
          : { status: 'ready', text: 'Сверять тестовый результат с источником.' },
        changes: submitted ? [] : [{ name: 'fixture-only', file: 'SKILL.md', action: 'patch', full_replacement: true,
          before: 'Было', after: 'Последняя строка', fragments_unavailable: complex,
          fragments: complex ? [] : [{ before: 'Было', after: 'Последняя строка' }] }] }
    })
  })
}

export async function restoreActivityUiFixture(app) {
  await app.evaluate(({ ipcMain }) => {
    const state = globalThis.__hcvActivityFixture
    if (!state) return
    state.releaseDecision?.()
    ipcMain.removeHandler('hermes:api')
    ipcMain.handle('hermes:api', state.previous)
    delete globalThis.__hcvActivityFixture
  })
}

export async function verifyActivityFailureUi({ app, page, expect }) {
  await installActivityUiFixture(app)
  try {
    const button = page.locator('[data-hcv-activity-button]')
    const panel = page.locator('[data-hcv-activity]')
    await button.click()
    await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
    await expect(panel.getByRole('heading', { name: 'fixture-only', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
    await expect(panel.locator('[data-hcv-activity-explanation]')).toContainText('Сверять тестовый результат с источником.')
    await expect(panel.getByText('Предложение включает удаление или полную замену. Проверьте затронутые фрагменты.')).toBeVisible()
    await panel.locator('[data-hcv-activity-changes] > summary').click()
    await expect(panel.locator('[data-hcv-activity-changes]')).toContainText('Последняя строка')
    await app.evaluate(() => { globalThis.__hcvActivityFixture.behavior = 'unknown' })
    await panel.getByRole('button', { name: 'Принять', exact: true }).click()
    await expect(panel.getByRole('status').filter({ hasText: 'Ждём ответ Hermes…' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Принимаем…', exact: true })).toBeDisabled()
    await expect.poll(() => app.evaluate(() => typeof globalThis.__hcvActivityFixture.releaseDecision)).toBe('function')
    await app.evaluate(() => { globalThis.__hcvActivityFixture.releaseDecision() })
    await expect(panel.getByText(/Результат не подтверждён/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toBeDisabled()
    const calls = await app.evaluate(() => globalThis.__hcvActivityFixture.calls)
    assert.equal(calls.filter(call => call.method === 'POST').length, 1)
    await app.evaluate(() => { globalThis.__hcvActivityFixture.behavior = 'submitted' })
    await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
    await panel.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Принять', exact: true })).toBeDisabled()
    const full = panel.locator('[data-hcv-activity-fallback] > summary')
    await full.focus()
    await page.keyboard.press('Enter')
    await expect(panel.locator('[data-hcv-activity-preview]')).toContainText('FULL FIXTURE PREVIEW\nПоследняя строка')
    await panel.locator('[data-hcv-activity-preview]').focus()
    await expect(panel.locator('[data-hcv-activity-preview]')).toBeFocused()
    await app.evaluate(() => { globalThis.__hcvActivityFixture.behavior = 'complex' })
    await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
    await panel.getByRole('button', { name: 'Посмотреть правку', exact: true }).click()
    await expect(panel.getByText('Краткое описание недоступно. Проверьте полный текст ниже.')).toBeVisible()
    await panel.locator('[data-hcv-activity-changes] > summary').click()
    await expect(panel.getByText('Не удалось выделить изменённые фрагменты. Откройте полный текст файла.')).toBeVisible()
    await panel.locator('[data-hcv-activity-full] > summary').click()
    await expect(panel.locator('[data-hcv-activity-full]')).toContainText('Последняя строка')
    await app.evaluate(() => { globalThis.__hcvActivityFixture.behavior = 'error' })
    await panel.getByRole('button', { name: 'Обновить', exact: true }).click()
    await expect(panel.getByText(/Не удалось проверить очередь/)).toBeVisible()
    await expect(button.locator('[data-hcv-activity-count]')).toHaveText('?')
    await app.evaluate(() => { globalThis.__hcvActivityFixture.behavior = 'ready'; globalThis.__hcvActivityFixture.invalid = 1; globalThis.__hcvActivityFixture.items = [] })
    await panel.getByRole('button', { name: 'Повторить', exact: true }).click()
    await expect(panel.getByText('Некоторые записи очереди не удалось прочитать.', { exact: true })).toBeVisible()
    await expect(panel.getByText('Нет предложений, ожидающих решения.', { exact: true })).toHaveCount(0)
    await expect(button.locator('[data-hcv-activity-count]')).toHaveText('?')
    await page.keyboard.press('Escape')
  } finally { await restoreActivityUiFixture(app) }
}
