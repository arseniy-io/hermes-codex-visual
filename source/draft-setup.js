import { host } from '@hermes/plugin-sdk'
import { codexIconStyle, codexMask } from './codex-reference.js'
import { nativeDraftWorkspaceAction, nativeWorktreePath } from './sidebar-recents.js'

const primary = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [inert] *)'
const formSelector = 'form[data-slot="composer-root"]:not([data-popped-out])'
const sidebarSelector = '[data-slot="sidebar"][data-tour="sessions-sidebar"]'
const nativeDevice = '[data-slot="statusbar"] [data-slot="connection-switcher"] button[aria-haspopup="menu"]'
const toolbar = '[data-hcv-draft-bar]'
const settingsRoute = '/settings?tab=connections'
const menuWidths = { projects: 260, device: 280, git: 260 }
// Codex's 13px inset starts at the painted surface, inside Hermes's 5px grab margin.
const toolbarInset = 13 + 5

const copy = {
  ru: {
    bar: 'Параметры нового чата', projects: 'Выбрать проект', search: 'Поиск проектов',
    create: 'Новый проект', none: 'Работать без проекта', noProject: 'Без проекта',
    loading: 'Загрузка…', empty: 'Проекты не найдены', projectError: 'Не удалось загрузить проекты',
    actionsError: 'Действие пока недоступно. Откройте панель сеансов.',
    device: 'Этот компьютер', location: 'Работать в', manage: 'Управлять шлюзами…',
    configure: 'Настроить локальную среду', worktree: 'Новое рабочее дерево', nativeWorktree: 'Новый worktree',
    branchError: 'Не удалось открыть ветки', switchError: 'Не удалось переключить ветку',
    branch: 'Ветка', noBranch: 'Нет ветки', environment: 'Среда', noEnvironment: 'Нет окружения',
  },
  en: {
    bar: 'New chat setup', projects: 'Choose a project', search: 'Search projects',
    create: 'New project', none: 'Work without a project', noProject: 'No project',
    loading: 'Loading…', empty: 'No matching projects', projectError: 'Could not load projects',
    actionsError: 'This action is unavailable. Open the sessions sidebar.',
    device: 'This computer', location: 'Work in', manage: 'Manage gateways…',
    configure: 'Configure local environment', worktree: 'New worktree', nativeWorktree: 'New worktree',
    branchError: 'Could not load branches', switchError: 'Could not switch branches',
    branch: 'Branch', noBranch: 'No branch', environment: 'Environment', noEnvironment: 'No environment',
  },
}
const labels = () => copy[document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru' : 'en']

function node(tag, attrs = {}, text = '') {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value)
  if (text) element.textContent = text
  return element
}

function icon(glyph) {
  const element = node('span', { 'data-hcv-draft-icon': glyph, 'aria-hidden': 'true' })
  Object.assign(element.style, codexIconStyle(glyph))
  return element
}

function button(glyph, name, action) {
  const element = node('button', { type: 'button', 'data-hcv-draft-button': '' })
  const label = node('span', { 'data-hcv-draft-label': '' }, name)
  element.append(icon(glyph), label)
  if (action) element.addEventListener('click', action)
  return { element, label, glyph: (name) => element.firstElementChild.replaceWith(icon(name)) }
}

function panel(kind) {
  return node('div', { popover: 'auto', 'data-hcv-draft-menu': kind })
}

function position(popup, anchor, end = false) {
  const target = popup.closest('[data-radix-popper-content-wrapper]') || popup
  const rect = anchor.getBoundingClientRect()
  const kind = popup.dataset.hcvDraftMenu || popup.dataset.hcvDraftNativeMenu
  const width = Math.min(menuWidths[kind], window.innerWidth - 16)
  const top = rect.top - (kind === 'git' ? 5 : 4)
  const left = Math.max(8, Math.min(end ? rect.right - width : rect.left, window.innerWidth - width - 8))
  target.style.setProperty('--hcv-draft-left', left + 'px')
  target.style.setProperty('--hcv-draft-bottom', (window.innerHeight - top) + 'px')
  target.style.setProperty('--hcv-draft-max-height', Math.max(80, top - 8) + 'px')
}

function startNativeMenu(source, anchor, decorate) {
  if (!source || source.disabled) return null
  const cleanup = () => {
    if (!menu) return
    const wrapper = menu.closest('[data-radix-popper-content-wrapper]')
    menu.removeAttribute('data-hcv-draft-native-menu')
    title?.remove()
    for (const item of menu.querySelectorAll('[data-hcv-device-label]')) item.removeAttribute('data-hcv-device-label')
    for (const property of ['--hcv-draft-left', '--hcv-draft-bottom', '--hcv-draft-max-height']) {
      wrapper?.style.removeProperty(property)
    }
  }
  let menu
  let title
  let frames = 0
  let frame = 0
  let stopped = false
  const observer = new MutationObserver(queue)
  const dispose = (close = false) => {
    if (stopped) return
    stopped = true
    observer.disconnect()
    window.removeEventListener('resize', queue)
    cancelAnimationFrame(frame)
    cleanup()
    anchor.removeAttribute('data-hcv-native-open')
    anchor.setAttribute('aria-expanded', 'false')
    if (close && menu?.dataset.state === 'open') {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }
  }
  function update() {
    frame = 0
    if (!anchor.isConnected || !source.isConnected) return dispose(true)
    if (menu && (!menu.isConnected || menu.dataset.state !== 'open')) {
      if (document.activeElement === source) anchor.focus({ preventScroll: true })
      return dispose()
    }
    if (!menu) {
      const id = source.getAttribute('aria-controls')
      menu = id && document.getElementById(id)
      if (!menu) {
        if (frames++ < 8) queue()
        else dispose()
        return
      }
      menu.setAttribute('data-hcv-draft-native-menu', 'device')
      title = node('div', { 'data-hcv-draft-menu-heading': '' }, labels().location)
      menu.prepend(title)
      decorate?.(menu)
    }
    position(menu, anchor)
  }
  function queue() {
    if (!frame && !stopped) frame = requestAnimationFrame(update)
  }
  anchor.setAttribute('data-hcv-native-open', '')
  anchor.setAttribute('aria-expanded', 'true')
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
  window.addEventListener('resize', queue)
  source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  queue()
  return dispose
}

function normalized(path) {
  const clean = (path || '').replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[A-Z]:/i.test(clean) ? clean.toLowerCase() : clean
}

function newDraftBar(form, current, localEnvironment) {
  const strip = node('div', { 'data-hcv-draft-bar': '', role: 'group', 'aria-label': labels().bar })
  const projectMenu = panel('projects')
  const localMenu = panel('device')
  const gearMenu = panel('git')
  let connection
  let dataScope
  let worktree = { label: '', branch: '' }
  let version = 0
  let bridge
  let disposed = false
  const scope = () => JSON.stringify([host.state.connectionId.get(), host.state.profile.get()])
  const activeHere = (key) => !disposed && current() && key === scope()
  const canRequest = () => host.state.gateway.get() === 'open'
  const request = (method, params) => host.request(method, { ...params, profile: host.state.profile.get() }, 5000)
  const error = () => host.notify({ kind: 'error', message: labels().actionsError })

  const projects = button('folder', labels().noProject)
  const device = button('laptop', labels().device)
  const gear = button('settings', '')
  const search = node('input', { type: 'search', autofocus: '', 'data-hcv-draft-search': '' })
  const results = node('div', { 'data-hcv-draft-projects': '' })
  const create = button('plus', labels().create, () => void createProject())
  const noProject = button('close', labels().none, () => void selectProject(null))
  const projectFooter = node('div', { 'data-hcv-draft-menu-footer': '' })
  projectFooter.append(create.element, noProject.element)
  const searchRow = node('label', { 'data-hcv-draft-search-row': '' })
  searchRow.append(icon('search'), search)
  projectMenu.append(searchRow, results, projectFooter)

  function bind(opener, popup, end = false) {
    opener.popoverTargetElement = popup
    opener.setAttribute('aria-haspopup', 'dialog')
    popup.setAttribute('role', 'dialog')
    popup.addEventListener('beforetoggle', (event) => {
      if (event.newState === 'open') position(popup, opener, end)
    })
    popup.addEventListener('toggle', (event) => {
      opener.setAttribute('aria-expanded', String(event.newState === 'open'))
      if (event.newState === 'open') position(popup, opener, end)
    })
    popup.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
      // The native search field would consume Escape to clear a nonempty query.
      event.preventDefault()
      event.stopPropagation()
      popup.hidePopover()
      opener.focus({ preventScroll: true })
    })
    opener.setAttribute('aria-expanded', 'false')
  }
  bind(projects.element, projectMenu)
  bind(gear.element, gearMenu, true)
  bind(device.element, localMenu)

  device.element.addEventListener('click', (event) => {
    const source = document.querySelector(nativeDevice)
    if (!source) {
      device.element.setAttribute('aria-haspopup', 'dialog')
      return
    }
    event.preventDefault()
    bridge?.(true)
    device.element.setAttribute('aria-haspopup', 'menu')
    bridge = startNativeMenu(source, device.element, (menu) => {
      for (const glyph of menu.querySelectorAll('[data-slot="connection-glyph"][data-connection-kind="local"]')) {
        const title = glyph.nextElementSibling
        title?.setAttribute('data-hcv-device-label', labels().device)
      }
    })
  })
  const manage = button('settings', labels().manage, () => {
    localMenu.hidePopover()
    host.navigate(settingsRoute)
  })
  const localHeading = node('div', { 'data-hcv-draft-menu-heading': '' })
  const selectedLocal = button('laptop', labels().device, () => localMenu.hidePopover())
  selectedLocal.element.append(icon('check'))
  localMenu.append(localHeading, selectedLocal.element, manage.element)

  const gitHeading = node('div', { 'data-hcv-draft-menu-heading': '' })
  const localGit = () => host.state.connectionId.get() === 'local' && worktree.branch && window.hermesDesktop?.git
  const worktreeTrigger = () => {
    const label = CSS.escape(labels().nativeWorktree)
    const cwd = normalized(host.state.cwd.get())
    return [...document.querySelectorAll(sidebarSelector + ' button[aria-label="' + label + '"]:has(> .codicon-git-branch)')]
      .find(button => normalized(nativeWorktreePath(button)) === cwd)
  }
  const newWorktree = button('worktree', labels().worktree, async () => {
    if (!localGit()) return
    const key = scope()
    const cwd = host.state.cwd.get()
    const ready = () => activeHere(key) && cwd === host.state.cwd.get()
    gearMenu.hidePopover()
    const trigger = worktreeTrigger()
    if (trigger) return trigger.click()
    if (!worktree.projectId) return error()
    const sidebar = await sidebarFor(sidebarSelector, key)
    if (!sidebar || !ready()) return
    sidebar.querySelector('[data-hcv-show-projects]')?.click()
    sidebar.querySelector('[data-sessions-mode="project"] button[class~="group/back"]')?.click()
    const projectRow = sidebarSelector + ' [data-sessions-project="' + CSS.escape(worktree.projectId) + '"] [data-hcv-native-project-action][data-slot="row-button"]'
    const projectButton = await sidebarFor(projectRow, key)
    if (!ready()) return
    if (!projectButton) return error()
    // Use the mounted native action before the sidebar folds the project view back into the tree.
    const opened = await new Promise(resolve => {
      const done = result => {
        observer.disconnect()
        clearTimeout(timeout)
        resolve(result)
      }
      const open = () => {
        if (!ready()) return done(false)
        const action = worktreeTrigger()
        if (!action) return
        done(true)
        action.click()
      }
      const observer = new MutationObserver(open)
      const timeout = setTimeout(() => done(false), 1000)
      observer.observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sessions-mode'] })
      projectButton.click()
      open()
    })
    if (!opened && ready()) error()
  })
  newWorktree.element.append(node('span', { 'data-hcv-draft-detail': '' }), icon('right'))
  const branch = button('branch', labels().branch, () => void chooseBranch())
  const branchValue = node('span', { 'data-hcv-draft-detail': '' })
  branch.element.append(branchValue, icon('right'))
  const environment = button('settings', labels().environment, () => {
    const cwd = host.state.cwd.get()
    gearMenu.hidePopover()
    void localEnvironment?.open({ cwd, projectName: worktree.label, trigger: gear.element })
  })
  environment.element.disabled = true
  const envValue = node('span', { 'data-hcv-draft-detail': '' })
  environment.element.append(envValue, icon('right'))
  const gitOptions = node('div', { 'data-hcv-draft-branches': '' })
  const gitSetup = node('div', { 'data-hcv-draft-git-setup': '' })
  gitSetup.append(newWorktree.element, branch.element, environment.element)
  gearMenu.append(gitHeading, gitSetup, gitOptions)
  gearMenu.addEventListener('beforetoggle', (event) => {
    if (event.newState !== 'open') return
    newWorktree.element.disabled = !localGit() || !(worktreeTrigger() || worktree.projectId)
    branch.element.disabled = !localGit()
    const cwd = host.state.cwd.get()
    const key = scope()
    environment.element.disabled = !localEnvironment || host.state.connectionId.get() !== 'local' || !cwd
    envValue.textContent = labels().noEnvironment
    if (!environment.element.disabled) void localEnvironment.name(cwd).then(name => {
      if (activeHere(key) && cwd === host.state.cwd.get() && gearMenu.matches(':popover-open')) {
        envValue.textContent = name || labels().noEnvironment
      }
    })
    branchValue.textContent = worktree.branch || labels().noBranch
    gitHeading.textContent = labels().configure
    gitSetup.hidden = false
    gitOptions.replaceChildren()
  })
  async function chooseBranch() {
    const git = localGit()
    const cwd = host.state.cwd.get()
    const key = scope()
    if (!git || !cwd) return
    gitSetup.hidden = true
    gitHeading.textContent = labels().branch
    gitOptions.replaceChildren(node('p', { role: 'status' }, labels().loading))
    const ready = () => activeHere(key) && cwd === host.state.cwd.get() && gearMenu.matches(':popover-open')
    const branches = await git.branchList(cwd).catch(() => null)
    if (!ready()) return
    const localBranches = branches?.filter(row => !row.isRemote && row.name) || []
    if (!localBranches.length) {
      gitOptions.replaceChildren(node('p', { role: 'status' }, labels().branchError))
      return
    }
    gitOptions.replaceChildren(...localBranches.map(({ name }) => {
      const row = button('branch', name, async () => {
        if (!ready()) return
        gearMenu.hidePopover()
        if (name === worktree.branch) return
        try {
          const result = await git.branchSwitch(cwd, name)
          if (activeHere(key) && cwd === host.state.cwd.get()) {
            worktree.branch = result.branch
            localize()
            void refresh()
          }
        } catch {
          host.notify({ kind: 'error', message: labels().switchError })
        }
      }).element
      if (name === worktree.branch) {
        row.setAttribute('aria-current', 'true')
        row.append(icon('check'))
      }
      return row
    }))
    gitOptions.querySelector('[aria-current="true"], button')?.focus()
  }

  let catalog
  function renderProjects() {
    const text = search.value.trim().toLowerCase()
    const cwd = normalized(host.state.cwd.get())
    const list = catalog?.filter(({ label, path }) => (label + ' ' + path).toLowerCase().includes(text)) || []
    if (!list.length) {
      const message = catalog === null ? labels().projectError : catalog ? labels().empty : labels().loading
      results.replaceChildren(node('p', { role: 'status' }, message))
      return
    }
    results.replaceChildren(...list.map(({ label, path }) => {
      const row = button('folder', label, () => void selectProject(path)).element
      row.title = path
      if (cwd && (cwd === normalized(path) || cwd.startsWith(normalized(path) + '/'))) {
        row.setAttribute('aria-current', 'true')
        row.append(icon('check'))
      }
      return row
    }))
  }

  projectMenu.addEventListener('toggle', async (event) => {
    if (event.newState !== 'open') return
    const key = scope()
    const requestId = ++version
    catalog = undefined
    search.value = ''
    search.focus()
    renderProjects()
    try {
      if (!canRequest()) throw new Error('Gateway unavailable')
      const reply = await request('projects.tree', { preview_limit: 1 })
      if (!activeHere(key) || requestId !== version || !projectMenu.matches(':popover-open')) return
      catalog = (reply.projects || []).filter(row => !row.isNoProject && row.label)
        .map(row => ({ label: row.label, path: row.path || row.repos?.find(repo => repo.path)?.path }))
        .filter(row => typeof row.path === 'string' && row.path.trim())
    } catch {
      if (!activeHere(key) || requestId !== version) return
      catalog = null
    }
    renderProjects()
  })
  search.addEventListener('input', renderProjects)
  projectMenu.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
    const options = [...results.querySelectorAll('button')]
    if (!options.length) return
    event.preventDefault()
    const index = options.indexOf(document.activeElement)
    const target = index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
      : index + (event.key === 'ArrowDown' ? 1 : -1)
    if (target < 0) search.focus()
    else options[Math.min(target, options.length - 1)].focus()
  })

  async function sidebarFor(selector, key) {
    let found = document.querySelector(selector)
    if (found) return found
    host.revealPane('sessions')
    for (let i = 0; i < 10 && activeHere(key); i++) {
      await new Promise(requestAnimationFrame)
      found = document.querySelector(selector)
      if (found) return found
    }
    return null
  }

  async function selectProject(path) {
    const key = scope()
    projectMenu.hidePopover()
    if (normalized(path) === normalized(host.state.cwd.get())) return
    const draft = await host.composer.getDraft(null).catch(() => null)
    const sidebar = await sidebarFor(sidebarSelector, key)
    const openDraft = nativeDraftWorkspaceAction(sidebar)
    if (!activeHere(key)) return
    if (!openDraft) return error()
    openDraft(path)
    // The native fresh-draft action may re-key the composer after choosing a
    // directory. Restore typed text only if its new draft is still empty.
    if (draft) {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const next = await host.composer.getDraft(null).catch(() => null)
      if (!next && !host.state.focusedStoredSessionId.get() && !host.state.busy.get() && key === scope()) {
        await host.composer.setDraft(null, draft).catch(() => {})
      }
    }
  }

  async function createProject() {
    const key = scope()
    projectMenu.hidePopover()
    const sidebar = await sidebarFor(sidebarSelector, key)
    if (!sidebar || !activeHere(key)) return
    sidebar.querySelector('[data-hcv-show-projects]')?.click()
    sidebar.querySelector('[data-sessions-mode="project"] button[class~="group/back"]')?.click()
    const create = await sidebarFor(sidebarSelector + ' [data-hcv-projects-actions] button:has(> .codicon-add)', key)
    if (activeHere(key)) {
      if (create) create.click()
      else error()
    }
  }

  function localize() {
    const t = labels()
    strip.setAttribute('aria-label', t.bar)
    projects.element.setAttribute('aria-label', t.projects)
    projectMenu.setAttribute('aria-label', t.projects)
    device.element.setAttribute('aria-label', t.location)
    localMenu.setAttribute('aria-label', t.location)
    gear.element.setAttribute('aria-label', t.configure)
    gear.element.title = t.configure
    gearMenu.setAttribute('aria-label', t.configure)
    search.setAttribute('aria-label', t.search)
    search.placeholder = t.search
    localHeading.textContent = t.location
    gitHeading.textContent = t.configure
    create.label.textContent = t.create
    noProject.label.textContent = t.none
    selectedLocal.label.textContent = t.device
    manage.label.textContent = t.manage
    newWorktree.label.textContent = t.worktree
    branch.label.textContent = t.branch
    branchValue.textContent = worktree.branch || t.noBranch
    environment.label.textContent = t.environment
    envValue.textContent = t.noEnvironment
    projects.label.textContent = worktree.label || t.noProject
    device.label.textContent = connection?.kind === 'local' || !connection ? t.device : connection.label
  }

  let refreshId = 0
  async function refresh() {
    const key = scope()
    const id = ++refreshId
    const cwd = host.state.cwd.get()
    if (key !== dataScope) {
      dataScope = key
      worktree = { label: '', branch: '' }
      const active = host.state.connectionId.get()
      connection = active && active !== 'local' ? { kind: 'remote', label: '…' } : null
      for (const menu of [projectMenu, localMenu, gearMenu]) menu.hidePopover()
    }
    localize()
    const active = host.state.connectionId.get()
    const [devices, info] = await Promise.all([
      host.connections().catch(() => []),
      cwd && canRequest() ? request('projects.for_cwd', { cwd }).catch(() => null) : null,
    ])
    if (!activeHere(key) || id !== refreshId) return
    connection = devices.find(row => row.id === active) || connection
    worktree = {
      label: info?.project?.name || cwd.split(/[/\\]/).filter(Boolean).at(-1) || '',
      branch: info?.branch || '',
      projectId: info?.project?.id,
    }
    device.glyph(connection?.kind === 'local' || !connection ? 'laptop' : 'cloud')
    localize()
  }

  strip.append(projects.element, projectMenu, device.element, localMenu, gear.element, gearMenu)
  form.before(strip)
  const unbind = [host.state.connectionId, host.state.profile, host.state.gateway, host.state.cwd]
    .map(store => store.listen(refresh))
  const resize = () => {
    for (const [popup, control, end] of [[projectMenu, projects, false], [localMenu, device, false], [gearMenu, gear, true]]) {
      if (popup.matches(':popover-open')) position(popup, control.element, end)
    }
  }
  window.addEventListener('resize', resize)
  window.addEventListener('focus', refresh)
  void refresh()
  return {
    localize,
    dispose() {
      disposed = true
      for (const off of unbind) off()
      window.removeEventListener('resize', resize)
      window.removeEventListener('focus', refresh)
      bridge?.(true)
      strip.remove()
    },
  }
}

function styles(active) {
  const draft = active + ' ' + toolbar
  const menu = active + ' [data-hcv-draft-menu]'
  const native = active + ' [data-hcv-draft-native-menu]'
  const popper = active + ' [data-radix-popper-content-wrapper]:has(> [data-hcv-draft-native-menu])'
  const control = '[data-hcv-draft-button]'
  const label = '[data-hcv-draft-label]'
  const glyph = '[data-hcv-draft-icon]'
  return [
    '@media (forced-colors: none) {',
    draft + ' { position: relative; z-index: 1; display: flex; align-items: center; min-inline-size: 0; min-block-size: 40px; margin: 0 ' + toolbarInset + 'px -4px; padding: 6px 8px; border-radius: 20px 20px 0 0; background: var(--hcv-hover); color: var(--hcv-text); font: 12px/18px var(--hcv-ui-font); }',
    draft + ' + ' + formSelector + ' { z-index: 2; }',
    draft + ' ' + control + ' { display: flex; min-inline-size: 0; min-block-size: 28px; align-items: center; gap: 6px; padding: 0 8px; border-radius: 999px; text-align: start; cursor: pointer; -webkit-app-region: no-drag; }',
    draft + ' > ' + control + ':last-of-type { flex: none; justify-content: center; margin-inline-start: auto; inline-size: 28px; padding: 0; color: var(--hcv-muted); }',
    draft + ' ' + label + ' { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
    draft + ' ' + label + ':empty { display: none; }',
    draft + ' ' + glyph + ' { display: inline-block; flex: none; inline-size: 16px; block-size: 16px; }',
    draft + ' > ' + control + ':is(:hover, [aria-expanded="true"]) { background: var(--hcv-composer); }',
    draft + ' > ' + control + ':focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }',
    menu + ', ' + native + ' { box-sizing: border-box; min-inline-size: 0; max-block-size: var(--hcv-draft-max-height, 60vh); overflow: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid transparent; border-radius: 16px; background: var(--hcv-menu); box-shadow: 0 0 0 .5px var(--hcv-hairline), 0 8px 16px -4px #0000001f; color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }',
    ...Object.entries(menuWidths).map(([kind, width]) =>
      menu + '[data-hcv-draft-menu="' + kind + '"]' + (kind === 'device' ? ', ' + native : '') +
      ' { inline-size: min(' + width + 'px, calc(100vw - 16px)); }'),
    menu + '[data-hcv-draft-menu="git"] { padding: 8px; }',
    menu + ', ' + popper + ' { position: fixed !important; inset: auto auto var(--hcv-draft-bottom, 40px) var(--hcv-draft-left, 8px) !important; transform: none !important; margin: 0; }',
    menu + ' ' + control + ', ' + native + ' [role^="menuitem"] { inline-size: 100%; justify-content: flex-start; border-radius: 11px; min-block-size: 28px; }',
    menu + ' ' + control + ':disabled { color: var(--hcv-muted); opacity: .55; cursor: default; background: transparent; }',
    menu + ' ' + control + ' > ' + glyph + '[data-hcv-draft-icon="check"] { margin-inline-start: auto; }',
    active + ' [data-hcv-draft-menu-heading] { min-block-size: 28px; display: flex; align-items: center; padding-inline: 8px; color: var(--hcv-muted); }',
    draft + ' [data-hcv-draft-detail] { margin-inline-start: auto; color: var(--hcv-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    draft + ' [data-hcv-draft-search-row] { display: flex; min-block-size: 36px; margin-inline: 4px; padding-inline: 3px; gap: 6px; align-items: center; color: var(--hcv-muted); border-block-end: 1px solid var(--hcv-hairline); }',
    draft + ' [data-hcv-draft-search-row]:focus-within { color: var(--hcv-text); background: color-mix(in srgb, var(--hcv-text) 3%, transparent); }',
    draft + ' [data-hcv-draft-search] { inline-size: 100%; min-inline-size: 0; min-block-size: 30px; background: transparent; color: var(--hcv-text); outline: none; }',
    draft + ' [data-hcv-draft-projects] { max-block-size: min(40vh, 230px); overflow-y: auto; overscroll-behavior: contain; padding-block: 4px; }',
    draft + ' :is([data-hcv-draft-projects], [data-hcv-draft-branches]) p { margin: 0; padding: 7px; color: var(--hcv-muted); }',
    draft + ' [data-hcv-draft-menu-footer] { border-block-start: 1px solid var(--hcv-stroke); padding-block-start: 4px; }',
    native + ' [role^="menuitem"] { padding: 0 8px; }',
    native + ' [role^="menuitem"] > span:first-child { gap: 6px; }',
    native + ' [data-slot="dropdown-menu-separator"] { margin-inline: 8px; }',
    native + ' [data-slot="connection-glyph"] { flex: none; width: 16px; height: 16px; background: currentColor; mask: ' + codexMask('cloud') + ' center / contain no-repeat; }',
    native + ' [data-connection-kind="local"] { mask-image: ' + codexMask('laptop') + '; }',
    native + ' [data-slot="connection-glyph"] > svg { display: none; }',
    native + ' [role^="menuitem"] :is(.codicon-settings-gear, .codicon-check) { flex: none; width: 16px; height: 16px; background: currentColor; }',
    native + ' .codicon-settings-gear { mask: ' + codexMask('settings') + ' center / contain no-repeat; }',
    native + ' .codicon-check { mask: ' + codexMask('check') + ' center / contain no-repeat; }',
    native + ' [role^="menuitem"] :is(.codicon-settings-gear, .codicon-check)::before { content: none; }',
    native + ' [data-hcv-device-label] { font-size: 0; }',
    native + ' [data-hcv-device-label]::after { content: attr(data-hcv-device-label); font-size: 13px; }',
    '}',
  ].join('\n')
}

export function registerDraftSetup(ctx, active, localEnvironment) {
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const sheet = node('style', { 'data-hcv-draft-setup-style': '' })
  sheet.textContent = styles(active)
  document.head.append(sheet)
  let form
  let bar
  let frame = 0
  const target = () => {
    if (!contrast.matches || !root.matches(active) || host.state.focusedStoredSessionId.get() ||
      host.state.activeSessionId.get() || host.state.busy.get()) return null
    const chat = document.querySelector(primary)
    const transcript = chat?.querySelector('[data-slot="aui_thread-content"]')
    if (!transcript || transcript.querySelector('[data-slot="aui_message-group"]')) return null
    return chat.querySelector(formSelector)
  }
  const update = () => {
    frame = 0
    const next = target()
    if (next === form) return
    bar?.dispose()
    form = next
    bar = form ? newDraftBar(form, () => target() === form, localEnvironment) : null
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update) }
  const observer = new MutationObserver(records => {
    const selector = [primary, formSelector, '[data-slot="aui_thread-content"]', '[data-slot="aui_message-group"]'].join(', ')
    if (records.some(({ target, addedNodes, removedNodes }) => target === root ||
      [...addedNodes, ...removedNodes].some(node => node instanceof Element &&
        (node.matches(selector) || node.querySelector(selector))))) queue()
  })
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'data-popped-out'],
  })
  contrast.addEventListener('change', queue)
  const off = [host.state.focusedStoredSessionId, host.state.activeSessionId, host.state.busy].map(store => store.subscribe(queue))
  ctx.i18n.onLocaleChange(() => bar?.localize())
  ctx.onDispose(() => {
    observer.disconnect()
    contrast.removeEventListener('change', queue)
    for (const unsubscribe of off) unsubscribe()
    cancelAnimationFrame(frame)
    bar?.dispose()
    sheet.remove()
  })
  queue()
}
