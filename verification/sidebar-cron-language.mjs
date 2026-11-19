import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<html lang="ru"><body><main><div data-sessions-mode="projects"></div><span data-tour="sidebar-nav-cron"></span></main></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const { window } = dom
let calls = 0
let jobs = []
Object.assign(window, {
  codex: { disclosure: {} }, codexIconStyle: () => ({}), translateNow: () => '',
  disclosure: () => ({ sync() {}, dispose() {} }), manageSidebarCronJob: () => true,
  host: { state: { profile: { get: () => 'default', subscribe: () => () => {} },
    connectionId: { get: () => 'local', subscribe: () => () => {} } }, onEvent: () => () => {}, navigate() {} },
  hermesDesktop: { api: async () => { calls++; return jobs } },
})
const source = fs.readFileSync('source/sidebar-cron.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace(/^export function /gm, 'function ')
window.eval(source + '\nwindow.attachSidebarCron = attachSidebarCron')
const state = window.attachSidebarCron(window.document.querySelector('main'), { get: () => false, set() {} })
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
try {
  state.sync()
  const section = window.document.querySelector('[data-hcv-cron-sidebar]')
  const toggle = section.querySelector('button')
  toggle.click()
  await settle()
  const message = section.querySelector('[role="status"]')
  assert.equal(message.textContent, 'В этом профиле нет задач')
  assert.equal(calls, 1)
  window.document.documentElement.lang = 'en'
  state.sync()
  assert.equal(toggle.textContent, 'Cron jobs')
  assert.equal(section.querySelector('[data-hcv-cron-manage]').getAttribute('aria-label'), 'Open scheduled tasks')
  assert.equal(message.textContent, 'No tasks in this profile')
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(calls, 1, 'Changing language must not reload tasks')
  jobs = [{ id: 'job', name: 'Test job' }]
  toggle.click()
  toggle.click()
  await settle()
  const job = section.querySelector('[data-hcv-cron-job]')
  assert.equal(job.textContent, 'Test job')
  window.document.documentElement.lang = 'ru'
  state.sync()
  assert.equal(toggle.textContent, 'Cron-задачи')
  assert.equal(section.querySelector('[data-hcv-cron-job]'), job)
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  console.log('Scheduled-task labels switch languages without reloading or closing the list.')
} finally {
  state.dispose()
  dom.window.close()
}
