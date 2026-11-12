import { codexIconRules } from './codex-reference.js'

export function registerAppUpdatesStyle(ctx, active) {
  // Hermes shares VersionHero, UpdateStatusCard and VersionDetails between
  // About and the update dialog. Match those surfaces without translated text.
  const brand = 'span > img:is([src$="nous-girl.png"], [src$="nous-girl-dark.png"])'
  const hero = `.flex.flex-col:has(> ${brand})`
  const dialog = `[data-slot="dialog-content"].max-w-sm:has(> div > div > .flex.flex-col > ${brand}):has(> div > div > .flex.flex-col > div > [data-slot="dialog-title"])`
  const layout = `div:has(> .flex.flex-col > ${brand})`
  const about = `${active}[data-hcv-screen="settings"] [data-overlay-surface] main`
  const updates = '[id="setting-field-about.updates"]'
  const updateDialog = `${active} ${dialog}`
  const dialogLayout = `${updateDialog} > div > ${layout}`
  const aboutUpdates = `${about} ${updates}`
  const aboutLayout = `${about} ${layout}:has(${updates})`
  const versionHero = `:is(${dialogLayout} > ${hero}, ${aboutLayout} > ${hero})`
  const warning = `${versionHero} > div.rounded-xl.border`
  const status = `:is(${dialogLayout} > ${hero} ~ div.rounded-xl.border, ${aboutUpdates} > div.rounded-xl.border)`
  const aboutDetails = `${aboutLayout} > div > dl.grid`
  const details = `:is(${dialogLayout} > dl, ${aboutDetails})`
  const quietAction = `:is(${warning}, ${status}) [data-slot="button"]:is([data-variant="text"], [data-variant="textStrong"])`

  const sheet = document.createElement('style')
  sheet.dataset.hcvAppUpdates = ''
  sheet.textContent = `
@media (forced-colors: none) {
  ${updateDialog} {
    inline-size: min(480px, calc(100% - 32px));
    max-inline-size: none;
    max-block-size: min(85vh, calc(100% - 32px));
    background: var(--hcv-menu);
  }
  ${updateDialog} > div:first-child { overflow: auto; }
  ${dialogLayout} {
    gap: 12px;
    padding: 20px;
  }
  ${versionHero} {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 0;
    text-align: start;
  }
  ${dialogLayout} > ${hero} > div:nth-child(2) { padding-inline-end: 20px; }
  ${versionHero} > span:first-child {
    inline-size: 40px;
    block-size: 40px;
  }
  ${versionHero} :is(h2, [data-slot="dialog-title"]) {
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
  }
  ${versionHero} > div:nth-child(2) > p {
    margin-block-start: 2px;
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 16px;
  }
  ${warning} { grid-column: 1 / -1; margin-block-start: 4px; }
  ${warning}, ${status} {
    min-inline-size: 0;
    padding: 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
    color: var(--hcv-text);
    font-size: 13px;
    line-height: 18px;
    overflow-wrap: anywhere;
  }
  ${warning} > div { gap: 10px; }
  ${warning} > div > svg { color: light-dark(#9a5c00, #f2b94b); }
  ${codexIconRules(`${warning} > div > svg`, 'warning')}
  :is(${warning}, ${status}) p.font-medium { font-weight: 500; }
  :is(${warning}, ${status}) p.text-xs { color: var(--hcv-muted); font-size: 12px; line-height: 18px; }
  ${quietAction} {
    min-block-size: 28px;
    max-inline-size: 100%;
    padding: 4px 8px;
    border-radius: 8px;
    background: var(--hcv-hover-menu);
    color: var(--hcv-text);
    text-decoration: none;
    white-space: normal;
  }
  ${quietAction}:not(:disabled):hover { background: var(--hcv-selected); text-decoration: none; }
  :is(${warning}, ${status}, ${details}) :is(a, button):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 2px;
  }
  ${details} {
    display: grid;
    gap: 0;
    min-inline-size: 0;
    padding: 0 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-form-surface);
    font-size: 13px;
    line-height: 18px;
  }
  ${aboutDetails} { margin-block-start: 12px; }
  ${details} > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 12px;
    padding-block: 8px;
  }
  ${details} > div + div { border-block-start: 1px solid var(--hcv-hairline); }
  ${details} dt { color: var(--hcv-muted); }
  ${details} :is(dt, dd, a) {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  ${details} dd { text-align: end; }
  ${details} a { text-underline-offset: 3px; }
}
`

  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
