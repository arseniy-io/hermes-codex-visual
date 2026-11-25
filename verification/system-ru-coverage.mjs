import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { registerMcpRussian } from '../source/mcp-ru.js'
import { translateSystemInstruction } from '../source/system-hardcoded-ru.js'
import { translateSystemToast } from '../source/system-toast-ru.js'

// Compare against the actual desktop source, including its imported locale
// pieces and spread objects, instead of relying on a copied list of keys.
const desktop = process.env.HERMES_VISUAL_DESKTOP || path.join(process.env.LOCALAPPDATA, 'hermes/hermes-agent/apps/desktop')
const require = createRequire(path.join(desktop, 'package.json'))
const esbuild = require('esbuild')
const code = `export { en } from ${JSON.stringify(path.join(desktop, 'src/i18n/en.ts'))};\n` +
  `export { ruOverrides } from ${JSON.stringify(path.join(desktop, 'src/i18n/ru.ts'))};`
const result = await esbuild.build({
  stdin: { contents: code, loader: 'ts', resolveDir: desktop },
  tsconfig: path.join(desktop, 'tsconfig.json'), bundle: true, write: false,
  platform: 'node', format: 'cjs', logLevel: 'silent',
})
const mod = { exports: {} }
vm.runInThisContext(`(function(module,exports,require){${result.outputFiles[0].text}\n})`)(mod, mod.exports, require)
const { en, ruOverrides } = mod.exports
let registration
let calls = 0
registerMcpRussian({ i18n: { registerAppLocale: (locale, value) => {
  calls++
  registration = { locale, value }
} } })
assert.equal(calls, 1, 'MCP and system copy must use one registration; repeated registration replaces the first')
assert.equal(registration.locale, 'ru')
const contributed = registration.value.translations
const supportedExtensions = new Set(['settings.sections.browser']) // Hermes renders this optional setting from its schema.

const get = (root, key) => key.split('.').reduce((value, part) => value?.[part], root)
const getParts = (root, parts) => parts.reduce((value, part) => value?.[part], root)
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const problems = []
let added = 0
function inspectContribution(value, prefix = '', parts = []) {
  for (const [key, current] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key
    const next = [...parts, key]
    if (plain(current)) { inspectContribution(current, full, next); continue }
    const native = getParts(en, next)
    if (native === undefined) {
      if (!supportedExtensions.has(full)) problems.push(`${full}: key is absent in Hermes`)
      else if (typeof current !== 'string') problems.push(`${full}: expected a string`)
    } else if (typeof current !== typeof native) problems.push(`${full}: expected ${typeof native}, got ${typeof current}`)
    if (getParts(ruOverrides, next) === undefined) added++
  }
}
inspectContribution(contributed)
assert.deepEqual(problems, [], 'Every contributed value must match an existing Hermes key and value type')

// Some deliberately untranslated leaves are names, an address or examples.
const unchanged = new Set([
  'assistant.catalogInstall.requiresHermes', 'updates.appName',
  'prompts.vaultSaveIdentifierPlaceholder', 'composer.voiceEngineLiveShort',
  'settings.plugins.installModal.repoPlaceholder',
  'settings.vault.originPlaceholder', 'settings.vault.originPlaceholderCheckout', 'settings.vault.identifierShown',
  'settings.billing.state.autoRefill.notAvailablePill',
  'freeTier.providerName', 'profiles.remoteOverride.urlPlaceholder',
  'settings.localModels.downloadSpeed', 'settings.customEndpoints.namePlaceholder',
  'settings.managedUpdates.receiptVersions',
])
const groups = [
  'externalOpenFailed', 'notifications', 'errors', 'assistant.thread', 'assistant.approval',
  'assistant.catalogInstall', 'sendDiagnostics', 'boot', 'updates', 'prompts',
  'sidebar.storageCorrupt', 'rightSidebar', 'preview', 'desktop', 'composer',
  'shell.statusbar', 'modelPicker', 'modelAssignment', 'settings.plugins.installModal',
  'settings.uninstallSection', 'skills.plugins', 'skills.hub',
  'settings.vault', 'settings.toolsets', 'settings.gateway', 'settings.appearance', 'settings.nav.vault',
  'settings.billing',
  'freeTier', 'profiles', 'appTour', 'onboarding', 'install',
  'settings.localModels', 'settings.model', 'settings.customEndpoints', 'settings.nav.providerLocalModels',
  'connectors', 'connectorOffer', 'catalog', 'tips', 'cron', 'messaging', 'keybinds', 'zones', 'fileMenu', 'titlebar',
  'settings.managedUpdates', 'settings.fieldLabels', 'settings.fieldDescriptions', 'settings.config',
  'settings.computerUse',
]
const missing = []
function checkCovered(value, prefix, parts) {
  if (plain(value)) {
    for (const [key, child] of Object.entries(value)) checkCovered(child, `${prefix}.${key}`, [...parts, key])
    return
  }
  if (!unchanged.has(prefix) && getParts(ruOverrides, parts) === undefined && getParts(contributed, parts) === undefined) missing.push(prefix)
}
for (const group of groups) checkCovered(get(en, group), group, group.split('.'))
assert.deepEqual(missing, [], 'The selected system surfaces should not fall back to English')

const thread = contributed.assistant.thread
assert.match(thread.errorCodes.SESSION_OWNER_UNCONFIRMED.body, /может быть|попало в очередь/i)
assert.match(thread.errorCodes.SESSION_OWNER_UNCONFIRMED.body, /проверьте чат/i)
assert.match(thread.errorCodes.SESSION_OWNER_BUSY.body, /ничего не отправлено/i)
assert.match(thread.errorCodes.auth.title('ExampleCloud'), /ExampleCloud/)
assert.match(thread.errorCodes.context_overflow.body('Service', 'Model-42'), /Model-42/)
assert.match(contributed.prompts.vaultSaveDesc('https://example.org'), /https:\/\/example\.org/)
assert.match(contributed.sendDiagnostics.privacyNotice, /переписки.*512 КБ|512 КБ.*переписки/i)
assert.match(contributed.sendDiagnostics.privacyNotice, /14 дней/)
assert.match(contributed.settings.uninstallSection.options.gui.description, /настройки и чаты останутся/i)
assert.match(contributed.settings.uninstallSection.options.full.description, /чаты.*секреты/i)
assert.match(contributed.settings.billing.charge.unconfirmedBody('Ошибка.'), /не подтверждён.*проверьте баланс и историю.*прежде чем повторять/i)
assert.match(contributed.settings.billing.charge.timeoutBody, /ещё может пройти.*прежде чем повторять/i)
assert.match(contributed.settings.fieldDescriptions['voice.voiceChatMode'], /\$0\.05 за минуту/)
assert.match(contributed.settings.uninstallSection.dataKept('C:\\Users\\Test'), /C:\\Users\\Test/)
assert.equal(contributed.preview.web.addComments(1), 'Добавить 1 комментарий')
assert.equal(contributed.preview.web.addComments(2), 'Добавить 2 комментария')
assert.equal(contributed.preview.web.addComments(11), 'Добавить 11 комментариев')
assert.equal(contributed.preview.web.addComments(21), 'Добавить 21 комментарий')
assert.equal(contributed.skills.tabPlugins, 'Плагины')
assert.equal(contributed.connectorsPage.title, 'MCP')
assert.match(translateSystemInstruction('To uninstall, go to Windows Settings → Apps → Installed apps.'), /Параметры.*Установленные приложения/)
assert.equal(translateSystemInstruction('Unknown user message https://example.org'), 'Unknown user message https://example.org')
assert.match(translateSystemToast('The gateway is running a turn in this chat and did not confirm your message in time. It may already be queued there: check the chat before sending it again.'), /может быть в очереди.*прежде чем отправлять/i)
assert.equal(translateSystemToast('Unknown server error https://example.org'), 'Unknown server error https://example.org')
console.log(`Russian app copy: ${added} English fallback leaves covered, selected surfaces and safety details verified.`)
if (process.argv.includes('--remaining')) {
  const remaining = []
  function walk(value, parts = []) {
    if (plain(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, [...parts, key])
    } else if (getParts(ruOverrides, parts) === undefined && getParts(contributed, parts) === undefined) {
      remaining.push({ path: parts.join('.'), value: typeof value === 'function' ? String(value) : value })
    }
  }
  walk(en)
  console.log(JSON.stringify(remaining, null, 2))
}
