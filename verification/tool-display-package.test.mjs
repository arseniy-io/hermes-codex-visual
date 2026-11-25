import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('the MCP display companion is byte-identical in its opt-in ZIP and disabled archives remain unchanged', () => {
  const parent = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(parent, 'hcv-tool-display-package-'))
  const names = [
    'scripts/stage-hermes-tool-display.py', 'scripts/install-hermes-tool-display.py',
    'source/hermes-tool-display/data.py', 'source/hermes-tool-display/core.patch',
    'source/hermes-tool-display/manifest.json', 'source/hermes-tool-display/README.md',
  ]
  try {
    for (const name of ['scripts/package.py', 'scripts/release_lock.py', ...names]) {
      const target = path.join(root, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(new URL('../' + name, import.meta.url), target)
    }
    fs.mkdirSync(path.join(root, '.local'))
    fs.writeFileSync(path.join(root, '.local/plugin.js'), 'desktop candidate')
    fs.writeFileSync(path.join(root, 'LICENSE'), 'license')
    fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'notices')
    for (const enabled of [true, false]) {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'hermes-codex-visual', version: '1.2.3', hermesToolDisplayCore: enabled }))
      const built = spawnSync('python', [path.join(root, 'scripts/package.py'), '--local'], { encoding: 'utf8' })
      assert.equal(built.status, 0, built.stderr)
      const archive = path.join(root, 'dist/hermes-codex-visual-v1.2.3-local.zip')
      const inspected = spawnSync('python', ['-c',
        'import sys,zipfile,json,hashlib; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))', archive], { encoding: 'utf8' })
      assert.equal(inspected.status, 0, inspected.stderr)
      const files = JSON.parse(inspected.stdout)
      assert.equal(Object.keys(files).length, 3 + (enabled ? names.length : 0))
      for (const name of names) {
        const key = 'hermes-codex-visual/' + name
        assert.equal(Object.hasOwn(files, key), enabled)
        if (enabled) {
          const hashed = spawnSync('python', ['-c', 'import sys,hashlib; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())', path.join(root, name)], { encoding: 'utf8' })
          assert.equal(hashed.status, 0, hashed.stderr)
          assert.equal(files[key], hashed.stdout.trim())
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
