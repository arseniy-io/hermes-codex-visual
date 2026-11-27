import { createElement as h } from 'react'
import {
  atom, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  host, TITLEBAR_AREAS, useValue,
} from '@hermes/plugin-sdk'
import { codexMask } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

export const sidebarHeaderEvent = 'hcv:sidebar-header'

const labels = {
  ru: {
    title: 'Активность', description: 'Предложения, текущие проверки и их результаты.',
    profile: 'Профиль Hermes', attention: 'Ожидают решения', refresh: 'Обновить', loading: 'Загружаем предложения…',
    loadError: 'Не удалось проверить очередь. Проверьте подключение и повторите.',
    noItems: 'Нет предложений, ожидающих решения.', invalid: 'Некоторые записи очереди не удалось прочитать.',
    skill: 'Изменение навыка', skillCreate: 'Создание навыка', skillFiles: 'Файлы навыка', memory: 'Изменение памяти', auto: 'Из авторазбора', manual: 'Предложение ассистента',
    inspect: 'Посмотреть правку', back: 'К предложениям', preview: 'Полный текст предложения',
    previewLoading: 'Открываем полный текст…', previewError: 'Не удалось открыть полный текст. Обновите очередь и повторите.',
    unavailable: 'Применение этого предложения недоступно.', accept: 'Принять', reject: 'Отклонить',
    approved: 'Предложение принято.', rejected: 'Предложение отклонено.',
    approving: 'Принимаем…', rejecting: 'Отклоняем…', decisionPending: 'Ждём ответ Hermes…',
    skillCreated: name => 'Навык «' + name + '» создан.', skillFilesApplied: 'Файлы навыка сохранены.',
    decisionRefused: 'Hermes отклонил применение. Результат изменений не подтверждён.',
    uncertain: 'Результат не подтверждён. Обновите список и откройте предложение снова.',
    stale: 'Предложение или исходные файлы изменились. Обновите очередь и просмотрите правку заново.',
    retry: 'Повторить', unknownDate: 'Время не указано', unknown: 'Очередь ещё не проверена',
    locked: 'Обновите очередь и заново откройте предложение.', unsupported: 'Очередь недоступна в этом подключении.',
    disconnected: 'Подключение к Hermes потеряно. Очередь будет проверена после восстановления связи.', unknownOrigin: 'Источник не указан',
    proposals: 'Предложения', now: 'Сейчас', recent: 'Недавнее', filter: 'Показать', all: 'Все', skills: 'Навыки', memories: 'Память',
    noRunning: 'Сейчас нет подтверждённых фоновых проверок.', noRecent: 'Здесь появятся результаты новых проверок и решений.',
    historyError: 'Не удалось прочитать события и историю. Обновите панель.', review: 'Фоновая проверка',
    completed: 'Завершена', interrupted: 'Прервана', failed: 'Не завершилась из-за ошибки',
    resultUnknown: 'Результат не подтверждён', decisionApproved: 'Принято', decisionRejected: 'Отклонено',
    notApplied: 'Не применено', waitingSummary: 'Готовим краткое описание…',
    summaryError: 'Краткое описание не удалось подготовить. Можно проверить изменённые фрагменты ниже.',
    summaryUnavailable: 'Краткое описание недоступно. Проверьте изменённые фрагменты ниже.',
    summaryUnavailableFull: 'Краткое описание недоступно. Проверьте полный текст ниже.',
    summaryUnavailableOnly: 'Краткое описание недоступно.',
    missingSkillNext: 'Чтобы применить предложение, сначала создайте или восстановите навык, затем обновите список.',
    missingSkillCreate: 'В очереди есть предложение создать навык с таким названием. Рассмотрите его в первую очередь.',
    openCreate: 'Рассмотреть создание навыка',
    inspectCreate: 'Посмотреть предложение',
    newSkillProposal: 'Предложение создать новый навык', skillFilesProposal: 'Предложение изменить файлы навыка',
    noSkillDescription: 'Описание навыка не указано.', skillFilesDetails: 'Отдельное предложение по файлам',
    projectName: name => 'Проект «' + name + '»', unknownProject: 'Проект не определён',
    waitingPurpose: 'Уточняем, чем поможет навык…', retryPurpose: 'Обновить объяснение',
    backToProposal: 'К предложению', fullText: 'Полный текст', readingProposal: 'Загружаем предложение…',
    compactDestructive: 'Предложение включает удаление или полную замену файлов навыка.',
    descriptionTooLong: (length, limit) => 'Создание заблокировано. Длина описания ' + length + ', допустимо до ' + limit + ' символов.',
    invalidSkillContent: 'Создание заблокировано. Проверьте содержимое навыка.',
    changes: 'Изменённые фрагменты', fullFile: 'Полный текст файла', before: 'Было', after: 'Станет',
    fragmentsUnavailable: 'Не удалось выделить изменённые фрагменты. Откройте полный текст файла.',
    empty: 'Пусто', removed: 'Будет удалено', change: 'Изменение', create: 'Создание', replace: 'Полная замена',
    deletion: 'Удаление', destructive: 'Предложение включает удаление или полную замену. Проверьте затронутые фрагменты.',
    summaryHint: 'Описание подготовлено моделью. Перед решением можно проверить фрагменты.',
    excerpt: 'Фрагмент',
  },
  en: {
    title: 'Activity', description: 'Proposals, ongoing reviews and their results.',
    profile: 'Hermes profile', attention: 'Needs your decision', refresh: 'Refresh', loading: 'Loading proposals…',
    loadError: 'Could not check the queue. Check the connection and try again.',
    noItems: 'No proposals are waiting for a decision.', invalid: 'Some queue records could not be read.',
    skill: 'Skill change', skillCreate: 'Create a skill', skillFiles: 'Skill files', memory: 'Memory change', auto: 'From background review', manual: 'Assistant proposal',
    inspect: 'View proposed change', back: 'Back to proposals', preview: 'Full proposed change',
    previewLoading: 'Opening the full proposal…', previewError: 'Could not open the full proposal. Refresh the queue and try again.',
    unavailable: 'This proposal cannot be applied.', accept: 'Approve', reject: 'Reject',
    approved: 'Proposal approved.', rejected: 'Proposal rejected.',
    approving: 'Approving…', rejecting: 'Rejecting…', decisionPending: 'Waiting for Hermes…',
    skillCreated: name => 'Skill “' + name + '” created.', skillFilesApplied: 'Skill files saved.',
    decisionRefused: 'Hermes rejected the change. The outcome of the changes is unconfirmed.',
    uncertain: 'The result is unconfirmed. Refresh the list and open the proposal again.',
    stale: 'The proposal or source files changed. Refresh the queue and review the change again.',
    retry: 'Retry', unknownDate: 'Time not recorded', unknown: 'The queue has not been checked',
    locked: 'Refresh the queue and review the proposal again.', unsupported: 'The queue is unavailable on this connection.',
    disconnected: 'The Hermes connection was lost. The queue will be checked after reconnecting.', unknownOrigin: 'Source not recorded',
    proposals: 'Proposals', now: 'Now', recent: 'Recent', filter: 'Show', all: 'All', skills: 'Skills', memories: 'Memory',
    noRunning: 'No confirmed background reviews are running.', noRecent: 'New review results and decisions will appear here.',
    historyError: 'Could not read activity and history. Refresh the panel.', review: 'Background review',
    completed: 'Completed', interrupted: 'Interrupted', failed: 'Failed', resultUnknown: 'Result not confirmed',
    decisionApproved: 'Approved', decisionRejected: 'Rejected', notApplied: 'Not applied',
    waitingSummary: 'Preparing a short explanation…', summaryError: 'Could not prepare an explanation. Review the changed passages below.',
    summaryUnavailable: 'An explanation is unavailable. Review the changed passages below.',
    summaryUnavailableFull: 'An explanation is unavailable. Review the full text below.',
    summaryUnavailableOnly: 'An explanation is unavailable.',
    missingSkillNext: 'Create or restore the skill first, then refresh the list to apply this proposal.',
    missingSkillCreate: 'There is also a proposal to create a skill with this name. Review it first.',
    openCreate: 'Review skill creation',
    inspectCreate: 'View proposal',
    newSkillProposal: 'Proposal to create a new skill', skillFilesProposal: 'Proposal to change skill files',
    noSkillDescription: 'No skill description was provided.', skillFilesDetails: 'Separate proposal for skill files',
    projectName: name => 'Project “' + name + '”', unknownProject: 'Project unknown',
    waitingPurpose: 'Preparing a practical explanation…', retryPurpose: 'Refresh explanation',
    backToProposal: 'Back to proposal', fullText: 'Full text', readingProposal: 'Loading proposal…',
    compactDestructive: 'The proposal includes removal or full replacement of skill files.',
    descriptionTooLong: (length, limit) => 'Creation is blocked. The description has ' + length + ' characters. The limit is ' + limit + '.',
    invalidSkillContent: 'Creation is blocked. Check the skill content.',
    changes: 'Changed passages', fullFile: 'Full file', before: 'Before', after: 'After', empty: 'Empty', removed: 'Will be removed',
    fragmentsUnavailable: 'Could not isolate the changed passages. Open the full file.',
    change: 'Change', create: 'Create', replace: 'Full replacement', deletion: 'Removal',
    destructive: 'This proposal includes removal or a full replacement. Review the affected passages.',
    summaryHint: 'The explanation was prepared by a model. You can check the passages before deciding.',
    excerpt: 'Excerpt',
  },
}
const words = () => document.documentElement.lang.toLowerCase().startsWith('ru') ? labels.ru : labels.en
const itemKey = item => `${item.kind}:${item.id}`
const proposalPath = item => `/activity/${item.kind}/${item.id}`
const idValid = value => typeof value === 'string' && /^[0-9a-f]{8}$/.test(value)
const text = value => typeof value === 'string' ? value : ''

function compactSkill(item) {
  return item?.kind === 'skills' && ['create', 'files'].includes(item.skill_action)
}

function creationIssueLabel(issue, t) {
  if (issue?.code === 'skill_description_too_long' && Number.isInteger(issue.length) && Number.isInteger(issue.limit))
    return t.descriptionTooLong(issue.length, issue.limit)
  if (issue?.code === 'invalid_skill_content') return t.invalidSkillContent
  return ''
}

function decisionErrorDetail(error) {
  const match = /\b422:\s*(\{[\s\S]*\})\s*$/.exec(text(error?.message))
  if (!match) return null
  try { return JSON.parse(match[1]).detail } catch { return null }
}

function relatedCreation(snapshot, detail) {
  if (!detail?.missing_skill) return []
  return (snapshot?.items || []).filter(item => item.kind === 'skills' && item.skill_action === 'create' &&
    item.names.length === 1 && item.names[0] === detail.missing_skill && item.id !== detail.id)
}

export function activityItem(value) {
  if (!value || !idValid(value.id) || !['skills', 'memory'].includes(value.kind) ||
      typeof value.version !== 'string' || !value.version) return null
  return { ...value, names: Array.isArray(value.names) ? value.names.filter(name => typeof name === 'string' && name) : [],
    summary: text(value.summary), origin: text(value.origin), project: text(value.project) || null }
}

export function activitySnapshot(value) {
  if (!value || value.schema !== 1 || typeof value.scope !== 'string' || !value.scope ||
      !Array.isArray(value.items) || !Number.isInteger(value.invalid_count) || value.invalid_count < 0) return null
  const items = value.items.map(activityItem)
  if (items.some(item => !item) || new Set(items.map(itemKey)).size !== items.length) return null
  const validEvent = item => item && typeof item.id === 'string' && ['review', 'decision'].includes(item.category) &&
    Array.isArray(item.kinds) && item.kinds.every(kind => ['skills', 'memory'].includes(kind)) &&
    typeof item.name === 'string' && (item.description === undefined || typeof item.description === 'string') &&
    ['running', 'completed', 'interrupted', 'failed', 'unknown',
      'submitted', 'approved', 'rejected', 'not_applied'].includes(item.status)
  const historyAvailable = value.history_available === true && Array.isArray(value.running) && Array.isArray(value.recent) &&
    value.running.every(validEvent) && value.recent.every(validEvent)
  return { ...value, items, history_available: historyAvailable,
    running: historyAvailable ? value.running : [], recent: historyAvailable ? value.recent : [] }
}

export function activityDetail(value, item, scope) {
  if (!value || value.scope !== scope || value.id !== item.id || value.kind !== item.kind ||
      value.version !== item.version || typeof value.signature !== 'string' || !value.signature ||
      typeof value.preview !== 'string' || typeof value.applicable !== 'boolean' || !Array.isArray(value.changes) ||
      !value.changes.every(change => change && typeof change.name === 'string' && typeof change.file === 'string' &&
        typeof change.action === 'string' && Array.isArray(change.fragments) &&
        (change.full_replacement === undefined || typeof change.full_replacement === 'boolean') &&
        (change.fragments_unavailable === undefined || typeof change.fragments_unavailable === 'boolean') &&
        change.fragments.every(fragment => typeof fragment.before === 'string' && typeof fragment.after === 'string') &&
        (change.before === null || typeof change.before === 'string') && (change.after === null || typeof change.after === 'string')) ||
      !value.explanation || !['pending', 'ready', 'error', 'unavailable'].includes(value.explanation.status) ||
      typeof value.explanation.text !== 'string' ||
      (value.missing_skill !== undefined && typeof value.missing_skill !== 'string') ||
      (value.proposed_files !== undefined && (!Array.isArray(value.proposed_files) ||
        !value.proposed_files.every(file => file && typeof file.file === 'string' &&
          typeof file.heading === 'string' && typeof file.content === 'string')))) return null
  return { ...value, names: Array.isArray(value.names) ? value.names.filter(name => typeof name === 'string' && name) : item.names,
    proposed_files: value.proposed_files || [], project: text(value.project) || item.project || null }
}

function dateLabel(value) {
  if (value === null || value === undefined || value === '') return words().unknownDate
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null
  const date = new Date(numeric === null ? value : numeric < 1e11 ? numeric * 1000 : numeric)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(
    document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' },
  ).format(date) : words().unknownDate
}

function nameLabel(item, t) { return item.names.length ? item.names.join(', ') : t[item.kind === 'skills' ? 'skill' : 'memory'] }
function kindLabel(item, t) {
  return item.kind !== 'skills' ? t.memory : item.skill_action === 'create' ? t.skillCreate
    : item.skill_action === 'files' ? t.skillFiles : t.skill
}
function projectLabel(item, t) { return item.project ? t.projectName(item.project) : t.unknownProject }
function originLabel(item, t) {
  return item.origin === 'background_review' ? t.auto
    : ['foreground', 'refine_review'].includes(item.origin) ? t.manual : t.unknownOrigin
}
function hashKey(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

function readable(value) {
  return text(value).replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^description:\s*/gm, 'Описание: ')
    .replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
}
function changeLabel(change, t) {
  return ['delete', 'remove_file', 'remove'].includes(change.action) ? t.deletion
    : change.full_replacement || ['edit', 'replace'].includes(change.action) || (change.action === 'write_file' && change.before !== null) ? t.replace
      : ['create', 'add'].includes(change.action) ? t.create : t.change
}
function Changes({ changes, t }) {
  return h('details', { 'data-hcv-activity-changes': '' }, h('summary', null, t.changes),
    changes.map((change, index) => h('section', { key: index, 'data-hcv-activity-change': '' },
      h('h3', null, `${changeLabel(change, t)} · ${change.name ? change.name + ' / ' : ''}${change.file}`),
      change.fragments_unavailable && h('p', null, t.fragmentsUnavailable),
      change.fragments.map((fragment, fragmentIndex) => h('div', { key: fragmentIndex, 'data-hcv-activity-fragment': '' },
        fragment.before && h('div', null, h('strong', null, t.before), h('p', null, readable(fragment.before))),
        fragment.after && h('div', null, h('strong', null, t.after), h('p', null, readable(fragment.after))))),
      h('details', { 'data-hcv-activity-full': '' }, h('summary', null, t.fullFile),
        h('strong', null, t.before), h('pre', { tabIndex: 0 }, change.before === null ? t.empty : change.before || t.empty),
        h('strong', null, t.after), h('pre', { tabIndex: 0 }, change.after === null ? t.removed : change.after || t.empty)))))
}
function ActivityEvents({ items, t, empty }) {
  if (!items.length) return h('p', { role: 'status' }, empty)
  const status = { running: t.now, completed: t.completed, interrupted: t.interrupted, failed: t.failed,
    unknown: t.resultUnknown, submitted: t.resultUnknown, approved: t.decisionApproved,
    rejected: t.decisionRejected, not_applied: t.notApplied }
  return h('ul', { 'data-hcv-activity-list': '' }, items.map(item => h('li', {
    key: item.id, 'data-hcv-activity-item': item.id,
  }, h('h3', null, item.category === 'review' ? t.review :
    `${item.kinds.includes('skills') ? t.skill : t.memory}${item.name ? ' · ' + item.name : ''}`),
  item.description && h('p', { 'data-hcv-activity-summary': '' }, readable(item.description)),
  h('p', { 'data-hcv-activity-meta': '' }, `${status[item.status]} · ${dateLabel(item.finished_at || item.started_at)}`))))
}

function ActivityDialog({ model, controller }) {
  const state = useValue(model)
  const t = words()
  if (!state.open) return null
  const selected = state.selected
  const detail = state.detail
  const loading = state.busy === 'detail'
  const mutating = ['approve', 'reject'].includes(state.busy)
  const listReady = state.listStatus === 'ready' && state.snapshot
  const locked = selected && state.locked.includes(itemKey(selected))
  const title = selected ? nameLabel(detail || selected, t) : t[state.section]
  const snapshot = state.snapshot
  const compact = compactSkill(selected)
  const creation = selected?.skill_action === 'create'
  const creationMatches = compact ? [] : relatedCreation(snapshot, detail)
  const linkedFiles = state.linkedFiles && snapshot?.items.find(item =>
    itemKey(item) === itemKey(state.linkedFiles) && item.version === state.linkedFiles.version)
  const filteredItems = snapshot?.items.filter(item => state.filter === 'all' || item.kind === state.filter) || []
  const filteredEvents = list => list.filter(item => state.filter === 'all' || item.kinds.includes(state.filter))
  const explanation = detail?.explanation ?? (loading && selected && controller.savedExplanation(selected))
  const unavailableFragments = detail?.changes.some(change => change.fragments_unavailable)
  const unavailableMessage = !detail?.changes.length
    ? detail?.preview && detail.preview !== detail.reason ? t.summaryUnavailableFull : t.summaryUnavailableOnly
    : unavailableFragments ? t.summaryUnavailableFull : t.summaryUnavailable
  const destructive = detail?.changes.some(change => change.full_replacement || ['delete', 'remove_file', 'remove', 'edit', 'replace'].includes(change.action) ||
    (change.action === 'write_file' && change.before !== null))
  const problem = creationIssueLabel(detail?.creation_issue, t)
  const actionsDisabled = Boolean(state.busy) || locked || (!compact && explanation?.status === 'pending')
  const actions = detail && h('div', { 'data-hcv-activity-actions': '' },
    h(Button, { type: 'button', variant: 'outline', disabled: actionsDisabled,
      onClick: () => controller.decide('reject') }, state.busy === 'reject' ? t.rejecting : t.reject),
    h(Button, { type: 'button', disabled: actionsDisabled || !detail.applicable,
      onClick: () => controller.decide('approve') }, state.busy === 'approve' ? t.approving : t.accept))
  const message = mutating ? t.decisionPending : state.message
  const compactTitle = creation ? t.newSkillProposal : t.skillFilesProposal
  const skillDescription = explanation?.status === 'ready' ? explanation.text
    : detail?.summary || selected?.summary || t.noSkillDescription
  const files = compact && detail && [...new Set([
    ...detail.changes.map(change => change.file), ...detail.proposed_files.map(file => file.file),
  ])]
  const fullText = compact && detail?.proposed_files.length
    ? detail.proposed_files.map(file => file.file + '\n\n' + file.content).join('\n\n') : detail?.preview
  const hasFullText = fullText && fullText !== detail.reason
  return h(Dialog, { open: true, onOpenChange: open => { if (!open) controller.close() } },
    h(DialogContent, {
      'data-hcv-activity': '', 'data-overlay-surface': '', blurBackdrop: false,
      'data-hcv-activity-compact': compact ? '' : undefined,
      onCloseAutoFocus: event => { event.preventDefault(); controller.returnFocus() },
    },
    h(DialogHeader, null,
      h(DialogTitle, null, compact ? state.showFull ? t.preview : compactTitle : t.title),
      compact && h('p', { 'data-hcv-activity-project': '' }, projectLabel(detail || selected, t)),
      h(DialogDescription, null, !compact ? t.description : creation ? skillDescription : title)),
    !compact && h('div', { 'data-hcv-activity-meta': '' }, `${t.profile}: ${state.profile}`),
    !selected && h('div', { 'data-hcv-activity-nav': '', role: 'group', 'aria-label': t.title },
      ['proposals', 'now', 'recent'].map(section => h(Button, { key: section, type: 'button', variant: 'text',
        'aria-pressed': state.section === section, onClick: () => controller.section(section) }, t[section]))),
    !selected && h('div', { 'data-hcv-activity-filter': '', role: 'group', 'aria-label': t.filter },
      [['all', 'all'], ['skills', 'skills'], ['memory', 'memories']].map(([filter, label]) =>
        h(Button, { key: filter, type: 'button', variant: 'text', 'aria-pressed': state.filter === filter,
          onClick: () => controller.filter(filter) }, t[label]))),
    !compact && h('div', { 'data-hcv-activity-toolbar': '' },
      selected && h(Button, { type: 'button', variant: 'text', disabled: mutating, onClick: controller.back }, t.back),
      h('h2', { 'data-hcv-activity-heading': '' }, title),
      h(Button, { type: 'button', variant: 'outline', disabled: Boolean(state.busy), onClick: () => controller.refresh(true) }, t.refresh)),
    h('p', { 'data-hcv-activity-message': '', role: 'status' }, message),
    h('div', { 'data-hcv-activity-body': '', 'aria-busy': state.busy === 'detail' || state.busy === 'list' },
      compact ? h('section', { 'data-hcv-activity-detail': '', 'aria-label': title },
        state.showFull && hasFullText ? h('pre', { 'data-hcv-activity-preview': '', tabIndex: 0 }, fullText)
          : !detail ? h('p', { role: 'status' }, loading ? t.readingProposal : state.detailError || t.previewError)
            : h('div', { 'data-hcv-activity-explanation': '' },
              creation && explanation.status === 'pending' && !mutating &&
                h('p', { 'data-hcv-activity-meta': '', role: 'status' }, t.waitingPurpose),
              !detail.applicable && !message && h('p', { 'data-hcv-activity-warning': '', role: 'status' },
                problem || (detail.missing_skill ? t.missingSkillNext : text(detail.reason) || t.unavailable)),
              destructive && h('p', { 'data-hcv-activity-warning': '' }, t.compactDestructive),
              actions),
        h('div', { 'data-hcv-activity-compact-footer': '' },
          !state.showFull && creation && h('p', { 'data-hcv-activity-meta': '' }, title),
          !state.showFull && files?.length > 0 && h('ul', { 'data-hcv-activity-meta': '' },
            files.map(file => h('li', { key: file }, file))),
          h('div', { 'data-hcv-activity-toolbar': '' },
            state.showFull
              ? h(Button, { type: 'button', variant: 'text', onClick: () => controller.showFull(false) }, t.backToProposal)
              : h(Button, { type: 'button', variant: 'text', disabled: mutating, onClick: controller.back }, t.back),
            !state.showFull && hasFullText && h(Button, { type: 'button', variant: 'text', disabled: mutating,
              onClick: () => controller.showFull(true) }, t.fullText),
            !state.showFull && linkedFiles && h(Button, { type: 'button', variant: 'text', disabled: Boolean(state.busy),
              onClick: () => controller.inspect(linkedFiles, true) }, t.skillFilesDetails),
            !state.showFull && creation && explanation?.status === 'error' && h(Button, {
              type: 'button', variant: 'text', disabled: Boolean(state.busy), onClick: controller.retryExplanation,
            }, t.retryPurpose),
            !state.showFull && (locked || state.detailError) && h(Button, { type: 'button', variant: 'text', disabled: Boolean(state.busy),
              onClick: () => controller.refresh(true) }, t.refresh))))
      : selected ? h('section', { 'data-hcv-activity-detail': '', 'aria-label': title },
        h('p', { 'data-hcv-activity-kind': '' }, kindLabel(detail || selected, t)),
        h('p', { 'data-hcv-activity-project': '' }, projectLabel(detail || selected, t)),
        h('p', { 'data-hcv-activity-meta': '' }, `${originLabel(selected, t)} · ${dateLabel(selected.created_at)}`),
        explanation ? h('div', { 'data-hcv-activity-explanation': '' },
            detail && !detail.applicable && h('p', { 'data-hcv-activity-warning': '', role: 'status' }, text(detail.reason) || t.unavailable),
            detail?.missing_skill && h('p', null, creationMatches.length ? t.missingSkillCreate : t.missingSkillNext),
            creationMatches.length === 1 && h(Button, { type: 'button', variant: 'outline', disabled: Boolean(state.busy),
              onClick: () => controller.inspect(creationMatches[0]) }, t.openCreate),
            explanation.status === 'ready' ? h('p', { 'data-hcv-activity-summary': '' }, explanation.text)
              : h('p', { role: 'status' }, explanation.status === 'pending' ? t.waitingSummary
                : explanation.status === 'error' ? t.summaryError : unavailableMessage),
            explanation.status === 'ready' && h('p', { 'data-hcv-activity-meta': '' }, t.summaryHint),
            explanation.status === 'error' && h(Button, { type: 'button', variant: 'outline', disabled: Boolean(state.busy),
              onClick: controller.retryExplanation }, t.retry),
            destructive && h('p', { 'data-hcv-activity-warning': '' }, t.destructive))
            : h('p', { role: 'status' }, loading ? t.previewLoading : state.detailError || t.previewError),
        locked && h('p', { 'data-hcv-activity-warning': '', role: 'status' }, t.locked),
        actions,
        detail?.changes.length > 0 && h(Changes, { changes: detail.changes, t }),
        detail && !detail.changes.length && detail.preview && detail.preview !== detail.reason && h('details', { 'data-hcv-activity-fallback': '' },
          h('summary', null, t.preview), h('pre', { 'data-hcv-activity-preview': '', tabIndex: 0 }, detail.preview)))
        : state.listStatus === 'loading' ? h('p', { role: 'status' }, t.loading)
          : state.listStatus === 'error' ? h('div', null,
            h('p', { role: 'status' }, state.listError || t.loadError),
            h(Button, { type: 'button', variant: 'outline', disabled: Boolean(state.busy), onClick: () => controller.refresh(true) }, t.retry))
            : listReady && state.section !== 'proposals' ? !snapshot.history_available
              ? h('p', { role: 'status' }, t.historyError)
              : h(ActivityEvents, { items: filteredEvents(state.section === 'now' ? snapshot.running : snapshot.recent),
                t, empty: state.section === 'now' ? t.noRunning : t.noRecent })
            : listReady && h('div', null,
              state.snapshot.invalid_count > 0 && h('p', { 'data-hcv-activity-warning': '', role: 'status' }, t.invalid),
              !filteredItems.length ? (state.snapshot.invalid_count === 0 ? h('p', { role: 'status' }, t.noItems) : null)
                : h('ul', { 'data-hcv-activity-list': '' }, filteredItems.map(item =>
                  h('li', { key: itemKey(item), 'data-hcv-activity-item': itemKey(item) },
                    h('div', { 'data-hcv-activity-item-title': '' },
                      item.skill_action === 'create'
                        ? [h('h3', { key: 'title' }, t.newSkillProposal), h('span', { key: 'name', 'data-hcv-activity-meta': '' }, nameLabel(item, t))]
                        : [h('span', { key: 'kind', 'data-hcv-activity-kind': '' }, kindLabel(item, t)), h('h3', { key: 'name' }, nameLabel(item, t))]),
                    h('p', { 'data-hcv-activity-project': '' }, projectLabel(item, t)),
                    item.skill_action !== 'create' && h('p', { 'data-hcv-activity-meta': '' }, `${originLabel(item, t)} · ${dateLabel(item.created_at)}`),
                    item.summary && h('p', { 'data-hcv-activity-summary': '' }, item.skill_action === 'create' ? item.summary : `${t.excerpt}: ${readable(item.summary)}`),
                    h(Button, { type: 'button', variant: 'outline', disabled: Boolean(state.busy),
                      onClick: () => controller.inspect(item) }, item.skill_action === 'create' ? t.inspectCreate : t.inspect))))))))
}

export function registerActivityCenter(ctx, active) {
  const root = document.documentElement
  const model = atom({ open: false, profile: host.state.profile.get() || 'default', snapshot: null,
    listStatus: 'loading', listError: '', selected: null, detail: null, detailError: '',
    section: 'proposals', filter: 'all', busy: null, locked: [], message: '', linkedFiles: null, showFull: false })
  let disposed = false, epoch = 0, identity = '', socket = null, gatewayState = ''
  const busyScopes = new Set()
  const networkBusy = () => busyScopes.has(identity)
  let pendingRefresh = null, button = null, buttonBadge = null
  let originFocus = null, scanQueued = false, summaryPoll = null, listPoll = null
  let stopPush = null, pushLease = null
  const locked = new Set()
  const memorySeen = new Map()
  const explanations = new Map()
  const enabled = () => !disposed && root.matches(active)
  let nativeHidden = null
  const windowIsVisible = () => !document.hidden &&
    !(nativeHidden === null ? root.hasAttribute('data-renderer-animations-paused') : nativeHidden)
  let windowVisible = windowIsVisible()
  const identityNow = () => JSON.stringify([host.state.connectionId.get() || null, host.state.profile.get() || 'default'])
  const current = token => enabled() && token === epoch && identityNow() === identity && host.getGateway() === socket &&
    gatewayState === 'open' && host.state.gateway.get() === 'open'
  const canWatchActivity = () => windowIsVisible() && enabled() && gatewayState === 'open'
  const write = patch => model.set({ ...model.get(), ...patch, locked: [...locked] })
  const controller = {
    open(from) {
      if (!enabled()) return
      scopeChanged()
      originFocus = from?.isConnected ? from : button
      write({ open: true, section: 'proposals', filter: 'all', selected: null, detail: null, detailError: '', message: '' })
      void refresh(false)
    },
    close() { stopSummaryPoll(); write({ open: false, selected: null, detail: null, detailError: '' }) },
    returnFocus() {
      const target = originFocus?.isConnected ? originFocus : button
      if (enabled() && target?.isConnected) target.focus({ preventScroll: true })
    },
    back() { if (!['approve', 'reject'].includes(model.get().busy)) {
      stopSummaryPoll(); write({ selected: null, detail: null, detailError: '', message: '' })
    } },
    section: section => write({ section, message: '' }),
    filter: filter => write({ filter, message: '' }),
    refresh: explicit => refresh(explicit),
    savedExplanation(item) {
      const saved = explanations.get(itemKey(item))
      return saved?.version === item.version ? saved.explanation : null
    },
    inspect: (item, standalone = false) => inspect(item, false, standalone),
    showFull: showFull => write({ showFull }),
    decide: action => decide(action), retryExplanation: () => retryExplanation(),
  }

  function stopSummaryPoll() { if (summaryPoll !== null) clearTimeout(summaryPoll); summaryPoll = null }
  function syncListPoll(readStartedAt = null) {
    const interval = 10000
    if (!canWatchActivity() || pushLease !== null && model.get().listStatus !== 'error') {
      if (listPoll !== null) clearTimeout(listPoll.timer)
      listPoll = null
    } else if (listPoll === null || (readStartedAt !== null && listPoll.deadline < readStartedAt + interval)) {
      // A fresh successful read replaces the due tick. Use request start so
      // time spent awaiting the response does not extend the refresh interval.
      if (listPoll !== null) clearTimeout(listPoll.timer)
      const now = performance.now()
      const deadline = (readStartedAt ?? now) + interval
      const timer = setTimeout(() => {
        listPoll = null
        if (windowIsVisible() && enabled() && !networkBusy()) void refresh(false)
        syncListPoll()
      }, Math.max(0, deadline - now))
      listPoll = { timer, deadline }
    }
  }
  function stopActivityPush() {
    stopPush?.()
    stopPush = null
    clearTimeout(pushLease)
    pushLease = null
  }
  function syncActivityPush() {
    if (!canWatchActivity()) { stopActivityPush(); return }
    const snapshot = model.get().snapshot
    if (snapshot && snapshot.change_feed !== true) { stopActivityPush(); return }
    if (!snapshot || stopPush || typeof ctx.socket !== 'function') return
    const token = epoch
    stopPush = ctx.socket('/activity/events', message => {
      if (!current(token) || !windowIsVisible() || message?.schema !== 1 ||
          !['ready', 'changed', 'heartbeat'].includes(message.kind)) return
      // The SDK reconnects, but does not expose an onclose callback. Only a
      // live feed can stand in for the polling timer, and missed changes are
      // reconciled on (re)connect before trusting that feed again.
      const needsRead = pushLease === null || message.kind !== 'heartbeat'
      clearTimeout(pushLease)
      pushLease = setTimeout(() => {
        pushLease = null
        if (!current(token) || !windowIsVisible()) return
        syncListPoll()
        void refresh(false)
      }, 9000)
      syncListPoll()
      if (needsRead) void refresh(false)
    })
  }
  function syncWindowVisibility() {
    const visible = windowIsVisible(), changed = visible !== windowVisible
    windowVisible = visible
    syncActivityPush()
    syncListPoll()
    if (changed && visible && enabled()) void refresh(false)
  }
  function finishRequest(token, route, refreshAfter = false) {
    busyScopes.delete(route)
    if (route !== identity) return
    const stillCurrent = current(token)
    if (stillCurrent) write({ busy: null })
    const queued = pendingRefresh
    pendingRefresh = null
    if (enabled() && (queued !== null || (refreshAfter && stillCurrent))) void refresh(queued === true)
  }
  function scheduleSummaryPoll(item) {
    stopSummaryPoll()
    summaryPoll = setTimeout(() => {
      summaryPoll = null
      const state = model.get()
      if (!state.open || itemKey(state.selected || {}) !== itemKey(item) || state.selected?.version !== item.version ||
          state.detail?.explanation.status !== 'pending') return
      if (networkBusy()) scheduleSummaryPoll(item)
      else void inspect(item, true)
    }, 2000)
  }

  function paintButton() {
    if (!button) return
    const state = model.get(), t = words()
    const ready = state.listStatus === 'ready' && state.snapshot && state.snapshot.invalid_count === 0
    const count = ready ? state.snapshot.items.length : null
    buttonBadge.textContent = count === null ? '?' : String(count)
    buttonBadge.hidden = count === 0 && state.snapshot.invalid_count === 0
    buttonBadge.dataset.hcvActivityUnknown = String(count === null || state.snapshot?.invalid_count > 0)
    const unknownMessage = state.snapshot?.invalid_count > 0 ? t.invalid : t.unknown
    button.setAttribute('aria-label', count === null ? `${t.title}: ${unknownMessage}`
      : `${t.title}: ${t.attention.toLowerCase()} ${count}${state.snapshot.invalid_count ? '. ' + t.invalid : ''}`)
    button.title = count === null ? `${t.title}: ${unknownMessage}` : `${t.title} · ${count}`
    button.setAttribute('aria-expanded', String(state.open))
  }

  function mountButton() {
    scanQueued = false
    if (!enabled()) { button?.remove(); return }
    const next = document.querySelector('[data-hcv-sidebar-bar]')
    const bell = next?.querySelector('[data-hcv-notifications]')
    if (!bell) return
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.dataset.hcvActivityButton = ''
      button.setAttribute('aria-haspopup', 'dialog')
      const glyph = document.createElement('span')
      glyph.dataset.hcvActivityGlyph = ''
      glyph.setAttribute('aria-hidden', 'true')
      buttonBadge = document.createElement('span')
      buttonBadge.dataset.hcvActivityCount = ''
      buttonBadge.setAttribute('aria-hidden', 'true')
      button.append(glyph, buttonBadge)
      button.addEventListener('click', () => controller.open(button))
    }
    if (button.parentElement !== next || button.nextElementSibling !== bell) next.insertBefore(button, bell)
    paintButton()
  }

  function scheduleMount() {
    if (scanQueued || disposed) return
    scanQueued = true
    queueMicrotask(mountButton)
  }

  function scopeChanged() {
    const nextIdentity = identityNow(), nextSocket = host.getGateway(), nextGatewayState = host.state.gateway.get()
    if (nextIdentity === identity && nextSocket === socket && nextGatewayState === gatewayState && enabled()) return false
    identity = nextIdentity
    socket = nextSocket
    gatewayState = nextGatewayState
    epoch++
    stopSummaryPoll()
    stopActivityPush()
    syncListPoll()
    locked.clear()
    explanations.clear()
    pendingRefresh = null
    write({ open: false, profile: host.state.profile.get() || 'default', snapshot: null,
      listStatus: gatewayState === 'open' ? 'loading' : 'error',
      listError: gatewayState === 'open' ? '' : words().disconnected,
      section: 'proposals', filter: 'all', selected: null, detail: null, detailError: '', busy: null, message: '' })
    syncActivityPush()
    scheduleMount()
    return true
  }

  function announce(snapshot) {
    const route = identity, backendScope = snapshot.scope, seenScope = `${route}\0${backendScope}`
    const key = `hermes-codex-visual:activity-seen:v1:${hashKey(seenScope)}`
    let seen = memorySeen.get(seenScope)
    if (!seen) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null')
        if (Array.isArray(stored)) seen = stored.filter(item => typeof item === 'string')
      } catch { /* A restricted browser can still deduplicate within this instance. */ }
      seen ||= []
    }
    const previous = new Set(seen)
    const fresh = snapshot.items.filter(item => !previous.has(`${itemKey(item)}:${item.version}`))
    const next = [...new Set([...seen, ...snapshot.items.map(item => `${itemKey(item)}:${item.version}`)])].slice(-512)
    memorySeen.set(seenScope, next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Optional metadata only. */ }
    if (!fresh.length) return
    const t = words()
    try {
      host.notify({ id: `hcv-activity-${hashKey(seenScope)}`, kind: 'info', title: t.title,
        message: `${t.attention}: ${snapshot.items.length} · ${model.get().profile}`,
        durationMs: 5000, action: { label: t.inspect, onClick: () => {
          if (route === identityNow() && model.get().snapshot?.scope === backendScope && enabled()) controller.open(button)
        } } })
    } catch { /* A toast failure must not hide the durable queue. */ }
  }

  async function refresh(explicit = false) {
    if (!enabled()) return
    scopeChanged()
    if (gatewayState !== 'open') return
    if (networkBusy()) {
      pendingRefresh = Boolean(explicit || pendingRefresh)
      return
    }
    const token = epoch, route = identity
    busyScopes.add(route)
    if (explicit) { stopSummaryPoll(); write({ selected: null, detail: null, detailError: '', message: '' }) }
    write({ busy: 'list', listStatus: model.get().snapshot ? model.get().listStatus : 'loading', listError: '' })
    const readStartedAt = performance.now()
    try {
      const response = await ctx.rest('/activity', { timeoutMs: 12000 })
      if (!current(token)) return
      const snapshot = activitySnapshot(response)
      if (!snapshot) throw new Error('Invalid activity snapshot')
      const previous = model.get()
      if (previous.snapshot?.scope && previous.snapshot.scope !== snapshot.scope) {
        locked.clear()
        explanations.clear()
        write({ selected: null, detail: null, detailError: '', message: '' })
      }
      const versions = new Map(snapshot.items.map(item => [itemKey(item), item.version]))
      for (const [key, saved] of explanations) if (versions.get(key) !== saved.version) explanations.delete(key)
      if (explicit) locked.clear()
      const selected = model.get().selected
      const selectedNow = selected && snapshot.items.find(item => itemKey(item) === itemKey(selected))
      write({ snapshot, listStatus: 'ready', listError: '',
        ...(selected && (!selectedNow || selectedNow.version !== selected.version)
          ? { selected: null, detail: null, detailError: '', message: model.get().message || words().stale } : {}) })
      syncActivityPush()
      syncListPoll(readStartedAt)
      announce(snapshot)
    } catch {
      if (current(token)) {
        write({ snapshot: null, listStatus: 'error', listError: words().loadError,
          selected: null, detail: null, detailError: '' })
        syncListPoll()
      }
    } finally {
      finishRequest(token, route)
    }
  }

  async function inspect(item, silent = false, standalone = false) {
    if (!enabled()) return
    scopeChanged()
    if (networkBusy()) return
    const snapshot = model.get().snapshot
    const fresh = snapshot?.items.find(candidate => itemKey(candidate) === itemKey(item) && candidate.version === item.version)
    if (!fresh) return
    const token = epoch, route = identity
    busyScopes.add(route)
    if (!silent) stopSummaryPoll()
    write(silent ? { busy: 'summary' } : { selected: fresh, detail: null, detailError: '', busy: 'detail',
      message: '', linkedFiles: null, showFull: false })
    let inspected = fresh
    const isShowing = () => current(token) && itemKey(model.get().selected || {}) === itemKey(inspected) &&
      model.get().selected?.version === inspected.version && model.get().snapshot?.scope === snapshot.scope
    try {
      let response = await ctx.rest(proposalPath(inspected), { timeoutMs: 12000 })
      if (!isShowing()) return
      let detail = activityDetail(response, inspected, snapshot.scope)
      if (!detail) throw new Error('Invalid activity detail')
      if (!silent && !standalone && fresh.skill_action === 'files') {
        const matches = relatedCreation(snapshot, detail)
        if (matches.length === 1) {
          inspected = matches[0]
          write({ selected: inspected, linkedFiles: fresh })
          response = await ctx.rest(proposalPath(inspected), { timeoutMs: 12000 })
          if (!isShowing()) return
          detail = activityDetail(response, inspected, snapshot.scope)
          if (!detail) throw new Error('Invalid activity detail')
        }
      }
      const key = itemKey(inspected)
      if (detail.explanation.status === 'ready') explanations.set(key, { version: inspected.version, explanation: detail.explanation })
      else explanations.delete(key)
      write({ detail, detailError: '' })
      if (detail.explanation.status === 'pending') scheduleSummaryPoll(inspected)
    } catch {
      if (isShowing()) {
        if (silent && model.get().detail) write({ detail: { ...model.get().detail, explanation: { status: 'error', text: '' } } })
        else write({ detail: null, detailError: words().previewError })
      }
    } finally {
      finishRequest(token, route)
    }
  }

  async function retryExplanation() {
    if (!enabled()) return
    scopeChanged()
    if (networkBusy()) return
    const state = model.get(), item = state.selected, detail = state.detail
    if (!item || !detail || !state.snapshot) return
    const token = epoch, route = identity
    busyScopes.add(route)
    write({ busy: 'summary' })
    try {
      const response = await ctx.rest(`${proposalPath(item)}/explanation`, { method: 'POST', timeoutMs: 12000,
        body: { scope: state.snapshot.scope, version: detail.version, signature: detail.signature } })
      if (!current(token)) return
      if (itemKey(model.get().selected || {}) !== itemKey(item) || model.get().selected?.version !== item.version ||
          model.get().snapshot?.scope !== state.snapshot.scope) return
      if (response?.scope !== state.snapshot.scope || !response.explanation ||
          !['pending', 'ready', 'error', 'unavailable'].includes(response.explanation.status) ||
          typeof response.explanation.text !== 'string') throw new Error('Invalid explanation')
      if (response.explanation.status === 'ready') {
        explanations.set(itemKey(item), { version: item.version, explanation: response.explanation })
      }
      write({ detail: { ...detail, explanation: response.explanation } })
      if (response.explanation.status === 'pending') scheduleSummaryPoll(item)
    } catch {
      if (current(token) && itemKey(model.get().selected || {}) === itemKey(item) && model.get().selected?.version === item.version)
        write({ detail: { ...detail, explanation: { status: 'error', text: '' } } })
    } finally {
      finishRequest(token, route)
    }
  }

  async function decide(action) {
    if (!enabled() || !['approve', 'reject'].includes(action)) return
    scopeChanged()
    if (networkBusy()) return
    const state = model.get(), item = state.selected, detail = state.detail
    if (!state.snapshot || !item || !detail || locked.has(itemKey(item)) ||
        (!compactSkill(item) && detail.explanation.status === 'pending') || (action === 'approve' && !detail.applicable)) return
    const token = epoch, route = identity
    const key = itemKey(item)
    busyScopes.add(route)
    write({ busy: action, message: '' })
    try {
      const response = await ctx.rest(`${proposalPath(item)}/${action}`, { method: 'POST', timeoutMs: 30000,
        body: { scope: state.snapshot.scope, version: detail.version, signature: detail.signature } })
      if (!current(token)) return
      if (response?.scope !== state.snapshot.scope || response.status !== (action === 'approve' ? 'approved' : 'rejected'))
        throw new Error('Unconfirmed decision')
      explanations.delete(key)
      const t = words()
      let message = action === 'approve' ? t.approved : t.rejected
      if (action === 'approve' && item.skill_action === 'create') message = t.skillCreated(nameLabel(item, t))
      if (action === 'approve' && item.skill_action === 'files') message = t.skillFilesApplied
      write({ selected: null, detail: null, detailError: '', snapshot: { ...state.snapshot,
        items: state.snapshot.items.filter(candidate => itemKey(candidate) !== key) }, message })
      stopSummaryPoll()
    } catch (error) {
      if (!current(token)) return
      const t = words()
      const issue = decisionErrorDetail(error)
      if (action === 'approve' && creationIssueLabel(issue, t)) {
        write({ detail: { ...detail, applicable: false, creation_issue: issue } })
      } else {
        locked.add(key)
        // A timed-out POST may already have changed the queue. Never auto-retry it.
        write({ message: issue?.code === 'skill_apply_refused' ? t.decisionRefused
          : /\b409\b|stale|conflict/i.test(text(error?.message)) ? t.stale : t.uncertain })
      }
    } finally {
      finishRequest(token, route, true)
    }
  }

  let previousBadgeState = model.get()
  const unsubscribe = model.listen(state => {
    const { open, listStatus, snapshot } = previousBadgeState
    previousBadgeState = state
    if (state.open !== open || state.listStatus !== listStatus ||
        state.snapshot?.invalid_count !== snapshot?.invalid_count ||
        state.snapshot?.items.length !== snapshot?.items.length) paintButton()
  })
  ctx.addEventListener(window, sidebarHeaderEvent, scheduleMount)
  const theme = new MutationObserver(() => {
    scopeChanged()
    scheduleMount()
    syncActivityPush()
    syncListPoll()
    if (enabled()) void refresh(false)
  })
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-codex-visual', 'data-hermes-theme', 'lang'] })
  const scopeSubscriptions = [host.state.connectionId, host.state.profile, host.state.gateway].filter(Boolean)
    .map(value => value.listen(() => { scopeChanged(); if (enabled()) void refresh(false) }))
  const stopWindowState = window.hermesDesktop?.onWindowStateChanged?.(state => {
    if (typeof state?.isMinimized !== 'boolean' && typeof state?.isVisible !== 'boolean') return
    nativeHidden = state.isMinimized === true || state.isVisible === false
    syncWindowVisibility()
  })
  const visibility = new MutationObserver(syncWindowVisibility)
  visibility.observe(root, { attributes: true, attributeFilter: ['data-renderer-animations-paused'] })
  ctx.addEventListener(window, 'focus', () => { if (enabled() && windowIsVisible()) void refresh(false) })
  ctx.addEventListener(document, 'visibilitychange', syncWindowVisibility)
  ctx.onEvent?.('review.summary', () => { if (enabled()) void refresh(false) })
  ctx.register({ id: 'activity-center', area: TITLEBAR_AREAS.center, render: () => h(ActivityDialog, { model, controller }) })
  mountCSS(ctx, 'data-hcv-activity-style', activityStyles(active), { surface: '[data-hcv-activity-button], [data-hcv-activity]' })
  scopeChanged()
  mountButton()
  if (enabled()) void refresh(false)
  ctx.onDispose(() => {
    disposed = true
    epoch++
    stopSummaryPoll()
    stopActivityPush()
    syncListPoll()
    visibility.disconnect()
    stopWindowState?.()
    theme.disconnect()
    unsubscribe()
    scopeSubscriptions.forEach(stop => stop())
    button?.remove()
    model.set({ ...model.get(), open: false, snapshot: null, selected: null, detail: null })
    memorySeen.clear()
    explanations.clear()
    locked.clear()
  })
  return controller
}

function activityStyles(active) {
  const dialog = `${active} [data-hcv-activity]`
  return `
    ${active} [data-hcv-activity-button] { position: relative; flex: none; inline-size: 30px; block-size: 30px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--hcv-muted); cursor: pointer; }
    ${active} [data-hcv-activity-button]:is(:hover, [aria-expanded="true"]) { background: var(--hcv-hover); color: var(--hcv-text); }
    ${active} [data-hcv-activity-button]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${active} [data-hcv-activity-glyph] { inline-size: 18px; block-size: 18px; background: currentColor; mask: ${codexMask('bolt')} center / contain no-repeat; }
    ${active} [data-hcv-activity-count] { position: absolute; inset-block-start: -2px; inset-inline-end: -3px; min-inline-size: 15px; block-size: 15px; padding-inline: 3px; border-radius: 8px; background: var(--hcv-action); color: var(--hcv-ink); font: 600 10px/15px var(--hcv-ui-font); text-align: center; }
    ${active} [data-hcv-activity-count][data-hcv-activity-unknown="true"] { background: var(--hcv-hover); color: var(--hcv-text); }
    ${active} [data-hcv-activity-count][hidden] { display: none; }
    ${dialog} { inline-size: min(760px, calc(100vw - 32px)); max-inline-size: none; max-block-size: calc(100dvh - 48px); display: flex; flex-direction: column; gap: 12px; overflow: hidden; border-radius: 16px; background: var(--hcv-menu); color: var(--hcv-text); font-family: var(--hcv-ui-font); }
    ${dialog}[data-hcv-activity-compact] { inline-size: min(560px, calc(100vw - 32px)); }
    ${dialog} [data-hcv-activity-compact-footer] { display: grid; gap: 4px; padding-block-start: 8px; border-block-start: 1px solid var(--hcv-stroke); }
    ${dialog} [data-hcv-activity-compact-footer] ul { padding-inline-start: 18px; }
    ${dialog} [data-hcv-activity-compact-footer] [data-slot="button"] { font-size: 12px; color: var(--hcv-muted); }
    /* Codex 26.1111.2228.0: Sm6l/L4lx default, cardAction and dialogAction
       use rounded-full; 66582da7ee6b.css defines --radius-full as 9999px. */
    ${dialog} [data-slot="button"] { border-radius: 9999px; }
    ${dialog} [data-slot="dialog-header"] { flex: none; padding-inline-end: 28px; text-align: start; }
    ${dialog} [data-slot="dialog-title"] { font-size: 20px; line-height: 28px; font-weight: 600; }
    ${dialog} [data-slot="dialog-description"] { color: var(--hcv-muted); font-size: 14px; line-height: 21px; }
    ${dialog} [data-hcv-activity-meta] { margin: 0; color: var(--hcv-muted); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-project] { margin: 0; color: var(--hcv-muted); font-size: 13px; line-height: 19px; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-nav], ${dialog} [data-hcv-activity-filter] { display: flex; flex-wrap: wrap; gap: 4px; }
    ${dialog} :is([data-hcv-activity-nav], [data-hcv-activity-filter]) [aria-pressed="true"] { background: var(--hcv-hover); color: var(--hcv-text); }
    ${dialog} [data-hcv-activity-toolbar] { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: none; }
    ${dialog} [data-hcv-activity-heading] { flex: 1; min-inline-size: 0; margin: 0; font-size: 14px; line-height: 21px; font-weight: 600; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-body] { min-block-size: 0; min-inline-size: 0; overflow: auto; overscroll-behavior: contain; font-size: 14px; line-height: 21px; }
    ${dialog} [data-hcv-activity-list] { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    ${dialog} [data-hcv-activity-item] { display: grid; gap: 8px; min-inline-size: 0; padding: 14px 16px; border: 1px solid var(--hcv-stroke); border-radius: 14px; background: var(--hcv-panel); }
    ${dialog} [data-hcv-activity-item] > button { justify-self: start; }
    ${dialog} [data-hcv-activity-item-title] { display: grid; gap: 2px; }
    ${dialog} [data-hcv-activity-item-title] h3 { margin: 0; font-size: 14px; line-height: 21px; font-weight: 600; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-kind] { color: var(--hcv-muted); font-size: 12px; }
    ${dialog} [data-hcv-activity-summary], ${dialog} [data-hcv-activity-message], ${dialog} [data-hcv-activity-warning] { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-message]:empty { position: absolute; }
    ${dialog}[data-hcv-activity-compact] [data-slot="dialog-description"] { color: var(--hcv-text); overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-detail] { display: grid; gap: 12px; }
    ${dialog} [data-hcv-activity-explanation] { display: grid; gap: 8px; }
    ${dialog} [data-hcv-activity-explanation] > p { margin: 0; }
    ${dialog} [data-hcv-activity-explanation] > button { justify-self: start; }
    ${dialog} :is([data-hcv-activity-changes], [data-hcv-activity-full], [data-hcv-activity-fallback]) > summary { cursor: pointer; color: var(--hcv-text); font-weight: 600; }
    ${dialog} [data-hcv-activity-change] { margin-block: 12px; padding: 12px; border: 1px solid var(--hcv-stroke); border-radius: 8px; }
    ${dialog} [data-hcv-activity-change] h3 { margin: 0 0 8px; font-size: 14px; line-height: 21px; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-fragment] { display: grid; gap: 8px; margin-block: 10px; }
    ${dialog} [data-hcv-activity-fragment] p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    ${dialog} [data-hcv-activity-full] pre { max-block-size: 45dvh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/20px var(--hcv-ui-font); user-select: text; }
    ${dialog} [data-hcv-activity-preview] { margin: 8px 0; padding: 12px; border: 1px solid var(--hcv-stroke); border-radius: 8px; max-block-size: min(52dvh, 460px); overflow: auto; overscroll-behavior: contain; background: var(--hcv-chat); white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/20px var(--hcv-ui-font); user-select: text; }
    ${dialog} [data-hcv-activity-preview]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${dialog} [data-hcv-activity-actions] { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    @media (max-width: 520px) { ${dialog} { inline-size: calc(100vw - 16px); max-block-size: calc(100dvh - 24px); } ${dialog} [data-hcv-activity-item] { padding: 12px; } }
  `
}
