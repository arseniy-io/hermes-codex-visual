import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  host,
  TITLEBAR_AREAS,
  Tip,
  useI18n,
  useTheme,
  useValue,
} from '@hermes/plugin-sdk'
import { createElement as h, Fragment, useEffect, useId, useRef, useState } from 'react'
import { codexIconStyle, codexReference as codex } from './codex-reference.js'
import { toolbarOffsetEvent } from './chrome.js'
import { CompactSources, registerSummarySources, SourcesPane, useChatSources } from './summary-sources.js'
import { SubagentsPane, SummarySubagents } from './subagents.js'
import { registerSummaryPanes } from './summary-panes.js'
import { ChangesPane, registerSummaryChanges } from './summary-changes.js'
import {
  openWorkspaceReview, openWorkspaceTerminal, readWorkspaceRepository, readWorkspaceTrees,
  registerWorkspaceActions, workspaceTreeFor,
} from './workspace-actions.js'

const primaryChat = '[data-chat-surface][data-composer-target="main"]'
const connectionsRoute = '/capabilities?tab=connectors'
const minimumWindowWidth = 1120
const labels = {
  ru: {
    card: 'Изменения и источники',
    changes: 'Изменения',
    project: 'Проект',
    show: 'Показать сводку',
    hide: 'Скрыть сводку',
    pin: 'Закрепить сводку',
    unpin: 'Открепить сводку',
    actions: 'Действия со сводкой',
    setup: 'Настроить локальное окружение',
    terminal: 'Открыть терминал',
    toTree: 'Переместить в рабочее дерево',
    toMain: 'Переместить в основную рабочую копию',
    projectActions: 'Действия проекта',
    actionError: 'Не удалось запустить действие',
  },
  en: {
    card: 'Changes and sources',
    changes: 'Changes',
    project: 'Project',
    show: 'Show summary',
    hide: 'Hide summary',
    pin: 'Pin summary',
    unpin: 'Unpin summary',
    actions: 'Summary actions',
    setup: 'Set up local environment',
    terminal: 'Open terminal',
    toTree: 'Move to worktree',
    toMain: 'Move to main checkout',
    projectActions: 'Project actions',
    actionError: 'Could not run the action',
  },
}

function icon(name) {
  const glyph = name === 'panel' ? 'summaryToggle' : name === 'all' ? 'summarySources' : name
  const style = codexIconStyle(glyph)
  return h('span', { 'aria-hidden': true, 'data-hcv-icon': glyph, style })
}

function currentChat() {
  return [...document.querySelectorAll(primaryChat)].find(
    (node) => !node.closest('[hidden], [inert], [data-pane-hidden]') &&
      node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible',
  )
}

function useRoomForCard(eligible) {
  const [room, setRoom] = useState(false)

  useEffect(() => {
    if (!eligible) {
      setRoom(false)
      return
    }

    let chat = null
    let frame = 0
    const contrast = window.matchMedia('(forced-colors: active)')
    const resize = new ResizeObserver(queue)
    const mutations = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && (node.matches(primaryChat) || node.querySelector(primaryChat)),
          ),
        )
      )
        queue()
    })

    function measure() {
      frame = 0
      const visibleChat = currentChat()
      if (visibleChat !== chat) {
        resize.disconnect()
        chat = visibleChat
        if (chat) resize.observe(chat)
      }
      const bounds = chat?.getBoundingClientRect()
      const offset = parseFloat(document.documentElement.style.getPropertyValue('--hcv-sidebar-right-offset')) || 0
      setRoom(
        Boolean(
          bounds &&
          !contrast.matches &&
          window.innerWidth >= minimumWindowWidth &&
          window.innerHeight >= 450 &&
          bounds.width >= 750 &&
          Math.abs(window.innerWidth - bounds.right - offset) < 36,
        ),
      )
    }

    function queue() {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    // Docking a right tab can replace the workspace host in the pane tree.
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', queue)
    window.addEventListener(toolbarOffsetEvent, queue)
    window.addEventListener('hashchange', queue)
    window.navigation?.addEventListener('currententrychange', queue)
    contrast.addEventListener('change', queue)
    queue()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', queue)
      window.removeEventListener(toolbarOffsetEvent, queue)
      window.removeEventListener('hashchange', queue)
      window.navigation?.removeEventListener('currententrychange', queue)
      contrast.removeEventListener('change', queue)
    }
  }, [eligible])

  return eligible && room
}

function useWorkspaceData(draftCwd, enabled) {
  const owner = useValue(host.state.focusedSessionOwner)
  const session = useValue(host.state.focusedStoredSessionId)
  const activeProfile = useValue(host.state.profile)
  const activeConnection = useValue(host.state.connectionId)
  const gateway = useValue(host.state.gateway)
  const busy = useValue(host.state.busy)
  const connectionId = session ? owner?.connectionId : activeConnection
  const profile = session ? owner?.profile : activeProfile
  const sameScope = Boolean(
    profile && profile === activeProfile && connectionId && connectionId === activeConnection,
  )
  const key = JSON.stringify([session, session ? null : draftCwd, connectionId, profile, activeConnection, activeProfile, gateway])
  const [snapshot, setSnapshot] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled || !sameScope || gateway !== 'open') return
    let current = true

    async function read() {
      // Reuse the connected gateway only when it owns the chat. Some gateway
      // sockets serve multiple profiles, so send the matching profile too.
      if (host.state.connectionId.get() !== connectionId || host.state.profile.get() !== profile) return
      const routes = await host.profileRoutes().catch(() => [])
      if (!current || host.state.connectionId.get() !== connectionId || host.state.profile.get() !== profile) return
      const route = routes.find((entry) => entry.connectionId === connectionId && entry.profile === profile)
      const request = (method, params) => route
        ? host.requestProfile(route, method, params, 8000)
        : host.request(method, params, 8000)
      let cwd = draftCwd
      let storedBranch = ''
      if (session) {
        // A live cwd can still belong to the previous chat during resume.
        const params = new URLSearchParams({ profile: route?.targetProfile ?? profile })
        const row = await window.hermesDesktop.api({ connectionId, path: `/api/sessions/${encodeURIComponent(session)}?${params}`, timeoutMs: 8000 }).catch(() => null)
        cwd = typeof row?.cwd === 'string' ? row.cwd.trim() : ''
        storedBranch = typeof row?.git_branch === 'string' ? row.git_branch : ''
      }
      if (!current) return
      const scope = { connectionId, profile }
      const [project, sources, repository] = await Promise.allSettled([
        cwd ? request('projects.for_cwd', { cwd }) : Promise.resolve(null),
        request('mcp.servers.status', {}),
        readWorkspaceRepository(cwd, scope),
      ])
      if (!current) return
      const status = repository.status === 'fulfilled' ? repository.value : null
      const repo = status?.repo
      const worktrees = repo && connectionId === 'local'
        ? await readWorkspaceTrees(cwd, scope, status.native).catch(() => [])
        : []
      if (!current) return

      const sourceRows =
        sources.status === 'fulfilled' && Array.isArray(sources.value?.servers)
          ? sources.value.servers.filter((row) => typeof row?.name === 'string' && row.name && !row.disabled)
          : null
      setSnapshot({
        key,
        cwd,
        project: project.status === 'fulfilled' ? project.value?.project?.name : null,
        sources: sourceRows,
        repo,
        nativeGit: status?.native,
        branch: repo?.branch || storedBranch,
        isWorktree: workspaceTreeFor(worktrees, cwd)?.isMain === false,
      })
    }

    void read().catch(() => {
      if (current) setSnapshot({ key, cwd: '', project: null, sources: null })
    })
    return () => {
      current = false
    }
  }, [key, sameScope, gateway, connectionId, profile, session, draftCwd, enabled, revision, busy])

  return {
    scope: sameScope && gateway === 'open' ? { connectionId, profile } : null,
    snapshot: snapshot?.key === key ? snapshot : null,
    key,
    refresh: () => setRevision(value => value + 1),
  }
}

function useSourcesView(data, enabled) {
  const rows = useChatSources(currentChat, data.key, enabled)
  return {
    rows, connectors: data.snapshot?.sources, loading: Boolean(data.scope && !data.snapshot),
    getChat: currentChat,
    onConnectors: server => host.navigate(server ? connectionsRoute + '&server=' + encodeURIComponent(server) : connectionsRoute),
    onOpenSource: row => {
      if (row.action?.isConnected && currentChat()?.contains(row.action)) row.action.click()
    },
  }
}

function useExpandedWorkspace() {
  const cwd = useValue(host.state.cwd)?.trim() || ''
  const primary = useValue(host.state.activeSessionId)
  const focused = useValue(host.state.focusedSessionId)
  const enabled = primary === focused
  const data = useWorkspaceData(cwd, enabled)
  return { data, enabled }
}

function ExpandedSources() {
  const { data, enabled } = useExpandedWorkspace()
  return h(SourcesPane, useSourcesView(enabled ? data : { key: data.key }, enabled))
}

function ExpandedChanges() {
  const { data, enabled } = useExpandedWorkspace()
  return h(ChangesPane, { cwd: enabled ? data.snapshot?.cwd : '', scope: enabled ? data.scope : null })
}

function DiffStats({ repo }) {
  if (!repo || (!repo.added && !repo.removed && !repo.changed)) return null
  return h('span', { className: 'hcv-context-diff' },
    repo.added || repo.removed
      ? h(Fragment, null, h('span', { className: 'hcv-context-added' }, '+' + repo.added),
        h('span', { className: 'hcv-context-removed' }, '−' + repo.removed))
      : h('span', null, repo.changed))
}

function WorkspaceCard({ id, close, copy, shown, pinned, onPin, roster, panes, actions, localEnvironment, data, projectActions }) {
  const { scope, snapshot, refresh } = data
  const sources = useSourcesView(data, shown)
  const runtime = useValue(host.state.activeSessionId)
  const session = useValue(host.state.focusedStoredSessionId)
  const busy = useValue(host.state.busy)
  const cwd = snapshot?.cwd || ''
  const local = scope?.connectionId === 'local' && Boolean(cwd)
  const target = { cwd, owner: scope, runtime, session, nativeGit: snapshot?.nativeGit, branch: snapshot?.branch }
  const title = snapshot?.project || cwd.split(/[/\\]/).filter(Boolean).at(-1) || copy.project
  const card = useRef(null)
  const trigger = useRef(null)
  const [menu, setMenu] = useState(null)

  function toggleMenu(open) {
    if (!open) { setMenu(null); return }
    const frame = card.current?.getBoundingClientRect()
    const anchor = trigger.current?.getBoundingClientRect()
    setMenu(frame && anchor ? { side: anchor.left - frame.left + 8, align: frame.top - anchor.top } : { side: 8, align: 0 })
  }

  function openChanges() {
    if (snapshot?.nativeGit && openWorkspaceReview(currentChat)) return
    panes.open('changes')
  }

  const changeButton = h('button', {
    type: 'button', className: 'hcv-context-row hcv-context-changes', onClick: openChanges,
    disabled: !cwd || !scope, 'aria-label': copy.changes, 'data-hcv-branch': snapshot?.branch || undefined,
  }, icon('changes'), h('span', { className: 'hcv-context-label' }, copy.changes),
  h('span', { className: 'hcv-context-change-meta' },
    h(DiffStats, { repo: snapshot?.repo }),
    snapshot?.branch && h('span', { className: 'hcv-context-branch-icon' }, icon('branch'))))

  return h('aside',
    { ref: card, id, 'data-hcv-context-card': '', 'data-pinned': pinned, 'aria-label': copy.card, 'aria-hidden': !shown, inert: !shown },
    h('header', { className: 'hcv-context-title' },
      h('span', { title }, title),
      h(DropdownMenu, { open: Boolean(menu), onOpenChange: toggleMenu },
        h(DropdownMenuTrigger, { asChild: true },
          h('button', { ref: trigger, type: 'button', className: 'hcv-context-icon', 'aria-label': copy.actions },
            icon('more'))),
        h(DropdownMenuContent, {
          side: 'left', align: 'start', sideOffset: menu?.side ?? 8, alignOffset: menu?.align ?? 0,
          'data-hcv-summary-menu': '',
        },
          localEnvironment && h(DropdownMenuItem, { disabled: !local, onSelect: () => {
            void localEnvironment.open({ cwd, projectName: title, trigger: trigger.current })
          } }, icon('plus'), copy.setup),
          h(DropdownMenuItem, { disabled: !local, onSelect: () => openWorkspaceTerminal(target) },
            icon('terminal'), copy.terminal),
          ...projectActions.map(entry => h(DropdownMenuItem, {
            key: entry.id,
            onSelect: () => void localEnvironment.run({ cwd, id: entry.id }).catch(error => host.notifyError(error, copy.actionError)),
          }, icon(entry.icon), entry.label)),
          snapshot?.repo && h(Fragment, null,
            h(DropdownMenuSeparator),
            h(DropdownMenuItem, {
              disabled: !local || !runtime || !session || busy,
              onSelect: () => actions.openMove({ ...target, trigger: trigger.current }, refresh),
            }, snapshot.isWorktree ? copy.toMain : copy.toTree)),
          h(DropdownMenuSeparator),
          h(DropdownMenuItem, { onSelect: onPin }, icon(pinned ? 'unpin' : 'pin'), pinned ? copy.unpin : copy.pin),
          h(DropdownMenuItem, { onSelect: close }, icon('close'), copy.hide)))),
    snapshot?.branch ? h(Tip, { label: snapshot.branch }, changeButton) : changeButton,
    h(SummarySubagents, { roster, onExpand: () => panes.open('agents') }),
    h(CompactSources, { ...sources, onExpand: () => panes.open('sources') }))
}

function ProjectActions({ entries, cwd, localEnvironment, copy }) {
  const named = entries.filter(entry => entry.id !== 'setup' && entry.id !== 'cleanup')
  if (!named.length) return null
  return h(DropdownMenu, null,
    h(DropdownMenuTrigger, { asChild: true },
      h('button', { type: 'button', 'data-hcv-project-actions': '', 'aria-label': copy.projectActions },
        icon(named[0].icon), icon('down'))),
    h(DropdownMenuContent, { align: 'end', 'data-hcv-project-actions-menu': '' },
      ...named.map(entry => h(DropdownMenuItem, {
        key: entry.id,
        onSelect: () => void localEnvironment.run({ cwd, id: entry.id }).catch(error => host.notifyError(error, copy.actionError)),
      }, icon(entry.icon), entry.label))))
}

function CardSlot({ storage, roster, panes, actions, localEnvironment }) {
  const { locale } = useI18n()
  const copy = labels[locale] || labels.en
  const workspace = useValue(host.paneVisibility('workspace'))
  const files = useValue(host.paneVisibility('files'))
  const review = useValue(host.paneVisibility('review'))
  const focused = useValue(host.state.focusedSessionId)
  const primary = useValue(host.state.activeSessionId)
  const draftCwd = useValue(host.state.cwd)?.trim() || ''
  const data = useWorkspaceData(draftCwd, workspace && focused === primary)
  const cwd = workspace && focused === primary && data.scope?.connectionId === 'local' ? data.snapshot?.cwd : ''
  const actionRevision = useValue(localEnvironment.revision)
  const [savedActions, setSavedActions] = useState(null)
  const projectActions = savedActions && savedActions.cwd === cwd ? savedActions.entries : []
  const agents = useValue(panes.visibility.agents)
  const sources = useValue(panes.visibility.sources)
  const changes = useValue(panes.visibility.changes)
  const roomy = useRoomForCard(workspace && !files && !review && !agents && !sources && !changes && focused === primary)
  const [pinned, setPinned] = useState(() => storage.get('summary-pinned', true) !== false)
  const [open, setOpen] = useState(() => storage.get('summary-pinned', true) !== false)
  const toggleRef = useRef(null)
  const cardId = useId()

  useEffect(() => {
    if (!cwd) return
    let live = true
    void localEnvironment.actions(cwd).then(entries => {
      if (live) setSavedActions({ cwd, entries })
    }, () => {})
    return () => { live = false }
  }, [cwd, localEnvironment, actionRevision])

  useEffect(() => {
    if (!roomy || !open || pinned) return
    function onOutside(event) {
      if (event.target instanceof Element && !event.target.closest(
        '[data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-summary-menu], [data-hcv-sources-add-menu], [data-hcv-project-actions], [data-hcv-project-actions-menu], [data-slot="dialog-overlay"]',
      )) setOpen(false)
    }
    function onEscape(event) {
      if (event.key === 'Escape' && !event.defaultPrevented &&
        !document.querySelector('[role="menu"][data-state="open"], [role="dialog"][data-state="open"], [popover]:popover-open')) {
        setOpen(false)
        toggleRef.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onEscape, true)
    return () => {
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('keydown', onEscape, true)
    }
  }, [roomy, open, pinned])

  const projectToolbar = h(ProjectActions, { entries: projectActions, cwd, localEnvironment, copy })
  if (!roomy) return projectToolbar

  function togglePin() {
    storage.set('summary-pinned', !pinned)
    setPinned(!pinned)
  }

  function closeFromMenu() {
    setOpen(false)
    requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }))
  }

  return h(
    Fragment,
    null,
    projectToolbar,
    h(Tip, { label: open ? copy.hide : copy.show }, h(
      'button',
      {
        ref: toggleRef,
        type: 'button',
        'data-hcv-context-toggle': '',
        'aria-expanded': open,
        'aria-controls': cardId,
        'aria-label': open ? copy.hide : copy.show,
        onClick: () => setOpen(visible => !visible),
      },
      icon('panel'),
    )),
    h(WorkspaceCard, { id: cardId, copy, close: closeFromMenu, shown: open, pinned, onPin: togglePin,
      roster, panes, actions, localEnvironment, data, projectActions }),
  )
}

function ThemeCardSlot({ themeName, panes, ...props }) {
  const theme = useTheme()
  return theme.themeName === themeName ? h(Fragment, null, h(CardSlot, { ...props, panes }), panes.renderPicker()) : null
}

export function registerWorkspaceCard(ctx, themeName, roster, localEnvironment) {
  if (typeof host.paneVisibility !== 'function' || !host.state.focusedSessionOwner) return
  const scope = `:root[data-hermes-codex-visual][data-hermes-theme="${CSS.escape(themeName)}"]`
  const actions = registerWorkspaceActions(ctx, scope, localEnvironment)
  const panes = registerSummaryPanes(ctx, scope, {
    agents: () => h(SubagentsPane, { roster }),
    sources: () => h(ExpandedSources),
    changes: () => h(ExpandedChanges),
  })
  registerSummarySources(ctx, scope)
  registerSummaryChanges(ctx, scope)
  const surfaces = `${scope} [data-hcv-context-card]`
  const chat = `${scope} ${primaryChat}`
  const dock = `${chat} [data-slot="composer-dock"]:not([data-popped-out])`
  const fallback = `${chat} [data-slot="composer-root"]:has(> .composer-fallback-surface)`
  const style = document.createElement('style')
  style.dataset.hcvWorkspaceCard = ''
  style.textContent = `
@property --hcv-summary-progress {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
${scope} {
  --hcv-summary-width: 300px;
  --hcv-summary-layout-inset: calc((var(--hcv-summary-width) + 12px) * var(--hcv-summary-progress));
}
${scope}:has([data-hcv-context-card][aria-hidden="false"]) { --hcv-summary-progress: 1; }
@media (forced-colors: none) {
  ${chat} {
    --hcv-summary-composer-width: min(var(--composer-width), 100% - var(--hcv-summary-layout-inset) - 2rem);
  }
  ${chat} > [data-slot="composer-bounds"] { margin-right: var(--hcv-summary-layout-inset); }
  ${dock}, ${fallback} { left: calc(50% - var(--hcv-summary-layout-inset) / 2); }
  ${dock} { width: calc(var(--hcv-summary-composer-width) + 10px); }
  ${fallback} { width: var(--hcv-summary-composer-width); }
}
${scope} [data-hcv-context-card] {
  position: fixed;
  inset-block-start: var(--hcv-context-card-top, 93px);
  right: calc(8px + var(--hcv-sidebar-right-offset, 0px));
  inline-size: var(--hcv-summary-width);
  max-block-size: calc(100dvh - var(--hcv-context-card-top, 93px) - 8px);
  overflow: auto;
  box-sizing: border-box;
  padding: 12px 12px 8px;
  border: 1px solid color-mix(in srgb, var(--hcv-text) 8%, transparent);
  border-radius: 16px;
  color: var(--hcv-text);
  background: var(--hcv-menu);
  text-align: start;
  font: 13px/20px var(--hcv-ui-font);
  font-weight: 400;
  opacity: var(--hcv-summary-progress);
  transform: translateX(calc(100% * (1 - var(--hcv-summary-progress))));
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
${scope} [data-hcv-context-card][aria-hidden="true"] {
  visibility: hidden;
  pointer-events: none;
}
/* The card sits in the titlebar layer. Its portaled menu must clear that
   layer and still sit below a modal backdrop. Radix copies the menu z-index. */
${scope} [data-hcv-summary-menu] {
  z-index: calc(var(--z-modal-backdrop, 120) - 1);
  min-inline-size: min(260px, calc(100vw - 16px));
  padding: 4px;
  border-radius: 16px;
  background: var(--hcv-menu);
}
${scope} [data-hcv-summary-menu] [role="menuitem"] { min-block-size: 28px; border-radius: 8px; }
${surfaces} button.hcv-context-row,
${scope} [data-hcv-context-card] .hcv-context-icon,
${scope} [data-hcv-context-toggle] {
  appearance: none;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
${scope} [data-hcv-context-card] button:disabled { opacity: .5; cursor: default; }
${surfaces} button:focus-visible,
${scope} [data-hcv-context-toggle]:focus-visible { outline: 1px solid var(--hcv-focus); outline-offset: 1px; }
${scope} [data-hcv-context-card] .hcv-context-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: var(--hcv-muted);
  min-block-size: 24px;
  margin-block-end: 4px;
  padding-inline: 8px 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
${scope} [data-hcv-context-card] .hcv-context-title > span,
${surfaces} .hcv-context-label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
${surfaces} .hcv-context-row {
  display: flex;
  align-items: center;
  inline-size: 100%;
  min-block-size: 28px;
  padding: 4px 8px;
  gap: 12px;
  text-align: start;
}
${scope} :is([data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-summary-menu], [data-hcv-project-actions], [data-hcv-project-actions-menu]) [data-hcv-icon] {
  display: inline-block;
  inline-size: 16px;
  block-size: 16px;
  flex: 0 0 auto;
}
${surfaces} :is([data-hcv-summary-agents], [data-hcv-sources-compact]) { margin-inline: 8px; }
${surfaces} .hcv-context-change-meta { display: grid; align-items: center; margin-inline-start: auto; color: var(--hcv-muted); }
${surfaces} .hcv-context-change-meta > * { grid-area: 1/1; justify-self: end; }
${surfaces} .hcv-context-diff { display: flex; gap: 4px; font-variant-numeric: tabular-nums; }
${surfaces} .hcv-context-added { color: light-dark(#008241, #40c977); }
${surfaces} .hcv-context-removed { color: light-dark(#aa2626, #f28080); }
${surfaces} .hcv-context-branch-icon { display: flex; }
${surfaces} .hcv-context-diff + .hcv-context-branch-icon { opacity: 0; }
${surfaces} .hcv-context-changes:is(:hover, :focus-visible) .hcv-context-diff:has(+ .hcv-context-branch-icon) { opacity: 0; }
${surfaces} .hcv-context-changes:is(:hover, :focus-visible) .hcv-context-branch-icon { opacity: 1; }
${scope} [data-hcv-context-card] .hcv-context-icon,
${scope} [data-hcv-context-toggle] {
  display: inline-grid;
  place-items: center;
  inline-size: 24px;
  block-size: 24px;
  padding: 0;
  color: var(--hcv-muted);
  flex: 0 0 auto;
}
${scope} [data-hcv-context-toggle][aria-expanded="true"] {
  color: var(--hcv-text);
  background: var(--hcv-selected);
}
${scope} [data-hcv-project-actions] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-inline: 6px;
  border-radius: 8px;
  color: var(--hcv-muted);
}
${scope} [data-hcv-project-actions] [data-hcv-icon="down"] { inline-size: 10px; block-size: 10px; }
${scope} [data-hcv-project-actions]:is(:hover, [data-state="open"]) {
  color: var(--hcv-text);
  background: var(--hcv-hover);
}
${scope} [data-hcv-project-actions-menu] { z-index: calc(var(--z-modal-backdrop, 120) - 1); }
@media (hover: hover) and (pointer: fine) {
  ${surfaces} button:is(.hcv-context-row, .hcv-context-icon):hover:not(:disabled),
  ${scope} [data-hcv-context-toggle]:hover { background: var(--hcv-hover); color: var(--hcv-text); }
}
@media (prefers-reduced-motion: no-preference) {
  /* The Codex panel travel and the chat inset share one interpolated value. */
  ${scope} { transition: --hcv-summary-progress ${codex.summaryTime} var(--hcv-enter); }
  ${scope} [data-hcv-context-card] { transition: visibility 0s; }
  ${scope} [data-hcv-context-card][aria-hidden="true"] { transition-delay: ${codex.summaryTime}; }
}
`
  document.head.append(style)
  ctx.onDispose(() => style.remove())
  ctx.register({
    id: 'workspace-card',
    area: TITLEBAR_AREAS.right,
    render: () => h(ThemeCardSlot, { themeName, storage: ctx.storage, roster, panes, actions, localEnvironment }),
  })
}
