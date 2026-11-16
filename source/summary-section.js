import { createElement as h, useId } from 'react'
import { codexIconStyle } from './codex-reference.js'

export function SummarySection({ kind, title, expanded, onToggle, action, children, ...props }) {
  const id = useId()
  return h('section', { ...props, 'data-hcv-summary-section': kind, 'data-collapsed': !expanded || undefined, 'aria-label': title },
    h('header', null,
      h('button', {
        type: 'button', 'data-hcv-summary-heading': '', 'aria-controls': id,
        'aria-expanded': expanded, onClick: onToggle,
      }, h('span', { title, dir: 'auto' }, title),
      h('span', { 'aria-hidden': true, 'data-hcv-summary-chevron': '', style: codexIconStyle('down') })),
      action),
    h('div', { id, 'data-hcv-summary-disclosure': '', inert: !expanded, 'aria-hidden': !expanded },
      h('div', { 'data-hcv-summary-contents': '' }, children)))
}

export function summarySectionStyles(card) {
  const section = card + ' > [data-hcv-summary-section]'
  return `
${section} + [data-hcv-summary-section] {
  border-block-start: .5px solid var(--hcv-hairline);
  margin-block-start: 8px;
  padding-block-start: 8px;
}
${section}[data-hcv-summary-section="outputs"] + [data-hcv-summary-agents] { border-block-start: 0; padding-block-start: 0; }
${section} > header { display: flex; align-items: center; gap: 4px; min-block-size: 28px; }
${section} [data-hcv-summary-heading] {
  display: flex; align-items: center; gap: 6px; min-inline-size: 0; max-inline-size: 100%;
  min-block-size: 24px; padding: 0; border: 0; border-radius: 6px; background: none; cursor: pointer;
  color: var(--hcv-muted); font: inherit; text-align: start;
}
${section} [data-hcv-summary-heading] > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${section} [data-hcv-summary-chevron] {
  display: block; inline-size: 12px; block-size: 12px; flex: none; opacity: 0;
}
${section} [data-hcv-summary-heading]:is(:hover, :focus-visible, [aria-expanded="false"]) [data-hcv-summary-chevron] { opacity: 1; }
${section}[data-collapsed] [data-hcv-summary-chevron] { rotate: -90deg; }
${section}[data-collapsed]:dir(rtl) [data-hcv-summary-chevron] { rotate: 90deg; }
${section} > header > :last-child:not([data-hcv-summary-heading]) { margin-inline-start: auto; }
${section} [data-hcv-summary-disclosure] {
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr; margin-block-start: 2px;
}
${section}[data-collapsed] [data-hcv-summary-disclosure] { grid-template-rows: 0fr; opacity: 0; margin-block-start: 0; }
${section} [data-hcv-summary-contents] { min-inline-size: 0; min-block-size: 0; overflow: clip; margin-inline: -8px; padding-inline: 8px; }
@media (prefers-reduced-motion: no-preference) {
  ${section} [data-hcv-summary-disclosure] {
    transition: grid-template-rows 300ms cubic-bezier(.19, 1, .22, 1), opacity 300ms cubic-bezier(.19, 1, .22, 1);
  }
  ${section} [data-hcv-summary-chevron] { transition: rotate 300ms cubic-bezier(.19, 1, .22, 1); }
}
`
}
