const commandTools = new Set(['terminal', 'execute_code'])
const skillTools = new Set(['skill_view', 'skills_list'])
const editTools = new Set(['write_file', 'edit_file', 'patch'])
const exploreTools = new Map([['read_file', 'activityRead'], ['search_files', 'activitySearch'], ['list_files', 'activityList']])
const otherTools = new Map([
  ['web_search', { kind: 'web-search', icon: 'activitySearch' }],
  ['web_extract', { kind: 'web-read', icon: 'activityRead' }],
  ['session_search_recall', { kind: 'history', icon: 'activitySearch' }],
  ['vision_analyze', { kind: 'image', icon: 'activityImage' }],
])
const russianPlurals = new Intl.PluralRules('ru')
const activityList = {
  ru: new Intl.ListFormat('ru', { type: 'unit' }),
  en: new Intl.ListFormat('en', { type: 'unit' }),
}
// browserUse metadata, rather than a similarly named MCP server, identifies
// Codex's browser surface. Chrome Devtools is an ordinary named integration.
const legacyDevtools = /^mcp_chrome_devtools_(.+)$/
const browserTool = /^mcp_{1,2}browser(?:_use)?_{1,2}/
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

// Codex 26.1111.2228.0, OZum.g in 956370.aff5cce818.js. Server names
// follow the same formatter; persisted app labels remain the supplied data.
const acronyms = new Set(['GH', 'IA', 'MCP', 'API', 'CI', 'CLI', 'LLM', 'PDF', 'PR', 'RCS', 'UI', 'URL', 'SQL', 'TW', 'GPU', 'CPU'])
const names = new Map([['openai', 'OpenAI'], ['openaideveloperdocs', 'OpenAI Developer Docs'],
  ['openapi', 'OpenAPI'], ['github', 'GitHub'], ['imessage', 'iMessage'], ['pagerduty', 'PagerDuty'],
  ['datadog', 'DataDog'], ['sharepoint', 'SharePoint'], ['sqlite', 'SQLite'], ['fastapi', 'FastAPI']])
const minorWords = new Set(['and', 'or', 'to', 'up', 'with'])
function formatName(value, sentence = false) {
  return value.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean).map((word, index) => {
    const upper = word.toUpperCase()
    if (acronyms.has(upper)) return upper
    if (word.toLowerCase().endsWith('s') && acronyms.has(word.slice(0, -1).toUpperCase())) return upper.slice(0, -1) + 's'
    const lower = word.toLowerCase()
    return names.get(lower) ?? (sentence && index || !sentence && index && minorWords.has(lower)
      ? lower : lower[0].toUpperCase() + lower.slice(1))
  }).join(' ')
}

function sourceFor(name, supplied) {
  // Hermes tools/mcp_tool_schema.py: mcp__{server}__{tool}; connector-tools.ts
  // and tools/tool_labels.py persist the matching app and action in args.
  const match = /^mcp__([^]+?)__(.+)$/.exec(name) ?? /^connectors__([^]+?)__(.+)$/.exec(name)
  const legacy = !match && legacyDevtools.exec(name)
  const recorded = object(supplied?.display)
  const exact = recorded.version === 1
  const server = exact && typeof recorded.server === 'string' ? recorded.server : match?.[1] ?? (legacy ? 'chrome_devtools' : '')
  const tool = exact && typeof recorded.tool === 'string' ? recorded.tool : match?.[2] ?? legacy?.[1] ?? ''
  const title = typeof supplied?.app === 'string' && supplied.app.trim() ? supplied.app.trim() : formatName(server)
  if (!title) return null
  return { key: server || supplied.name || title, name: title, server, tool }
}

function integrationData(part, args, failed) {
  const labels = Array.isArray(args.hermes_tool_labels) ? args.hermes_tool_labels : []
  const supplied = labels.filter(label => ['mcp', 'connector'].includes(label?.kind) && typeof label.app === 'string')
  const sources = supplied.map(label => sourceFor(label.name || part.toolName, label)).filter(Boolean)
  if (!sources.length) {
    const source = sourceFor(part.toolName)
    if (source) sources.push(source)
  }
  const first = sources[0]
  // alO6.tx gives toolDisplay and the tool definition's title precedence over
  // its OZum.g(sentence) fallback. Older Hermes histories lack those fields.
  const invoking = part.result === undefined && part.completedAt == null
  const savedDisplay = supplied.map(label => object(label.display)).find(value => value.version === 1)
  const definition = object(part.toolDefinition ?? savedDisplay?.definition)
  const definitionMeta = object(definition._meta)
  const invocation = failed ? undefined : invoking
    ? part.toolDisplay?.invoking ?? definitionMeta['openai/toolInvocation/invoking']
    : part.toolDisplay?.invoked ?? definitionMeta['openai/toolInvocation/invoked']
  const title = invocation ?? part.toolDisplay?.title ?? definition.title ?? object(definition.annotations).title
  const action = typeof title === 'string' && title.trim() ? title
    : first?.tool ? formatName(first.tool, true) : ''
  return { sources, action, icon: first?.name.toLowerCase() === 'github' ? 'activityGithub' : 'activityIntegration' }
}

export function repeatedActivityPresentation(parts, russian) {
  if (parts.length < 2) return null
  const items = parts.map(describeActivity)
  const first = items[0]
  if (!first || first.kind !== 'integration' || first.sources?.length !== 1 || !first.action) return null
  const identity = first.sources[0]
  if (!items.every(item => item?.kind === 'integration' && item.repeatable !== false && !item.failed && !item.blocked && !item.pending &&
    item.sources?.length === 1 && item.sources[0].key === identity.key && item.sources[0].tool === identity.tool &&
    item.action === first.action)) return null
  const count = parts.length
  const noun = russian ? ({ one: 'вызов', few: 'вызова', many: 'вызовов', other: 'вызова' })[russianPlurals.select(count)] : count === 1 ? 'call' : 'calls'
  return { icon: first.icon, label: first.action + ' · ' + count + ' ' + noun,
    key: identity.key + ':' + identity.tool + ':' + first.action }
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

// Native ConnectorTool passes its presentation title as toolName and keeps
// the actual invocation name in innerToolName (connector-tool.tsx). Classify
// the saved invocation, preserving the native row's own args/result and id.
export function activityToolPart(part) {
  return typeof part?.innerToolName === 'string' && part.innerToolName
    ? { ...part, toolName: part.innerToolName } : part
}

export function describeActivity(part) {
  const name = part.toolName
  if (typeof name !== 'string' || (!commandTools.has(name) && !skillTools.has(name) &&
    !editTools.has(name) && !exploreTools.has(name) && !otherTools.has(name) &&
    !name.startsWith('browser_') && !name.startsWith('mcp_') && !name.startsWith('connectors__') &&
    !(name === 'tool_call' && Array.isArray(object(part.args).hermes_tool_labels)) )) return null
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
  const chrome = surface.kind === 'browserUse' && surface.backend === 'chrome'
  const web = name.startsWith('browser_') || browserTool.test(name) ||
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
    return { ...state, kind: chrome ? 'chrome' : 'browser', icon: 'activityBrowser', origin, title,
      sources: [{ key: chrome ? 'browser-use:chrome' : 'browser-use', name: chrome ? 'Chrome' : '' }] }
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
    return { ...state, kind: 'read', icon: exploreTools.get(name), path, query: shortTitle(args.pattern), folder: typeof target === 'string' ? target : '', exploreTool: name }
  }
  if (skillTools.has(name)) return { ...state, kind: 'skill', icon: name === 'skill_view' ? 'activitySkill' : 'chatSkill', skillName: typeof args.name === 'string' ? args.name : '' }
  if (name.startsWith('mcp_') || name.startsWith('connectors__') || name === 'tool_call') {
    const title = /^mcp_(?:cua_repl|unified_computer_use)_js$/.test(name) ? shortTitle(args.title) : ''
    return { ...state, kind: 'integration', ...integrationData(part, args, failed), title,
      repeatable: surface.kind !== 'computerUse' && !part.automaticApprovalReviews?.length &&
        !/^mcp__computer[-_]use__/.test(name) }
  }
  return null
}

export function activityPresentation(parts, live, russian, detail = false, summary = false) {
  const items = parts.map(describeActivity)
  const known = items.filter(Boolean)
  const failed = known.some(item => item.failed)
  // Codex 26.1117: BGqp keeps a failed MCP row's normal tool title/icon.
  // tz emits Command failed (...) only for a nested unsuccessful command.
  // Other errors, interruptions and approval surfaces retain native handling.
  const failedRow = !summary && known.length === 1 && known.length === items.length &&
    known[0].failed && !known[0].pending && !parts[0].interrupted &&
    !parts[0].automaticApprovalReviews?.length &&
    (known[0].kind === 'integration' && Boolean(known[0].action) ||
      detail && known[0].kind === 'command' && Boolean(known[0].command))
  if (!known.length || known.some(item => item.blocked) || failed && !summary && !failedRow) return null
  const primary = known.find(item => item.sources?.length) ?? known.find(item => item.kind === 'edit') ??
    known.find(item => item.kind === 'browser' || item.kind === 'chrome') ?? items[0]
  if (!primary) return null
  const site = known.find(item => item.kind === primary.kind && item.origin)?.origin
  const fallback = { icon: primary.icon, site, ...(failedRow && { failed: true }) }
  // The native labels for isolated skill calls and image previews include
  // their own details. Use the combined label only in mixed groups.
  if (known.length !== items.length ||
    primary.kind === 'image' && known.every(item => item.kind === primary.kind)) return fallback

  const latest = known.at(-1)
  const title = live ? latest.title : known.length === 1 ? primary.title : ''
  if (title) return { ...fallback, label: title }
  const has = kind => known.some(item => item.kind === kind)
  const commandCount = known.filter(item => item.kind === 'command').length
  const sources = [...new Map(known.flatMap(item => item.sources || []).map(source => [source.key, source])).values()]
  const sourceCount = known.filter(item => item.kind === 'integration' && !item.sources?.length).length
  const edits = known.filter(item => item.kind === 'edit')
  const editCount = new Set(edits.flatMap(item => item.paths.map(path => path.replaceAll('\\', '/')))).size +
    edits.filter(item => !item.paths.length).length
  const one = count => russian ? russianPlurals.select(count) === 'one' : count === 1
  const segments = []
  if (!live && detail && commandCount === 1 && primary.command) {
    return { ...fallback, label: failedRow ? 'Command failed (' + primary.command + ')' : primary.command }
  }
  if (!live && known.length === 1 && commandCount === 1 && primary.command) {
    const label = russian ? 'Выполнена команда ' : 'Ran command '
    return { ...fallback, label: label + primary.command }
  }
  if (known.length === 1 && primary.kind === 'read') {
    const { path, query, folder, exploreTool } = primary
    if (exploreTool === 'list_files') {
      const label = live
        ? summary ? (russian ? 'Получение списка файлов' : 'Listing files') + (folder ? (russian ? ' в папке ' : ' in ') + folder : '')
          : (russian ? 'Перечисление файлов' : 'Listing files') + (folder ? (russian ? ' в ' : ' in ') + folder : '')
        : folder ? (russian ? 'Перечислил файлы в ' : 'Listed files in ') + folder : (russian ? 'Перечисленные файлы' : 'Listed files')
      return { ...fallback, label }
    }
    if (exploreTool === 'search_files') {
      let label
      if (live && summary) label = folder ? (russian ? 'Поиск файлов в папке ' : 'Searching files in ') + folder
        : query ? (russian ? 'Поиск по запросу ' : 'Searching for ') + query : (russian ? 'Поиск файлов' : 'Searching files')
      else if (live) label = query ? (russian ? 'Поиск «' + query + '»' : 'Searching for ' + query) + (folder ? (russian ? ' в ' : ' in ') + folder : '')
        : (russian ? 'Поиск файлов' : 'Searching for files')
      else label = query ? (russian ? 'Выполнен поиск ' : 'Searched for ') + query + (folder ? (russian ? ' в ' : ' in ') + folder : '')
        : (russian ? 'Выполнен поиск файлов' : 'Searched for files')
      return { ...fallback, label }
    }
    if (path) return { ...fallback, label: (live ? (russian ? 'Чтение ' : 'Reading ') : (russian ? 'Прочитал ' : 'Read ')) + path }
  }
  if (known.length === 1 && primary.kind === 'skill') {
    if (!primary.skillName) return fallback
    return { ...fallback, label: russian ? (live ? 'Чтение навыка ' : 'Прочитал навык ') + primary.skillName
      : (live ? 'Reading ' : 'Read ') + primary.skillName + ' skill' }
  }
  if (detail && primary.kind === 'edit') {
    return { ...fallback, prefix: !live && russian ? (primary.created ? 'Создано ' : 'Редактирование ') : '' }
  }
  if ((detail || failedRow) && known.length === 1 && primary.kind === 'integration' && primary.action) {
    return { ...fallback, label: primary.action }
  }
  if (live) {
    const working = {
      chrome: russian ? 'Использован Chrome' : 'Used Chrome',
      browser: russian ? 'Использован браузер' : 'Used the browser',
      command: russian ? 'Выполняется команда' : 'Running command',
      integration: russian ? 'Вызывает инструмент' : 'Calling a tool',
      edit: russian ? 'Редактирование файлов' : 'Editing files',
      read: russian ? 'Читает файлы' : 'Reading files',
      skill: russian ? 'Читает скилл' : 'Reading a skill',
      image: russian ? 'Смотрит изображения' : 'Viewing images',
      history: russian ? 'Ищет в истории' : 'Searching chat history',
      'web-search': russian ? 'Ищет в интернете' : 'Searching the web',
      'web-read': russian ? 'Читает страницы' : 'Reading pages',
    }
    return { ...fallback, label: latest.kind === 'integration' && latest.action ? latest.action : working[latest.kind] }
  }
  if (sources.length) {
    const list = new Intl.ListFormat(russian ? 'ru' : 'en', { type: 'conjunction' }).format(sources.map(source =>
      source.key === 'browser-use' ? (russian ? 'браузер' : 'the browser') : source.name))
    const integration = sources.every(source => source.key !== 'browser-use')
    segments.push(integration ? (russian ? 'Использовано ' + (one(sources.length) ? 'интеграция ' : 'интеграции ') + list
      : 'Used ' + list + (sources.length === 1 ? ' integration' : ' integrations')) : (russian ? 'Использовал ' : 'Used ') + list)
  }
  if (editCount) {
    segments.push(russian
      ? (editCount === 1 ? 'Отредактировал файл' : 'Отредактировал файлы')
      : (editCount === 1 ? 'Edited a file' : 'Edited files'))
  }
  if (has('read') || has('skill')) segments.push(russian ? 'Прочитал файлы' : 'Read files')
  if (has('history')) segments.push(russian ? 'Выполнил поиск по истории' : 'Searched chat history')
  if (has('web-search')) segments.push(russian ? 'Выполнил поиск в интернете' : 'Searched the web')
  if (has('web-read')) segments.push(russian ? 'Прочитал страницы' : 'Read pages')
  if (has('image')) {
    const count = known.filter(item => item.kind === 'image').length
    const noun = { one: 'изображение', few: 'изображения', many: 'изображений' }[russianPlurals.select(count)]
    segments.push(russian ? 'Просмотрено ' + (count === 1 ? 'изображение' : count + ' ' + noun) :
      (count === 1 ? 'Viewed an image' : 'Viewed ' + count + ' images'))
  }
  if (!sources.length && has('browser')) {
    segments.push(russian ? 'Использовал браузер' : 'Used the browser')
    if (has('chrome')) segments.push(russian ? 'Chrome выполнил команды' : 'used Chrome')
  } else if (!sources.length && has('chrome')) {
    segments.push(russian ? 'Использована интеграция Chrome' : 'Used the Chrome integration')
  }
  if (sourceCount) segments.push(russian
    ? (sourceCount === 1 ? 'Вызвал инструмент' : 'Вызвал инструменты')
    : (sourceCount === 1 ? 'Called a tool' : 'Called tools'))
  if (commandCount) segments.push(russian
    ? (one(commandCount) ? 'Выполнил команду' : 'Выполнил команды')
    : (one(commandCount) ? 'Ran a command' : 'Ran commands'))
  // NKAf.eP renders every summary part with FormattedList(type='unit').
  // The Russian unit list uses spaces; only the source names use conjunction.
  const ordered = segments.map((text, index) => index ? text[0].toLowerCase() + text.slice(1) : text)
  return { ...fallback, label: activityList[russian ? 'ru' : 'en'].format(ordered) }
}
