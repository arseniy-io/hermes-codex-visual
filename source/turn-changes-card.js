import { createElement as h, useEffect, useRef, useState } from 'react'
import { codexMask } from './codex-reference.js'
import { anchorTurnCard } from './turn-card-scroll.js'

// Codex26.1117.3838.0:154721.eecc3b7249.js ev/eC/eb/ej and
// active ru-RU.keys.92aa50468a53d103.bad2d1214980c12a.json.codex-gzip.
export function turnChangesTitle(files, lang) {
  if (files.length === 1) {
    const name = files[0].path.split(/[\\/]/).at(-1)
    return lang === 'ru' ? 'Изменён ' + name : 'Edited ' + name
  }
  if (lang !== 'ru') return 'Edited ' + new Intl.NumberFormat(lang).format(files.length) + ' files'
  const count = new Intl.NumberFormat('ru').format(files.length)
  const form = new Intl.PluralRules('ru').select(files.length)
  return form === 'one' ? 'Изменен один файл' : `Изменено ${count} ${form === 'few' || form === 'other' ? 'файла' : 'файлов'}`
}

function Counts({ added, removed, format }) {
  return h('span', { 'data-hcv-turn-card-counts': '' },
    h('span', { 'data-hcv-turn-card-added': '' }, '+' + format.format(added)),
    h('span', { 'data-hcv-turn-card-removed': '' }, '−' + format.format(removed)))
}

// RNul/FyDI: align visible CSS spinners to the shared document timeline.
// The original 24px FyDI artwork is already stored as sidebarWorking.
export function syncTurnChangesSpinner(node) {
  if (!node) return
  const document = node.ownerDocument
  const view = document.defaultView
  let visible = typeof view?.IntersectionObserver !== 'function', disposed = false
  const active = () => !disposed && visible && node.isConnected && !document.hidden
  const sync = () => {
    if (!active()) return
    queueMicrotask(() => {
      if (!active()) return
      const animation = node.getAnimations?.({ subtree: true }).find(value => value.animationName === 'hcv-turn-card-spin')
      if (animation?.playState === 'running') animation.ready.then(() => {
        if (active() && !animation.pending && animation.playState === 'running') animation.startTime = 0
      }, () => {})
    })
  }
  const started = event => { if (event.target === node && event.animationName === 'hcv-turn-card-spin') sync() }
  const observer = visible ? null : new view.IntersectionObserver(entries => {
    const entry = entries.find(entry => entry.target === node)
    if (entry) { visible = entry.isIntersecting; sync() }
  })
  observer?.observe(node)
  document.addEventListener('visibilitychange', sync)
  node.addEventListener('animationstart', started)
  sync()
  return () => {
    disposed = true; observer?.disconnect()
    document.removeEventListener('visibilitychange', sync)
    node.removeEventListener('animationstart', started)
  }
}

export function canReconcileTurnChange(local, snapshot) {
  if (!local || !snapshot) return false
  return local.snapshotId !== snapshot.snapshotId || snapshot.revision > local.revision ||
    (local.status === 'unknown' && snapshot.revision === local.revision && snapshot.status === 'ready')
}

export function TurnChangesCard({ snapshot, lang = 'en', onReview, onApply, onResult, onError, sameOwner = () => true }) {
  const [expanded, setExpanded] = useState(false)
  const [actionState, setActionState] = useState(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const applyButton = useRef(null)
  const header = useRef(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setActionState(state => canReconcileTurnChange(state, snapshot) ? null : state) }, [snapshot])
  useEffect(() => busy ? syncTurnChangesSpinner(applyButton.current) : undefined, [busy])
  if (!snapshot?.files?.length) return null
  const ru = lang === 'ru'
  const format = new Intl.NumberFormat(lang)
  const files = snapshot.files
  const single = files.length === 1
  const shown = expanded ? files : files.slice(0, 3)
  const remaining = files.length - shown.length
  const local = actionState?.snapshotId === snapshot.snapshotId ? actionState : snapshot
  const action = local.nextAction || 'undo'
  const label = action === 'undo' ? ru ? 'Отменить' : 'Undo' : ru ? 'Повторно применить' : 'Reapply'
  const review = ru ? 'Просмотреть изменения' : 'View changes'
  const totals = files.reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }), { added: 0, removed: 0 })
  const open = path => { if (sameOwner()) onReview?.(snapshot, path) }
  const apply = async event => {
    event.stopPropagation()
    if (pending.current || !sameOwner() || !onApply || local.status !== 'ready' || !snapshot.canApply) return
    pending.current = true
    setBusy(true)
    try {
      const outcome = await onApply({ ...snapshot, revision: local.revision, nextAction: action }, action)
      if (!mounted.current || !sameOwner()) return
      const next = { ...outcome, snapshotId: snapshot.snapshotId,
        status: outcome.status === 'success' || outcome.status === 'failed' ? 'ready' : outcome.status }
      setActionState(next)
      onResult?.(outcome, action)
    } catch (error) {
      // A timed-out POST may already have applied its patch. Keep it fenced
      // until an explicit snapshot refresh observes the saved backend state.
      if (mounted.current && sameOwner()) {
        setActionState({ ...local, snapshotId: snapshot.snapshotId, status: 'unknown' })
        onError?.(error, action)
      }
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const noun = count => !ru ? count === 1 ? 'file' : 'files'
    : new Intl.PluralRules('ru').select(count) === 'one' ? 'файл'
      : new Intl.PluralRules('ru').select(count) === 'few' ? 'файла' : 'файлов'
  return h('div', { 'data-hcv-saved-turn-card': snapshot.turnId, 'data-snapshot-id': snapshot.snapshotId },
    h('div', { 'data-hcv-turn-card-header': '', ref: header },
      h('button', { type: 'button', 'data-hcv-turn-card-open': '', disabled: !onReview,
        'aria-label': ru ? 'Посмотреть измененные файлы' : 'View changed files',
        onClick: () => open(single ? files[0].path : undefined) }),
      h('span', { 'data-hcv-turn-card-icon': '', 'aria-hidden': true }),
      h('div', { 'data-hcv-turn-card-heading': '' },
        h('span', { 'data-hcv-turn-card-title': '', title: turnChangesTitle(files, lang) }, turnChangesTitle(files, lang)),
        h('span', { 'data-hcv-turn-card-subtitle': '' },
          h(Counts, { ...totals, format }),
          h('span', { 'data-hcv-turn-card-hover': '' }, ru ? 'Просмотр изменений' : 'View changes'))),
      h('button', { type: 'button', 'data-hcv-turn-card-apply': action,
        ref: applyButton,
        disabled: busy || !onApply || !snapshot.canApply || local.status !== 'ready',
        'aria-busy': busy, onClick: apply }, label),
      h('button', { type: 'button', 'data-hcv-turn-card-review': '', disabled: !onReview,
        onClick: event => { event.stopPropagation(); open(single ? files[0].path : undefined) } }, review)),
    !single && h('div', { 'data-hcv-turn-card-files': '' },
      shown.map(file => {
        const path = file.path.replaceAll('\\', '/')
        const slash = path.lastIndexOf('/') + 1
        return h('button', { key: file.path, type: 'button', 'data-hcv-turn-card-file': '',
          title: file.path, 'aria-label': file.path, disabled: !onReview, onClick: () => open(file.path) },
        h('span', { 'data-hcv-turn-card-path': '', 'aria-hidden': true },
          h('span', { 'data-hcv-turn-card-directory': '' }, path.slice(0, slash)),
          h('span', { 'data-hcv-turn-card-basename': '' }, path.slice(slash))),
        h(Counts, { added: file.added, removed: file.removed, format }))
      }),
      files.length > 3 && h('button', { type: 'button', 'data-hcv-turn-card-more': '', 'aria-expanded': expanded,
        onClick: () => { anchorTurnCard(header.current); setExpanded(value => !value) } },
      expanded ? ru ? 'Свернуть файлы' : 'Collapse files'
        : ru ? `Показать еще ${format.format(remaining)} ${noun(remaining)}` : `Show ${format.format(remaining)} more ${noun(remaining)}`)))
}

export function turnChangesCardStyles(scope) {
  const card = scope + ' [data-hcv-saved-turn-card]'
  const header = card + ' > [data-hcv-turn-card-header]'
  return `
/* Leave room for the outer stroke inside Hermes' clipped assistant message. */
${card} { --hcv-card-stroke:light-dark(rgb(26 28 31 / 12%),rgb(255 255 255 / 16%)); --hcv-card-border:light-dark(rgb(26 28 31 / 8%),rgb(255 255 255 / 8%)); --hcv-card-hover:light-dark(rgb(26 28 31 / 5%),rgb(255 255 255 / 8%)); --hcv-card-text:light-dark(#1a1c1f,#dfdfdf); --hcv-card-description:color-mix(in srgb,var(--hcv-card-text) 70%,transparent); --hcv-card-radius:10px; position:relative; margin:14px 1px 8px; border:0; border-radius:var(--hcv-card-radius); overflow:hidden; box-shadow:0 0 0 .5px var(--hcv-card-stroke); background:light-dark(#fff,#222); color:var(--hcv-card-text); font:430 14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; min-inline-size:0; }
${header} { position:relative; display:flex; align-items:center; gap:10px; min-inline-size:0; padding:12px; }
${card} button { cursor:pointer; color:inherit; font:inherit; border:0; background:transparent; }
${card} button:disabled { opacity:.5; cursor:default; }
${card} button:focus-visible { box-shadow:inset 0 0 0 2px #0285ff; outline:none; }
${header} > [data-hcv-turn-card-open] { position:absolute; inset:0; border-radius:var(--hcv-card-radius); }
${header}:hover > [data-hcv-turn-card-open] { background:color-mix(in oklab,var(--hcv-card-hover) 30%,transparent); }
${card} [data-hcv-turn-card-icon] { position:relative; z-index:1; flex:none; inline-size:40px; block-size:40px; border-radius:var(--hcv-card-radius); background:light-dark(#f7f7f7,#151515); pointer-events:none; }
${card} [data-hcv-turn-card-icon]::after { content:''; position:absolute; inset:8px; background:color-mix(in srgb,var(--hcv-card-text) 65%,transparent); mask:${codexMask('turnDiff')} center/contain no-repeat; }
${card} [data-hcv-turn-card-heading] { position:relative; z-index:1; display:flex; flex-direction:column; flex:1; min-inline-size:0; pointer-events:none; }
${card} [data-hcv-turn-card-title] { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-weight:500; }
${card} [data-hcv-turn-card-subtitle] { color:var(--hcv-card-description); font-size:13px; }
${card} [data-hcv-turn-card-counts] { display:inline-flex; flex:none; align-items:center; gap:4px; line-height:1; letter-spacing:-.025em; font-variant-numeric:tabular-nums; font-feature-settings:"cv01" on,"cv02" on; }
${card} [data-hcv-turn-card-added] { color:light-dark(#00a240,#40c977); }
${card} [data-hcv-turn-card-removed] { color:light-dark(#ba2623,#fa423e); }
${card} [data-hcv-turn-card-hover] { display:none; align-items:center; gap:4px; }
${header}:is(:hover,:focus-within) [data-hcv-turn-card-hover] { display:inline-flex; }
${header}:is(:hover,:focus-within) [data-hcv-turn-card-counts] { display:none; }
${header} > :is([data-hcv-turn-card-apply],[data-hcv-turn-card-review]) { position:relative; z-index:1; display:inline-flex; flex:none; align-items:center; gap:6px; block-size:28px; border-radius:var(--hcv-card-radius); padding:0 8px; font-size:13px; font-weight:430; line-height:18px; white-space:nowrap; }
${header} > [data-hcv-turn-card-review] { border:1px solid var(--hcv-card-border); background:light-dark(#fff,#292929); margin-inline-start:-2px; }
${header} > :is([data-hcv-turn-card-apply],[data-hcv-turn-card-review]):hover { background:var(--hcv-card-hover); }
${card} :is([data-hcv-turn-card-apply],[data-hcv-turn-card-hover],[data-hcv-turn-card-more])::after { content:''; flex:none; inline-size:14px; block-size:14px; background:currentColor; mask:var(--hcv-turn-card-glyph) center/contain no-repeat; }
${card} [data-hcv-turn-card-apply] { --hcv-turn-card-glyph:${codexMask('turnDiffUndo')}; }
${card} [data-hcv-turn-card-apply="reapply"] { --hcv-turn-card-glyph:${codexMask('turnDiffReapply')}; }
${card} [data-hcv-turn-card-apply][aria-busy="true"] { --hcv-turn-card-glyph:${codexMask('sidebarWorking')}; }
${card} [data-hcv-turn-card-apply][aria-busy="true"]::after { contain:layout paint style; }
${card} [data-hcv-turn-card-apply][aria-busy="true"]:where(:root[data-reduced-motion="false"] *)::after { animation:hcv-turn-card-spin 2s steps(60,end) infinite; }
@media(prefers-reduced-motion:no-preference) { ${card} [data-hcv-turn-card-apply][aria-busy="true"]:where(:root:not([data-reduced-motion]) *)::after { animation:hcv-turn-card-spin 2s steps(60,end) infinite; } }
@keyframes hcv-turn-card-spin { to { transform:rotate(360deg); } }
${card} [data-hcv-turn-card-hover] { --hcv-turn-card-glyph:${codexMask('turnDiffOpen')}; }
${card} [data-hcv-turn-card-more] { --hcv-turn-card-glyph:${codexMask('turnDiffDown')}; }
${card} [data-hcv-turn-card-more][aria-expanded="true"]::after { transform:rotate(180deg); }
${card} [data-hcv-turn-card-files] { border-block-start:1px solid var(--hcv-card-border); }
${card} :is([data-hcv-turn-card-file],[data-hcv-turn-card-more]) { display:flex; inline-size:100%; block-size:36px; flex:none; align-items:center; gap:8px; padding:4px 12px; text-align:start; }
${card} [data-hcv-turn-card-file] { background:light-dark(#fff,#1c1c1c); }
${card} [data-hcv-turn-card-file]:hover { background:color-mix(in oklab,var(--hcv-card-hover) 60%,transparent); }
${card} [data-hcv-turn-card-more]:hover { background:color-mix(in oklab,var(--hcv-card-hover) 30%,transparent); }
${card} [data-hcv-turn-card-files] > :last-child { border-end-start-radius:var(--hcv-card-radius); border-end-end-radius:var(--hcv-card-radius); }
${card} [data-hcv-turn-card-path] { display:flex; flex:1; align-items:center; min-inline-size:0; }
${card} [data-hcv-turn-card-directory] { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-inline-size:0; color:var(--hcv-card-description); }
${card} [data-hcv-turn-card-basename] { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-inline-size:100%; flex-shrink:0; }
@supports(corner-shape:superellipse(1.5)) { ${card} { --hcv-card-radius:12.5px; } ${card},${card} button,${card} [data-hcv-turn-card-icon] { corner-shape:superellipse(1.5); } }
`
}
