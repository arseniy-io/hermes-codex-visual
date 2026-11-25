import { mountStyle } from './style-scope.js'

export function registerUsageGroupSelectStyle(ctx, active) {
  const sheet = document.createElement('style')
  sheet.dataset.hcvUsageGroupSelectStyle = ''
  sheet.textContent = `
${active} [data-hcv-usage-page] [data-u-group-trigger] {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 9px;
  min-height: 30px; max-width: min(220px, 55vw); padding: 5px 10px;
  border: 1px solid var(--hcv-settings-group-stroke); border-radius: 9px;
  background: var(--hcv-settings-group); color: var(--hcv-text); white-space: nowrap;
}
${active} [data-hcv-usage-page] [data-u-group-trigger] > span {
  overflow: hidden; text-overflow: ellipsis;
}
${active} [data-hcv-usage-page] [data-u-group-trigger] > svg { flex: none; color: var(--hcv-muted); }
${active} [data-hcv-usage-page] [data-u-group-trigger]:is(:hover, [data-state="open"]) { background: var(--hcv-hover); }
${active} [data-hcv-usage-page] [data-u-section-heading] {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
}
${active} [data-hcv-usage-page] [data-u-section-heading] > h2 { min-width: 0; }
${active} [data-hcv-usage-page] [data-u-plan-heading] { margin-top: 20px; }
${active} [data-hcv-usage-group-menu][data-state] {
  min-inline-size: min(210px, calc(100vw - 16px)); max-inline-size: min(300px, calc(100vw - 16px));
  padding: 5px; border: 1px solid var(--hcv-settings-group-stroke); border-radius: 14px;
  background: var(--hcv-settings-group); color: var(--hcv-text);
  box-shadow: 0 10px 24px #0003; font: 13px/20px var(--hcv-ui-font);
}
${active} [data-hcv-usage-group-menu] [data-hcv-usage-group-item] {
  display: flex; justify-content: space-between; gap: 16px; min-height: 32px;
  margin: 0; padding: 6px 8px; border-radius: 7px; color: inherit; font: inherit;
  cursor: pointer;
}
${active} [data-hcv-usage-group-menu] [data-hcv-usage-group-item] > svg { flex: none; color: var(--hcv-muted); }
${active} [data-hcv-usage-group-menu] [data-hcv-usage-group-item]:is([data-highlighted], :hover) {
  background: var(--hcv-hover); color: var(--hcv-text);
}
@media (prefers-reduced-motion: reduce) {
  ${active} [data-hcv-usage-group-menu][data-state] { animation: none; }
}
`
  mountStyle(ctx, sheet, { screens: ['settings'] })
}
