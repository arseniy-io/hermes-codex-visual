import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalReview, localizedApprovalActivity, protectedApproval } from '../source/chat-approval-data.js'

test('only a protected instruction request receives the file explanation', () => {
  const description = 'Write to protected agent-instruction file(s): AGENTS.md. These files steer future agent behavior; approval is always required (not bypassed by auto-approve).'
  assert.deepEqual(protectedApproval({ command: '<write to AGENTS.md>', description }), { target: 'AGENTS.md' })
  assert.deepEqual(protectedApproval({ command: '<write to AGENTS.md, CLAUDE.md>', description }), { target: 'AGENTS.md, CLAUDE.md' })
  assert.equal(protectedApproval({ command: '<write to AGENTS.md>', description: 'Write to SSH config' }), null)
  assert.equal(protectedApproval({ command: 'rm AGENTS.md', description }), null)
  assert.equal(protectedApproval({ command: '<write to >', description }), null)
})

test('review is bound to the exact pending approval and requires complete data', () => {
  const review = { version: 1, complete: true, reason: 'Обновить правила',
    files: [{ path: 'AGENTS.md', operation: 'edit', diff: '-было\n+стало' }] }
  const response = { approvals: [{ request_id: 'one', hcv_review: review },
    { request_id: 'two', hcv_review: { ...review, reason: 'Другая правка' } }] }
  assert.equal(approvalReview(response, 'one'), review)
  assert.equal(approvalReview(response, 'two').reason, 'Другая правка')
  assert.equal(approvalReview(response, 'missing'), null)
  assert.equal(approvalReview({ approvals: [{ request_id: 'one', hcv_review: { ...review, complete: false } }] }, 'one'), null)
  assert.equal(approvalReview({ approvals: [{ request_id: 'one', hcv_review: { ...review, reason: '' } }] }, 'one'), null)
  assert.equal(approvalReview({ approvals: [response.approvals[0], response.approvals[0]] }, 'one'), null)
})

test('approval activity uses Russian counts without changing other native labels', () => {
  for (const [input, expected] of [
    ['Ran 1 command', 'Выполнена 1 команда'],
    ['Ran 2 commands', 'Выполнено 2 команды'],
    ['Ran 8 commands', 'Выполнено 8 команд'],
    ['Ran 21 commands', 'Выполнена 21 команда'],
    ['Running 2 commands', 'Выполняются 2 команды'],
    ['Running 1 command', 'Выполняется 1 команда'],
  ]) assert.equal(localizedApprovalActivity(input), expected)
  assert.equal(localizedApprovalActivity('Ran 8 commands, used 2 tools'), '')
})
