import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'

// The order belongs to the period, not to the selected day. This keeps each
// category's colour and the stacking order stable while moving over the graph.
const palette = ['#66b5ff', '#f59a56', '#74d58b', '#f08fc0', '#aa91ef', '#5acbc2', '#e6c767', '#aaa']
const locale = () => typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru-RU' : 'en-US'

function finiteValue(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function fullDay(day) {
  return Array.isArray(day?.attribution) && day.attribution.every(row => finiteValue(row?.value) !== null)
}

function dateValue(value) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function historyPeriodLabel(start, end, dateLabel) {
  const first = dateValue(start), last = dateValue(end)
  if (first && last && first <= last) {
    const format = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    if (typeof format.formatRange === 'function') return format.formatRange(first, last)
  }
  return `${dateLabel(start)} - ${dateLabel(end)}`
}

export function historyTransition(previous, next) {
  const before = dateValue(previous?.start_date), after = dateValue(next?.start_date)
  if (!before || !after || before.getTime() === after.getTime()) return null
  return after < before ? 'previous' : 'next'
}

export function historyShare(value) {
  if (value === null || !Number.isFinite(value)) return '—'
  const format = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 })
  if (value > 0 && value < 0.1) return `<${format.format(0.1)} %`
  return `${format.format(value)} %`
}

// A missing day or a malformed row is not a zero. Ratios cannot be known if
// the selected interval has missing values, even if some values are known.
export function historyChartModel(history, group, aggregateHistory, selectedIndex = null) {
  if (history?.units !== 'percent' || !Array.isArray(history.data) || !history.data.length) return null
  const result = aggregateHistory(history.data, group)
  if (!result?.available || !Array.isArray(result.chart) || !result.chart.length) return null
  const days = result.chart.map((day, index) => ({
    ...day,
    complete: !!day.available && fullDay(history.data[index]),
    total: [...day.values.values()].reduce((sum, value) => sum + value, 0),
  }))
  const active = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < days.length ? days[selectedIndex] : null
  const complete = active ? active.complete : !result.incomplete && days.every(day => day.complete)
  const total = active ? active.total : result.total
  const categories = result.categories.map(([name, periodValue], index) => {
    const value = active ? (active.values.get(name) || 0) : periodValue
    return { name, value, color: palette[index % palette.length], share: complete && total > 0 ? value / total * 100 : null }
  })
  const fallbackKey = name => group === 'feature' && name === 'chat' ? 'user' : name
  const order = Array.isArray(result.stackOrder) ? result.stackOrder : categories.map(category => category.name)
    .sort((a, b) => fallbackKey(a) < fallbackKey(b) ? -1 : fallbackKey(a) > fallbackKey(b) ? 1 : 0)
  const byName = new Map(categories.map(category => [category.name, category]))
  const sorted = order.map(name => byName.get(name)).filter(Boolean)
  for (const category of categories) if (!sorted.includes(category)) sorted.push(category)
  // CSS lays children from top to bottom, the server's stack order is bottom to top.
  const stackedCategories = sorted.reverse()
  return { days, categories, stackedCategories, active, incomplete: !complete, max: Math.max(0, ...days.map(day => day.total)) }
}

function Arrow({ direction }) {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: direction === 'previous' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5',
      stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
}

export function UsageHistoryCard({ history, group, offset, onOffsetChange, t, aggregateHistory, valueName, percent, dateLabel }) {
  const [hovered, setHovered] = useState(null)
  const [focused, setFocused] = useState(null)
  const [pinned, setPinned] = useState(null)
  const [tabStop, setTabStop] = useState(0)
  const [transition, setTransition] = useState(null)
  const dayRefs = useRef([])
  const previousHistory = useRef(history)
  const periodKey = `${history?.start_date || ''}/${history?.end_date || ''}`
  useEffect(() => { setHovered(null); setFocused(null); setPinned(null); setTabStop(0) }, [history, group])
  useLayoutEffect(() => {
    const direction = historyTransition(previousHistory.current, history)
    previousHistory.current = history
    setTransition(direction ? { periodKey, direction } : null)
  }, [history, periodKey])
  const selectedIndex = hovered ?? focused ?? pinned
  const model = historyChartModel(history, group, aggregateHistory, selectedIndex)
  const heading = model?.active ? dateLabel(model.active.date) : historyPeriodLabel(history?.start_date, history?.end_date, dateLabel)
  const keyboardHelp = locale() === 'ru-RU' ? 'Используйте стрелки, чтобы выбрать день' : 'Use arrow keys to select a day'
  const emptyMessage = t.emptyHistory || (locale() === 'ru-RU' ? 'За этот период нет данных.' : 'No data for this period.')
  const isEmpty = history?.units === 'percent' && Array.isArray(history?.data) && history.data.length === 0
  const moveFocus = (event, index) => {
    let target = index
    if (event.key === 'Escape') {
      event.preventDefault()
      setPinned(null); setFocused(null); setHovered(null)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = Math.min(model.days.length - 1, index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = Math.max(0, index - 1)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = model.days.length - 1
    else return
    event.preventDefault()
    dayRefs.current[target]?.focus()
  }

  const ticks = model ? [...new Set([0, Math.floor((model.days.length - 1) / 2), model.days.length - 1])] : []
  return h('div', { 'data-u-card': '', 'data-u-history-card': '' },
    h('div', { 'data-u-history-heading': '' },
      h('span', null, heading),
      h('div', { 'data-u-history-navigation': '' },
        h('button', { type: 'button', 'data-u-history-arrow': '', 'aria-label': t.previous,
          onClick: () => onOffsetChange(offset + 1) }, h(Arrow, { direction: 'previous' })),
        h('button', { type: 'button', 'data-u-history-arrow': '', 'aria-label': t.next, disabled: offset <= 0,
          onClick: () => onOffsetChange(Math.max(0, offset - 1)) }, h(Arrow, { direction: 'next' })))),
    !model ? h('div', { 'data-u-history-unavailable': '', role: 'status' }, isEmpty ? emptyMessage : t.chartUnavailable) : h('div', {
      key: periodKey, 'data-u-history-body': '', 'data-u-history-enter': transition?.periodKey === periodKey ? transition.direction : undefined,
    },
      h('div', { 'data-u-history-plot': '', role: 'group', 'aria-label': `${t.history}. ${keyboardHelp}`,
        'data-u-history-highlighted': selectedIndex !== null ? '' : undefined,
        'data-u-history-dense': model.days.length > 7 ? '' : undefined, onPointerLeave: () => setHovered(null) },
        model.days.map((day, index) => {
          const label = !day.available ? t.unavailable : day.complete ? percent(day.total) : t.incomplete
          return h('button', { key: `${group}-${history.start_date}-${history.end_date}-${day.date || 'day'}-${index}`, type: 'button', 'data-u-history-day': '',
            'data-u-history-active': selectedIndex === index ? '' : undefined, tabIndex: tabStop === index ? 0 : -1,
            'aria-pressed': pinned === index,
            'aria-label': `${dateLabel(day.date)}: ${label}`, title: `${dateLabel(day.date)}: ${label}`,
            ref: element => { dayRefs.current[index] = element },
            onPointerEnter: () => setHovered(index), onFocus: () => { setFocused(index); setTabStop(index) },
            onBlur: () => setFocused(null), onKeyDown: event => moveFocus(event, index),
            onClick: () => setPinned(previous => previous === index ? null : index) },
          h('span', { 'data-u-history-bar': '', 'aria-hidden': 'true',
            style: { height: model.max > 0 ? `${day.total / model.max * 100}%` : '0%' } },
          model.stackedCategories.map(category => h('span', { key: category.name, style: { backgroundColor: category.color,
            height: day.total > 0 ? `${(day.values.get(category.name) || 0) / day.total * 100}%` : '0%' } }))))
        })),
      h('div', { 'data-u-history-dates': '', 'aria-hidden': 'true', style: { gridTemplateColumns: `repeat(${model.days.length}, minmax(0, 1fr))` } },
        ticks.map(index => h('span', { key: index, style: { gridColumn: index + 1 } }, dateLabel(model.days[index].date)))),
      model.incomplete && h('p', { 'data-u-history-incomplete': '' }, t.incomplete),
      model.categories.length ? h('div', { 'data-u-history-legend': '' }, model.categories.map(category =>
        h('div', { key: category.name, 'data-u-history-legend-item': '', style: { '--u-history-color': category.color } },
          h('span', null, valueName(category.name, group)), h('strong', null, historyShare(category.share)))))
        : !model.incomplete && h('div', { 'data-u-history-unavailable': '' }, emptyMessage)))
}
