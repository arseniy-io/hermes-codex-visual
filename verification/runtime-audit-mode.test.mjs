import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { runtimeAuditMode } from './runtime-audit-mode.mjs'

test('direct baseline, custom Python and full or focused runs remain unpinned', () => {
  for (const mode of ['baseline', 'candidate']) {
    for (const focus of [undefined, 'sidebar-activity', 'settings-audit']) {
      const env = { HERMES_VISUAL_MODE: mode, HERMES_VISUAL_PYTHON: 'caller-selected-python',
        HCV_TEST_RUNTIME_BASE_PYTHON: path.resolve('caller-selected-base') }
      if (focus !== undefined) env.HERMES_VISUAL_FOCUS = focus
      assert.equal(runtimeAuditMode(env), 'direct')
    }
  }
})

test('managed audit requires explicit mode and an absolute base', () => {
  assert.equal(runtimeAuditMode({ HCV_TEST_RUNTIME_AUDIT_MODE: 'pinned',
    HCV_TEST_RUNTIME_BASE_PYTHON: path.resolve('base-python.exe') }), 'pinned')
  for (const base of [undefined, '', 'relative/python.exe']) {
    assert.throws(() => runtimeAuditMode({ HCV_TEST_RUNTIME_AUDIT_MODE: 'pinned',
      HCV_TEST_RUNTIME_BASE_PYTHON: base }), /absolute base Python/)
  }
})

test('unknown audit mode fails closed rather than silently becoming direct', () => {
  for (const mode of ['true', 'PINNED', 'no', '1']) {
    assert.throws(() => runtimeAuditMode({ HCV_TEST_RUNTIME_AUDIT_MODE: mode,
      HCV_TEST_RUNTIME_BASE_PYTHON: path.resolve('base-python.exe') }), /Unknown HCV_TEST_RUNTIME_AUDIT_MODE/)
  }
})
