import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { visualAssets, localAssets, codexMask, svgMask } from '../source/codex-reference.js'
import { agentAvatars } from '../source/agent-avatars.js'

// Regression check for the public/local split: verify the preserved SVG set,
// its use by the real registry, and the exact bytes shipped by both builds.
const baseline = process.argv.slice(2).find(arg => !arg.startsWith('--'))
if (baseline) {
  const preserved = JSON.parse(fs.readFileSync(baseline, 'utf8'))
  for (const [name, svg] of Object.entries(preserved.icons)) {
    // Owner's explicit turn-card parity request: active IDFw16 replaces UAmo20.
    if (name !== 'turnDiffUndo') assert.equal(visualAssets.icons[name], svg, 'Preserved icon: ' + name)
  }
  assert.deepEqual(visualAssets.avatars, preserved.avatars)
  assert.deepEqual(visualAssets.install, preserved.install)
  assert(Object.keys(visualAssets.icons).filter(name => !(name in preserved.icons)).every(name => ['activityGithub', 'activitySkill', 'activityList', 'turnDiffReapply', 'speedFast', 'speedUltrafast', 'archiveToast', 'archiveToastClose', 'archiveToastPending', 'archiveToastRestored'].includes(name)),
    'Only the confirmed activity, turn-diff, and speed icons may be added to the preserved set')
}
assert.equal(localAssets, visualAssets)
assert.equal(Object.keys(visualAssets.icons).length, 148)
assert.equal(createHash('sha256').update(visualAssets.icons.archiveToast).digest('hex'),
  '32644138e50ef9eda0014ceb6d8ed488be5ba427c0415de9e49e8fb2f107c442', 'Codex archive-light-16')
assert.equal(createHash('sha256').update(visualAssets.icons.archiveToastClose).digest('hex'),
  '6b34b8fbfb4e4aa25ee6b1d8832cde297af4e6efa90e2e8d202e340f1808878e', 'Codex xmark-md-light-16')
assert.equal(createHash('sha256').update(visualAssets.icons.archiveToastRestored).digest('hex'),
  'ffca8333a4d67cde1e379f6613997cea14dab4c2e8c14e4512bacf34182f754d', 'Codex circle-checkmark-light-16')
assert.equal(createHash('sha256').update(visualAssets.icons.turnDiffUndo).digest('hex'),
  '02f1e640e0bba6e1e3d9079d3a66505d1bbc928221a88bdc423870a274994646', 'Original active IDFw16 artwork')
assert.equal(createHash('sha256').update(visualAssets.icons.speedFast).digest('hex'),
  '443943a4117e0bcc538bd6f29fa21c1425bfbe234942f67fc204f02ac87c1f5d', 'Original Codex Fast artwork')
assert.equal(createHash('sha256').update(visualAssets.icons.speedUltrafast).digest('hex'),
  '66f978bb5f1de1e5371d98f446845bf671ccbf019cfb0e88cc6c31ad9305a5e8', 'Original Codex Ultrafast artwork')
assert.equal(visualAssets.avatars.length, 28)
assert.deepEqual(agentAvatars, visualAssets.avatars)
assert.deepEqual(Object.keys(visualAssets.install).sort(), ['disclosure', 'done', 'failed', 'pending'])
const allSvg = [...Object.values(visualAssets.icons), ...visualAssets.avatars.flat(), ...Object.values(visualAssets.install)]
for (const svg of allSvg) {
  assert.match(svg, /^<svg\s/)
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i)
}
for (const [name, svg] of Object.entries(visualAssets.icons)) {
  assert.equal(codexMask(name), svgMask(svg), name)
  assert.equal(codexMask(name, 'black'), svgMask(svg.replaceAll('"white"', '"black"')), name)
}
const build = fs.readFileSync('scripts/build.mjs', 'utf8')
assert.doesNotMatch(build, /HCV_LOCAL_ASSETS|\.local\/assets\.json/)
if (!process.argv.includes('--source-only')) {
  const publicModule = fs.readFileSync('plugin.js')
  const localModule = fs.readFileSync('.local/plugin.js')
  assert(publicModule.equals(localModule), 'Public and local modules must be byte-identical')
  console.log('Shared module SHA-256', createHash('sha256').update(publicModule).digest('hex'))
}
console.log('Verified 148 shared icons, 28 avatar pairs, 4 installer icons, and preserved SVG geometry')
