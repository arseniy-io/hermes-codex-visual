import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { registerMcpRussian, russianConnectorsPage } from '../source/mcp-ru.js'
import { translateMcpCatalogDescription, translateMcpMetric } from '../source/mcp-catalog-ru.js'

const desktop = process.env.HERMES_VISUAL_DESKTOP || path.join(process.env.LOCALAPPDATA, 'hermes/hermes-agent/apps/desktop')
const require = createRequire(path.join(desktop, 'package.json'))
const ts = require('typescript')
const i18n = path.join(desktop, 'src/i18n')

function literal(file, declaration) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === declaration) found = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(found && ts.isObjectLiteralExpression(found), `Missing native translation object ${declaration}`)
  return found
}

function property(object, name) {
  return object.properties.find(item => item.name?.getText().replace(/^['"]|['"]$/g, '') === name)?.initializer
}

const en = literal(path.join(i18n, 'en.ts'), 'en')
const page = property(en, 'connectorsPage')
assert(ts.isObjectLiteralExpression(page), 'Missing native MCP page translations')
const accounts = literal(path.join(i18n, 'en_connector_accounts.ts'), 'enConnectorAccounts')
const missing = []
function compare(native, translated, prefix = '') {
  for (const item of native.properties) {
    if (!ts.isPropertyAssignment(item)) continue
    const key = item.name.getText().replace(/^['"]|['"]$/g, '')
    const next = prefix ? `${prefix}.${key}` : key
    const nativeValue = next === 'accounts' ? accounts : item.initializer
    if (!Object.hasOwn(translated, key)) missing.push(next)
    else if (ts.isObjectLiteralExpression(nativeValue)) compare(nativeValue, translated[key], next)
    else if (typeof translated[key] !== (ts.isArrowFunction(nativeValue) ? 'function' : 'string')) missing.push(next + ' (type)')
  }
}
compare(page, russianConnectorsPage)
assert.deepEqual(missing, [], 'All native MCP interface labels should have Russian translations')
for (const [n, suffix] of [[1, 'инструмент'], [2, 'инструмента'], [5, 'инструментов'], [11, 'инструментов'], [21, 'инструмент'], [22, 'инструмента'], [111, 'инструментов']]) {
  assert.equal(russianConnectorsPage.tools.summaryCount(n), `${n} ${suffix}`)
}
assert.equal(russianConnectorsPage.tools.summaryTitle('TimewebCloudRublix'), 'Что Hermes может делать с TimewebCloudRublix')
let registration
registerMcpRussian({ i18n: { registerAppLocale: (language, value) => { registration = { language, value } } } })
assert.equal(registration.language, 'ru')
assert.equal(registration.value.translations.skills.tabPlugins, 'Плагины')
assert.equal(translateMcpCatalogDescription('Use Adobe Marketing Agent through Hermes'), 'Работа с Adobe Marketing Agent через Hermes')
assert.equal(translateMcpCatalogDescription('Read and edit bases, tables, and records'), 'Чтение и изменение баз, таблиц и записей')
assert.equal(translateMcpCatalogDescription('Unknown custom description with https://example.org'), 'Unknown custom description with https://example.org')
assert.match(translateMcpCatalogDescription('Official Figma remote MCP — design context, Code Connect, and write-to-canvas via https://mcp.figma.com/mcp (OAuth).'), /https:\/\/mcp\.figma\.com\/mcp/)
assert.equal(translateMcpMetric('0 использований за 30 дней · 80.9k токенов на вызов'), '0 использований за 30 дней · 80,9 тыс. токенов на вызов')
assert.equal(translateMcpMetric('https://example.org/80.9k токенов на вызов'), 'https://example.org/80.9k токенов на вызов')
console.log('Russian MCP catalog covers every native page key and number form.')
