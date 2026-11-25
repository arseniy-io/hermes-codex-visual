import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { visualAssets, codexMask, svgMask } from '../source/codex-reference.js'
import { activityPresentation, describeActivity } from '../source/chat-activity-labels.js'

// Codex 26.1111.2228.0 dI55.J selects the original compact SVGs for
// conversation rows. The alternate sprite set is a separate feature branch.
const expected = {
  "activitySkill": "18d5d61d900d76aab37677e8657a67d8aa2c2f0ec78e809571da85c389bbaf14",
  "activityList": "253dc4c2cf8f4d28eb68112e437755aa1f8cba4748fe4bfed8cb837d605ea3e5",
  "activityRead": "39b47099d58072bee06dc80ed985656f8efe7129996d837bb190489be8569b85",
  "activitySearch": "10f641830f1449a7e0751449d5cf5f3ba1d53ed5bb5356f5e3fb3ac35e58e2c0",
  "activityTerminal": "14ef2aa8b26686726e51ff3a6bd7419ba7f85ddab3ac538d0c5f133458f89460"
}
for (const [name, digest] of Object.entries(expected)) {
  const svg = visualAssets.icons[name]
  assert.equal(createHash('sha256').update(svg).digest('hex'), digest, name)
  assert.equal(codexMask(name), svgMask(svg), name)
}
assert.equal(visualAssets.icons.activitySkill, visualAssets.icons.wrench)
assert.notEqual(visualAssets.icons.activityList, visualAssets.icons.folder)
assert.notEqual(visualAssets.icons.activitySkill, visualAssets.icons.chatSkill)
const part = (toolName, args) => ({ toolName, args, result: {} })
const rows = [
  [part('read_file', { path: 'source/app.js' }), 'activityRead'],
  [part('search_files', { pattern: 'main', path: 'source' }), 'activitySearch'],
  [part('list_files', { path: 'source' }), 'activityList'],
  [part('skill_view', { name: 'fixture' }), 'activitySkill'],
]
for (const [call, icon] of rows) {
  assert.equal(describeActivity(call).icon, icon)
  assert.equal(activityPresentation([call], false, true, true).icon, icon)
  assert.equal(activityPresentation([call], false, true, false, true).icon, icon)
}
console.log('Verified active Codex read, search, list and skill glyphs and row/summary bindings')
