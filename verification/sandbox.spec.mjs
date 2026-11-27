import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { bundlePlugin } from './bundle.mjs'
import { captureDirectoryIdentity, cleanupVisualTest } from './visual-test-cleanup.mjs'
import { runtimeAuditMode } from './runtime-audit-mode.mjs'
import { pinIsolatedRouting, assertLocalRoutingInputs, assertIsolatedGatewayDescriptor } from './isolated-routing.mjs'

const {
  HERMES_VISUAL_DESKTOP: desktopPath,
  HERMES_VISUAL_PYTHON: pythonPath,
  HERMES_VISUAL_MODE: mode = 'candidate',
} = process.env
assert(
  desktopPath && pythonPath && ['baseline', 'candidate'].includes(mode),
  'Set HERMES_VISUAL_DESKTOP, HERMES_VISUAL_PYTHON and HERMES_VISUAL_MODE before running the suite',
)
const desktop = fs.realpathSync(desktopPath)
const fixtureDesktop = fs.realpathSync(process.env.HERMES_VISUAL_FIXTURE_DESKTOP || desktop)
const repository = process.env.HERMES_VISUAL_TIMELINE_CORE ? fs.realpathSync(process.env.HERMES_VISUAL_TIMELINE_CORE) : path.resolve(desktop, '../..')
const fixtureRepository = path.resolve(fixtureDesktop, '../..')
const feature = path.resolve(import.meta.dirname, '..')
const pinnedRuntimeAudit = runtimeAuditMode(process.env) === 'pinned'
if (!pinnedRuntimeAudit) {
  console.warn('HCV_UNPINNED_PLAYWRIGHT: direct run; pinned runtime and gateway identity are not verified')
}
const evidence = path.join(feature, 'evidence')
const chatTransitionsFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-transitions'
const displayFocus = process.env.HERMES_VISUAL_FOCUS === 'display' || chatTransitionsFocus
const contextFocus = process.env.HERMES_VISUAL_FOCUS === 'context-meter'
const composerFocus = process.env.HERMES_VISUAL_FOCUS === 'composer'
const composerLiveFocus = process.env.HERMES_VISUAL_FOCUS === 'composer-live'
const modelMenuFocus = process.env.HERMES_VISUAL_FOCUS === 'model-menu'
const modelSpeedResponsesFocus = process.env.HERMES_VISUAL_FOCUS === 'model-speed-responses'
const modelSpeedAppserverFocus = process.env.HERMES_VISUAL_FOCUS === 'model-speed-appserver'
const modelSpeedFocus = modelSpeedResponsesFocus || modelSpeedAppserverFocus
const densityFocus = process.env.HERMES_VISUAL_FOCUS === 'density-parity'
const chatParityFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-parity'
const chatHoverFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-hover'
const subagentsPaneFocus = process.env.HERMES_VISUAL_FOCUS === 'subagents-pane'
const chatActivityFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-activity'
const tableFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-tables'
const draftSetupFocus = process.env.HERMES_VISUAL_FOCUS === 'draft-setup'
const newChatLayoutFocus = process.env.HERMES_VISUAL_FOCUS === 'new-chat-layout'
const newChatWelcomeFocus = process.env.HERMES_VISUAL_FOCUS === 'new-chat-welcome'
const styleScopeFocus = process.env.HERMES_VISUAL_FOCUS === 'style-scope'
const commandPaletteFocus = process.env.HERMES_VISUAL_FOCUS === 'command-palette'
const responsivenessFocus = process.env.HERMES_VISUAL_FOCUS === 'responsiveness'
const performanceFocus = process.env.HERMES_VISUAL_FOCUS === 'deep-performance'
const sessionNavigationFocus = process.env.HERMES_VISUAL_FOCUS === 'session-navigation'
const sidebarWidthFocus = process.env.HERMES_VISUAL_FOCUS === 'sidebar-width'
const projectCatalogFixFocus = process.env.HERMES_VISUAL_FOCUS === 'project-catalog-fix'
const sidebarActivityFocus = process.env.HERMES_VISUAL_FOCUS === 'sidebar-activity'
const projectActivityFocus = process.env.HERMES_VISUAL_FOCUS === 'project-activity'
const turnControlFocus = process.env.HERMES_VISUAL_FOCUS === 'turn-control'
const personalQueueFocus = process.env.HERMES_VISUAL_FOCUS === 'personal-queue'
const dictationFocus = process.env.HERMES_VISUAL_FOCUS === 'dictation'
const shellFocus = process.env.HERMES_VISUAL_FOCUS === 'shell-surfaces'
const replyErrorFocus = process.env.HERMES_VISUAL_FOCUS === 'reply-error'
const rateLimitFocus = replyErrorFocus && Boolean(process.env.HERMES_VISUAL_TIMELINE_PACKAGE)
const systemRuFocus = process.env.HERMES_VISUAL_FOCUS === 'system-ru'
const interfaceCopyFocus = process.env.HERMES_VISUAL_FOCUS === 'interface-copy'
const renameTabsFocus = process.env.HERMES_VISUAL_FOCUS === 'rename-tabs'
const turnDiffFocus = process.env.HERMES_VISUAL_FOCUS === 'turn-diff'
const savedTurnDiffFocus = turnDiffFocus && process.env.HERMES_VISUAL_TIMELINE_PARITY === '1'
const singleTurnDiffDelivery = savedTurnDiffFocus || process.env.HERMES_VISUAL_TURN_DIFF_MEDIA === '1'
const summaryLayoutFocus = process.env.HERMES_VISUAL_FOCUS === 'summary-layout'
const summaryParityFocus = process.env.HERMES_VISUAL_FOCUS === 'summary-parity'
const workspaceSummaryFocus = process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live'
const summarySourcesFocus = process.env.HERMES_VISUAL_FOCUS === 'summary-sources'
const imageParityFocus = process.env.HERMES_VISUAL_FOCUS === 'image-parity'
const videoParityFocus = process.env.HERMES_VISUAL_FOCUS === 'video-parity'
const activityComposerFocus = process.env.HERMES_VISUAL_FOCUS === 'activity-composer'
const activityParityFocus = process.env.HERMES_VISUAL_FOCUS === 'activity-parity'
const chatRhythmFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-rhythm'
const agentLifecycleFocus = process.env.HERMES_VISUAL_FOCUS === 'agent-lifecycle'
const activityBundlesFocus = process.env.HERMES_VISUAL_FOCUS === 'activity-bundles'
const approvalFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-approval'
const markdownParityFocus = process.env.HERMES_VISUAL_FOCUS === 'markdown-parity'
const fileLinksFocus = process.env.HERMES_VISUAL_FOCUS === 'file-links'
const reviewProposalsFocus = process.env.HERMES_VISUAL_FOCUS === 'review-proposals'
const activityCenterFocus = process.env.HERMES_VISUAL_FOCUS === 'activity-center'
const zoomBannerFocus = process.env.HERMES_VISUAL_FOCUS === 'zoom-banner'
const projectDialogFocus = process.env.HERMES_VISUAL_FOCUS === 'project-dialog'
const newChatDotFocus = process.env.HERMES_VISUAL_FOCUS === 'new-chat-dot'
const displayBaseline = process.env.HERMES_VISUAL_DISPLAY_BASELINE === '1'
const resolveDesktop = createRequire(path.join(fixtureDesktop, 'package.json')).resolve
const playwright = path.dirname(resolveDesktop('@playwright/test/package.json'))
const { test, expect, _electron } = await import(
  pathToFileURL(path.join(playwright, 'index.mjs'))
)
const { buildAppEnv, createSandbox, findElectron } = await import(
  pathToFileURL(path.join(fixtureDesktop, 'e2e/fixtures.ts'))
)
const { startMockServer, MOCK_REPLY } = await import(
  pathToFileURL(path.join(fixtureRepository, 'tests-js/scripts/mock-server.ts'))
)
const { writeMockProviderConfig, writeEnvFile } = await import(
  pathToFileURL(path.join(fixtureRepository, 'tests-js/scripts/mock-provider-config.ts'))
)
const { waitForChatReady, readChatIdentity, readMockPrompts } = await import(
  pathToFileURL(path.join(fixtureRepository, 'tests-js/scripts/desktop-chat-smoke.ts'))
)

function replyToEditFixture(res, request, tools, final = 'Изменил пять файлов и закончил проверку.') {
  const lastPrompt = request.messages.findLastIndex((message) => message.role === 'user')
  const settled = request.messages.slice(lastPrompt + 1).some((message) => message.role === 'tool')
  // The control note is the last of ten text messages in this saved chat.
  const controlNote = process.env.HERMES_VISUAL_FOCUS === 'turn-diff' && final.startsWith('Контрольная заметка сохранена.')
  const content = settled ? final : controlNote ? '' : 'Начинаю правки в тестовом проекте.'
  return replyToFixture(res, request, content, settled ? [] : tools)
}

function replyToFixture(res, request, content, tools) {
  const toolCalls = tools.map(({ id, name, args }, index) => ({
    id: id || `call_hcv_${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
  }))
  const message = { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }
  const finishReason = toolCalls.length ? 'tool_calls' : 'stop'
  const identity = { id: 'chatcmpl-hermes-visual', model: request.model, created: Math.floor(Date.now() / 1000) }
  if (!request.stream) {
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ...identity, object: 'chat.completion', choices: [{ index: 0, message, finish_reason: finishReason }],
    }))
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({
    ...identity, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }],
  })}\n\n`)
  chunk({ role: 'assistant', content })
  if (toolCalls.length) chunk({ tool_calls: toolCalls.map((call, index) => ({ index, ...call })) })
  chunk({}, finishReason)
  res.end('data: [DONE]\n\n')
}


function prepareTestChatLimits(sandbox, env) {
  const result = spawnSync(pythonPath, ['-B', '-X', 'utf8',
    path.join(feature, 'verification/isolated-chat-limit.py'), fs.realpathSync(sandbox.root)], {
    cwd: repository, encoding: 'utf8', timeout: 30000, windowsHide: true,
    env: { ...env, HERMES_VISUAL_TEST_TEMP: fs.realpathSync(os.tmpdir()) },
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'Could not enforce the test chat limit')
  console.log(result.stdout.trim())
}

async function createTestGateway(sandbox, env, providerUrl) {
  const home = path.join(sandbox.root, 'remote-profile')
  fs.mkdirSync(home)
  const folder = path.join(home, 'server-workspace')
  fs.mkdirSync(folder)
  writeMockProviderConfig(home, providerUrl)
  writeEnvFile(home, 'e2e-mock-key', providerUrl)
  const remoteEnv = {
    ...env, HERMES_HOME: home, USERPROFILE: home, PYTHONPATH: [repository, path.resolve(desktop, '../..')].join(path.delimiter),
    HERMES_DASHBOARD_SESSION_TOKEN: randomUUID(),
  }
  const seeded = spawnSync(pythonPath, ['-B', '-X', 'utf8', '-c',
    "from hermes_cli.projects_db import connect_closing, create_project; import pathlib, sys\nwith connect_closing(pathlib.Path(sys.argv[1]) / 'projects.db') as db:\n    create_project(db, name='Серверный проект', slug='server-workspace', folders=[sys.argv[2]])",
    home, folder,
  ], { cwd: repository, env: remoteEnv, encoding: 'utf8' })
  assert.equal(seeded.status, 0, seeded.stderr)
  prepareTestChatLimits(sandbox, env)
  const probe = createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const url = 'http://127.0.0.1:' + port
  const backend = spawn(pythonPath, ['-B', '-m', 'hermes_cli.main', 'serve', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: home, env: remoteEnv, windowsHide: true, stdio: 'ignore' })
  const close = async () => {
    if (backend.exitCode !== null || backend.signalCode || !backend.pid) return
    const exited = new Promise(resolve => backend.once('exit', resolve))
    backend.kill()
    await exited
  }
  try {
    await expect.poll(async () => {
      const response = await fetch(url + '/api/status', {
        headers: { Authorization: 'Bearer ' + remoteEnv.HERMES_DASHBOARD_SESSION_TOKEN },
        signal: AbortSignal.timeout(1000),
      }).catch(() => null)
      return response?.ok ?? false
    }, { timeout: 45000 }).toBe(true)
    fs.writeFileSync(path.join(sandbox.userDataDir, 'connections.json'), JSON.stringify({
      version: 2, primary: 'local', launchMode: 'primary', lastUsed: 'local',
      connections: [
        { id: 'local', kind: 'local', label: 'This device' },
        { id: 'hcv-fixture-vps', kind: 'remote', label: 'Hermes VPS HTTPS (тест)', url, authMode: 'token',
          token: { encoding: 'plain', value: remoteEnv.HERMES_DASHBOARD_SESSION_TOKEN } },
      ],
    }), 'utf8')
    return close
  } catch (error) {
    await close()
    throw error
  }
}

test(`${mode} native desktop smoke`, async () => {
  const delegateFocus = chatParityFocus || subagentsPaneFocus
  const settingsAudit = process.env.HERMES_VISUAL_FOCUS === 'settings-audit'
  const sidebarMoreFocus = ['sidebar-more', 'sidebar-more-all'].includes(process.env.HERMES_VISUAL_FOCUS)
  const localModelFocus = turnDiffFocus || rateLimitFocus || summaryLayoutFocus || activityComposerFocus || imageParityFocus || videoParityFocus || reviewProposalsFocus
    || chatActivityFocus || sidebarWidthFocus || summaryParityFocus || summarySourcesFocus || subagentsPaneFocus
    || chatHoverFocus || tableFocus || commandPaletteFocus || projectDialogFocus || newChatDotFocus || composerLiveFocus || approvalFocus || renameTabsFocus || newChatWelcomeFocus || turnControlFocus || personalQueueFocus
  if (responsivenessFocus || styleScopeFocus || performanceFocus || projectActivityFocus) test.setTimeout(300000)
  if (performanceFocus && process.env.HERMES_VISUAL_PERF_HOTSPOTS === '1') test.setTimeout(480000)
  if (settingsAudit || localModelFocus || sidebarMoreFocus) test.setTimeout(300000)
  if (activityParityFocus || markdownParityFocus || fileLinksFocus) test.setTimeout(230000)
  if (zoomBannerFocus) test.setTimeout(360000)
  if (composerFocus || delegateFocus || draftSetupFocus || densityFocus || process.env.HERMES_VISUAL_FOCUS === 'desktop-surfaces') {
    test.setTimeout(210000)
  }
  // A clean local profile may need extra time while Desktop checks its update
  // lock and starts its own gateway. Keep that wait within the test timeout.
  test.setTimeout(Math.max(test.info().timeout, sessionNavigationFocus ? 480000 : 360000))
  const chatParity = delegateFocus || draftSetupFocus ? await import('./chat-parity.spec-helper.mjs') : null
  const reviewProposals = reviewProposalsFocus ? await import('./review-proposals.spec-helper.mjs') : null
  const activityCenter = activityCenterFocus ? await import('./activity-center.spec-helper.mjs') : null
  const chatFixture = delegateFocus ? chatParity.makeChatFixture() : null
  const personalQueue = personalQueueFocus ? await import('./personal-queue.spec-helper.mjs') : null
  const queueFixture = personalQueue?.personalQueueFixture()
  if (personalQueueFocus) {
    assert(mode === 'candidate' && pinnedRuntimeAudit && process.env.HERMES_VISUAL_TIMELINE_PACKAGE &&
      process.env.HERMES_VISUAL_TIMELINE_CORE && process.env.HERMES_VISUAL_FIXTURE_PLUGIN,
    'Personal queue verification requires the packaged plugin and its pinned core overlay')
  }
  const performanceCheck = performanceFocus ? await import('./deep-performance.spec-helper.mjs') : null
  const dictation = dictationFocus ? await import('./dictation.spec-helper.mjs') : null
  const videoCheck = videoParityFocus ? await import('./video-parity.spec-helper.mjs') : null
  const chatReference = process.env.HERMES_VISUAL_CHAT_REFERENCE === '1'
  const sandbox = createSandbox('codex-visual')
  if (chatHoverFocus || sessionNavigationFocus) console.log('Isolated chat profile', sandbox.root)
  if (commandPaletteFocus) console.log('Isolated palette profile', sandbox.root)
  if (summaryParityFocus || summarySourcesFocus || subagentsPaneFocus) console.log('Isolated summary profile', sandbox.root)
  const sandboxRealPath = fs.realpathSync(sandbox.root)
  const relativeSandbox = path.relative(fs.realpathSync(os.tmpdir()), sandboxRealPath)
  assert(
    /^hermes-e2e-codex-visual-[^/\\]+$/.test(relativeSandbox),
    'Expected an isolated temporary test directory',
  )
  const sandboxIdentity = captureDirectoryIdentity(fs, sandbox.root)
  const prompt = 'Проверь рабочий чат и покажи короткий ответ.'
  const firstToken = sidebarActivityFocus || projectActivityFocus || sessionNavigationFocus || newChatDotFocus ? Promise.withResolvers() : null
  const voiceRequests = []
  const translationRequests = []
  const contextInferenceModels = []
  const turnControlChildGate = Promise.withResolvers()
  const turnControlCalls = []
  const projectFolder = path.join(sandbox.root, 'demo-workspace')
  const resourceFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-resources'
  if (resourceFocus || imageParityFocus) test.setTimeout(290000)
  const tables = tableFocus ? await import('./chat-tables.spec-helper.mjs') : null
  const tableFixture = tables?.makeTableFixture()
  const composerLive = composerLiveFocus ? await import('./composer-live.spec-helper.mjs') : null
  const composerFixture = composerLive?.makeComposerFixture(projectFolder)
  const sendCheck = imageParityFocus ? await import('./send-message.spec-helper.mjs') : null
  const sendFixture = sendCheck?.makeSendFixture()
  const editsPrompt = 'Обнови заметку и подготовь четыре тестовых файла.'
  const singleEditPrompt = 'Добавь две строки в один тестовый файл.'
  const singleFile = 'review/single-file.md'
  const newFiles = turnDiffFocus
    ? ['review/turn-change.py', 'docs/turn-change.py', 'scope-check.txt', 'diagnostics.txt']
    : ['turn-change.py', 'release-notes.md', 'scope-check.txt', 'diagnostics.txt']
  if (turnDiffFocus && process.env.HERMES_VISUAL_TURN_DIFF_TWELVE === '1') {
    newFiles.push(...Array.from({ length: 7 }, (_, index) => `extra-${index + 1}.txt`))
  }
  const seedLine = '# Строка для проверки'
  const oneLine = '# Добавленная строка'
  const appendLines = (file, lines) => ({
    name: 'patch', args: { mode: 'replace', path: path.join(projectFolder, file),
      old_string: seedLine, new_string: [seedLine, ...lines].join('\n') },
  })
  const fixtureTools = [
    { name: 'patch', args: { mode: 'replace', path: path.join(projectFolder, 'fixture-note.md'), old_string: '# Тестовый файл', new_string: '# Обновлённый тестовый файл' } },
    ...newFiles.map(name => turnDiffFocus ? appendLines(name, [oneLine])
      : { name: 'write_file', args: { path: path.join(projectFolder, name), content: 'Одна строка для проверки.\n' } }),
  ]
  const replyErrorCheck = replyErrorFocus ? await import('./reply-error.spec-helper.mjs') : null
  let rateLimitRequests = 0
  const mock = await startMockServer({
    extraModels: contextFocus || interfaceCopyFocus ? ['mock-wide'] : modelMenuFocus || modelSpeedFocus || densityFocus ? ['mock-variant-preview'] : undefined,
    holdFirstStreamForPrompt: mode === 'candidate' ? prompt : undefined,
  })
  // Track only this fixture's initial MCP exchanges; no user profile is read.
  const mcpInitialMethods = []
  const mcp = createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const data = Buffer.concat(chunks)
      if ((localModelFocus || sessionNavigationFocus) && req.url === '/models-registry.json') {
        const model = { id: 'mock-model', name: 'Mock Model', limit: { context: 64000, output: 4096 } }
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          mock: { id: 'mock', name: 'Mock', models: { [model.id]: model } },
        }))
      }
      if ((resourceFocus || markdownParityFocus) && req.url === '/resource-preview') {
        return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end('<title>Тестовый сайт</title><p>Локальная страница проверки.</p>')
      }
      if (dictationFocus && req.url === '/v1/audio/transcriptions') {
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-private-network': 'true',
        }
        if (req.method === 'OPTIONS') return res.writeHead(204, headers).end()
        const held = Promise.withResolvers()
        const sent = Promise.withResolvers()
        voiceRequests.push({ release: held.resolve, sent: sent.promise, bytes: data.length, contentType: req.headers['content-type'] })
        await held.promise
        return res.writeHead(200, { ...headers, 'content-type': 'text/plain; charset=utf-8' })
          .end('вставка голосом', sent.resolve)
      }
      if (req.url === '/mcp') {
        if (req.method !== 'POST') return res.writeHead(405).end()
        const body = JSON.parse(data.toString())
        if (pinnedRuntimeAudit && sidebarActivityFocus) mcpInitialMethods.push(body.method)
        if (body.id == null) return res.writeHead(202).end()
        const result = body.method === 'initialize'
          ? { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Fixture MCP', version: '1.0.0' } }
          : body.method === 'tools/list' ? { tools: [] } : {}
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
      }
      if (req.url === '/v1/chat/completions') {
        const request = JSON.parse(data.toString())
        if (activityCenterFocus && request.messages?.[0]?.content?.includes?.('Ты объясняешь владельцу предлагаемое изменение')) {
          const purpose = request.messages[0].content.includes('создание нового навыка')
            ? activityCenter.newSkillPurpose : 'Сверять дату и результаты тестового отчёта с источниками.'
          return replyToFixture(res, request, purpose, [])
        }
        if (contextFocus) { contextInferenceModels.push(request.model); console.log('Context inference model', request.model) }
        if (activityParityFocus && request.messages?.[0]?.content?.startsWith?.('Translate each string of the input JSON array')) {
          translationRequests.push(request)
          return res.writeHead(400).end('Translation must not run when a thought opens')
        }
        if (await performanceCheck?.replyToPerformancePrompt(res, request, projectFolder)) return
        if (await tableFixture?.reply(res, request)) return
        if (await sendFixture?.reply(request, (content, tools) => replyToFixture(res, request, content, tools))) return
        if (await composerFixture?.reply(request, (content, tools) => replyToFixture(res, request, content, tools))) return
        if (await chatFixture?.reply(request, (content, tools = []) => replyToFixture(res, request, content, tools))) return
        if (await queueFixture?.reply(request, (content, tools = []) => replyToFixture(res, request, content, tools))) return
        const message = request.messages?.findLast((item) => item.role === 'user')?.content
        if (rateLimitFocus && message?.includes?.(replyErrorCheck.rateLimitPrompt)) {
          rateLimitRequests++
          return replyErrorCheck.replyWithRateLimit(res)
        }
        if (turnControlFocus) {
          const text = Array.isArray(message) ? message.filter(part => part.type === 'text').map(part => part.text).join('\n')
            : typeof message === 'string' ? message : JSON.stringify(message)
          const full = JSON.stringify(request.messages)
          turnControlCalls.push({ text, child: full.includes('HCV_CHILD_WAIT'), at: Date.now() })
          if (text === 'HCV_STOP_NEXT') return replyToFixture(res, request, 'HCV_NEW_REPLY', [])
          if (text === 'HCV_STOP_EMPTY' || text === 'HCV_STOP_COMMAND') {
            const calls = request.messages.slice(request.messages.findLastIndex(item => item.role === 'user') + 1)
            if (text === 'HCV_STOP_COMMAND' && !calls.some(item => item.role === 'tool')) {
              return replyToFixture(res, request, 'Выполняю тестовую команду.', [
                { name: 'terminal', args: { command: 'echo HCV_STOP_COMMAND_OK' } },
              ])
            }
            await new Promise(resolve => res.once('close', resolve))
            return
          }
          if (text?.includes('Продолжи свою остановленную задачу')) {
            await turnControlChildGate.promise
            return replyToFixture(res, request, 'CHILD_RESUMED_HCV_STOP', [])
          }
          if (full.includes('CHILD_RESUMED_HCV_STOP')) return replyToFixture(res, request, 'HCV_ROOT_RESUMED', [])
          if (text?.includes('Продолжи остановленную задачу')) {
            return replyToFixture(res, request, 'Ожидаю восстановленного помощника.', [])
          }
          if (text?.includes('HCV_NEIGHBOR_PROCESS') || text?.includes('HCV_STOP_ROOT')) {
            const neighbor = text.includes('HCV_NEIGHBOR_PROCESS')
            const afterTools = request.messages.slice(request.messages.findLastIndex(item => item.role === 'user') + 1)
              .some(item => item.role === 'tool')
            if (!afterTools) {
              const pidFile = path.join(projectFolder, neighbor ? 'hcv-neighbor-process.pid' : 'hcv-stopped-process.pid').replaceAll('\\', '/')
              const command = `python -c "import os,time;from pathlib import Path;Path(r'${pidFile}').write_text(str(os.getpid()));time.sleep(180)"`
              const tools = [{ name: 'terminal', args: { command, background: true } }]
              if (!neighbor) tools.unshift({ name: 'patch', args: { mode: 'replace',
                path: path.join(projectFolder, 'fixture-note.md'), old_string: '# Тестовый файл', new_string: '# Сохранённая правка перед остановкой' } })
              if (!neighbor) tools.push({ name: 'delegate_task', args: {
                background: true, tasks: [{ task_name: 'stop_probe', goal: 'HCV_CHILD_WAIT HCV_STOP' }] } })
              return replyToFixture(res, request, 'Запускаю тестовую работу.', tools)
            }
            if (neighbor) return replyToFixture(res, request, 'HCV_NEIGHBOR_READY', [])
          }
          if (text?.includes('HCV_CHILD_WAIT') || text?.includes('HCV_STOP_ROOT')) {
            // A real provider wait: native hard interrupt must release this
            // request rather than merely hide a spinner in the renderer.
            await new Promise(resolve => res.once('close', resolve))
            return
          }
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: несколько файлов')) {
          const patch = '*** Begin Patch\n*** Update File: ' + path.join(projectFolder, 'AGENTS.md') +
            '\n@@\n-Исходное правило.\n+Новое правило.\n*** Update File: ' + path.join(projectFolder, 'fixture-note.md') +
            '\n@@\n-Изменение для проверки.\n+Новое примечание.\n*** End Patch'
          return replyToEditFixture(res, request, [{ name: 'patch', args: {
            mode: 'patch', patch, approval_reason: 'Согласовать правила и примечание',
          } }], 'Проверка завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: одинаковые имена')) {
          return replyToEditFixture(res, request, [
            { id: 'call_hcv_approval_a', name: 'patch', args: { mode: 'replace',
              path: path.join(projectFolder, 'AGENTS.md'), old_string: 'Исходное правило.',
              new_string: 'Первое изменение.', approval_reason: 'Причина первого файла' } },
            { id: 'call_hcv_approval_b', name: 'patch', args: { mode: 'replace',
              path: path.join(projectFolder, 'nested', 'AGENTS.md'), old_string: 'Вложенное правило.',
              new_string: 'Второе изменение.', approval_reason: 'Причина второго файла' } },
          ], 'Проверка очереди завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: вторая панель')) {
          return replyToEditFixture(res, request, [{ name: 'patch', args: { mode: 'replace',
            path: path.join(projectFolder, 'nested', 'AGENTS.md'), old_string: 'Вложенное правило.',
            new_string: 'Правило второй панели.', approval_reason: 'Уточнить правило во второй панели',
          } }], 'Проверка второй панели завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: обычная команда')) {
          return replyToEditFixture(res, request, [{ name: 'terminal', args: {
            command: `rm -rf "${path.join(projectFolder, 'approval-victim')}"`,
          } }], 'Проверка команды завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения: две одновременные правки')) {
          return replyToEditFixture(res, request, [
            { id: 'call_hcv_approval_agents', name: 'patch', args: {
              mode: 'replace', path: path.join(projectFolder, 'AGENTS.md'),
              old_string: 'Изменённое правило.', new_string: 'Новая версия.',
            } },
            { id: 'call_hcv_approval_claude', name: 'patch', args: {
              mode: 'replace', path: path.join(projectFolder, 'CLAUDE.md'),
              old_string: 'Исходное правило.', new_string: 'Новая версия.',
            } },
          ], 'Проверка очереди завершена.')
        }
        if (approvalFocus && message?.includes?.('Тест разрешения:')) {
          return replyToEditFixture(res, request, [{ name: 'patch', args: {
            mode: 'replace', path: path.join(projectFolder, 'AGENTS.md'),
            old_string: 'Исходное правило.', new_string: 'Изменённое правило.',
          } }], 'Тест разрешения завершён.')
        }
        if (interfaceCopyFocus && message?.includes?.('Проверка — текст отправки.')) {
          return replyToFixture(res, request, 'Новый ответ — готов.', [])
        }
        if (message?.includes?.(editsPrompt)) {
          const extra = savedTurnDiffFocus || (turnDiffFocus && process.env.HERMES_VISUAL_TURN_DIFF_MULTI_MEDIA === '1')
            ? ['fixture-note.md', newFiles[1], newFiles[3], 'fixture-rules.txt']
              .map(file => `\n\nMEDIA:"${path.join(projectFolder, file)}"`).join('') : ''
          const answer = turnDiffFocus && process.env.HERMES_VISUAL_TURN_DIFF_TWELVE === '1'
            ? 'Изменил 12 файлов и закончил проверку.' : 'Изменил пять файлов и закончил проверку.'
          return replyToEditFixture(res, request, fixtureTools, answer + extra)
        }
        if (savedTurnDiffFocus && message?.includes?.('Создай контрольную заметку для проверки истории.')) {
          return replyToEditFixture(res, request, [{ name: 'write_file', args: {
            path: path.join(projectFolder, 'timeline-native-write.txt'), content: 'Saved native write.\n',
          } }], 'Контрольная заметка сохранена.' + `\n\nMEDIA:"${path.join(projectFolder, 'timeline-native-write.txt')}"`)
        }
        if (turnDiffFocus && message?.includes?.(singleEditPrompt)) {
          return replyToEditFixture(res, request, [
            appendLines(singleFile, ['Первая строка.', 'Вторая строка.']),
          ], 'Изменил один тестовый файл.' + (singleTurnDiffDelivery
            ? `\n\nMEDIA:"${path.join(projectFolder, singleFile)}"\n\nMEDIA:"${path.join(projectFolder, 'docs', 'single-file.md')}"` : ''))
        }
        if (firstToken && message?.includes?.(prompt)) {
          await firstToken.promise
          if (sessionNavigationFocus || newChatDotFocus) return replyToFixture(res, request, MOCK_REPLY, [])
        }
      } else if (req.url !== '/v1/models') {
        return res.writeHead(404).end()
      }
      const upstream = await fetch(new URL(req.url, mock.url), {
        method: req.method,
        ...(data.length ? { body: data, headers: { 'content-type': 'application/json' } } : {}),
      })
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' })
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res)
    } catch (error) {
      if (res.headersSent) return res.destroy(error)
      res.writeHead(500).end(error.message)
    }
  })
  await new Promise((resolve) => mcp.listen(0, '127.0.0.1', resolve))
  const fixtureUrl = `http://127.0.0.1:${mcp.address().port}`
  const mcpUrl = `${fixtureUrl}/mcp`
  let app
  let closeTestGateway
  let electronLaunchAttempted = false
  let hasMainError = false
  let mainError

  try {
    fs.mkdirSync(path.join(projectFolder, '.git', 'objects'), { recursive: true })
    fs.mkdirSync(path.join(projectFolder, '.git', 'refs', 'heads'), { recursive: true })
    fs.writeFileSync(path.join(projectFolder, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    fs.writeFileSync(path.join(projectFolder, '.git', 'config'), '[core]\nrepositoryformatversion = 0\nbare = false\n')
    fs.writeFileSync(path.join(projectFolder, 'fixture-note.md'), '# Тестовый файл\n')
    if (newChatWelcomeFocus) fs.mkdirSync(path.join(sandbox.root, 'hcv-second-workspace'))
    if (approvalFocus) fs.writeFileSync(path.join(projectFolder, 'AGENTS.md'), 'Исходное правило.\n')
    if (approvalFocus) fs.writeFileSync(path.join(projectFolder, 'CLAUDE.md'), 'Исходное правило.\n')
    if (approvalFocus) fs.mkdirSync(path.join(projectFolder, 'approval-victim'))
    if (approvalFocus) { fs.mkdirSync(path.join(projectFolder, 'nested')); fs.writeFileSync(path.join(projectFolder, 'nested', 'AGENTS.md'), 'Вложенное правило.\n') }
    fs.writeFileSync(path.join(projectFolder, 'fixture-rules.txt'), 'Тестовое вложение\n')
    fs.writeFileSync(path.join(projectFolder, 'fixture-screen.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6v0AAAAASUVORK5CYII=', 'base64',
    ))
    if (process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live') {
      fs.mkdirSync(path.join(projectFolder, 'fixture-nested'))
      fs.writeFileSync(path.join(projectFolder, 'fixture-nested', 'anchor.txt'), 'Исходный файл\n')
    }
    if (turnDiffFocus) {
      for (const name of [singleFile, ...newFiles]) {
        const file = path.join(projectFolder, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, seedLine + '\n')
      }
      if (singleTurnDiffDelivery) {
        fs.writeFileSync(path.join(projectFolder, 'docs', 'single-file.md'), 'Другой файл с тем же именем.\n')
      }
    }
    // The native changed-files surface reports tracked files. Keep four
    // empty tracked fixtures so this general UI check measures five edits;
    // creation of untracked files is a separate host contract.
    if (process.env.HERMES_VISUAL_FOCUS === 'full') {
      for (const name of newFiles) fs.writeFileSync(path.join(projectFolder, name), '')
    }
    const emptyGitConfig = path.join(sandbox.root, 'fixture.gitconfig')
    fs.writeFileSync(emptyGitConfig, '')
    const git = (...args) => {
      const result = spawnSync('git', ['-C', projectFolder, '-c', `core.hooksPath=${path.join(sandbox.root, 'fixture-hooks')}`, ...args], {
        env: { ...process.env, GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.error?.message || result.stderr)
      return result.stdout
    }
    git('add', '--', 'fixture-note.md', 'fixture-rules.txt', 'fixture-screen.png')
    if (process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live') git('add', '--', 'fixture-nested/anchor.txt')
    if (process.env.HERMES_VISUAL_FOCUS === 'auto-project') {
      const autoFolder = path.join(sandbox.root, 'auto-workspace')
      fs.mkdirSync(autoFolder)
      git('-C', autoFolder, 'init', '-q')
    }
    if (turnDiffFocus) git('add', '--', singleFile, ...newFiles)
    if (process.env.HERMES_VISUAL_FOCUS === 'full') git('add', '--', ...newFiles)
    git('-c', 'user.name=Hermes Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Seed test file')
    if (draftSetupFocus) git('branch', 'hcv-fixture-branch')
    fs.appendFileSync(path.join(projectFolder, 'fixture-note.md'), '\nИзменение для проверки.\n')
    if (process.env.HERMES_VISUAL_FOCUS === 'review-polish') fs.writeFileSync(path.join(projectFolder, 'fixture-note.md'), '# Обновлённый тестовый файл\n')
    assert.match(git('status', '--short'), / M fixture-note\.md/)
    writeMockProviderConfig(
      sandbox.hermesHome,
      fixtureUrl,
      undefined,
      `terminal:\n  cwd: ${JSON.stringify(projectFolder)}\nauxiliary:\n  title_generation:\n    enabled: false\nmcp_servers:\n  Тестовый поиск:\n    url: ${mcpUrl}\n  Тестовые документы:\n    url: ${mcpUrl}`
        + (projectCatalogFixFocus ? `\n  github:\n    url: ${mcpUrl}` : '')
        + (turnControlFocus ? `\ngateway:\n  managed_workers: ${process.env.HCV_INPROC === '1' ? 'false' : 'true'}` : '')
        + (localModelFocus ? `\nmodels_dev:\n  url: ${fixtureUrl}/models-registry.json` : '')
        + (imageParityFocus ? '\nagent:\n  image_input_mode: native' : '')
        + (personalQueueFocus ? '\ndelegation:\n  provider: kimi-coding\n  model: kimi-for-coding' : '')
        + (modelSpeedFocus ? `\nmodel:\n  default: gpt-6.2-sol\n  provider: openai-codex\n  openai_runtime: ${modelSpeedAppserverFocus ? 'codex_app_server' : 'codex_responses'}` : '')
        + ((reviewProposalsFocus || activityCenterFocus) ? '\nskills:\n  write_approval: true\nmemory:\n  write_approval: true\n  memory_enabled: true\n  user_profile_enabled: true' : '')
        + ((activityCenterFocus || workspaceSummaryFocus || process.env.HERMES_VISUAL_TIMELINE_PACKAGE) ? '\nplugins:\n  enabled:\n    - hermes-codex-visual' : '')
        + (turnDiffFocus ? '\nlsp:\n  enabled: false' : '')
        + (rateLimitFocus ? '\nagent:\n  api_max_retries: 1' : '')
        + (dictationFocus ? `\nstt:\n  enabled: true\n  provider: openai\n  openai:\n    api_key: e2e-mock-key\n    base_url: ${fixtureUrl}/v1\n    model: whisper-1` : ''),
    )
    // Every focused run uses the same local mock provider. Its current
    // configuration reads OPENAI_API_KEY, including on screens without chat.
    writeEnvFile(sandbox.hermesHome, 'e2e-mock-key', fixtureUrl)
    if (personalQueueFocus) fs.appendFileSync(path.join(sandbox.hermesHome, '.env'),
      '\nKIMI_API_KEY=e2e-kimi-key\nKIMI_BASE_URL=' + fixtureUrl + '/v1\n')
    if (mode === 'candidate') {
      const pluginDir = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual')
      fs.mkdirSync(pluginDir, { recursive: true })
      const fixturePlugin = process.env.HERMES_VISUAL_FIXTURE_PLUGIN
      const source = fixturePlugin ? fs.readFileSync(fixturePlugin, 'utf8') : await bundlePlugin(desktop)
      const plugin = path.join(pluginDir, 'plugin.js')
      fs.writeFileSync(plugin, source, 'utf8')
      if (fixturePlugin) {
        const installed = fs.readFileSync(plugin)
        assert(installed.equals(fs.readFileSync(fixturePlugin)), 'Expected exact fixture module bytes')
        console.log('Fixture module SHA-256', createHash('sha256').update(installed).digest('hex'))
      }
    }

    if (activityCenterFocus || workspaceSummaryFocus || process.env.HERMES_VISUAL_TIMELINE_PACKAGE) {
      const packageDir = fs.realpathSync(process.env.HERMES_VISUAL_TIMELINE_PACKAGE || process.env.HERMES_VISUAL_ACTIVITY_PACKAGE)
      assert(fs.existsSync(path.join(packageDir, 'activity.py')), 'Expected exact ZIP backend')
      if (workspaceSummaryFocus) assert(process.env.HERMES_VISUAL_ACTIVITY_PACKAGE, 'Use the backend from the tested ZIP')
      const target = path.join(sandbox.hermesHome, 'plugins', 'hermes-codex-visual')
      fs.mkdirSync(target, { recursive: true })
      for (const name of ['plugin.yaml', '__init__.py', 'assistant.py', 'activity.py', 'turn_changes.py', 'timeline.py', 'agent_receipts.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py']) {
        fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true })
        fs.copyFileSync(path.join(packageDir, name), path.join(target, name))
      }
    }

    const roaming = path.join(sandbox.root, 'AppData', 'Roaming')
    const local = path.join(sandbox.root, 'AppData', 'Local')
    fs.mkdirSync(roaming, { recursive: true })
    fs.mkdirSync(local, { recursive: true })
    const env = pinIsolatedRouting(sandbox, buildAppEnv(sandbox, {
      HERMES_DESKTOP_HERMES_ROOT: repository,
      HERMES_DESKTOP_PYTHON: fs.realpathSync(pythonPath),
      HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION: '1',
      PYTHONPATH: [repository, path.resolve(desktop, '../..')].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: '1',
      // All scenarios use the already installed test runtime and a local mock.
      // A fresh temporary data root must not start dependency installation in
      // the shared Hermes checkout while the isolated gateway is booting.
      HERMES_DISABLE_LAZY_INSTALLS: '1',
      GIT_CONFIG_GLOBAL: emptyGitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      USERPROFILE: sandbox.root,
      APPDATA: roaming,
      LOCALAPPDATA: local,
    }))
    if (modelSpeedFocus) {
      // Mark only the already-verified private test home; the overlay refuses any other home.
      fs.writeFileSync(path.join(sandbox.root, 'model-speed-mode'), modelSpeedResponsesFocus ? 'responses' : 'appserver')
      fs.writeFileSync(path.join(sandbox.root, 'model-speed-catalog-state'), 'online')
      fs.writeFileSync(path.join(sandbox.root, 'model-speed-gateway-trace.jsonl'), '')
    }
    delete env.HERMES_DESKTOP_REMOTE_URL
    delete env.HERMES_DESKTOP_DEV_SERVER
    videoCheck?.seedVideos(projectFolder)
    const projectSeedProgram = `
from pathlib import Path
from time import time
from urllib.parse import quote
import sys
from hermes_cli.projects_db import connect_closing, create_project, set_active
from hermes_cli.config import DEFAULT_CONFIG
from hermes_state import SessionDB
config = Path(sys.argv[1]).with_name('config.yaml')
with config.open('a', encoding='utf-8') as stream:
    stream.write(chr(10) + '_config_version: ' + str(DEFAULT_CONFIG['_config_version']) + chr(10))
with connect_closing(Path(sys.argv[1])) as conn:
    pid = create_project(conn, name='Atlas' if sys.argv[3] == 'readme' else 'Тестовый проект', slug='demo-workspace', folders=[sys.argv[2]])
    for slug, name in [('site', 'Сайт'), ('design', 'Дизайн')]:
        if sys.argv[3] == 'readme':
            name = 'Website' if slug == 'site' else 'Design'
        folder = Path(sys.argv[2]).parent / slug
        folder.mkdir()
        create_project(conn, name=name, slug=slug, folders=[str(folder)])
    set_active(conn, pid)
db = SessionDB(db_path=Path(sys.argv[1]).with_name('state.db'))
if sys.argv[3] == 'sidebar-row-parity':
    db.create_session('20261121_120000_home01', 'desktop', model='mock-model', profile_name='default')
    db.set_session_title('20261121_120000_home01', 'Чат без проекта')
    db.append_message('20261121_120000_home01', 'user', 'Сохранённый запрос без проекта.')
    db.append_message('20261121_120000_home01', 'assistant', 'Сохранённый ответ без проекта.')
if sys.argv[3] == 'auto-project':
    auto = str(Path(sys.argv[2]).parent / 'auto-workspace')
    db.create_session('20261118_120000_auto01', 'desktop', model='mock-model', cwd=auto, profile_name='default', git_repo_root=auto)
    db.set_session_title('20261118_120000_auto01', 'Чат автоматического проекта')
    db.append_message('20261118_120000_auto01', 'user', 'Тестовый запрос.')
    db.append_message('20261118_120000_auto01', 'assistant', 'Тестовый ответ.')
if sys.argv[3] in ('sidebar-more', 'sidebar-more-all'):
    five_folder = Path(sys.argv[2]).parent / 'five'
    five_folder.mkdir()
    with connect_closing(Path(sys.argv[1])) as conn:
        create_project(conn, name='Пять чатов', slug='five', folders=[str(five_folder)])
    for folder, count, prefix, token in [(Path(sys.argv[2]), 58, 'Основной', 'a'), (Path(sys.argv[2]).parent / 'site', 4, 'Четыре', 'b'), (Path(sys.argv[2]).parent / 'design', 3, 'Три', 'c'), (five_folder, 5, 'Пять', 'e')]:
        for number in range(1, count + 1):
            sid = f'20261118_13{number:04d}_{token}{number:04d}'
            db.create_session(sid, 'desktop', model='mock-model', cwd=str(folder), profile_name='default', git_repo_root=str(folder))
            db.set_session_title(sid, f'{prefix} чат {number:02d}')
            db.append_message(sid, 'user', 'Тестовый запрос.', timestamp=time() - (count - number) * 60)
            db.append_message(sid, 'assistant', 'Тестовый ответ.', timestamp=time() - (count - number) * 60 + 1)
titles = ['Ревью интерфейса', 'Проверка каталога']
if sys.argv[3] == 'workspace-summary-live':
    titles.append('Вложенный каталог')
if sys.argv[3] == 'readme':
    titles = ['Workspace overview', 'Release checklist']
if sys.argv[3] == 'summary':
    titles.append('새 채팅 확인')
if sys.argv[3] == 'sidebar-chat-order':
    titles.append('Третий тестовый чат')
for i, title in enumerate(titles, 1):
    sid = f'20261108_12450{i}_aab00{i}'
    session_cwd = (str(Path(sys.argv[2]).parent / 'site') if i == 2 else str(Path(sys.argv[2]) / 'fixture-nested')) if i in (2, 3) and sys.argv[3] == 'workspace-summary-live' else sys.argv[2]
    db.create_session(sid, 'desktop', model='gpt-6.2-sol' if sys.argv[3] in ('model-speed-responses', 'model-speed-appserver') else 'mock-model', cwd=session_cwd, profile_name='default', git_repo_root=session_cwd)
    db.set_session_title(sid, title)
    if i == 2 and sys.argv[3] == 'activity-parity':
        continue
    request = 'Review the workspace and suggest the next steps.' if sys.argv[3] == 'readme' else 'Проверь тестовый проект.'
    if i == 2 and sys.argv[3] != 'readme':
        request += chr(10) + '@image:' + chr(96) + (Path(sys.argv[2]) / 'fixture-screen.png').as_posix() + chr(96)
        request += chr(10) + '@file:fixture-rules.txt'
        if sys.argv[3] == 'summary-parity':
            request = '@folder:' + chr(96) + (Path(sys.argv[2]).parent / 'site').as_posix() + chr(96) + chr(10) + request
    sent = time() - 5 * 86400 if i == 2 and sys.argv[3] == 'sidebar-activity' else None
    if i == 1 and sys.argv[3] == 'turn-diff' and ${process.env.HERMES_VISUAL_TIMELINE_PARITY === '1' ? 'True' : 'False'}:
        sent = time() - 3 * 3600
    if i == 1 and sys.argv[3] == 'density-parity':
        from datetime import datetime
        sent = datetime.fromisoformat('2026-11-12T16:44:00+03:00').timestamp()
    if sys.argv[3] == 'sidebar-chat-order':
        sent = time() - (3 - i) * 7 * 86400
    db.append_message(sid, 'user', request, timestamp=sent)
    reply = 'Тестовый чат готов к проверке.'
    if i == 1 and sys.argv[3] == 'image-parity':
        reply += chr(10) * 2 + (chr(10) * 2).join(f'Абзац {n} для проверки прокрутки открытого чата.' for n in range(1, 31))
    if sys.argv[3] == 'interface-copy':
        reply = ${JSON.stringify('Тестовый чат готов к проверке (ответ) — всё видно.\n\n`a—b`\n\n[Ссылка — пример](https://example.invalid/a%E2%80%94b)')}
    if sys.argv[3] == 'readme':
        reply = ${JSON.stringify('## Your workspace at a glance\n\nKeep the conversation, project context, and changes together. Here is a short overview for the **Atlas** demo project.\n\n| Area | Next step |\n| --- | --- |\n| Project | Review the release checklist |\n| Interface | Check the light and dark themes |\n| Changes | Open the diff before committing |\n\n### Ready for the next task\n\n- Open **Sources**, **Subagents**, or **Changes** from the summary.\n- Keep a draft in the composer while you review a reply.\n- Use `npm run check` to verify the build.\n\n[View the plugin on GitHub](https://github.com/arseniy-io/hermes-codex-visual)')}
    if i == 2 and sys.argv[3] in ('summary', 'summary-layout', 'summary-sources', 'desktop-surfaces', 'summary-parity'):
        reply += chr(10) * 2 + '[Preview: Заметка проекта](#preview/' + quote((Path(sys.argv[2]) / 'fixture-note.md').as_posix(), safe='') + ')'
        reply += chr(10) * 2 + '[Справка по каталогу](https://example.invalid/connector-guide)'
        if sys.argv[3] == 'summary-parity':
            reply += chr(10) * 2 + '[Проверка правок сайта](https://github.com/example/site/pull/42)'
        if sys.argv[3] == 'desktop-surfaces':
            folder = Path(sys.argv[2])
            for name in ('review-notes.md', 'interface-metrics.csv', 'release-check.txt'):
                artifact = folder / name
                artifact.write_text('Тестовый результат', encoding='utf-8')
                reply += chr(10) * 2 + f'[{name}]({artifact.as_uri()})'
            for slug in ('setup-guide', 'search-examples', 'desktop-notes'):
                reply += chr(10) * 2 + f'[Документация](https://example.invalid/{slug})'
        if sys.argv[3] in ('summary', 'summary-layout'):
            for line in range(1, 37):
                reply += chr(10) * 2 + f'Контрольный абзац {line}. Проверка положения длинного разговора при открытии сводки.'
    elif i == 2 and sys.argv[3] == 'video-parity':
        folder = Path(sys.argv[2])
        reply = (chr(10) * 2).join([
            'Готов вертикальный ролик для проверки.',
            'MEDIA:' + (folder / 'portrait.mp4').as_posix(),
            'Вариант с горизонтальным кадром.',
            '[Демонстрация](' + (folder / 'landscape.mp4').as_uri() + ')',
            'Конец ответа с двумя роликами.',
        ])
    elif i == 2 and sys.argv[3] == 'chat-resources':
        import wave
        folder = Path(sys.argv[2])
        long_file = folder / ('fixture-' + 'long-file-name-' * 8 + 'report.txt')
        long_file.write_text('Тестовый отчёт', encoding='utf-8')
        audio = folder / 'fixture-audio.wav'
        with wave.open(str(audio), 'wb') as wav:
            wav.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
            wav.writeframes(bytes(64000))
        def preview(label, target):
            return '[' + label + '](#preview/' + quote(target, safe='') + ')'
        fence = chr(96) * 3
        html = '<!doctype html><html><head><title>Отчёт проверки</title></head><body><h1>Содержимое артефакта</h1>' + '<p>Тестовая строка отчёта.</p>' * 4 + '</body></html>'
        reply = (chr(10) * 2).join([
            'Подготовил результаты проверки.',
            preview('Preview: Заметка проекта', (folder / 'fixture-note.md').as_posix()),
            '[Полный отчёт](' + long_file.as_uri() + ')',
            preview('Тестовый сайт', sys.argv[4] + '/resource-preview'),
            chr(10).join([fence + 'html', html, fence]),
            'MEDIA:' + audio.as_posix(),
            preview('Папка проекта', folder.as_posix()),
        ])
    elif i == 2 and sys.argv[3] == 'file-links':
        reply = 'Подготовил материалы для проверки.'
    elif i == 2:
        reply = '[Заметка проекта](' + (Path(sys.argv[2]) / 'fixture-note.md').as_posix() + ')'
    db.append_message(sid, 'assistant', reply, timestamp=sent)
if sys.argv[3] == 'activity-composer':
    import json
    sid = '20261115_183000_aaa015'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Время выполнения')
    for index, elapsed in enumerate((88.5, 8137.25, 0, 0.5), 1):
        sent = time() - (5 - index) * 86400
        db.append_message(sid, 'user', f'Проверь тестовый проект. Запрос {index}.', timestamp=sent)
        call_id = f'activity-composer-{index}'
        native_calls = [{'id': call_id, 'type': 'function', 'function': {
            'name': 'read_file', 'arguments': json.dumps({'path': str(Path(sys.argv[2]) / 'fixture-note.md')})}}]
        db.append_message(sid, 'assistant', None, tool_calls=native_calls, timestamp=sent)
        db.append_message(sid, 'tool', json.dumps({'content': 'Тестовая строка', 'total_lines': 1}),
                          tool_name='read_file', tool_call_id=call_id, timestamp=sent)
        db.append_message(sid, 'assistant', f'Проверка {index} завершена. Содержимое файла сверено.', timestamp=sent + elapsed)
if sys.argv[3] in ('deep-performance', 'session-navigation', 'chat-hover'):
    sid = '20261110_110000_face01'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Длинное название чата для проверки плавного затухания в проекте и верхней вкладке' if sys.argv[3] == 'session-navigation' else 'Длинный тестовый чат')
    def long_reply(index, paragraphs):
        return (chr(10) * 2).join([
            f'Ответ {index:02d}. Контрольный текст для проверки длинного разговора.',
            *[f'Абзац {line}. Текст для замера прокрутки.' for line in range(1, paragraphs + 1)],
            '- Пункт проверки' + chr(10) + '- Ещё один пункт.',
            '| A | B |' + chr(10) + '| --- | --- |' + chr(10) + f'| {index} | {index * 2} |',
            '[Источник](https://example.invalid/reference-' + str(index) + ')',
        ])
    indices = {
        'deep-performance': (60,),
        'session-navigation': (59, 60),
        'chat-hover': range(56, 61),
    }[sys.argv[3]]
    for index in indices:
        paragraphs = 60 if sys.argv[3] == 'deep-performance' else 18 if index < 59 else 0
        db.append_message(sid, 'user', f'Тестовое сообщение {index:02d}')
        db.append_message(sid, 'assistant', long_reply(index, paragraphs),
                          timestamp=time() - 2 * 86400 if sys.argv[3] == 'chat-hover' else None)
    if sys.argv[3] == 'deep-performance' and ${process.env.HERMES_VISUAL_PERF_HOTSPOTS === '1' ? 'True' : 'False'}:
        sid = '20261110_110004_face05'
        db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
        db.set_session_title(sid, 'Повторный потоковый замер')
        db.append_message(sid, 'user', 'Тестовое сообщение 60')
        db.append_message(sid, 'assistant', long_reply(60, 60))
if sys.argv[3] == 'session-navigation':
    for tab, title in enumerate(('Фокус', 'Заметки о проекте', 'Вкладка с длинным названием для проверки постоянной ширины и обрезки текста'), 1):
        sid = f'20261110_11000{tab}_face0{tab + 1}'
        db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
        db.set_session_title(sid, title)
        for index in range(20, 25):
            db.append_message(sid, 'user', f'Вкладка {tab}, запрос {index}.')
            parts = [f'Вкладка {tab}, ответ {index}.', '- Пункт проверки' + chr(10) + '- Ещё один пункт.']
            if tab == 1:
                parts.extend(f'Абзац {line}. Контрольный текст для восстановления места чтения.' for line in range(1, 15))
            if index % 6 == 0:
                parts.append('| A | B |' + chr(10) + '| --- | --- |' + chr(10) + f'| {index} | {index * 2} |')
            db.append_message(sid, 'assistant', (chr(10) * 2).join(parts))
if sys.argv[3] == 'shell-surfaces':
    sid = '20261108_124506_aab006'
    db.create_session(sid, 'desktop', model='mock-model', profile_name='default')
    db.set_session_title(sid, 'Чат без папки')
    db.append_message(sid, 'user', 'Проверка чата без папки.')
if sys.argv[3] == 'agent-lifecycle':
    import json
    timeline_seed = None
    if ${process.env.HERMES_VISUAL_TIMELINE_PARITY === '1' ? 'True' : 'False'}:
        import importlib.util
        timeline_spec = importlib.util.spec_from_file_location('hcv_timeline_fixture', ${JSON.stringify(path.join(feature, 'verification', 'timeline-parity-seed.py'))})
        timeline_seed = importlib.util.module_from_spec(timeline_spec)
        timeline_spec.loader.exec_module(timeline_seed)
    parent = '20261108_124502_aab002'
    agents = [
        ('fixture-agent-method', '20261120_103001_ded001', 'agent_names', '/root/agent_names',
         'Независимый read-only критик E2 небольшой правки методики Rublix. Прочитай точные правила и найди смысловые противоречия. Файлы не меняй.'),
        ('fixture-agent-examples', '20261120_103002_ded002', 'agent_events_tests', '/root/agent_events_tests',
         'Примени действующие проектные документы к восьми ситуациям из CONTROL-INPUTS.md. Для каждой ситуации проверь уместность ответа, не меняй исходные файлы.'),
        ('fixture-agent-spacing', '20261120_103003_000004', 'reference_audit', '/root/reference_audit',
         'Проверь отступы в ленте Hermes Desktop и сравни их с Codex Desktop. Измерь промежутки между текстом, командами и событиями агентов.'),
    ]
    started = time() - 120
    for worker, child, task_name, agent_path, goal in agents:
        db.create_session(child, 'subagent', parent_session_id=parent, cwd=sys.argv[2], profile_name='default',
                          model='gpt-6.1-sol', system_prompt='HCV_PRIVATE_STARTUP_INSTRUCTIONS',
                          model_config={'_subagent_id': worker, '_delegate_from': parent,
                                        '_task_name': task_name, '_agent_path': agent_path,
                                        'reasoning_config': {'enabled': True, 'effort': 'max'}})
        db.set_session_hidden(child, True)
        messages = [
            {'role': 'system', 'content': 'HCV_PRIVATE_MODEL_CONTEXT', 'display_metadata': {'model_only': True}},
            {'role': 'user', 'content': 'HCV_PRIVATE_HISTORY_CONTEXT', 'display_kind': 'hidden'},
            {'role': 'user', 'content': goal + chr(10) * 2 + '--- Attached Context ---' + chr(10) + 'HCV_PRIVATE_ATTACHED_CONTEXT'},
            {'role': 'assistant', 'content': 'Сверяю сохранённые правила и вывод команды.'},
            {'role': 'assistant', 'content': None, 'tool_calls': [
                {'id': 'github-read', 'type': 'function', 'function': {'name': 'mcp__github__fetch_file', 'arguments': json.dumps({
                    'path': 'README.md', 'labels': ['keep-user-label'], 'hermes_tool_labels': [
                        {'kind': 'mcp', 'app': 'GitHub', 'name': 'mcp__github__fetch_file', 'text': 'GitHub · fetch file', 'action': 'fetch file'}]})}},
                {'id': 'github-read-2', 'type': 'function', 'function': {'name': 'mcp__github__fetch_file', 'arguments': json.dumps({'path': 'PROJECT.md'})}},
                {'id': 'github-read-3', 'type': 'function', 'function': {'name': 'mcp__github__fetch_file', 'arguments': json.dumps({'path': 'LEARNING.md'})}},
                {'id': 'shell-check', 'type': 'function', 'function': {'name': 'terminal', 'arguments': json.dumps({'command': 'node tools/check-agent.mjs'})}},
                {'id': 'shell-fail', 'type': 'function', 'function': {'name': 'terminal', 'arguments': json.dumps({'command': 'node tools/check-agent-fail.mjs'})}},
            ]},
            {'role': 'tool', 'tool_name': 'mcp__github__fetch_file', 'tool_call_id': 'github-read', 'content': 'Saved README content.'},
            {'role': 'tool', 'tool_name': 'mcp__github__fetch_file', 'tool_call_id': 'github-read-2', 'content': 'Saved PROJECT content.'},
            {'role': 'tool', 'tool_name': 'mcp__github__fetch_file', 'tool_call_id': 'github-read-3', 'content': 'Saved LEARNING content.'},
            {'role': 'tool', 'tool_name': 'terminal', 'tool_call_id': 'shell-check', 'content': json.dumps({'stdout': 'Agent fixture command passed.', 'exit_code': 0})},
            {'role': 'tool', 'tool_name': 'terminal', 'tool_call_id': 'shell-fail', 'content': json.dumps({'output': 'Agent fixture command failed.', 'exit_code': 7})},
            {'role': 'assistant', 'content': (chr(10) * 2).join(
                'Сохранённый шаг проверки ' + str(index + 1) for index in range(18))},
            {'role': 'assistant', 'content': 'Проверка завершена. Замечания переданы основному агенту.\\n\\nФайл: \\x60result.txt\\x60.\\n\\n| Пункт | Статус |\\n| --- | --- |\\n| Проверка | Готово |'},
        ]
        for index, message in enumerate(messages):
            message.update(message_uid=worker + '-' + str(index), timestamp=started + index)
        # The real SessionDB stamps durable call/result UIDs and the real REST
        # route paginates this history; RPC below proves only child ownership.
        if timeline_seed is not None:
            messages = timeline_seed.with_child_timeline(messages, worker=worker, child=child,
                project_folder=sys.argv[2], now=time())
        db.append_messages_batch(child, messages)
if sys.argv[3] == 'agent-lifecycle' and ${process.env.HERMES_VISUAL_LEGACY_AGENTS === '1' ? 'True' : 'False'}:
    import importlib.util
    legacy_spec = importlib.util.spec_from_file_location('hcv_legacy_agents_fixture', ${JSON.stringify(path.join(feature, 'verification', 'legacy-agent-seed.py'))})
    legacy_seed = importlib.util.module_from_spec(legacy_spec)
    legacy_spec.loader.exec_module(legacy_seed)
    legacy_seed.seed_legacy_agents(db, sys.argv[2], now=time())
if sys.argv[3] == 'summary-parity':
    import json
    parent = '20261108_124502_aab002'
    started = time() - 180
    goals = ['Проверить описание сайта', 'Пропустить занятую задачу', 'Сверить сохранённый отчёт']
    workers = [(0, 'sa-0-feed7600'), (2, 'sa-2-feed7602')]
    args = {'tasks': [{'goal': goal} for goal in goals], 'background': True}
    db.append_message(parent, 'user', 'Передай задачи и сохрани результаты.', timestamp=started)
    db.append_message(parent, 'assistant', None, tool_calls=[{'id': 'call-summary-history', 'type': 'function',
                       'function': {'name': 'delegate_task', 'arguments': json.dumps(args)}}], timestamp=started)
    handle = {'status': 'dispatched', 'mode': 'background', 'count': len(workers), 'goals': goals,
              'delegation_id': 'fixture-summary-history', 'subagent_ids': [worker for _, worker in workers],
              'refused': [{'task_index': 1, 'status': 'error', 'error': 'Тестовый слот недоступен'}]}
    db.append_message(parent, 'tool', json.dumps(handle), tool_name='delegate_task', tool_call_id='call-summary-history',
                      timestamp=started + 1)
    db.append_message(parent, 'assistant', 'Задачи переданы в фоновую работу.', timestamp=started + 2)
    for index, worker in workers:
        child = f'20261108_12451{index}_feed0{index}'
        db.create_session(child, 'subagent', parent_session_id=parent, cwd=sys.argv[2], profile_name='default',
                          model='mock-model', model_config={'_subagent_id': worker, '_delegate_from': parent})
        db.set_session_hidden(child, True)
        db.append_message(child, 'user', goals[index], timestamp=started + 3)
        db.append_message(child, 'assistant', None, tool_calls=[{'id': 'call-summary-child', 'type': 'function',
                          'function': {'name': 'read_file', 'arguments': '{}'}}], timestamp=started + 5)
        db.append_message(child, 'tool', '{"content":"Fixture"}', tool_name='read_file',
                          tool_call_id='call-summary-child', timestamp=started + 11)
        nl = chr(10)
        tick = chr(96)
        if index == 2:
            answer = (nl * 2).join([
                'Сохранённый ответ 2. Готовы два **контрольных примера**. Сверь ' + tick + 'fixture.md' + tick +
                ' и [описание проверки](https://example.invalid/review).',
                nl.join([
                    '| Заявка | Что проверяет агент | Результат |',
                    '| --- | --- | --- |',
                    '| **Первая.** Проверь текст и ссылки в сохранённом ответе. | Встроенная таблица сохраняет форматирование и прокручивается целиком. | Готово |',
                    '| **Вторая.** Сравни тот же пример в узкой вкладке и в раскрытом окне. | Строки и кнопки остаются доступны с клавиатуры. | Готово |',
                ]),
                '### Проверка файла',
                '- Первый пункт проверки.' + nl + '- Второй пункт проверки.',
                tick * 3 + 'js' + nl + 'const result = "fixture"' + nl + tick * 3,
                'Текст после таблицы и блока кода.',
            ])
        else:
            answer = json.dumps({'answer': 'Сохранённый ответ 0.', 'checks': ['text', 'table']}, ensure_ascii=False, indent=2)
        db.append_message(child, 'assistant', answer, timestamp=started + 43)
if sys.argv[3] == 'chat-parity':
    from datetime import datetime
    sid = '20261110_110000_face01'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Лента и редактор')
    text = chr(10).join(f'Сообщение, которое уходит вверх. Строка {n:02d}.' for n in range(1, 25))
    sent = datetime.now().replace(hour=13, minute=13, second=0, microsecond=0).timestamp()
    db.append_message(sid, 'user', text + ' ' + chr(96) + 'markdown' + chr(96), timestamp=sent)
    db.append_message(sid, 'assistant', (chr(10) * 2).join(
        [f'Абзац {n:02d}. Проверка прокрутки длинного ответа в ленте.' for n in range(1, 55)]
        + ['Последний абзац длинного ответа.']))
if sys.argv[3] == 'activity-parity':
    import json
    sid = '20261108_124502_aab002'
    folder = Path(sys.argv[2])
    skill = folder / 'fixture-skill' / 'SKILL.md'
    skill.parent.mkdir()
    skill.write_text('# Тестовый скилл' + chr(10) * 2 + 'Инструкция из отдельного профиля.', encoding='utf-8')
    def append_activity(calls):
        db.append_message(sid, 'assistant', None, tool_calls=[
            {'id': call_id, 'type': 'function', 'function': {
                'name': name, 'arguments': json.dumps(args, ensure_ascii=False)
            }}
            for call_id, name, args, _ in calls
        ])
        for call_id, name, _, result in calls:
            db.append_message(sid, 'tool', json.dumps(result, ensure_ascii=False), tool_name=name, tool_call_id=call_id)
    db.append_message(sid, 'user', 'Покажи шаги проверки навыков и браузера.')
    from urllib.parse import quote_plus
    db.append_message(sid, 'assistant', 'Для сборки использую [' + chr(92) + '$fixture-skill?label=' +
        quote_plus('Мультролики с твоим героем') + '](<' +
        skill.as_posix() + '>) и [Памятку](<' + (folder / 'fixture-note.md').as_posix() +
        '>). Обычный код: ' + chr(96) + '$fixture-skill' + chr(96) + '.')
    append_activity([
        ('tool_open_skill', 'skill_view', {'name': 'fixture-skill'}, {'success': True, 'content': 'Инструкция'}),
    ])
    db.append_message(sid, 'assistant', 'Сначала проверяю подключения браузера.')
    append_activity([
        ('tool_browser', 'browser_snapshot', {}, {'success': True, 'snapshot': 'Browser fixture'}),
        ('tool_chrome', 'mcp_chrome_devtools_list_pages', {}, {'result': 'Chrome fixture'}),
    ])
    db.append_message(sid, 'assistant', 'Проверю Threads в новой вкладке.')
    append_activity([
        ('tool_chrome_js', 'mcp_chrome_devtools_js', {'title': 'Проверяю Threads в новой вкладке Chrome'}, {
            'result': 'Chrome fixture data', '_meta': {
                'codex/toolSurface': {'kind': 'browserUse', 'backend': 'chrome'},
                'browser_use': {'url': 'https://www.threads.com/@fixture?ref=visual-test'}
            }
        }),
    ])
    db.append_message(sid, 'assistant', 'После просмотра запускаю две команды.')
    append_activity([
        ('tool_cmd_1', 'terminal', {'command': 'echo fixture-one'}, {'stdout': 'fixture-output-one', 'exit_code': 0}),
        ('tool_cmd_2', 'terminal', {'command': 'echo fixture-two'}, {'stdout': 'fixture-output-two', 'exit_code': 0}),
    ])
    db.append_message(sid, 'assistant', 'Передаю поиск субагенту.')
    append_activity([
        ('tool_agent', 'delegate_task', {'goal': 'Thread research'}, {
            'results': [{'goal': 'Thread research', 'task_index': 0, 'status': 'completed', 'summary': 'Пробный итог.'}]
        }),
    ])
    db.append_message(sid, 'assistant', 'Проверяю другой инструмент и ошибку.')
    append_activity([
        ('tool_mcp', 'mcp_fixture_lookup', {}, {'result': 'Пробная интеграция'}),
    ])
    db.append_message(sid, 'assistant', 'Проверяю сообщение об ошибке браузера.')
    append_activity([
        ('tool_failed_browser', 'browser_navigate', {'url': 'https://example.invalid/'},
            {'error': 'fixture browser failed', 'success': False}),
    ])
    db.append_message(sid, 'assistant', 'Проверка оформления закончена.')
    sid = '20261108_124506_beef01'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Ход проверки файлов')
    db.append_message(sid, 'user', 'Покажи старый ход.')
    db.append_message(sid, 'assistant', None, reasoning='Original text from a saved turn.')
    db.append_message(sid, 'assistant', 'Старый ход сохранён.')
    db.append_message(sid, 'user', 'Покажи ход проверки файлов.')
    thought = ['Сохраняю исходный абзац.', 'Второй абзац с ' + chr(96) + 'inline code' + chr(96) + '.',
               '## Заметки к проверке', 'Запускаю проверку.', '- Первый пункт готов.', '1. Второй пункт готов.',
               *[f'Пункт проверки {i} готов.' for i in range(1, 9)]]
    db.append_message(sid, 'assistant', None, reasoning=(chr(10) * 2).join(thought))
    append_activity([
        ('tool_read_1', 'read_file', {'path': str(folder / 'fixture-note.md')}, {'content': 'Первый файл'}),
        ('tool_read_2', 'read_file', {'path': str(folder / 'fixture-rules.txt')}, {'content': 'Второй файл'}),
    ])
    db.append_message(sid, 'assistant', 'Файлы прочитаны. Дальше проверяю правку.')
    append_activity([
        ('tool_skill_mixed', 'skill_view', {'name': 'fixture-skill'}, {'success': True, 'content': 'Скилл'}),
        ('tool_web_read', 'web_extract', {'urls': ['https://example.invalid/']}, {'results': [{'content': 'Страница'}]}),
        ('tool_web_search', 'web_search', {'query': 'fixture current docs'}, {'results': [{'title': 'Документация'}]}),
        ('tool_history_search', 'session_search_recall', {'query': 'fixture old notes'}, {'results': []}),
    ])
    db.append_message(sid, 'assistant', 'Источники проверены.')
    append_activity([
        ('tool_edit_1', 'patch', {'mode': 'replace', 'path': str(folder / 'fixture-note.md'),
          'old_string': '# Тестовый файл', 'new_string': '# Исправленный файл'},
         {'success': True, 'diff': chr(10).join(['--- a/fixture-note.md', '+++ b/fixture-note.md', '@@ -1 +1 @@', '-# Тестовый файл', '+# Исправленный файл'])}),
        ('tool_edit_2', 'patch', {'mode': 'replace', 'path': str(folder / 'fixture-note.md'),
          'old_string': 'Первая строка', 'new_string': 'Вторая строка'},
         {'success': True, 'diff': chr(10).join(['--- a/fixture-note.md', '+++ b/fixture-note.md', '@@ -2 +2 @@', '-Первая строка', '+Вторая строка'])}),
        ('tool_mix_1', 'terminal', {'command': 'echo verify-file'},
          {'stdout': chr(10).join(['fixture verified', *[f'Проверка {i}: ' + 'длинная строка вывода ' * 8 for i in range(1, 12)]]), 'exit_code': 0}),
        ('tool_mix_2', 'terminal', {'command': 'echo verify-again'}, {'stdout': 'fixture checked again', 'exit_code': 0}),
    ])
    db.append_message(sid, 'assistant', 'Лента проверки файлов готова.')
    db.append_message(sid, 'user', chr(10).join(['[ASYNC DELEGATION COMPLETE]', '--- RESULT ---', 'Пробный отчёт субагента.']),
        display_kind='async_delegation_complete', display_metadata={'display_text': 'Subagent Task Completed: Проверка файлов'})
    db.append_message(sid, 'user', 'На этом всё?')
    db.append_message(sid, 'assistant', 'Да, проверка завершена.')
    sid = '20261108_124507_beef02'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Интервалы уведомлений')
    db.append_message(sid, 'user', 'Проверь интервалы уведомления агента.')
    db.append_message(sid, 'assistant', 'Текст перед запуском агента.')
    append_activity([
        ('tool_async_spacing', 'delegate_task', {'goal': 'Уникальная проверка интервалов'}, {
            'status': 'dispatched', 'goals': ['Уникальная проверка интервалов'],
            'subagent_ids': ['fixture-spacing-agent']
        }),
    ])
    db.append_message(sid, 'assistant', 'Текст перед уведомлением агента.')
    db.append_message(sid, 'user', chr(10).join(['[ASYNC DELEGATION COMPLETE]', '--- RESULT ---', 'Отчёт об интервалах.']),
        display_kind='async_delegation_complete', display_metadata={'display_text': 'Subagent Task Completed: Уникальная проверка интервалов'})
    db.append_message(sid, 'assistant', 'Текст после уведомления агента.')
    sid = '20261108_124508_beef03'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, 'Продолжение после лимита')
    db.append_message(sid, 'user', 'Начни проверку отчёта.')
    db.append_message(sid, 'assistant', 'Тестовый лимит исчерпан.', display_kind='failed_turn')
    db.append_message(sid, 'user', 'Продолжай проверку отчёта.')
    db.append_message(sid, 'assistant', 'Проверяю сохранённые данные.')
    append_activity([
        ('tool_resume_1', 'terminal', {'command': 'echo verify-saved'}, {'stdout': 'saved', 'exit_code': 0}),
    ])
    db.append_message(sid, 'assistant', 'Сверяю подготовленный отчёт.')
    append_activity([
        ('tool_resume_2', 'terminal', {'command': 'echo verify-report'}, {'stdout': 'report', 'exit_code': 0}),
    ])
    db.append_message(sid, 'user', chr(10).join(['[ASYNC DELEGATION COMPLETE]', '--- RESULT ---', 'Проверка закончена.']),
        display_kind='async_delegation_complete', display_metadata={'display_text': 'Subagent Task Completed: Проверка отчёта'})
    db.append_message(sid, 'assistant', (chr(10) * 2).join(['Отчёт готов к отправке.', 'Все данные сверены.']))
if sys.argv[3] in ('chat-activity', 'image-parity'):
    import base64, json, struct, zlib
    sid = '20261108_124502_aab002'
    folder = Path(sys.argv[2])
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    def picture(main, accent, width, height):
        half = width // 2
        rows = (bytes(1) + bytes(main) * half + bytes(accent) * (width - half)) * height
        return bytes.fromhex('89504e470d0a1a0a') + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
    png = picture((42, 118, 239), (181, 226, 245), 160, 100)
    image = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')
    def append_tools(calls):
        native_calls = [
            {'id': call_id, 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(args)}}
            for call_id, name, args, _ in calls
        ]
        db.append_message(sid, 'assistant', None, tool_calls=native_calls)
        for call_id, name, _, result in calls:
            db.append_message(sid, 'tool', json.dumps(result), tool_name=name, tool_call_id=call_id)
    db.append_message(sid, 'user', 'Покажи историю проверки.')
    db.append_message(sid, 'assistant', 'Читаю файл и проверяю результат команды.')
    append_tools([
        ('activity_read', 'read_file', {'path': str(folder / 'fixture-note.md')},
         {'content': '1|Содержимое файла из сохранённой истории', 'total_lines': 1}),
        ('activity_terminal', 'terminal', {'command': 'echo fixture-activity-command'},
         {'stdout': 'fixture-activity-output', 'exit_code': 0}),
    ])
    db.append_message(sid, 'assistant', 'Открываю изображение.')
    append_tools([
        ('activity_image', 'vision_analyze', {'image_url': image, 'question': 'Что на изображении?'},
         {'description': 'Синие полосы в тестовом изображении.'}),
    ])
    if sys.argv[3] == 'image-parity':
        colors = [
            ((42, 118, 239), (181, 226, 245), 1400, 850),
            ((226, 86, 63), (252, 189, 150), 1080, 1440),
            ((17, 145, 103), (198, 239, 193), 1440, 860),
        ]
        files = []
        for index, (main, accent, w, h) in enumerate(colors, 1):
            filename = folder / f'parity-photo-{index}.png'
            filename.write_bytes(picture(main, accent, w, h))
            files.append(filename.as_posix())
        db.append_message(sid, 'assistant', 'Сравниваю три фотографии.')
        append_tools([
            (f'vision_group_{index}', 'vision_analyze',
             {'image_url': filename, 'question': 'Сравни цвет.'}, {'success': True})
            for index, filename in enumerate(files)
        ])
        db.append_message(sid, 'assistant', 'Следующая проверка.')
        append_tools([
            ('vision_failed', 'vision_analyze', {'image_url': 'missing.png'}, {'error': 'fixture vision error'}),
        ])
    db.append_message(sid, 'assistant', 'Проверка истории завершена.')
if sys.argv[3] == 'chat-tables':
    sid = '20261108_124502_aab002'
    db.append_message(sid, 'user', 'Покажи три таблицы.')
    db.append_message(sid, 'assistant', ${JSON.stringify(tableFixture?.saved || '')})
if sys.argv[3] == 'markdown-parity':
    sid = '20261108_124502_aab002'
    tick = chr(96)
    sample = (chr(10) * 2).join([
        '**Что задумано в коде.** Проверка имени файла ' + tick + 'LOCAL-README.md:180' + tick + ' и пути ' + tick + 'source/chat-activity.js:345-346' + tick + '.',
        'Адрес страницы ' + tick + 'kak-oplatit-zarubezhny-servis' + tick + '. [Программа поиска возможностей](https://github.com/example/repo/blob/main/tool.py).',
        '- [Программа измерения](https://github.com/example/repo/blob/main/measure.py) помогает проверить результат.',
        '[Локальная страница](' + sys.argv[4] + '/resource-preview)',
        '[Документ проекта](' + (Path(sys.argv[2]) / 'fixture-note.md').as_posix() + ')',
        tick * 3 + 'js' + chr(10) + 'const example = 42;' + chr(10) + tick * 3,
    ])
    db.append_message(sid, 'user', 'Покажи проверку оформления ссылок и текста.')
    db.append_message(sid, 'assistant', sample)
if sys.argv[3] == 'file-links':
    folder = Path(sys.argv[2])
    plan = folder / 'План-проекта.md'
    notes = folder / 'Рабочие-заметки.md'
    plan.write_text('# План проекта' + chr(10) + 'Содержимое плана для проверки просмотра.', encoding='utf-8')
    notes.write_text('# Рабочие заметки' + chr(10) + 'Заметки для проверки просмотра.', encoding='utf-8')
    skill = folder / 'guide' / 'SKILL.md'
    skill.parent.mkdir(exist_ok=True)
    skill.write_text('# Навык проверки', encoding='utf-8')
    sample = (chr(10) * 2).join([
        'Сверил [план проекта](<' + plan.as_posix() + '>) и [рабочие заметки](<' + notes.as_uri() + '>).',
        'Открыть [справку](https://example.invalid/docs) или [инструкцию](<' + skill.as_posix() + '>).',
        '[Preview: Готовый файл](#preview/' + quote(plan.as_posix(), safe='') + ')',
        '[Материал](#media:' + quote(notes.as_posix(), safe='') + ')',
    ])
    sid = '20261108_124502_aab002'
    db.append_message(sid, 'user', 'Покажи ссылки на подготовленные файлы.')
    db.append_message(sid, 'assistant', sample)
if sys.argv[3] in ('display', 'chat-transitions', 'workspace-summary-live'):
    from datetime import datetime
    from hermes_cli.profiles import create_profile

    def seed_loose(target_db, profile, sid, title, day, messages):
        when = datetime.fromisoformat(f'2026-11-{day:02d}T11:00:00+03:00').timestamp()
        target_db.create_session(sid, 'desktop', model='mock-model', profile_name=profile)
        target_db.set_session_title(sid, title)
        for role, message in messages:
            target_db.append_message(sid, role, message, timestamp=when)

    transcript = [
        ('user', chr(10).join(f'Ровно двадцать строк, строка {n:02d}' for n in range(1, 21))),
        ('assistant', 'Короткий ответ для границы.'),
        ('user', chr(10).join(f'Длинный запрос, строка {n:02d}' for n in range(1, 29))),
        ('assistant', (chr(10) * 2).join(f'Ответ, абзац {n:02d}. Текст для проверки прокрутки.' for n in range(1, 54))),
    ]
    seed_loose(db, 'default', '20261120_110000_aaaa00', 'Тест длинного сообщения', 20, transcript)
    for n in range(1, 14):
        seed_loose(
            db, 'default', f'20261120_1100{n:02d}_aaaa{n:02d}', f'Свободный чат {n:02d}', 20,
            [('user', 'Короткий запрос.'), ('assistant', 'Короткий ответ.')],
        )
    if sys.argv[3] != 'workspace-summary-live':
        extra = create_profile('visual-other', no_alias=True, no_skills=True)
        other = SessionDB(db_path=extra / 'state.db')
        seed_loose(
            other, 'visual-other', '20261102_110000_bbbb00', 'Старый чат другого профиля', 2,
            [('user', 'Запрос из старого чата.'), ('assistant', 'Ответ из другого профиля.')],
        )
        other.close()
if sys.argv[3] == 'settings-audit':
    from hermes_cli.profiles import create_profile
    from shutil import copyfile
    profile = create_profile('visual-settings-long-profile', no_alias=True, no_skills=True)
    assert profile.is_relative_to(Path(sys.argv[1]).parent)
    copyfile(config, profile / 'config.yaml')
    if config.with_name('.env').exists():
        copyfile(config.with_name('.env'), profile / '.env')
    for index, title in enumerate((
        'Архивный чат для проверки',
        'Длинный заголовок архивного чата об оформлении настроек и действиях в узком окне',
        'Готовый тестовый разговор',
    ), 1):
        sid = f'20261110_09400{index}_aca10{index}'
        db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default')
        db.set_session_title(sid, title)
        db.append_message(sid, 'user', 'Проверь вид строки в архиве.')
        db.append_message(sid, 'assistant', 'Штатный тестовый чат с двумя сообщениями.')
        assert db.set_session_archived(sid, True)
db.close()
if sys.argv[3] in ('polish', 'swap-cron', 'shell-surfaces', 'desktop-surfaces'):
    from cron.jobs import create_job
    create_job('Тестовый промпт', '0 0 1 1 *', name='Проверка Cron в боковой панели', paused=True)
if sys.argv[3] == 'polish':
    from hermes_cli.profiles import create_profile
    create_profile('visual-layout-long-profile-20261109', no_alias=True, no_skills=True)
if sys.argv[3] == 'shell-surfaces':
    from hermes_cli.profiles import create_profile
    for name in ('visual-qa', 'visual-ui', 'visual-dev'):
        create_profile(name, no_alias=True, no_skills=True)
if sys.argv[3] == 'visual-parity':
    from hermes_cli.profiles import create_profile
    profile = create_profile('visual-audit-helper-with-long-name', no_alias=True, no_skills=True)
    assert profile.is_relative_to(Path(sys.argv[1]).parent)
    (profile / 'SOUL.md').write_text(
        '# Тестовый профиль' + chr(10) * 2 + 'Длинная строка для проверки переноса в редакторе. ' * 8 + chr(10) * 2
        + chr(10).join(f'Абзац {i}. Содержимое тестового профиля.' for i in range(1, 45)),
        encoding='utf-8')
if sys.argv[3] == 'sidebar-more-all':
    from hermes_cli.profiles import create_profile
    other = create_profile('visual-other', no_alias=True, no_skills=True)
    with connect_closing(other / 'projects.db') as conn:
        create_project(conn, name='Тестовый проект', slug='demo-workspace', folders=[sys.argv[2]])
    other_db = SessionDB(db_path=other / 'state.db')
    other_id = '20261118_123000_other1'
    other_db.create_session(other_id, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='visual-other', git_repo_root=sys.argv[2])
    other_db.set_session_title(other_id, 'Чат другого профиля')
    other_db.append_message(other_id, 'user', 'Тестовый запрос.', timestamp=time() - 7200)
    other_db.close()
if sys.argv[3] in ('project-reveal', 'sidebar-activity'):
    from hermes_cli.profiles import create_profile
    other = create_profile('visual-other', no_alias=True, no_skills=True)
    if sys.argv[3] == 'sidebar-activity':
        empty_folder = Path(sys.argv[2]).parent / 'empty-project'
        empty_folder.mkdir()
        with connect_closing(other / 'projects.db') as conn:
            create_project(conn, name='Пустой проект', slug='empty-project', folders=[str(empty_folder)])
${reviewProposals?.seedReviewProposals ?? ''}
${activityCenter?.seedActivityProposals ?? ''}
`
    // Large table fixtures exceed Windows' command-line limit. Passing the
    // program on stdin preserves the same argv and works for every focus.
    const projectSeed = spawnSync(
      fs.realpathSync(pythonPath),
      [
        '-B',
        '-X',
        'utf8',
        '-',
        path.join(sandbox.hermesHome, 'projects.db'),
        projectFolder,
        process.env.HERMES_VISUAL_FOCUS || 'full',
        fixtureUrl,
      ],
      {
        cwd: repository,
        env,
        encoding: 'utf8',
        input: projectSeedProgram,
      },
    )
    assert.equal(projectSeed.status, 0, projectSeed.error?.message || projectSeed.stderr || 'Could not seed the test project')
    if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-more-all') {
      const otherProfile = path.join(sandbox.hermesHome, 'profiles', 'visual-other')
      writeMockProviderConfig(otherProfile, fixtureUrl)
      writeEnvFile(otherProfile, 'e2e-mock-key', fixtureUrl)
    }
    if (summaryParityFocus || process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live') {
      const related = path.join(sandbox.root, 'site')
      git('init', '-q', related)
      fs.writeFileSync(path.join(related, 'page.md'), 'Тестовая страница\n')
      git('-C', related, 'add', '--', 'page.md')
      git('-C', related, '-c', 'user.name=Hermes Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '-m', 'Seed related repository')
      fs.appendFileSync(path.join(related, 'page.md'), 'Проверка правок сайта\n')
      git('-C', related, 'add', '--', 'page.md')
      fs.appendFileSync(path.join(related, 'page.md'), 'Ещё одна правка сайта\n')
    }
    if (displayFocus) {
      const otherProfile = path.join(sandbox.hermesHome, 'profiles', 'visual-other')
      writeMockProviderConfig(otherProfile, fixtureUrl)
      writeEnvFile(otherProfile, 'e2e-mock-key', fixtureUrl)
    }
    if (draftSetupFocus || shellFocus) closeTestGateway = await createTestGateway(sandbox, env, fixtureUrl)
    else prepareTestChatLimits(sandbox, env)
    const entry = path.join(sandbox.root, 'isolated-desktop.cjs')
    // The stock Electron fixture registers hermes:// in the Windows user registry.
    // Keep the real built renderer and prevent that host-side change in this fixture.
    fs.writeFileSync(
      entry,
      `
const { app } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const desktop = process.env.HERMES_VISUAL_DESKTOP
app.setAsDefaultProtocolClient = () => false
app.getAppPath = () => desktop
if (app.setAsDefaultProtocolClient() !== false) throw new Error('Protocol registration is not isolated')
import(pathToFileURL(path.join(desktop, 'dist', 'electron-main.mjs')).href).catch(error => {
  console.error(error)
  app.exit(1)
})
`,
      'utf8',
    )
    const audioFile = path.join(sandbox.root, 'dictation-fixture.wav')
    if (dictation) fs.writeFileSync(audioFile, dictation.fixtureAudio())
    if (sidebarActivityFocus) assertLocalRoutingInputs(sandbox)
    electronLaunchAttempted = true
    app = await _electron.launch({
      executablePath: process.env.HERMES_VISUAL_ELECTRON || findElectron(),
      args: [entry, ...(process.env.HERMES_VISUAL_GPU === '1' ? [] : ['--disable-gpu']),
        ...(styleScopeFocus || performanceFocus || projectActivityFocus || sessionNavigationFocus || chatHoverFocus || commandPaletteFocus || approvalFocus || chatTransitionsFocus || workspaceSummaryFocus
          ? ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] : []),
        '--no-sandbox',
        ...(dictation ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
          `--use-file-for-fake-audio-capture=${audioFile}`] : [])],
      cwd: desktop,
      env: { ...env, HERMES_VISUAL_DESKTOP: desktop },
    })
    const page = await app.firstWindow()
    const auditLocalRoute = async profile => {
      const descriptors = await page.evaluate(async profile => ({
        ambient: await window.hermesDesktop.getConnection(profile),
        registry: await window.hermesDesktop.getConnectionFor({ connectionId: 'local', profile }),
      }), profile)
      const ambient = assertIsolatedGatewayDescriptor(descriptors.ambient, sandbox, profile)
      const registry = assertIsolatedGatewayDescriptor(descriptors.registry, sandbox, profile)
      assert.equal(ambient.instance_id, registry.instance_id, 'Native routes must reach the same test gateway instance')
      assert.equal(ambient.api_origin, registry.api_origin, 'Native routes must reach the same test gateway origin')
      console.log('HCV_ISOLATED_ROUTE', JSON.stringify({ ambient, registry }))
    }
    if (approvalFocus || newChatWelcomeFocus) {
      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
      })
      const focusSession = await page.context().newCDPSession(page)
      await focusSession.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    }
    page.setDefaultTimeout(10000)
    const runtime = await app.evaluate(({ app }) => ({
      home: process.env.HERMES_HOME,
      userData: app.getPath('userData'),
      electron: process.versions.electron,
      version: app.getVersion(),
      gatewayLocks: process.env.HERMES_GATEWAY_LOCK_DIR,
      stateHome: process.env.XDG_STATE_HOME,
    }))
    assert.equal(fs.realpathSync(runtime.home), fs.realpathSync(sandbox.hermesHome))
    assert.equal(fs.realpathSync(runtime.userData), fs.realpathSync(sandbox.userDataDir))
    assert.equal(fs.realpathSync(runtime.gatewayLocks), fs.realpathSync(env.HERMES_GATEWAY_LOCK_DIR))
    assert.equal(fs.realpathSync(runtime.stateHome), fs.realpathSync(env.XDG_STATE_HOME))
    console.log('Isolated Hermes Desktop', runtime.version, 'Electron', runtime.electron)
    if (responsivenessFocus || styleScopeFocus || performanceFocus || chatHoverFocus || commandPaletteFocus) {
      const gpu = await app.evaluate(({ app }) => app.getGPUFeatureStatus())
      console.log('GPU compositing', gpu.gpu_compositing)
      if (performanceFocus || chatHoverFocus) assert.equal(gpu.gpu_compositing, 'enabled')
    }
    const identity = await readChatIdentity(page)
    if (identity.hermesHome) {
      assert.equal(fs.realpathSync(identity.hermesHome), fs.realpathSync(sandbox.hermesHome))
    }
    if (activityParityFocus) console.log('Confirmed isolated renderer', identity.appVersion)

    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'reduce' })
    // Match the reference's opaque dark window in this temporary profile only.
    if (displayFocus) await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+03:00'))
    if (mode === 'candidate' && process.env.HERMES_VISUAL_FOCUS === 'sidebar') {
      // This scenario starts with a configured provider in the isolated profile.
      await page.addInitScript(() => localStorage.setItem('hermes-onboarding-skipped-v1', '1'))
    }
    await page.addInitScript(({ showTerminal, collapseOldDate, renameRightTile, showDatedProjectChats, dockFilesOnRight, enableMarkdownPlugin }) => {
      localStorage.setItem('hermes-desktop-mode-v1', 'dark')
      if (enableMarkdownPlugin) {
        localStorage.setItem('hermes.desktop.pluginDecisions.v2', JSON.stringify({ 'hermes-codex-visual': true }))
      }
      localStorage.setItem(
        'hermes.desktop.translucency.v2',
        JSON.stringify({ mode: 'clear', base: { intensity: 0 } }),
      )
      localStorage.setItem('hermes.desktop.agentsGroupedByWorkspace', 'true')
      if (showDatedProjectChats) localStorage.setItem('hermes.desktop.sidebarShowAllSessions', 'true')
      if (collapseOldDate) {
        localStorage.setItem('hermes.desktop.workspaceNodeOpen', JSON.stringify({ 'list-group:this-month': false }))
      }
      if (renameRightTile) {
        const pane = 'session-tile:' + renameRightTile
        localStorage.setItem('hermes.desktop.sessionTiles.v2', JSON.stringify({
          default: [{ storedSessionId: renameRightTile, ownerProfile: 'default', dir: 'right', anchor: 'workspace' }],
        }))
        localStorage.setItem('hermes.desktop.layoutTree.v2', JSON.stringify({
          type: 'split', id: 'spl-root', orientation: 'row', weights: [.18, .52, .3],
          children: [
            { type: 'group', id: 'grp-sessions', panes: ['sessions', 'hermes-bots:pane'], active: 'sessions' },
            { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace', tabStrip: 'always' },
            { type: 'group', id: 'grp-rename-right', panes: [pane], active: pane, tabStrip: 'always' },
          ],
        }))
      }
      if (showTerminal) {
        localStorage.setItem('hermes.desktop.layoutTree.v2', JSON.stringify({
          type: 'split', id: 'spl-root', orientation: 'row', weights: [.16, .84],
          children: [
            { type: 'group', id: 'grp-sessions', panes: ['sessions', 'hermes-bots:pane', 'terminal'], active: 'sessions' },
            { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace', tabStrip: 'always' },
          ],
        }))
      }
      if (dockFilesOnRight) {
        localStorage.setItem('hermes.desktop.layoutTree.v2', JSON.stringify({
          type: 'split', id: 'spl-root', orientation: 'row', weights: [.16, .64, .20],
          children: [
            { type: 'group', id: 'grp-sessions', panes: ['sessions', 'hermes-bots:pane'], active: 'sessions' },
            { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace', tabStrip: 'always' },
            { type: 'group', id: 'grp-files', panes: ['files'], active: 'files' },
          ],
        }))
      }
    }, {
      showTerminal: displayFocus || workspaceSummaryFocus || process.env.HERMES_VISUAL_FOCUS === 'polish',
      collapseOldDate: displayFocus && !displayBaseline,
      renameRightTile: (renameTabsFocus || approvalFocus) ? '20261108_124502_aab002' : null,
      showDatedProjectChats: process.env.HERMES_VISUAL_FOCUS === 'sidebar-chat-order',
      dockFilesOnRight: newChatLayoutFocus || process.env.HERMES_VISUAL_RIGHT_PROBE_LAYOUT === '1',
      enableMarkdownPlugin: markdownParityFocus || fileLinksFocus || approvalFocus,
    })
    const contextCheck = contextFocus ? await import('./context-meter.spec-helper.mjs') : null
    const contextFixture = await contextCheck?.installContextFixture(page)
    const shellCheck = shellFocus ? await import('./shell-surfaces.spec-helper.mjs') : null
    const shellFixture = await shellCheck?.installShellFixture(page)
    const settingsCheck = settingsAudit ? await import('./settings-audit.spec-helper.mjs') : null
    await settingsCheck?.installSettingsAuditFixture(app, page, desktop)
    if (!rateLimitFocus) await replyErrorCheck?.installReplyErrorFixture(page)
    const systemRuCheck = systemRuFocus ? await import('./system-ru.spec-helper.mjs') : null
    await systemRuCheck?.installSystemRuFixture(app, page)
    if (process.env.HERMES_VISUAL_FOCUS === 'mcp-page') {
      const { installMcpFixture } = await import('./mcp-page.spec-helper.mjs')
      await installMcpFixture(app)
    }
    const interfaceCopyCheck = interfaceCopyFocus ? await import('./interface-copy.spec-helper.mjs') : null
    const confirmations = await interfaceCopyCheck?.installInterfaceCopyFixture(page)
    const activityParity = activityParityFocus || chatRhythmFocus || activityBundlesFocus || agentLifecycleFocus ? await import('./activity-parity.spec-helper.mjs') : null
    const readiness = activityParity || (modelSpeedFocus || sessionNavigationFocus ? await import('./activity-parity.spec-helper.mjs') : null)
    const agentLifecycle = agentLifecycleFocus ? await import('./agent-lifecycle.spec-helper.mjs') : null
    const chatRhythm = chatRhythmFocus ? await import('./chat-rhythm.spec-helper.mjs') : null
    const activityBundles = activityBundlesFocus ? await import('./activity-bundles.spec-helper.mjs') : null
    const rhythmFixture = chatRhythm?.createChatRhythmFixture()
    const agentLifecycleFixture = agentLifecycle?.createAgentLifecycleFixture()
    const bundlesFixture = activityBundles?.createActivityBundlesFixture()
    const standaloneFileFixture = activityParityFocus ? activityParity.createStandaloneFileFixture() : null
    await readiness?.installActivityReadinessFixture(page,
      rhythmFixture?.intercept || bundlesFixture?.intercept || agentLifecycleFixture?.intercept || standaloneFileFixture?.intercept)
    const benchmarkReplacement = responsivenessFocus && process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
    const checkCatalog = projectCatalogFixFocus || Boolean(benchmarkReplacement)
    const benchmark = responsivenessFocus || styleScopeFocus || checkCatalog || performanceFocus ? await import('./responsiveness.spec-helper.mjs') : null
    await benchmark?.installCatalogFixture(page, { withArtwork: checkCatalog })
    await page.reload(contextFocus || tables || activityParityFocus || chatRhythmFocus || activityBundlesFocus || agentLifecycleFocus ? { waitUntil: 'domcontentloaded', timeout: 30000 } : undefined)
    await page.setViewportSize({ width: 1440, height: 920 })
    if (activityParityFocus) console.log('Reloaded activity fixture')
    await waitForChatReady(page, 180000)
    if (pinnedRuntimeAudit && sidebarActivityFocus) {
      // Initial exchanges are checked only for the named sidebar scenario.
      await expect.poll(() => mcpInitialMethods.filter(x => x === 'initialize').length >= 2
        && mcpInitialMethods.filter(x => x === 'tools/list').length >= 2, { timeout: 15000 }).toBe(true)
    }
    if (pinnedRuntimeAudit) {
      // Every managed Focus must prove which interpreter its gateway used.
      const runtimeAudit = spawnSync(pythonPath, ['-B', path.join(feature, 'verification/audit_isolated_gateway.py'),
        sandbox.hermesHome, fs.realpathSync(pythonPath), process.env.HCV_TEST_RUNTIME_BASE_PYTHON,
        // The exact-module overlay preserves the native hermes_cli package.
        // Python -m records that real main.py, not the source-discovery probe.
        process.env.HERMES_VISUAL_TIMELINE_CORE ? fs.realpathSync(path.resolve(desktop, '../..')) : repository,
        sidebarActivityFocus ? 'require-mcp' : 'process-only'],
      { encoding: 'utf8', env, timeout: 40000, windowsHide: true })
      assert.equal(runtimeAudit.status, 0, runtimeAudit.error?.message || runtimeAudit.stderr || 'Isolated gateway audit failed')
      const gatewayIdentity = JSON.parse(runtimeAudit.stdout.trim())
      assert.equal(gatewayIdentity.isolated_home, true)
      assert.equal(gatewayIdentity.expected_command_python, true)
      assert.equal(gatewayIdentity.expected_base_exe, true)
      assert.equal(gatewayIdentity.hermes_entry_path_verified, true)
      assert.equal(gatewayIdentity.private_gateway_rendezvous, true)
      if (sidebarActivityFocus) {
        assert.equal(gatewayIdentity.named_mcp_initial_registration, true)
        gatewayIdentity.initial_mcp_initialize_count = mcpInitialMethods.filter(x => x === 'initialize').length
        gatewayIdentity.initial_mcp_tools_count = mcpInitialMethods.filter(x => x === 'tools/list').length
      } else {
        assert.equal(gatewayIdentity.named_mcp_initial_registration, null)
      }
      console.log('HCV_ISOLATED_GATEWAY_AUDIT', JSON.stringify(gatewayIdentity))
    }
    if (pinnedRuntimeAudit && (sidebarActivityFocus || personalQueueFocus)) await auditLocalRoute('default')
    if (activityParityFocus) console.log('Activity fixture is ready')
    const navigation = (name) =>
      page.locator(`[data-tour="sidebar-nav-${name}"]`).locator('xpath=ancestor::button[1]')
    const projectChat = (title) => page.locator('[data-sessions-project] button[data-slot="row-button"]')
      .filter({ has: page.getByText(title, { exact: true }) })
    const marker = page.locator('html[data-hermes-codex-visual]')
    const sheet = page.locator('style[data-hermes-codex-visual]')
    const root = page.locator('html')
    const currentTheme = () => root.getAttribute('data-hermes-theme')
    const themeCard = (name) => page.getByText(name, { exact: true }).locator('xpath=ancestor::button[1]')
    const menuArrow = page.locator('[data-slot="composer-surface"] button > svg.tabler-icon-chevron-down')
    const chatColor = () =>
      page
        .locator('[data-chat-surface][data-composer-target="main"]')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor)
    const openThemeSettings = async () => {
      await page.keyboard.press('Control+,')
      await page
        .getByText(/^(Внешний вид|Appearance)$/)
        .first()
        .click({ timeout: 10000 })
      await page
        .getByText(/^(Тема|Theme)$/)
        .first()
        .click({ timeout: 10000 })
      await expect(themeCard('Nous')).toBeVisible()
    }
    const closeSettings = async () => {
      await page.keyboard.press('Escape')
      await expect(themeCard('Nous')).toBeHidden()
    }
    const readThemePreviews = async () =>
      themeCard('Nous')
        .locator('xpath=../..')
        .locator('div.group > button')
        .evaluateAll((cards) =>
          cards
            .map((card) => [
              card.querySelector('.truncate')?.textContent,
              [card.firstElementChild, ...card.firstElementChild.querySelectorAll('[style]')].map((part) =>
                part.getAttribute('style'),
              ),
            ])
            .sort(([a], [b]) => a.localeCompare(b)),
        )
    const togglePlugin = async (enabled) => {
      await navigation('capabilities').click({ timeout: 10000 })
      const pluginTab = page.locator('[data-tour="page-tabs"]').getByText(/^(Плагины|Plugins)$/)
      if (renameTabsFocus) await page.locator('[data-tour="tab-plugins"]').press('Enter', { timeout: 10000 })
      else await pluginTab.click({ timeout: 10000 })
      // Restrict this focused scenario to installed packages, so a late public
      // catalog response cannot page the switch out of the visible results.
      if (enabled && (sidebarActivityFocus || workspaceSummaryFocus)) {
        await page.locator('[data-catalog="plugins"]').getByRole('button', { name: /^(Фильтры|Filters)$/ }).click()
        await page.getByRole('button', { name: /^(Установленные|Installed)$/ }).click()
        await page.keyboard.press('Escape')
      }
      const pluginSearch = page.getByPlaceholder(/^(Поиск плагинов|Search plugins)/i).first()
      await pluginSearch.fill('Codex', { timeout: 10000 })
      const toggle = page.getByRole('switch', { name: /Hermes Codex Visual|Рабочий экран в стиле Codex/ })
      if (zoomBannerFocus && !enabled && !(await toggle.isVisible())) {
        await page.locator('[data-catalog="plugins"]').getByRole('button', { name: /^(Фильтры|Filters)$/ }).click()
        await page.getByRole('button', { name: /^(Установленные|Installed)$/ }).click()
        await page.keyboard.press('Escape')
      }
      if (!(await toggle.isVisible())) {
        const installedTab = page.getByText(/^(Установленные|Installed)$/)
        if (await installedTab.first().isVisible()) await installedTab.first().click()
      }
      await expect(toggle).toHaveAttribute('aria-checked', String(!enabled), { timeout: 10000 })
      if (activityParityFocus || process.env.HERMES_VISUAL_TYPOGRAPHY) {
        // This is setup, not the feature under test. Catalog refresh can remove the
        // row immediately after its handler runs; observe the plugin lifecycle
        // rather than clicking a replacement row or relying on OS focus.
        await toggle.dispatchEvent('click')
        await expect(marker).toHaveCount(enabled ? 1 : 0, { timeout: 20000 })
        return
      }
      if (styleScopeFocus || sessionNavigationFocus || commandPaletteFocus || settingsAudit || sidebarMoreFocus
          || activityCenterFocus || performanceFocus || fileLinksFocus || imageParityFocus || turnDiffFocus || composerLiveFocus || modelSpeedFocus || summaryParityFocus
          || process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live') await toggle.press('Space')
      else await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', String(enabled))
      await expect(marker).toHaveCount(enabled ? 1 : 0)
    }

    fs.mkdirSync(evidence, { recursive: true })
    const evidenceVersion = process.env.HERMES_VISUAL_EVIDENCE_VERSION || 'v07'
    async function checkChatReturns() {
      const { verifyChatTransitions, assertChatTransitions } = await import('./chat-transitions.spec-helper.mjs')
      const sidebar = page.locator('[data-hcv-sidebar-shell]')
      const save = result => {
        const proof = {
          ...result,
          runtime: { electron: runtime.electron, renderer: identity.appVersion },
          moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex'),
        }
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-chat-transitions.json'), JSON.stringify(proof, null, 2))
      }
      const result = await verifyChatTransitions({ page, expect, sidebar, navigation, save })
      save(result)
      assertChatTransitions(result)
      return result
    }
    const typographyAudit = process.env.HERMES_VISUAL_TYPOGRAPHY
      ? await (await import('./typography.spec-helper.mjs')).createTypographyAudit(page, data => {
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-typography.json'), JSON.stringify({
          electron: runtime.electron, desktopVersion: identity.appVersion,
          moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex'),
          ...data,
        }, null, 2) + '\n')
      }) : null
    const screenshot = async (name, { locator, ...options } = {}) => {
      await typographyAudit?.capture(name)
      if (process.env.HERMES_VISUAL_SKIP_SCREENSHOTS === '1') return
      return (locator || page).screenshot({ timeout: 30000, animations: 'disabled', ...options, path: path.join(evidence, evidenceVersion + '-' + name.replace(/^v05-/, 'regression-').replace(/^v0[67]-/, '')) })
    }
    const verifyNarrowSettings = async (width) => {
      await page.keyboard.press('Control+,')
      const main = page.locator('[data-overlay-surface] main')
      const title = main.locator('nav [aria-current="page"]').first()
      await expect(title).toBeVisible()
      if (width <= 760) {
        const rail = page.locator('[data-overlay-surface] [data-tour="overlay-nav"]')
        const menu = page.locator('[data-overlay-surface] [data-tour="overlay-nav"] + div button[aria-haspopup="menu"]')
        await expect(rail).toBeHidden()
        await expect(menu).toBeVisible()
        await menu.click()
        await page.getByRole('menuitem', { name: 'Основная модель', exact: true }).click()
        await expect(title).toHaveText('Основная модель')
      }
      if ((await title.textContent()).trim() === 'Основная модель') {
        await expect(main.getByRole('combobox').first()).toBeVisible()
      }
      assert(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'Settings must fit the narrow window')
      await screenshot('v06-settings-narrow.png')
      await page.keyboard.press('Escape')
      await expect(main).toHaveCount(0)
    }
    let themePreviews
    let originalTheme
    let originalChatColor
    const measure = async (name) => {
      const selectors = name === 'codex' && process.env.HERMES_VISUAL_SELECTOR_TRACE === '1'
      const ablate = name === 'codex' && process.env.HERMES_VISUAL_CSS_ABLATION
      const results = await benchmark.measureResponsiveness({ page, expect, navigation, selectors, ablate })
      fs.writeFileSync(path.join(evidence, evidenceVersion + '-' + name + '-performance.json'), JSON.stringify(results, null, 2))
      console.log('Responsiveness', name, JSON.stringify(results))
    }
    if (mode === 'candidate' && approvalFocus) {
      await expect(marker).toHaveCount(1, { timeout: 20000 })
      await openThemeSettings()
      // Theme selection prepares this fixture. The acceptance buttons below
      // still receive real input, including after the theme has been changed.
      await themeCard('Codex').dispatchEvent('click')
      await expect(root).toHaveAttribute('data-hermes-theme', 'codex-workspace')
      await closeSettings()
      const { verifyChatApproval } = await import('./chat-approval.spec-helper.mjs')
      const result = await verifyChatApproval({ page, expect, projectChat, projectFolder, screenshot,
        openThemeSettings, closeSettings, themeCard, sandbox })
      fs.writeFileSync(path.join(evidence, evidenceVersion + '-chat-approval.json'), JSON.stringify({
        renderer: identity.appVersion, electron: runtime.electron, result,
        moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex'),
      }, null, 2))
      return
    }
    if (mode === 'candidate' && (markdownParityFocus || fileLinksFocus)) {
      // The isolated profile starts with this one plugin enabled; the catalog
      // itself can refresh its rows while the fixture is opening.
      await expect(marker).toHaveCount(1, { timeout: 20000 })
      await openThemeSettings()
      await expect(themeCard('Codex')).toBeVisible()
      await themeCard('Codex').click()
      await expect(root).toHaveAttribute('data-hermes-theme', 'codex-workspace')
      await closeSettings()
      const results = fileLinksFocus
        ? await (await import('./file-links.spec-helper.mjs')).verifyFileLinks({ app, page, expect, projectChat, screenshot,
          openThemeSettings, closeSettings, themeCard, before: process.env.HERMES_VISUAL_FILE_LINKS_BEFORE === '1' })
        : await (await import('./markdown-parity.spec-helper.mjs')).verifyMarkdownParity({ app, page, expect, projectChat, screenshot,
          openThemeSettings, closeSettings, themeCard, before: process.env.HERMES_VISUAL_MARKDOWN_BEFORE === '1' })
      results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
      results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
      fs.writeFileSync(path.join(evidence, evidenceVersion + (fileLinksFocus ? '-file-links.json' : '-markdown-parity.json')), JSON.stringify(results, null, 2))
      await typographyAudit?.finish()
      return
    }
    if (mode === 'candidate') {
      await expect(marker).toHaveCount(0)
      originalTheme = await currentTheme()
      originalChatColor = await chatColor()
      await openThemeSettings()
      themePreviews = await readThemePreviews()
      assert(themePreviews.length >= 10, 'Expected the built-in theme cards')
      await expect(themeCard('Codex')).toHaveCount(0)
      await closeSettings()
      await togglePlugin(true)
      await navigation('new-session').click()
      if (responsivenessFocus && !benchmarkReplacement) await measure('native-theme')
      assert.equal(await currentTheme(), originalTheme, 'Enabling the plugin must preserve the current theme')
      assert.equal(
        await chatColor(),
        originalChatColor,
        'Enabling the plugin must preserve the current palette',
      )
      await expect(menuArrow.first()).toBeVisible()
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar') {
        await page.getByRole('button', { name: 'Открыть Тестовый проект', exact: true }).click()
        await expect(page.locator('[data-sessions-mode="project"]')).toBeVisible()
      }
      await openThemeSettings()
      const withCodex = await readThemePreviews()
      assert.deepEqual(
        withCodex.filter(([name]) => name !== 'Codex'),
        themePreviews,
      )
      if (approvalFocus) await themeCard('Codex').press('Enter')
      else await themeCard('Codex').click()
      await expect(root).toHaveAttribute('data-hermes-theme', 'codex-workspace')
      await closeSettings()
      if (process.env.HERMES_VISUAL_FOCUS === 'usage') {
        const { verifyUsageUi } = await import('./usage-ui.spec-helper.mjs')
        await verifyUsageUi({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard })
        const result = { renderer: identity.appVersion, electron: runtime.electron,
          moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex') }
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-usage.json'), JSON.stringify(result, null, 2))
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'readme') {
        const { captureReadme } = await import('./readme.spec-helper.mjs')
        await captureReadme({ page, expect, projectChat, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (newChatDotFocus) {
        const { verifyNewChatDot } = await import('./new-chat-dot.spec-helper.mjs')
        const measurements = await verifyNewChatDot({ page, expect, screenshot, prompt, release: firstToken.resolve,
          openThemeSettings, closeSettings, themeCard, before: process.env.HERMES_VISUAL_NEW_CHAT_DOT_BEFORE === '1' })
        measurements.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        measurements.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-new-chat-dot.json'), JSON.stringify(measurements, null, 2))
        return
      }
      if (projectDialogFocus) {
        const { verifyProjectDialog } = await import('./project-dialog.spec-helper.mjs')
        const measurements = await verifyProjectDialog({ app, page, expect, screenshot, sandbox, openThemeSettings, closeSettings, themeCard })
        measurements.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        measurements.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-project-dialog.json'), JSON.stringify(measurements, null, 2))
        return
      }
      if (zoomBannerFocus) {
        const { verifyZoomBanner } = await import('./zoom-banner.spec-helper.mjs')
        const measurements = await verifyZoomBanner({
          app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard, togglePlugin,
        })
        measurements.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        measurements.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-zoom-banner.json'), JSON.stringify(measurements, null, 2))
        return
      }
      if (commandPaletteFocus) {
        const { verifyCommandPalette } = await import('./command-palette.spec-helper.mjs')
        const results = await verifyCommandPalette({
          page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard,
          before: process.env.HERMES_VISUAL_PALETTE_BEFORE === '1',
        })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-command-palette.json'), JSON.stringify(results, null, 2))
        return
      }
      if (activityCenterFocus) {
        const measurements = await activityCenter.verifyActivityCenter({
          page, expect, screenshot, sandbox, openThemeSettings, closeSettings,
        })
        await activityCenter.verifyActivityFailureUi({ app, page, expect })
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-activity-center.json'), JSON.stringify({
          renderer: identity.appVersion, electron: runtime.electron, measurements, failureUi: true,
          moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex'),
          backendSha256: createHash('sha256').update(fs.readFileSync(path.join(process.env.HERMES_VISUAL_ACTIVITY_PACKAGE, 'activity.py'))).digest('hex'),
        }, null, 2))
        return
      }
      if (reviewProposalsFocus) {
        const measurements = await reviewProposals.verifyReviewProposals({
          page, expect, projectChat, screenshot, sandbox, openThemeSettings, closeSettings, themeCard,
        })
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-review-proposals.json'),
          JSON.stringify({ renderer: identity.appVersion, measurements }, null, 2))
        return
      }
      if (approvalFocus) {
        const { verifyChatApproval } = await import('./chat-approval.spec-helper.mjs')
        const result = await verifyChatApproval({ page, expect, projectChat, projectFolder, screenshot, openThemeSettings, closeSettings, themeCard, sandbox })
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-chat-approval.json'), JSON.stringify({
          renderer: identity.appVersion, electron: runtime.electron, result,
          moduleSha256: createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex'),
        }, null, 2))
        return
      }
      if (chatHoverFocus) {
        const { verifyChatHover } = await import('./chat-hover.spec-helper.mjs')
        const { verifyScrollJump } = await import('./scroll-jump.spec-helper.mjs')
        const baseline = process.env.HERMES_VISUAL_CHAT_HOVER_BEFORE === '1'
        const results = await verifyChatHover({ app, page, expect, projectChat, screenshot, baseline })
        if (results.profile) {
          fs.writeFileSync(path.join(evidence, evidenceVersion + '.cpuprofile'), JSON.stringify(results.profile))
          delete results.profile
        }
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-chat-hover.json'), JSON.stringify(results, null, 2))
        const scroll = await verifyScrollJump({ page, expect, screenshot, baseline })
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-scroll-jump.json'), JSON.stringify(scroll, null, 2))
        if (!baseline) {
          const { verifyReplyActionsInteraction } = await import('./chat-parity.spec-helper.mjs')
          const reply = await verifyReplyActionsInteraction({ app, page, expect, openThemeSettings, closeSettings, themeCard })
          fs.writeFileSync(path.join(evidence, evidenceVersion + '-reply-actions.json'), JSON.stringify(reply, null, 2))
        }
        return
      }
      if (activityComposerFocus) {
        const { verifyActivityComposer } = await import('./activity-composer.spec-helper.mjs')
        const results = await verifyActivityComposer({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings,
          before: process.env.HERMES_VISUAL_ACTIVITY_BEFORE === '1' })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-activity-composer.json'), JSON.stringify(results, null, 2))
        return
      }
      if (sessionNavigationFocus) {
        const results = {}
        page.setDefaultTimeout(30000)
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        const folder = page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ })
        if (await folder.getAttribute('aria-expanded') === 'false') await folder.click()
        const project = page.locator('[data-sessions-project]').filter({ has: folder })
        const more = project.locator('[data-hcv-project-more] > button')
        await expect(projectChat('Фокус').first()).toBeVisible()
        if (await more.isVisible()) await more.click()
        if (process.env.HERMES_VISUAL_NAVIGATION_OBSERVE !== '1') {
          const { verifySessionTabStack } = await import('./session-tab-stack.spec-helper.mjs')
          results.tabStack = await verifySessionTabStack({
            app, page, expect, projectChat, before: process.env.HERMES_VISUAL_NAVIGATION_BEFORE === '1',
          })
          fs.writeFileSync(path.join(evidence, evidenceVersion + '-session-navigation.json'), JSON.stringify(results, null, 2))
        }
        if (process.env.HERMES_VISUAL_NAVIGATION_STACK_ONLY !== '1') {
          const { verifySessionNavigation } = await import('./session-navigation.spec-helper.mjs')
          Object.assign(results, await verifySessionNavigation({
            app, page, expect, projectChat, screenshot, prompt, release: firstToken.resolve,
            openThemeSettings, closeSettings, themeCard,
          }))
        }
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-session-navigation.json'), JSON.stringify(results, null, 2))
        return
      }
      if (sidebarWidthFocus) {
        const { verifySidebarWidth } = await import('./sidebar-width.spec-helper.mjs')
        const results = await verifySidebarWidth({
          page, expect, screenshot, openThemeSettings, closeSettings, themeCard,
          beforeRelease: process.env.HERMES_VISUAL_SIDEBAR_WIDTH_BEFORE === '1',
        })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-sidebar-width.json'), JSON.stringify(results, null, 2))
        return
      }
      if (summaryLayoutFocus) {
        await projectChat('Проверка каталога').click()
        const summary = page.locator('[data-hcv-context-card]')
        await expect(summary).toBeVisible()
        const outside = page.locator('[data-hcv-project-name]').filter({ hasText: 'Тестовый проект' }).first()
        const { verifySummaryLayout } = await import('./summary-layout.spec-helper.mjs')
        await verifySummaryLayout({ page, expect, summary, outside, screenshot })
        return
      }
      if (summaryParityFocus) {
        const { verifySummaryParity } = await import('./summary-parity.spec-helper.mjs')
        const results = await verifySummaryParity({ page, expect, projectChat, screenshot,
          tabHeader: process.env.HERMES_VISUAL_SUMMARY_TAB,
          responseMode: process.env.HERMES_VISUAL_SUBAGENT_RESPONSE,
          beforeRelease: process.env.HERMES_VISUAL_SUMMARY_BEFORE === '1' })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-summary-parity.json'), JSON.stringify(results, null, 2))
        await typographyAudit?.finish()
        return
      }
      if (turnDiffFocus) {
        if (savedTurnDiffFocus) {
          const { verifySavedMainTurns } = await import('./saved-turns.spec-helper.mjs')
          const saved = await verifySavedMainTurns({ page, expect, projectChat, projectFolder, singleEditPrompt,
            editsPrompt, singleFile, newFiles, seedLine, screenshot, openThemeSettings, closeSettings,
            hermesHome: sandbox.hermesHome, pythonPath })
          saved.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
          saved.backendSha256 = createHash('sha256').update(fs.readFileSync(path.join(sandbox.hermesHome,
            'plugins', 'hermes-codex-visual', 'turn_changes.py'))).digest('hex')
          fs.writeFileSync(path.join(evidence, evidenceVersion + '-saved-main.json'), JSON.stringify(saved, null, 2))
          return
        }
        const { verifyTurnDiff } = await import('./turn-diff.spec-helper.mjs')
        await verifyTurnDiff({
          app, page, expect, projectChat, projectFolder, singleEditPrompt, editsPrompt, singleFile, newFiles, seedLine, oneLine,
          screenshot, openThemeSettings, closeSettings, themeCard,
        })
        return
      }
      if (performanceCheck) {
        const results = await performanceCheck.measurePerformance({
          app, page, expect, navigation, projectChat, openThemeSettings, closeSettings, themeCard, screenshot,
        })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-deep-performance.json'), JSON.stringify(results, null, 2))
        await togglePlugin(false)
        return
      }
      if (projectActivityFocus) {
        const { verifyProjectActivity } = await import('./deep-performance.spec-helper.mjs')
        await verifyProjectActivity({ app, page, expect, navigation, projectChat, prompt, mock, release: firstToken.resolve })
        return
      }
      if (styleScopeFocus) {
        const { measureSidebarScope, sidebarMasks, verifyStyleScope } = await import('./style-scope.spec-helper.mjs')
        const input = { app, page, expect, navigation }
        await app.evaluate(({ BrowserWindow }) => {
          for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
        })
        console.log('Measuring the installed baseline')
        const before = await measureSidebarScope(input)
        console.log('Baseline measurement complete')
        const oldMasks = await sidebarMasks(page, navigation)
        const replacement = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
        assert(replacement, 'Set HERMES_VISUAL_REPLACEMENT_PLUGIN to the module unpacked from the candidate ZIP')
        const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
        const staged = plugin + '.staging'
        fs.copyFileSync(replacement, staged, fs.constants.COPYFILE_EXCL)
        console.log('Replacement module SHA-256', createHash('sha256').update(fs.readFileSync(staged)).digest('hex'))
        fs.renameSync(staged, plugin)
        await expect(navigation('artifacts').locator('[data-hcv-sidebar-fill]')).toHaveCount(1, { timeout: 15000 })
        await expect(page.locator('head style[data-hcv-chrome-styles]')).toHaveCount(1)
        const after = await measureSidebarScope(input)
        assert.deepEqual(await sidebarMasks(page, navigation), oldMasks, 'Sidebar icon masks must match the installed release')
        const data = { before, after }
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-style-scope.json'), JSON.stringify(data, null, 2))
        console.log('Style scope', JSON.stringify(data))
        await verifyStyleScope({ ...input, openThemeSettings, closeSettings, themeCard })
        await togglePlugin(false)
        return
      }
      if (responsivenessFocus) {
        await measure('codex')
        if (!benchmarkReplacement) return

        const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
        const staged = plugin + '.staging'
        fs.copyFileSync(benchmarkReplacement, staged, fs.constants.COPYFILE_EXCL)
        console.log('Replacement module SHA-256', createHash('sha256').update(fs.readFileSync(staged)).digest('hex'))
        fs.renameSync(staged, plugin)
        await expect(root).toHaveAttribute('data-hcv-window-chrome', '', { timeout: 15000 })
        await measure('local-update')
      }
      if (checkCatalog) {
        const { verifyProjectCatalogFix } = await import('./project-catalog-fix.spec-helper.mjs')
        const localIcons = process.env.HERMES_VISUAL_EXPECT_LOCAL_ICONS === '1'
          ? JSON.parse(fs.readFileSync(path.join(feature, '.local/assets.json'), 'utf8')).icons
          : undefined
        await verifyProjectCatalogFix({ page, expect, screenshot, navigation, projectChat, localIcons })
        return
      }
      if (newChatWelcomeFocus) {
        const { verifyNewChatWelcome } = await import('./new-chat-welcome.spec-helper.mjs')
        const results = await verifyNewChatWelcome({ page, expect, screenshot, projectChat, projectFolder, reply: MOCK_REPLY, openThemeSettings, closeSettings, themeCard })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-new-chat-welcome.json'), JSON.stringify(results, null, 2))
        return
      }
      if (newChatLayoutFocus) {
        const { verifyNewChatLayout } = await import('./new-chat-layout.spec-helper.mjs')
        await verifyNewChatLayout({ page, expect, screenshot, newChat: navigation('new-session') })
        return
      }
      if (settingsAudit) {
        await typographyAudit?.capture('workspace')
        const results = await settingsCheck.verifySettingsAudit({
          page, expect, screenshot, openThemeSettings, closeSettings, themeCard,
          inspectTypography: typographyAudit ? id => typographyAudit.capture(id) : undefined,
          save: data => fs.writeFileSync(path.join(evidence, evidenceVersion + '-settings.json'),
            JSON.stringify({ electron: runtime.electron, desktopVersion: identity.appVersion, ...data }, null, 2) + '\n'),
        })
        assert(results)
        await typographyAudit?.capture('native-theme-restored')
        await typographyAudit?.finish()
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'window-menu') {
        const { verifyWindowMenu } = await import('./window-menu.spec-helper.mjs')
        await verifyWindowMenu({ page, expect, screenshot, openThemeSettings, closeSettings })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'install-overlay') {
        const { verifyInstallOverlay } = await import('./install-overlay.spec-helper.mjs')
        await verifyInstallOverlay({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard, sandbox })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'app-updates') {
        const { verifyAppUpdates } = await import('./app-updates.spec-helper.mjs')
        await verifyAppUpdates({ app, page, expect, screenshot, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (chatActivityFocus) {
        const { verifyChatActivity } = await import('./chat-activity.spec-helper.mjs')
        await verifyChatActivity({ page, app, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (personalQueue) {
        const results = await personalQueue.verifyPersonalQueue({ page, expect, projectChat, screenshot,
          fixture: queueFixture, pythonPath, sandbox })
        const manifestPath = path.join(process.env.HERMES_VISUAL_TIMELINE_PACKAGE, 'source/hermes-turn-control/manifest.json')
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const helper = manifest.helpers.find(item => item.target === 'gateway/hcv_tree_owner.py')
        const imports = fs.readFileSync(path.join(repository, 'loaded-modules.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
        const ownImports = imports.filter(entry => entry.module === 'gateway.hcv_tree_owner')
        assert(ownImports.length && ownImports.every(entry => entry.sha256 === helper.candidate), 'Expected the packaged queue projection')
        results.coreImports = ownImports
        results.runtime = { renderer: identity.appVersion, electron: runtime.electron }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-personal-queue.json'), JSON.stringify(results, null, 2))
        return
      }
      if (agentLifecycle) {
        await openThemeSettings()
        await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
        await themeCard('Codex').click()
        await closeSettings()
        await projectChat('Проверка каталога').click()
        const results = await agentLifecycle.verifyAgentLifecycle({ page, expect, projectChat, screenshot, projectFolder, fixture: agentLifecycleFixture })
        if (process.env.HERMES_VISUAL_LEGACY_AGENTS === '1') {
          const { verifyLegacyAgentHistory } = await import('./legacy-agents.spec-helper.mjs')
          results.legacySavedAgents = await verifyLegacyAgentHistory({ page, expect, projectChat, screenshot })
        }
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-agent-lifecycle.json'), JSON.stringify(results, null, 2))
        return
      }
      if (chatRhythm) {
        await openThemeSettings()
        await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
        await themeCard('Codex').click()
        await closeSettings()
        await projectChat('Проверка каталога').click()
        const results = await chatRhythm.verifyChatRhythm({ page, expect, screenshot, fixture: rhythmFixture })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-chat-rhythm.json'), JSON.stringify(results, null, 2))
        return
      }
      if (activityBundles) {
        await openThemeSettings()
        await page.getByText(/^(Тёмная|Темная|Dark)$/, { exact: true }).first().click()
        await themeCard('Codex').click()
        await closeSettings()
        await projectChat('Проверка каталога').click()
        const results = await activityBundles.verifyActivityBundles({ page, expect, screenshot, fixture: bundlesFixture })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-activity-bundles.json'), JSON.stringify(results, null, 2))
        return
      }
      if (activityParity) {
        if (process.env.HERMES_VISUAL_ACTIVITY_HOT_SWAP === '1') {
          const { verifyActivityHotSwap } = await import('./activity-hot-swap.spec-helper.mjs')
          const results = await verifyActivityHotSwap({ page, expect, projectChat, sandbox, screenshot })
          results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
          fs.writeFileSync(path.join(evidence, evidenceVersion + '-activity-hot-swap.json'), JSON.stringify(results, null, 2))
          return
        }
        let standaloneFile
        if (process.env.HERMES_VISUAL_ACTIVITY_BEFORE !== '1') {
          standaloneFile = await activityParity.verifyStandaloneFileDisclosure({
            page, expect, screenshot, fixture: standaloneFileFixture,
          })
          console.log('Standalone file disclosure', JSON.stringify(standaloneFile))
        }
        const results = await activityParity.verifyActivityParity({
          page, app, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, translationRequests,
        })
        if (process.env.HERMES_VISUAL_ACTIVITY_BEFORE !== '1') {
          await openThemeSettings()
          await themeCard('Codex').click()
          await closeSettings()
          await projectChat('Ход проверки файлов').click()
          const timeline = page.locator('[data-slot="aui_turn-pair"]').filter({ hasText: 'Лента проверки файлов готова.' })
          await expect(timeline).toBeVisible()
          const steps = timeline.locator('button[data-hcv-turn-line]')
          if (await steps.getAttribute('aria-expanded') !== 'true') await steps.click()
          const group = timeline.locator('[data-hcv-activity-group="activityEdit"] > button')
          if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
          const secondEdit = timeline.locator('[data-hcv-activity-member][data-tool-row]').nth(1)
          await expect(secondEdit.locator('button[aria-expanded]').first()).toHaveAttribute('aria-expanded', 'false')
          // The app's file watcher unloads only the isolated plugin.
          const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
          fs.renameSync(plugin, plugin + '.withdrawn')
          await expect(marker).toHaveCount(0, { timeout: 18000 })
          await expect(page.locator('[data-hcv-activity-group], [data-hcv-activity-member], [data-hcv-activity-empty-owner], [data-hcv-activity-label]')).toHaveCount(0)
          const edits = timeline.locator('[data-tool-row]').filter({ has: page.getByRole('button', { name: /fixture-note\.md.*\+1/ }) })
          const nativeEdit = edits.nth(1)
          const nativeToggle = nativeEdit.getByRole('button', { name: /fixture-note\.md.*\+1/ })
          await expect(nativeToggle).toBeVisible()
          if (await nativeToggle.getAttribute('aria-expanded') !== 'true') await nativeToggle.click()
          await expect(nativeToggle).toHaveAttribute('aria-expanded', 'true')
          await expect(nativeEdit.getByText(/Вторая строка/)).toBeVisible()
          results.pluginUnloaded = true
          results.standaloneFile = standaloneFile
        }
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-activity-parity.json'), JSON.stringify(results, null, 2))
        await typographyAudit?.capture('plugin-unloaded')
        await typographyAudit?.finish()
        return
      }
      if (tables) {
        await tables.verifyChatTables({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, fixture: tableFixture })
        return
      }
      if (imageParityFocus) {
        const baseline = process.env.HERMES_VISUAL_SEND_BASELINE === '1'
        const send = await sendCheck.verifySendMessage({ page, expect, projectChat, projectFolder, screenshot,
          fixture: sendFixture, baseline })
        const results = { send }
        if (!baseline) {
          const { verifyImageParity } = await import('./image-parity.spec-helper.mjs')
          Object.assign(results, await verifyImageParity({
            app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard,
          }))
        }
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-image-parity.json'), JSON.stringify(results, null, 2))
        return
      }
      if (videoCheck) {
        const results = await videoCheck.verifyVideoParity({
          app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard,
        })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-video-parity.json'), JSON.stringify(results, null, 2))
        return
      }
      if (resourceFocus) {
        const { verifyChatResources } = await import('./chat-resources.spec-helper.mjs')
        await verifyChatResources({
          app, page, expect, projectChat, screenshot, projectFolder, openThemeSettings, closeSettings, themeCard,
        })
        return
      }
      if (sidebarMoreFocus) {
        const { verifySidebarMore } = await import('./sidebar-more.spec-helper.mjs')
        const result = await verifySidebarMore({ app, page, expect, screenshot, sandbox, openThemeSettings, closeSettings, themeCard })
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-sidebar-more.json'), JSON.stringify({
          ...result, renderer: identity.appVersion, electron: runtime.electron,
        }, null, 2))
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-chat-order') {
        const replacement = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
        if (replacement) {
          const current = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
          const next = current + '.tmp'
          const hasNewStyles = () => page.evaluate(() =>
            [...document.querySelectorAll('style')].some(style => style.textContent.includes('[data-hcv-sidebar-drag-ghost]')),
          )
          assert.equal(await hasNewStyles(), false)
          fs.copyFileSync(replacement, next)
          fs.renameSync(next, current)
          await expect.poll(hasNewStyles, { timeout: 15000 }).toBe(true)
        }
        const { verifySidebarChatOrder } = await import('./sidebar-chat-order.spec-helper.mjs')
        await verifySidebarChatOrder({ app, page, expect, screenshot, projectChat, sandbox })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'review-polish') {
        const { verifyReviewPolish } = await import('./review-polish.spec-helper.mjs')
        await verifyReviewPolish({ app, page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'workspace-panel') {
        const { verifyWorkspacePanel } = await import('./workspace-panel.spec-helper.mjs')
        await verifyWorkspacePanel({ page, expect, screenshot, projectChat, projectFolder })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'workspace-summary-live') {
        const { verifyWorkspaceSummaryLive } = await import('./workspace-summary-live.spec-helper.mjs')
        const results = await verifyWorkspaceSummaryLive({ page, expect, screenshot, projectChat, projectFolder })
        const { verifySummaryTooltipsAndCopy } = await import('./summary-and-tooltips.spec-helper.mjs')
        results.presentation = await verifySummaryTooltipsAndCopy({ page, expect, screenshot, projectChat, openThemeSettings, closeSettings })
        results.chatReturns = await checkChatReturns()
        results.backendSha256 = createHash('sha256').update(fs.readFileSync(path.join(sandbox.hermesHome,
          'plugins', 'hermes-codex-visual', 'turn_changes.py'))).digest('hex')
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-workspace-summary-live.json'), JSON.stringify(results, null, 2))
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'summary-sources') {
        const { verifySummarySources } = await import('./summary-sources.spec-helper.mjs')
        await verifySummarySources({ page, expect, screenshot, projectChat })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'local-environment') {
        const { verifyLocalEnvironment } = await import('./local-environment.spec-helper.mjs')
        await verifyLocalEnvironment({ page, expect, screenshot, projectChat, projectFolder })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'composer-size') {
        const { verifyComposerSize } = await import('./composer-live.spec-helper.mjs')
        await verifyComposerSize({ page, expect, screenshot, projectChat })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-row-parity') {
        const { verifySidebarRowParity } = await import('./sidebar-row-parity.spec-helper.mjs')
        const result = await verifySidebarRowParity({ page, expect,
          sidebar: page.locator('[data-slot="sidebar"][data-tour="sessions-sidebar"]'), projectChat, screenshot,
          openThemeSettings, closeSettings, themeCard,
          onCapture: data => fs.writeFileSync(path.join(evidence, evidenceVersion + '-sidebar-row-parity.json'), JSON.stringify(data, null, 2)) })
        result.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        result.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-sidebar-row-parity.json'), JSON.stringify(result, null, 2))
        return
      }
      if (turnControlFocus) {
        test.setTimeout(300000)
        let turnProjectChat = projectChat
        if (process.env.HCV_INPROC !== '1') {
          const created = await new Promise((resolve, reject) => {
            const child = spawn(pythonPath, ['-B', path.resolve('verification/turn-control-create-cli.py'), fixtureUrl, projectFolder],
              { env, cwd: repository, windowsHide: true })
            let stdout = '', stderr = ''
            const timer = setTimeout(() => { child.kill(); reject(new Error('Native CLI fixture creation timed out')) }, 90000)
            child.stdout.on('data', chunk => { stdout += chunk.toString('utf8') })
            child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
            child.once('error', error => { clearTimeout(timer); reject(error) })
            child.once('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }) })
          })
          assert.equal(created.status, 0, created.stderr || 'Native CLI fixture creation failed')
          const sessions = JSON.parse(created.stdout.trim())
          assert.equal(sessions.length, 2)
          console.log('Native CLI fixtures', JSON.stringify(sessions))
          await page.reload()
          const names = { 'Ревью интерфейса': sessions[0].title, 'Проверка каталога': sessions[1].title }
          turnProjectChat = name => page.getByRole('button', { name: names[name], exact: true })
        }
        const { verifyTurnControl } = await import('./turn-control.spec-helper.mjs')
        const result = await verifyTurnControl({ page, expect, projectChat: turnProjectChat, projectFolder, screenshot, pythonPath,
          releaseChild: () => turnControlChildGate.resolve(), readCalls: () => turnControlCalls.length,
          childWaiting: () => turnControlCalls.some(item => item.text?.trim() === 'HCV_CHILD_WAIT HCV_STOP') })
        const coreManifest = JSON.parse(fs.readFileSync(path.join(process.env.HERMES_VISUAL_TIMELINE_PACKAGE,
          'source/hermes-turn-control/manifest.json'), 'utf8'))
        const imports = fs.readFileSync(path.join(repository, 'loaded-modules.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
        const pinned = Object.entries(coreManifest.files).map(([name, hashes]) => [name, hashes.candidate])
          .concat(coreManifest.helpers.map(item => [item.target, item.candidate]))
        for (const item of imports) {
          const expected = new Map(pinned).get(item.module.replaceAll('.', '/') + '.py')
          assert(expected && expected === item.sha256 &&
            path.resolve(item.file) === path.resolve(repository, 'modules', item.module.replaceAll('.', '/') + '.py'),
          'A loaded override differs from the exact ZIP: ' + item.module)
        }
        for (const module of ['gateway.session_controls', 'gateway.hcv_tree_owner', 'tui_gateway.contracts.canonical_sessions',
          process.env.HCV_INPROC === '1' ? 'tools.hcv_inproc_tree' : 'agent.managed_worker']) {
          assert(imports.some(item => item.module === module), 'Actual canonical route not loaded: ' + module)
        }
        result.executionMode = process.env.HCV_INPROC === '1' ? 'in-process' : 'managed-worker'
        result.coreImports = imports
        result.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        result.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-turn-control.json'), JSON.stringify(result, null, 2))
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-selection') {
        const { verifySidebarSelection } = await import('./sidebar.spec-helper.mjs')
        await verifySidebarSelection({ page, expect, navigation, screenshot, openThemeSettings, closeSettings })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'auto-project') {
        const { verifyAutoProject } = await import('./auto-project.spec-helper.mjs')
        await verifyAutoProject({ page, expect, screenshot })
        return
      }
      if (renameTabsFocus) {
        const { verifyRenameTabs } = await import('./rename-tabs.spec-helper.mjs')
        await verifyRenameTabs({ page, expect, projectChat, screenshot, prompts: mock.receivedPrompts })
        return
      }
      if (rateLimitFocus) {
        const result = await replyErrorCheck.verifyRateLimitCard({ page, expect, projectChat, editsPrompt,
          screenshot, openThemeSettings, closeSettings, rateLimitAttempts: () => rateLimitRequests })
        result.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        result.backendSha256 = createHash('sha256').update(fs.readFileSync(path.join(sandbox.hermesHome,
          'plugins', 'hermes-codex-visual', 'turn_changes.py'))).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-reply-error.json'), JSON.stringify(result, null, 2))
        return
      }
      if (replyErrorCheck) {
        await replyErrorCheck.verifyReplyError({ page, expect, screenshot, projectChat, openThemeSettings, closeSettings })
        return
      }
      if (systemRuCheck) {
        await systemRuCheck.verifySystemRu({ app, page, expect, screenshot, projectChat })
        return
      }
      if (interfaceCopyCheck) {
        await interfaceCopyCheck.verifyInterfaceCopy({ page, expect, screenshot, projectChat, confirmations, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (shellCheck) {
        await shellCheck.verifyShellSurfaces({ app, page, expect, screenshot, projectChat, projectFolder, fixture: shellFixture })
        await typographyAudit?.finish()
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'module-swap') {
        const surface = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="composer-surface"]:visible')
        const input = surface.locator('[data-slot="composer-rich-input"]')
        const busyTab = page.getByRole('tab', { name: /Сеанс выполняется/, selected: true })
        const draft = 'Черновик во время замены модуля'
        await expect(surface).toHaveCSS('border-width', '1px')
        await input.fill(prompt)
        await input.press('Enter')
        await expect(busyTab).toBeVisible()
        await mock.waitForHeldStream()
        await input.fill(draft)

        const plugin = path.join(sandbox.hermesHome, 'desktop-plugins', 'hermes-codex-visual', 'plugin.js')
        const staged = plugin + '.staging'
        const replacement = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN
        assert(replacement, 'Set HERMES_VISUAL_REPLACEMENT_PLUGIN to the unpacked new module')
        fs.copyFileSync(plugin, path.join(sandbox.root, 'previous-plugin.js'), fs.constants.COPYFILE_EXCL)
        fs.copyFileSync(replacement, staged, fs.constants.COPYFILE_EXCL)
        fs.renameSync(staged, plugin)
        await expect(surface).toHaveCSS('border-width', '0px', { timeout: 15000 })
        await expect(input).toHaveText(draft)
        await expect(busyTab).toBeVisible()
        mock.releaseHeldStream()
        await expect(page.getByText(MOCK_REPLY, { exact: false }).first()).toBeVisible({ timeout: 20000 })
        await expect(busyTab).toHaveCount(0)
        await expect(input).toHaveText(draft)
        assert.equal(mock.receivedPrompts.filter(value => value === prompt).length, 1)
        console.log(JSON.stringify({ moduleReloaded: true, responseCompleted: true, draftPreserved: true }))
        return
      }
      if (dictation) {
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await dictation.verifyDictation({ page, expect, screenshot, voiceRequests })
        return
      }
      if (draftSetupFocus) {
        const results = await chatParity.verifyDraftSetup({ page, expect, screenshot })
        results.runtime = { electron: runtime.electron, renderer: identity.appVersion }
        results.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
        fs.writeFileSync(path.join(evidence, evidenceVersion + '-draft-setup.json'), JSON.stringify(results, null, 2))
        return
      }
      if (subagentsPaneFocus) {
        await chatParity.verifySubagentsParity({ app, page, expect, projectChat, screenshot, fixture: chatFixture })
        return
      }
      if (chatParity) {
        await chatParity.verifyChatParity({ app, page, expect, projectChat, screenshot, fixture: chatFixture,
          reference: chatReference, reply: MOCK_REPLY,
          openThemeSettings, closeSettings, themeCard })
        return
      }
      if (contextCheck) {
        await contextCheck.verifyContextMeter({ page, expect, screenshot, projectChat, fixture: contextFixture, reply: MOCK_REPLY, inferenceModels: contextInferenceModels })
        return
      }
      if (composerFocus) {
        const { verifyComposer } = await import('./composer.spec-helper.mjs')
        await verifyComposer({ page, expect, screenshot, mock, prompt, sandbox, pythonPath })
        return
      }
      if (composerLive) {
        const { parse } = await import(pathToFileURL(path.join(fixtureRepository, 'node_modules/yaml/dist/index.js')))
        const readMode = () => parse(fs.readFileSync(path.join(sandbox.hermesHome, 'config.yaml'), 'utf8'))?.approvals?.mode
        await composerLive.verifyComposerLive({ page, expect, screenshot, fixture: composerFixture, readMode, projectChat })
        return
      }
      if (modelSpeedFocus) {
        const { verifyModelSpeedWindow } = await import('./model-speed-window.spec-helper.mjs')
        await verifyModelSpeedWindow({ page, expect, projectChat, sandbox, screenshot,
          gatewayLog: path.join(sandbox.root, 'model-speed-gateway-trace.jsonl'),
          fixtureMode: modelSpeedResponsesFocus ? 'responses' : 'appserver' })
        return
      }
      if (modelMenuFocus) {
        const { verifyModelMenu } = await import('./ui-audit.mjs')
        await verifyModelMenu({ page, expect, screenshot })
        return
      }
      if (densityFocus) {
        const { verifyDensityParity } = await import('./density-parity.spec-helper.mjs')
        await verifyDensityParity({ page, expect, screenshot, projectChat, navigation })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'mcp-page') {
        const { verifyMcpPage } = await import('./mcp-page.spec-helper.mjs')
        await verifyMcpPage({ page, expect, screenshot })
        await typographyAudit?.finish()
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'catalog') {
        const { verifyCatalogControls } = await import('./ui-audit.mjs')
        await verifyCatalogControls({ page, expect, screenshot, navigation })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'project-reveal') {
        const { verifyProjectReveal } = await import('./sidebar.spec-helper.mjs')
        await verifyProjectReveal({ page, expect, sidebar: page.locator('[data-hcv-sidebar-shell]'), screenshot })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'popups') {
        const { verifyPopupStyles } = await import('./ui-audit.mjs')
        await verifyPopupStyles({ page, expect, screenshot, themeCard, openThemeSettings, closeSettings })
        await typographyAudit?.finish()
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'audit') {
        const { runUiAudit } = await import('./ui-audit.mjs')
        await runUiAudit({ page, expect, screenshot, themeCard, openThemeSettings, closeSettings })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'desktop-surfaces') {
        const { verifyDesktopSurfaces } = await import('./desktop-surfaces.spec-helper.mjs')
        await verifyDesktopSurfaces({ page, expect, screenshot, navigation })
        await typographyAudit?.finish()
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'visual-parity') {
        const { verifyVisualParity } = await import('./visual-parity.spec-helper.mjs')
        await verifyVisualParity({ page, expect, screenshot, navigation, openThemeSettings, closeSettings })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'narrow') {
        await page.setViewportSize({ width: 760, height: 720 })
        await verifyNarrowSettings(760)
        console.log(JSON.stringify({ renderer: identity.appVersion, settingsCompactNavigationAt: 760 }))
        return
      }
      assert((await menuArrow.count()) > 0, 'Native composer keeps its controls')
      for (const arrow of await menuArrow.all()) await expect(arrow).toHaveCSS('display', 'none')
      const voiceCaret = page.locator(
        '[data-slot="composer-surface"] [data-slot="fan-menu-anchor"] > .codicon-chevron-up',
      )
      await expect(voiceCaret).toHaveCount(1)
      await expect(voiceCaret).toHaveCSS('display', 'none')
      const capabilities = navigation('capabilities')
      await expect(capabilities.locator('.codicon-symbol-misc')).toHaveCSS('display', 'none')
      assert.notEqual(
        await capabilities.evaluate((button) => getComputedStyle(button, '::before').maskImage),
        'none',
      )
      await expect(page.locator('[data-hcv-window-menu]')).toBeVisible()
      const sidebar = page.locator('[data-hcv-sidebar-shell]')
      const context = page.locator('[data-hcv-context-card]')
      await expect(sidebar.locator('[data-hcv-sidebar-bar]')).toBeVisible()
      await expect(context).toBeVisible()
      await expect(sidebar.locator('[data-hcv-brand]')).toHaveText('Hermes')
      const tabs = page.locator('[data-zone-tabstrip="grp-sessions"]')
      const sessionsTab = tabs.locator('[data-tree-tab="sessions"]')
      const botsTab = tabs.locator('[data-tree-tab="hermes-bots:pane"]')
      await expect(sessionsTab).toHaveAttribute('aria-selected', 'true')
      await expect(sessionsTab).toBeVisible()
      await expect(botsTab).toBeVisible()
      if (chatTransitionsFocus) {
        await checkChatReturns()
        return
      }
      if (displayFocus) {
        if (process.env.HERMES_VISUAL_DISPLAY_SCROLL_ONLY === '1') {
          const { verifyDisplayScroll } = await import('./display-scroll.spec-helper.mjs')
          const result = await verifyDisplayScroll({ page, expect, sidebar, screenshot })
          result.runtime = { electron: runtime.electron, renderer: identity.appVersion }
          result.moduleSha256 = createHash('sha256').update(fs.readFileSync(process.env.HERMES_VISUAL_FIXTURE_PLUGIN)).digest('hex')
          fs.writeFileSync(path.join(evidence, evidenceVersion + '-display-scroll.json'), JSON.stringify(result, null, 2))
          return
        }
        const { verifyDisplay } = await import('./display.spec-helper.mjs')
        await verifyDisplay({
          page, expect, sidebar, screenshot, openThemeSettings, closeSettings, themeCard,
          baseline: displayBaseline,
        })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar') {
        const { verifySidebar } = await import('./sidebar.spec-helper.mjs')
        await verifySidebar({ page, expect, sidebar, screenshot })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'archive-toast') {
        const { verifyArchiveToast } = await import('./archive-toast.spec-helper.mjs')
        await verifyArchiveToast({ page, expect, sidebar, screenshot })
        return
      }
      if (sidebarActivityFocus) {
        const { verifySidebarActivity } = await import('./sidebar.spec-helper.mjs')
        await verifySidebarActivity({
          page, expect, sidebar, screenshot, projectChat, newChat: navigation('new-session'),
          waitForChatReady, mock, prompt, releaseFirstToken: firstToken.resolve,
          auditLocalRoute: pinnedRuntimeAudit ? auditLocalRoute : undefined,
        })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'chat-menu') {
        const { verifyChatMenus } = await import('./sidebar.spec-helper.mjs')
        await verifyChatMenus({ page, expect, sidebar, screenshot })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'polish') {
        const { verifyPolish } = await import('./polish.spec-helper.mjs')
        await verifyPolish({ page, expect, sidebar, screenshot, navigation })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'swap-cron') {
        const { verifySwapAndCron } = await import('./swap-cron.spec-helper.mjs')
        await verifySwapAndCron({ page, expect, sidebar, screenshot })
        return
      }
      if (process.env.HERMES_VISUAL_FOCUS === 'summary') {
        const project = sidebar.locator('[data-sessions-project]:not([data-sessions-mode])')
          .filter({ has: page.getByRole('button', { name: 'Тестовый проект', exact: true }) }).first()
        const name = project.locator('[data-hcv-project-name]')
        const row = project.locator(':scope > :first-child')
        const overview = sidebar.locator('[data-sessions-mode="projects"]')
        await expect(name).toHaveText('Тестовый проект')
        await name.hover()
        await expect(row).toHaveCSS('background-color', 'rgb(41, 41, 41)')
        const nameBounds = await name.boundingBox()
        await project.getByRole('button', { name: 'Действия', exact: true }).click()
        const projectMenu = page.locator('[data-hcv-sidebar-menu][data-state="open"]')
        await expect(projectMenu).toBeVisible()
        await screenshot('v07-project-actions.png')
        await page.mouse.click(nameBounds.x + 4, nameBounds.y + nameBounds.height / 2)
        await expect(projectMenu).toHaveCount(0)
        await expect(overview).toBeVisible()
        if (await name.getAttribute('aria-expanded') === 'false') await name.click()

        const activeTab = page.locator('[data-zone-tabstrip] [data-tree-tab="workspace"][data-active="true"]').first()
        await expect(activeTab).toHaveCSS('height', '28px')
        await expect(activeTab).toHaveCSS('border-radius', '8px')
        await activeTab.hover()
        await expect(activeTab.locator('.pane-tab-content')).toHaveCSS('mask-image', 'none')
        assert(await activeTab.locator('.pane-tab-content .truncate').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1))
        await screenshot('v07-compact-tabs.png')
        await projectChat('새 채팅 확인').click()
        const koreanTab = activeTab.filter({ hasText: '새 채팅 확인' })
        await koreanTab.hover()
        await expect(koreanTab).toHaveCSS('height', '28px')
        await expect(koreanTab).toHaveCSS('border-radius', '8px')
        await expect(koreanTab.locator('.pane-tab-content .truncate').first()).toHaveCSS('text-transform', 'none')
        await projectChat('Проверка каталога').click()
        const sessionHash = await page.evaluate(() => location.hash)
        const summary = page.locator('[data-hcv-context-card]')
        await expect(summary).toHaveCSS('width', '280px')
        await expect(summary).toHaveCSS('border-radius', '16px')
        await expect(summary.getByRole('button', { name: 'Справка по каталогу', exact: true })).toBeVisible()
        await expect(summary.getByRole('button', { name: 'fixture-note.md', exact: true })).toBeVisible()
        const thumbnail = summary.locator('img')
        await expect(thumbnail).toBeVisible()
        assert(await thumbnail.evaluate(img => img.complete && img.naturalWidth > 0), 'The summary uses the loaded chat image')
        await screenshot('v07-summary-with-sources.png')
        await thumbnail.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await summary.getByRole('button', { name: 'Показать все', exact: true }).click()
        const sourceList = page.locator('[data-hcv-sources-pane]:visible')
        await expect(sourceList.getByRole('listitem').filter({ hasText: 'fixture-rules.txt' })).toBeVisible()
        await expect(sourceList.getByRole('button', { name: 'Тестовый поиск', exact: true })).toBeVisible()
        await screenshot('v07-all-sources.png')
        const sourcesTab = page.locator('[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-sources"]')
        await sourcesTab.hover()
        await sourcesTab.getByRole('button', { name: 'Закрыть', exact: true }).click()
        await expect(summary.getByRole('button', { name: 'Показать все', exact: true })).toBeVisible()

        const { verifySummaryLayout } = await import('./summary-layout.spec-helper.mjs')
        await verifySummaryLayout({ page, expect, summary, outside: name, screenshot })
        await expect(overview).toBeVisible()
        await summary.getByRole('button', { name: 'Добавить источник', exact: true }).click()
        await page.getByRole('menuitem', { name: 'Использовать плагины', exact: true }).click()
        await expect(page).toHaveURL(/\/capabilities\?tab=connectors/)
        const directory = page.locator('[data-slot="connectors-directory"]')
        const connector = directory.locator('[data-slot="connector-row-card"]').first()
        await expect(connector).toBeVisible()
        await expect(connector).toHaveCSS('border-radius', '12px')
        await expect(connector.getByRole('switch')).toHaveCSS('height', '19px')
        await screenshot('v07-connectors.png')
        await directory.locator('input[placeholder]').fill('Тестовый поиск')
        await expect(connector).toContainText('Тестовый поиск')
        await directory.locator(':is([data-catalog-actions] > button, div:has(> h2) > button)').first().click()
        const add = page.locator('[data-slot="add-server-form"]')
        await expect(add).toBeVisible()
        await expect(add.locator('input').first()).toBeVisible()
        await screenshot('v07-connector-form.png')
        await page.keyboard.press('Escape')

        for (const route of ['profiles', 'agents', 'webhooks', 'starmap', 'session-import']) {
          await page.evaluate((name) => { location.hash = `#/${name}` }, route)
          await expect(page).toHaveURL(new RegExp(`/${route}$`))
          const surface = page.locator('[data-overlay-surface]:visible').last()
          await expect(surface).toBeVisible()
          await expect(surface.locator('[data-glass-raised]').first()).toHaveCSS('border-radius', '24px')
          await expect(surface.locator('button:visible').first()).toBeVisible()
          if (route === 'profiles') await screenshot('v07-profiles.png')
        }
        await page.evaluate((hash) => { location.hash = hash }, sessionHash)
        await summary.getByRole('button', { name: 'Показать все', exact: true }).click()
        await sourceList.getByRole('button', { name: 'fixture-note.md', exact: true }).click()
        await expect(page.locator('[data-slot="aui_thread-content"]').getByRole('button', { name: 'Скрыть', exact: true })).toBeVisible()
        console.log(JSON.stringify({ renderer: identity.appVersion, sources: ['image', 'file', 'link', 'MCP'], nativeOverlays: 5 }))
        return
      }
      for (const [id, label, route] of [
        ['capabilities', 'Возможности', 'capabilities'],
        ['messaging', 'Сообщения', 'messaging'],
        ['artifacts', 'Артефакты', 'artifacts'],
        ['cron', 'Запланированные задачи', 'cron'],
      ]) {
        const button = navigation(id)
        await expect(button.getByText(label, { exact: true })).toBeVisible()
        assert(await button.getByText(label, { exact: true }).evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
        await button.click()
        await expect(page).toHaveURL(new RegExp(`/${route}(?:[/?#]|$)`))
        await expect(root).toHaveAttribute('data-hcv-screen', route)
        const surface = route === 'cron' ? page.locator('[data-overlay-surface]') :
          page.locator('section.h-full.min-w-0.overflow-hidden:not([data-chat-surface]):visible')
        await expect(surface.first()).toBeVisible()
        await expect(surface.first()).toHaveCSS('--conversation-text-font-size', '14px')
        if (route === 'capabilities') {
          await page.locator('[data-tour="tab-plugins"]').click()
          await expect(page.getByPlaceholder(/Поиск плагинов|Search plugins/i).first()).toBeVisible()
          await expect(surface.locator('[data-catalog-card]').first()).toBeVisible()
          await surface.locator('[data-catalog-card] button[aria-haspopup="dialog"]').first().click()
          const details = page.locator('[data-slot="dialog-content"]:has([data-catalog-detail])')
          await expect(details).toBeVisible()
          await expect(details).toHaveCSS('border-radius', '24px')
          await screenshot('v06-plugin-detail.png')
          await page.keyboard.press('Escape')
          await expect(details).toHaveCount(0)
          await screenshot('v06-capabilities.png')
        }
        if (route === 'messaging') await expect(surface.locator('button.row-hover').first()).toBeVisible({ timeout: 30000 })
        if (route === 'artifacts') {
          await expect(surface.locator('[data-tour="page-tabs"]')).toBeVisible()
          await expect(surface.locator('tbody').getByText('fixture-note.md', { exact: true })).toBeVisible()
        }
        if (route === 'cron') await expect(surface.locator('[data-panel-row]').first()).toBeVisible()
        if (route !== 'capabilities') await screenshot(`v06-${route}.png`)
        if (route === 'cron') {
          await page.keyboard.press('Escape')
          await expect(surface).toHaveCount(0)
        }
      }
      await navigation('new-session').click()
      const recents = sidebar.locator('[data-hcv-recents-toggle]')
      await recents.click()
      await expect(recents).toHaveAttribute('aria-expanded', 'true')
      await expect(sidebar.locator('[data-hcv-recents-list]')).toContainText('Ревью интерфейса')
      await recents.click()
      const searchToggle = sidebar.locator('[data-hcv-search-toggle]')
      const search = sidebar.locator('[data-hcv-search-field] input')
      await expect(search).toBeHidden()
      await searchToggle.click()
      await expect(searchToggle).toHaveAttribute('aria-expanded', 'true')
      await expect(search).toBeFocused()
      await search.fill('Ревью интерфейса')
      await expect(sidebar.getByText('Ревью интерфейса', { exact: true }).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(searchToggle).toBeFocused()
      await expect(search).toHaveValue('')
      await expect(search).toBeHidden()
      await sidebar.locator('[data-hcv-notifications]').click()
      await expect(page).toHaveURL(/\/settings\?tab=notifications/)
      await page.keyboard.press('Escape')
      await expect(navigation('new-session')).toHaveAccessibleName(/Новый чат/)
      await expect(navigation('new-session').locator('[data-slot="kbd-group"]')).toBeHidden()
      await page.locator('[data-hcv-window-menu]').getByRole('button', { name: 'Файл' }).click()
      await expect(page.getByRole('menuitem', { name: 'Новый чат' })).toBeVisible()
      await page.keyboard.press('Escape')

      const project = sidebar.locator('[data-sessions-project]:not([data-sessions-mode])')
        .filter({ has: page.getByRole('button', { name: 'Тестовый проект', exact: true }) }).first()
      await expect(project).toBeVisible()
      const projectTrigger = project.getByRole('button', { name: 'Действия', exact: true })
      await expect(projectTrigger).toBeVisible()
      await projectTrigger.hover()
      const triggerBox = await projectTrigger.boundingBox()
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await projectTrigger.click()
      const projectMenu = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')
      await expect(projectMenu).toBeVisible()
      await expect(projectMenu).toHaveAttribute('data-hcv-sidebar-menu', '')
      await expect(projectMenu).toHaveCSS('animation-name', 'hcv-menu-in')
      await expect(projectMenu).toHaveCSS('animation-duration', '0.15s')
      await screenshot('v06-project-menu.png')
      const menuBox = await projectMenu.boundingBox()
      assert(Math.abs(triggerBox.x - menuBox.x) < 12, 'Menu should open next to the ellipsis')
      await page.keyboard.press('ArrowDown')
      await expect(projectMenu.locator('[role="menuitem"]:focus')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(projectTrigger).toBeFocused()
      await expect(projectMenu).toHaveCount(0)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await projectTrigger.press('Enter')
      await expect(projectMenu).toBeVisible()
      await expect(projectMenu).toHaveCSS('animation-name', 'none')
      await page.keyboard.press('Escape')

      const pinned = sidebar.locator('[data-sessions-mode] > [data-slot="sidebar-group"]').first()
      await projectChat('Ревью интерфейса').click({ modifiers: ['Shift'] })
      await expect(pinned.getByRole('button', { name: 'Ревью интерфейса', exact: true })).toBeVisible()
      const pinnedRow = pinned.getByRole('button', { name: 'Ревью интерфейса', exact: true })
      await pinnedRow.click({ button: 'right' })
      await expect(page.getByRole('menuitem', { name: /Открепить|Unpin/i })).toBeVisible()
      await screenshot('v06-pinned-menu.png')
      await page.getByRole('menuitem', { name: /Открепить|Unpin/i }).click()
      await expect(pinned.getByRole('button', { name: 'Ревью интерфейса', exact: true })).toHaveCount(0)

      const grouping = page.getByRole('menuitem', { name: /^Группировка/ })
      const chooseGrouping = async (label, view) => {
        await grouping.press('ArrowRight')
        await page.getByRole('menuitemradio', { name: label, exact: true }).click()
        await expect(sidebar.locator(`[data-sessions-mode="${view}"]`)).toBeAttached()
        for (let i = 0; i < 2 && await page.locator('[role="menu"][data-state="open"]').count(); i++) {
          await page.keyboard.press('Escape')
        }
      }
      await sidebar.getByRole('button', { name: 'Фильтры', exact: true }).click()
      await chooseGrouping('Обновление', 'flat')
      const openProjects = sidebar.locator('[data-hcv-show-projects]')
      await expect(openProjects).toBeVisible()
      await expect(sidebar.getByRole('button', { name: 'Недавние', exact: true })).toBeVisible()
      await openProjects.click()
      await expect(sidebar.locator('[data-sessions-mode="projects"]')).toBeVisible()
      await expect(grouping).toHaveCount(0)

      const links = page.locator('[data-overlay-surface] [data-tour="overlay-nav"]')
      await page.keyboard.press('Control+.')
      await expect(root).toHaveAttribute('data-hcv-screen', 'command-center')
      await links.locator('[data-tour="nav-sessions"]').click()
      const sessionSearch = page.getByPlaceholder(/Поиск сеансов|Search sessions/i).last()
      await expect(sessionSearch).toBeVisible()
      await sessionSearch.fill('Ревью интерфейса')
      await expect(page.locator('[data-overlay-surface] main').getByRole('button', { name: /Ревью интерфейса/ })).toBeVisible()
      await screenshot('v06-sessions.png')
      await page.keyboard.press('Escape')
      await expect(root).not.toHaveAttribute('data-hcv-screen', 'command-center')

      await page.keyboard.press('Control+,')
      await expect(root).toHaveAttribute('data-hcv-screen', 'settings')
      const settingGroups = await links.locator('button.row-hover').evaluateAll((nodes) =>
        nodes.filter((node) => !node.parentElement.id).map((node) => node.dataset.tour).filter(Boolean),
      )
      assert(settingGroups.length >= 17, `Expected all settings groups, got ${settingGroups}`)
      let settingSubpages = 0
      const nativeSubpageIcons = []
      for (const name of settingGroups) {
        const link = links.locator(`[data-tour="${name}"]`)
        await link.click()
        const settingMain = page.locator('[data-overlay-surface] main')
        await expect(settingMain).toHaveCSS('--conversation-text-font-size', '13px')
        await expect(settingMain.locator('nav [aria-current="page"]').first()).toBeVisible()
        await expect(link.locator(':scope > :is(svg, .codicon)').first()).not.toHaveCSS('mask-image', 'none')
        if (name === 'nav-config:model') {
          await expect(settingMain.getByRole('combobox').first()).toBeVisible()
          await screenshot('v06-settings-model.png')
        }
        const children = link.locator('xpath=../following-sibling::*[1][@id]').locator('button.row-hover')
        const subpageIds = await children.evaluateAll(nodes => nodes.map(node => node.dataset.tour).filter(Boolean))
        for (const id of subpageIds) {
          const subpage = links.locator(`[data-tour="${id}"]`)
          await subpage.click()
          await expect(subpage).toHaveAttribute('aria-current', 'page')
          await expect(settingMain.locator('nav [aria-current="page"]').first()).toBeVisible()
          const nativeIcon = await subpage.evaluate(node => {
            const icon = node.querySelector(':scope > :is(svg, .codicon)')
            return icon && getComputedStyle(icon).maskImage === 'none' ? icon.getAttribute('class') : null
          })
          if (nativeIcon) nativeSubpageIcons.push({ id, nativeIcon })
          settingSubpages++
        }
      }
      console.log(JSON.stringify({ settingsGroups: settingGroups.length, settingsSubpages: settingSubpages, nativeSubpageIcons }))
      if (process.env.HERMES_VISUAL_CONTINUE_KNOWN_ICON_GAP === '1') {
        // Diagnostic continuation only: keep the strict default failing and
        // record the exact known icon mismatch while exercising later steps.
        assert.deepEqual(nativeSubpageIcons.map(entry => entry.id), ['nav-config:model:delegation'])
        assert(nativeSubpageIcons[0].nativeIcon.includes('tabler-icon-git-fork'))
        console.log('Continuing after known settings icon mismatch')
      } else {
        assert.deepEqual(nativeSubpageIcons, [], 'Every settings navigation icon should use its Codex asset')
      }
      await page.keyboard.press('Escape')
      await expect(root).not.toHaveAttribute('data-hcv-screen', 'settings')
      await context.getByRole('button', { name: 'Показать все', exact: true }).hover()
      await screenshot('v06-workspace-card.png')

      const newSessionTab = page.locator('[data-zone-tabstrip] [data-slot="pane-tab"][data-active="true"][data-tree-tab="workspace"]')
        .filter({ hasText: /New chat|Новый чат|New session|Новая сессия|Новый сеанс/i }).first()
      await expect(newSessionTab).toBeVisible()
      const tabBounds = await newSessionTab.boundingBox()
      assert(tabBounds.height >= 28 && tabBounds.height <= 32, `Unexpected tab height: ${tabBounds.height}`)
      await newSessionTab.hover()
      await screenshot('v06-new-session.png')
      await navigation('new-session').click()
      await projectChat('Ревью интерфейса').click()
      await expect(page.locator('[data-slot="aui_thread-viewport"]').getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
      const selectedRow = projectChat('Ревью интерфейса')
        .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row-hover ")][1]')
      const idleDot = selectedRow.locator('span[aria-hidden="true"][class~="size-1"][class~="rounded-full"]')
      if (await idleDot.count()) await expect(idleDot).toHaveCSS('opacity', '0')
    }

    const composer = await waitForChatReady(page, 10000)
    await composer.fill(prompt)
    await composer.press('Enter')
    if (mode === 'candidate') {
      const currentChat = projectChat('Ревью интерфейса')
      const row = currentChat.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row-hover ")][1]')
      const visual = (property) => row.evaluate((element, cssProperty) =>
        getComputedStyle(element, '::after').getPropertyValue(cssProperty), property)
      await expect(row.getByRole('status', { name: 'Сеанс выполняется' })).toBeAttached()
      await mock.waitForHeldStream()
      await expect(page.locator('[data-slot="aui_response-group"] [data-message-streaming="true"]').last()).toBeAttached()
      await expect(page.locator('[data-hcv-thinking], [data-hcv-live-turn]')).toHaveCount(0)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect.poll(() => visual('animation-name')).toBe('hcv-sidebar-spin')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => visual('animation-name')).toBe('none')
      await screenshot('v05-running.png')
      await navigation('new-session').click()
      await expect(page.locator('[data-slot="aui_thread-viewport"]').getByText(prompt, { exact: true })).toHaveCount(0)
      mock.releaseHeldStream()
      await expect(row.getByRole('status', { name: /Завершён.*не прочитан/ })).toBeAttached({ timeout: 15000 })
      await expect.poll(() => visual('background-color')).toBe('rgb(51, 156, 245)')
      const projectUnread = page.locator('[data-hcv-projects-header]').getByRole('button', { name: 'Отметить все как прочитанные' })
      const projectsHeading = page.locator('[data-hcv-projects-header] [data-hcv-section-toggle]')
      await expect(projectUnread).toBeHidden()
      await projectsHeading.click()
      await expect(projectUnread).toBeVisible()
      assert.equal(await projectUnread.evaluate(node => getComputedStyle(node, '::after').backgroundColor), 'rgb(51, 156, 245)')
      await screenshot('v05-unread.png')
      await projectsHeading.click()
      if (!await currentChat.isVisible()) await page.locator('[data-hcv-sidebar-shell]').getByRole('button', { name: 'Тестовый проект', exact: true }).click()
      await currentChat.click()
      await expect(row.getByRole('status')).toHaveCount(0)
    }
    await page.getByText(MOCK_REPLY, { exact: false }).first().waitFor({ timeout: 30000 })
    await expect(page.getByText('Тестовый проект', { exact: true }).first()).toBeVisible()
    const prompts = await readMockPrompts(mock.url)
    assert.equal(
      prompts.filter((text) => text.includes(prompt)).length,
      1,
      'Native composer must submit once',
    )

    let layout
    if (mode === 'candidate') {
      layout = await page.evaluate(() => {
        const surface = document.querySelector('[data-chat-surface][data-composer-target="main"]')
        const dock = document.querySelector('[data-slot="composer-surface"]')
        const thread = document.querySelector('[data-slot="aui_thread-content"]')
        const sheet = document.querySelector('style[data-hermes-codex-visual]')
        return {
          chatColor: surface && getComputedStyle(surface).backgroundColor,
          chrome: getComputedStyle(document.documentElement).getPropertyValue('--ui-bg-chrome').trim(),
          hover: getComputedStyle(document.documentElement)
            .getPropertyValue('--ui-control-hover-background')
            .trim(),
          themeMode: document.documentElement.dataset.hermesMode,
          translucent:
            document.documentElement.hasAttribute('data-hermes-glass') ||
            document.documentElement.hasAttribute('data-hermes-clear'),
          styleRules: sheet?.sheet?.cssRules.length,
          composerWidth: dock?.getBoundingClientRect().width,
          threadWidth: thread?.getBoundingClientRect().width,
        }
      })
      console.log(JSON.stringify({ layout }))
      assert.equal(layout.chatColor, 'rgb(24, 24, 24)')
      assert.equal(layout.chrome, '#121212')
      assert.equal(layout.hover, '#252525')
      assert(layout.composerWidth <= 736 && layout.composerWidth > 550, 'Expected centered responsive composer')
      const context = page.locator('[data-hcv-context-card]')
      const contextBounds = await context.boundingBox()
      assert(contextBounds && Math.abs(contextBounds.width - 280) <= 1 && Math.abs(contextBounds.y - 93) <= 1)
      await expect(context.getByText('Тестовый поиск', { exact: true })).toBeVisible()
      const changes = context.locator('.hcv-context-changes').first()
      await changes.click()
      await expect(page.getByText('fixture-note.md', { exact: true }).first()).toBeVisible()
      const reviewPanel = page.getByRole('complementary', { name: /^(Проверить|Review)$/ })
      if (await reviewPanel.isVisible()) await reviewPanel.getByRole('button', { name: 'Закрыть', exact: true }).first().click()
      else if (await context.isVisible()) await changes.click()
      else await page.locator('[data-tour="right-pane-toggle"]').click()
      await expect(context).toBeVisible()
      await expect(page.locator('[data-hcv-context-toggle]')).toHaveAttribute('aria-expanded', 'true')
      const model = page.locator('[data-slot="composer-surface"] button').filter({ hasText: 'Mock Model' })
      await model.click()
      await expect(model).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(model).toHaveAttribute('aria-expanded', 'false')

      const turnFiles = page.locator('[data-slot="aui_changed-files"]')
      await expect(turnFiles).toHaveCount(0)
      await composer.fill(editsPrompt)
      await composer.press('Enter')
      await expect(turnFiles.getByText('Изменено 5 файлов')).toBeVisible({ timeout: 30000 })
      for (const name of newFiles) assert.equal(fs.readFileSync(path.join(projectFolder, name), 'utf8'), 'Одна строка для проверки.\n')
      assert.match(fs.readFileSync(path.join(projectFolder, 'fixture-note.md'), 'utf8'), /Обновлённый тестовый файл/)
      const group = turnFiles.locator('xpath=ancestor::*[@data-slot="aui_response-group"]')
      const work = group.getByRole('button', { name: /^Выполнено за \d+/ })
      const steps = group.locator('[data-hcv-turn-step]').first()
      await expect(work).toHaveAttribute('aria-expanded', 'false')
      await expect(steps).toBeHidden()
      await expect(group.getByText('Изменил пять файлов и закончил проверку.')).toBeVisible()
      await work.click()
      await expect(work).toHaveAttribute('aria-expanded', 'true')
      await expect(steps).toBeVisible()
      await screenshot('v05-steps.png')
      await work.click()
      await expect(steps).toBeHidden()
      await expect(turnFiles).toHaveAttribute('data-hcv-file-card', '')
      await expect(turnFiles.getByText('Изменено 5 файлов')).toBeVisible()
      await expect(turnFiles.locator('[data-hcv-files-heading] [data-hcv-files-added]')).toHaveText('+5')
      await expect(turnFiles.locator('[data-hcv-files-heading] [data-hcv-files-removed]')).toHaveText('–1')
      const more = turnFiles.getByRole('button', { name: 'Показать еще 2 файла' })
      const overflowFile = turnFiles.locator(':scope > div:nth-child(2) button').last()
      await expect(more).toHaveAttribute('aria-expanded', 'false')
      await expect(overflowFile).toBeHidden()
      await more.click()
      await expect(overflowFile).toBeVisible()
      await turnFiles.getByRole('button', { name: 'Свернуть файлы' }).click()
      await expect(overflowFile).toBeHidden()
      await turnFiles.getByRole('button', { name: 'Отменить' }).click()
      const restore = page.getByRole('dialog', { name: 'Восстановить до этого чекпоинта?' })
      await expect(restore).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(restore).toBeHidden()
      await screenshot('v05-chrome-dark.png')
      await turnFiles.getByRole('button', { name: 'Просмотреть изменения' }).click()
      const reviewPane = page.getByRole('complementary', { name: 'Проверить' })
      await expect(reviewPane).toBeVisible()
      await reviewPane.getByRole('button', { name: 'Закрыть', exact: true }).click()
      await expect(reviewPane).toBeHidden()

      const minimumWidth = await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize()[0],
      )
      const narrowWidth = Math.max(760, minimumWidth)
      await page.setViewportSize({ width: narrowWidth, height: 720 })
      await expect(context).toHaveCount(0)
      await expect
        .poll(
          async () => {
            const box = await composer.boundingBox()
            return Boolean(box && box.x >= 0 && box.x + box.width <= narrowWidth + 1)
          },
          { message: `Composer must remain reachable at ${narrowWidth}px` },
        )
        .toBe(true)
      await verifyNarrowSettings(narrowWidth)
      await page.setViewportSize({ width: 1440, height: 920 })
      console.log(JSON.stringify({ composerReachableAt: narrowWidth }))
      await page.reload()
      await waitForChatReady(page, 15000)
      await expect(root).toHaveAttribute('data-hermes-theme', 'codex-workspace')
      await expect.poll(chatColor).toBe('rgb(24, 24, 24)')
      await openThemeSettings()
      await page
        .getByText(/^(Светлая|Light)$/, { exact: true })
        .first()
        .click()
      await expect(root).toHaveAttribute('data-hermes-mode', 'light')
      await screenshot('v06-settings-light.png')
      await closeSettings()
      await expect.poll(chatColor).toBe('rgb(255, 255, 255)')
      await expect(context.getByText('Тестовый поиск', { exact: true })).toBeVisible()
      await screenshot('v05-chrome-light.png')
      await openThemeSettings()
      await page
        .getByText(/^(Тёмная|Темная|Dark)$/, { exact: true })
        .first()
        .click()
      await themeCard('GitHub').click()
      await expect(root).toHaveAttribute('data-hermes-theme', 'github')
      await themeCard('Nous').click()
      await expect(root).toHaveAttribute('data-hermes-theme', originalTheme)
      assert.deepEqual(
        (await readThemePreviews()).filter(([name]) => name !== 'Codex'),
        themePreviews,
      )
      await closeSettings()
      assert.equal(await chatColor(), originalChatColor)
      await expect(page.locator('[data-hcv-sidebar-bar], [data-hcv-window-menu], [data-hcv-context-card], [data-hcv-project-preview], [data-hcv-project-name], [data-hcv-projects-header], [data-hcv-cron-sidebar]')).toHaveCount(0)
      await expect(turnFiles).toBeVisible()
      await expect(turnFiles).not.toHaveCSS('border-radius', '10px')
      await expect(page.locator('[data-hcv-turn-line], [data-hcv-live-turn], [data-hcv-file-card]')).toHaveCount(0)
      await expect(page.locator('[data-zone-tabstrip="grp-sessions"] [data-tree-tab="sessions"]')).toBeVisible()
      await expect(menuArrow.first()).toBeVisible()
      await togglePlugin(false)
      await openThemeSettings()
      await expect(themeCard('Codex')).toHaveCount(0)
      assert.deepEqual(await readThemePreviews(), themePreviews)
    }

    console.log(
      JSON.stringify({
        mode,
        renderer: identity.appVersion,
        providerCalls: prompts.length,
        replyVisible: true,
        layout,
      }),
    )
  } catch (error) {
    hasMainError = true
    mainError = error
    try {
      if (turnControlFocus) {
        console.log('Fixture model turns', JSON.stringify(turnControlCalls.map(item => ({ ...item, text: item.text?.slice(0, 220) }))))
        const logs = path.join(sandbox.hermesHome, 'logs')
        for (const name of fs.existsSync(logs) ? fs.readdirSync(logs) : []) {
          if (!name.endsWith('.log')) continue
          const filename = path.join(logs, name)
          if (!fs.statSync(filename).isFile()) continue
          const body = fs.readFileSync(filename, 'utf8').slice(-128000)
          fs.writeFileSync(path.join(evidence, process.env.HERMES_VISUAL_EVIDENCE_VERSION + '-gateway-' + name), body)
          console.log('Isolated diagnostic ' + name, body.split(/\r?\n/).slice(-75).join('\n'))
        }
      }
      const log = path.join(sandbox.hermesHome, 'logs', 'desktop.log')
      if (fs.existsSync(log)) {
        const lines = fs.readFileSync(log, 'utf8').split(/\r?\n/)
        const errors = lines.filter(line => /(?:Type|Reference|Syntax)Error:|ErrorBoundary/.test(line)).slice(-6)
        console.error([...errors, ...lines.slice(-20)].join('\n'))
      }
    } catch (logError) {
      console.error('Could not read isolated diagnostic log:', logError)
    }
    throw error
  } finally {
    await cleanupVisualTest({
      sandboxRoot: sandbox.root,
      releases: [
        ['Release first token', () => firstToken?.resolve()],
        ...voiceRequests.map((request, index) => [`Release voice request ${index}`, () => request.release()]),
        ['Release chat fixture', () => chatFixture?.release()],
        ['Release queue fixture child', () => queueFixture?.releaseChild()],
        ['Release queue fixture parent', () => queueFixture?.releaseParent()],
        ['Release composer fixture', () => composerFixture?.release()],
        ['Release mock stream', () => mock.releaseHeldStream()],
      ],
      electronLaunchAttempted,
      hasElectronHandle: Boolean(app),
      closeApp: async () => app.close(),
      closeRemoteGateway: async () => closeTestGateway?.(),
      stopGateway: () => {
        // The helper must stop only the gateway it can identify as this test's.
        const result = spawnSync(pythonPath, ['-B', path.join(feature, 'verification/stop-isolated-gateway.py'), sandbox.hermesHome], {
          encoding: 'utf8', timeout: 12000, windowsHide: true,
        })
        if (result.stdout) console.log(result.stdout.trim())
        if (result.status !== 0) {
          throw new Error(result.stderr || result.error?.message || `cleanup exit ${result.status}`)
        }
        const stopped = typeof result.stdout === 'string' ? result.stdout.trim() : ''
        const confirmed = stopped === 'Stopped finished isolated gateway' || stopped === 'Isolated gateway already stopped'
        const absentBeforeLaunch = !electronLaunchAttempted && stopped === 'No isolated gateway recorded'
        if (!confirmed && !absentBeforeLaunch) {
          throw new Error('Gateway state unknown: cleanup did not confirm an identified stopped gateway')
        }
      },
      closeMock: async () => mock.close(),
      closeMcp: () => new Promise((resolve, reject) => mcp.close(error => error ? reject(error) : resolve())),
      removeSandbox: () => {
        // Confirm the actual target again immediately before recursive cleanup.
        assert.equal(fs.realpathSync(sandbox.root), sandboxRealPath, 'Isolated test profile changed before cleanup')
        assert.deepEqual(captureDirectoryIdentity(fs, sandbox.root), sandboxIdentity,
          'Isolated test profile identity changed before cleanup')
        sandbox.cleanup() // The fixture swallows rm errors, so check the result.
        try {
          fs.lstatSync(sandbox.root)
        } catch (error) {
          if (error?.code === 'ENOENT') return
          throw error
        }
        throw new Error('Isolated test profile was not fully removed')
      },
      hasMainError,
      mainError,
    })
  }
})
