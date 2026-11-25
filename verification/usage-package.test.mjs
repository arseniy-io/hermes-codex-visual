import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

// Exercise the real packager in its own disposable project, never in dist/.
test('the installable archive includes the matching desktop and agent plugin', () => {
  const environment = { ...process.env }
  delete environment.HCV_RELEASE_OWNER
  const parent = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(parent, 'hcv-usage-package-'))
  assert.equal(path.dirname(fs.realpathSync(root)), parent)
  try {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.mkdirSync(path.join(root, '.local'))
    fs.mkdirSync(path.join(root, 'source', 'usage-backend', 'dashboard'), { recursive: true })
    fs.copyFileSync(new URL('../scripts/package.py', import.meta.url), path.join(root, 'scripts', 'package.py'))
    fs.copyFileSync(new URL('../scripts/release_lock.py', import.meta.url), path.join(root, 'scripts', 'release_lock.py'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'hermes-codex-visual', version: '1.2.3', hermesAgentPackage: true }))
    fs.writeFileSync(path.join(root, '.local', 'plugin.js'), 'desktop candidate')
    fs.writeFileSync(path.join(root, 'LICENSE'), 'license')
    fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'notices')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', 'plugin.yaml'), 'name: hermes-codex-visual\n')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', '__init__.py'), '# agent\n')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', 'assistant.py'), '# assistant\n')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', 'activity.py'), '# activity\n')
    for (const name of ['timeline.py', 'turn_changes.py', 'agent_receipts.py']) fs.writeFileSync(path.join(root, 'source', 'usage-backend', name), '# timeline companion\n')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', 'dashboard', 'manifest.json'), '{}\n')
    fs.writeFileSync(path.join(root, 'source', 'usage-backend', 'dashboard', 'plugin_api.py'), '# routes\n')
    const built = spawnSync('python', [path.join(root, 'scripts', 'package.py'), '--local'], { encoding: 'utf8', env: environment })
    assert.equal(built.status, 0, built.stderr)
    const archive = path.join(root, 'dist', 'hermes-codex-visual-v1.2.3-local.zip')
    const inspect = spawnSync('python', ['-c',
      'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',
      archive], { encoding: 'utf8', env: environment })
    assert.equal(inspect.status, 0, inspect.stderr)
    const files = JSON.parse(inspect.stdout)
    for (const name of ['plugin.js', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'plugin.yaml', '__init__.py', 'assistant.py', 'activity.py', 'timeline.py', 'turn_changes.py', 'agent_receipts.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py']) {
      assert.ok(Object.hasOwn(files, `hermes-codex-visual/${name}`), `${name} is missing from ZIP`)
    }
    assert.equal(files['hermes-codex-visual/plugin.js'], 'desktop candidate')
    assert.equal(files['hermes-codex-visual/dashboard/plugin_api.py'], '# routes\n')
    // Other ongoing releases remain desktop-only until this feature is enabled
    // in the package manifest.
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'hermes-codex-visual', version: '1.2.3' }))
    const legacy = spawnSync('python', [path.join(root, 'scripts', 'package.py'), '--local'], { encoding: 'utf8', env: environment })
    assert.equal(legacy.status, 0, legacy.stderr)
    const legacyInspect = spawnSync('python', ['-c',
      'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', archive], { encoding: 'utf8', env: environment })
    assert.equal(legacyInspect.status, 0, legacyInspect.stderr)
    assert.deepEqual(JSON.parse(legacyInspect.stdout), [
      'hermes-codex-visual/plugin.js', 'hermes-codex-visual/LICENSE', 'hermes-codex-visual/THIRD_PARTY_NOTICES.txt',
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
