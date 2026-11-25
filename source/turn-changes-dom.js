import { turnChangesTitle, syncTurnChangesSpinner, canReconcileTurnChange } from './turn-changes-card.js'
import { anchorTurnCard } from './turn-card-scroll.js'

const attr = (node, name, value) => {
  if (value == null || value === false) { if (node.hasAttribute(name)) node.removeAttribute(name); return }
  const text = value === true ? '' : String(value)
  if (node.getAttribute(name) !== text) node.setAttribute(name, text)
}
const text = (node, value) => { if (node.textContent !== value) node.textContent = value }
const marker = name => {
  const node = document.createElement('span')
  node.setAttribute('data-hcv-turn-card-' + name, '')
  return node
}
function button(name) {
  const node = document.createElement('button')
  node.type = 'button'
  node.setAttribute('data-hcv-turn-card-' + name, '')
  return node
}
function counts() {
  const root = marker('counts'), added = marker('added'), removed = marker('removed')
  root.append(added, removed)
  return { root, update(plus, minus, format) { text(added, '+' + format.format(plus)); text(removed, '−' + format.format(minus)) } }
}

// DOM owner for native main-chat rows. It renders the same source-derived tree
// and CSS hooks as TurnChangesCard, without mounting a separate React runtime.
export function createTurnChangesCard(initial) {
  let config = initial
  let expanded = false, pending = false, disposed = false, generation = 0, local = null, stopSpinner = null
  const element = document.createElement('div')
  element.setAttribute('data-hcv-generated', '')
  const header = document.createElement('div')
  header.setAttribute('data-hcv-turn-card-header', '')
  const open = button('open'), icon = marker('icon'), heading = document.createElement('div')
  heading.setAttribute('data-hcv-turn-card-heading', '')
  icon.setAttribute('aria-hidden', 'true')
  const title = marker('title'), subtitle = marker('subtitle'), totals = counts(), hover = marker('hover')
  subtitle.append(totals.root, hover)
  heading.append(title, subtitle)
  const apply = button('apply'), review = button('review')
  header.append(open, icon, heading, apply, review)
  const list = document.createElement('div')
  list.setAttribute('data-hcv-turn-card-files', '')
  const more = button('more')
  const rows = new Map()
  element.append(header)
  const sameOwner = () => !disposed && (config.sameOwner?.() ?? true)
  const currentState = () => local?.snapshotId === config.snapshot.snapshotId ? local : config.snapshot
  const onReview = path => { if (sameOwner()) config.onReview?.(config.snapshot, path) }
  const selectTop = () => onReview(config.snapshot.files.length === 1 ? config.snapshot.files[0].path : undefined)
  open.addEventListener('click', selectTop)
  review.addEventListener('click', event => { event.stopPropagation(); selectTop() })
  more.addEventListener('click', () => { anchorTurnCard(header); expanded = !expanded; render() })
  apply.addEventListener('click', async event => {
    event.stopPropagation()
    const snapshot = config.snapshot, state = currentState()
    if (pending || !sameOwner() || !config.onApply || !snapshot.canApply || state.status !== 'ready') return
    const action = state.nextAction || 'undo'
    const requestGeneration = generation
    pending = true
    render()
    try {
      const outcome = await config.onApply({ ...snapshot, revision: state.revision, nextAction: action }, action)
      if (!sameOwner() || requestGeneration !== generation) return
      local = { ...outcome, snapshotId: snapshot.snapshotId,
        status: outcome.status === 'success' || outcome.status === 'failed' ? 'ready' : outcome.status }
      config.onResult?.(outcome, action)
    } catch (error) {
      if (sameOwner() && requestGeneration === generation) {
        local = { ...state, snapshotId: snapshot.snapshotId, status: 'unknown' }
        config.onError?.(error, action)
      }
    } finally {
      pending = false
      if (!disposed) render()
    }
  })
  function render() {
    if (disposed) return
    const { snapshot, lang = 'en' } = config
    const files = snapshot.files
    const ru = lang === 'ru', format = new Intl.NumberFormat(lang)
    attr(element, 'data-hcv-saved-turn-card', snapshot.turnId)
    attr(element, 'data-snapshot-id', snapshot.snapshotId)
    const name = turnChangesTitle(files, lang)
    text(title, name)
    attr(title, 'title', name)
    text(hover, ru ? 'Просмотр изменений' : 'View changes')
    totals.update(files.reduce((n, f) => n + f.added, 0), files.reduce((n, f) => n + f.removed, 0), format)
    attr(open, 'aria-label', ru ? 'Посмотреть измененные файлы' : 'View changed files')
    attr(open, 'disabled', !config.onReview)
    text(review, ru ? 'Просмотреть изменения' : 'View changes')
    attr(review, 'disabled', !config.onReview)
    const state = currentState(), action = state.nextAction || 'undo'
    attr(apply, 'data-hcv-turn-card-apply', action)
    attr(apply, 'aria-busy', String(pending))
    if (pending && !stopSpinner) stopSpinner = syncTurnChangesSpinner(apply)
    else if (!pending && stopSpinner) { stopSpinner(); stopSpinner = null }
    attr(apply, 'disabled', pending || !config.onApply || !snapshot.canApply || state.status !== 'ready')
    text(apply, action === 'undo' ? ru ? 'Отменить' : 'Undo' : ru ? 'Повторно применить' : 'Reapply')
    if (files.length <= 1) { list.remove(); return }
    if (list.parentElement !== element) element.append(list)
    const shown = expanded ? files : files.slice(0, 3)
    const visible = new Set(shown.map(file => file.path))
    for (const [key, row] of rows) if (!visible.has(key)) { row.button.remove(); rows.delete(key) }
    shown.forEach((file, index) => {
      let row = rows.get(file.path)
      if (!row) {
        const node = button('file'), label = marker('path'), directory = marker('directory'), basename = marker('basename'), numbers = counts()
        label.setAttribute('aria-hidden', 'true')
        label.append(directory, basename)
        node.append(label, numbers.root)
        node.addEventListener('click', () => onReview(file.path))
        row = { button: node, directory, basename, numbers }
        rows.set(file.path, row)
      }
      const path = file.path.replaceAll('\\', '/'), slash = path.lastIndexOf('/') + 1
      text(row.directory, path.slice(0, slash))
      text(row.basename, path.slice(slash))
      attr(row.button, 'title', file.path)
      attr(row.button, 'aria-label', file.path)
      attr(row.button, 'disabled', !config.onReview)
      row.numbers.update(file.added, file.removed, format)
      if (list.children[index] !== row.button) list.insertBefore(row.button, list.children[index] || null)
    })
    if (files.length > 3) {
      const remaining = files.length - shown.length
      const noun = !ru ? remaining === 1 ? 'file' : 'files'
        : new Intl.PluralRules('ru').select(remaining) === 'one' ? 'файл'
          : new Intl.PluralRules('ru').select(remaining) === 'few' ? 'файла' : 'файлов'
      text(more, expanded ? ru ? 'Свернуть файлы' : 'Collapse files'
        : ru ? `Показать еще ${format.format(remaining)} ${noun}` : `Show ${format.format(remaining)} more ${noun}`)
      attr(more, 'aria-expanded', String(expanded))
      if (list.lastElementChild !== more) list.append(more)
    } else more.remove()
  }
  render()
  return {
    element,
    update(next) {
      if (disposed) return
      const changed = next.snapshot.snapshotId !== config.snapshot.snapshotId
      if (changed) { local = null; generation++; expanded = false }
      else if (next.snapshot !== config.snapshot && canReconcileTurnChange(local, next.snapshot)) local = null
      config = next
      render()
    },
    dispose() { disposed = true; generation++; stopSpinner?.(); element.remove() },
  }
}

// Public adapter used by the main timeline. Callbacks and owning connection
// remain captured; a new owner gets a new controller instead of retargeting.
export function createTurnChangesDom(options) {
  const controller = createTurnChangesCard(options)
  return { element: controller.element, dispose: controller.dispose,
    update(snapshot) { controller.update({ ...options, snapshot }) } }
}
