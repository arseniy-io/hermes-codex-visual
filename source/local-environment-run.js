export const sourceTreeVariable = 'CODEX_SOURCE_TREE_PATH'
export const worktreeVariable = 'CODEX_WORKTREE_PATH'

export function desktopPlatform() {
  const value = navigator.userAgentData?.platform || navigator.platform
  if (/^win/i.test(value)) return 'win32'
  if (/^mac/i.test(value)) return 'darwin'
  if (/^linux/i.test(value)) return 'linux'
  return null
}

export function localPathKey(value, platform) {
  if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) return ''
  const path = value.trim()
  if (platform === 'win32') {
    const normalized = path.replaceAll('\\', '/').toLowerCase()
    if (!/^(?:[a-z]:\/|\/\/[^/.?][^/]*\/[^/]+(?:\/|$))/.test(normalized)) return ''
    return normalized.replace(/\/+$/, '')
  }
  return path.startsWith('/') ? path.replace(/\/+$/, '') || '/' : ''
}

export async function checkedLocalPath(desktop, value, platform) {
  const key = localPathKey(value, platform)
  if (!key || !desktop?.sanitizeWorkspaceCwd) return null
  const checked = await desktop.sanitizeWorkspaceCwd(value)
  return !checked?.sanitized && localPathKey(checked?.cwd, platform) === key ? checked.cwd : null
}

const psLiteral = value => `'${value.replaceAll("'", "''")}'`
const shLiteral = value => `'${value.replaceAll("'", "'\\''")}'`

function powershellPayload(value) {
  let bytes = ''
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index)
    bytes += String.fromCharCode(unit & 255, unit >> 8)
  }
  return btoa(bytes)
}

export function terminalCommand({ shell, platform, cwd, source, script, marker }) {
  if (platform === 'win32' && /^(?:pwsh|powershell|cmd)(?:\.exe)?$/i.test(shell)) {
    const payload = powershellPayload([
      "$ErrorActionPreference = 'Stop'",
      `Set-Location -LiteralPath ${psLiteral(cwd)}`,
      `$env:${sourceTreeVariable} = ${psLiteral(source)}`,
      `$env:${worktreeVariable} = ${psLiteral(cwd)}`,
      `[Console]::WriteLine(${psLiteral(marker)})`,
      '$global:LASTEXITCODE = 0',
      script,
      'if (-not $?) { exit 1 }',
      'exit $LASTEXITCODE',
    ].join('\n'))
    const args = `-NoLogo -NoProfile -NonInteractive -EncodedCommand ${payload}`
    if (/^cmd/i.test(shell)) return `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" ${args} && exit /b 0 || exit /b 1\r`
    const executable = /^pwsh/i.test(shell) ? 'pwsh.exe' : 'powershell.exe'
    return `& (Join-Path $PSHOME '${executable}') ${args}; exit $LASTEXITCODE\r`
  }

  if (platform === 'darwin' || platform === 'linux') {
    if (!/^(?:bash|zsh|sh|dash|ksh|fish)$/i.test(shell)) return null
    const program = [
      `cd ${shLiteral(cwd)} || exit 1`,
      `export ${sourceTreeVariable}=${shLiteral(source)} ${worktreeVariable}=${shLiteral(cwd)}`,
      `printf '%s\\n' ${shLiteral(marker)}`,
      script,
    ].join('\n')
    const bytes = new TextEncoder().encode(program)
    const escaped = Array.from(bytes, byte => `\\0${byte.toString(8).padStart(3, '0')}`).join('')
    const exit = /^fish$/i.test(shell) ? 'exit $status' : 'exit $?'
    return `printf '%b' '${escaped}' | /bin/sh; ${exit}\r`
  }
  return null
}

const cleanOutput = value => value
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
  .replace(/\r\n?/g, '\n')

export function runLocalScript({ desktop, platform, cwd, source, script, stillLocal, update }) {
  const marker = `HCV_PROJECT_${crypto.randomUUID().replaceAll('-', '')}`
  const terminal = desktop?.terminal
  let id, offData, offExit
  let stopped = false
  let begun = false
  let pending = ''
  let output = ''

  const release = () => {
    offData?.()
    offExit?.()
    if (id) void terminal.dispose(id).catch(() => {})
    id = null
  }

  const finish = (state, error) => {
    if (stopped) return
    stopped = true
    release()
    update({ state, error, output })
  }

  const start = async () => {
    try {
      if (!terminal || !stillLocal()) return finish('failed', 'path')
      const checked = await checkedLocalPath(desktop, cwd, platform)
      if (stopped) return
      if (!checked || !stillLocal()) return finish('failed', 'path')
      const session = await terminal.start({ cwd: checked })
      id = session.id
      if (stopped) return release()
      if (!stillLocal() || localPathKey(session.cwd, platform) !== localPathKey(checked, platform)) {
        return finish('failed', 'path')
      }
      const command = terminalCommand({ shell: session.shell, platform, cwd: checked, source, script, marker })
      if (!command) return finish('failed', 'shell')
      if (command.length > (/^cmd/i.test(session.shell) ? 7_500 : 24_000)) return finish('failed', 'tooLong')
      offData = terminal.onData(id, value => {
        if (stopped || typeof value !== 'string') return
        if (!begun) {
          pending += value
          const at = pending.indexOf(marker)
          if (at === -1) {
            pending = pending.slice(-marker.length)
            return
          }
          begun = true
          value = pending.slice(at + marker.length).replace(/^\r?\n/, '')
          pending = ''
        }
        output = (output + cleanOutput(value)).slice(-18_000)
        update({ state: 'running', output })
      })
      offExit = terminal.onExit(id, result => {
        if (!begun) return finish('failed', 'start')
        finish(result?.code === 0 ? 'done' : 'failed', result?.code === 0 ? undefined : 'exit')
      })
      if (!await terminal.attach(id) || stopped || !stillLocal()) return finish('failed', 'start')
      if (!await terminal.write(id, command)) finish('failed', 'start')
    } catch {
      finish('failed', 'start')
    }
  }

  void start()
  return () => finish('stopped')
}
