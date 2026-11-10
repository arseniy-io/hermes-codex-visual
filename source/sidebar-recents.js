import { createElement as h, isValidElement, useSyncExternalStore, version } from 'react'

const sectionActions = ['onResumeSession', 'onArchiveSession', 'onDeleteSession', 'onTogglePin', 'onToggleUnread']

export function committedFiber(element) {
  if (!element || !version.startsWith('19.')) return null
  const keys = Object.keys(element)
  let fiber = element[keys.find(key => key.startsWith('__reactFiber$'))]
  const props = element[keys.find(key => key.startsWith('__reactProps$'))]
  if (!props) return null
  if (fiber?.memoizedProps !== props) fiber = fiber?.alternate
  return fiber?.memoizedProps === props ? fiber : null
}

export function nativeDraftWorkspaceAction(sidebar) {
  for (let node = committedFiber(sidebar); node; node = node.return) {
    const props = node.memoizedProps
    if (typeof props?.onNewSessionInWorkspace === 'function' && typeof props.onNewSessionSplit === 'function') {
      return props.onNewSessionInWorkspace
    }
  }
  return null
}

export function nativeWorktreePath(button) {
  for (let node = committedFiber(button); node; node = node.return) {
    if (typeof node.memoizedProps?.repoPath === 'string') return node.memoizedProps.repoPath
  }
  return ''
}

function groupingAction(element) {
  if (Array.isArray(element)) {
    for (const child of element) {
      const action = groupingAction(child)
      if (action) return action
    }
    return null
  }
  if (!isValidElement(element)) return null
  const { children, onValueChange } = element.props
  if (typeof onValueChange === 'function' && Array.isArray(children) &&
      children.some(option => option?.props?.option?.id === 'project')) return onValueChange
  return groupingAction(children)
}

export function projectGroupingAction(trigger) {
  // The closed native filter menu already owns the grouping callback in its
  // children. Reuse it so the action follows the current profile scope.
  for (let node = committedFiber(trigger); node; node = node.return) {
    const props = node.memoizedProps
    if (props?.['data-slot'] === 'dropdown-menu') return groupingAction(props.children)
  }
  return null
}

function readNativeList(tree) {
  if (!version.startsWith('19.') || !tree?.matches('[data-sessions-mode="projects"], [data-sessions-mode="flat"]')) return null
  for (const group of tree.querySelectorAll(':scope > [data-slot="sidebar-group"]')) {
    // Read the mounted section's props, including when React committed its
    // alternate. Hermes does not export the session list or its actions in the SDK.
    const fiber = committedFiber(group)
    if (!fiber) continue
    for (let node = fiber.return; node; node = node.return) {
      const props = node.memoizedProps
      if (typeof node.type !== 'function' || props?.pinned !== false ||
          typeof props.onEnterProject !== 'function' || !Array.isArray(props.sessions) ||
          !sectionActions.every(name => typeof props[name] === 'function')) continue
      let sidebar = node.return
      while (sidebar && typeof sidebar.memoizedProps?.onRetrySessions !== 'function') sidebar = sidebar.return
      return {
        group,
        fiber: node,
        section: node.type,
        props,
        refresh: sidebar?.memoizedProps.onRetrySessions,
        manageCronJob: sidebar?.memoizedProps.onManageCronJob,
      }
    }
  }
  return null
}

const dotStates = new Set(['background', 'draft', 'idle', 'needs-input', 'stalled', 'unread', 'working'])

export function nativeProjectActivity(tree) {
  const source = readNativeList(tree)
  const activity = new Map()
  if (!source?.props.projectOverview?.length) return activity

  // The sidebar's native status snapshot resolves runtime ids to stored ids,
  // including compression aliases. Read the external-store hook by shape.
  let states
  for (let hook = source.fiber.memoizedState; hook; hook = hook.next) {
    if (typeof hook.queue?.getSnapshot !== 'function') continue
    const value = hook.queue.getSnapshot()
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) continue
    const statuses = Object.values(value)
    if (!statuses.length || !statuses.every(status => dotStates.has(status))) continue
    if (states) return activity
    states = value
  }
  if (!states) return activity

  const liveId = id => states[id] === 'working' || states[id] === 'stalled'
  const unreadId = id => states[id] === 'unread'
  if (!Object.keys(states).some(id => liveId(id) || unreadId(id))) return activity
  const { projectOverview, projectOverviewPreviews } = source.props
  const hasStatus = (project, matches) => {
    const sessionMatches = session => matches(session.id)
    return project.sessionIds?.some(matches) ||
        projectOverviewPreviews?.[project.id]?.some(sessionMatches) ||
        (!project.sessionIds && (
          project.previewSessions?.some(sessionMatches) ||
          project.repos.some(repo => repo.groups.some(group => group.sessions.some(sessionMatches)))
        ))
  }
  for (const project of projectOverview) {
    if (hasStatus(project, liveId)) activity.set(project.id, 'working')
    else if (hasStatus(project, unreadId)) activity.set(project.id, 'unread')
  }
  return activity
}

export function manageSidebarCronJob(tree, id) {
  const action = readNativeList(tree)?.manageCronJob
  if (typeof action !== 'function') return false
  action(id)
  return true
}

export function createRecentRows() {
  let snapshot = null
  const subscribers = new Set()
  function set(value) {
    snapshot = value
    for (const notify of subscribers) notify()
  }
  return {
    get: () => snapshot,
    subscribe(notify) {
      subscribers.add(notify)
      return () => subscribers.delete(notify)
    },
    update(tree, container, empty) {
      const source = readNativeList(tree)
      const flat = tree?.dataset.sessionsMode === 'flat'
      // Date buckets can be collapsed in Hermes settings. Render the same
      // native list without buckets so those chats remain reachable.
      if (!source || (flat && (source.props.grouping !== 'date' || source.props.groups?.length))) return null
      if (snapshot?.container !== container || snapshot?.props !== source.props ||
          snapshot?.group !== source.group || snapshot?.empty !== empty) {
        set({ ...source, container, empty, flat })
      }
      return source.group
    },
    clear(container) {
      if (snapshot?.container === container) set(null)
    },
  }
}

export function NativeRecentRows({ rows }) {
  const snapshot = useSyncExternalStore(rows.subscribe, rows.get)
  if (!snapshot) return null
  const { section, props, container, empty, flat } = snapshot
  const sessions = props.sessions
  const children = h(section, flat ? {
    ...props,
    grouping: 'none',
    showProfileTags: new Set(sessions.map(session => session.profile)).size > 1,
  } : {
    label: '',
    open: true,
    collapsible: false,
    pinned: false,
    preserveOrder: true,
    sessions,
    contentClassName: 'hcv-recent-scroll',
    card: props.card,
    forceEmptyState: props.forceEmptyState,
    activeSessionId: props.activeSessionId,
    showProfileTags: new Set(sessions.map(session => session.profile)).size > 1,
    onResumeSession: props.onResumeSession,
    onArchiveSession: props.onArchiveSession,
    onDeleteSession: props.onDeleteSession,
    onBranchSession: props.onBranchSession,
    onTogglePin: props.onTogglePin,
    onToggleUnread: props.onToggleUnread,
    emptyState: props.forceEmptyState ? props.emptyState : h('div', { 'data-hcv-recent-empty': '' }, empty),
  })
  // The loader exposes React without react-dom. This is the React 19 portal
  // record, so the native rows keep their router, locale, and theme providers.
  return { $$typeof: Symbol.for('react.portal'), key: null, children, containerInfo: container, implementation: null }
}
