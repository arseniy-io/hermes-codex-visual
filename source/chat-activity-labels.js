const commandTools = new Set(['terminal', 'execute_code'])
const skillTools = new Set(['skill_view', 'skills_list'])
const editTools = new Set(['write_file', 'edit_file', 'patch'])
const exploreTools = new Map([['read_file', 'activityRead'], ['search_files', 'activitySearch'], ['list_files', 'folder']])
const otherTools = new Map([
  ['web_search', { kind: 'web-search', icon: 'activitySearch' }],
  ['web_extract', { kind: 'web-read', icon: 'activityRead' }],
  ['session_search_recall', { kind: 'history', icon: 'activitySearch' }],
  ['vision_analyze', { kind: 'image', icon: 'activityImage' }],
])
const russianPlurals = new Intl.PluralRules('ru')
const activityList = {
  ru: new Intl.ListFormat('ru', { type: 'conjunction' }),
  en: new Intl.ListFormat('en', { type: 'unit' }),
}
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

export function describeActivity(part) {
  const name = part.toolName
  if (typeof name !== 'string' || (!commandTools.has(name) && !skillTools.has(name) &&
    !editTools.has(name) && !exploreTools.has(name) && !otherTools.has(name) &&
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
  const state = { failed, blocked, pending }
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
    return { ...state, kind: chrome ? 'chrome' : 'browser', icon: 'activityBrowser', origin, title }
  }
  if (commandTools.has(name)) {
    const command = args.command ?? args.code
    return { ...state, kind: 'command', icon: 'activityTerminal', command: typeof command === 'string' ? command : '' }
  }
  const target = args.path || args.file_path
  const path = typeof target === 'string' ? target.split(/[\\/]/).filter(Boolean).at(-1) : ''
  if (editTools.has(name)) {
    const created = result.created === true || (typeof result.diff === 'string' && /^--- \/dev\/null\s*$/m.test(result.diff))
    const reported = [result.files_modified, result.files_created, result.files_deleted].flatMap(paths =>
      Array.isArray(paths) ? paths.filter(value => typeof value === 'string' && value.trim()) : [])
    const paths = reported.length ? reported : typeof target === 'string' && target.trim() ? [target] : []
    return { ...state, kind: 'edit', icon: 'activityEdit', created, paths }
  }
  if (otherTools.has(name)) {
    return { ...state, ...otherTools.get(name), query: shortTitle(args.query || args.pattern) }
  }
  if (exploreTools.has(name)) {
    return { ...state, kind: 'read', icon: exploreTools.get(name), path, query: shortTitle(args.pattern), exploreTool: name }
  }
  if (skillTools.has(name)) return { ...state, kind: 'skill', icon: 'chatSkill' }
  if (name.startsWith('mcp_')) {
    const title = /^mcp_(?:cua_repl|unified_computer_use)_js$/.test(name) ? shortTitle(args.title) : ''
    return { ...state, kind: 'integration', icon: 'activityIntegration', title }
  }
  return null
}

export function activityPresentation(parts, live, russian, detail = false, summary = false) {
  const items = parts.map(part => describeActivity(part) ?? (russian && summary ? {
    kind: 'integration', icon: 'activityIntegration', failed: part.isError || part.interrupted,
  } : null))
  const known = items.filter(Boolean)
  const failed = known.some(item => item.failed)
  if (!known.length || known.some(item => item.blocked) || failed && (!summary || !russian)) return null
  const primary = known.find(item => item.kind === 'edit') ??
    known.find(item => item.kind === 'browser' || item.kind === 'chrome') ?? items[0]
  if (!primary) return null
  const site = known.find(item => item.kind === primary.kind && item.origin)?.origin
  const fallback = { icon: primary.icon, site }
  // The native labels for isolated skill calls and image previews include
  // their own details. Use the combined label only in mixed groups.
  if (known.length !== items.length ||
    (primary.kind === 'skill' || primary.kind === 'image') && known.every(item => item.kind === primary.kind)) return fallback

  const latest = known.at(-1)
  const title = live ? latest.title : known.length === 1 ? primary.title : ''
  if (title) return { ...fallback, label: title }
  const has = kind => known.some(item => item.kind === kind)
  const commandCount = known.filter(item => item.kind === 'command').length
  const sourceCount = known.filter(item => item.kind === 'integration').length
  const edits = known.filter(item => item.kind === 'edit')
  const editCount = new Set(edits.flatMap(item => item.paths.map(path => path.replaceAll('\\', '/')))).size +
    edits.filter(item => !item.paths.length).length
  const one = count => russian ? russianPlurals.select(count) === 'one' : count === 1
  const segments = []
  if (!live && detail && commandCount === 1 && primary.command) {
    return { ...fallback, label: primary.command }
  }
  if (!live && known.length === 1 && commandCount === 1 && primary.command) {
    const label = russian ? 'Выполнена команда ' : 'Ran command '
    return { ...fallback, label: label + primary.command }
  }
  if (!live && known.length === 1 && primary.kind === 'read') {
    const label = primary.exploreTool === 'search_files' ? (russian ? 'Выполнен поиск' : 'Searched for')
      : primary.exploreTool === 'list_files' ? (russian ? 'Просмотрел папку' : 'Listed files in') : (russian ? 'Прочитал' : 'Read')
    const target = primary.query || primary.path
    const inPath = primary.exploreTool === 'search_files' && primary.query && primary.path
    if (target) return { ...fallback, label: label + ' ' + target + (inPath ? (russian ? ' в ' : ' in ') + primary.path : '') }
  }
  if (detail && primary.kind === 'edit') {
    return { ...fallback, prefix: !live && russian ? (primary.created ? 'Создано ' : 'Изменено ') : '' }
  }
  if (live) {
    const working = {
      chrome: russian ? 'Chrome выполняет команды' : 'Using Chrome',
      browser: russian ? 'Использует браузер' : 'Using the browser',
      command: russian ? 'Выполняется команда' : 'Running command',
      integration: russian ? 'Вызывает инструмент' : 'Calling a tool',
      edit: russian ? 'Редактирует файлы' : 'Editing files',
      read: russian ? 'Читает файлы' : 'Reading files',
      skill: russian ? 'Читает скилл' : 'Reading a skill',
      image: russian ? 'Смотрит изображения' : 'Viewing images',
      history: russian ? 'Ищет в истории' : 'Searching chat history',
      'web-search': russian ? 'Ищет в интернете' : 'Searching the web',
      'web-read': russian ? 'Читает страницы' : 'Reading pages',
    }
    return { ...fallback, label: working[latest.kind] }
  }
  if (editCount) {
    segments.push(russian
      ? (editCount === 1 ? 'Отредактировал файл' : 'Отредактировал файлы')
      : (editCount === 1 ? 'Edited a file' : 'Edited files'))
  }
  if (has('read')) segments.push(russian ? 'Прочитал файлы' : 'Read files')
  if (has('skill')) segments.push(russian ? 'Прочитал скилл' : 'Read a skill')
  if (has('history')) segments.push(russian ? 'Выполнил поиск по истории' : 'Searched chat history')
  if (has('web-search')) segments.push(russian ? 'Выполнил поиск в интернете' : 'Searched the web')
  if (has('web-read')) segments.push(russian ? 'Прочитал страницы' : 'Read pages')
  if (has('image')) {
    const count = known.filter(item => item.kind === 'image').length
    const noun = { one: 'изображение', few: 'изображения', many: 'изображений' }[russianPlurals.select(count)]
    segments.push(russian ? 'Просмотрено ' + (count === 1 ? 'изображение' : count + ' ' + noun) :
      (count === 1 ? 'Viewed an image' : 'Viewed ' + count + ' images'))
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
  const ordered = segments.map((text, index) =>
    index && !text.startsWith('Chrome') ? text[0].toLowerCase() + text.slice(1) : text,
  )
  const label = editCount || has('read') ? activityList[russian ? 'ru' : 'en'].format(ordered)
    : ordered.join(russian ? ' и ' : ' and ')
  return { ...fallback, label: failed ? label + ' · есть ошибки' : label }
}
