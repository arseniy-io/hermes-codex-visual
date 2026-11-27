import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { chromium } = require('playwright')
const source = fs.readFileSync(new URL('../source/composer-layout.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm, '')
  .replace(/^export function /gm, 'function ')
const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.setContent(`<!doctype html><html lang="ru" data-hermes-theme="codex-workspace"><head></head><body>
   <div data-chat-surface data-composer-target="main"><div id="dock1" data-slot="composer-dock">
    <div data-hcv-composer-changes><div data-hcv-composer-changes-chip>first</div></div>
    <div class="status-drawer"><div class="coding-status-bar"><button id="branch-icon"><i class="codicon-git-branch"></i></button><button id="kebab"><i class="codicon-kebab-vertical"></i></button><button id="branch" class="contents"><span title="main">main</span></button><button id="count">+1</button></div></div>
    <div data-slot="composer-root"><button data-slot="status-drawer-toggle" aria-expanded="true"><span></span></button></div>
   </div></div>
   <div data-chat-surface><div id="dock2" data-slot="composer-dock"><div data-hcv-composer-changes>second</div><div class="status-drawer" data-collapsed><div data-slot="composer-status-stack"></div></div><button data-slot="status-drawer-toggle" aria-expanded="false"></button></div></div>
   <div data-chat-surface><div id="dock3" data-slot="composer-dock"><div data-hcv-composer-changes>third</div></div></div>
   <div data-chat-surface><div id="dock4" data-slot="composer-dock">
    <div data-hcv-composer-changes>changes stay visible</div>
    <div class="status-drawer"><div data-slot="composer-status-stack"><div><div data-slot="status-stack-content"><div data-slot="status-stack-section"><div data-slot="composer-subagents">agent</div></div></div></div></div></div>
    <div data-slot="composer-root"><button data-slot="status-drawer-toggle" aria-expanded="true"></button></div>
   </div></div>
   <div data-chat-surface><div id="dock5" data-slot="composer-dock">
    <div class="status-drawer"><div data-slot="composer-status-stack"><div id="consent-card"><div data-slot="status-stack-content">
     <div data-slot="status-stack-section"><div data-slot="status-row"><span class="status-row-icon"><i class="codicon-graph"></i></span>consent</div></div>
     <div data-slot="status-stack-section"><div data-slot="composer-subagents">agent</div></div>
    </div></div></div></div>
    <div data-slot="composer-root"><button data-slot="status-drawer-toggle" aria-expanded="true"></button><div data-slot="composer-surface"></div></div>
   </div></div>
   <button id="unrelated"><i class="codicon-kebab-vertical"></i></button>
  </body></html>`)
  await page.evaluate((code) => {
    const prefix = `const chatStyles = {}; const codex = { disclosure: { ease: 'ease' } }; const codexIconRules = () => ''; const codexMask = () => ''; const mountStyle = (_, sheet) => document.head.append(sheet); const registerComposerApproval = () => {}; const registerComposerChanges = () => {};`
    ;(0, eval)(prefix + code + `\nregisterComposerLayout({ onDispose() {} }, 'html[data-hermes-theme="codex-workspace"]')`)
  }, source)
  const display = selector => page.locator(selector).evaluate(node => getComputedStyle(node).display)
  assert.notEqual(await display('#dock1 [data-hcv-composer-changes]'), 'none')
  assert.notEqual(await display('#dock2 [data-hcv-composer-changes]'), 'none')
  assert.notEqual(await display('#dock3 [data-hcv-composer-changes]'), 'none')
  assert.equal(await display('#kebab'), 'none')
  assert.notEqual(await display('#unrelated'), 'none')
  assert.notEqual(await display('#branch'), 'none')
  assert.notEqual(await display('#count'), 'none')
  assert.equal(await display('#dock4 [data-slot="status-stack-section"]'), 'none')
  assert.equal(await display('#dock4 .status-drawer'), 'none')
  assert.equal(await display('#dock4 [data-slot="status-drawer-toggle"]'), 'none')
  assert.notEqual(await display('#dock4 [data-hcv-composer-changes]'), 'none')
  assert.notEqual(await display('#dock5 [data-slot="status-row"]'), 'none')
  assert.equal(await display('#dock5 [data-slot="status-stack-section"]:last-child'), 'none')
  assert.notEqual(await display('#dock5 [data-slot="status-drawer-toggle"]'), 'none')
  assert.equal(await page.locator('#consent-card').evaluate(node => getComputedStyle(node).borderTopLeftRadius), '22px')
  await page.locator('#dock1 .coding-status-bar').evaluate(node => node.addEventListener('contextmenu', event => {
    event.preventDefault(); node.dataset.keyboardContext = String(Number(node.dataset.keyboardContext || 0) + 1)
  }))
  await page.locator('#branch-icon').focus()
  await page.keyboard.press('Shift+F10')
  assert.equal(await page.locator('#dock1 .coding-status-bar').getAttribute('data-keyboard-context'), '1')
  assert.equal(await page.locator('#dock1 [data-slot="status-drawer-toggle"]').evaluate(el => getComputedStyle(el).inlineSize), '56px')
  assert.equal(await page.locator('#dock1 [data-slot="status-drawer-toggle"]').evaluate(el => getComputedStyle(el).blockSize), '24px')
  await page.locator('#dock1 [data-slot="status-drawer-toggle"]').evaluate(el => el.setAttribute('aria-expanded', 'false'))
  assert.notEqual(await display('#dock1 [data-hcv-composer-changes]'), 'none')
  await page.locator('#dock2 [data-slot="status-drawer-toggle"]').evaluate(el => el.setAttribute('aria-expanded', 'true'))
  assert.notEqual(await display('#dock2 [data-hcv-composer-changes]'), 'none')
  assert.notEqual(await display('#dock1 [data-hcv-composer-changes]'), 'none')
  await page.locator('#dock2 .status-drawer').evaluate(el => el.remove())
  assert.notEqual(await display('#dock2 [data-hcv-composer-changes]'), 'none')
  await page.locator('html').evaluate(el => el.dataset.hermesTheme = 'other')
  assert.notEqual(await display('#kebab'), 'none')
  assert.notEqual(await display('#dock4 [data-slot="status-stack-section"]'), 'none')
  console.log('PASS isolated Chromium: drawer states, hidden agent roster, remaining consent and changes, keyboard action and theme fallback')
} finally { await browser.close() }
