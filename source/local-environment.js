import { createElement as h, useRef, useState } from 'react'
import {
  atom, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  host, Popover, PopoverContent, PopoverTrigger, TITLEBAR_AREAS, useValue,
} from '@hermes/plugin-sdk'
import { codexIconRules, codexIconStyle } from './codex-reference.js'
import { checkedLocalPath, desktopPlatform, localPathKey, runLocalScript, sourceTreeVariable, worktreeVariable } from './local-environment-run.js'
import { readWorkspaceTrees } from './workspace-actions.js'

const platforms = ['default', 'darwin', 'linux', 'win32']
const platformNames = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }
const icons = { tool: 'tools', run: 'play', debug: 'terminal', test: 'check' }
const buttonTypes = Object.keys(icons)
const copy = {
  ru: {
    title: 'Настройка этого проекта', subtitle: 'Запустите скрипт настройки сейчас и используйте его повторно для будущих рабочих деревьев',
    advanced: 'Расширенные параметры', setup: 'Скрипт настройки', cleanup: 'Скрипт очистки',
    setupHint: 'Запускается в корне проекта при настройке рабочего дерева.', cleanupHint: 'Можно запустить в корне проекта перед очисткой рабочего дерева.',
    name: 'Имя', default: 'По умолчанию', platform: 'Платформа', allPlatforms: 'Все платформы',
    variables: 'Переменные', variablesTitle: 'Переменные среды скрипта установки', sourcePath: 'Путь к исходной рабочей области',
    worktreePath: 'Путь к новому рабочему дереву', copied: 'Переменная скопирована',
    actions: 'Действия', add: 'Добавить действие', remove: 'Удалить действие', command: 'Сценарий действий', icon: 'Значок',
    actionHint: 'Эти действия могут запускать любые команды и будут отображаться в заголовке',
    empty: 'Добавьте действие, чтобы запускать команды с локальной панели инструментов',
    tool: 'Инструмент', run: 'Запустить', debug: 'Отладить', test: 'Тест',
    setupProject: 'Настроить проект', save: 'Сохранить', saved: 'Настройки проекта сохранены',
    compactPlaceholder: 'Например: npm install',
    discardTitle: 'Сбросить черновик локальной среды?', discardHint: 'Ваши изменения в этой локальной среде будут потеряны',
    discard: 'Отменить', keep: 'Продолжить редактирование', conflict: 'Настройки изменились в другом окне. Откройте форму заново.',
    saveError: 'Не удалось сохранить настройки проекта', actionError: 'Действие недоступно для этого проекта',
    runSetup: 'Запустить скрипт настройки', runCleanup: 'Запустить скрипт очистки',
    starting: 'Запускается…', running: 'Выполняется…', done: 'Выполнено', failed: 'Ошибка запуска', stopped: 'Остановлено',
    stop: 'Остановить', close: 'Закрыть', noOutput: 'Вывод появится здесь',
    path: 'Не удалось подтвердить локальную папку проекта', shell: 'Терминал использует оболочку, которая не поддерживается для этого скрипта',
    start: 'Не удалось запустить скрипт в терминале Hermes', exit: 'Команда завершилась с ошибкой', tooLong: 'Скрипт слишком длинный для запуска в терминале',
  },
  en: {
    title: 'Set up this project', subtitle: 'Run a setup script now and reuse it for future worktrees',
    advanced: 'Advanced options', setup: 'Setup script', cleanup: 'Cleanup script',
    setupHint: 'Runs at the project root when setting up a worktree.', cleanupHint: 'Can run at the project root before worktree cleanup.',
    name: 'Name', default: 'Default', platform: 'Platform', allPlatforms: 'All platforms',
    variables: 'Variables', variablesTitle: 'Setup script environment variables', sourcePath: 'Source workspace path',
    worktreePath: 'Worktree path', copied: 'Variable copied',
    actions: 'Actions', add: 'Add action', remove: 'Remove action', command: 'Action script', icon: 'Icon',
    actionHint: 'These actions can run any command and will be displayed in the header',
    empty: 'Add an action to run commands from the local toolbar', tool: 'Tool', run: 'Run', debug: 'Debug', test: 'Test',
    setupProject: 'Set up project', save: 'Save', saved: 'Project settings saved',
    compactPlaceholder: 'For example: npm install',
    discardTitle: 'Discard local environment draft?', discardHint: 'Your changes to this local environment will be lost',
    discard: 'Discard', keep: 'Keep editing', conflict: 'Settings changed in another window. Reopen the form.',
    saveError: 'Could not save the project settings', actionError: 'This action is unavailable for the project',
    runSetup: 'Run setup script', runCleanup: 'Run cleanup script',
    starting: 'Starting…', running: 'Running…', done: 'Completed', failed: 'Could not run', stopped: 'Stopped',
    stop: 'Stop', close: 'Close', noOutput: 'Output will appear here',
    path: 'Could not verify the local project directory', shell: 'The terminal shell is unsupported for this script',
    start: 'Could not launch the script in the Hermes terminal', exit: 'The command exited with an error', tooLong: 'The script is too long for the terminal',
  },
}

const words = () => document.documentElement.matches(':lang(ru)') ? copy.ru : copy.en
const scriptFor = (scripts, platform) => scripts?.[platform]?.trim() ? scripts[platform] : scripts?.default ?? ''
const folderName = value => value.split(/[\\/]/).filter(Boolean).at(-1) || value
const emptyEnvironment = name => ({ name, setup: {}, cleanup: {}, actions: [] })
const scriptPlaceholder = {
  setup: 'cd "$CODEX_WORKTREE_PATH"\npip install -r requirements.txt\nnpm install\n./run/setup.sh',
  cleanup: 'docker compose down --remove-orphans\nrm -rf .cache/tmp',
}
const windowsPlaceholder = {
  setup: 'python -m pip install -r requirements.txt\npnpm install',
  cleanup: 'docker compose down --remove-orphans',
}

function icon(name, className) {
  return h('span', { 'aria-hidden': true, className, 'data-hcv-env-icon': '', style: codexIconStyle(name) })
}

function Variables({ t, copyVariable }) {
  return h(Popover, null,
    h(PopoverTrigger, { asChild: true }, h('button', { type: 'button', className: 'hcv-env-secondary' }, t.variables)),
    h(PopoverContent, { align: 'end', sideOffset: 4, 'data-hcv-env-vars': '' },
      h('strong', null, t.variablesTitle),
      [[sourceTreeVariable, t.sourcePath], [worktreeVariable, t.worktreePath]].map(([name, text]) => h('div', { key: name },
        h('button', {
          type: 'button', title: name,
          onClick: () => void copyVariable(name),
        }, h('code', null, name), icon('copy')),
        h('span', null, text)))))
}

function ScriptEditor({ type, scripts, setScripts, compact, t, copyVariable }) {
  const [platform, setPlatform] = useState('default')
  const id = `hcv-env-${type}`
  const label = t[type]
  const selectWithKeys = event => {
    const previous = platforms.indexOf(platform)
    const next = { ArrowLeft: previous + platforms.length - 1, ArrowRight: previous + 1, Home: 0, End: platforms.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const index = next % platforms.length
    setPlatform(platforms[index])
    event.currentTarget.children[index]?.focus()
  }
  const value = scripts[platform] || ''
  const placeholder = compact ? t.compactPlaceholder
    : (platform === 'win32' ? windowsPlaceholder : scriptPlaceholder)[type]
  const field = h('textarea', {
    id, value, placeholder, spellCheck: false, rows: 6, maxLength: 6_000,
    onChange: event => setScripts({ ...scripts, [platform]: event.target.value }),
  })
  return h('section', { className: 'hcv-env-script' },
    h('div', { className: 'hcv-env-section-title' },
      h('div', null, h('label', { htmlFor: id }, label),
        !compact && h('p', null, type === 'setup' ? t.setupHint : t.cleanupHint)),
      !compact && type === 'setup' && h(Variables, { t, copyVariable })),
    compact ? field : h('div', null,
      h('div', { role: 'tablist', 'aria-label': `${label} · ${t.platform}`, onKeyDown: selectWithKeys, className: 'hcv-env-platforms' },
        platforms.map(value => h('button', {
          key: value, id: `${id}-tab-${value}`, type: 'button', role: 'tab', 'aria-selected': value === platform,
          'aria-controls': `${id}-platform`, tabIndex: value === platform ? 0 : -1, onClick: () => setPlatform(value),
        }, platformNames[value] || t.default))),
      h('div', { role: 'tabpanel', id: `${id}-platform`, 'aria-labelledby': `${id}-tab-${platform}` }, field)))
}

function Actions({ actions, onChange, t }) {
  const update = (id, patch) => onChange(actions.map(action => action.id === id ? { ...action, ...patch } : action))
  return h('section', { className: 'hcv-env-actions' },
    h('div', { className: 'hcv-env-section-title' }, h('h3', null, t.actions),
      h('button', {
        type: 'button', className: 'hcv-env-secondary',
        onClick: () => onChange([...actions, { id: crypto.randomUUID(), name: '', command: '', platform: 'default', icon: 'tool' }]),
      }, t.add)),
    h('p', null, t.actionHint),
    actions.length === 0 ? h('div', { className: 'hcv-env-empty' }, t.empty)
      : actions.map(action => h('div', { key: action.id, className: 'hcv-env-card hcv-env-action', 'data-hcv-env-action': '' },
        h('div', { className: 'hcv-env-action-heading' },
          h('label', { className: 'hcv-env-field hcv-env-action-icon' }, t.icon,
            h('div', null, icon(icons[action.icon] || 'tools'),
              h('select', { value: action.icon, onChange: event => update(action.id, { icon: event.target.value }) },
                buttonTypes.map(type => h('option', { value: type, key: type }, t[type]))))),
          h('label', { className: 'hcv-env-field' }, t.name,
            h('input', { value: action.name, maxLength: 100, onChange: event => update(action.id, { name: event.target.value }) })),
          h('button', {
            type: 'button', 'aria-label': t.remove, title: t.remove,
            onClick: () => onChange(actions.filter(item => item.id !== action.id)),
          }, icon('trash'))),
        h('label', { className: 'hcv-env-field' }, t.platform,
          h('select', { value: action.platform, onChange: event => update(action.id, { platform: event.target.value }) },
            platforms.map(value => h('option', { value, key: value }, platformNames[value] || t.allPlatforms)))),
        h('label', { className: 'hcv-env-field' }, t.command,
          h('textarea', {
            rows: 3, maxLength: 6_000, spellCheck: false, value: action.command, placeholder: 'npm run dev',
            onChange: event => update(action.id, { command: event.target.value }),
          })))))
}

function EnvironmentDialog({ target, close, save }) {
  const { t, original, platform, trigger, revision, copyVariable } = target
  const [draft, setDraft] = useState(original)
  const [advanced, setAdvanced] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef(null)
  const savingRef = useRef(false)
  const edit = patch => setDraft(previous => ({ ...previous, ...patch }))
  const dirty = JSON.stringify(original) !== JSON.stringify(draft)
  const setup = scriptFor(draft.setup, platform)
  const runSetup = Boolean(setup.trim()) && (!revision || scriptFor(original.setup, platform) !== setup)
  const content = [draft.setup, draft.cleanup].some(scripts => Object.values(scripts).some(value => value.trim())) ||
    draft.actions.some(action => action.name.trim() && action.command.trim())
  const complete = draft.actions.every(action => Boolean(action.name.trim()) === Boolean(action.command.trim()))
  const disabled = saving || !dirty || !draft.name.trim() || !complete || !content && !revision
  const requestClose = () => {
    if (savingRef.current) return
    if (dirty) setDiscard(true)
    else close()
  }
  const submit = async event => {
    event.preventDefault()
    if (disabled || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    const config = { ...draft, name: draft.name.trim(), actions: draft.actions.filter(action => action.name.trim()) }
    try {
      await save(target, config, runSetup ? setup : '')
    } catch (error) {
      setError(error?.message === 'conflict' ? t.conflict : error?.message === 'path' ? t.path : t.saveError)
      savingRef.current = false
      setSaving(false)
    }
  }
  const setupEditor = h(ScriptEditor, { type: 'setup', scripts: draft.setup, setScripts: setup => edit({ setup }), compact: !advanced, t, copyVariable })
  return h(Dialog, { open: true, onOpenChange: open => { if (!open) requestClose() } },
    h(DialogContent, {
      'data-hcv-local-environment': '', 'data-hcv-env-advanced': String(advanced),
      bodyClassName: 'hcv-env-body', overlayClassName: 'hcv-env-overlay', blurBackdrop: false,
      showCloseButton: !saving,
      onEscapeKeyDown: event => { if (savingRef.current || discard) event.preventDefault() },
      onOpenAutoFocus: event => { event.preventDefault(); heading.current?.focus() },
      onCloseAutoFocus: event => {
        if (trigger?.isConnected) { event.preventDefault(); trigger.focus({ preventScroll: true }) }
      },
    },
    h(DialogHeader, null, h(DialogTitle, { ref: heading, tabIndex: -1 }, t.title), h(DialogDescription, null, t.subtitle)),
    h('form', { onSubmit: submit, className: 'hcv-env-form' },
      h('fieldset', { disabled: saving },
        !advanced && setupEditor,
        h('button', {
          type: 'button', className: 'hcv-env-disclosure', 'aria-expanded': advanced, 'aria-controls': 'hcv-env-options',
          onClick: () => setAdvanced(previous => !previous),
        }, t.advanced, icon('right')),
        advanced && h('div', { className: 'hcv-env-options', id: 'hcv-env-options' },
          h('label', { className: 'hcv-env-card hcv-env-field' }, t.name,
            h('input', { value: draft.name, maxLength: 120, onChange: event => edit({ name: event.target.value }) })),
          setupEditor,
          h(ScriptEditor, { type: 'cleanup', scripts: draft.cleanup, setScripts: cleanup => edit({ cleanup }), t }),
          h(Actions, { actions: draft.actions, onChange: actions => edit({ actions }), t })),
        error && h('p', { role: 'alert', className: 'hcv-env-error' }, error),
        h(DialogFooter, null, h(Button, { type: 'submit', disabled }, runSetup || !revision && !content ? t.setupProject : t.save)))),
    h(Dialog, { open: discard, onOpenChange: setDiscard },
      h(DialogContent, { 'data-hcv-env-confirm': '', showCloseButton: false, blurBackdrop: false },
        h(DialogHeader, null, h(DialogTitle, null, t.discardTitle), h(DialogDescription, null, t.discardHint)),
        h(DialogFooter, null,
          h(Button, { type: 'button', variant: 'outline', onClick: () => setDiscard(false) }, t.keep),
          h(Button, { type: 'button', variant: 'destructive', onClick: close }, t.discard))))))
}

function TerminalResult({ result, stop, close }) {
  const { state, title, cwd, output, error, t } = result
  const running = state === 'running' || state === 'starting'
  const status = error ? t[error] : t[state]
  return h(Dialog, { open: true, onOpenChange: open => { if (!open && !running) close() } },
    h(DialogContent, { 'data-hcv-env-terminal': '', showCloseButton: !running, blurBackdrop: false },
      h(DialogHeader, null, h(DialogTitle, null, title), h(DialogDescription, null, cwd)),
      h('div', { role: 'status', 'data-hcv-env-run-state': state }, status),
      h('pre', { tabIndex: 0 }, output || t.noOutput),
      h(DialogFooter, null, h(Button, { type: 'button', onClick: running ? stop : close }, running ? t.stop : t.close))))
}

function EnvironmentSlot({ model, result, close, save, stop, closeResult }) {
  const target = useValue(model)
  const run = useValue(result)
  if (target) return h(EnvironmentDialog, { key: target.key, target, close, save })
  return run ? h(TerminalResult, { result: run, stop, close: closeResult }) : null
}

export function registerLocalEnvironment(ctx, active) {
  const root = document.documentElement
  const model = atom(null)
  const result = atom(null)
  const revisionSignal = atom(0)
  const platform = desktopPlatform()
  const close = () => model.set(null)
  const closeResult = () => result.set(null)
  const storageKey = scope => `local-environment-v1:${localPathKey(scope.source, platform)}`
  const read = scope => ctx.storage.get(storageKey(scope), null)
  const sheet = document.createElement('style')
  sheet.dataset.hcvLocalEnvironmentStyles = ''
  sheet.textContent = styles(active)
  document.head.append(sheet)
  let cancelRun, disposed = false
  let request = 0

  const local = () => !disposed && host.state.connectionId.get() === 'local'
  const enabled = () => local() && root.matches(active)
  const notify = (message, kind = 'error') => host.notify({ kind, message })
  const idle = () => !model.get() && !result.get()

  async function scopeFor(cwd) {
    if (!enabled() || !platform) return null
    const desktop = window.hermesDesktop
    const directory = await checkedLocalPath(desktop, cwd, platform).catch(() => null)
    if (!directory || !enabled()) return null
    const owner = { connectionId: 'local', profile: host.state.profile.get() }
    let entries = await readWorkspaceTrees(directory, owner, true).catch(() => [])
    if (!entries.length) entries = await readWorkspaceTrees(directory, owner, false).catch(() => [])
    const current = localPathKey(directory, platform)
    const checkout = entries.reduce((closest, entry) => {
      const key = localPathKey(entry.path, platform)
      return key && (key === current || current.startsWith(`${key}/`)) && key.length > closest.key.length
        ? { path: entry.path, key } : closest
    }, { path: directory, key: '' }).path
    const source = entries.find(entry => entry.isMain)?.path || checkout
    const paths = await Promise.all([checkout, source].map(path => checkedLocalPath(desktop, path, platform).catch(() => null)))
    return enabled() && paths.every(Boolean) ? { cwd: paths[0], source: paths[1] } : null
  }

  const startRun = ({ cwd, source, script, title, t }) => {
    result.set({ cwd, title, t, output: '', state: 'starting' })
    cancelRun = runLocalScript({
      desktop: window.hermesDesktop, platform, cwd, source, script, stillLocal: local,
      update: patch => {
        if (!disposed && result.get()) result.set({ ...result.get(), ...patch })
      },
    })
  }

  async function save(target, config, setup) {
    const scope = await scopeFor(target.cwd)
    if (!scope || target !== model.get() || storageKey(scope) !== storageKey(target)) throw new Error('path')
    if ((read(scope)?.revision || '') !== target.revision) throw new Error('conflict')
    const revision = crypto.randomUUID()
    ctx.storage.set(storageKey(scope), { revision, config })
    if (read(scope)?.revision !== revision) throw new Error('save')
    revisionSignal.set(revisionSignal.get() + 1)
    close()
    if (setup) startRun({ ...scope, script: setup, title: target.t.setup, t: target.t })
    else notify(target.t.saved, 'success')
  }

  function commands(config, t) {
    if (!config) return []
    return [
      { id: 'setup', label: t.runSetup, icon: 'tools', script: scriptFor(config.setup, platform) },
      { id: 'cleanup', label: t.runCleanup, icon: 'trash', script: scriptFor(config.cleanup, platform) },
      ...config.actions.filter(action => action.platform === 'default' || action.platform === platform)
        .map(action => ({ id: action.id, label: action.name, icon: icons[action.icon] || 'tools', script: action.command })),
    ].filter(command => command.script.trim())
  }

  ctx.register({
    id: 'local-environment-dialog', area: TITLEBAR_AREAS.center,
    render: () => h(EnvironmentSlot, { model, result, close, save, stop: () => cancelRun?.(), closeResult }),
  })
  ctx.onDispose(() => {
    disposed = true
    cancelRun?.()
    close()
    closeResult()
    sheet.remove()
  })
  return {
    revision: revisionSignal,
    async open({ cwd, projectName, trigger }) {
      if (!idle()) return false
      const key = ++request
      const t = words()
      const scope = await scopeFor(cwd)
      if (key !== request || !idle() || disposed) return false
      if (!scope) { notify(t.path); return false }
      const saved = read(scope)
      model.set({
        ...scope, key, t, trigger, platform, revision: saved?.revision || '',
        original: saved?.config || emptyEnvironment(projectName?.trim() || folderName(scope.source)),
        copyVariable: async name => { if (await ctx.os.writeClipboard(name)) notify(t.copied, 'success') },
      })
      return true
    },
    async name(cwd) {
      const scope = await scopeFor(cwd)
      return scope ? read(scope)?.config.name || '' : ''
    },
    async actions(cwd) {
      const scope = await scopeFor(cwd)
      return scope ? commands(read(scope)?.config, words()).map(({ id, label, icon }) => ({ id, label, icon })) : []
    },
    async run({ cwd, id }) {
      if (!idle()) return false
      const key = ++request
      const t = words()
      const scope = await scopeFor(cwd)
      if (key !== request || !idle() || disposed) return false
      const command = scope && commands(read(scope)?.config, t).find(command => command.id === id)
      if (!command) { notify(t.actionError); return false }
      startRun({ ...scope, script: command.script, title: command.label, t })
      return true
    },
  }
}

function styles(active) {
  const form = `${active} [data-hcv-local-environment]`
  const vars = `${active} [data-hcv-env-vars]`
  const terminal = `${active} [data-hcv-env-terminal]`
  return `
  ${form}, ${terminal}, ${active} [data-hcv-env-confirm] {
    inline-size: min(420px, calc(100vw - 32px)); max-inline-size: none;
    max-block-size: calc(100dvh - 40px); border: 0; border-radius: 20px;
    background: var(--hcv-menu); color: var(--hcv-text); font-family: var(--hcv-ui-font);
  }
  ${form} {
    background: light-dark(var(--hcv-menu), #2a2a2a);
    --hcv-env-field-fill: light-dark(var(--hcv-form-surface), #2d2d2d);
    --hcv-env-card-fill: light-dark(var(--hcv-panel), #232323);
    --hcv-env-control-fill: light-dark(var(--hcv-hover-menu), #333);
  }
  ${active} .hcv-env-overlay { background: rgb(0 0 0 / 25%); backdrop-filter: none; }
  ${form} .hcv-env-body { display: flex; flex-direction: column; overflow: hidden; gap: 0; padding: 20px; }
  ${form} [data-slot="dialog-header"], ${terminal} [data-slot="dialog-header"] { gap: 4px; text-align: start; padding-inline-end: 20px; }
  ${form} [data-slot="dialog-title"], ${terminal} [data-slot="dialog-title"] { font-size: 20px; font-weight: 600; line-height: 26px; }
  ${form} [data-slot="dialog-title"]:focus { outline: none; }
  ${form} [data-slot="dialog-description"], ${terminal} [data-slot="dialog-description"] { font-size: 14px; line-height: 20px; color: var(--hcv-muted); overflow-wrap: anywhere; }
  ${form} [data-slot="dialog-close-button"] { inset-block-start: 16px; inset-inline-end: 16px; inline-size: 24px; block-size: 24px; border-radius: 8px; }
  ${codexIconRules(`${form} [data-slot="dialog-close-button"] > svg`, 'close')}
  ${form} .hcv-env-form { min-block-size: 0; overflow: auto; overscroll-behavior: contain; padding: 44px 13px 0; }
  ${form}[data-hcv-env-advanced="true"] .hcv-env-form { padding-block-start: 28px; }
  ${form} fieldset { display: flex; min-inline-size: 0; flex-direction: column; gap: 16px; }
  ${form} .hcv-env-options { display: flex; flex-direction: column; gap: 10px; }
  ${form} .hcv-env-section-title { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
  ${form} :is(.hcv-env-section-title label, h3, .hcv-env-disclosure) { font-size: 16px; font-weight: 600; line-height: 24px; }
  ${form} p { margin: 0; color: var(--hcv-muted); font-size: 13px; line-height: 18px; }
  ${form} .hcv-env-script { display: flex; flex-direction: column; gap: 12px; }
  ${form}[data-hcv-env-advanced="false"] .hcv-env-script { gap: 14px; }
  ${form}[data-hcv-env-advanced="false"] .hcv-env-script label { font-size: 14px; }
  ${form} :is(input, textarea, select) {
    inline-size: 100%; min-inline-size: 0; padding: 8px 10px;
    border: 1px solid var(--hcv-hairline); border-radius: 8px;
    background: var(--hcv-env-field-fill); color: var(--hcv-text); font: 13px/18px var(--hcv-ui-font);
  }
  ${form} textarea { display: block; min-block-size: 80px; resize: vertical; font: 12px/18px ui-monospace, Consolas, monospace; }
  ${form} .hcv-env-script textarea { block-size: 128px; }
  ${form} textarea::placeholder { color: var(--hcv-muted); opacity: .8; }
  ${form} .hcv-env-disclosure { display: flex; align-items: center; gap: 8px; min-block-size: 40px; text-align: start; border-block-end: 1px solid var(--hcv-hairline); }
  ${form} .hcv-env-disclosure [data-hcv-env-icon] { inline-size: 12px; block-size: 12px; }
  ${form} .hcv-env-disclosure[aria-expanded="true"] [data-hcv-env-icon] { transform: rotate(90deg); }
  ${form} .hcv-env-platforms { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-block-end: 6px; }
  ${form} .hcv-env-platforms button { min-block-size: 24px; padding: 0 8px; border-radius: 999px; color: var(--hcv-muted); font-size: 13px; }
  ${form} .hcv-env-platforms button[aria-selected="true"] { background: var(--hcv-env-control-fill); color: var(--hcv-text); }
  ${form} :is(.hcv-env-secondary, .hcv-env-action-heading button) {
    min-block-size: 28px; padding: 3px 8px; border-radius: 10px; background: var(--hcv-env-control-fill);
    color: var(--hcv-text); font-size: 13px; white-space: nowrap;
  }
  ${form} :is(button, select):not(:disabled) { cursor: pointer; }
  ${form} :is(button, input, textarea, select):focus-visible, ${vars} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${form} .hcv-env-card, ${form} .hcv-env-empty { background: var(--hcv-env-card-fill); border-radius: 16px; padding: 14px 16px; }
  ${form} .hcv-env-field { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; font-size: 13px; font-weight: 600; }
  ${form} .hcv-env-actions { display: flex; flex-direction: column; gap: 8px; }
  ${form} .hcv-env-empty { padding: 14px 18px; text-align: center; color: var(--hcv-muted); font-size: 13px; line-height: 18px; }
  ${form} .hcv-env-action { display: grid; gap: 10px; }
  ${form} .hcv-env-action-heading { display: grid; grid-template-columns: minmax(0, 112px) minmax(0, 1fr) auto; gap: 6px; align-items: end; }
  ${form} .hcv-env-action-icon > div { position: relative; }
  ${form} .hcv-env-action-icon [data-hcv-env-icon] { position: absolute; inset-block-start: 10px; inset-inline-start: 7px; pointer-events: none; }
  ${form} .hcv-env-action-icon select { padding-inline-start: 25px; }
  ${form} .hcv-env-action-heading button { block-size: 36px; }
  ${form} [data-slot="dialog-footer"] { justify-content: flex-end; margin-block-start: 20px; }
  ${form}[data-hcv-env-advanced="true"] [data-slot="dialog-footer"] { margin-block-start: 4px; }
  ${form} [type="submit"] { min-block-size: 28px; block-size: 28px; padding-inline: 9px; border-radius: 9px; background: var(--hcv-action); color: var(--hcv-ink); font: 13px/18px var(--hcv-ui-font); }
  ${form} [type="submit"]:disabled { opacity: .46; }
  ${form} .hcv-env-error { color: var(--dt-destructive); }
  ${form} [data-hcv-env-icon], ${vars} [data-hcv-env-icon] { display: inline-block; flex: none; inline-size: 16px; block-size: 16px; }
  ${vars} { inline-size: min(320px, var(--radix-popover-content-available-width)); padding: 8px; border-radius: 16px; background: var(--hcv-menu); color: var(--hcv-text); font: 13px/18px var(--hcv-ui-font); }
  ${vars} > div { display: grid; gap: 3px; margin-block-start: 4px; }
  ${vars} > div span:not([data-hcv-env-icon]) { color: var(--hcv-muted); }
  ${vars} button { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px; border-radius: 7px; background: var(--hcv-hover-menu); text-align: start; overflow-wrap: anywhere; }
  ${terminal} { inline-size: min(560px, calc(100vw - 32px)); }
  ${terminal} pre { max-block-size: min(50dvh, 380px); overflow: auto; overscroll-behavior: contain; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border-radius: 10px; background: var(--hcv-panel); font: 12px/18px ui-monospace, Consolas, monospace; }
  ${terminal} [data-hcv-env-run-state="failed"] { color: var(--dt-destructive); }
  @media (prefers-reduced-motion: no-preference) { ${form} .hcv-env-disclosure [data-hcv-env-icon] { transition: transform 140ms ease-out; } }
`
}
