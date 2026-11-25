import assert from 'node:assert/strict'
import { test } from 'node:test'
import { turnFileKey } from '../source/turn-file-matching.js'

test('match the complete file path, including relative paths and file URLs', () => {
  const cwd = 'C:\\Projects\\Example'
  const expected = turnFileKey('C:\\Projects\\Example\\review\\Report.md')
  assert.equal(turnFileKey('review/Report.md', cwd), expected)
  assert.equal(turnFileKey('file:///c:/projects/example/review/Report.md'), expected)
  assert.notEqual(turnFileKey('docs/Report.md', cwd), expected)
  assert.equal(turnFileKey('file:///home/a/Report%20final.md'), '/home/a/Report final.md')
  assert.notEqual(turnFileKey('/home/a/Report.md'), turnFileKey('/home/a/report.md'))
  assert.equal(turnFileKey('file://server/share/Report.md'), turnFileKey('\\\\SERVER\\share\\report.md'))
})

test('do not guess ambiguous or non-file targets', () => {
  for (const value of ['report.md', '~/report.md', 'https://example.com/report.md', 'file:///a%2fb.md',
    'file:///a.md#fragment', '/../../report.md', 'C:\\..\\report.md']) {
    assert.equal(turnFileKey(value), null, value)
  }
  assert.equal(turnFileKey('report.md', ''), null)
  assert.notEqual(turnFileKey('other/report.md', '/project'), turnFileKey('report.md', '/project'))
})
