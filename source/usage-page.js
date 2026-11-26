import { createElement as h, Fragment, useEffect, useId, useRef, useState } from 'react'
import { host, useValue } from '@hermes/plugin-sdk'
import { UsageGroupSelect } from './usage-group-select.js'
import { UsageHistoryCard } from './usage-history-chart.js'

const isRu = () => document.documentElement.lang.toLowerCase().startsWith('ru')
const words = {
  ru: {
    overview: 'Обзор', analytics: 'Аналитика', loading: 'Загружаем данные…', unavailable: 'Нет данных',
    retry: 'Повторить', error: 'Не удалось получить данные. Проверьте подключение аккаунта Codex и повторите.',
    mismatch: 'Аккаунт изменился. Обновите страницу, чтобы получить данные выбранного аккаунта.',
    limits: 'Лимиты тарифного плана', limitsHint: 'Общий лимит аккаунта для Codex и других поддерживаемых сервисов OpenAI.',
    left: 'Остаётся', resetIn: 'До сброса', weekly: 'Недельный лимит', five: '5-часовой лимит',
    allow: 'Разрешить ассистенту использовать сбросы лимитов',
    allowHint: 'Ассистент может предложить сброс только по вашей просьбе, когда осталось не более 10% лимита. Подтверждение остаётся за вами. Доступность зависит от инструментов чата.',
    allowUnavailable: 'Эта возможность пока недоступна в Hermes. Сброс можно выполнить вручную с подтверждением.',
    requested: 'Ассистент запросил сброс лимита', requestedHint: 'Проверьте запрос и подтвердите сброс, если хотите его использовать.',
    reviewRequest: 'Проверить запрос', settingFailed: 'Не удалось сохранить настройку.',
    resets: 'Сброс лимита использования', resetsHint: 'Восстановите лимит при помощи доступного сброса.',
    noResets: 'Доступных сбросов нет.', available: 'Доступно', reset: 'Использовать сброс', expires: 'Срок действия истекает',
    credits: 'Кредиты', creditsHint: 'Текущий баланс кредитов аккаунта OpenAI.', balance: 'Текущий баланс',
    confirmTitle: 'Использовать сброс?', confirmText: 'Сброс восстановит лимит и потратит один сохранённый сброс. Это действие нельзя отменить.',
    confirmAccount: 'Аккаунт Codex активного профиля Hermes', confirmReset: 'Выбранный сброс',
    cancel: 'Отмена', confirm: 'Подтвердить', processing: 'Выполняем…',
    resetDone: 'Сброс использован.', resetFailed: 'Не удалось использовать сброс. Обновите данные.',
    resetUnknown: 'Результат сброса неизвестен. Проверьте лимиты и список сбросов перед новым действием.',
    history: 'История использования', historyHint: 'Расход лимита всего аккаунта OpenAI, включая Codex и Hermes.',
    allAccount: 'Весь аккаунт', seven: '7 дн.', thirty: '30 дн.', feature: 'По функциям',
    model: 'По моделям', surface: 'По интерфейсам', trigger: 'По источнику запуска хода',
    previous: 'Предыдущий период', next: 'Следующий период', chartUnavailable: 'Разбивка за этот период недоступна.',
    chats: 'Топ чатов', chatsHint: 'Расход чатов Hermes за всё время относительно текущего недельного лимита.',
    chat: 'Чат', weeklyPercent: '% от недельного лимита', usedCredits: 'Использовано кредитов',
    more: 'Показать ещё', less: 'Свернуть', models: 'Модель', effort: 'Усилие', speed: 'Скорость',
    open: 'Открыть чат', noChats: 'В этом профиле пока нет чатов с доступной статистикой.',
    chatPartial: 'Данные могут быть неполными.',
    planHistory: 'История использования лимитов плана', planHint: 'Данные всего аккаунта. История может обновляться с задержкой.',
    weeklyLimits: 'Недельные лимиты', period: 'Период', used: 'Использовано, % от лимита',
    noPlan: 'История лимитов недоступна.', incomplete: 'Данные за период могут быть неполными.',
    planPartial: 'История может быть приблизительной или неполной.', asOf: 'Данные по состоянию на',
    unknown: 'Неизвестно', noBreakdown: 'Нет разбивки', status: 'Состояние', close: 'Закрыть',
    openError: 'Не удалось открыть чат.', accountChanged: 'Аккаунт или профиль изменился. Данные не смешаны.',
  },
  en: {
    overview: 'Overview', analytics: 'Analytics', loading: 'Loading…', unavailable: 'Unavailable',
    retry: 'Retry', error: 'Could not load usage. Check the Codex account and try again.',
    mismatch: 'The account changed. Refresh to load the selected account.',
    limits: 'Plan limits', limitsHint: 'Account-wide allowance for Codex and other supported OpenAI services.',
    left: 'Remaining', resetIn: 'Resets in', weekly: 'Weekly limit', five: '5-hour limit',
    allow: 'Allow the assistant to use limit resets',
    allowHint: 'The assistant can request a reset only when you ask and at most 10% remains. You must confirm it. Availability depends on the tools enabled for the chat.',
    allowUnavailable: 'This is not available in Hermes yet. You can use a reset manually with confirmation.',
    requested: 'The assistant requested a reset', requestedHint: 'Review and confirm the request if you want to use it.',
    reviewRequest: 'Review request', settingFailed: 'Could not save the setting.',
    resets: 'Usage limit resets', resetsHint: 'Restore your allowance with an available reset.',
    noResets: 'No resets available.', available: 'Available', reset: 'Use reset', expires: 'Expires',
    credits: 'Credits', creditsHint: 'Current OpenAI account credit balance.', balance: 'Current balance',
    confirmTitle: 'Use this reset?', confirmText: 'This restores the allowance and uses one saved reset. This cannot be undone.',
    confirmAccount: 'Codex account of the active Hermes profile', confirmReset: 'Selected reset',
    cancel: 'Cancel', confirm: 'Confirm', processing: 'Working…',
    resetDone: 'Reset used.', resetFailed: 'Could not use the reset. Refresh the data.',
    resetUnknown: 'The result is unknown. Check your limits and available resets before another action.',
    history: 'Usage history', historyHint: 'Usage across the OpenAI account, including Codex and Hermes.',
    allAccount: 'Entire account', seven: '7 days', thirty: '30 days', feature: 'By feature',
    model: 'By model', surface: 'By interface', trigger: 'By turn source',
    previous: 'Previous period', next: 'Next period', chartUnavailable: 'Breakdown unavailable for this period.',
    chats: 'Top chats', chatsHint: 'Lifetime Hermes chat usage relative to the current weekly allowance.',
    chat: 'Chat', weeklyPercent: '% of weekly limit', usedCredits: 'Credits used',
    more: 'Show more', less: 'Show less', models: 'Model', effort: 'Reasoning', speed: 'Speed',
    open: 'Open chat', noChats: 'There are no chats with usage in this profile yet.',
    chatPartial: 'Data may be incomplete.',
    planHistory: 'Plan limit history', planHint: 'Account-wide data. History may update with a delay.',
    weeklyLimits: 'Weekly limits', period: 'Period', used: 'Used, % of limit',
    noPlan: 'Limit history unavailable.', incomplete: 'Data for this period may be incomplete.',
    planPartial: 'History may be approximate or incomplete.', asOf: 'Data as of',
    unknown: 'Unknown', noBreakdown: 'No breakdown', status: 'Status', close: 'Close',
    openError: 'Could not open the chat.', accountChanged: 'Account or profile changed. Data was not combined.',
  },
}
const copy = () => isRu() ? words.ru : words.en
const locale = () => isRu() ? 'ru-RU' : 'en-US'
const numeric = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
export function formatAmount(value, digits = 2) {
  const n = numeric(value)
  return n === null ? '—' : new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n)
}
export function percent(value) {
  const n = numeric(value)
  if (n === null) return '—'
  if (n > 0 && n < 0.005) return '< ' + formatAmount(0.01) + ' %'
  return formatAmount(n) + ' %'
}
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null
  const v = typeof value === 'number' ? value * (value < 1e12 ? 1000 : 1) : value
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}
export function dateLabel(value, opts = { day: 'numeric', month: 'short' }) {
  const d = parseDate(value)
  const options = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { ...opts, timeZone: 'UTC' } : opts
  return d ? new Intl.DateTimeFormat(locale(), options).format(d) : '—'
}
export function resetTitle(credit) {
  if (credit?.reset_type === 'codex_rate_limits') return isRu() ? 'Полный сброс' : 'Full reset'
  return credit?.title || (isRu() ? 'Сброс лимита' : 'Limit reset')
}
function until(value) {
  const d = parseDate(value)
  if (!d) return '—'
  const mins = Math.max(0, Math.floor((d.getTime() - Date.now()) / 60000))
  const days = Math.floor(mins / 1440), hours = Math.floor(mins % 1440 / 60), m = mins % 60
  return days ? (isRu() ? `${days} дн. ${hours} ч` : `${days}d ${hours}h`)
    : hours ? (isRu() ? `${hours} ч ${m} мин` : `${hours}h ${m}m`) : (isRu() ? `${m} мин` : `${m}m`)
}
export function valueName(value, dimension) {
  if (!value || value === 'unknown') return copy().unknown
  const ru = isRu()
  const names = {
    feature: ru ? {
      user: 'Чаты', chat: 'Чаты', chats: 'Чаты', thread: 'Чаты', subagent: 'Субагенты', subagents: 'Субагенты',
      agent_created_thread: 'Чаты, созданные агентом', aeon_child: 'Чаты, созданные агентом',
      title_generation: 'Названия чатов', thread_title: 'Названия чатов',
      thread_description: 'Описания чатов', memory: 'Обновления памяти', memory_consolidation: 'Обновления памяти',
    } : { user: 'Chats', chat: 'Chats', chats: 'Chats', thread: 'Chats', subagent: 'Subagents', subagents: 'Subagents',
      agent_created_thread: 'Agent-created chats', aeon_child: 'Agent-created chats',
      title_generation: 'Chat titles', thread_title: 'Chat titles', thread_description: 'Chat descriptions',
      memory: 'Memory updates', memory_consolidation: 'Memory updates' },
    surface: { desktop_app: 'Codex Desktop', sdk: 'SDK' },
    trigger: ru ? { user: 'Пользователь', composer: 'Поле ввода', app_tool_create_thread: 'Создание чата инструментом',
      edit_user_message: 'Изменение сообщения', exec: 'Запуск команды', memory_consolidation: 'Обновления памяти',
      resume_interrupted_task: 'Возобновление задачи', send_user_message_async_question: 'Ответ на вопрос',
      thread_description: 'Описания чатов', thread_title: 'Названия чатов' }
      : { user: 'User', composer: 'Composer', app_tool_create_thread: 'Chat created by a tool',
        edit_user_message: 'Message edit', exec: 'Command', memory_consolidation: 'Memory updates',
        resume_interrupted_task: 'Resumed task', send_user_message_async_question: 'Answer to a question',
        thread_description: 'Chat descriptions', thread_title: 'Chat titles' },
    reasoning_effort: ru ? { high: 'Высокое', medium: 'Среднее', low: 'Лёгкое', max: 'Максимальное' } : {},
    speed: ru ? { standard: 'Стандартный', priority: 'Быстрый', fast: 'Быстрый' } : {},
  }
  return names[dimension]?.[value] || value
}

function categoryKey(value, dimension) {
  if (!value) return 'unknown'
  if (dimension === 'feature') {
    if (['user', 'chat', 'chats', 'thread'].includes(value)) return 'chat'
    if (value === 'aeon_child') return 'agent_created_thread'
    if (value === 'subagents') return 'subagent'
    if (value === 'memory') return 'memory_consolidation'
    if (value === 'title_generation') return 'thread_title'
  }
  return value
}

export function mergePlanBreakdown(rows, dimension) {
  const values = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = categoryKey(row?.key, dimension)
    const amount = numeric(row?.basis_points)
    const previous = values.get(key)
    values.set(key, amount === null || previous === null ? null : (previous || 0) + amount)
  }
  return [...values].map(([key, basis_points]) => ({ key, basis_points }))
}

// Uses only attributed values from the server; a missing breakdown is not a zero.
export function aggregateHistory(data, dimension) {
  const key = { feature: 'thread_source', model: 'model', surface: 'surface', trigger: 'turn_trigger' }[dimension]
  const days = Array.isArray(data) ? data : []
  const totals = new Map()
  const stackKeys = new Map()
  let available = false
  let incomplete = false
  const chart = days.map(day => {
    const rows = Array.isArray(day?.attribution) ? day.attribution : null
    if (!rows) { incomplete = true; return { date: day?.date, values: new Map(), available: false } }
    available = true
    const values = new Map()
    for (const row of rows) {
      const n = numeric(row?.value)
      if (n === null || n < 0) { incomplete = true; continue }
      const label = categoryKey(row?.[key], dimension)
      const sourceKey = dimension === 'feature' && row?.[key] === 'aeon_child'
        ? 'agent_created_thread' : row?.[key] || 'unknown'
      if (!stackKeys.has(label) || sourceKey < stackKeys.get(label)) stackKeys.set(label, sourceKey)
      values.set(label, (values.get(label) || 0) + n)
      totals.set(label, (totals.get(label) || 0) + n)
    }
    return { date: day?.date, values, available: true }
  })
  const categories = [...totals].sort((a, b) => b[1] - a[1])
  const stackOrder = [...stackKeys].sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).map(([label]) => label)
  return { chart, categories, stackOrder, total: categories.reduce((sum, [, n]) => sum + n, 0), available, incomplete }
}

export function groupUsage(usage, dimension) {
  if (!usage || usage.data_status === 'unavailable' || !Array.isArray(usage.groups)) return []
  // The table's selected measure is the weekly limit, as in Codex. Credit
  // proportions must not be silently relabelled as weekly proportions.
  const metric = 'weekly_limit_percent'
  const total = numeric(usage[metric])
  const groups = new Map()
  for (const row of usage.groups) {
    const key = row?.[dimension] || 'unknown'
    const n = numeric(row?.[metric])
    const previous = groups.get(key)
    groups.set(key, n === null || previous === null ? null : (previous || 0) + n)
  }
  return [...groups].map(([name, n]) => ({ name, share: total && n !== null ? n / total * 100 : null }))
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1))
}

function useResource(ctx, path, localScope, expected, enabled, revision, preserve = false) {
  const [state, setState] = useState({ localScope: null, expected: null, status: 'loading', data: null })
  useEffect(() => {
    if (!enabled) return
    let live = true
    setState(previous => preserve && previous.localScope === localScope && previous.expected === expected && previous.data
      ? { ...previous, status: 'refreshing' } : { localScope, expected, status: 'loading', data: null })
    Promise.resolve().then(() => ctx.rest(path, { timeoutMs: 60000 })).then(data => {
      if (!live) return
      if (!data || typeof data !== 'object' || typeof data.scope !== 'string' || !data.scope ||
          (expected && data.scope !== expected)) {
        setState({ localScope, expected, status: 'mismatch', data: null })
      } else setState({ localScope, expected, status: 'ready', data })
    }).catch(() => { if (live) setState({ localScope, expected, status: 'error', data: null }) })
    return () => { live = false }
  }, [ctx, path, localScope, expected, enabled, revision, preserve])
  if (!enabled || state.localScope !== localScope || state.expected !== expected) return { status: 'loading', data: null }
  return state
}
function State({ state, retry }) {
  const t = copy()
  if (state.status === 'ready') return null
  return h('div', { 'data-u-card': '', 'data-u-pad': '', role: 'status' },
    state.status === 'loading' ? t.loading : state.status === 'mismatch' ? t.mismatch : t.error,
    state.status !== 'loading' && h('div', { style: { marginTop: 12 } },
      h('button', { type: 'button', 'data-u-button': '', onClick: retry }, t.retry)))
}
const Section = ({ title, hint, children, kind, action }) => h('section', { 'data-u-section': '', 'data-u-kind': kind },
  action ? h('div', { 'data-u-section-heading': '' }, h('h2', null, title), action) : h('h2', null, title),
  hint && h('p', null, hint), children)

function Limits({ overview }) {
  const t = copy()
  const windows = Array.isArray(overview?.account?.windows) ? overview.account.windows : []
  return h(Section, { title: t.limits, hint: t.limitsHint, kind: 'limits' },
    h('div', { 'data-u-card': '' }, windows.length ? windows.map((w, i) => {
      const used = numeric(w.used_percent)
      const remain = used === null ? null : Math.max(0, Math.min(100, 100 - used))
      const text = /week|недел/i.test(w.label || '') ? t.weekly : /session|5.?hour|5.?h/i.test(w.label || '') ? t.five : w.label || t.unknown
      return h('div', { 'data-u-pad': '', key: i },
        h('h3', null, text),
        h('div', { 'data-u-row': '', 'data-u-muted': '', 'data-u-small': '' },
          h('span', null, t.resetIn + ': ' + until(w.reset_at || w.resets_at)),
          h('span', null, t.left + ' ' + percent(remain))),
        h('div', { 'data-u-meter': '', role: 'progressbar', 'aria-label': text,
          'aria-valuemin': 0, 'aria-valuemax': 100, ...(remain === null ? {} : { 'aria-valuenow': remain }) },
        h('span', { style: { width: (remain ?? 0) + '%' } })))
    }) : h('div', { 'data-u-pad': '', 'data-u-muted': '' }, t.unavailable)))
}

function ResetDialog({ ctx, prepared, onClose, onResult, scopeKey, currentScope, profile }) {
  const t = copy(), dialog = useRef(null), busy = useRef(false)
  const [working, setWorking] = useState(false)
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (typeof el.showModal === 'function' && !el.open) el.showModal()
    return () => { if (el.open) el.close() }
  }, [])
  async function confirm() {
    if (busy.current) return
    busy.current = true
    setWorking(true)
    if (currentScope() !== scopeKey) { onResult('mismatch', prepared.credit_id); return }
    try {
      const result = await ctx.rest('/reset/confirm', { method: 'POST',
        body: { nonce: prepared.nonce, not_after: Date.now() / 1000 + 25 }, timeoutMs: 50000 })
      if (currentScope() !== scopeKey || result?.scope !== prepared.scope) onResult('unknown', prepared.credit_id)
      else onResult(result?.status || 'unknown', prepared.credit_id)
    } catch { onResult('unknown', prepared.credit_id) }
  }
  return h('dialog', { ref: dialog, onCancel: e => { e.preventDefault(); if (!working) onClose() },
    'aria-labelledby': 'hcv-usage-reset-title' },
    h('h2', { id: 'hcv-usage-reset-title' }, t.confirmTitle),
    h('p', { style: { marginTop: 10 }, 'data-u-muted': '' }, t.confirmText),
    h('p', { style: { marginTop: 12 } }, t.confirmAccount + ': ' + profile),
    h('p', { style: { marginTop: 4 } }, t.confirmReset + ': ' + resetTitle(prepared.credit)),
    prepared.credit?.expires_at && h('p', { 'data-u-muted': '', 'data-u-small': '' }, t.expires + ' ' +
      dateLabel(prepared.credit.expires_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
    h('div', { 'data-u-actions': '' },
      h('button', { type: 'button', 'data-u-button': '', disabled: working, onClick: onClose }, t.cancel),
      h('button', { type: 'button', 'data-u-button': 'primary', disabled: working, onClick: confirm }, working ? t.processing : t.confirm)))
}
function Overview({ ctx, data, scopeKey, currentScope, reload, onBusyChange, profile }) {
  const t = copy()
  const [preparing, setPreparing] = useState(null), [prepared, setPrepared] = useState(null)
  const [message, setMessage] = useState(''), [blocked, setBlocked] = useState(() => new Set())
  const [settingBusy, setSettingBusy] = useState(false), [settingError, setSettingError] = useState('')
  const [settingValue, setSettingValue] = useState(null)
  const resets = Array.isArray(data?.resets) ? data.resets : null
  const pending = data?.assistant_pending
  const assistantEnabled = settingValue ?? data?.assistant_enabled === true
  useEffect(() => {
    onBusyChange(Boolean(preparing || prepared || settingBusy))
    return () => onBusyChange(false)
  }, [preparing, prepared, settingBusy, onBusyChange])
  useEffect(() => {
    if (settingValue !== null && data?.assistant_enabled === settingValue) setSettingValue(null)
  }, [data?.assistant_enabled, settingValue])
  async function setAssistant(enabled) {
    if (settingBusy || (!data.assistant_available && enabled)) return
    onBusyChange(true)
    setSettingBusy(true); setSettingError('')
    try {
      const response = await ctx.rest('/assistant/setting', { method: 'POST', body: { enabled, scope: data.scope }, timeoutMs: 60000 })
      if (currentScope() !== scopeKey || response?.scope !== data.scope) throw new Error('scope')
      setSettingValue(enabled)
      reload()
    } catch { setSettingError(t.settingFailed) }
    finally { setSettingBusy(false) }
  }
  async function prepare(credit, pendingId) {
    if (preparing || blocked.has(credit.id)) return
    onBusyChange(true)
    setPreparing(credit.id); setMessage('')
    try {
      const body = { credit_id: credit.id, scope: data.scope, ...(pendingId ? { pending_id: pendingId } : {}) }
      const result = await ctx.rest('/reset/prepare', { method: 'POST', body, timeoutMs: 60000 })
      if (currentScope() !== scopeKey || result?.scope !== data.scope || !result?.nonce) throw new Error('scope')
      setPrepared({ ...result, credit_id: credit.id })
    } catch { setMessage(t.resetFailed) }
    finally { setPreparing(null) }
  }
  function result(status, creditId) {
    setPrepared(null)
    if (status === 'unknown' || status === 'mismatch') {
      setBlocked(old => new Set([...old, creditId]))
      setMessage(t.resetUnknown)
    } else {
      setMessage(status === 'reset' ? t.resetDone : t.resetFailed)
      reload()
    }
  }
  return h('div', { 'data-u-overview': '' },
    h(Limits, { overview: data }),
    h('section', { 'data-u-section': '', 'data-u-kind': 'allow' },
      h('div', { 'data-u-card': '', 'data-u-pad': '', 'data-u-row': '' },
        h('div', null, h('h3', null, t.allow), h('p', { 'data-u-muted': '', 'data-u-small': '', style: { marginTop: 4 } },
          data.assistant_available ? t.allowHint : t.allowUnavailable),
          settingError && h('p', { 'data-u-error': '', role: 'status' }, settingError)),
        h('button', { type: 'button', role: 'switch', 'aria-checked': assistantEnabled, 'aria-label': t.allow,
          disabled: settingBusy || (!data.assistant_available && !assistantEnabled), 'data-u-switch': '',
          onClick: () => setAssistant(!assistantEnabled) }))),
    data.assistant_available && assistantEnabled && pending?.id && pending?.credit_id &&
      resets?.some(credit => credit.id === pending.credit_id) && h('section', { 'data-u-section': '', 'data-u-kind': 'pending' },
      h('div', { 'data-u-card': '', 'data-u-pad': '', 'data-u-row': '' },
        h('div', null, h('h3', null, t.requested), h('p', { 'data-u-muted': '', 'data-u-small': '', style: { marginTop: 4 } }, t.requestedHint)),
        h('button', { type: 'button', 'data-u-button': '', disabled: !!preparing || blocked.has(pending.credit_id),
          onClick: () => prepare({ id: pending.credit_id }, pending.id) }, t.reviewRequest))),
    h(Section, { title: t.resets, hint: t.resetsHint, kind: 'resets' },
      h('div', { 'data-u-card': '' },
        resets && h('div', { 'data-u-reset-count': '' }, h('span', null, t.available, ' ', h('span', null, resets.length))),
        resets?.length ? resets.map((credit, i) =>
        h('div', { 'data-u-row': '', 'data-u-pad': '', key: credit.id || i },
          h('div', null, h('h3', null, resetTitle(credit)),
            credit.expires_at && h('div', { 'data-u-muted': '', 'data-u-small': '' }, t.expires + ' ' + dateLabel(credit.expires_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))),
          h('button', { type: 'button', 'data-u-button': '', disabled: !!preparing || blocked.has(credit.id) || !credit.id,
            onClick: () => prepare(credit) }, preparing === credit.id ? t.processing : t.reset)))
        : h('div', { 'data-u-pad': '', 'data-u-muted': '' }, resets ? t.noResets : t.unavailable)),
      message && h('p', { role: 'status', 'data-u-error': message !== t.resetDone ? '' : undefined }, message)),
    h(Section, { title: t.credits, hint: t.creditsHint, kind: 'credits' },
      h('div', { 'data-u-card': '', 'data-u-pad': '' },
        h('h3', null, isRu() ? `Осталось ${formatAmount(data?.account?.credits_balance, 0)} кредитов`
          : `${formatAmount(data?.account?.credits_balance, 0)} credits remaining`),
        h('p', { 'data-u-muted': '', 'data-u-small': '' }, t.balance))),
    prepared && h(ResetDialog, { ctx, prepared, onClose: () => setPrepared(null), onResult: result, scopeKey, currentScope, profile }))
}

function GroupSelect({ value, onChange }) {
  const t = copy()
  return h(UsageGroupSelect, { value, onChange, label: isRu() ? 'Группировка' : 'Group by', labels: t })
}
function History({ ctx, localScope, expected, revision, reload }) {
  const t = copy(), [days, setDays] = useState(7), [offset, setOffset] = useState(0), [group, setGroup] = useState('feature')
  const resource = useResource(ctx, `/history?days=${days}&offset=${offset}`, localScope, expected, !!expected, revision, true)
  return h(Section, { title: t.history, hint: t.historyHint },
    h('div', { 'data-u-controls': '' },
      h('div', { 'data-u-segment': '' }, [7, 30].map(n => h('button', { type: 'button', key: n, 'aria-pressed': days === n, onClick: () => { setDays(n); setOffset(0) } }, n === 7 ? t.seven : t.thirty))),
      h(GroupSelect, { value: group, onChange: setGroup })),
    ['ready', 'refreshing'].includes(resource.status)
      ? h(UsageHistoryCard, { history: resource.data, group, offset, onOffsetChange: setOffset,
        t, aggregateHistory, valueName, percent, dateLabel })
      : h(State, { state: resource, retry: reload }))
}

function Breakdown({ usage, sessionId, profile }) {
  const t = copy()
  const rows = [['model', t.models], ['reasoning_effort', t.effort], ['speed', t.speed]]
  const [error, setError] = useState(false)
  return h('div', { 'data-u-details': '' },
    h('dl', null, rows.map(([dimension, title]) => {
      const groups = groupUsage(usage, dimension)
      return h(Fragment, { key: dimension }, h('dt', null, title), h('dd', null, groups.length
        ? groups.map((item, i) => h('span', { key: i, style: { display: 'inline-block', marginRight: 18 } }, valueName(item.name, dimension), item.share === null ? '' : ' ' + percent(item.share)))
        : t.noBreakdown))
    })),
    h('button', { type: 'button', 'data-u-link': '', onClick: () => {
      Promise.resolve(host.openSession(sessionId, { profile })).catch(() => setError(true))
    } }, t.open + ' ↗'),
    error && h('span', { 'data-u-error': '', role: 'status' }, t.openError))
}
function TopChats({ ctx, localScope, expected, revision, reload, profile }) {
  const t = copy(), [showAll, setShowAll] = useState(false), [expanded, setExpanded] = useState(null)
  const resource = useResource(ctx, '/chats', localScope, expected, !!expected, revision)
  const rows = Array.isArray(resource.data?.rows) ? [...resource.data.rows] : []
  const rank = row => row.usage?.data_status === 'unavailable' ? -1 : (numeric(row.usage?.weekly_limit_percent) ?? -1)
  rows.sort((a, b) => rank(b) - rank(a))
  const displayed = showAll ? rows : rows.slice(0, 5)
  return h(Section, { title: t.chats, hint: t.chatsHint },
    resource.status === 'ready' ? h(Fragment, null,
      h('div', { 'data-u-card': '' }, rows.length ? h('table', { 'data-u-table': '' },
        h('thead', null, h('tr', null, h('th', null, t.chat), h('th', null, t.weeklyPercent), h('th', null, t.usedCredits))),
        h('tbody', null, displayed.map((row, i) => {
          const usage = row.usage?.data_status === 'unavailable' ? null : row.usage
          const open = expanded === row.id
          return h(Fragment, { key: row.id || i },
            h('tr', null,
              h('td', null, h('button', { type: 'button', 'data-u-disclose': '', 'aria-expanded': open, onClick: () => setExpanded(open ? null : row.id) },
                h('span', { 'aria-hidden': true }, open ? '⌄' : '›'),
                h('span', null, row.title || t.chat, usage?.data_status === 'partial' &&
                  h('span', { 'data-u-chat-note': '' }, t.chatPartial)))),
              h('td', null, percent(usage?.weekly_limit_percent)),
              h('td', null, formatAmount(usage?.balance_usage_credits))),
            open && h('tr', null, h('td', { colSpan: 3 }, h(Breakdown, { usage, sessionId: row.id, profile }))))
        }))) : h('div', { 'data-u-pad': '', 'data-u-muted': '' }, t.noChats)),
      rows.length > 5 && h('button', { type: 'button', 'data-u-button': '', style: { marginTop: 12 }, onClick: () => setShowAll(!showAll) }, showAll ? t.less : t.more),
      resource.data.truncated && h('p', { 'data-u-muted': '', 'data-u-small': '' }, t.incomplete),
      resource.data.data_as_of && h('p', { 'data-u-muted': '', 'data-u-small': '' }, t.asOf + ' ' +
        dateLabel(resource.data.data_as_of, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })))
      : h(State, { state: resource, retry: reload }))
}
function PlanHistory({ ctx, localScope, expected, revision, reload }) {
  const t = copy(), [group, setGroup] = useState('feature'), [expanded, setExpanded] = useState(null)
  const resource = useResource(ctx, '/plan-history', localScope, expected, !!expected, revision)
  const periods = Array.isArray(resource.data?.periods) ? resource.data.periods.filter(p => p.window_minutes === 10080) : []
  const dimension = { feature: 'thread_source', model: 'model', surface: 'surface', trigger: 'turn_trigger' }[group]
  return h(Section, { title: t.planHistory, hint: t.planHint, action: h(GroupSelect, { value: group, onChange: setGroup }) },
    resource.status === 'ready' && (resource.data.approximate === true || resource.data.coverage_complete === false) &&
      h('p', { 'data-u-muted': '', 'data-u-small': '' }, t.planPartial),
    resource.status === 'ready' && resource.data.data_as_of && h('p', { 'data-u-muted': '', 'data-u-small': '' },
      t.asOf + ' ' + dateLabel(resource.data.data_as_of, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })),
    h('h3', { 'data-u-plan-heading': '' }, t.weeklyLimits),
    resource.status === 'ready' ? h('div', { 'data-u-card': '' }, periods.length
      ? h('table', { 'data-u-table': '' }, h('thead', null, h('tr', null, h('th', null, t.period), h('th', null, t.used))),
        h('tbody', null, periods.map((p, i) => {
          const open = expanded === (p.id || i)
          const groups = Array.isArray(p.breakdowns) ? p.breakdowns.find(b => b.dimension === dimension)?.rows : null
          const bp = numeric(p.used_basis_points)
          return h(Fragment, { key: p.id || i },
            h('tr', null,
              h('td', null, h('button', { type: 'button', 'data-u-disclose': '', 'aria-expanded': open, onClick: () => setExpanded(open ? null : (p.id || i)) },
                dateLabel(p.starts_at) + ' - ' + dateLabel(p.ends_at), h('span', { 'aria-hidden': true }, open ? '⌄' : '›'))),
              h('td', null, percent(bp === null ? null : bp / 100))),
            open && h('tr', null, h('td', { colSpan: 2 },
              h('div', { 'data-u-details': '' },
                (!p.accounting_complete || resource.data.approximate) && h('span', { 'data-u-muted': '', 'data-u-small': '' }, t.incomplete),
                Array.isArray(groups) ? mergePlanBreakdown(groups, group).map((item, j) => {
                  const n = numeric(item.basis_points)
                  return h('div', { key: j, 'data-u-row': '' }, h('span', { 'data-u-muted': '' }, valueName(item.key, group)), h('span', null, percent(n === null ? null : n / 100)))
                }) : h('span', { 'data-u-muted': '' }, t.noBreakdown)))))
        }))) : h('div', { 'data-u-pad': '', 'data-u-muted': '' }, t.noPlan))
      : h(State, { state: resource, retry: reload }))
}

function UsagePage({ ctx }) {
  const t = copy(), profile = useValue(host.state.profile), connection = useValue(host.state.connectionId)
  const localScope = JSON.stringify([connection || null, profile || 'default'])
  const currentScope = () => JSON.stringify([host.state.connectionId.get() || null, host.state.profile.get() || 'default'])
  const [tab, setTab] = useState('overview'), [revision, setRevision] = useState(0)
  const [overviewRevision, setOverviewRevision] = useState(0), actionBusy = useRef(false)
  const windowVisible = useRef(false), refreshOnIdle = useRef(false)
  const onBusyChange = useRef(value => {
    actionBusy.current = value
    if (!value && refreshOnIdle.current) queueMicrotask(() => {
      // Effects can briefly clear busy while replacing one action state with another.
      if (!actionBusy.current && windowVisible.current && refreshOnIdle.current) {
        refreshOnIdle.current = false
        setOverviewRevision(n => n + 1)
      }
    })
  }).current
  const tabBase = useId()
  const overview = useResource(ctx, '/overview', localScope, null, true, revision + ':' + overviewRevision, true)
  const overviewReady = ['ready', 'refreshing'].includes(overview.status)
  const expected = overviewReady ? overview.data.scope : null
  const reload = () => setRevision(n => n + 1)
  useEffect(() => {
    const root = document.documentElement
    const pausedAttribute = 'data-renderer-animations-paused'
    // Before the first native event, Hermes' own attribute supplies the current
    // window state even when this page is mounted after the window was hidden.
    let nativeHidden = null
    const hidden = () => document.hidden || (nativeHidden === null ? root.hasAttribute(pausedAttribute) : nativeHidden)
    let paused = hidden(), timer = null
    windowVisible.current = !paused
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const start = () => {
      if (timer !== null) return
      timer = setInterval(() => {
        if (!hidden() && !actionBusy.current) setOverviewRevision(n => n + 1)
      }, 30000)
    }
    const sync = () => {
      const next = hidden()
      if (next === paused) return
      paused = next
      windowVisible.current = !paused
      if (paused) { stop(); return }
      start()
      if (actionBusy.current) refreshOnIdle.current = true
      else { refreshOnIdle.current = false; setOverviewRevision(n => n + 1) }
    }
    const unsubscribe = window.hermesDesktop?.onWindowStateChanged?.(state => {
      if (typeof state?.isMinimized !== 'boolean' && typeof state?.isVisible !== 'boolean') return
      nativeHidden = state.isMinimized === true || state.isVisible === false
      sync()
    })
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: [pausedAttribute] })
    document.addEventListener('visibilitychange', sync)
    if (!paused) start()
    return () => {
      windowVisible.current = false
      refreshOnIdle.current = false
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      unsubscribe?.()
    }
  }, [localScope])
  function keyTabs(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const next = e.key === 'Home' ? 'overview' : e.key === 'End' ? 'analytics' : tab === 'overview' ? 'analytics' : 'overview'
    setTab(next)
    document.getElementById(tabBase + '-' + next)?.focus()
  }
  return h('div', { 'data-hcv-usage-page': '', key: localScope },
    h('p', { 'data-u-muted': '', 'data-u-small': '', style: { marginBottom: 12 } },
      (isRu() ? 'Активный профиль Hermes: ' : 'Active Hermes profile: ') + (profile || 'default')),
    h('div', { 'data-u-tabs': '', role: 'tablist', 'aria-label': isRu() ? 'Использование' : 'Usage', onKeyDown: keyTabs },
      ['overview', 'analytics'].map(key => h('button', { type: 'button', id: tabBase + '-' + key, key, role: 'tab',
        'data-u-tab': '', 'aria-selected': tab === key, 'aria-controls': tabBase + '-panel',
        tabIndex: tab === key ? 0 : -1, onClick: () => setTab(key) }, t[key]))),
    h('div', { id: tabBase + '-panel', role: 'tabpanel', 'aria-labelledby': tabBase + '-' + tab },
      !overviewReady ? h(State, { state: overview, retry: reload })
        : tab === 'overview' ? h(Overview, { key: expected, ctx, data: overview.data, scopeKey: localScope, currentScope, reload, onBusyChange, profile: profile || 'default' })
          : h(Fragment, null,
            h(History, { ctx, localScope, expected, revision, reload }),
            h(TopChats, { ctx, localScope, expected, revision, reload, profile }),
            h(PlanHistory, { ctx, localScope, expected, revision, reload }))))
}

export function registerUsagePage(ctx) {
  ctx.registerSettingsPage?.({ id: 'usage', title: isRu() ? 'Использование' : 'Usage', icon: 'dashboard', render: () => h(UsagePage, { ctx }) })
}
