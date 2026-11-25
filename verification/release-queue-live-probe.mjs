import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const verifier = fs.realpathSync(import.meta.dirname)
const id = 'hermes-codex-visual'
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function poll(action, ms) {
  const end = Date.now() + ms
  let failure
  do {
    try { return await action() } catch (error) { failure = error }
    await delay(350)
  } while (Date.now() < end)
  throw failure
}

export async function probe(localProject, archiveOrPackage, expectedVersions) {
  const clock = performance.now()
  const project = fs.realpathSync(localProject)
  assert.equal(verifier, path.join(project, 'verification'))
  assert(process.env.HCV_RELEASE_PROBE_ROOT, 'Missing private activation folder')
  const scratch = fs.realpathSync(process.env.HCV_RELEASE_PROBE_ROOT)
  const archive = fs.realpathSync(path.resolve(project, archiveOrPackage))
  for (const key of ['desktop', 'agent']) assert.match(expectedVersions[key], /^\d+\.\d+\.\d+$/)

  const run = fs.mkdtempSync(path.join(scratch, 'hermes-e2e-codex-visual-'))
  const evidenceFile = path.join(run, 'evidence.json')
  const evidence = { passed: false, run, archive, expectedVersions, timings: {} }
  const mark = name => { evidence.timings[name] = Math.round(performance.now() - clock) / 1000 }
  const record = () => writeJson(evidenceFile, evidence)
  const sandbox = { root: run, hermesHome: path.join(run, 'hermes-home'), userDataDir: path.join(run, 'electron-data') }
  const subdir = name => {
    const directory = path.join(run, name)
    fs.mkdirSync(directory, { recursive: true })
    return directory
  }
  const temp = subdir('tmp')
  const appData = subdir('roaming')
  const localAppData = subdir('local')
  subdir('electron-data')
  subdir('hermes-home/profiles')
  const requests = []
  let blockedProxyRequests = 0
  const reject = createServer((req, res) => {
    if (req.headers.host === rejectAddress && req.url.startsWith('/')) {
      requests.push({ method: req.method, path: req.url.split('?', 1)[0] })
    } else blockedProxyRequests++
    res.writeHead(403).end()
  })
  reject.on('connect', (_req, socket) => {
    blockedProxyRequests++
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
  })
  let rejectAddress
  let app
  let appProcess
  let helper
  let failure
  try {
    const { stdout } = await execute('python', ['-I', '-B', path.join(project, 'scripts', 'test_runtime_guard.py'), '--project', project],
      { cwd: run, windowsHide: true, timeout: 25000 })
    const pin = JSON.parse(stdout)
    const runtimeRoot = path.join(process.env.LOCALAPPDATA, 'hermes')
    const repository = path.join(runtimeRoot, 'hermes-agent')
    const desktop = path.join(repository, 'apps', 'desktop')
    const fixture = path.join(runtimeRoot, 'source-archive', 'hermes-agent-main', 'apps', 'desktop')
    const electron = path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe')
    const require = createRequire(path.join(fixture, 'package.json'))
    const playwright = path.dirname(require.resolve('@playwright/test/package.json'))
    const { _electron } = await import(pathToFileURL(path.join(playwright, 'index.mjs')))
    const routing = await import(pathToFileURL(path.join(project, 'verification', 'isolated-routing.mjs')))
    evidence.runtime = { pin, desktopEntry: path.join(desktop, 'dist', 'electron-main.mjs'), electron }
    mark('runtime_pin_checked')

    await new Promise((resolve, rejectListen) => reject.once('error', rejectListen).listen(0, '127.0.0.1', resolve))
    rejectAddress = `127.0.0.1:${reject.address().port}`
    const dummy = `http://${rejectAddress}`
    const system = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      /^(SystemRoot|WinDir|ComSpec|PATHEXT|OS|SystemDrive|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|USERNAME)$/i.test(name)))
    const envInputs = {
      ...system, Path: [path.dirname(pin.python), path.dirname(pin.base_python), path.join(process.env.SystemRoot, 'System32')].join(';'),
      HERMES_DESKTOP_HERMES_ROOT: repository, HERMES_DESKTOP_PYTHON: pin.python,
      HERMES_DESKTOP_APP_NAME: `HermesHcvProbe-${path.basename(run).split('-').at(-1)}`,
      HERMES_DESKTOP_IGNORE_EXISTING: '1', HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION: '1',
      HERMES_DESKTOP_SKIP_QUIT_CONFIRM: '1', HERMES_DISABLE_LAZY_INSTALLS: '1',
      HCV_ACTIVATION_RUN: run, HCV_DESKTOP_ENTRY: evidence.runtime.desktopEntry, HCV_DESKTOP_ROOT: desktop,
      HCV_RELEASE_PROBE_ROOT: scratch, HCV_RELEASE_PROBE_TOKEN: process.env.HCV_RELEASE_PROBE_TOKEN || '',
      HCV_LOOPBACK_PROXY: dummy, PYTHONPATH: repository, PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1', PYTHONUTF8: '1', APPDATA: appData, LOCALAPPDATA: localAppData,
      TEMP: temp, TMP: temp, TMPDIR: temp, XDG_CONFIG_HOME: subdir('xdg-config'),
      XDG_CACHE_HOME: subdir('xdg-cache'), XDG_DATA_HOME: subdir('xdg-data'),
      UV_CACHE_DIR: subdir('uv-cache'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(run, 'gitconfig'),
      HTTP_PROXY: dummy, HTTPS_PROXY: dummy, ALL_PROXY: dummy, NO_PROXY: '127.0.0.1,localhost,::1',
    }
    fs.writeFileSync(envInputs.GIT_CONFIG_GLOBAL, '')
    const oldTemp = process.env.TEMP
    process.env.TEMP = scratch
    let env
    try { env = routing.pinIsolatedRouting(sandbox, envInputs) } finally {
      if (oldTemp === undefined) delete process.env.TEMP
      else process.env.TEMP = oldTemp
    }
    writeJson(path.join(sandbox.hermesHome, 'config.yaml'), {
      plugins: { enabled: [id] }, auxiliary: { title_generation: { enabled: false } },
      mcp_servers: {}, updates: { check_on_startup: false },
    })
    routing.assertLocalRoutingInputs(sandbox)
    helper = async (action, ...args) => JSON.parse((await execute(pin.python,
      ['-B', path.join(verifier, 'release-queue-live-probe.py'), action, run, ...args],
      { cwd: run, env, windowsHide: true, timeout: 23000, maxBuffer: 2_000_000 })).stdout)
    evidence.package = await helper('stage', archive)
    const marker = path.join(sandbox.userDataDir, 'plugin-files', 'data', id, 'loaded-version.json')
    assert(!fs.existsSync(marker) && !fs.existsSync(path.join(sandbox.hermesHome, 'gateway.pid')))
    const entry = path.join(run, 'desktop.cjs')
    fs.writeFileSync(entry, `const { app } = require('electron')
const { pathToFileURL } = require('node:url')
app.getAppPath = () => process.env.HCV_DESKTOP_ROOT
app.setPath('home', process.env.USERPROFILE)
app.setPath('appData', process.env.APPDATA)
app.setPath('userData', process.env.HERMES_DESKTOP_USER_DATA_DIR)
app.setAsDefaultProtocolClient = () => false
app.commandLine.appendSwitch('proxy-server', process.env.HCV_LOOPBACK_PROXY)
app.commandLine.appendSwitch('disable-background-networking')
import(pathToFileURL(process.env.HCV_DESKTOP_ENTRY).href).catch(error => { console.error(error); app.exit(1) })
`)
    evidence.launched_at = new Date().toISOString()
    mark('launch_started')
    record()
    app = await _electron.launch({ executablePath: electron, args: [entry, '--disable-gpu'], cwd: run, env, timeout: 28000 })
    appProcess = app.process()
    appProcess.stdout?.on('data', data => fs.appendFileSync(path.join(run, 'desktop.stdout.log'), data))
    appProcess.stderr?.on('data', data => fs.appendFileSync(path.join(run, 'desktop.stderr.log'), data))
    evidence.desktop = await app.evaluate(({ app }) => ({
      pid: process.pid, name: app.getName(), home: process.env.HERMES_HOME, userData: app.getPath('userData'),
      appData: app.getPath('appData'), lockDir: process.env.HERMES_GATEWAY_LOCK_DIR,
      version: app.getVersion(), electron: process.versions.electron,
    }))
    assert.equal(evidence.desktop.home, sandbox.hermesHome)
    assert.equal(evidence.desktop.userData, sandbox.userDataDir)
    assert.equal(evidence.desktop.appData, appData)
    assert.equal(evidence.desktop.lockDir, path.join(run, 'gateway-locks'))
    assert.equal(evidence.desktop.name, env.HERMES_DESKTOP_APP_NAME)
    assert(Number.isInteger(evidence.desktop.pid) && evidence.desktop.pid > 0)
    evidence.desktop.launcher_pid = appProcess.pid
    mark('desktop_started')
    const page = await app.firstWindow({ timeout: 18000 })
    page.on('console', event => fs.appendFileSync(path.join(run, 'renderer.log'), `${event.type()} ${event.text()}\n`))
    await page.addInitScript(pluginId => {
      localStorage.setItem('hermes.desktop.pluginDecisions.v2', JSON.stringify({ [pluginId]: true }))
    }, id)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })

    const results = await Promise.allSettled([
      poll(() => {
        const loaded = readJson(marker)
        assert.equal(loaded.version, expectedVersions.desktop, 'Wrong loaded Desktop version')
        assert(Date.parse(loaded.loadedAt) >= Date.parse(evidence.launched_at), 'Desktop marker is stale')
        assert(fs.statSync(marker).mtimeMs >= Date.parse(evidence.launched_at), 'Desktop marker file predates this run')
        evidence.desktop.activation = loaded
        evidence.desktop.marker = marker
        mark('desktop_activation_seen')
      }, 35000),
      poll(async () => {
        const gateway = await helper('plugins.list')
        const found = gateway.plugins_list.plugins.filter(plugin => plugin.key === id)
        assert.equal(found.length, 1, 'Expected one HCV gateway plugin')
        assert.equal(found[0].version, expectedVersions.agent, 'Wrong loaded agent version')
        assert.equal(found[0].enabled, true)
        assert.equal(found[0].error, '')
        assert(found[0].tools + found[0].hooks + found[0].commands > 0, 'Agent plugin registered no functionality')
        assert(gateway.start_time * 10 >= Date.parse(evidence.launched_at) - 10, 'Gateway predates the test launch')
        evidence.gateway = { ...gateway, plugin: found[0] }
        mark('plugins_list_seen')
      }, 35000),
    ])
    for (const result of results) if (result.status === 'rejected') throw result.reason
    const connection = await page.evaluate(() => window.hermesDesktop.getConnection('default'))
    const desktopRoute = routing.assertIsolatedGatewayDescriptor(connection, sandbox, 'default')
    assert.equal(desktopRoute.instance_id, evidence.gateway.instance_id)
    assert.equal(desktopRoute.api_origin, evidence.gateway.api_origin)
    evidence.desktop.gateway = desktopRoute
    mark('verified')
    record()
  } catch (error) {
    failure = error
  } finally {
    if (app) {
      try {
        await app.close()
        assert.equal(appProcess.exitCode, 0, 'Desktop did not exit cleanly')
        if (evidence.desktop?.pid) {
          await poll(() => {
            try { process.kill(evidence.desktop.pid, 0) } catch (error) {
              if (error.code === 'ESRCH') return
              throw error
            }
            throw new Error('Isolated Desktop PID is still running')
          }, 3500)
        }
        evidence.desktop_exit = { pid: evidence.desktop?.pid, launcher_pid: appProcess.pid, code: appProcess.exitCode }
        mark('desktop_closed')
      } catch (error) { evidence.desktop_close_error = error.message; failure ??= error }
    }
    if (helper) {
      try {
        evidence.gateway_stop = await helper('stop')
        if (evidence.gateway) {
          assert(['planned_stop', 'already_stopped'].includes(evidence.gateway_stop.status), 'Gateway shutdown was not confirmed')
          if (evidence.gateway_stop.pid) assert.equal(evidence.gateway_stop.pid, evidence.gateway.pid)
        }
        mark('gateway_stopped')
      } catch (error) { evidence.gateway_stop_error = error.stderr || error.message; failure ??= error }
    }
    if (reject.listening) {
      reject.closeAllConnections()
      await new Promise(resolve => reject.close(resolve))
    }
    evidence.direct_requests_to_proxy = requests
    evidence.blocked_proxy_requests = blockedProxyRequests
    if (requests.length > 0) {
      failure ??= new Error('Unexpected direct request to the test proxy')
    }
    mark('total')
    if (failure) evidence.error = failure.stderr || failure.stack || String(failure)
    evidence.passed = !failure
    record()
  }
  return { evidenceFile, ...evidence }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === import.meta.filename) {
  const [project, archive, desktop, agent] = process.argv.slice(2)
  assert(project && archive && desktop && agent, 'Usage: node probe.mjs <project> <archive-or-package> <desktop-version> <agent-version>')
  const result = await probe(project, archive, { desktop, agent })
  console.log(JSON.stringify({
    passed: result.passed, evidenceFile: result.evidenceFile, timings: result.timings,
    desktop: result.desktop?.activation, gateway: result.gateway?.plugin, shutdown: result.gateway_stop,
    error: result.error, gatewayStopError: result.gateway_stop_error,
  }, null, 2))
  if (!result.passed) process.exitCode = 1
}
