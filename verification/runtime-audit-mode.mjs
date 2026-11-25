import path from 'node:path'

// A direct Playwright invocation deliberately keeps the caller's existing
// baseline/custom Python setup. It is not a pinned release receipt.
export function runtimeAuditMode(env) {
  const mode = env.HCV_TEST_RUNTIME_AUDIT_MODE
  if (mode === undefined || mode === '') return 'direct'
  if (mode !== 'pinned') throw new Error('Unknown HCV_TEST_RUNTIME_AUDIT_MODE')
  if (!env.HCV_TEST_RUNTIME_BASE_PYTHON || !path.isAbsolute(env.HCV_TEST_RUNTIME_BASE_PYTHON)) {
    throw new Error('Pinned runtime audit requires an absolute base Python path')
  }
  return 'pinned'
}
