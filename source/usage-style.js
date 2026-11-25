import { mountStyle } from './style-scope.js'

// Layout and controls follow Codex Desktop 26.1111.2228.0 usage settings.
export function registerUsageStyle(ctx, active) {
  const sheet = document.createElement('style')
  sheet.dataset.hcvUsageStyle = ''
  sheet.textContent = `
${active} [data-hcv-usage-page] { color: var(--hcv-text); font: 13px/1.45 var(--hcv-ui-font); padding-bottom: 40px; }
${active} [data-hcv-usage-page] * { box-sizing: border-box; }
${active} [data-hcv-usage-page] button, ${active} [data-hcv-usage-page] select { font: inherit; color: inherit; }
${active} [data-hcv-usage-page] button { cursor: pointer; }
${active} [data-hcv-usage-page] button:disabled { cursor: not-allowed; opacity: .55; }
${active} [data-hcv-usage-page] :is(button, select, a):focus-visible,
${active} [data-hcv-usage-nav]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
${active} [data-hcv-usage-page] h2, ${active} [data-hcv-usage-page] h3, ${active} [data-hcv-usage-page] p { margin: 0; }
${active} [data-hcv-usage-page] h2 { font-size: 17px; line-height: 24px; font-weight: 600; }
${active} [data-hcv-usage-page] h3 { font-size: 14px; line-height: 20px; font-weight: 600; }
${active} [data-hcv-usage-page] [data-u-tabs] { display: flex; gap: 2px; margin: 0 0 36px; }
${active} [data-hcv-usage-page] [data-u-tab] { border: 0; border-radius: 10px; background: transparent; padding: 8px 10px; color: var(--hcv-muted); }
${active} [data-hcv-usage-page] [data-u-tab][aria-selected="true"] { color: var(--hcv-text); background: var(--hcv-hover); }
${active} [data-hcv-usage-page] [data-u-section] { margin: 0 0 44px; }
${active} [data-hcv-usage-page] [data-u-section] > p { color: var(--hcv-muted); margin-top: 4px; line-height: 19px; }
${active} [data-hcv-usage-page] [data-u-card] { margin-top: 16px; background: var(--hcv-settings-group); border: 1px solid var(--hcv-settings-group-stroke); border-radius: 16px; overflow: hidden; }
${active} [data-hcv-usage-page] [data-u-pad] { padding: 16px; }
${active} [data-hcv-usage-page] [data-u-row] { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-width: 0; }
${active} [data-hcv-usage-page] [data-u-row] + [data-u-row] { border-top: 1px solid var(--hcv-settings-group-stroke); }
${active} [data-hcv-usage-page] [data-u-muted] { color: var(--hcv-muted); }
${active} [data-hcv-usage-page] [data-u-small] { font-size: 12px; line-height: 18px; }
${active} [data-hcv-usage-page] [data-u-button] { border: 0; border-radius: 9px; background: var(--hcv-hover); padding: 7px 10px; white-space: nowrap; }
${active} [data-hcv-usage-page] [data-u-button]:hover:not(:disabled) { background: var(--hcv-selected); }
${active} [data-hcv-usage-page] [data-u-button="primary"] { background: var(--hcv-action); color: var(--hcv-ink); }
${active} [data-hcv-usage-page] [data-u-meter] { height: 6px; overflow: hidden; background: color-mix(in srgb, var(--hcv-text) 12%, transparent); border-radius: 999px; margin-top: 6px; }
${active} [data-hcv-usage-page] [data-u-meter] > span { display: block; height: 100%; border-radius: inherit; background: var(--hcv-text); }
${active} [data-hcv-usage-page] [data-u-switch] { flex: 0 0 auto; inline-size: 34px; block-size: 20px; border: 0; border-radius: 999px; background: var(--hcv-stroke); padding: 2px; }
${active} [data-hcv-usage-page] [data-u-switch]::before { content: ''; display: block; width: 16px; height: 16px; background: var(--hcv-text); border-radius: 50%; }
${active} [data-hcv-usage-page] [data-u-switch][aria-checked="true"] { background: var(--hcv-action); }
${active} [data-hcv-usage-page] [data-u-switch][aria-checked="true"]::before { transform: translateX(14px); background: var(--hcv-ink); }
/* Usage overview: use the same insets, controls and separators as Codex. */
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="limits"] [data-u-card] > [data-u-pad] + [data-u-pad] {
  border-top: 1px solid var(--hcv-settings-group-stroke);
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="limits"] [data-u-row] {
  flex-wrap: wrap;
  gap: 2px 12px;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="allow"] > [data-u-card],
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="pending"] > [data-u-card] {
  margin-top: 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="allow"] [data-u-row] > div,
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="pending"] [data-u-row] > div,
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="resets"] [data-u-row] > div {
  min-width: 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="resets"] > [data-u-card] {
  padding-inline: 16px;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="resets"] [data-u-reset-count] {
  padding-block: 10px;
  border-bottom: 1px solid var(--hcv-settings-group-stroke);
  font-weight: 600;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-reset-count] > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: light-dark(#eaeaea, #141414);
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-reset-count] > span > span {
  color: var(--hcv-muted);
  font-weight: 400;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="resets"] [data-u-row] {
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 14px 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-kind="resets"] [data-u-card] > [data-u-pad]:not([data-u-row]) {
  padding-inline: 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-button]:not([data-u-button="primary"]) {
  background: var(--hcv-settings-button);
  border-radius: 8px;
  padding: 6px 9px;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-button]:not([data-u-button="primary"]):hover:not(:disabled) {
  background: var(--hcv-selected);
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch] {
  inline-size: 32px;
  block-size: 19px;
  border: 1px solid var(--hcv-stroke);
  padding: 2px;
  background: var(--hcv-selected);
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch]::before {
  width: 13px;
  height: 13px;
  transform: none;
  translate: 0 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch][aria-checked="true"] {
  border-color: transparent;
  background: var(--hcv-action);
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch][aria-checked="true"]::before {
  transform: none;
  translate: 13px 0;
}
${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch][aria-checked="true"]:dir(rtl)::before { translate: -13px 0; }
@media (prefers-reduced-motion: no-preference) {
  ${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch] {
    transition: background-color 175ms linear 50ms, border-color 150ms cubic-bezier(.19,1,.22,1);
  }
  ${active} [data-hcv-usage-page] [data-u-overview] [data-u-switch]::before {
    transition: translate 250ms cubic-bezier(.65,0,.35,1), background-color 150ms cubic-bezier(.19,1,.22,1);
  }
  ${active} [data-hcv-usage-page] [data-u-overview] [data-u-button] {
    transition: background-color 150ms cubic-bezier(.19,1,.22,1);
  }
}
${active} [data-hcv-usage-page] [data-u-controls] { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; }
${active} [data-hcv-usage-page] [data-u-segment] { display: inline-flex; border-radius: 10px; padding: 2px; background: color-mix(in srgb, var(--hcv-text) 3%, transparent); }
${active} [data-hcv-usage-page] [data-u-segment] button { padding: 6px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--hcv-muted); }
${active} [data-hcv-usage-page] [data-u-segment] button[aria-pressed="true"] { background: var(--hcv-hover); color: var(--hcv-text); }
${active} [data-hcv-usage-page] select { max-width: 220px; padding: 6px 26px 6px 10px; background: var(--hcv-settings-group); border: 1px solid var(--hcv-settings-group-stroke); border-radius: 9px; }
${active} [data-hcv-usage-page] [data-u-chart] { height: 190px; display: flex; align-items: end; justify-content: space-around; gap: 4px; padding: 24px 10px 0; background-image: repeating-linear-gradient(to top, var(--hcv-settings-group-stroke) 0 1px, transparent 1px 48px); }
${active} [data-hcv-usage-page] [data-u-bar] { flex: 1; max-width: 36px; min-width: 3px; display: flex; flex-direction: column-reverse; align-self: end; border-radius: 4px 4px 0 0; overflow: hidden; }
${active} [data-hcv-usage-page] [data-u-bar] span { display: block; width: 100%; flex: none; }
${active} [data-hcv-usage-page] [data-u-dates] { display: flex; justify-content: space-between; color: var(--hcv-muted); margin-top: 6px; font-size: 12px; }
${active} [data-hcv-usage-page] [data-u-legend] { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px 18px; margin-top: 18px; max-height: 150px; overflow: auto; }
${active} [data-hcv-usage-page] [data-u-legend-item] { border-inline-start: 4px solid var(--u-color); padding-inline-start: 10px; min-width: 0; }
${active} [data-hcv-usage-page] [data-u-legend-item] strong { display: block; font-size: 16px; }
${active} [data-hcv-usage-page] [data-u-table] { width: 100%; border-collapse: collapse; table-layout: fixed; text-align: start; }
${active} [data-hcv-usage-page] [data-u-table] :is(th,td) { padding: 12px 16px; border-bottom: 1px solid var(--hcv-settings-group-stroke); font-weight: 400; text-align: start; vertical-align: top; }
${active} [data-hcv-usage-page] [data-u-table] th { color: var(--hcv-muted); font-size: 12px; }
${active} [data-hcv-usage-page] [data-u-table] :is(th,td):not(:first-child) { text-align: end; width: 23%; }
${active} [data-hcv-usage-page] [data-u-table] tr:last-child td { border-bottom: 0; }
${active} [data-hcv-usage-page] [data-u-disclose] { border: 0; background: transparent; padding: 0; width: 100%; text-align: start; display: flex; gap: 10px; align-items: baseline; }
${active} [data-hcv-usage-page] [data-u-chat-note] { display: block; color: var(--hcv-muted); font-size: 12px; line-height: 18px; margin-top: 2px; }
${active} [data-hcv-usage-page] [data-u-details] { padding: 0 0 6px 20px; display: grid; gap: 8px; }
${active} [data-hcv-usage-page] [data-u-details] dl { display: grid; grid-template-columns: 80px 1fr; gap: 4px 12px; margin: 0; }
${active} [data-hcv-usage-page] [data-u-details] dt { color: var(--hcv-muted); }
${active} [data-hcv-usage-page] [data-u-details] dd { margin: 0; }
${active} [data-hcv-usage-page] [data-u-link] { border: 0; background: transparent; padding: 2px 0; text-align: start; }
${active} [data-hcv-usage-page] [data-u-error] { color: var(--hcv-error); }
${active} [data-hcv-usage-page] dialog { color: var(--hcv-text); background: var(--hcv-panel); border: 1px solid var(--hcv-stroke); border-radius: 16px; padding: 20px; max-width: min(440px,calc(100vw - 32px)); }
${active} [data-hcv-usage-page] dialog::backdrop { background: #0009; }
${active} [data-hcv-usage-page] dialog [data-u-actions] { display: flex; justify-content: end; gap: 8px; margin-top: 20px; }
${active} [data-hcv-usage-nav] { min-height: 30px; border: 0; background: transparent; color: var(--hcv-text); }
${active} [data-hcv-usage-nav][aria-current="page"] { background: var(--hcv-settings-nav-fill); }
${active} [data-hcv-usage-nav]:hover { background: var(--hcv-hover); }
${active} [data-hcv-usage-nav] > svg { flex: none; width: 16px; height: 16px; }
${active}[data-hcv-usage-active] [data-tour="nav-plugins"] { background: transparent; }
${active}[data-hcv-usage-active] [data-overlay-surface] main > div > nav:has(> [aria-current="page"]) > :not([aria-current="page"]) { display: none; }
${active} [data-tour="nav-plugins:desktop:hermes-codex-visual:usage"] { display: none; }
@media (max-width: 760px) {
  ${active} [data-hcv-usage-page] [data-u-legend] { grid-template-columns: repeat(2,minmax(0,1fr)); }
  ${active} [data-hcv-usage-page] [data-u-table] :is(th,td) { padding: 10px 8px; }
  ${active} [data-hcv-usage-page] [data-u-table] :is(th,td):not(:first-child) { width: 26%; }
}
@media (forced-colors: active) {
  ${active} [data-hcv-usage-page] [data-u-meter] { border: 1px solid CanvasText; }
  ${active} [data-hcv-usage-page] [data-u-bar] span { forced-color-adjust: none; }
}
`
  mountStyle(ctx, sheet, { screens: ['settings'] })
}
