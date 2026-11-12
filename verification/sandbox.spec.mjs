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
const repository = path.resolve(desktop, '../..')
const fixtureRepository = path.resolve(fixtureDesktop, '../..')
const feature = path.resolve(import.meta.dirname, '..')
const evidence = path.join(feature, 'evidence')
const displayFocus = process.env.HERMES_VISUAL_FOCUS === 'display'
const contextFocus = process.env.HERMES_VISUAL_FOCUS === 'context-meter'
const composerFocus = process.env.HERMES_VISUAL_FOCUS === 'composer'
const composerLiveFocus = process.env.HERMES_VISUAL_FOCUS === 'composer-live'
const modelMenuFocus = process.env.HERMES_VISUAL_FOCUS === 'model-menu'
const densityFocus = process.env.HERMES_VISUAL_FOCUS === 'density-parity'
const chatParityFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-parity'
const subagentsPaneFocus = process.env.HERMES_VISUAL_FOCUS === 'subagents-pane'
const draftSetupFocus = process.env.HERMES_VISUAL_FOCUS === 'draft-setup'
const sidebarActivityFocus = process.env.HERMES_VISUAL_FOCUS === 'sidebar-activity'
const dictationFocus = process.env.HERMES_VISUAL_FOCUS === 'dictation'
const shellFocus = process.env.HERMES_VISUAL_FOCUS === 'shell-surfaces'
const replyErrorFocus = process.env.HERMES_VISUAL_FOCUS === 'reply-error'
const renameTabsFocus = process.env.HERMES_VISUAL_FOCUS === 'rename-tabs'
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

function replyToEditFixture(res, request, tools) {
  const lastPrompt = request.messages.findLastIndex((message) => message.role === 'user')
  const settled = request.messages.slice(lastPrompt + 1).some((message) => message.role === 'tool')
  const content = settled ? 'Изменил пять файлов и закончил проверку.' : 'Начинаю правки в тестовом проекте.'
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


async function createTestGateway(sandbox, env, providerUrl) {
  const home = path.join(sandbox.root, 'remote-profile')
  fs.mkdirSync(home)
  const folder = path.join(home, 'server-workspace')
  fs.mkdirSync(folder)
  writeMockProviderConfig(home, providerUrl)
  writeEnvFile(home, 'e2e-mock-key', providerUrl)
  const remoteEnv = {
    ...env, HERMES_HOME: home, USERPROFILE: home, PYTHONPATH: repository,
    HERMES_DASHBOARD_SESSION_TOKEN: randomUUID(),
  }
  const seeded = spawnSync(pythonPath, ['-B', '-X', 'utf8', '-c',
    "from hermes_cli.projects_db import connect_closing, create_project; import pathlib, sys\nwith connect_closing(pathlib.Path(sys.argv[1]) / 'projects.db') as db:\n    create_project(db, name='Серверный проект', slug='server-workspace', folders=[sys.argv[2]])",
    home, folder,
  ], { cwd: repository, env: remoteEnv, encoding: 'utf8' })
  assert.equal(seeded.status, 0, seeded.stderr)
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
  if (settingsAudit) test.setTimeout(300000)
  if (composerFocus || delegateFocus || draftSetupFocus || densityFocus || process.env.HERMES_VISUAL_FOCUS === 'desktop-surfaces') {
    test.setTimeout(210000)
  }
  const chatParity = delegateFocus || draftSetupFocus ? await import('./chat-parity.spec-helper.mjs') : null
  const chatFixture = delegateFocus ? chatParity.makeChatFixture() : null
  const dictation = dictationFocus ? await import('./dictation.spec-helper.mjs') : null
  const chatReference = process.env.HERMES_VISUAL_CHAT_REFERENCE === '1'
  const sandbox = createSandbox('codex-visual')
  const relativeSandbox = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(sandbox.root))
  assert(
    /^hermes-e2e-codex-visual-[^/\\]+$/.test(relativeSandbox),
    'Expected an isolated temporary test directory',
  )
  const prompt = 'Проверь рабочий чат и покажи короткий ответ.'
  const firstToken = sidebarActivityFocus ? Promise.withResolvers() : null
  const voiceRequests = []
  const projectFolder = path.join(sandbox.root, 'demo-workspace')
  const resourceFocus = process.env.HERMES_VISUAL_FOCUS === 'chat-resources'
  const tables = process.env.HERMES_VISUAL_FOCUS === 'chat-tables' ? await import('./chat-tables.spec-helper.mjs') : null
  const tableFixture = tables?.makeTableFixture()
  const composerLive = composerLiveFocus ? await import('./composer-live.spec-helper.mjs') : null
  const composerFixture = composerLive?.makeComposerFixture(projectFolder)
  const editsPrompt = 'Обнови заметку и подготовь четыре тестовых файла.'
  const newFiles = ['turn-change.py', 'release-notes.md', 'scope-check.txt', 'diagnostics.txt']
  const fixtureTools = [
    { name: 'patch', args: { mode: 'replace', path: path.join(projectFolder, 'fixture-note.md'), old_string: '# Тестовый файл', new_string: '# Обновлённый тестовый файл' } },
    ...newFiles.map((name) => ({ name: 'write_file', args: { path: path.join(projectFolder, name), content: 'Одна строка для проверки.\n' } })),
  ]
  const mock = await startMockServer({
    extraModels: contextFocus ? ['mock-wide'] : modelMenuFocus || densityFocus ? ['mock-variant-preview'] : undefined,
    holdFirstStreamForPrompt: mode === 'candidate' ? prompt : undefined,
  })
  const mcp = createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const data = Buffer.concat(chunks)
      if (resourceFocus && req.url === '/resource-preview') {
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
        if (body.id == null) return res.writeHead(202).end()
        const result = body.method === 'initialize'
          ? { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Fixture MCP', version: '1.0.0' } }
          : body.method === 'tools/list' ? { tools: [] } : {}
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
      }
      if (req.url === '/v1/chat/completions') {
        const request = JSON.parse(data.toString())
        if (await tableFixture?.reply(res, request)) return
        if (await composerFixture?.reply(request, (content, tools) => replyToFixture(res, request, content, tools))) return
        if (await chatFixture?.reply(request, (content, tools = []) => replyToFixture(res, request, content, tools))) return
        const message = request.messages?.findLast((item) => item.role === 'user')?.content
        if (message?.includes?.(editsPrompt)) {
          return replyToEditFixture(res, request, fixtureTools)
        }
        if (firstToken && message?.includes?.(prompt)) await firstToken.promise
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

  try {
    fs.mkdirSync(path.join(projectFolder, '.git', 'objects'), { recursive: true })
    fs.mkdirSync(path.join(projectFolder, '.git', 'refs', 'heads'), { recursive: true })
    fs.writeFileSync(path.join(projectFolder, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    fs.writeFileSync(path.join(projectFolder, '.git', 'config'), '[core]\nrepositoryformatversion = 0\nbare = false\n')
    fs.writeFileSync(path.join(projectFolder, 'fixture-note.md'), '# Тестовый файл\n')
    fs.writeFileSync(path.join(projectFolder, 'fixture-rules.txt'), 'Тестовое вложение\n')
    fs.writeFileSync(path.join(projectFolder, 'fixture-screen.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6v0AAAAASUVORK5CYII=', 'base64',
    ))
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
    git('-c', 'user.name=Hermes Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Seed test file')
    if (draftSetupFocus) git('branch', 'hcv-fixture-branch')
    fs.appendFileSync(path.join(projectFolder, 'fixture-note.md'), '\nИзменение для проверки.\n')
    assert.match(git('status', '--short'), / M fixture-note\.md/)
    writeMockProviderConfig(
      sandbox.hermesHome,
      fixtureUrl,
      undefined,
      `terminal:\n  cwd: ${JSON.stringify(projectFolder)}\nauxiliary:\n  title_generation:\n    enabled: false\nmcp_servers:\n  Тестовый поиск:\n    url: ${mcpUrl}\n  Тестовые документы:\n    url: ${mcpUrl}`
        + (dictationFocus ? `\nstt:\n  enabled: true\n  provider: openai\n  openai:\n    api_key: e2e-mock-key\n    base_url: ${fixtureUrl}/v1\n    model: whisper-1` : ''),
    )
    writeEnvFile(sandbox.hermesHome, 'e2e-mock-key', delegateFocus || tables ? fixtureUrl : undefined)
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

    const roaming = path.join(sandbox.root, 'AppData', 'Roaming')
    const local = path.join(sandbox.root, 'AppData', 'Local')
    fs.mkdirSync(roaming, { recursive: true })
    fs.mkdirSync(local, { recursive: true })
    const env = buildAppEnv(sandbox, {
      HERMES_DESKTOP_PYTHON: fs.realpathSync(pythonPath),
      PYTHONDONTWRITEBYTECODE: '1',
      GIT_CONFIG_GLOBAL: emptyGitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      USERPROFILE: sandbox.root,
      APPDATA: roaming,
      LOCALAPPDATA: local,
    })
    delete env.HERMES_DESKTOP_REMOTE_URL
    delete env.HERMES_DESKTOP_DEV_SERVER
    const projectSeed = spawnSync(
      fs.realpathSync(pythonPath),
      [
        '-B',
        '-X',
        'utf8',
        '-c',
        `
from pathlib import Path
from time import time
from urllib.parse import quote
import sys
from hermes_cli.projects_db import connect_closing, create_project, set_active
from hermes_state import SessionDB
with connect_closing(Path(sys.argv[1])) as conn:
    pid = create_project(conn, name='Тестовый проект', slug='demo-workspace', folders=[sys.argv[2]])
    for slug, name in [('site', 'Сайт'), ('design', 'Дизайн')]:
        folder = Path(sys.argv[2]).parent / slug
        folder.mkdir()
        create_project(conn, name=name, slug=slug, folders=[str(folder)])
    set_active(conn, pid)
db = SessionDB(db_path=Path(sys.argv[1]).with_name('state.db'))
titles = ['Ревью интерфейса', 'Проверка каталога']
if sys.argv[3] == 'summary':
    titles.append('새 채팅 확인')
if sys.argv[3] == 'sidebar-chat-order':
    titles.append('Третий тестовый чат')
for i, title in enumerate(titles, 1):
    sid = f'20261108_12450{i}_aab00{i}'
    db.create_session(sid, 'desktop', model='mock-model', cwd=sys.argv[2], profile_name='default', git_repo_root=sys.argv[2])
    db.set_session_title(sid, title)
    request = 'Проверь тестовый проект.'
    if i == 2:
        request += chr(10) + '@image:' + chr(96) + (Path(sys.argv[2]) / 'fixture-screen.png').as_posix() + chr(96)
        request += chr(10) + '@file:fixture-rules.txt'
    sent = time() - 5 * 86400 if i == 2 and sys.argv[3] == 'sidebar-activity' else None
    if i == 1 and sys.argv[3] == 'density-parity':
        from datetime import datetime
        sent = datetime.fromisoformat('2026-11-12T16:44:00+03:00').timestamp()
    if sys.argv[3] == 'sidebar-chat-order':
        sent = time() - (3 - i) * 7 * 86400
    db.append_message(sid, 'user', request, timestamp=sent)
    reply = 'Тестовый чат готов к проверке.'
    if i == 2 and sys.argv[3] in ('summary', 'summary-sources', 'desktop-surfaces'):
        reply += chr(10) * 2 + '[Preview: Заметка проекта](#preview/' + quote((Path(sys.argv[2]) / 'fixture-note.md').as_posix(), safe='') + ')'
        reply += chr(10) * 2 + '[Справка по каталогу](https://example.invalid/connector-guide)'
        if sys.argv[3] == 'desktop-surfaces':
            folder = Path(sys.argv[2])
            for name in ('review-notes.md', 'interface-metrics.csv', 'release-check.txt'):
                artifact = folder / name
                artifact.write_text('Тестовый результат', encoding='utf-8')
                reply += chr(10) * 2 + f'[{name}]({artifact.as_uri()})'
            for slug in ('setup-guide', 'search-examples', 'desktop-notes'):
                reply += chr(10) * 2 + f'[Документация](https://example.invalid/{slug})'
        if sys.argv[3] == 'summary':
            for line in range(1, 37):
                reply += chr(10) * 2 + f'Контрольный абзац {line}. Проверка положения длинного разговора при открытии сводки.'
    elif i == 2 and sys.argv[3] == 'chat-resources':
        import wave
        folder = Path(sys.argv[2])
        long_file = folder / ('fixture-' + 'long-file-name-' * 8 + 'report.txt')
        long_file.write_text('Тестовый отчёт', encoding='utf-8')
        audio = folder / 'fixture-audio.wav'
        with wave.open(str(audio), 'wb') as wav:
            wav.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
            wav.writeframes(bytes(8000))
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
        ])
    elif i == 2:
        reply = '[Заметка проекта](' + (Path(sys.argv[2]) / 'fixture-note.md').as_posix() + ')'
    db.append_message(sid, 'assistant', reply, timestamp=sent)
if sys.argv[3] == 'shell-surfaces':
    sid = '20261108_124506_aab006'
    db.create_session(sid, 'desktop', model='mock-model', profile_name='default')
    db.set_session_title(sid, 'Чат без папки')
    db.append_message(sid, 'user', 'Проверка чата без папки.')
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
if sys.argv[3] == 'chat-activity':
    import base64, json, struct, zlib
    sid = '20261108_124502_aab002'
    folder = Path(sys.argv[2])
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = (bytes(1) + bytes((42, 118, 239)) * 88 + bytes((181, 226, 245)) * 72) * 100
    png = bytes.fromhex('89504e470d0a1a0a') + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 100, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
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
    db.append_message(sid, 'assistant', 'Проверка истории завершена.')
if sys.argv[3] == 'chat-tables':
    sid = '20261108_124502_aab002'
    db.append_message(sid, 'user', 'Покажи три таблицы.')
    db.append_message(sid, 'assistant', ${JSON.stringify(tableFixture?.saved || '')})
if sys.argv[3] == 'display':
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
    extra = create_profile('visual-other', no_alias=True, no_skills=True)
    other = SessionDB(db_path=extra / 'state.db')
    seed_loose(
        other, 'visual-other', '20261102_110000_bbbb00', 'Старый чат другого профиля', 2,
        [('user', 'Запрос из старого чата.'), ('assistant', 'Ответ из другого профиля.')],
    )
    other.close()
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
if sys.argv[3] in ('project-reveal', 'sidebar-activity'):
    from hermes_cli.profiles import create_profile
    other = create_profile('visual-other', no_alias=True, no_skills=True)
    if sys.argv[3] == 'sidebar-activity':
        empty_folder = Path(sys.argv[2]).parent / 'empty-project'
        empty_folder.mkdir()
        with connect_closing(other / 'projects.db') as conn:
            create_project(conn, name='Пустой проект', slug='empty-project', folders=[str(empty_folder)])
`,
        path.join(sandbox.hermesHome, 'projects.db'),
        projectFolder,
        process.env.HERMES_VISUAL_FOCUS || 'full',
        fixtureUrl,
      ],
      {
        cwd: repository,
        env,
        encoding: 'utf8',
      },
    )
    assert.equal(projectSeed.status, 0, projectSeed.stderr || 'Could not seed the test project')
    if (draftSetupFocus || shellFocus) closeTestGateway = await createTestGateway(sandbox, env, fixtureUrl)
    if (displayFocus) {
      const otherProfile = path.join(sandbox.hermesHome, 'profiles', 'visual-other')
      writeMockProviderConfig(otherProfile, fixtureUrl)
      writeEnvFile(otherProfile)
    }
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
    app = await _electron.launch({
      executablePath: process.env.HERMES_VISUAL_ELECTRON || findElectron(),
      args: [entry, '--disable-gpu', '--no-sandbox',
        ...(dictation ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
          `--use-file-for-fake-audio-capture=${audioFile}`] : [])],
      cwd: desktop,
      env: { ...env, HERMES_VISUAL_DESKTOP: desktop },
    })
    const page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    const runtime = await app.evaluate(({ app }) => ({
      home: process.env.HERMES_HOME,
      userData: app.getPath('userData'),
      electron: process.versions.electron,
      version: app.getVersion(),
    }))
    assert.equal(fs.realpathSync(runtime.home), fs.realpathSync(sandbox.hermesHome))
    assert.equal(fs.realpathSync(runtime.userData), fs.realpathSync(sandbox.userDataDir))
    console.log('Isolated Hermes Desktop', runtime.version, 'Electron', runtime.electron)
    const identity = await readChatIdentity(page)
    if (identity.hermesHome) {
      assert.equal(fs.realpathSync(identity.hermesHome), fs.realpathSync(sandbox.hermesHome))
    }

    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'reduce' })
    // Match the reference's opaque dark window in this temporary profile only.
    if (displayFocus) await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+03:00'))
    await page.addInitScript(({ showTerminal, collapseOldDate, renameRightTile, showDatedProjectChats }) => {
      localStorage.setItem('hermes-desktop-mode-v1', 'dark')
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
    }, {
      showTerminal: displayFocus || process.env.HERMES_VISUAL_FOCUS === 'polish',
      collapseOldDate: displayFocus && !displayBaseline,
      renameRightTile: renameTabsFocus ? '20261108_124502_aab002' : null,
      showDatedProjectChats: process.env.HERMES_VISUAL_FOCUS === 'sidebar-chat-order',
    })
    const contextCheck = contextFocus ? await import('./context-meter.spec-helper.mjs') : null
    const contextFixture = await contextCheck?.installContextFixture(page)
    const shellCheck = shellFocus ? await import('./shell-surfaces.spec-helper.mjs') : null
    const shellFixture = await shellCheck?.installShellFixture(page)
    const settingsCheck = settingsAudit ? await import('./settings-audit.spec-helper.mjs') : null
    await settingsCheck?.installSettingsAuditFixture(app, page, desktop)
    const replyErrorCheck = replyErrorFocus ? await import('./reply-error.spec-helper.mjs') : null
    await replyErrorCheck?.installReplyErrorFixture(page)
    await page.reload(contextFocus || tables ? { waitUntil: 'domcontentloaded' } : undefined)
    await page.setViewportSize({ width: 1440, height: 920 })
    await waitForChatReady(page, 75000)
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
      const pluginSearch = page.getByPlaceholder(/^(Поиск плагинов|Search plugins)/i).first()
      await pluginSearch.fill('Codex', { timeout: 10000 })
      const toggle = page.getByRole('switch', { name: /Hermes Codex Visual|Рабочий экран в стиле Codex/ })
      if (!(await toggle.isVisible())) {
        const installedTab = page.getByText(/^(Установленные|Installed)$/)
        if (await installedTab.first().isVisible()) await installedTab.first().click()
      }
      await expect(toggle).toHaveAttribute('aria-checked', String(!enabled), { timeout: 10000 })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', String(enabled))
      await expect(marker).toHaveCount(enabled ? 1 : 0)
      await expect(sheet).toHaveCount(enabled ? 1 : 0)
    }

    fs.mkdirSync(evidence, { recursive: true })
    const evidenceVersion = process.env.HERMES_VISUAL_EVIDENCE_VERSION || 'v07'
    const screenshot = async (name, options) => {
      if (process.env.HERMES_VISUAL_SKIP_SCREENSHOTS === '1') return
      return page.screenshot({ animations: 'disabled', ...options, path: path.join(evidence, evidenceVersion + '-' + name.replace(/^v05-/, 'regression-').replace(/^v0[67]-/, '')) })
    }
    const verifyNarrowSettings = async (width) => {
      await page.keyboard.press('Control+,')
      const main = page.locator('[data-overlay-surface] main')
      const title = main.locator(':scope > nav [aria-current="page"]')
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
      await themeCard('Codex').click()
      await expect(root).toHaveAttribute('data-hermes-theme', 'codex-workspace')
      await closeSettings()
      if (settingsAudit) {
        await settingsCheck.verifySettingsAudit({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard })
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
      if (process.env.HERMES_VISUAL_FOCUS === 'chat-activity') {
        const { verifyChatActivity } = await import('./chat-activity.spec-helper.mjs')
        await verifyChatActivity({ page, app, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard })
        return
      }
      if (tables) {
        await tables.verifyChatTables({ page, expect, projectChat, screenshot, openThemeSettings, closeSettings, themeCard, fixture: tableFixture })
        return
      }
      if (resourceFocus) {
        const { verifyChatResources } = await import('./chat-resources.spec-helper.mjs')
        await verifyChatResources({
          app, page, expect, projectChat, screenshot, projectFolder, downloadDir: sandbox.root,
          openThemeSettings, closeSettings,
        })
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
      if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-selection') {
        const { verifySidebarSelection } = await import('./sidebar.spec-helper.mjs')
        await verifySidebarSelection({ page, expect, navigation, screenshot, openThemeSettings, closeSettings })
        return
      }
      if (renameTabsFocus) {
        const { verifyRenameTabs } = await import('./rename-tabs.spec-helper.mjs')
        await verifyRenameTabs({ page, expect, projectChat, screenshot, prompts: mock.receivedPrompts })
        return
      }
      if (replyErrorCheck) {
        await replyErrorCheck.verifyReplyError({ page, expect, screenshot, projectChat, openThemeSettings, closeSettings })
        return
      }
      if (shellCheck) {
        await shellCheck.verifyShellSurfaces({ app, page, expect, screenshot, projectChat, projectFolder, fixture: shellFixture })
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
        await chatParity.verifyDraftSetup({ page, expect, screenshot })
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
        await contextCheck.verifyContextMeter({ page, expect, screenshot, projectChat, fixture: contextFixture, reply: MOCK_REPLY })
        return
      }
      if (composerFocus) {
        const { verifyComposer } = await import('./composer.spec-helper.mjs')
        await verifyComposer({ page, expect, screenshot, mock, prompt })
        return
      }
      if (composerLive) {
        const { parse } = await import(pathToFileURL(path.join(repository, 'node_modules/yaml/dist/index.js')))
        const readMode = () => parse(fs.readFileSync(path.join(sandbox.hermesHome, 'config.yaml'), 'utf8'))?.approvals?.mode
        await composerLive.verifyComposerLive({ page, expect, screenshot, fixture: composerFixture, readMode })
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
      if (displayFocus) {
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
      if (sidebarActivityFocus) {
        const { verifySidebarActivity } = await import('./sidebar.spec-helper.mjs')
        await verifySidebarActivity({
          page, expect, sidebar, screenshot, projectChat, newChat: navigation('new-session'),
          waitForChatReady, mock, prompt, releaseFirstToken: firstToken.resolve,
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
        await expect(row).toHaveCSS('background-color', 'rgb(37, 37, 37)')
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
        await expect(summary).toHaveCSS('width', '300px')
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
        await directory.locator('div:has(> h2) > button').first().click()
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
        if (route === 'messaging') await expect(surface.locator('button.row-hover').first()).toBeVisible()
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
      await pinnedRow.hover()
      await pinned.getByRole('button', { name: 'Действия с сеансом' }).click()
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
        await expect(settingMain).toHaveCSS('--conversation-text-font-size', '14px')
        await expect(settingMain.locator(':scope > nav [aria-current="page"]')).toBeVisible()
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
          await expect(settingMain.locator(':scope > nav [aria-current="page"]')).toBeVisible()
          const nativeIcon = await subpage.evaluate(node => {
            const icon = node.querySelector(':scope > :is(svg, .codicon)')
            return icon && getComputedStyle(icon).maskImage === 'none' ? icon.getAttribute('class') : null
          })
          if (nativeIcon) nativeSubpageIcons.push({ id, nativeIcon })
          settingSubpages++
        }
      }
      console.log(JSON.stringify({ settingsGroups: settingGroups.length, settingsSubpages: settingSubpages, nativeSubpageIcons }))
      assert.deepEqual(nativeSubpageIcons, [], 'Every settings navigation icon should use its Codex asset')
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
      await expect(projectChat('Ревью интерфейса').locator('span[aria-hidden="true"][class~="size-1"][class~="rounded-full"]')).toHaveCSS('opacity', '0')
    }

    const composer = await waitForChatReady(page, 10000)
    await composer.fill(prompt)
    await composer.press('Enter')
    if (mode === 'candidate') {
      const currentChat = projectChat('Ревью интерфейса')
      const row = currentChat.locator('xpath=..')
      const visual = (property) => row.evaluate((element, cssProperty) =>
        getComputedStyle(element, '::after').getPropertyValue(cssProperty), property)
      await expect(currentChat.getByRole('status', { name: 'Сеанс выполняется' })).toBeAttached()
      await mock.waitForHeldStream()
      const activity = page.locator('[data-hcv-live-turn], [data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"]').last()
      await expect(activity).toBeVisible()
      await expect(activity).toContainText(/[1-9]\d*\s?[sс]/)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect.poll(() => visual('animation-name')).toBe('hcv-sidebar-spin')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => visual('animation-name')).toBe('none')
      await screenshot('v05-running.png')
      await navigation('new-session').click()
      await expect(page.locator('[data-slot="aui_thread-viewport"]').getByText(prompt, { exact: true })).toHaveCount(0)
      mock.releaseHeldStream()
      await expect(currentChat.getByRole('status', { name: /Завершён.*не прочитан/ })).toBeAttached({ timeout: 15000 })
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
      await expect(currentChat.getByRole('status')).toHaveCount(0)
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
      assert(contextBounds && Math.abs(contextBounds.width - 300) <= 1 && Math.abs(contextBounds.y - 93) <= 1)
      await expect(context.getByText('Тестовый поиск', { exact: true })).toBeVisible()
      const changes = context.getByRole('button', { name: 'Изменения', exact: true })
      await changes.click()
      await expect(page.getByText('fixture-note.md', { exact: true }).first()).toBeVisible()
      if (await context.isVisible()) await changes.click()
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
      await expect(turnFiles.getByRole('button', { name: /turn-change\.py/ })).toBeVisible({ timeout: 30000 })
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
      await expect(turnFiles).toHaveCSS('border-radius', '10px')
      await expect(turnFiles.getByText('Изменено 5 файлов')).toBeVisible()
      await expect(turnFiles.locator('[data-hcv-files-added]')).toHaveText('+5')
      await expect(turnFiles.locator('[data-hcv-files-removed]')).toHaveText('−1')
      const more = turnFiles.getByRole('button', { name: 'Показать ещё 2 файла' })
      await expect(more).toHaveAttribute('aria-expanded', 'false')
      await expect(turnFiles.getByText('diagnostics.txt', { exact: true })).toBeHidden()
      await more.click()
      await expect(turnFiles.getByText('diagnostics.txt', { exact: true })).toBeVisible()
      await turnFiles.getByRole('button', { name: 'Свернуть список' }).click()
      await expect(turnFiles.getByText('diagnostics.txt', { exact: true })).toBeHidden()
      await turnFiles.getByRole('button', { name: 'Чекпоинт' }).click()
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
    const log = path.join(sandbox.hermesHome, 'logs', 'desktop.log')
    if (fs.existsSync(log)) {
      const lines = fs.readFileSync(log, 'utf8').split(/\r?\n/)
      const errors = lines.filter(line => /(?:Type|Reference|Syntax)Error:|ErrorBoundary/.test(line)).slice(-6)
      console.error([...errors, ...lines.slice(-20)].join('\n'))
    }
    throw error
  } finally {
    firstToken?.resolve()
    for (const request of voiceRequests) request.release()
    chatFixture?.release()
    composerFixture?.next()
    composerFixture?.finish()
    mock.releaseHeldStream()
    await app?.close()
    await closeTestGateway?.()
    await mock.close()
    await new Promise((resolve) => mcp.close(resolve))
    sandbox.cleanup()
  }
})
