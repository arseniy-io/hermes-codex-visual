import { useI18n } from '@hermes/plugin-sdk'
import { createElement as h, useEffect, useId, useState } from 'react'
import { codexIconStyle } from './codex-reference.js'

const labels = {
  ru: {
    title: 'Изменения без коммита', refresh: 'Обновить', loading: 'Загрузка…',
    noProject: 'Выберите проект', empty: 'Нет изменений', unavailable: 'Не удалось прочитать список изменений',
    noDiff: 'Нет изменений для показа', diffError: 'Не удалось открыть изменения файла',
  },
  en: {
    title: 'Uncommitted changes', refresh: 'Refresh', loading: 'Loading…',
    noProject: 'Select a project', empty: 'No changes', unavailable: 'Could not read changed files',
    noDiff: 'No changes to display', diffError: 'Could not open the file diff',
  },
}

async function readReview(route, cwd, connectionId, profile, params) {
  const query = new URLSearchParams({ path: cwd, scope: 'uncommitted', ...params })
  return window.hermesDesktop.api({
    connectionId, profile, method: 'GET', path: '/api/git/review/' + route + '?' + query, timeoutMs: 15000,
  })
}

function icon(glyph) {
  return h('span', { 'aria-hidden': true, className: 'hcv-changes-icon', style: codexIconStyle(glyph) })
}

function DiffText({ text }) {
  // Keep very large diffs selectable without allocating a DOM node per line.
  if (text.length > 150000) return h('pre', { 'data-hcv-change-diff': '', tabIndex: 0 }, text)
  return h('pre', { 'data-hcv-change-diff': '', tabIndex: 0 }, text.split('\n').map((line, index, lines) => {
    const type = line.startsWith('@@') ? 'hunk'
      : line.startsWith('+') && !line.startsWith('+++ ') ? 'added'
        : line.startsWith('-') && !line.startsWith('--- ') ? 'removed' : undefined
    return h('span', { key: index, 'data-hcv-diff-line': type }, index < lines.length - 1 ? line + '\n' : line)
  }))
}

function FileDiff({ id, cwd, connectionId, profile, path, staged, copy }) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let live = true
    void readReview('diff', cwd, connectionId, profile, { file: path, staged: String(staged) }).then(
      value => { if (live) setResult(typeof value?.diff === 'string' ? { text: value.diff } : {}) },
      () => { if (live) setResult({}) },
    )
    return () => { live = false }
  }, [cwd, connectionId, profile, path, staged])

  return h('div', { id, className: 'hcv-change-detail' }, result?.text
    ? h(DiffText, { text: result.text })
    : h('p', { role: 'status' }, !result ? copy.loading : result.text === '' ? copy.noDiff : copy.diffError))
}

function RepositoryChanges({ cwd, connectionId, profile, copy }) {
  const diffId = useId()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    let live = true
    void readReview('list', cwd, connectionId, profile).then(value => {
      const files = Array.isArray(value?.files) ? value.files.filter(file => typeof file?.path === 'string' && file.path) : null
      if (live) setResult({ revision, files })
    }, () => { if (live) setResult({ revision, files: null }) })
    return () => { live = false }
  }, [cwd, connectionId, profile, revision])
  const current = result?.revision === revision ? result : null

  return h('div', { className: 'hcv-changes-content' },
    h('header', { className: 'hcv-changes-header' },
      h('span', null, copy.title),
      h('button', {
        type: 'button', className: 'hcv-changes-refresh', 'aria-label': copy.refresh, title: copy.refresh,
        onClick: () => { setSelected(null); setRevision(value => value + 1) },
      }, icon('refresh'))),
    current?.files?.length ? h('ul', { 'aria-label': copy.title }, current.files.map(file => {
      const open = selected === file.path
      return h('li', { key: file.path, 'data-hcv-changed-file': '' },
        h('button', {
          type: 'button', className: 'hcv-changes-file', title: file.path, 'aria-label': file.path,
          'aria-expanded': open, 'aria-controls': open ? diffId : undefined,
          onClick: () => setSelected(previous => previous === file.path ? null : file.path),
        }, icon('right'), icon('artifacts'),
        h('span', { className: 'hcv-changes-path', dir: 'auto' }, file.path),
        h('span', { className: 'hcv-changes-counts' },
          h('span', { 'data-hcv-count': 'added' }, '+' + (file.added || 0)),
          h('span', { 'data-hcv-count': 'removed' }, '−' + (file.removed || 0)))),
        open && h(FileDiff, { id: diffId, cwd, connectionId, profile, path: file.path, staged: file.staged === true, copy }))
    })) : h('p', { className: 'hcv-changes-status', role: 'status' },
      !current ? copy.loading : current.files ? copy.empty : copy.unavailable))
}

export function ChangesPane({ cwd, scope }) {
  const { locale } = useI18n()
  const copy = labels[locale] || labels.en
  const connectionId = scope?.connectionId
  const profile = scope?.profile
  return h('div', { 'data-hcv-changes-pane': '' }, cwd && connectionId && profile
    ? h(RepositoryChanges, { key: JSON.stringify([cwd, connectionId, profile]), cwd, connectionId, profile, copy })
    : h('p', { className: 'hcv-changes-status', role: 'status' }, copy.noProject))
}

export function registerSummaryChanges(ctx, active) {
  const pane = `${active} [data-hcv-changes-pane]`
  const style = document.createElement('style')
  style.dataset.hcvSummaryChanges = ''
  style.textContent = `
    ${pane} { block-size: 100%; min-block-size: 0; overflow: auto; background: var(--hcv-chat); color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }
    ${pane} .hcv-changes-content { padding: 12px 16px 16px; }
    ${pane} .hcv-changes-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-block-size: 28px; margin-block-end: 8px; color: var(--hcv-muted); }
    ${pane} ul { list-style: none; margin: 0; padding: 0; }
    ${pane} li + li { margin-block-start: 2px; }
    ${pane} button { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    ${pane} button:focus-visible, ${pane} pre:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${pane} .hcv-changes-icon { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
    ${pane} .hcv-changes-refresh { display: grid; place-items: center; inline-size: 24px; block-size: 24px; padding: 0; border-radius: 7px; }
    /* Adapt the Codex full-review file header from 131264.31ce2394bb.js to the Hermes fallback list. */
    ${pane} .hcv-changes-file {
      display: flex; align-items: center; gap: 8px; inline-size: 100%;
      padding: 8px 8px 8px 12px; border-block-end: 1px solid var(--hcv-hairline);
      border-radius: 0; text-align: start; font-size: 14px;
    }
    ${pane} .hcv-changes-file > .hcv-changes-icon:first-child {
      inline-size: 14px; block-size: 14px; rotate: 0deg; color: var(--hcv-muted);
    }
    ${pane} .hcv-changes-file[aria-expanded="true"] > .hcv-changes-icon:first-child { rotate: 90deg; }
    ${pane} .hcv-changes-file > .hcv-changes-icon:nth-child(2) { color: var(--hcv-muted); }
    ${pane} button:hover { background: var(--hcv-hover); }
    ${pane} .hcv-changes-file:hover > .hcv-changes-icon:first-child { color: var(--hcv-text); }
    ${pane} .hcv-changes-path { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ${pane} .hcv-changes-counts {
      display: flex; gap: 4px; margin-inline: 4px; line-height: 1;
      font-variant-numeric: tabular-nums; letter-spacing: -.025em;
    }
    ${pane} [data-hcv-count="added"] { color: light-dark(#00a240, #40c977); }
    ${pane} [data-hcv-count="removed"] { color: light-dark(#ba2623, #fa423e); }
    ${pane} [data-hcv-diff-line="added"] { color: light-dark(#008241, #40c977); }
    ${pane} [data-hcv-diff-line="removed"] { color: light-dark(#aa2626, #f28080); }
    ${pane} [data-hcv-diff-line="hunk"] { color: var(--hcv-muted); }
    ${pane} .hcv-change-detail { margin: 1px 0 8px; overflow: hidden; border-radius: 0 0 10px 10px; }
    ${pane} .hcv-change-detail p { padding: 8px 12px; margin: 0; color: var(--hcv-muted); }
    ${pane} [data-hcv-change-diff] { max-block-size: min(55dvh, 480px); overflow: auto; margin: 0; padding: 8px 12px; font: 12px/18px var(--hcv-mono-font, ui-monospace, monospace); tab-size: 4; }
    ${pane} .hcv-changes-status { margin: 12px 16px; color: var(--hcv-muted); }
    ${pane} .hcv-changes-content .hcv-changes-status { margin-inline: 0; }
    @media (prefers-reduced-motion: no-preference) {
      ${pane} .hcv-changes-file > .hcv-changes-icon:first-child { transition: rotate 150ms ease; }
    }
  `
  document.head.append(style)
  ctx.onDispose(() => style.remove())
}
