import { codexIconRules } from './codex-reference.js'

const groups = {
  'config:model': 'model',
  'config:chat': 'messages',
  'config:appearance': 'palette',
  'config:workspace': 'desktop',
  'config:safety': 'lock',
  'config:browser': 'web',
  'config:memory': 'memory',
  'config:voice': 'mic',
  'config:advanced': 'wrench',
  vault: 'shield',
  notifications: 'bell',
  billing: 'usage',
  providers: 'bolt',
  gateway: 'globe',
  connections: 'globe',
  keybinds: 'keyboard',
  keys: 'keys',
  sessions: 'archive',
  about: 'info',
}

const nativeIcons = {
  archive: 'archive', bell: 'bell', box: 'model', brain: 'memory', 'chart-bar': 'usage', 'circle-letter-a': 'artifacts',
  cpu: 'model', download: 'download', 'file-image': 'artifacts', 'file-text': 'artifacts',
  'folder-open': 'folderOpen', globe: 'globe', keyboard: 'keyboard', key: 'keys', 'key-round': 'keys', lock: 'lock',
  'message-circle': 'messages', microphone: 'mic', mic: 'mic', monitor: 'desktop', 'device-desktop': 'desktop', network: 'globe',
  palette: 'palette', paw: 'paw', photo: 'image', 'settings-2': 'sliders', 'shield-lock': 'shield',
  terminal: 'terminal', 'terminal-2': 'terminal', tool: 'wrench',
  trash: 'trash', 'trash-2': 'trash', users: 'team', 'volume-2': 'audio', wrench: 'wrench',
  bolt: 'bolt', zap: 'bolt', 'info-circle': 'info',
}

export function registerSettingsStyle(ctx, active) {
  const settings = `${active}[data-hcv-screen="settings"] [data-overlay-surface]`
  const rail = `${settings} [data-tour="overlay-nav"]`
  const searchButton = 'button[data-glass-opaque]'
  const searchIcon = 'svg.tabler-icon-search'
  const search = `${settings} ${searchButton}:has(> ${searchIcon})`
  const searchPosition = `${settings} > div > div:has(> ${searchButton} > ${searchIcon})`
  const compact = `${rail} + div button[aria-haspopup="menu"]`
  const settingsMenu = `${active}[data-hcv-screen="settings"] [data-slot="dropdown-menu-content"] [role="menuitem"]`
  const main = `${settings} main`
  const panels = `${active}[data-hcv-screen="settings"] :is([data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"])`
  const system = `${active}[data-hcv-screen="command-center"] [data-overlay-surface] main`
  const preferences = `:is(${main}, ${system})`
  const crumbWrap = `${main} > div:has(> nav > [aria-current="page"])`
  const crumbs = `:is(${main} > nav:has(> [aria-current="page"]), ${crumbWrap} > nav)`
  const control = ':is([data-slot="select-trigger"], [data-slot="searchable-select-trigger"], [data-slot="compact-select-trigger"], [data-slot="input"]:not([type="file"],[type="checkbox"],[type="range"],[type="color"]), [data-slot="textarea"])'
  const rowHost = '[class~="@container"]'
  const nativeRow = `${rowHost}:has(> .grid.py-3)`
  const field = '[id^="setting-field-"]'
  const fieldGroup = `${main} .grid:has(> ${field} > ${rowHost} > .grid.py-3):not(:has(> :not(${field})))`
  const rowGroup = `${main} :is(div, section):has(> ${rowHost} > .grid.py-3):not(:has(> :not(${rowHost}))):not(:where(${fieldGroup} > *))`
  const standalone = `${main} ${nativeRow}:not(:where(${rowGroup} > *, ${fieldGroup} > * > *))`
  const segmented = `${main} .inline-grid.grid-flow-col:has(> button[aria-pressed])`
  const searchField = `${main} div.inline-flex:has(> ${searchIcon} ~ input[placeholder])`
  const mainButtons = `:is(${main}, ${panels}) button[data-variant][data-size]:not([data-size="inline"])`
  const modes = `${main} [id="setting-field-gateway.connection-mode"] > .grid`
  const mode = `${modes} > button`
  const selectable = `${main} button.rounded-lg.border.transition-colors.text-left:not([data-slot], [id="setting-field-gateway.connection-mode"] *)`
  const action = `${preferences} button[data-slot="button"]:is([data-variant="text"], [data-variant="textStrong"]):not([data-size="inline"])`
  const inlineAction = `${preferences} button[data-size="inline"]:is([data-variant="text"], [data-variant="textStrong"])`
  const link = `:is(${preferences}, ${active}[data-hcv-screen="settings"] [data-slot="dialog-content"]) a[href]:not([role="button"], [data-slot="button"])`
  const operationRow = '.flex.items-center.justify-between.gap-3.py-2:has(> div.min-w-0 + button[data-variant="textStrong"])'
  const operation = `${system} section > ${operationRow}`
  const toggle = `${main} [data-slot="switch"][role="switch"]`
  const sheet = document.createElement('style')
  sheet.dataset.hcvSettings = ''
  sheet.textContent = `
@media (forced-colors: none) {
  ${settings} {
    --hcv-settings-rail-width: 240px;
    --hcv-settings-rail-inset: 8px;
    --hcv-settings-nav-fill: var(--hcv-dropdown-hover);
  }
  ${settings} [data-glass-raised] > div > .grid:has(> main, > [data-tour="overlay-nav"]) {
    grid-template-columns: minmax(0, var(--hcv-settings-rail-width)) minmax(0, 1fr);
  }
  ${rail} {
    gap: 1px;
    padding: 12px var(--hcv-settings-rail-inset);
    border-inline-end: 1px solid var(--hcv-hairline);
  }
  /* SettingsSidebar (21225.709d5925a9.js) and okCa's sidebar-header search.
     Hermes mounts the launcher beside the overlay card. Anchor it to the rail. */
  @media (width > 760px) {
    ${settings}:has(${searchButton} > ${searchIcon}) [data-tour="overlay-nav"] { padding-block-start: 60px; }
    ${searchPosition} {
      inset-inline: calc(1px + var(--hcv-settings-rail-inset)) auto;
      inset-block-start: 12px;
      inline-size: calc(var(--hcv-settings-rail-width) - 2 * var(--hcv-settings-rail-inset));
      translate: none;
    }
    ${search} {
      inline-size: 100%;
      block-size: 36px;
      justify-content: flex-start;
    }
  }
  ${search} {
    gap: 8px;
    padding-inline: 12px;
    border: 0;
    border-radius: 999px;
    background-color: var(--hcv-settings-nav-fill);
    box-shadow: none;
    color: var(--hcv-muted);
    text-align: start;
  }
  ${search} > span:not([data-slot]) {
    flex: 1;
    min-inline-size: 0;
    font-size: 14px;
    line-height: 18px;
  }
  ${search} > svg { inline-size: 16px; block-size: 16px; }
  ${codexIconRules(`${search} > ${searchIcon}`, 'search')}
  ${rail} button.row-hover {
    min-block-size: 30px;
    padding-inline: 8px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    color: var(--hcv-text);
  }
  ${rail} button.row-hover:not([aria-current="page"]) { background-color: transparent; }
  ${rail} button.row-hover[aria-current="page"] { background-color: var(--hcv-settings-nav-fill); }
  ${rail} button.row-hover > :is(svg, .codicon) { color: inherit; }
  ${rail} div[id] > button.row-hover { min-block-size: 30px; font-size: 12px; }
  ${rail} div[id] > button.row-hover > svg { inline-size: 14px; block-size: 14px; }
  ${rail} button[data-tour^="nav-toggle-"] { border-radius: 6px; }
  ${Object.entries(nativeIcons).map(([native, icon]) => codexIconRules(
    `:is(${rail} button.row-hover, ${compact}, ${settingsMenu}) > svg.tabler-icon-${native}`, icon)).join('')}
  ${codexIconRules(`:is(${rail} button.row-hover, ${compact}, ${settingsMenu}) > .codicon-account`, 'person')}
  ${Object.entries(groups).map(([name, icon]) =>
    codexIconRules(`${rail} button[data-tour="nav-${name}"] > :is(svg, .codicon)`, icon)).join('')}
  ${codexIconRules(`${rail} button[data-tour^="nav-toggle-"] > :is(svg, .codicon)`, 'right')}
  ${codexIconRules(`${compact} > .codicon-chevron-down`, 'down')}
  ${compact} { min-block-size: 30px; padding-inline: 8px; border-radius: 8px; }
  ${compact}:is(:hover, :focus-visible, [data-state="open"]) { background: var(--hcv-hover); }
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-download`, 'download')}
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-upload`, 'upload')}
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-refresh`, 'refresh')}

  /* Personalization, 338923.5e5c677ceb.js: 768px including 20px side padding.
     ZEx5 in 200452.4e72c790d9.js: grouped rows inside a 16px frame. */
  ${preferences}, ${panels} {
    --hcv-settings-group: light-dark(#f7f7f7, #232323);
    --hcv-settings-group-stroke: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    --hcv-settings-button: color-mix(in srgb, var(--hcv-text) 5%, transparent);
    --hcv-settings-card-radius: 16px;
    --hcv-settings-control-radius: 8px;
    font-family: var(--hcv-ui-font);
  }
  /* Codex Desktop's named corner scale, limited to settings contents and portals.
     Native utility classes then use the same curve on wrappers and their contents. */
  :is(${main}, ${panels}) {
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 10px;
    --radius-xl: 12px;
    --radius-2xl: 16px;
    --radius-3xl: 24px;
  }
  ${preferences} :is(div, section, fieldset, pre).rounded-md.border { border-radius: 8px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-lg.border { border-radius: 10px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-xl.border { border-radius: 12px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-2xl.border { border-radius: 16px; }
  ${main} {
    max-inline-size: 768px;
    padding-block-start: 32px;
    padding-block-end: 0;
    --conversation-text-font-size: 14px;
    --conversation-caption-font-size: 12px;
    --conversation-caption-line-height: 18px;
  }
  ${main} > section > div.h-full {
    padding-inline: 20px;
    padding-block-end: 32px;
  }
  ${crumbWrap} {
    margin-block-end: 16px;
    padding-inline: 20px;
  }
  ${crumbs} {
    min-block-size: 30px;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    line-height: 18px;
  }
  ${crumbs} > [aria-current="page"] {
    flex-basis: 100%;
    font-size: 28px;
    font-weight: 500;
    line-height: 1.2;
    min-inline-size: 0;
    white-space: normal;
  }
  ${crumbs} > button { font-size: 12px; }
  ${crumbs} > svg:has(+ [aria-current="page"]) { display: none; }
  ${codexIconRules(`${crumbs} > svg`, 'right')}
  ${main} :is(h1, h2) { font-weight: 600; text-wrap: balance; }
  ${main} :is(p, label) { overflow-wrap: anywhere; }
  ${rowGroup}, ${fieldGroup}, ${modes} {
    gap: 0;
    min-inline-size: 0;
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-card-radius);
    background: var(--hcv-settings-group);
  }
  ${rowGroup}, ${fieldGroup}, ${standalone} { padding-inline: clamp(8px, 2vw, 16px); }
  ${fieldGroup} > ${field} + ${field},
  ${main} ${nativeRow} + ${nativeRow} { border-block-start: 1px solid var(--hcv-hairline); }
  ${standalone} {
    min-inline-size: 0;
    border-inline: 1px solid var(--hcv-settings-group-stroke);
    background: var(--hcv-settings-group);
  }
  ${standalone}:not(:where(${nativeRow} + *)) {
    border-block-start: 1px solid var(--hcv-settings-group-stroke);
    border-start-start-radius: var(--hcv-settings-card-radius);
    border-start-end-radius: var(--hcv-settings-card-radius);
  }
  ${standalone}:not(:has(+ ${rowHost} > .grid.py-3)) {
    border-block-end: 1px solid var(--hcv-settings-group-stroke);
    border-end-start-radius: var(--hcv-settings-card-radius);
    border-end-end-radius: var(--hcv-settings-card-radius);
  }
  ${main} ${nativeRow} > .grid { gap: 12px 24px; padding-block: 12px; }
  ${main} ${nativeRow} > .grid > div > div:first-child { font-weight: 500; }
  ${main} ${nativeRow} > .grid:has(> div:nth-child(2) > [role="switch"]:only-child) {
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
  }
  @container (min-width: 672px) {
    ${main} ${nativeRow} > .grid:has(> div + div) {
      grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
      align-items: center;
    }
    ${main} ${nativeRow} > .grid > div:nth-child(2) { max-inline-size: 244px; }
  }
  ${modes} { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; }
  ${mode} {
    position: relative;
    padding: 12px 16px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  ${mode}:first-child { border-start-start-radius: 15px; border-start-end-radius: 15px; }
  ${mode}:last-child { border-end-start-radius: 15px; border-end-end-radius: 15px; }
  ${mode} + button::before {
    content: '';
    position: absolute;
    inset: 0 16px auto;
    block-size: 1px;
    background: var(--hcv-hairline);
    pointer-events: none;
  }
  ${mode}.ring-2 { background-color: var(--hcv-hover-menu); }
  ${mode}:active:not(:disabled) { background-color: color-mix(in srgb, var(--hcv-text) 16%, transparent); }
  ${mode}:focus-visible { z-index: 1; }
  ${mode} > p { margin-block-start: 4px; }
  ${selectable} { border-color: var(--hcv-hairline); border-radius: 16px; box-shadow: none; }
  ${selectable}.ring-2 { border-color: var(--hcv-stroke); background-color: var(--hcv-hover-menu); }

  /* Button actions and inline documentation have different affordances. */
  ${action} {
    min-block-size: 28px;
    max-inline-size: 100%;
    padding: 4px 8px;
    border-radius: var(--hcv-popup-button-radius);
    background-color: var(--hcv-settings-button);
    color: var(--hcv-text);
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    text-decoration: none;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  ${action}.text-destructive { color: var(--hcv-error); }
  ${action}:active:not(:disabled) { background-color: color-mix(in srgb, var(--hcv-text) 16%, transparent); }
  ${inlineAction}, ${link} { text-decoration: none; }
  ${link} { color: light-dark(#0169cc, #83c3ff); }
  ${link}:is(:hover, :focus-visible) { text-decoration: underline; }
  ${action}:focus-visible { box-shadow: none; }
  ${operation} {
    min-inline-size: 0;
    flex-wrap: wrap;
    padding: 12px 16px;
    border-inline: 1px solid var(--hcv-settings-group-stroke);
    background: var(--hcv-settings-group);
  }
  ${operation}:nth-child(1 of ${operationRow}) {
    border-block-start: 1px solid var(--hcv-settings-group-stroke);
    border-start-start-radius: 16px;
    border-start-end-radius: 16px;
  }
  ${operation} + ${operationRow} { border-block-start: 1px solid var(--hcv-hairline); }
  ${operation}:nth-last-child(1 of ${operationRow}) {
    border-block-end: 1px solid var(--hcv-settings-group-stroke);
    border-end-start-radius: 16px;
    border-end-end-radius: 16px;
  }

  /* Personalization uses the default F0xz switch (189497.6182e00931.js). */
  ${toggle} {
    block-size: 20px;
    padding-inline: 2px;
    border: 0;
    background-color: color-mix(in srgb, var(--hcv-text) 10%, transparent);
  }
  ${toggle}[data-state="checked"] { background-color: #339cff; }
  ${toggle} > [data-slot="switch-thumb"] { inline-size: 16px; block-size: 16px; background-color: #fff; }
  ${toggle}[data-state="checked"] > [data-slot="switch-thumb"] { translate: 12px 0; background-color: #fff; }
  ${toggle}[data-state="checked"]:dir(rtl) > [data-slot="switch-thumb"] { translate: -12px 0; }

  :is(${main}, ${panels}) ${control} {
    min-block-size: 32px;
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-settings-control-radius);
    background: var(--hcv-form-surface);
    padding-inline: 10px;
    font-size: 13px;
    line-height: 18px;
    box-shadow: none;
  }
  ${main} ${control}:is(:focus, :focus-within, [data-state="open"]):not(:disabled, [aria-invalid="true"]) {
    border-color: color-mix(in srgb, var(--hcv-text) 50%, transparent);
  }
  ${main} ${control}[aria-invalid="true"] { border-color: var(--hcv-error); }
  ${main} textarea[data-slot="textarea"] { padding-block: 8px; }
  ${searchField} {
    min-block-size: 32px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 999px;
    background: var(--hcv-form-surface);
    padding-inline: 10px;
    opacity: 1;
  }
  ${searchField}:focus-within { border-color: var(--hcv-focus); }
  ${searchField} > input:focus-visible { outline: none; }
  ${segmented} { min-inline-size: 0; max-inline-size: 100%; border-radius: 999px; }
  ${segmented} > button {
    min-block-size: 24px;
    border-radius: 999px;
    color: var(--hcv-muted);
  }
  ${segmented} > button[aria-pressed="true"] {
    background: var(--hcv-settings-group);
    color: var(--hcv-text);
    box-shadow: 0 0 0 .5px var(--hcv-hairline);
  }
  :is(${main}, ${panels}) [data-slot="badge"] { border-radius: 999px; }
  ${main} [data-slot="select-trigger"] > [data-slot="select-value"] {
    min-inline-size: 0;
    text-overflow: ellipsis;
  }
  ${mainButtons} {
    border-radius: var(--hcv-popup-button-radius);
  }
  :is(${mainButtons}, ${segmented} > button):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${main} button[data-size="sm"]:is([data-variant="default"], [data-variant="outline"], [data-variant="secondary"]) {
    min-block-size: 28px;
  }
  ${main} button:is([data-variant="outline"], [data-variant="secondary"]):not(:disabled) {
    border-color: var(--hcv-hairline);
  }
  ${settings} button[data-glass-opaque] { font-family: var(--hcv-ui-font); }
  @media (hover: hover) and (pointer: fine) {
    ${search}:hover { color: var(--hcv-text); }
    ${segmented} > button:hover:not(:disabled, [aria-pressed="true"]) {
      background: var(--hcv-hover-menu);
      color: var(--hcv-text);
    }
    ${main} ${control}:hover:not(:disabled, :focus, :focus-within, [data-state="open"], [aria-invalid="true"]) { border-color: var(--hcv-stroke); }
    ${mode}:hover:not(:disabled, .ring-2, :active),
    ${action}:hover:not(:disabled, :active) { background-color: var(--hcv-hover-menu); }
    ${rail} button.row-hover:not([aria-current]):hover { background-color: var(--hcv-settings-nav-fill); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${rail} button.row-hover { transition: background-color 150ms ease, color 150ms ease; }
    ${preferences} :is(button:not([role="switch"]), ${control}) {
      transition: color var(--hcv-enter-time) var(--hcv-ease), background-color var(--hcv-enter-time) var(--hcv-ease),
        border-color var(--hcv-enter-time) var(--hcv-ease), box-shadow var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${rail} button.row-hover { transition: none; }
    ${preferences} :is(button:not([role="switch"]), ${control}) { transition: none; }
  }
  @media (max-width: 760px) {
    ${settings} [data-glass-raised] > div > .grid:has(> [data-tour="overlay-nav"]) {
      grid-template-columns: minmax(0, 1fr);
    }
    ${main} { padding-block-start: 6px; }
    ${main} > section > div.h-full { padding-inline: 16px; }
    ${crumbWrap} { padding-inline: 16px; margin-block-end: 8px; }
    ${crumbs} > [aria-current="page"] { font-size: 24px; line-height: 28px; }
    ${search} { background-color: color-mix(in srgb, var(--hcv-text) 8%, var(--hcv-sidebar)); }
  }
}
@media (forced-colors: active) {
  ${preferences} :is(button, a[href], input, textarea, select):focus-visible {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
