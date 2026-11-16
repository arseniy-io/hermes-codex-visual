const commandTools = new Set(['terminal', 'execute_code'])
const skillTools = new Set(['skill_view', 'skills_list'])
// Hermes prefixes MCP tool names with the normalized server name.
const chromeTool = /^mcp_(?:chrome(?:_devtools|_extension|_internal|_dev|devtools)?|chrome-devtools)_/
const browserTool = /^mcp_browser(?:_use)?_/
const shortTitle = value => {
  if (typeof value !== 'string') return ''
  const title = value.trim().replace(/\s+/g, ' ')
  return title.length <= 80 ? title : title.slice(0, 79).trimEnd() + '…'
}

function object(value) {
  if (typeof value === 'string' && value.length <= 256 * 1024 && value.trimStart().startsWith('{')) {
    try { value = JSON.parse(value) } catch { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function siteOrigin(value) {
  if (typeof value !== 'string' || value.length > 4096) return ''
  try {
    const url = new URL(value)
    // Only public web origins are candidates for site art. Never pass page
    // paths, query strings, credentials or local addresses to the resolver.
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password && !url.port &&
      /\.[a-z]{2,63}$/i.test(url.hostname) && !/\.(?:local|localhost|internal|invalid|test|example|onion|lan|arpa)$/i.test(url.hostname)) {
      return url.origin
    }
  } catch { /* No usable site URL in the event. */ }
  return ''
}

function describe(part) {
  const name = part.toolName
  if (typeof name !== 'string' || (!commandTools.has(name) && !skillTools.has(name) &&
    !name.startsWith('browser_') && !name.startsWith('mcp_'))) return null
  const result = object(part.result)
  const args = object(part.args)
  const meta = object(result._meta)
  const surface = object(meta['codex/toolSurface'])
  const failed = part.isError || part.interrupted || part.status?.type === 'incomplete' ||
    result.isError === true || Boolean(result.error) || result.success === false ||
    (commandTools.has(name) && typeof result.exit_code === 'number' && result.exit_code !== 0)
  const blocked = part.status?.type === 'requires-action'
  const pending = part.result === undefined && part.completedAt == null
  const chrome = chromeTool.test(name) || (surface.kind === 'browserUse' && surface.backend === 'chrome')
  const web = chrome || name.startsWith('browser_') || browserTool.test(name) ||
    surface.kind === 'browserUse'
  if (web) {
    // Codex's browser surface exposes a normalized result URL. Native Hermes
    // navigation exposes its URL on the result, or on the successful call.
    const target = surface.kind === 'browserUse'
      ? meta.browser_use?.url ?? surface.screenshot?.pageUrl
      : undefined
    const navigation = name === 'browser_navigate' || chrome && /_(?:new_page|navigate_page)$/.test(name)
    const origin = !failed && !pending
      ? siteOrigin(target ?? (navigation ? result.url ?? args.url : undefined))
      : ''
    const title = /(?:^|_)(?:js|run_code)$/.test(name) ? shortTitle(args.title) : ''
    return { kind: chrome ? 'chrome' : 'browser', icon: 'activityBrowser', failed, blocked, pending, origin, title }
  }
  if (commandTools.has(name)) return { kind: 'command', icon: 'activityTerminal', failed, blocked, pending }
  if (skillTools.has(name)) return { kind: 'skill', icon: 'chatSkill', failed, blocked, pending }
  if (name.startsWith('mcp_')) {
    const title = /^mcp_(?:cua_repl|unified_computer_use)_js$/.test(name) ? shortTitle(args.title) : ''
    return { kind: 'integration', icon: 'activityIntegration', failed, blocked, pending, title }
  }
  return null
}

// In a mixed run Hermes keeps its own wording for categories outside this
// feature. In a matching run use the same first-source / commands distinction
// as Codex and keep native error and permission states.
export function activityPresentation(parts, live, russian) {
  const items = parts.map(describe)
  const known = items.filter(Boolean)
  if (!known.length || known.some(item => item.failed || item.blocked)) return null
  const primary = known.find(item => item.kind === 'browser' || item.kind === 'chrome') ?? items[0]
  if (!primary) return null
  const site = known.find(item => item.kind === primary.kind && item.origin)?.origin
  const fallback = { icon: primary.icon, site }
  if (known.length !== items.length || known.some(item => item.kind === 'skill')) return fallback

  const latest = known.at(-1)
  const title = live ? latest.title : known.length === 1 ? primary.title : ''
  if (title) return { ...fallback, label: title }
  const has = kind => known.some(item => item.kind === kind)
  const commandCount = known.filter(item => item.kind === 'command').length
  const sourceCount = known.filter(item => item.kind === 'integration').length
  const one = count => russian ? new Intl.PluralRules('ru').select(count) === 'one' : count === 1
  const segments = []
  if (live) {
    const working = {
      chrome: russian ? 'Chrome выполняет команды' : 'Using Chrome',
      browser: russian ? 'Использует браузер' : 'Using the browser',
      command: russian ? 'Выполняется команда' : 'Running command',
      integration: russian ? 'Вызывает инструмент' : 'Calling a tool',
    }
    return { ...fallback, label: working[latest.kind] }
  }
  if (has('browser')) {
    segments.push(russian ? 'Использовал браузер' : 'Used the browser')
    if (has('chrome')) segments.push(russian ? 'Chrome выполнил команды' : 'used Chrome')
  } else if (has('chrome')) {
    segments.push(russian ? 'Использована интеграция Chrome' : 'Used the Chrome integration')
  }
  if (sourceCount) segments.push(russian
    ? (sourceCount === 1 ? 'Вызвал инструмент' : 'Вызвал инструменты')
    : (sourceCount === 1 ? 'Called a tool' : 'Called tools'))
  if (commandCount) segments.push(russian
    ? (one(commandCount) ? 'Выполнил команду' : 'Выполнил команды')
    : (one(commandCount) ? 'Ran a command' : 'Ran commands'))
  const label = segments.map((text, index) =>
    index && !text.startsWith('Chrome') ? text[0].toLowerCase() + text.slice(1) : text,
  ).join(russian ? ' и ' : ' and ')
  return { ...fallback, label }
}
