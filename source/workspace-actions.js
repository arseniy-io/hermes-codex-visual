import {
  atom, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, host, Input, TITLEBAR_AREAS, useValue,
} from '@hermes/plugin-sdk'
import { createElement as h, useEffect, useRef, useState } from 'react'

const labels = {
  ru: {
    terminalFailed: 'Не удалось открыть терминал в папке чата.',
    toTree: 'Переместить в рабочее дерево', toMain: 'Переместить в основную рабочую копию',
    select: 'Куда переместить чат', newTree: 'Новое рабочее дерево', branch: 'Имя новой ветки',
    main: 'Основной каталог', cancel: 'Отмена', move: 'Переместить', loading: 'Загрузка рабочих деревьев…',
    detail: 'Чат продолжится в выбранной папке. Незакоммиченные файлы остаются в исходном дереве.',
    busy: 'Дождитесь завершения ответа в этом чате.',
    unavailable: 'Папка или профиль чата изменились. Откройте это окно ещё раз.',
    failed: 'Не удалось переместить чат.', listFailed: 'Не удалось прочитать рабочие деревья.',
    setup: 'Запустить скрипт настройки', setupFailed: 'Чат перемещён. Не удалось запустить скрипт настройки.',
    moved: 'Чат перемещён',
  },
  en: {
    terminalFailed: 'Could not open a terminal in this chat’s folder.',
    toTree: 'Move to worktree', toMain: 'Move to main checkout',
    select: 'Move this chat to', newTree: 'New worktree', branch: 'New branch name',
    main: 'Main checkout', cancel: 'Cancel', move: 'Move', loading: 'Loading worktrees…',
    detail: 'The chat will continue in the selected folder. Uncommitted files stay in the original checkout.',
    busy: 'Wait for the current reply to finish.',
    unavailable: 'The chat folder or profile changed. Reopen this dialog.',
    failed: 'Could not move the chat.', listFailed: 'Could not load worktrees.',
    setup: 'Run setup script', setupFailed: 'The chat moved. The setup script could not start.',
    moved: 'Chat moved',
  },
}
const copy = () => document.documentElement.matches(':lang(ru)') ? labels.ru : labels.en
export const workspacePathKey = value => {
  const path = String(value || '').replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:|^\/\//i.test(path) ? path.toLowerCase() : path
}
const localOwner = owner => owner?.connectionId === 'local' && Boolean(owner.profile)

function gitApi(scope, cwd, route, body) {
  const base = { connectionId: scope.connectionId, profile: scope.profile, timeoutMs: body ? 30000 : 8000 }
  const path = '/api/git/' + route
  return window.hermesDesktop.api(body
    ? { ...base, path, method: 'POST', body: { path: cwd, ...body } }
    : { ...base, path: path + '?' + new URLSearchParams({ path: cwd }) })
}

export async function readWorkspaceRepository(cwd, scope) {
  if (!cwd) return null
  const native = localOwner(scope) ? window.hermesDesktop?.git : null
  const repo = await native?.repoStatus?.(cwd).catch(() => null)
  if (repo) return { repo, native: true }
  const fallback = await gitApi(scope, cwd, 'status').catch(() => null)
  return fallback && { repo: fallback, native: false }
}

export async function readWorkspaceTrees(cwd, scope, native) {
  const result = native
    ? await window.hermesDesktop.git.worktreeList(cwd)
    : (await gitApi(scope, cwd, 'worktrees'))?.worktrees
  return Array.isArray(result) ? result : []
}

export function workspaceTreeFor(trees, cwd) {
  const path = workspacePathKey(cwd)
  return trees.reduce((closest, tree) => {
    const root = workspacePathKey(tree.path)
    return root && (path === root || path.startsWith(root + '/')) &&
      (!closest || root.length > workspacePathKey(closest.path).length) ? tree : closest
  }, null)
}

function ownsChat(target) {
  const owner = host.state.focusedSessionOwner.get()
  return localOwner(target.owner) && owner?.connectionId === target.owner.connectionId &&
    owner.profile === target.owner.profile && host.state.activeSessionId.get() === target.runtime &&
    host.state.focusedSessionId.get() === target.runtime && host.state.focusedStoredSessionId.get() === target.session &&
    workspacePathKey(host.state.cwd.get()) === workspacePathKey(target.cwd)
}

const terminalSelector = '[data-pane-host="terminal"]'
const newTerminal = () => document.querySelector(terminalSelector + ' [role="tablist"] > li > button:has(> .codicon-add)')

function dispatchNewTerminal() {
  // Native use-keybinds reads the physical Backquote key for this default.
  // Respect a user who has reassigned the chord instead of firing its new action.
  let custom
  try { custom = JSON.parse(localStorage.getItem('hermes.desktop.keybinds') || '{}') } catch { return false }
  const chord = 'ctrl+shift+' + String.fromCharCode(96)
  const mapped = custom?.['view.newTerminal']
  if (mapped && !mapped.includes(chord)) return false
  if (Object.entries(custom || {}).some(([action, keys]) => action !== 'view.newTerminal' &&
    Array.isArray(keys) && (keys.includes(chord) || keys.includes(chord.replace('ctrl+', 'mod+'))))) return false
  const event = new KeyboardEvent('keydown', { key: '~', code: 'Backquote', ctrlKey: true, shiftKey: true,
    bubbles: true, cancelable: true })
  return !window.dispatchEvent(event)
}

export function openWorkspaceTerminal(target) {
  // Let the summary menu restore focus before invoking a native command.
  window.setTimeout(() => {
    const draft = !target.session && !target.runtime && !host.state.focusedStoredSessionId.get() &&
      !host.state.activeSessionId.get() && localOwner(target.owner) &&
      host.state.connectionId.get() === target.owner.connectionId &&
      host.state.profile.get() === target.owner.profile &&
      workspacePathKey(host.state.cwd.get()) === workspacePathKey(target.cwd)
    if (!draft && !ownsChat(target)) {
      host.notify({ kind: 'error', message: copy().unavailable })
      return
    }
    if (host.paneVisibility('terminal').get() && newTerminal()) {
      newTerminal().click()
      return
    }
    if (dispatchNewTerminal()) return
    const nativeTab = document.querySelector('[data-tree-tab="terminal"]')
    if (nativeTab?.getClientRects().length) {
      nativeTab.click()
      return
    }
    host.notify({ kind: 'error', message: copy().terminalFailed })
  }, 0)
}

export function openWorkspaceReview(getChat) {
  const review = getChat()?.querySelector('.coding-status-bar button:has(> .codicon-git-branch)')
  if (!review || review.disabled) return false
  if (host.paneVisibility('review').get()) host.revealPane('review')
  else review.click()
  return true
}

function MoveWorkspaceDialog({ target, close, refresh, localEnvironment }) {
  const words = copy()
  const [trees, setTrees] = useState(null)
  const [choice, setChoice] = useState('')
  const [branch, setBranch] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [setupAvailable, setSetupAvailable] = useState(false)
  const [runSetup, setRunSetup] = useState(true)
  const running = useRef(false)
  const created = useRef(null)
  const currentTree = workspaceTreeFor(trees || [], target.cwd)
  const isMain = currentTree?.isMain !== false
  const busy = useValue(host.state.busy)

  useEffect(() => {
    let live = true
    void readWorkspaceTrees(target.cwd, target.owner, target.nativeGit).then(result => {
      if (!live) return
      const all = result.filter(tree => typeof tree.path === 'string' && tree.path)
      const active = workspaceTreeFor(all, target.cwd)
      const next = all.filter(tree => tree !== active)
      setTrees(all)
      setChoice(next.find(tree => tree.isMain)?.path || next[0]?.path || 'new')
    }, () => { if (live) setError(words.listFailed) })
    void localEnvironment?.actions(target.cwd).then(result => {
      if (live) setSetupAvailable(result.some(action => action.id === 'setup'))
    }, () => {})
    return () => { live = false }
  }, [target, localEnvironment, words.listFailed])

  async function move(event) {
    event.preventDefault()
    if (running.current || !choice || (choice === 'new' && !branch.trim())) return
    if (!ownsChat(target)) { setError(words.unavailable); return }
    if (host.state.busy.get()) { setError(words.busy); return }
    running.current = true
    setPending(true)
    setError('')
    try {
      let cwd = choice
      if (choice === 'new') {
        const name = branch.trim()
        // A retry after a failed switch reuses the worktree already created.
        if (created.current?.name !== name) {
          const options = { name, branch: name, ...(target.branch && { base: target.branch }) }
          const tree = target.nativeGit
            ? await window.hermesDesktop.git.worktreeAdd(target.cwd, options)
            : await gitApi(target.owner, target.cwd, 'worktree/add', options)
          if (!tree?.path) throw new Error(words.failed)
          created.current = { name, path: tree.path }
        }
        cwd = created.current.path
      }
      if (!ownsChat(target) || host.state.busy.get()) throw new Error(words.unavailable)
      const result = await host.requestProfile({ ...target.owner, targetProfile: target.owner.profile }, 'session.cwd.set', {
        session_id: target.runtime, cwd,
      }, 10000)
      if (!result?.cwd) throw new Error(words.failed)
      refresh()
      host.notify({ kind: 'success', title: words.moved, message: result.cwd })
      close()
      if (choice === 'new' && setupAvailable && runSetup) {
        void localEnvironment.run({ cwd: result.cwd, id: 'setup' })
          .catch(error => host.notifyError(error, words.setupFailed))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : words.failed)
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return h(Dialog, { open: true, onOpenChange: value => { if (!value && !running.current) close() } },
    h(DialogContent, { 'data-hcv-workspace-move': '', showCloseButton: !pending, blurBackdrop: false,
      onCloseAutoFocus: event => {
        if (!target.trigger?.isConnected) return
        event.preventDefault()
        target.trigger.focus({ preventScroll: true })
      },
    },
      h('form', { onSubmit: move, className: 'hcv-workspace-move-form' },
        h(DialogHeader, null, h(DialogTitle, null, isMain ? words.toTree : words.toMain),
          h(DialogDescription, null, words.detail)),
        trees ? h('label', null, words.select, h('select', {
          value: choice, disabled: pending, onChange: event => setChoice(event.target.value),
        }, ...trees.filter(tree => tree !== currentTree).map(tree =>
          h('option', { key: tree.path, value: tree.path }, tree.isMain ? words.main : tree.branch || tree.path)),
        h('option', { value: 'new' }, words.newTree))) : h('p', { role: 'status' }, error ? '' : words.loading),
        choice === 'new' && h('label', null, words.branch, h(Input, {
          value: branch, disabled: pending, placeholder: 'worktree', onChange: event => setBranch(event.target.value),
        })),
        choice === 'new' && setupAvailable && h('label', { className: 'hcv-move-setup' },
          h('input', { type: 'checkbox', checked: runSetup, disabled: pending,
            onChange: event => setRunSetup(event.target.checked) }), words.setup),
        (error || busy) && h('p', { role: 'status' }, error || words.busy),
        h(DialogFooter, null, h(Button, { type: 'button', variant: 'outline', onClick: close, disabled: pending }, words.cancel),
          h(Button, { type: 'submit', disabled: !trees || pending || busy || (choice === 'new' && !branch.trim()) }, words.move)))))
}

function MoveSlot({ model, close, localEnvironment }) {
  const entry = useValue(model)
  return entry && h(MoveWorkspaceDialog, {
    key: entry.key, target: entry.target, close, refresh: entry.refresh, localEnvironment,
  })
}

export function registerWorkspaceActions(ctx, active, localEnvironment) {
  const model = atom(null)
  let key = 0
  const close = () => model.set(null)
  const style = document.createElement('style')
  style.textContent = [
    '@media (forced-colors: none) {',
    active + ' [data-hcv-workspace-move] { max-inline-size: 420px; border-radius: 16px; background: var(--hcv-menu); color: var(--hcv-text); font-family: var(--hcv-ui-font); }',
    active + ' .hcv-workspace-move-form { display: grid; gap: 16px; }',
    active + ' .hcv-workspace-move-form label { display: grid; gap: 6px; }',
    active + ' .hcv-workspace-move-form .hcv-move-setup { display: flex; align-items: center; gap: 8px; }',
    active + ' .hcv-workspace-move-form select { inline-size: 100%; min-block-size: 36px; padding: 4px 8px; border: 1px solid var(--hcv-hairline); border-radius: 8px; background: var(--hcv-panel); }',
    active + ' .hcv-workspace-move-form [role="status"] { overflow-wrap: anywhere; color: var(--hcv-muted); }',
    '}',
  ].join('\n')
  document.head.append(style)
  ctx.register({ id: 'move-workspace', area: TITLEBAR_AREAS.center,
    render: () => h(MoveSlot, { model, close, localEnvironment }) })
  const observer = new MutationObserver(() => {
    if (!document.documentElement.matches(active)) close()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.onDispose(() => { observer.disconnect(); close(); style.remove() })
  return {
    openMove(target, refresh) {
      if (target.runtime && target.session && ownsChat(target)) {
        model.set({ key: ++key, target, refresh })
      } else host.notify({ kind: 'error', message: copy().unavailable })
    },
  }
}

