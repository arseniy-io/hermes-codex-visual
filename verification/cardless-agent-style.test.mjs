import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { codexReference as codex } from '../source/codex-reference.js'
import { fileActivityStyles } from '../source/chat-file-activity.js'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const source = name => fs.readFileSync(new URL('../source/' + name, import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')

test('the timeline style loads for an agent event with no native tool card', async () => {
  const dom = new JSDOM(`<html lang="ru" data-hermes-theme="Codex"><head></head><body>
    <div data-chat-surface><div data-slot="aui_response-group"></div></div>
  </body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' })
  try {
    const w = dom.window
    w.movedElementMatches = (record, selector) => [...record.addedNodes, ...record.removedNodes].some(node =>
      node instanceof w.Element && (node.matches(selector) || node.querySelector(selector)))
    w.eval(source('style-scope.js') + '\nwindow.initScope = registerStyleScope; window.mountStyle = mountStyle')
    Object.assign(w, {
      codex, fileActivityStyles, codexIconRules: () => '', codexMask: () => '',
      activityGroup: 'data-hcv-activity-group', activityMember: 'data-hcv-activity-member',
      activityRepeatGroup: 'data-hcv-activity-repeat-group', activityRepeatMember: 'data-hcv-activity-repeat-member',
      emptyActivityOwner: 'data-hcv-activity-empty-owner', disclosureMotion: 'data-hcv-activity-motion',
      activityGroups: () => ({ has: () => false, sync: () => {}, prune: () => {}, clear: () => {}, panels: () => [] }),
      IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      registerDisclosureMotion: () => {}, registerChatImages: () => {}, registerActivityDetails: () => {},
      registerChatReasoning: () => {}, registerChatSkills: () => {}, clearActivityDetails: () => {},
    })
    w.eval(source('chat-activity.js') + '\nwindow.initActivity = registerChatActivity')
    const dispose = []
    const ctx = { onDispose: callback => dispose.push(callback), addEventListener: () => {} }
    w.initScope(ctx, 'Codex')
    w.initActivity(ctx, '[data-hermes-theme="Codex"]')
    await new Promise(resolve => w.setTimeout(resolve, 0))
    assert.equal(w.document.querySelector('[data-hcv-chat-activity-style]'), null)
    const event = w.document.createElement('div')
    event.setAttribute('data-hcv-agent-rows', '')
    w.document.querySelector('[data-slot="aui_response-group"]').append(event)
    await new Promise(resolve => w.setTimeout(resolve, 0))
    assert(w.document.querySelector('[data-hcv-chat-activity-style]'), 'an agent-only timeline needs its style')
    event.remove()
    await new Promise(resolve => w.setTimeout(resolve, 0))
    assert.equal(w.document.querySelector('[data-hcv-chat-activity-style]'), null)
    for (const callback of dispose.reverse()) callback()
  } finally {
    dom.window.close()
  }
})
