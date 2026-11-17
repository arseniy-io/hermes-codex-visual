import { host } from '@hermes/plugin-sdk'
import { codexMask, codexReference } from './codex-reference.js'
import { chatStyles, mountCSS } from './style-scope.js'
import { memoryProposal, pairedSkillLines, pendingProposals, skillProposal, skillSubject } from './review-proposal-data.js'

const surface = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *)'
const nativeRow = '[data-slot="aui_system-message-root"][data-role="system"]'
const stack = '[data-hcv-proposals]'
const enhanced = '[data-hcv-review-notice]'
const hidden = '[hidden], [data-pane-hidden]'

const copy = {
  ru: {
    skills: 'Предложения по скиллам', memory: 'Предложения для памяти', auto: 'Из авторазбора',
    create: 'Создать скилл', rewrite: 'Переписать скилл', patch: 'Обновить скилл',
    delete: 'Удалить скилл', write: 'Записать файл скилла', remove: 'Удалить файл скилла', change: 'Изменить скилл',
    remember: 'Сохранить в память', profile: 'Профиль пользователя', notes: 'Память Гермеса',
    future: 'Будет учитываться в будущих чатах этого профиля.',
    before: 'Было', after: 'Станет', entry: 'Текущая запись', fragment: 'Заменить фрагмент',
    addNote: 'Новая заметка', removeNote: 'Удалить заметку', skillText: 'Предлагаемая правка',
    inspect: 'Посмотреть правку', hide: 'Свернуть правку', load: 'Открываю предложение…',
    inspectNote: 'Открыть заметку', accept: 'Принять', reject: 'Отклонить',
    saved: 'Предложение принято', rejected: 'Предложение отклонено',
    unavailable: 'Не удалось открыть полный текст. Можно обновить список командой', details: 'Данные Гермеса',
    changed: 'Предложение изменилось. Проверь его перед подтверждением.',
    unconfirmed: 'Результат не подтверждён. Обнови список командой',
  },
  en: {
    skills: 'Skill proposals', memory: 'Memory proposals', auto: 'From background review',
    create: 'Create skill', rewrite: 'Rewrite skill', patch: 'Update skill',
    delete: 'Delete skill', write: 'Write skill file', remove: 'Remove skill file', change: 'Change skill',
    remember: 'Save to memory', profile: 'User profile', notes: 'Hermes memory',
    future: 'This will be used in future chats in this profile.',
    before: 'Before', after: 'After', entry: 'Current entry', fragment: 'Replace passage',
    addNote: 'New note', removeNote: 'Remove note', skillText: 'Proposed change',
    inspect: 'View proposed change', hide: 'Hide change', load: 'Opening proposal…',
    inspectNote: 'Open note', accept: 'Approve', reject: 'Reject',
    saved: 'Proposal approved', rejected: 'Proposal rejected',
    unavailable: 'Could not open the full proposal. Refresh the list with', details: 'Hermes details',
    changed: 'The proposal changed. Review it before approving.',
    unconfirmed: 'The result is unconfirmed. Refresh the list with',
  },
}

function element(tag, part, text) {
  const node = document.createElement(tag)
  if (part) node.dataset.hcvProposalPart = part
  if (text !== undefined) node.textContent = text
  return node
}

function currentScope(row) {
  if (!row.isConnected || !row.closest(surface) || row.closest(hidden)) return null
  const session = host.state.activeSessionId.get()
  const profile = host.state.profile.get() || 'default'
  const connection = host.state.connectionId.get()
  const focused = host.state.focusedSessionId.get()
  const owner = host.state.focusedSessionOwner?.get()
  const socket = host.getGateway()
  if (!session || !socket || (focused && focused !== session)) return null
  if (owner && (owner.profile !== profile || (connection && owner.connectionId !== connection))) return null
  return { session, profile, connection: owner?.connectionId ?? connection, socket }
}

function sameScope(a, b) {
  return Boolean(a && b && a.session === b.session && a.profile === b.profile &&
    a.connection === b.connection && a.socket === b.socket)
}

function normalize(text) { return text.replaceAll('\r\n', '\n').trim() }

async function slash(scope, kind, operation, id) {
  const command = [kind, operation, id].filter(Boolean).join(' ')
  const response = await scope.socket.request('slash.exec', { session_id: scope.session, command }, 12000)
  if (response?.warning || typeof response?.output !== 'string') throw new Error('No confirmed command output')
  return response.output.replaceAll('\r\n', '\n')
}

async function loadMemory(scope, id) {
  // The stock memory list abbreviates the proposed text. A local card only
  // offers approval after reading the complete pending record via the app's
  // preview bridge. Never interpret a clipped line as the full write.
  if (scope.connection !== 'local' || !/^[\w-]+$/.test(scope.profile)) return null
  const desktop = window.hermesDesktop
  const info = await desktop?.getVersion?.()
  const home = info?.hermesHome
  if (!home || !desktop?.readFileText) return null
  const path = home.replace(/[\\/]+$/, '') + (scope.profile === 'default' ? '' : '/profiles/' + scope.profile)
    + '/pending/memory/' + id + '.json'
  const file = await desktop.readFileText(path)
  const pathKey = value => {
    const normalized = String(value).replaceAll('\\', '/')
    return info.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  if (file?.truncated || file?.binary || typeof file?.text !== 'string' || pathKey(file.path) !== pathKey(path)) return null
  const data = memoryProposal(JSON.parse(file.text), id)
  return data && { data, signature: file.text }
}

async function loadPreview(scope, item) {
  if (item.kind === 'memory') return loadMemory(scope, item.id)
  const signature = await slash(scope, 'skills', 'diff', item.id)
  const data = skillProposal(signature)
  if (data?.id !== item.id || /^\s*\((?:patch (?:would fail|['"])|[^)]* on ')/.test(data.content)) return null
  return { signature, data }
}

function block(label, text, part = 'excerpt') {
  const section = element('div', part)
  section.append(element('div', 'label', label), element('div', 'text', text))
  return section
}

function changedPair(before, after, t) {
  const pair = element('div', 'pair')
  pair.append(block(t.before, before, 'before'), block(t.after, after, 'after'))
  return pair
}

function showPreview(body, item, data, t) {
  const content = document.createDocumentFragment()
  if (item.kind === 'skills') {
    const pair = pairedSkillLines(data.content)
    content.append(pair ? changedPair(pair.before, pair.after, t) : block(t.skillText, data.content, 'full'))
  } else {
    for (const op of data.changes) {
      if (op.action === 'add') content.append(block(t.addNote, op.content))
      if (op.action === 'remove') content.append(block(t.removeNote, op.entry, 'before'))
      if (op.action === 'replace') content.append(changedPair(op.entry, op.content, t))
      if (op.action === 'patch') {
        content.append(block(t.entry, op.entry), element('div', 'label', t.fragment), changedPair(op.old, op.content, t))
      }
    }
    if (data.changes.some(op => op.action !== 'remove')) content.append(element('p', 'context', t.future))
  }
  body.replaceChildren(content)
}

function button(text, part, handler) {
  const control = element('button', part, text)
  control.type = 'button'
  control.addEventListener('click', event => { if (event.isTrusted) void handler() })
  return control
}

function card(item, t, bound, isCurrent, completed, onComplete) {
  const skill = item.kind === 'skills'
  const subject = skill ? skillSubject(item.gist) : null
  const headingText = skill ? t[subject.operation] : t.remember
  const article = element('section', 'card')
  article.setAttribute('aria-label', headingText)
  // The floating composer in Hermes redirects programmatic transcript focus.
  // Protect only this card while its own controls have keyboard focus.
  article.addEventListener('focus', () => article.setAttribute('data-overlay-surface', ''), true)
  article.addEventListener('blur', () => queueMicrotask(() => {
    if (!article.contains(document.activeElement)) article.removeAttribute('data-overlay-surface')
  }), true)
  const header = element('div', 'header')
  const icon = element('span', skill ? 'skill-icon' : 'memory-icon')
  icon.setAttribute('aria-hidden', 'true')
  const heading = element('div', 'heading')
  const title = element('h3', 'title', headingText)
  const info = element('div', 'subtitle')
  heading.append(title, info)
  header.append(icon, heading)
  const body = element('div', 'body')
  const footer = element('div', 'actions')
  const status = element('span', 'status')
  status.setAttribute('role', 'status')
  status.tabIndex = -1
  const inspect = button(t.inspect, 'inspect', open)
  inspect.setAttribute('aria-expanded', 'false')
  const reject = button(t.reject, 'reject', () => decide('reject'))
  const accept = button(t.accept, 'accept', () => decide('approve'))
  footer.append(status, inspect, reject, accept)
  article.append(header, body, footer)

  let preview = item.content ? { data: item, signature: item.original } : null
  let shown = Boolean(preview)
  let incomplete = false
  let busy = false
  let finished = false

  function update() {
    const target = preview?.data?.target ?? (item.gist.includes('user profile') ? 'user' : 'memory')
    info.textContent = [skill ? subject.name : t[target === 'user' ? 'profile' : 'notes'], item.auto ? t.auto : '']
      .filter(Boolean).join(' · ')
    info.hidden = !info.textContent
    body.hidden = !(preview && shown) && !incomplete
    inspect.hidden = finished || (!skill && (Boolean(preview) || busy))
    inspect.disabled = !bound || busy
    inspect.textContent = skill ? (shown ? t.hide : t.inspect) : t.inspectNote
    inspect.setAttribute('aria-expanded', String(shown))
    reject.hidden = !bound || finished
    accept.hidden = !bound || finished || !preview || !shown
    accept.disabled = reject.disabled = busy
  }

  function describe() {
    incomplete = false
    shown = true
    showPreview(body, item, preview.data, t)
    update()
  }

  function close(message, focus) {
    finished = true
    status.textContent = message
    update()
    if (focus) status.focus({ preventScroll: true })
  }

  function needsList(message) {
    return message + ' /' + item.kind + ' pending'
  }

  function unavailable() {
    preview = null
    shown = false
    incomplete = true
    const details = element('details', 'details')
    details.append(element('summary', 'label', t.details), element('div', 'text', item.gist))
    body.replaceChildren(details)
    status.textContent = needsList(t.unavailable)
  }

  async function open() {
    if (busy || finished || !isCurrent()) return
    if (preview) {
      shown = !shown
      update()
      return
    }
    busy = true
    status.textContent = t.load
    update()
    try {
      const result = await loadPreview(bound, item)
      if (!isCurrent()) return
      if (!result) {
        unavailable()
        return
      }
      preview = result
      status.textContent = ''
      describe()
    } catch {
      if (isCurrent()) unavailable()
    } finally {
      busy = false
      update()
    }
  }

  async function decide(action) {
    if (busy || finished || !isCurrent() || (action === 'approve' && (!preview || !shown))) return
    busy = true
    status.textContent = ''
    update()
    let attempted = false
    try {
      if (action === 'approve') {
        const fresh = await loadPreview(bound, item)
        if (!isCurrent()) return
        if (!fresh) {
          unavailable()
          return
        }
        if (fresh.signature !== preview.signature) {
          preview = fresh
          status.textContent = t.changed
          describe()
          return
        }
      } else {
        const queue = pendingProposals(item.kind, normalize(await slash(bound, item.kind, 'pending')))
        if (!isCurrent()) return
        if (!queue?.some(proposal => proposal.id === item.id && proposal.gist === item.gist)) {
          status.textContent = needsList(t.unavailable)
          return
        }
      }
      attempted = true
      const output = normalize(await slash(bound, item.kind, action, item.id))
      const success = action === 'approve'
        ? output.split('\n', 1)[0] === 'Approved 1 ' + item.kind + ' write(s).'
        : output === "Rejected pending " + item.kind + " write '" + item.id + "'."
      if (success) onComplete(action)
      if (!isCurrent()) return
      if (success) close(action === 'approve' ? t.saved : t.rejected, true)
      else close(needsList(t.unconfirmed), true)
    } catch {
      if (!isCurrent()) return
      if (attempted) close(needsList(t.unconfirmed), true)
      else status.textContent = needsList(t.unavailable)
    } finally {
      busy = false
      update()
    }
  }

  if (preview) describe()
  if (completed) close(completed === 'approve' ? t.saved : t.rejected, false)
  else if (bound && !skill) queueMicrotask(() => { void open() })
  else if (!bound && !preview) unavailable()
  update()
  return article
}

function styles(active) {
  const s = active + ' ' + stack
  const row = active + ' ' + enhanced
  const part = name => s + ' [data-hcv-proposal-part="' + name + '"]'
  return `
    ${row} {
      inline-size: min(100%, 48rem); max-inline-size: 100%; padding: 6px 0 10px; text-align: start;
    }
    ${row} > :not(${stack}) { display: none; }
    ${s} {
      display: grid; gap: 10px; inline-size: 100%; min-inline-size: 0;
      color: var(--hcv-text); font: 14px/1.5 ${codexReference.font};
    }
    ${part('card')} {
      container-type: inline-size; min-inline-size: 0; border-radius: 14px;
      background: light-dark(#f7f7f7, #222222); border: 1px solid var(--hcv-stroke);
    }
    ${part('header')} { display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px; }
    ${part('heading')} { min-inline-size: 0; }
    ${part('title')} { margin: 0; color: var(--hcv-text); font-size: 14px; font-weight: 600; }
    ${part('subtitle')}, ${part('context')}, ${part('status')} {
      color: var(--hcv-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere;
    }
    ${part('subtitle')} { margin-block-start: 2px; }
    ${part('skill-icon')}, ${part('memory-icon')} {
      flex: 0 0 40px; block-size: 40px; display: grid; place-items: center; border-radius: 8px;
      color: var(--hcv-text); background: light-dark(#ededed, #181818);
    }
    ${part('skill-icon')}::before, ${part('memory-icon')}::before {
      content: ""; inline-size: 18px; block-size: 18px; background: currentColor;
    }
    ${part('skill-icon')}::before { mask: ${codexMask('chatSkill')} center / contain no-repeat; }
    ${part('memory-icon')}::before { mask: ${codexMask('memory')} center / contain no-repeat; }
    ${part('body')} {
      display: grid; gap: 8px; min-inline-size: 0; padding: 2px 16px 10px;
      overflow-wrap: anywhere;
    }
    ${part('pair')} { display: grid; gap: 8px; }
    ${part('before')}, ${part('after')}, ${part('excerpt')}, ${part('full')} {
      min-inline-size: 0; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--hcv-stroke);
      background: light-dark(#ffffff, #1c1c1c);
    }
    ${part('before')} { border-inline-start: 2px solid light-dark(#ac2d35, #e37479); }
    ${part('after')} { border-inline-start: 2px solid light-dark(#257445, #6acf8b); }
    ${part('label')} { color: var(--hcv-muted); font-size: 12px; font-weight: 500; margin-block-end: 3px; }
    ${part('text')} { color: var(--hcv-text); white-space: pre-wrap; overflow-wrap: anywhere; }
    ${part('full')} { max-block-size: 340px; overflow: auto; overscroll-behavior: contain; }
    ${part('context')} { margin: 0; }
    ${part('actions')} {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
      gap: 8px; padding: 2px 16px 14px;
    }
    ${part('status')} { margin-inline-end: auto; }
    ${part('status')}:empty { display: none; }
    ${s} button {
      min-block-size: 32px; max-inline-size: 100%; padding: 4px 12px; border: 1px solid var(--hcv-stroke);
      border-radius: 8px; color: var(--hcv-text); background: transparent; font: 500 13px/1.4 ${codexReference.font};
      cursor: pointer; white-space: normal;
    }
    ${s} button:is(:hover, :focus-visible) { background: var(--hcv-hover); }
    ${s} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
    ${s} button:disabled { cursor: default; opacity: .55; }
    ${s} button[data-hcv-proposal-part="accept"] {
      border-color: transparent; background: var(--hcv-action); color: var(--hcv-ink);
    }
    ${s} button[data-hcv-proposal-part="accept"]:hover:not(:disabled) { opacity: .86; }
    ${s} [hidden] { display: none; }
    @container (max-width: 332px) {
      ${part('actions')} { align-items: stretch; flex-direction: column; }
      ${part('status')} { margin: 0; }
    }
  `
}

function readRow(row) {
  const label = row.firstElementChild
  if (!label?.classList.contains('font-mono')) return null
  const kind = label.textContent.trim().slice(1)
  if (label.textContent.trim() !== '/' + kind || !['skills', 'memory'].includes(kind)) return null
  const output = normalize(row.querySelector(':scope > .whitespace-pre-wrap')?.textContent ?? '')
  const queue = pendingProposals(kind, output)
  if (queue) return { kind, output, items: queue }
  const detail = kind === 'skills' ? skillProposal(output) : null
  return detail && { kind, output, items: [{ ...detail, original: output }] }
}

export function registerReviewProposals(ctx, active) {
  const root = document.documentElement
  mountCSS(ctx, 'data-hcv-proposals-style', styles(active), chatStyles)
  const rows = new Map()
  const pending = new Set()
  const decisions = new Map()
  let frame = 0
  const enabled = () => root.matches(active)
  const locale = () => root.lang.toLowerCase().startsWith('ru') ? 'ru' : 'en'

  function clear(row) {
    rows.get(row)?.panel.remove()
    rows.delete(row)
    row.removeAttribute('data-hcv-review-notice')
  }

  function render(row) {
    if (!row.isConnected || !row.closest(surface)) return clear(row)
    const notice = readRow(row)
    if (!notice) return clear(row)
    const lang = locale()
    const scope = currentScope(row)
    const last = rows.get(row)
    if (last?.output === notice.output && lang === last.lang && last.panel.isConnected &&
        ((!last.scope && !scope) || sameScope(last.scope, scope))) return
    clear(row)
    const panel = element('div')
    panel.dataset.hcvProposals = notice.kind
    panel.setAttribute('role', 'group')
    panel.setAttribute('aria-label', copy[lang][notice.kind])
    for (const item of notice.items) {
      const key = scope && JSON.stringify([scope.connection, scope.profile, item.kind, item.id])
      panel.append(card(item, copy[lang], scope,
        () => enabled() && panel.isConnected && sameScope(scope, currentScope(row)),
        key && decisions.get(key), action => {
          if (!key) return
          decisions.set(key, action)
          if (decisions.size > 256) decisions.delete(decisions.keys().next().value)
        }))
    }
    row.append(panel)
    row.dataset.hcvReviewNotice = ''
    rows.set(row, { panel, output: notice.output, lang, scope })
  }

  function flush() {
    frame = 0
    for (const row of rows.keys()) if (!row.isConnected) clear(row)
    for (const row of pending) render(row)
    pending.clear()
  }

  function collect(node) {
    const el = node instanceof Element ? node : node.parentElement
    if (!el || el.closest(stack)) return
    const row = el.closest(nativeRow)
    if (row?.closest(surface)) pending.add(row)
    for (const entry of el.querySelectorAll(nativeRow)) if (entry.closest(surface)) pending.add(entry)
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(flush)
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') collect(record.target)
      else for (const node of record.addedNodes) collect(node)
    }
    if (pending.size || rows.size) schedule()
  })

  function sync() {
    observer.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    pending.clear()
    if (enabled()) {
      collect(document.body)
      schedule()
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    } else for (const row of rows.keys()) clear(row)
  }

  const theme = new MutationObserver(sync)
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  const unsubscribe = [host.state.activeSessionId, host.state.focusedSessionId, host.state.focusedSessionOwner,
    host.state.connectionId, host.state.profile, host.state.gateway].filter(Boolean).map(atom => atom.listen(sync))
  sync()
  ctx.onDispose(() => {
    observer.disconnect()
    theme.disconnect()
    cancelAnimationFrame(frame)
    for (const stop of unsubscribe) stop()
    for (const row of rows.keys()) clear(row)
    pending.clear()
    decisions.clear()
  })
}
