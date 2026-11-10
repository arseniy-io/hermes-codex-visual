import { host, translateNow } from '@hermes/plugin-sdk'
import { codexIconRules, codexIconStyle, codexReference as codex } from './codex-reference.js'
import { disclosure } from './sidebar-projects.js'
import { manageSidebarCronJob } from './sidebar-recents.js'

const projects = '[data-sessions-mode="projects"]'
const nativeSection = '[data-hcv-cron-native]'
const nativeRows = '[class~="group/cron"]'
const nativeRowToggle = '> button[aria-expanded]'
const motion = { ...codex.disclosure, heightTime: 220, enterTime: 170, enterDelay: 0, exitTime: 120 }

function element(tag, attrs = {}, value) {
  const node = document.createElement(tag)
  for (const [name, attr] of Object.entries(attrs)) node.setAttribute(name, attr)
  if (value) node.textContent = value
  return node
}

function glyph(name) {
  const node = element('span', { 'aria-hidden': 'true', 'data-hcv-cron-icon': name })
  Object.assign(node.style, codexIconStyle(name))
  return node
}

function nextRun(job) {
  const time = Date.parse(job.next_run_at || '')
  return Number.isFinite(time) ? time : Infinity
}

function attachNativeCron(content) {
  const headings = ':scope > [data-sessions-mode] > [data-slot="sidebar-group"] > [class~="group/section"] > button[class~="group/section-label"]'
  let heading
  let group
  let section
  let nextId = 0
  const rows = new Map()
  function dispose() {
    for (const row of rows.values()) row.dispose()
    rows.clear()
    section?.dispose()
    section = undefined
    group?.removeAttribute('data-hcv-cron-native')
    group = undefined
  }
  return {
    sync() {
      const label = translateNow('sidebar.cronJobs')
      const current = [...content.querySelectorAll(headings)].find(node => node.textContent.trim() === label)
      if (current !== heading) {
        dispose()
        heading = current
        if (heading) {
          group = heading.closest('[data-slot="sidebar-group"]')
          group.setAttribute('data-hcv-cron-native', '')
          section = disclosure(heading, heading, () => group.querySelector(':scope > [data-slot="sidebar-group-content"]'), 'hcv-native-cron-list', motion)
        }
      }
      if (!group) return
      section.sync()
      const visible = new Set(group.querySelectorAll(`${nativeRows} ${nativeRowToggle}`))
      for (const [button, row] of rows) {
        if (visible.has(button)) continue
        row.dispose()
        rows.delete(button)
      }
      for (const button of visible) {
        if (!rows.has(button)) {
          const shell = button.parentElement
          rows.set(button, disclosure(button, button, () => shell.nextElementSibling, `hcv-native-cron-runs-${++nextId}`, motion))
        }
        rows.get(button).sync()
      }
    },
    dispose,
  }
}

export function attachSidebarCron(content, storage) {
  const native = attachNativeCron(content)
  const ru = document.documentElement.matches(':lang(ru)')
  const area = element('section', { 'data-hcv-cron-sidebar': '' })
  const header = element('header')
  const toggle = element('button', { type: 'button', 'aria-controls': 'hcv-cron-sidebar-list' }, ru ? 'Cron-задачи' : 'Cron jobs')
  toggle.append(glyph('right'))
  const all = element('button', { type: 'button', 'data-hcv-cron-manage': '' })
  const allLabel = ru ? 'Открыть запланированные задачи' : 'Open scheduled tasks'
  all.setAttribute('aria-label', allLabel)
  all.title = allLabel
  all.append(glyph('schedule'))
  all.addEventListener('click', () => host.navigate('/cron'))
  header.append(toggle, all)
  const details = element('div', { id: 'hcv-cron-sidebar-list', 'data-hcv-cron-body': '' })
  const list = element('div', { 'data-hcv-cron-list': '' })
  details.append(list)
  area.append(header, details)

  let open = storage.get('cron-preview-open', false) === true
  let generation = 0
  function updateDisclosure() {
    toggle.setAttribute('aria-expanded', String(open))
    details.inert = !open
    area.toggleAttribute('data-hcv-cron-open', open)
  }
  function note(text) {
    list.replaceChildren(element('p', { role: 'status' }, text))
  }
  async function load() {
    if (!open || !area.isConnected) return
    const request = ++generation
    const profile = host.state.profile.get()
    const connectionId = host.state.connectionId.get()
    const isCurrent = () => request === generation && area.isConnected && open &&
      profile === host.state.profile.get() && connectionId === host.state.connectionId.get()
    if (!profile) {
      note(ru ? 'Профиль не выбран' : 'No profile selected')
      return
    }
    note(ru ? 'Загрузка…' : 'Loading…')
    try {
      const path = `/api/cron/jobs?profile=${encodeURIComponent(profile)}`
      const jobs = await window.hermesDesktop.api({ ...(connectionId ? { connectionId } : {}), profile, path, timeoutMs: 8000 })
      if (!isCurrent()) return
      const named = jobs.filter(job => typeof job?.id === 'string' && job.id)
        .map(job => ({ ...job, label: typeof job.name === 'string' && job.name.trim() || job.id }))
      named.sort((a, b) => nextRun(a) - nextRun(b) || a.label.localeCompare(b.label))
      list.replaceChildren()
      for (const job of named.slice(0, 3)) {
        const row = element('button', { type: 'button', title: job.label, 'data-hcv-cron-job': '' })
        row.append(glyph('schedule'), element('span', { 'data-hcv-cron-label': '' }, job.label), glyph('right'))
        row.addEventListener('click', () => {
          if (isCurrent() && !manageSidebarCronJob(content.querySelector(projects), job.id)) host.navigate('/cron')
        })
        list.append(row)
      }
      if (!named.length) note(ru ? 'В этом профиле нет задач' : 'No tasks in this profile')
    } catch {
      if (isCurrent()) note(ru ? 'Не удалось загрузить задачи' : 'Could not load tasks')
    }
  }
  toggle.addEventListener('click', () => {
    open = !open
    storage.set('cron-preview-open', open)
    updateDisclosure()
    if (open) void load()
    else ++generation
  })
  updateDisclosure()
  const stopProfile = host.state.profile.subscribe(load)
  const stopConnection = host.state.connectionId.subscribe(load)
  const stopCron = host.onEvent?.('cron.changed', load)
  return {
    sync() {
      native.sync()
      const tree = content.querySelector(`:scope > ${projects}`)
      if (!tree || !content.querySelector('[data-tour="sidebar-nav-cron"]')) {
        if (area.isConnected) {
          ++generation
          area.remove()
        }
        return
      }
      if (area.previousElementSibling !== tree) {
        tree.after(area)
        void load()
      }
    },
    dispose() {
      ++generation
      native.dispose()
      stopProfile()
      stopConnection()
      stopCron?.()
      area.remove()
    },
  }
}

export function sidebarCronStyles(active) {
  const section = `${active} [data-hcv-cron-sidebar]`
  const stock = `${active} ${nativeSection}`
  const heading = `${stock} > div > button[class~="group/section-label"]`
  const row = `${stock} ${nativeRows}`
  const rowLabel = `${nativeRowToggle} > .truncate`
  const trailing = `${row} > [data-row-actions] > div`
  const rowCaret = `${nativeRowToggle} > .codicon-chevron-right`
  const caret = `${row} ${rowCaret}`
  const run = `${row} + div > button`
  return `
  ${section} { flex: none; padding: 2px 5px 4px; }
  ${section} > header { display: flex; align-items: center; justify-content: space-between; min-block-size: 28px; }
  ${section} button {
    display: flex; align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 26px;
    padding: 0 6px; border-radius: 7px; color: var(--hcv-muted); font: 500 12px/18px var(--hcv-ui-font);
  }
  ${section} button:is(:hover, :focus-visible) { color: var(--hcv-text); background: var(--hcv-hover); }
  ${section} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${section} [data-hcv-cron-icon] { display: block; inline-size: 14px; block-size: 14px; flex: none; }
  ${section} [aria-expanded="true"] > [data-hcv-cron-icon] { rotate: 90deg; }
  ${section} [data-hcv-cron-manage] { inline-size: 26px; padding: 0; justify-content: center; }
  ${section} [data-hcv-cron-body] { display: grid; grid-template-rows: 0fr; opacity: 0; }
  ${section}[data-hcv-cron-open] [data-hcv-cron-body] { grid-template-rows: 1fr; opacity: 1; }
  ${section} [data-hcv-cron-list] { min-block-size: 0; overflow: hidden; }
  ${section} [data-hcv-cron-job] { inline-size: 100%; text-align: start; padding-inline: 8px; }
  ${section} [data-hcv-cron-label] { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${section} [data-hcv-cron-job] > [data-hcv-cron-icon="right"] { opacity: 0; }
  ${section} [data-hcv-cron-job]:is(:hover, :focus-visible) > [data-hcv-cron-icon="right"] { opacity: 1; }
  ${section} p { margin: 0; padding: 4px 6px; color: var(--hcv-muted); font-size: 12px; }

  ${heading} { min-block-size: 26px; padding-inline: 0 6px; gap: 6px; border-radius: 7px; }
  ${heading}:is(:hover, :focus-visible), ${row}:is(:hover, :focus-within), ${run}:is(:hover, :focus-visible) {
    background-color: var(--hcv-hover);
    color: var(--hcv-text);
  }
  ${row} { border-radius: 8px; }
  ${heading}:is(:hover, :focus-visible) > span, ${row}:is(:hover, :focus-within) ${rowLabel} {
    color: var(--hcv-text);
  }
  ${row} ${nativeRowToggle} { border-radius: inherit; }
  ${row} ${nativeRowToggle}:focus-visible { background-color: transparent; box-shadow: none; }
  ${trailing} { display: grid; align-items: center; }
  ${trailing} > :is(span, div) { grid-area: 1 / 1; justify-self: end; }
  ${trailing} > span { display: inline; }
  ${trailing} > div { display: flex; gap: 2px; opacity: 0; pointer-events: none; }
  ${row}:is(:hover, :focus-within) > [data-row-actions] > div > span { opacity: 0; }
  ${row}:is(:hover, :focus-within) > [data-row-actions] > div > div { opacity: 1; pointer-events: auto; }
  ${trailing} button { inline-size: 24px; block-size: 24px; border-radius: 7px; }
  ${trailing} button:is(:hover, :focus-visible):enabled { color: var(--hcv-text); background-color: var(--hcv-hover); }
  ${stock} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${stock} :is(.codicon-chevron-right, .codicon-zap, .codicon-watch) { inline-size: 14px; block-size: 14px; }
  ${codexIconRules(`${heading} > .codicon-chevron-right, ${caret}`, 'right')}
  ${codexIconRules(`${trailing} .codicon-zap`, 'bolt')}
  ${codexIconRules(`${trailing} .codicon-watch`, 'schedule')}
  ${heading} > .codicon-chevron-right { opacity: 1; }
  ${heading} > .codicon-chevron-right, ${caret} { rotate: 0deg; transform: none; transition: none; }
  ${heading}[aria-expanded="true"] > .codicon-chevron-right,
  ${row} > button[aria-expanded="true"] > .codicon-chevron-right { opacity: 1; rotate: 90deg; }
  ${row}:is(:hover, :focus-within) ${rowCaret} { opacity: 1; }
  @media (any-hover: none) {
    ${trailing} > span { opacity: 0; }
    ${trailing} > div { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${section} [data-hcv-cron-body] { transition: grid-template-rows ${motion.heightTime}ms ${motion.ease}, opacity 150ms ${motion.ease}; }
    ${section} [data-hcv-cron-icon="right"] { transition: rotate 150ms var(--hcv-enter); }
    ${section} button, ${heading}, ${row}, ${trailing} button, ${run} {
      transition: background-color 120ms var(--hcv-ease), color 120ms var(--hcv-ease);
    }
    ${heading} > span, ${row} ${rowLabel} { transition: color 120ms var(--hcv-ease); }
    ${section} [data-hcv-cron-job] > [data-hcv-cron-icon="right"], ${trailing} > :is(span, div) {
      transition: opacity 120ms var(--hcv-ease);
    }
    ${heading} > .codicon-chevron-right, ${caret} { transition: rotate 150ms var(--hcv-enter), opacity 120ms var(--hcv-ease); }
  }
  `
}
