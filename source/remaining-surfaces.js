import { codexIconRules } from './codex-reference.js'

export function registerRemainingSurfaces(ctx, active) {
  const directory = `${active} [data-slot="connectors-directory"]`
  const connector = `${directory} [data-slot="connector-row-card"]`
  const connectorDialog = `${active}[data-hcv-screen="capabilities"] [data-slot="dialog-content"]`
  const connectorTools = `${active} :is([data-slot="tools-list"], [data-slot="tools-summary"])`
  const overlays = `${active} [data-overlay-surface]`
  const panelRows = `${overlays} [data-panel-row]`
  const cap = `${active}[data-hcv-screen="capabilities"] section.h-full.min-w-0.overflow-hidden`
  const scopeRow = `${cap} div:has(> span + button[data-slot="select-trigger"] > [data-slot="select-value"])`
  const filterRow = 'button.row-hover[aria-pressed]'
  const filters = `${cap} [data-catalog] [data-tour="overlay-nav"] > ${filterRow}`
  const catalogCard = `${cap} [data-catalog] [data-catalog-card]`
  const dialog = `${active} [data-slot="dialog-content"]`
  const profiles = `${active}[data-hcv-screen="profiles"] [data-overlay-surface]`
  const profileRows = `${profiles} [data-panel-row]`
  const selectedProfile = `${profileRows}[class~="bg-(--ui-row-active-background)"]`
  const profileSearch = `${profiles} div.mb-1.w-full.shrink-0:has(> svg.tabler-icon-search + input[type="text"][placeholder])`
  const profileEditor = `${profiles} section > .min-h-48:has(> div > div > .cm-editor)`
  const proseFrame = `.flex.h-full.min-h-0.flex-col.overflow-hidden.border:has(> div > .cm-editor)`
  const framedEditor = `:is(${profileEditor} > ${proseFrame}, ${dialog}.max-w-2xl > .h-80 > ${proseFrame})`
  const segmented = `:is(${overlays}, ${dialog}) .inline-grid.auto-cols-fr.grid-flow-col:has(> button[aria-pressed])`
  const segmentedButton = `${segmented} > button[aria-pressed]`
  const webhookAlert = `${active}[data-hcv-screen="webhooks"] [data-glass-raised] > div > [data-slot="alert"]`
  const botRows = `${active} :is(button[data-roster-key], [data-slot="bots-section"] button[draggable="true"][data-slot="row-button"])`
  // Bots is an inline pane layer; the native tab identifies it even when the
  // roster is still loading and has no rows to anchor a selector to.
  const botPane = `${active} [data-hcv-sidebar-shell]:has(> [data-panel-header] [data-tree-tab="hermes-bots:pane"][aria-selected="true"]) > .relative.flex-1 > .absolute.inset-0:not([data-pane-hidden]) > .h-full.flex-col`
  const botLoading = `${botPane} > div:has(> [role="status"] > .glyph-spinner)`
  const terminalRail = `${active}:has([data-hcv-sidebar-shell] [data-tree-tab="terminal"][aria-selected="true"]) [data-pane-host="terminal"] [data-suppress-pane-reveal] > [role="tablist"]`
  const sheet = document.createElement('style')
  sheet.dataset.hcvRemainingSurfaces = ''
  sheet.textContent = `
@media (forced-colors: none) {
  ${directory} {
    container-type: inline-size;
    gap: 12px;
    padding: 8px 4px 0;
    font-family: var(--hcv-ui-font);
  }
  ${directory} > div:has(> h2) { gap: 12px; flex-wrap: wrap; }
  ${directory} > div > h2 {
    margin: 0;
    color: var(--hcv-text);
    font-size: 22px;
    font-weight: 600;
    line-height: 28px;
    letter-spacing: -.012em;
  }
  ${directory} > div:has(> h2) > button { min-block-size: 30px; padding-inline: 12px; border-radius: 8px; }
  ${directory} div:has(> svg.tabler-icon-search + input[placeholder]) {
    max-inline-size: 480px;
    flex: 1 1 320px;
  }
  ${directory} section > header h3 {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }
  ${directory} section > .grid:has(> [data-slot="connector-row-card"]) { gap: 8px; }
  ${connector} {
    min-block-size: 66px;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
    color: var(--hcv-text);
  }
  ${connector}[data-state="open"], ${connector}:has(button[aria-expanded="true"]) { background: var(--hcv-selected); }
  ${connector} > div:first-child { border-radius: 8px; }
  ${connector} button::after { border-radius: 12px; }
  ${connector} button:has(> .sr-only) { font-size: 14px; font-weight: 500; line-height: 20px; }
  ${connector} > div:last-child { inline-size: auto; min-inline-size: 72px; }
  ${connector} > div:last-child button:not([role="switch"]) { min-block-size: 26px; padding-inline: 8px; border-radius: 7px; }
  ${connector} p { font-size: 12px; line-height: 17px; }
  ${connector}:focus-within { border-color: var(--hcv-focus); }
  ${cap} :is([data-slot="compact-select-value"], [data-slot="select-value"]) { font-size: 13px; }
  ${cap} :is([data-slot="select-trigger"], button[data-variant="outline"]) {
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${scopeRow} { flex-wrap: wrap; gap: 6px 8px; padding: 6px 12px; }
  ${scopeRow} > button[data-slot="select-trigger"] {
    inline-size: max-content;
    max-inline-size: min(100%, 420px);
    min-inline-size: 0;
    min-block-size: 28px;
    padding: 0 8px;
    border-radius: 8px;
  }
  ${scopeRow} > button > [data-slot="select-value"] {
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${scopeRow} > button > .codicon-chevron-down { flex: none; inline-size: 14px; block-size: 14px; }
  ${codexIconRules(`${scopeRow} > button > .codicon-chevron-down`, 'down')}
  ${filters} { min-block-size: 26px; block-size: 26px; padding: 3px 6px; border-radius: 7px; }
  ${filters} + ${filterRow} { margin-block-start: var(--hcv-unit); }
  ${catalogCard} > div { padding-inline: 10px; }
  ${catalogCard} button[aria-haspopup="dialog"]:focus-visible::after {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -3px;
  }
  ${connectorDialog} [data-slot="add-server-form"] { gap: 16px; }
  ${connectorDialog} [data-slot="add-server-form"] label > span { font-size: 13px; line-height: 18px; }
  ${connectorTools} [data-slot="tool-row"] {
    border-radius: 8px;
    font-family: var(--hcv-ui-font);
  }
  ${connectorTools} [data-slot="tools-dirty-footer"] { border-color: var(--hcv-hairline); }

  /* Shared panel shell used by Hermes profiles, agents, webhooks, starmap,
     session import, and contributed panels. None of their actions are replaced. */
  ${overlays} header:has(> div > h2) > div > h2 {
    font-size: 20px;
    line-height: 26px;
    font-weight: 600;
  }
  ${panelRows} {
    min-block-size: 32px;
    border-radius: 8px;
    font-size: 13px;
  }
  ${panelRows} > button:first-child { min-block-size: inherit; padding-inline: 8px; }
  ${panelRows} :is(button, a):focus-visible { outline: 1px solid var(--hcv-focus); outline-offset: -1px; }
  ${profiles} { font-family: var(--hcv-ui-font); }
  ${profiles} header h3 { font-size: 16px; line-height: 22px; font-weight: 600; overflow-wrap: anywhere; }
  ${profiles} :is(header > div > p.font-mono, dl) { font-size: 12px; line-height: 18px; }
  ${profiles} :is(header > div > p.font-mono, dl dt) { color: var(--hcv-muted); }
  ${profileSearch} {
    min-block-size: 36px;
    padding-inline: 12px;
    border: 0;
    border-radius: 999px;
    background: var(--hcv-hover);
  }
  ${profileSearch}:has(> input:focus-visible) { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${profileSearch} > input:focus-visible { outline: none; }
  ${profileRows} { min-block-size: 30px; border-radius: 10px; }
  ${profileRows} > button[data-slot="row-button"] { border-radius: inherit; }
  ${profileRows} button[aria-haspopup="menu"] {
    inline-size: 24px;
    block-size: 24px;
    border-radius: 8px;
  }
  ${selectedProfile} { background: var(--hcv-selected); }
  ${profiles} button[data-slot="button"][data-size="sm"] { min-block-size: 28px; border-radius: 10px; }

  /* AGENTS.md in Codex settings is a 320px scrollable prose editor.
     The framed native CodeMirror keeps its buffer, shortcuts and wrapping. */
  ${profileEditor} { block-size: clamp(128px, 45vh, 320px); min-block-size: 0; }
  ${profileEditor} > div { min-inline-size: 0; }
  ${profiles} section:has(> .min-h-48) > div:first-child > div > div:first-child {
    color: var(--hcv-text);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    letter-spacing: normal;
    text-transform: none;
  }
  ${framedEditor} {
    border-radius: 10px;
    border-color: var(--hcv-hairline);
    background-color: var(--hcv-form-surface);
  }
  ${framedEditor}:focus-within { border-color: var(--hcv-focus); }
  ${framedEditor} > div { padding: 8px 12px; }
  ${framedEditor} .cm-editor.cm-focused { outline: none; }
  ${framedEditor} :is(.cm-content, .cm-line, .cm-scroller),
  ${dialog} #new-profile-soul {
    font-family: var(--hcv-ui-font);
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
  }
  ${framedEditor} .cm-line { padding-block: 2px; }
  @media (max-width: 760px), (max-height: 720px) {
    ${profileEditor} { block-size: clamp(128px, 30vh, 320px); }
    ${dialog}.max-w-2xl > .h-80:has(> div > div > .cm-editor) { block-size: min(320px, 50vh); }
  }
  ${segmented} { padding: 2px; gap: 2px; max-inline-size: 100%; border-radius: 10px; background: var(--hcv-hover); }
  ${segmentedButton} {
    min-block-size: 26px;
    min-inline-size: 0;
    padding-inline: 8px;
    border-radius: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
    box-shadow: none;
  }
  ${segmentedButton}[aria-pressed="true"] { background-color: var(--hcv-menu); }
  ${webhookAlert} { border-radius: 12px; }
  ${webhookAlert}:first-child { margin-block-start: 24px; }
  ${botRows} { border-radius: 8px; font-family: var(--hcv-ui-font); }
  ${botRows}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${botPane} { min-block-size: 0; background: var(--hcv-sidebar); }
  ${botPane} > :first-child {
    flex: none;
    min-block-size: 40px;
    padding: 6px 12px;
  }
  ${botPane} > :first-child > span:first-child {
    color: var(--hcv-muted);
    font: 600 13px/18px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }
  ${botPane} > [data-slot="bots-roster"] > div { padding-inline: 8px; }
  ${botLoading} {
    flex: none;
    min-block-size: 32px;
    justify-content: flex-start;
    gap: 8px;
    padding-inline: 12px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${botLoading}::after { content: 'Loading bots…'; }
  ${botLoading}:lang(ru)::after { content: 'Загрузка ботов…'; }
  ${terminalRail} { padding-block-start: 6px; }
  ${dialog} :is([data-slot="input"], [data-slot="textarea"], [data-slot="select-trigger"]) {
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${dialog} :is([data-slot="input"], [data-slot="select-trigger"]):not([type="file"]) { min-block-size: 32px; }
  ${dialog} button:is([data-variant="outline"], [data-variant="secondary"]) { border-color: var(--hcv-hairline); }

  ${codexIconRules(`${directory} svg.tabler-icon-rosette-discount-check`, 'verified')}
  ${codexIconRules(`${overlays} .codicon-add`, 'plus')}
  ${codexIconRules(`${overlays} .codicon-kebab-vertical`, 'more')}
  ${codexIconRules(`${overlays} .codicon-hubot`, 'bots')}
  ${codexIconRules(`${overlays} .codicon-account`, 'person')}
  ${codexIconRules(`${overlays} .codicon-link`, 'link')}
  ${codexIconRules(`${overlays} .codicon-comment-discussion`, 'hud')}
  ${codexIconRules(`${overlays} .codicon-edit`, 'edit')}
  ${codexIconRules(`${overlays} .codicon-trash`, 'trash')}
  ${codexIconRules(`${overlays} .codicon-refresh`, 'refresh')}
  ${codexIconRules(`${dialog} :is(.codicon-close, button[data-slot="dialog-close-button"] > svg.tabler-icon-x)`, 'close')}
  ${codexIconRules(`${active} button[aria-haspopup="menu"] > .codicon-add`, 'plus')}

  @container (max-width: 680px) {
    ${directory} section > .grid:has(> [data-slot="connector-row-card"]) { grid-template-columns: minmax(0, 1fr); }
  }
  @media (hover: hover) and (pointer: fine) {
    ${catalogCard}:hover {
      border-color: var(--hcv-hairline);
      background: color-mix(in srgb, var(--hcv-form-surface) 76%, var(--hcv-hover));
      box-shadow: none;
    }
    ${connector}:hover { background: var(--hcv-hover); border-color: var(--hcv-stroke); }
    ${connectorTools} [data-slot="tool-row"]:hover { background: var(--hcv-hover); }
    ${panelRows}:hover { background: var(--hcv-hover); }
    ${selectedProfile}:hover { background: var(--hcv-selected); }
    ${segmentedButton}[aria-pressed="false"]:hover:not(:disabled) { background: var(--hcv-hover-menu); }
    ${botRows}:hover { background: var(--hcv-hover); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${connector}, ${connectorTools} [data-slot="tool-row"], ${panelRows}, ${botRows} {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease), border-color var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${profileSearch}, ${profileRows} button, ${segmentedButton} { transition: none; }
  }
}
@media (forced-colors: active) {
  ${selectedProfile}, ${segmentedButton}[aria-pressed="true"] { outline: 1px solid Highlight; outline-offset: -1px; }
  ${profiles} :is(button, input):focus-visible,
  ${segmentedButton}:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
