import fs from 'node:fs'

// Generate an isolated copy of the established desktop fixture. The real
// Hermes source and the shared fixture remain untouched.
const source = fs.readFileSync('verification/sandbox.spec.mjs', 'utf8')
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Fixture changed: expected one matching section')
  return text.replace(before, after)
}
let test = replaceOnce(source, "const repository = path.resolve(desktop, '../..')",
  "const repository = path.resolve(featureRootForApproval())\nfunction featureRootForApproval() { return process.env.HERMES_VISUAL_APPROVAL_CORE }")
test = replaceOnce(test, "await import('./chat-approval.spec-helper.mjs')",
  "await import('./chat-approval-core.spec-helper.mjs')")
test = replaceOnce(test,
  "        if (approvalFocus && message?.includes?.('Тест разрешения: обычная команда')) {",
  `        if (approvalFocus && message?.includes?.('Тест разрешения: несколько файлов')) {
          const patch = '*** Begin Patch\\n*** Update File: ' + path.join(projectFolder, 'AGENTS.md') +
            '\\n@@\\n-Исходное правило.\\n+Новое правило.\\n*** Update File: ' + path.join(projectFolder, 'fixture-note.md') +
            '\\n@@\\n-Изменение для проверки.\\n+Новое примечание.\\n*** End Patch'
          return replyToEditFixture(res, request, [{ name: 'patch', args: {
            mode: 'patch', patch, approval_reason: 'Согласовать правила и примечание',
          } }], 'Проверка завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: одинаковые имена')) {
          return replyToEditFixture(res, request, [
            { id: 'call_hcv_approval_a', name: 'patch', args: { mode: 'replace',
              path: path.join(projectFolder, 'AGENTS.md'), old_string: 'Исходное правило.',
              new_string: 'Первое изменение.', approval_reason: 'Причина первого файла' } },
            { id: 'call_hcv_approval_b', name: 'patch', args: { mode: 'replace',
              path: path.join(projectFolder, 'nested', 'AGENTS.md'), old_string: 'Вложенное правило.',
              new_string: 'Второе изменение.', approval_reason: 'Причина второго файла' } },
          ], 'Проверка очереди завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: обычная команда')) {`)
test = replaceOnce(test,
  "    if (approvalFocus) fs.writeFileSync(path.join(projectFolder, 'CLAUDE.md'), 'Исходное правило.\\n')",
  "    if (approvalFocus) fs.writeFileSync(path.join(projectFolder, 'CLAUDE.md'), 'Исходное правило.\\n')\n" +
  "    if (approvalFocus) { fs.mkdirSync(path.join(projectFolder, 'nested')); fs.writeFileSync(path.join(projectFolder, 'nested', 'AGENTS.md'), 'Вложенное правило.\\n') }")
// This copy lives in .local, so keep helper imports bound to verification/.
test = test.replaceAll("from './", "from '../verification/").replaceAll("import('./", "import('../verification/")
fs.writeFileSync('.local/approval-core.spec.mjs', test)
fs.writeFileSync('.local/approval-core.playwright.config.mjs', `
import os from 'node:os'
import path from 'node:path'
export default { testDir: import.meta.dirname, testMatch: 'approval-core.spec.mjs',
  outputDir: path.join(os.tmpdir(), 'hcv-approval-core-' + process.pid),
  reporter: 'line', workers: 1, timeout: 180000 }
`)
