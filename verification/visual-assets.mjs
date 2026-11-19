import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { visualAssets, localAssets, codexMask, svgMask } from '../source/codex-reference.js'
import { agentAvatars } from '../source/agent-avatars.js'

// Regression check for the public/local split: verify the preserved SVG set,
// its use by the real registry, and the exact bytes shipped by both builds.
const baseline = process.argv.slice(2).find(arg => !arg.startsWith('--'))
if (baseline) assert.deepEqual(visualAssets, JSON.parse(fs.readFileSync(baseline, 'utf8')))
assert.equal(localAssets, visualAssets)
assert.equal(Object.keys(visualAssets.icons).length, 138)
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
console.log('Verified 138 shared icons, 28 avatar pairs, 4 installer icons, and preserved SVG geometry')
