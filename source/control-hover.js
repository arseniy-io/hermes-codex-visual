import { mountCSS } from './style-scope.js'

const titlebar = '[data-titlebar-cluster] [data-size="icon-titlebar"], [data-hcv-right-mirror] [data-tour="right-pane-toggle"]'
const summary = '[data-hcv-context-toggle]'
const sidebar = '[data-hcv-sidebar-bar] > button, [data-hcv-history] > button'
const quiet = ':is([data-variant="ghost"], [data-variant="outline"], [data-variant="secondary"])'
const nativeIcon = '[data-size^="icon"]' + quiet
const nativeAction = ':is([data-size="xs"], [data-size="sm"], [data-size="default"], [data-size="lg"])' + quiet +
  ':not([role], [data-slot="input-group-button"])'
const localIcon = [
  '[data-hcv-context-card] .hcv-context-icon', '.hcv-sources-add', '[data-hcv-summary-add-tab]',
  '[data-hcv-queue-more]', '[data-hcv-archive-close]', '[data-hcv-table-action="close"]',
  '[data-hcv-usage-page] [data-u-history-arrow]', '.hcv-changes-refresh',
  '[data-hcv-recents-actions] > button', '[data-hcv-cron-manage]', 'button[data-tour^="nav-toggle-"]',
].join(', ')
const enabled = ':not(:disabled, [aria-disabled="true"])'

export function registerControlHover(ctx, active) {
  const toolbar = active + ' :is(' + [titlebar, summary, sidebar].join(', ') + ')'
  const icon = active + ' :is(' + [nativeIcon, localIcon].join(', ') + ')'
  const rail = toolbar + ':where(' + sidebar + ')'
  const open = ':is([aria-pressed="true"], [aria-expanded="true"], [data-state="open"])'
  const rightSelected = active + ' [data-hcv-right-mirror][data-hcv-right-open] [data-tour="right-pane-toggle"]'

  mountCSS(ctx, 'data-hcv-control-hover', [
    '@media (forced-colors: none) {',
    active + ' {',
    '  --hcv-control-hover: light-dark(rgb(26 28 31 / .05), rgb(255 255 255 / .08));',
    '  --hcv-control-selected: color-mix(in srgb, var(--hcv-text) 5%, transparent);',
    '}',
    active + ' :where(' + nativeAction + ') {',
    '  border-radius: 8px;',
    '  --chrome-action-hover: var(--hcv-control-hover);',
    '}',
    toolbar + ', ' + icon + ' {',
    '  border-radius: 999px;',
    '  corner-shape: round;',
    '  --chrome-action-hover: var(--hcv-control-hover);',
    '}',
    active + ' :is(' + titlebar + ', ' + summary + ') {',
    '  inline-size: 28px;',
    '  block-size: 28px;',
    '}',
    // The sidebar fades its fill while the titlebar paints immediately.
    toolbar + ' { transition: none; }',
    '@media (prefers-reduced-motion: no-preference) {',
    rail + ' { transition: background-color 150ms ease, color 150ms ease; }',
    '}',
    toolbar + ':not(:where(' + summary + '))' + enabled + open + ' {',
    '  background-color: var(--hcv-control-hover);',
    '  color: var(--hcv-text);',
    '}',
    rightSelected + ' { background-color: var(--hcv-control-selected); }',
    toolbar + enabled + ':focus-visible {',
    '  outline: 2px solid var(--hcv-focus);',
    '  outline-offset: 0;',
    '  box-shadow: none;',
    '}',
    '@media (hover: hover) and (pointer: fine) {',
    toolbar + enabled + ':hover, ' + icon + enabled + ':hover {',
    '  background-color: var(--hcv-control-hover);',
    '  color: var(--hcv-text);',
    '}',
    rightSelected + enabled + ':hover { background-color: color-mix(in srgb, var(--hcv-text) 10%, transparent); }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    icon + ' { transition: none; }',
    '}',
    '}',
  ].join('\n'))
}
