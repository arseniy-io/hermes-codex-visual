import { mountStyle } from './style-scope.js'
import { useFocusedWorkspace, focusedWorkspaceSurface } from './workspace-focus.js'
import { tileTurnHistoryTarget } from './chat-tile-turn-history.js'
import {
  atom,
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
import { createElement as h, Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { codexIconStyle, codexReference as codex } from './codex-reference.js'
import { toolbarOffsetEvent } from './chrome.js'
import { CompactSummaryItems, CompactSources, registerSummarySources, SourcesPane, useChatSources } from './summary-sources.js'
import { SubagentsPane, SummarySubagents } from './subagents.js'
import { registerSummaryPanes } from './summary-panes.js'
import { ChangesPane, registerSummaryChanges } from './summary-changes.js'
import { SummarySection, summarySectionStyles } from './summary-section.js'
import {
  changesSelectionCwd, incompleteDiffStats, openWorkspaceReview, openWorkspaceTerminal, readWorkspaceRepository, readWorkspaceTrees,
  registerWorkspaceActions, workspacePathKey, workspaceTreeFor,
} from './workspace-actions.js'

const primaryChat = '[data-chat-surface]'
const connectionsRoute = '/capabilities?tab=connectors'
const minimumWindowWidth = 1120
const labels = {
  ru: {
    card: 'Изменения и источники',
    changes: 'Изменения',
    incompleteChanges: 'Часть изменений не подсчитана', detached: 'Отсоединённая рабочая копия',
    project: 'Проект',
    show: 'Показать сводку',
    hide: 'Скрыть сводку',
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
    incompleteChanges: 'Some changes could not be counted', detached: 'Detached worktree',
    project: 'Project',
    show: 'Show summary',
    hide: 'Hide summary',
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

function repositoryName(path) {
  return path?.split(/[/\\]/).filter(Boolean).at(-1) || ''
}

function RepositoryLabel({ name, branch }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const label = ref.current
    const measure = () => label.toggleAttribute('data-overflow', label.scrollWidth > label.clientWidth)
    const resize = new ResizeObserver(measure)
    resize.observe(label)
    measure()
    return () => resize.disconnect()
  }, [name, branch])
  return h('span', { ref, className: 'hcv-context-label', dir: 'auto' },
    name, branch && h('span', { className: 'hcv-context-branch-name' }, name ? ' · ' + branch : branch))
}

function currentChat() {
  return focusedWorkspaceSurface()
}

function useRoomForCard(eligible) {
  const [room, setRoom] = useState(null)

  useLayoutEffect(() => {
    if (!eligible) {
      setRoom(null)
      return
    }

    let chat = null
    let frame = 0
    const contrast = window.matchMedia('(forced-colors: active)')
    const resize = new ResizeObserver(queue)
    const mutations = new MutationObserver((records) => {
      if (
        records.some((record) => record.type === 'attributes'
          ? record.target instanceof Element &&
            (record.target.matches(primaryChat) || record.target.querySelector(primaryChat))
          : [...record.addedNodes, ...record.removedNodes].some(
            (node) => node instanceof Element && (node.matches(primaryChat) || node.querySelector(primaryChat)),
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
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['hidden', 'inert', 'data-pane-hidden'] })
    window.addEventListener('resize', queue)
    window.addEventListener(toolbarOffsetEvent, queue)
    window.addEventListener('hashchange', queue)
    window.navigation?.addEventListener('currententrychange', queue)
    contrast.addEventListener('change', queue)
    measure()

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

  return room
}

function useWorkspaceData(draftCwd, enabled, isTile = false, nativeOwner = null) {
  const sdkOwner = useValue(host.state.focusedSessionOwner)
  // The focused native SessionView can confirm a tile's owner before the SDK
  // publishes it. readFocusedSession already rejects conflicting owners.
  const owner = sdkOwner || (isTile ? nativeOwner : null)
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
  const key = JSON.stringify([session, draftCwd, connectionId, profile, activeConnection, activeProfile, gateway])
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
      let root = ''
      if (session) {
        // A live cwd can still belong to the previous chat during resume.
        const params = new URLSearchParams({ profile: route?.targetProfile ?? profile })
        const row = await window.hermesDesktop.api({ connectionId, path: `/api/sessions/${encodeURIComponent(session)}?${params}`, timeoutMs: 8000 }).catch(() => null)
        cwd = typeof row?.cwd === 'string' ? row.cwd.trim() : ''
        storedBranch = typeof row?.git_branch === 'string' ? row.git_branch : ''
        root = typeof row?.git_repo_root === 'string' ? row.git_repo_root : ''
        // A tile has its own confirmed SessionView. Its live cwd can change
        // before the saved row does; never pair the new cwd with stale Git data.
        if (isTile && workspacePathKey(cwd) !== workspacePathKey(draftCwd)) {
          cwd = draftCwd
          storedBranch = ''
          root = ''
        }
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
      const tree = workspaceTreeFor(worktrees, cwd)
      setSnapshot({
        key,
        cwd,
        root: status?.root || tree?.path || root || cwd,
        project: project.status === 'fulfilled' ? project.value?.project?.name : null,
        sources: sourceRows,
        repo,
        nativeGit: status?.native,
        storedBranch,
        branch: repo?.detached ? '' : repo?.branch || storedBranch,
        isWorktree: tree?.isMain === false,
      })
    }

    void read().catch(() => {
      if (current) setSnapshot({ key, cwd: '', project: null, sources: null })
    })
    return () => {
      current = false
    }
  }, [key, sameScope, gateway, connectionId, profile, session, draftCwd, enabled, isTile, revision, busy])

  return {
    scope: sameScope && gateway === 'open' ? { connectionId, profile } : null,
    snapshot: snapshot?.key === key ? snapshot : null,
    key,
    refresh: () => setRevision(value => value + 1),
    updateRepository: (expectedKey, status) => setSnapshot(previous =>
      previous?.key === expectedKey ? {
        ...previous, repo: status?.repo || null, nativeGit: status?.native,
        root: status?.root || previous.root,
        branch: status?.repo?.detached ? '' : status?.repo?.branch || previous.storedBranch || '',
      } : previous),
  }
}

function useRelatedRepositories(scope, primaryRoot, key, rows, shown) {
  const dirs = JSON.stringify([...new Set(rows.filter(row => row.attached && row.kind === 'folder' &&
    /^(?:[a-z]:[/\\]|\/[^/])/i.test(row.meta || '')).map(row => row.meta))])
  const [snapshot, setSnapshot] = useState(null)
  const connection = scope?.connectionId
  const profile = scope?.profile
  useEffect(() => {
    if (!shown || !primaryRoot || !connection || !profile || dirs === '[]') return
    let current = true
    const owner = { connectionId: connection, profile }
    const read = async (cwd) => {
      const status = await readWorkspaceRepository(cwd, owner)
      if (!current || !status?.repo) return null
      const trees = await readWorkspaceTrees(cwd, owner, status.native).catch(() => [])
      const root = status.root || workspaceTreeFor(trees, cwd)?.path || cwd
      return { cwd: root, repo: status.repo, branch: status.repo.branch }
    }
    void Promise.allSettled(JSON.parse(dirs).map(read)).then(results => {
      if (!current) return
      const known = new Set([workspacePathKey(primaryRoot)])
      const repos = []
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue
        const repoKey = workspacePathKey(result.value.cwd)
        if (known.has(repoKey)) continue
        known.add(repoKey)
        repos.push(result.value)
      }
      setSnapshot({ key, dirs, repos })
    })
    return () => { current = false }
  }, [connection, profile, primaryRoot, key, dirs, shown])
  return snapshot?.key === key && snapshot.dirs === dirs ? snapshot.repos : []
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
  const focus = useFocusedWorkspace()
  const enabled = Boolean(focus)
  const data = useWorkspaceData(focus?.cwd || '', enabled, focus?.view.kind === 'tile', focus?.owner)
  return { data, enabled }
}

function ExpandedSources() {
  const { data, enabled } = useExpandedWorkspace()
  return h(SourcesPane, useSourcesView(enabled ? data : { key: data.key }, enabled))
}

function ExpandedChanges({ selection }) {
  const { data, enabled } = useExpandedWorkspace()
  const choice = useValue(selection)
  const cwd = changesSelectionCwd(choice, data.key, data.snapshot)
  return h(ChangesPane, {
    cwd: enabled ? cwd : '', scope: enabled ? data.scope : null,
    loading: enabled && Boolean(data.scope) && !cwd && !data.snapshot,
    workspaceDiff: choice?.key === data.key && choice.workspaceDiff,
  })
}

function FocusedSubagentsPane({ roster, visibility }) {
  const focus = useFocusedWorkspace()
  const shown = useValue(visibility)
  return focus ? h(SubagentsPane, { roster, focus, shown }) : null
}

function DiffStats({ repo, copy }) {
  if (!repo?.changed || !Number.isFinite(repo.added) || !Number.isFinite(repo.removed)) return null
  if (incompleteDiffStats(repo)) return h('span', {
    className: 'hcv-context-diff-incomplete', title: copy.incompleteChanges,
    'aria-label': copy.incompleteChanges,
  }, '…')
  const formatter = new Intl.NumberFormat(document.documentElement.lang || undefined)
  return h('span', { className: 'hcv-context-diff' },
    h('span', { className: 'hcv-context-added' }, '+' + formatter.format(repo.added)),
    h('span', { className: 'hcv-context-removed' }, '-' + formatter.format(repo.removed)))
}

function useLiveWorkspaceRepository(data, shown, updates) {
  const cwd = data.snapshot?.cwd
  const connectionId = data.scope?.connectionId
  const profile = data.scope?.profile
  const key = data.key

  useEffect(() => {
    if (!shown || !cwd || !connectionId || !profile) return
    const runtime = host.state.focusedSessionId.get()
    let live = true
    let inFlight = false
    let queued = false
    let debounce = 0
    let lastStarted = 0
    let burstStart = 0
    let timer = null
    let nativeWindowHidden = false
    const visible = () => live && document.visibilityState === 'visible' && !nativeWindowHidden &&
      !document.documentElement.hasAttribute('data-renderer-animations-paused')

    async function read() {
      if (!visible()) return
      if (inFlight) { queued = true; return }
      inFlight = true
      lastStarted = Date.now()
      try {
        const status = await readWorkspaceRepository(cwd, { connectionId, profile })
        if (visible() && host.state.connectionId.get() === connectionId && host.state.profile.get() === profile &&
            host.state.focusedSessionId.get() === runtime) data.updateRepository(key, status)
      } catch {
        // A transient unavailable profile should not break the card or leave
        // an unhandled rejection while the next refresh can recover.
      } finally {
        inFlight = false
        if (live && queued) { queued = false; schedule() }
      }
    }

    function schedule() {
      if (!visible()) return
      const now = Date.now()
      if (!burstStart) burstStart = now
      window.clearTimeout(debounce)
      // A burst settles for one second. A steady stream still gets a refresh
      // at least every three seconds, never an unbounded queue of Git reads.
      const due = Math.max(lastStarted + 1200, Math.min(now + 1000, burstStart + 3000))
      debounce = window.setTimeout(() => { debounce = 0; burstStart = 0; void read() }, Math.max(0, due - now))
    }

    // Changes by a tool update immediately; the visible-only fallback also
    // catches changes made in another application, including nested folders.
    const off = updates.listen(schedule)
    function updateVisibility() {
      if (!visible()) {
        if (timer !== null) window.clearInterval(timer)
        timer = null
        window.clearTimeout(debounce)
        debounce = 0
        burstStart = 0
        queued = false
        return
      }
      if (timer === null) {
        timer = window.setInterval(schedule, 10000)
        schedule()
      }
    }
    // Hermes can keep the document visible for an Electron window that is
    // minimized. Its own pause marker and window-state event cover that case.
    const offWindowState = window.hermesDesktop?.onWindowStateChanged?.(state => {
      nativeWindowHidden = state?.isMinimized === true || state?.isVisible === false
      updateVisibility()
    })
    const visibilityObserver = new MutationObserver(updateVisibility)
    visibilityObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-renderer-animations-paused'],
    })
    window.addEventListener('focus', schedule)
    document.addEventListener('visibilitychange', updateVisibility)
    updateVisibility()
    return () => {
      live = false
      off()
      window.clearTimeout(debounce)
      if (timer !== null) window.clearInterval(timer)
      offWindowState?.()
      visibilityObserver.disconnect()
      window.removeEventListener('focus', schedule)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [shown, cwd, connectionId, profile, key, updates])
}

function WorkspaceCard({ id, copy, shown, roster, panes, actions, localEnvironment, data,
  projectActions, disclosure, selection, updates, isTile, focus }) {
  const { scope, snapshot, refresh } = data
  useLiveWorkspaceRepository(data, shown, updates)
  const sources = useSourcesView(data, shown)
  const runtime = useValue(host.state.focusedSessionId)
  const session = useValue(host.state.focusedStoredSessionId)
  const busy = useValue(host.state.busy)
  const related = useRelatedRepositories(scope, snapshot?.root, data.key, sources.rows, shown && !busy)
  const cwd = snapshot?.cwd || ''
  const local = scope?.connectionId === 'local' && Boolean(cwd)
  const target = { cwd, owner: scope, runtime, session, nativeGit: snapshot?.nativeGit, branch: snapshot?.branch }
  const tileTarget = isTile && focus?.surface ? tileTurnHistoryTarget(focus.surface) : null
  const tileCurrent = () => Boolean(tileTarget && focus && tileTarget.view === focus.view &&
    tileTarget.sessionId === focus.storedId && tileTarget.runtimeId === focus.runtimeId &&
    tileTarget.connectionId === focus.owner?.connectionId && tileTarget.profile === focus.owner?.profile &&
    scope?.connectionId === tileTarget.connectionId && scope?.profile === tileTarget.profile &&
    roster.isCurrentTile(tileTarget) && host.state.connectionId.get() === tileTarget.connectionId &&
    host.state.profile.get() === tileTarget.profile &&
    workspacePathKey(focus.view.$cwd.get()) === workspacePathKey(cwd))
  const title = snapshot?.project || repositoryName(cwd) || copy.project
  const card = useRef(null)
  const trigger = useRef(null)
  const [menu, setMenu] = useState(null)

  function toggleMenu(open) {
    if (!open) { setMenu(null); return }
    const frame = card.current?.getBoundingClientRect()
    const anchor = trigger.current?.getBoundingClientRect()
    setMenu(frame && anchor ? { side: anchor.left - frame.left + 8, align: frame.top - anchor.top } : { side: 8, align: 0 })
  }

  function changeRow(repository, folder, primary) {
    const repo = repository?.repo
    const label = repositoryName(folder)
    const branch = repo?.detached ? copy.detached : repository?.branch
    const description = [label, branch].filter(Boolean).join(' · ')
    const incomplete = repo?.changed && incompleteDiffStats(repo)
    const button = h('button', {
      type: 'button', className: 'hcv-context-row hcv-context-changes',
      disabled: !folder || !scope,
      'aria-label': [copy.changes, description, incomplete && copy.incompleteChanges].filter(Boolean).join('. '),
      'data-hcv-branch': repository?.branch || undefined,
      onClick: () => {
        if (!repo?.workspaceDiff && primary && repository?.nativeGit && openWorkspaceReview(currentChat)) return
        selection.set({ key: data.key, cwd: folder, primary, workspaceDiff: repo?.workspaceDiff === true })
        panes.open('changes')
      },
    }, h('span', { className: 'hcv-context-branch-icon', 'data-hcv-summary-changes-icon': '' }, icon('branch')),
    h(RepositoryLabel, { name: label, branch }),
    h(DiffStats, { repo, copy }))
    return description ? h(Tip, { label: description }, button) : button
  }

  const projectMenu = h(DropdownMenu, { open: Boolean(menu), onOpenChange: toggleMenu },
        h(DropdownMenuTrigger, { asChild: true },
          h('button', { ref: trigger, type: 'button', className: 'hcv-context-icon', 'aria-label': copy.actions },
            icon('more'))),
        h(DropdownMenuContent, {
          side: 'left', align: 'start', sideOffset: menu?.side ?? 8, alignOffset: menu?.align ?? 0,
          'data-hcv-summary-menu': '',
        },
          localEnvironment && h(DropdownMenuItem, { disabled: !local || (isTile && !tileCurrent()), onSelect: () => {
            void localEnvironment.open({ cwd, projectName: title, trigger: trigger.current,
              ...(isTile && { isCurrent: tileCurrent }) })
          } }, icon('plus'), copy.setup),
          h(DropdownMenuItem, { disabled: isTile || !local, onSelect: () => openWorkspaceTerminal(target) },
            icon('terminal'), copy.terminal),
          ...projectActions.map(entry => h(DropdownMenuItem, {
            key: entry.id,
            onSelect: () => void localEnvironment.run({ cwd, id: entry.id }).catch(error => host.notifyError(error, copy.actionError)),
          }, icon(entry.icon), entry.label)),
          snapshot?.repo && h(Fragment, null,
            h(DropdownMenuSeparator),
            h(DropdownMenuItem, {
              disabled: isTile || !local || !runtime || !session || busy,
              onSelect: () => actions.openMove({ ...target, trigger: trigger.current }, refresh),
            }, snapshot.isWorktree ? copy.toMain : copy.toTree))))

  return h('aside',
    { ref: card, id, 'data-hcv-context-card': '', 'aria-label': copy.card, 'aria-hidden': !shown, inert: !shown },
    (snapshot?.repo || related.length > 0) ? h(SummarySection, {
      ...disclosure('changes'), kind: 'changes', title: copy.changes, action: projectMenu,
    }, snapshot?.repo && changeRow(snapshot, snapshot.root || cwd, true),
    related.map(repo => h(Fragment, { key: workspacePathKey(repo.cwd) }, changeRow(repo, repo.cwd, false))))
      : cwd && h(SummarySection, { ...disclosure('project'), kind: 'project', title, action: projectMenu }),
    ['pullRequests', 'outputs'].map(kind => h(CompactSummaryItems, { key: JSON.stringify([data.key, kind]), kind, onOpenSource: sources.onOpenSource,
      rows: sources.rows.filter(row => row.section === kind), disclosure: disclosure(kind) })),
    h(SummarySubagents, { roster, focus, shown, disclosure: disclosure('agents'), onExpand: () => panes.open('agents') }),
    h(CompactSources, { ...sources, rows: sources.rows.filter(row => !row.section), disclosure: disclosure('sources'),
      onExpand: () => panes.open('sources') }))
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

function CardSlot({ roster, panes, actions, localEnvironment, selection, updates, summaryStarts, hiddenSummary, setLayout }) {
  const { locale } = useI18n()
  const copy = labels[locale] || labels.en
  const focus = useFocusedWorkspace(true)
  const isTile = focus?.view.kind === 'tile'
  const files = useValue(host.paneVisibility('files'))
  const review = useValue(host.paneVisibility('review'))
  const data = useWorkspaceData(focus?.cwd || '', Boolean(focus), isTile, focus?.owner)
  const cwd = focus && !isTile && data.scope?.connectionId === 'local' ? data.snapshot?.cwd : ''
  const actionRevision = useValue(localEnvironment.revision)
  const [savedActions, setSavedActions] = useState(null)
  const projectActions = savedActions && savedActions.cwd === cwd ? savedActions.entries : []
  const agents = useValue(panes.visibility.agents)
  const sources = useValue(panes.visibility.sources)
  const changes = useValue(panes.visibility.changes)
  const eligible = Boolean(focus) && !files && !review && !agents && !sources && !changes
  const roomy = useRoomForCard(eligible)
  const summaryStart = useValue(summaryStarts)
  const summaryKey = JSON.stringify([focus?.storedId, focus?.runtimeId, focus?.owner?.profile,
    focus?.owner?.connectionId, summaryStart])
  const hiddenFor = useValue(hiddenSummary)
  const open = hiddenFor !== summaryKey
  const [closed, setClosed] = useState(null)
  const cardId = useId()

  useLayoutEffect(() => {
    if (focus?.surface && (!eligible || roomy !== null)) {
      setLayout(focus.surface, eligible && roomy && open)
    }
  }, [focus?.surface, eligible, roomy, open, setLayout])

  useEffect(() => {
    if (!cwd) return
    let live = true
    void localEnvironment.actions(cwd).then(entries => {
      if (live) setSavedActions({ cwd, entries })
    }, () => {})
    return () => { live = false }
  }, [cwd, localEnvironment, actionRevision])

  const projectToolbar = h(ProjectActions, { entries: projectActions, cwd, localEnvironment, copy })
  if (!eligible || !roomy) return projectToolbar

  function disclosure(section) {
    return {
      expanded: closed?.key !== data.key || !closed.sections.has(section),
      onToggle: () => setClosed(previous => {
        const sections = new Set(previous?.key === data.key ? previous.sections : [])
        if (sections.has(section)) sections.delete(section)
        else sections.add(section)
        return { key: data.key, sections }
      }),
    }
  }

  return h(
    Fragment,
    null,
    projectToolbar,
    h(Tip, { label: open ? copy.hide : copy.show, delayDuration: 250, sideOffset: 2 }, h(
      'button',
      {
        type: 'button',
        'data-hcv-context-toggle': '',
        'aria-expanded': open,
        'aria-controls': cardId,
        'aria-label': open ? copy.hide : copy.show,
        onClick: () => hiddenSummary.set(open ? summaryKey : null),
      },
      icon('panel'),
    )),
    h(WorkspaceCard, { id: cardId, copy, shown: open,
      roster, panes, actions, localEnvironment, data, projectActions, disclosure, selection, updates, isTile, focus }),
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
  const selection = atom(null)
  const updates = atom(0)
  const summaryStarts = atom(0)
  const hiddenSummary = atom(null)
  const layoutMarker = 'data-hcv-summary-layout'
  let layoutPane = null
  function setLayout(surface, shown) {
    // Route overlays unmount the chat and titlebar. The native pane keeps
    // the layout available for the first frame when the chat returns.
    const pane = surface.closest('[data-pane-host], [data-tree-group]') || surface
    if (pane !== layoutPane) layoutPane?.removeAttribute(layoutMarker)
    layoutPane = pane
    pane.toggleAttribute(layoutMarker, shown)
  }
  ctx.onDispose(() => layoutPane?.removeAttribute(layoutMarker))
  const ownsEvent = event => !event.replayed && event.session_id === host.state.focusedSessionId.get() &&
    (!event.connectionId || event.connectionId === host.state.connectionId.get()) &&
    (!event.profile || event.profile === host.state.profile.get())
  ctx.onEvent('message.start', event => {
    if (ownsEvent(event)) summaryStarts.set(summaryStarts.get() + 1)
  })
  let updateTimer = 0
  ctx.onEvent('tool.complete', event => {
    const payload = event.payload
    if (!ownsEvent(event)) return
    if (!(typeof payload?.inline_diff === 'string' && payload.inline_diff.trim()) &&
        !/terminal|shell|exec|bash|command|write|edit|patch|replace|apply|create|delete|remove|move|rename|mkdir|format/i.test(String(payload?.name || payload?.tool || ''))) return
    if (!updateTimer) updateTimer = window.setTimeout(() => { updateTimer = 0; updates.set(updates.get() + 1) }, 300)
  })
  ctx.onDispose(() => window.clearTimeout(updateTimer))
  const panes = registerSummaryPanes(ctx, scope, {
    agents: () => h(FocusedSubagentsPane, { roster, visibility: panes.visibility.agents }),
    sources: () => h(ExpandedSources),
    changes: () => h(ExpandedChanges, { selection }),
  })
  const revealAgents = () => panes.open('agents')
  roster.revealAgentPane = revealAgents
  ctx.onDispose(() => { if (roster.revealAgentPane === revealAgents) roster.revealAgentPane = null })
  registerSummarySources(ctx, scope)
  registerSummaryChanges(ctx, scope)
  const surfaces = `${scope} [data-hcv-context-card]`
  const layout = `[${layoutMarker}]`
  const chat = `${scope} :is([data-chat-surface][data-hcv-summary-focused], ${layout} [data-chat-surface]:not(:is([data-pane-hidden], [hidden]) *))`
  const bounds = `${chat} > [data-slot="composer-bounds"]`
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
  /* A 300px card in Codex at 90% covers the same screen width at the owner's Hermes zoom. */
  --hcv-summary-width: 280px;
  --hcv-summary-layout-inset: calc((var(--hcv-summary-width) + 12px) * var(--hcv-summary-progress));
}
${scope}:has(${layout}) { --hcv-summary-progress: 1; }
@media (forced-colors: none) {
  ${chat} {
    --hcv-summary-composer-width: min(var(--composer-width), 100% - var(--hcv-summary-layout-inset) - 2rem);
  }
  /* Codex shifts the transcript inside the full-width scroll container. */
  ${bounds} [data-slot="aui_thread-viewport"] { padding-right: var(--hcv-summary-layout-inset); }
  ${bounds} > .thread-jump-button { left: calc(50% - var(--hcv-summary-layout-inset) / 2); }
  ${bounds} [data-slot="thread-timeline"] { margin-right: max(10px, var(--hcv-summary-layout-inset)); }
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
  padding: 12px 18px;
  border: 1px solid color-mix(in srgb, var(--hcv-text) 8%, transparent);
  border-radius: 16px;
  color: var(--hcv-text);
  background: var(--hcv-menu);
  --hcv-summary-row-hover: light-dark(rgb(26 28 31 / 5%), rgb(255 255 255 / 6%));
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
  padding: 4px 0;
  gap: 12px;
  text-align: start;
}
${scope} :is([data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-summary-menu], [data-hcv-project-actions], [data-hcv-project-actions-menu]) [data-hcv-icon] {
  display: inline-block;
  inline-size: 16px;
  block-size: 16px;
  flex: 0 0 auto;
}
${summarySectionStyles(surfaces)}
${surfaces} .hcv-context-changes {
  position: relative; isolation: isolate; gap: 4px; -webkit-app-region: no-drag;
}
${surfaces} .hcv-context-branch-icon {
  display: flex; align-items: center; flex: none;
  inline-size: 16px; margin-inline-end: 8px;
}
${surfaces} .hcv-context-changes > .hcv-context-label {
  flex: 1; text-overflow: clip; overflow: hidden;
}
${surfaces} .hcv-context-changes > .hcv-context-label[data-overflow] {
  mask-image: linear-gradient(to right, #000 calc(100% - 9px), transparent);
}
${surfaces} .hcv-context-changes > .hcv-context-label[data-overflow]:dir(rtl) {
  mask-image: linear-gradient(to left, #000 calc(100% - 9px), transparent);
}
${surfaces} .hcv-context-branch-name { color: var(--hcv-muted); }
${surfaces} .hcv-context-changes:is(:hover, :focus-visible):not(:disabled)::before {
  content: ''; position: absolute; inset: 0 -8px; z-index: -1;
  border-radius: 8px; background: var(--hcv-summary-row-hover);
}
${surfaces} .hcv-context-diff {
  display: flex; flex: none; gap: 4px; line-height: 1;
  letter-spacing: -.025em; font-variant-numeric: tabular-nums;
}
${surfaces} .hcv-context-added { color: light-dark(#00a240, #40c977); }
${surfaces} .hcv-context-removed { color: light-dark(#ba2623, #fa423e); }
${surfaces} .hcv-context-diff-incomplete { color: var(--hcv-muted); }
@media (hover: hover) and (pointer: fine) {
  ${surfaces} [data-hcv-summary-section="changes"]:not(:hover, :focus-within)
    > header > .hcv-context-icon:not([data-state="open"]) { opacity: 0; }
}
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
  ${surfaces} button.hcv-context-row:hover:not(:disabled) { color: var(--hcv-text); }
  ${surfaces} button.hcv-context-icon:hover:not(:disabled) { background: var(--hcv-control-hover); color: var(--hcv-text); }
}
@media (prefers-reduced-motion: no-preference) {
  /* The Codex panel travel and the chat inset share one interpolated value. */
  ${scope} { transition: --hcv-summary-progress ${codex.summaryTime} var(--hcv-enter); }
  ${scope} [data-hcv-context-card] { transition: visibility 0s; }
  ${scope} [data-hcv-context-card][aria-hidden="true"] { transition-delay: ${codex.summaryTime}; }
}
`
  mountStyle(ctx, style, { surface: '[data-tree-group="grp-main"], [data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-project-actions]', retainAcrossChatTabs: true })
  ctx.register({
    id: 'workspace-card',
    area: TITLEBAR_AREAS.right,
    render: () => h(ThemeCardSlot, { themeName, roster, panes, actions, localEnvironment, selection, updates,
      summaryStarts, hiddenSummary, setLayout }),
  })
}
