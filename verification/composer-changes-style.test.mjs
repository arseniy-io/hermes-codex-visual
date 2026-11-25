import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { chromium } = require('playwright')
const source = fs.readFileSync(process.argv[2] || path.resolve(dir, '../source/composer-layout.js'), 'utf8')
  .replace(/^import[\s\S]*?\bfrom ['"][^'"]+['"]\r?\n/gm, '').replace(/^export function /gm, 'function ')
const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => route.abort())
  await page.setContent(`<!doctype html><html lang="ru" data-hermes-theme="codex-workspace"><head></head><body>
   <div data-chat-surface data-composer-target="main"><div data-slot="composer-dock">
     <div data-hcv-composer-changes><button data-hcv-composer-changes-chip>Подтверждённый патч</button><div data-hcv-composer-changes-warning hidden>Не все изменения удалось отследить</div></div>
   </div></div></body></html>`)
  await page.evaluate(code => {
    const prefix = `const chatStyles = {}; const codex = { disclosure: { ease: 'ease' } }; const codexIconRules = () => ''; const codexMask = () => ''; const mountStyle = (_, sheet) => document.head.append(sheet); const registerComposerApproval = () => {}; const registerComposerChanges = () => {};`
    ;(0,eval)(prefix + code + `\nregisterComposerLayout({onDispose(){}}, 'html[data-hermes-theme="codex-workspace"]')`)
  }, source)
  const chip = page.locator('[data-hcv-composer-changes-chip]')
  const warning = page.locator('[data-hcv-composer-changes-warning]')
  const display = locator => locator.evaluate(el => getComputedStyle(el).display)
  assert.notEqual(await display(chip), 'none')
  assert.equal(await display(warning), 'none')
  await page.keyboard.press('Tab')
  assert.equal(await chip.evaluate(el => el.matches(':focus-visible')), true)
  assert.equal(await chip.evaluate(el => getComputedStyle(el).outlineWidth), '2px')
  assert.equal(await chip.evaluate(el => getComputedStyle(el).outlineStyle), 'solid')
  await chip.evaluate(el => { el.hidden = true })
  await warning.evaluate(el => { el.hidden = false })
  assert.equal(await display(chip), 'none')
  assert.notEqual(await display(warning), 'none')
  assert.match(await warning.textContent(), /Не все изменения удалось отследить/)
  await chip.evaluate(el => { el.hidden = false })
  await warning.evaluate(el => { el.hidden = true })
  assert.notEqual(await display(chip), 'none')
  assert.equal(await display(warning), 'none')

  console.log('PASS headless Chromium: hidden attribute wins over author flex in both directions')
} finally { await browser.close() }




