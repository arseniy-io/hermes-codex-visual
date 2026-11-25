import { host } from '@hermes/plugin-sdk'
import { codexMask, codexReference } from './codex-reference.js'
import { chatStyles, mountCSS } from './style-scope.js'
import { committedFiber } from './sidebar-recents.js'
import { nativeSessionView } from './sidebar-session-state.js'
import { approvalReview, localizedApprovalActivity, protectedApproval } from './chat-approval-data.js'

const stackSelector = '[data-approval-stack]'
const cardSelector = '[data-slot="tool-approval-card"]'
const extra = 'data-hcv-protected-approval'
const panelAttr = 'data-hcv-approval-explanation'
const nativeActivity = 'data-hcv-approval-native-activity'
const customActivity = 'data-hcv-approval-activity'

const text = {
  ru: {
    title: 'Изменить файл с правилами?',
    target: 'Файл с правилами',
    reason: 'Зачем', files: 'Файлы и изменения', unchanged: 'В этом файле текст не меняется.',
    before: 'Было', after: 'Станет', create: 'Создать', delete: 'Удалить',
    loading: 'Загружаем файлы и изменения…',
    verifyFailed: 'Изменения показаны, но подтвердить их просмотр не удалось. Повторите загрузку.',
    unavailable: 'Не удалось загрузить изменения и их причину. Повторите загрузку. Если это не поможет, отклоните запрос и попросите агента повторить правку.',
    retry: 'Повторить загрузку',
    allow: 'Разрешить',
  },
  en: {
    title: 'Change an agent instruction file?',
    target: 'Instruction file',
    reason: 'Why', files: 'All changes', unchanged: 'The text of this file does not change.',
    before: 'Before', after: 'After', create: 'Create', delete: 'Delete',
    loading: 'Loading files and changes…',
    verifyFailed: 'The changes are displayed, but their review could not be confirmed. Try loading again.',
    unavailable: 'The changes and their reason could not be loaded. Try again. If that does not help, reject the request and ask the agent to retry the edit.',
    retry: 'Try loading again',
    allow: 'Allow',
  },
}

function requestForCard(card) {
  const stack = card.closest(stackSelector)
  const requestId = card.getAttribute('data-request-id')
  const sessionId = stack?.getAttribute('data-session-id')
  if (!requestId || !sessionId) return null
  for (let fiber = committedFiber(card); fiber; fiber = fiber.return) {
    const request = fiber.memoizedProps?.request
    if (request?.requestId === requestId && request.sessionId === sessionId) return request
    if (fiber.stateNode === stack) break
  }
  return null
}

function node(tag, part, value) {
  const element = document.createElement(tag)
  element.dataset.hcvApprovalPart = part
  if (value !== undefined) element.textContent = value
  return element
}

function explanation(data, copy, state, retry) {
  const panel = node('div', 'explanation')
  panel.setAttribute(panelAttr, '')
  const header = node('div', 'heading')
  const icon = node('span', 'icon')
  icon.setAttribute('aria-hidden', 'true')
  header.append(icon, node('span', 'title', copy.title))
  const body = node('div', 'body')
  const target = node('p', 'target')
  target.append(node('span', 'target-label', copy.target + ': '), document.createTextNode(data.target))
  body.append(target)
  if (state.review) {
    const reason = node('p', 'reason')
    reason.append(node('strong', 'reason-label', copy.reason + ': '), document.createTextNode(state.review.reason))
    body.append(reason, node('strong', 'files-label', `${copy.files} · ${state.review.files.length}`))
    const legend = node('div', 'legend')
    legend.append(node('span', 'removed-label', '− ' + copy.before), node('span', 'added-label', '+ ' + copy.after))
    body.append(legend)
    const files = node('div', 'files')
    files.setAttribute('tabindex', '0')
    for (const item of state.review.files) {
      const file = node('section', 'file')
      const title = node('div', 'file-title')
      const filename = item.path.replaceAll('\\', '/').split('/').at(-1) || item.path
      title.append(node('strong', 'filename', filename))
      if (item.operation !== 'edit') title.append(node('span', 'file-operation', copy[item.operation]))
      const diff = node('pre', 'diff')
      const rawLines = item.diff.split('\n')
      const headerLines = rawLines[0]?.startsWith('--- ') && rawLines[1]?.startsWith('+++ ') ? 2 : 0
      const lines = rawLines.slice(headerLines).filter(line => !line.startsWith('@@ '))
      if (lines.at(-1) === '') lines.pop()
      if (!lines.length) diff.textContent = copy.unchanged
      for (const line of lines) {
        const part = node('span', 'line', line + '\n')
        if (line.startsWith('-')) part.dataset.hcvDiffKind = 'removed'
        else if (line.startsWith('+')) part.dataset.hcvDiffKind = 'added'
        diff.append(part)
      }
      file.append(title, node('div', 'path', item.path), diff)
      files.append(file)
    }
    body.append(files)
    if (state.markFailed) body.append(node('p', 'unavailable', copy.verifyFailed))
  } else {
    body.append(node('p', 'unavailable', state.loading ? copy.loading : copy.unavailable))
  }
  if (!state.loading && (!state.review || state.markFailed) && retry) {
    const button = node('button', 'retry', copy.retry)
    button.type = 'button'
    button.addEventListener('click', retry)
    body.append(button)
  }
  panel.append(header, body)
  return panel
}

export function registerChatApproval(ctx, active) {
  const root = document.documentElement
  const forcedColors = window.matchMedia('(forced-colors: active)')
  const modifiedButtons = new Map()
  const requests = new Map()
  let frame = 0
  let disposed = false
  // The review is a functional safety surface, so it must remain available
  // when the user switches away from the Codex theme or uses forced colors.
  const enabled = () => root.hasAttribute('data-hermes-codex-visual')
  const isRussian = () => root.lang.toLowerCase().startsWith('ru')

  const baseStyle = document.createElement('style')
  baseStyle.setAttribute('data-hcv-approval-base-style', '')
  baseStyle.textContent = `
  :root[data-hermes-codex-visual] ${cardSelector}[${extra}] > div:first-child,
  :root[data-hermes-codex-visual] ${cardSelector}[${extra}] > pre { display: none; }
  :root[data-hermes-codex-visual] [${panelAttr}] { min-inline-size: 0; overflow-wrap: anywhere; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="heading"] { padding: 12px 16px 8px; font-weight: 600; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="icon"] { display: none; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="body"] { display: grid; gap: 8px; padding: 2px 16px 12px; }
  :root[data-hermes-codex-visual] [${panelAttr}] p { margin: 0; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="files"] {
    display: grid; gap: 14px; max-block-size: min(220px, 28vh); overflow: auto;
    border: 1px solid currentColor; border-radius: 8px; padding: 10px;
  }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="path"] { font-size: 11px; overflow-wrap: anywhere; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="diff"] { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="legend"] { display: flex; gap: 14px; font-size: 11px; }
  :root[data-hermes-codex-visual] [${panelAttr}] [data-hcv-approval-part="retry"] {
    justify-self: start; padding: 4px 0; font: inherit; text-decoration: underline;
    text-underline-offset: 3px; cursor: pointer;
  }
  :root[data-hermes-codex-visual] ${cardSelector}[${extra}] [data-hcv-approval-button-label] { font-size: 0 !important; }
  :root[data-hermes-codex-visual] ${cardSelector}[${extra}] [data-hcv-approval-button-label]::before { content: attr(data-hcv-approval-button-label); font-size: 13px; }
  `
  document.head.append(baseStyle)

  mountCSS(ctx, 'data-hcv-chat-approval-style', `
@media (forced-colors: none) {
  ${active} ${stackSelector} [data-slot="card-stack-surface"],
  ${active} ${stackSelector} [data-slot="card-stack-edge"] {
    border-radius: 14px; border: 1px solid var(--hcv-stroke);
    background: light-dark(#f7f7f7, #222222); color: var(--hcv-text);
  }
  ${active} ${cardSelector} { font: 14px/1.5 ${codexReference.font}; }
  ${active} ${cardSelector}:not([${extra}]) > div:first-child > .codicon-terminal {
    inline-size: 16px; block-size: 16px; background: currentColor;
    mask: ${codexMask('activityTerminal')} center / contain no-repeat;
  }
  ${active} ${cardSelector}:not([${extra}]) > div:first-child > .codicon-terminal::before { visibility: hidden; }
  ${active} ${cardSelector} > [data-slot="tool-approval-actions"] {
    display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 16px 14px;
  }
  ${active} ${cardSelector} > [data-slot="tool-approval-actions"] button {
    min-block-size: 32px; padding: 4px 12px; border-radius: 8px;
    font: 500 13px/1.4 ${codexReference.font};
  }
  ${active} ${cardSelector} > [data-slot="tool-approval-actions"] button:focus-visible {
    outline: 2px solid var(--hcv-focus); outline-offset: 2px;
  }
  ${active} ${cardSelector} > [data-slot="tool-approval-actions"] [data-approval-run] {
    background: var(--hcv-action); color: var(--hcv-ink); border-color: transparent;
  }
  ${active} ${cardSelector} > [data-slot="tool-approval-actions"] [data-approval-run]:hover:not(:disabled) { opacity: .86; }
  ${active} ${cardSelector}[${extra}] > div:first-child,
  ${active} ${cardSelector}[${extra}] > pre { display: none; }
  ${active} [${panelAttr}] { min-inline-size: 0; overflow-wrap: anywhere; }
  ${active} [${panelAttr}] [data-hcv-approval-part="heading"] {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px;
  }
  ${active} [${panelAttr}] [data-hcv-approval-part="icon"] {
    display: grid; place-items: center; flex: 0 0 40px; block-size: 40px;
    border-radius: 8px; color: var(--hcv-text); background: light-dark(#ededed, #181818);
  }
  ${active} [${panelAttr}] [data-hcv-approval-part="icon"]::before {
    content: ''; inline-size: 18px; block-size: 18px; background: currentColor;
    mask: ${codexMask('turnDiff')} center / contain no-repeat;
  }
  ${active} [${panelAttr}] [data-hcv-approval-part="title"] { font-weight: 600; }
  ${active} [${panelAttr}] [data-hcv-approval-part="body"] {
    display: grid; gap: 8px; padding: 2px 16px 12px;
  }
  ${active} [${panelAttr}] p { margin: 0; }
  ${active} [${panelAttr}] [data-hcv-approval-part="target-label"] { color: var(--hcv-muted); }
  ${active} [${panelAttr}] [data-hcv-approval-part="unavailable"] {
    color: var(--hcv-muted); font-size: 12px; line-height: 1.5;
  }
  ${active} [${panelAttr}] [data-hcv-approval-part="files"] {
    display: grid; gap: 14px; max-block-size: min(220px, 28vh); overflow: auto;
    border: 1px solid var(--hcv-stroke); border-radius: 8px; padding: 10px;
  }
  ${active} [${panelAttr}] [data-hcv-approval-part="file-title"] { display: flex; align-items: center; gap: 8px; }
  ${active} [${panelAttr}] [data-hcv-approval-part="file-operation"] { font-size: 11px; color: var(--hcv-muted); }
  ${active} [${panelAttr}] [data-hcv-approval-part="path"] { color: var(--hcv-muted); font-size: 11px; overflow-wrap: anywhere; }
  ${active} [${panelAttr}] [data-hcv-approval-part="legend"] { display: flex; gap: 14px; font-size: 11px; }
  ${active} [${panelAttr}] :is([data-hcv-approval-part="removed-label"], [data-hcv-diff-kind="removed"]) { color: light-dark(#ad3434, #f19494); }
  ${active} [${panelAttr}] :is([data-hcv-approval-part="added-label"], [data-hcv-diff-kind="added"]) { color: light-dark(#167749, #7fd4a2); }
  ${active} [${panelAttr}] [data-hcv-approval-part="diff"] {
    margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere;
    font: 12px/1.5 ui-monospace, Consolas, monospace;
  }
  ${active} ${cardSelector} [data-hcv-approval-button-label] { font-size: 0 !important; }
  ${active} ${cardSelector} [data-hcv-approval-button-label]::before {
    content: attr(data-hcv-approval-button-label); font: 500 13px/1.4 ${codexReference.font};
  }
  ${active} ${cardSelector} [data-hcv-approval-button-label] > span { font-size: 12px; }
  ${active} [${nativeActivity}] { display: none; }
  ${active} [${customActivity}] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
  `, chatStyles)

  function restoreButton(button) {
    const original = modifiedButtons.get(button)
    if (!original) return
    if (button.getAttribute('aria-label') === original.applied) {
      if (original.label === null) button.removeAttribute('aria-label')
      else button.setAttribute('aria-label', original.label)
    }
    button.removeAttribute('data-hcv-approval-button-label')
    if (button.hasAttribute('data-hcv-approval-disabled')) button.disabled = nativeButtonDisabled(button, original)
    button.removeAttribute('data-hcv-approval-disabled')
    modifiedButtons.delete(button)
  }

  function clearCard(card) {
    card.querySelector(`:scope > [${panelAttr}]`)?.remove()
    card.removeAttribute(extra)
    const button = card.querySelector('[data-approval-run]')
    if (button) restoreButton(button)
  }

  function nativeButtonDisabled(button, original) {
    const props = committedFiber(button)?.memoizedProps
    return props ? Boolean(props.disabled) : original.disabled
  }

  function pending(scope, params = {}) {
    const payload = { session_id: scope.session, profile: scope.profile, ...params }
    if (typeof host.requestProfile === 'function') {
      return host.requestProfile({ connectionId: scope.connection, profile: scope.profile,
        targetProfile: scope.profile }, 'approval.pending', payload, 12000)
    }
    return scope.socket.request('approval.pending', payload, 12000)
  }

  function syncCard(card, used) {
    const request = requestForCard(card)
    const data = protectedApproval(request)
    const actions = card.querySelector(':scope > [data-slot="tool-approval-actions"]')
    if (!data || !actions || card.hasAttribute('inert')) return clearCard(card)
    const lang = isRussian() ? 'ru' : 'en'
    const scope = currentScope(card, request)
    // The paired core companion is installed on this computer only. A remote
    // gateway has its own approvals and must retain its native controls.
    if (scope?.connection && scope.connection !== 'local') return clearCard(card)
    const key = scope && JSON.stringify([scope.profile, scope.connection, scope.session, request.requestId])
    if (key) used.add(key)
    let state = key && requests.get(key)
    if (key && (!state || !sameScope(state.scope, scope))) {
      state = { scope, loading: true, review: null, seen: false, markAttempted: false, markFailed: false }
      requests.set(key, state)
      pending(scope).then(response => {
        // A native card can be remounted while this same request is loading.
        // The next sync checks the new card's owner before rendering the result.
        if (requests.get(key) !== state) return
        state.review = approvalReview(response, request.requestId)
      }).catch(() => {}).finally(() => {
        state.loading = false
        schedule()
      })
    }
    state ||= { loading: false, review: null }
    const current = card.querySelector(`:scope > [${panelAttr}]`)
    const status = state.loading ? 'loading' : state.markFailed ? 'mark-failed' : state.review ? 'ready' : 'unavailable'
    if (!current || current.dataset.hcvTarget !== data.target || current.lang !== lang ||
        current.dataset.hcvRequest !== (key || '') || current.dataset.hcvStatus !== status) {
      current?.remove()
      const panel = explanation(data, text[lang], state, key && (() => {
        if (requests.get(key) === state && sameScope(scope, currentScope(card, request))) {
          requests.delete(key)
          schedule()
        }
      }))
      panel.dataset.hcvTarget = data.target
      panel.dataset.hcvRequest = key || ''
      panel.dataset.hcvStatus = status
      panel.lang = lang
      actions.before(panel)
    }
    card.setAttribute(extra, '')
    if (state.review && !state.markAttempted && card.getClientRects().length) {
      state.markAttempted = true
      pending(scope, { hcv_seen_request_id: request.requestId })
        .then(response => {
          if (requests.get(key) !== state) return
          state.seen = response?.hcv_review_seen === true
          state.markFailed = !state.seen
        }).catch(() => { state.markFailed = true }).finally(schedule)
    }
    const button = actions.querySelector('[data-approval-run]')
    if (button) {
      if (!modifiedButtons.has(button)) modifiedButtons.set(button, { label: button.getAttribute('aria-label'), applied: text[lang].allow, disabled: button.disabled })
      modifiedButtons.get(button).applied = text[lang].allow
      button.setAttribute('aria-label', text[lang].allow)
      button.setAttribute('data-hcv-approval-button-label', text[lang].allow)
      if (!state.review || !state.seen) {
        button.disabled = true
        button.setAttribute('data-hcv-approval-disabled', '')
      } else if (button.hasAttribute('data-hcv-approval-disabled')) {
        button.removeAttribute('data-hcv-approval-disabled')
        button.disabled = nativeButtonDisabled(button, modifiedButtons.get(button))
      }
    }
  }

  function currentScope(card, request) {
    if (!card.isConnected) return null
    const native = nativeSessionView(card)
    const session = native?.view.$runtimeId.get()
    const owner = native?.nativeOwner || (native?.view.kind === 'primary'
      ? { profile: host.state.profile.get() || 'default', connectionId: host.state.connectionId.get() } : null)
    const profile = owner?.profile
    const connection = owner?.connectionId
    const socket = host.getGateway()
    if (!session || request.sessionId !== session || !profile || !connection) return null
    // The card's own SessionView stays authoritative when another tile is
    // focused, settings open, or the narrow layout hides the focused pane.
    if (typeof host.requestProfile !== 'function' && (!socket || profile !== (host.state.profile.get() || 'default') ||
        connection !== host.state.connectionId.get())) return null
    return { session, profile, connection, socket, view: native.view }
  }

  function sameScope(a, b) {
    return Boolean(a && b && a.session === b.session && a.profile === b.profile &&
      a.connection === b.connection && a.socket === b.socket && a.view === b.view)
  }

  function syncActivity(stack) {
    const activity = stack.querySelector('[data-approval-activity]')
    const native = activity?.querySelector('button span.truncate')
    const translated = root.matches(active) && isRussian() && native && localizedApprovalActivity(native.textContent)
    const previous = activity?.querySelector(`[${customActivity}]`)
    if (!native || !translated) {
      previous?.remove()
      activity?.querySelector(`[${nativeActivity}]`)?.removeAttribute(nativeActivity)
      return
    }
    const label = previous || document.createElement('span')
    label.setAttribute(customActivity, '')
    label.className = native.className
    if (label.textContent !== translated) label.textContent = translated
    if (!previous) native.after(label)
    native.setAttribute(nativeActivity, '')
  }

  function clear() {
    document.querySelectorAll(`${cardSelector}[${extra}]`).forEach(clearCard)
    document.querySelectorAll(`[${nativeActivity}]`).forEach(node => node.removeAttribute(nativeActivity))
    document.querySelectorAll(`[${customActivity}]`).forEach(node => node.remove())
    for (const button of modifiedButtons.keys()) restoreButton(button)
    requests.clear()
  }

  function sync() {
    frame = 0
    if (disposed) return
    if (!enabled()) return clear()
    const used = new Set()
    document.querySelectorAll(stackSelector).forEach(stack => {
      syncActivity(stack)
      stack.querySelectorAll(cardSelector).forEach(card => syncCard(card, used))
    })
    for (const key of requests.keys()) if (!used.has(key)) requests.delete(key)
    for (const button of modifiedButtons.keys()) if (!button.isConnected) modifiedButtons.delete(button)
  }

  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(sync)
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      return target && !target.closest(`[${panelAttr}], [${customActivity}]`) &&
        (target.closest(stackSelector) || (['hidden', 'data-pane-hidden'].includes(record.attributeName) &&
          target.querySelector(stackSelector)) || [...record.addedNodes].some(node => node instanceof Element &&
          (node.matches(stackSelector) || node.querySelector(stackSelector))))
    })) schedule()
  })
  observer.observe(document.body, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['inert', 'data-request-id', 'data-session-id', 'hidden', 'data-pane-hidden'] })
  const theme = new MutationObserver(schedule)
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  ctx.addEventListener(forcedColors, 'change', schedule)
  const unsubscribes = [host.state.activeSessionId, host.state.connectionId, host.state.profile,
    host.state.focusedSessionId, host.state.focusedSessionOwner, host.state.gateway]
    .filter(Boolean).map(atom => atom.listen(schedule))
  ctx.onDispose(() => {
    disposed = true
    observer.disconnect()
    theme.disconnect()
    baseStyle.remove()
    for (const unsubscribe of unsubscribes) unsubscribe()
    requests.clear()
    cancelAnimationFrame(frame)
    clear()
  })
  schedule()
}
