import { mountStyle } from './style-scope.js'

export function registerUsageHistoryChartStyle(ctx, active) {
  const sheet = document.createElement('style')
  sheet.dataset.hcvUsageHistoryChartStyle = ''
  sheet.textContent = `
${active} [data-hcv-usage-page] [data-u-history-card] { padding: 16px; }
${active} [data-hcv-usage-page] [data-u-history-heading] { display: flex; align-items: center; justify-content: space-between; min-height: 28px; gap: 12px; }
${active} [data-hcv-usage-page] [data-u-history-navigation] { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
${active} [data-hcv-usage-page] [data-u-history-arrow] { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; }
${active} [data-hcv-usage-page] [data-u-history-arrow]:hover:not(:disabled) { background: var(--hcv-hover); }
${active} [data-hcv-usage-page] [data-u-history-body] { min-width: 0; }
${active} [data-hcv-usage-page] [data-u-history-plot] { display: flex; height: 136px; align-items: stretch; margin-top: 30px; background-image: repeating-linear-gradient(to top, var(--hcv-settings-group-stroke) 0 1px, transparent 1px 34px); }
${active} [data-hcv-usage-page] [data-u-history-day] { display: flex; flex: 1 1 0; min-width: 0; align-items: flex-end; justify-content: center; padding: 0; border: 0; background: transparent; }
${active} [data-hcv-usage-page] [data-u-history-bar] { display: flex; flex-direction: column; width: min(38px, 75%); max-width: 100%; overflow: hidden; border-radius: 4px 4px 0 0; }
${active} [data-hcv-usage-page] [data-u-history-dense] [data-u-history-bar] { width: min(18px, 75%); }
${active} [data-hcv-usage-page] [data-u-history-bar] > span { display: block; width: 100%; flex: none; }
${active} [data-hcv-usage-page] [data-u-history-highlighted] [data-u-history-day]:not([data-u-history-active]) [data-u-history-bar] { opacity: .4; }
${active} [data-hcv-usage-page] [data-u-history-day]:focus-visible { z-index: 1; outline-offset: -2px; }
${active} [data-hcv-usage-page] [data-u-history-dates] { display: grid; margin-top: 7px; color: var(--hcv-muted); font-size: 12px; line-height: 18px; }
${active} [data-hcv-usage-page] [data-u-history-dates] span { justify-self: center; white-space: nowrap; }
${active} [data-hcv-usage-page] [data-u-history-incomplete] { color: var(--hcv-muted); font-size: 12px; margin-top: 10px; }
${active} [data-hcv-usage-page] [data-u-history-legend] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 18px; max-height: 100px; margin-top: 18px; overflow: auto; }
${active} [data-hcv-usage-page] [data-u-history-legend-item] { border-inline-start: 4px solid var(--u-history-color); border-radius: 2px; padding-inline-start: 10px; min-width: 0; min-height: 39px; }
${active} [data-hcv-usage-page] [data-u-history-legend-item] > span { display: block; overflow-wrap: anywhere; }
${active} [data-hcv-usage-page] [data-u-history-legend-item] strong { display: block; font-size: 16px; line-height: 21px; }
${active} [data-hcv-usage-page] [data-u-history-unavailable] { color: var(--hcv-muted); padding: 22px 0 8px; }
@media (prefers-reduced-motion: no-preference) {
  @keyframes hcv-usage-history-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes hcv-usage-history-from-previous { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  @keyframes hcv-usage-history-from-next { from { transform: translateX(100%); } to { transform: translateX(0); } }
  ${active} [data-hcv-usage-page] [data-u-history-enter="previous"] { animation: hcv-usage-history-from-previous 520ms ease-out both; }
  ${active} [data-hcv-usage-page] [data-u-history-enter="next"] { animation: hcv-usage-history-from-next 520ms ease-out both; }
  ${active} [data-hcv-usage-page] [data-u-history-bar] { transform-origin: bottom; animation: hcv-usage-history-grow 300ms ease both; transition: opacity 160ms ease; }
  ${active} [data-hcv-usage-page] [data-u-history-arrow] { transition: background-color 120ms ease; }
}
@media (max-width: 520px) {
  ${active} [data-hcv-usage-page] [data-u-history-legend] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (forced-colors: active) {
  ${active} [data-hcv-usage-page] [data-u-history-bar] > span { forced-color-adjust: none; }
}
`
  mountStyle(ctx, sheet, { screens: ['settings'] })
}
