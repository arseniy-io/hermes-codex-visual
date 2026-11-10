import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'

const menus = ':is([data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"], [data-slot="context-menu-content"], [data-slot="context-menu-sub-content"], [data-slot="select-content"])'
const modelCatalog = '[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):has(> [data-slot="dropdown-menu-item"] > .codicon-settings-gear)'
const modelMeta = '[data-slot="dropdown-menu-sub-trigger"] > span > span.uppercase.tracking-wide'
const effortBadge = 'data-hcv-model-effort'
// Compact labels from Hermes' lib/reasoning-effort.ts, including route clamps.
const effortLabels = new Set(['Off', 'Min', 'Low', 'Med', 'High', 'XHigh', 'Max', 'Ultra'])
const items = ':is([data-slot^="dropdown-menu-"][role^="menuitem"], [data-slot^="context-menu-"][role^="menuitem"], [data-slot="select-item"])'
const popover = '[data-slot="popover-content"]'
const tip = '[data-slot="tooltip-content"]'
const dialog = '[data-slot="dialog-content"]'
const dialogOverlay = '[data-slot="dialog-overlay"]'
const notification = '[data-slot="card-stack-surface"] > div > [data-slot="alert"][aria-live]'
const notificationStack = `[data-slot="card-stack"]:has(> [data-slot="card-stack-front"] > ${notification})`
const overlays = '[data-overlay-surface]'
const selectTriggers = ':is([data-slot="select-trigger"], [data-slot="searchable-select-trigger"], [data-slot="compact-select-trigger"])'
const fields = `:is([data-slot="input"]:not([type="file"], [type="checkbox"], [type="range"], [type="color"]), ${selectTriggers}, [data-slot="textarea"])`
const checks = ':is([data-slot="checkbox"], [data-slot="checkbox-mark"])'
const checkIcon = ':is(.codicon-check, svg.tabler-icon-check)'
const commandItems = '[data-slot="command-item"]'
const menuButtons = ':is([data-hcv-draft-menu], [data-hcv-recents-menu], [data-hcv-queue-menu], [data-hcv-message-menu]) button'
const highlightedItem = `${items}:is(:focus, [data-highlighted], [data-state="open"]):not([data-disabled], [aria-disabled="true"])`
const toggle = '[data-slot="switch"][role="switch"]'
const thumb = '[data-slot="switch-thumb"]'
const pageTabs = '[data-tour="page-tabs"]'
const pageShell = 'section.h-full.min-w-0.overflow-hidden:not([data-chat-surface])'

const menuGlyphs = {
  'archive': 'archive', 'check': 'check', 'check-all': 'markRead', 'chevron-down': 'down',
  'chevron-right': 'right', 'close': 'close', 'copy': 'copy', 'edit': 'edit',
  'folder': 'folder', 'folder-library': 'folder', 'folder-opened': 'folderOpen',
  'new-folder': 'folderPlus', 'pin': 'pin', 'pinned': 'pin', 'pinned-dirty': 'pin',
  'refresh': 'refresh', 'symbol-color': 'palette', 'target': 'target', 'trash': 'trash',
  'clock': 'schedule', 'root-folder': 'folder', 'account': 'person', 'pulse': 'system',
  'list-filter': 'filter', 'add': 'plus', 'kebab-vertical': 'more', 'ellipsis': 'more',
}

function screenFromRoute() {
  const name = window.location.hash.match(/^#\/(settings|command-center|session-import|capabilities|messaging|artifacts|cron|agents|profiles|starmap|webhooks)(?:[/?#]|$)/)?.[1]
  return name || ''
}

function watchModelEffortBadges(ctx) {
  const refresh = () => {
    observer.disconnect()
    // The composer menu opens in a Radix portal under body. Once open, only
    // observe that menu so searches and effort changes update the badges.
    observer.observe(document.body, { childList: true })
    for (const menu of document.querySelectorAll(modelCatalog)) {
      for (const badge of menu.querySelectorAll(modelMeta)) {
        const levels = badge.textContent.trim().split('→')
        badge.toggleAttribute(effortBadge, levels.every(level => effortLabels.has(level)))
      }
      observer.observe(menu, { childList: true, subtree: true, characterData: true })
    }
  }
  const observer = new MutationObserver(refresh)
  refresh()
  ctx.onDispose(() => {
    observer.disconnect()
    for (const badge of document.querySelectorAll(`[${effortBadge}]`)) badge.removeAttribute(effortBadge)
  })
}

export function registerInterface(ctx, active) {
  watchModelEffortBadges(ctx)
  const root = document.documentElement
  const setScreen = () => {
    const screen = screenFromRoute()
    if (!root.matches(active) || !screen) root.removeAttribute('data-hcv-screen')
    else if (root.dataset.hcvScreen !== screen) root.dataset.hcvScreen = screen
  }
  const observer = new MutationObserver(setScreen)
  observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual'] })
  ctx.addEventListener(window, 'hashchange', setScreen)
  ctx.addEventListener(window, 'popstate', setScreen)
  if (window.navigation) ctx.addEventListener(window.navigation, 'currententrychange', setScreen)
  ctx.onDispose(() => {
    observer.disconnect()
    root.removeAttribute('data-hcv-screen')
  })
  setScreen()

  const pages = `${active}:is([data-hcv-screen="capabilities"],[data-hcv-screen="messaging"],[data-hcv-screen="artifacts"]) ${pageShell}`
  const capabilities = `${active}[data-hcv-screen="capabilities"] ${pageShell}`
  const shown = `${active} ${overlays}`
  const sessions = `${active}[data-hcv-screen="command-center"] ${overlays} main`
  const artifacts = `${active}[data-hcv-screen="artifacts"] ${pageShell}`
  const cron = `${active}[data-hcv-screen="cron"] ${overlays}`
  const pageSearch = 'div:has(> svg.tabler-icon-search + input[placeholder])'
  const messageRows = `${active}[data-hcv-screen="messaging"] ${pageShell} button.row-hover`
  // Once named/saved, a native tab's context-menu wrapper overwrites its
  // data-slot. The tree-tab id and content structure stay the same.
  const tabs = `${active} [data-zone-tabstrip] [role="tab"][data-tree-tab]:has(> .pane-tab-content):not([data-vertical])`
  const mainTabs = tabs.replace('[data-zone-tabstrip]', '[data-zone-tabstrip="grp-main"]')
  const projectRow = `${active} [data-sessions-project]:not([data-sessions-mode]) > :first-child`
  const paneAdd = `${active} [data-zone-tabstrip] button:has(> .codicon-add)`
  const card = `${active} [data-hcv-context-card]`
  const catalogDetail = `${active}[data-hcv-screen="capabilities"] [data-slot="dialog-content"]:has([data-catalog-detail])`
  const nav = `${shown} [data-tour="overlay-nav"]`
  const notice = `${active} ${notification}`
  const noticeDetails = `${notice} details > summary`
  const popupButtons = `${active} :is(
    ${dialog} [data-slot="dialog-close-button"],
    ${dialog} :is([data-slot="dialog-footer"], footer) button[data-slot="button"],
    ${popover} button[data-slot="button"],
    ${notification} button[data-slot="button"]
  )`
  const quietPopupButtons = `${popupButtons}:is([data-variant="ghost"], [data-variant="outline"], [data-variant="secondary"], [data-slot="dialog-close-button"])`
  const switchThumb = codex.switch.height - codex.switch.offset * 2
  const switchTravel = codex.switch.width - codex.switch.height
  const sheet = document.createElement('style')
  sheet.dataset.hcvInterface = ''
  sheet.textContent = `
${active} ${modelCatalog} [${effortBadge}] { display: none; }
${active} ${modelCatalog} :is([data-slot="dropdown-menu-item"][class~="group/label"], [data-slot="dropdown-menu-label"]) {
  text-transform: lowercase;
  letter-spacing: normal;
}
@media (forced-colors: none) {
  ${active} {
    --hcv-unit: ${codex.spacing}px;
    --hcv-ui-font: ${codex.font};
    --hcv-enter: ${codex.enter};
    --hcv-exit: ${codex.exit};
    --hcv-ease: ${codex.hover};
    --hcv-move: ${codex.move};
    --hcv-enter-time: ${codex.enterTime};
    --hcv-exit-time: ${codex.exitTime};
    --hcv-menu-start-scale: ${codex.menuStartScale};
    --hcv-highlight-start-scale: ${codex.highlightStartScale};
    /* Codex Desktop menu/form/action radii. See 0fff881d427a.css and e77f816560c6.css. */
    --hcv-menu-radius: calc(5 * var(--hcv-unit));
    --hcv-dialog-radius: calc(6 * var(--hcv-unit));
    --hcv-popup-button-radius: 10px;
    --hcv-hover-menu: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    --hcv-hairline: color-mix(in srgb, var(--hcv-text) 11%, transparent);
    --hcv-form-surface: color-mix(in srgb, var(--hcv-text) 4%, var(--hcv-chat));
    --hcv-menu-shadow: 0 12px 32px rgba(0,0,0,.15), 0 2px 6px rgba(0,0,0,.09);
  }
  ${active}[data-hermes-mode="dark"] {
    --hcv-hover-menu: color-mix(in srgb, var(--hcv-text) 12%, transparent);
    --hcv-menu-shadow: 0 12px 32px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.19);
  }

  /* Native Radix menus retain focus, arrow keys, radio semantics and placement. */
  ${active} :is(${menus}, ${popover}) {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-menu-radius);
    background-color: var(--hcv-menu);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
    --tw-enter-blur: 0px;
    --tw-exit-blur: 0px;
    animation: none;
  }
  ${active} ${tip} {
    max-inline-size: min(300px, calc(100vw - 24px), var(--radix-tooltip-content-available-width, 300px));
    padding: ${codex.tooltip.padding};
    border: 1px solid color-mix(in srgb, var(--hcv-text) 5%, transparent);
    border-radius: ${codex.tooltip.radius};
    background: var(--hcv-menu);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font: 400 13px/18px var(--hcv-ui-font);
    letter-spacing: -.15px;
    transform-origin: var(--radix-tooltip-content-transform-origin);
    animation: none;
  }
  ${active} ${tip} [data-slot="tooltip-arrow"] { fill: var(--hcv-menu); }
  ${active} :is(${dialog}, ${dialogOverlay}) { animation: none; }
  /* A dialog on a route overlay already has a blurred layer behind it.
     Use Codex's solid scrim here to avoid sampling that layer a second time. */
  ${active}:has(${overlays}) ${dialogOverlay} {
    backdrop-filter: none;
    background-color: light-dark(#0000004d, #00000080);
  }
  ${active}:has(${overlays}) ${dialog} { background-color: var(--hcv-menu); }
  ${active} ${dialog} {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-dialog-radius);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
  }
  ${active} ${dialog} [data-slot="dialog-title"] {
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -.012em;
  }
  ${active} ${dialog} [data-slot="dialog-description"] {
    font-size: 13px;
    line-height: 1.5;
  }
  ${active} ${notificationStack} :is([data-slot="card-stack-surface"], [data-slot="card-stack-edge"]) {
    border-color: var(--hcv-hairline);
    border-radius: var(--hcv-menu-radius);
    background-color: var(--hcv-menu);
    box-shadow: var(--hcv-menu-shadow);
  }
  ${notice} {
    column-gap: 10px;
    font-family: var(--hcv-ui-font);
  }
  ${notice} [data-slot="alert-title"] {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -.01em;
  }
  ${notice} [data-slot="alert-description"] {
    color: var(--hcv-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  ${notice} [data-slot="alert-description"] > p:first-child { line-height: inherit; }
  ${noticeDetails} {
    inline-size: fit-content;
    margin-inline-start: -6px;
    padding: 2px 6px;
    border-radius: 7px;
    cursor: pointer;
  }
  ${notice} details > div { border-radius: var(--hcv-popup-button-radius); }
  ${popupButtons} {
    border-radius: var(--hcv-popup-button-radius);
    font-family: var(--hcv-ui-font);
    transition: none;
  }
  ${active} :is(${dialog}, ${dialogOverlay})[data-state="closed"] { pointer-events: none; }
  ${active} ${menus} { padding: 6px; font-size: 13px; line-height: 20px; }
  ${active} [data-slot="dropdown-menu-content"]:is([data-hcv-sidebar-menu], :has(> [role="menuitem"] > .codicon-folder-opened)) {
    min-inline-size: min(224px, var(--radix-dropdown-menu-content-available-width, 100vw));
  }
  ${active} [data-hcv-sidebar-menu] { translate: var(--hcv-sidebar-menu-shift, 0px) 0; }
  ${active} ${items} {
    position: relative;
    min-block-size: 28px;
    border-radius: var(--hcv-popup-button-radius);
    gap: 8px;
    padding-block: 4px;
    padding-inline-start: 8px;
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    isolation: isolate;
  }
  ${active} ${highlightedItem} {
    background: transparent;
  }
  ${active} ${items}::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--hcv-hover-menu);
    opacity: 0;
    transform: scale(var(--hcv-highlight-start-scale));
    content: '';
    pointer-events: none;
  }
  ${active} ${highlightedItem}::before {
    opacity: 1;
    transform: scale(1);
  }
  ${active} ${items}[data-variant="destructive"]::before {
    background: color-mix(in srgb, var(--destructive) 13%, transparent);
  }
  ${active} :is([data-slot="dropdown-menu-separator"], [data-slot="context-menu-separator"], [data-slot="select-separator"]) {
    margin: 4px 6px;
    background: var(--hcv-hairline);
  }
  ${Object.entries(menuGlyphs).map(([native, name]) => codexIconRules(`${active} ${items} .codicon-${native}`, name)).join('')}
  ${codexIconRules(`${active} ${items} ${checkIcon}`, 'check')}
  ${active} ${commandItems} { border-radius: 8px; }
  ${active} ${commandItems}:is(:focus, [data-selected="true"]):not([data-disabled="true"], [aria-disabled="true"]),
  ${active} ${menuButtons}:focus-visible:not(:disabled, [aria-disabled="true"]) {
    background-color: var(--hcv-hover-menu);
    color: var(--hcv-text);
  }
  ${codexIconRules(`${active} ${commandItems} ${checkIcon}`, 'check')}

  /* Native checkbox and checkbox-mark need different selectors: the mark
     renders a child icon only when selected and is itself decorative. */
  ${active} ${checks} {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 16px;
    border: 1px solid color-mix(in srgb, var(--hcv-text) 28%, transparent);
    border-radius: 4px;
  }
  ${active} ${checks}:is([data-state="checked"], [data-state="indeterminate"], :has(> ${checkIcon})) {
    border-color: transparent;
    background-color: var(--hcv-action);
    color: var(--hcv-ink);
  }
  ${codexIconRules(`${active} ${checks} ${checkIcon}`, 'check')}
  ${active} ${fields} {
    border-radius: 8px;
    min-inline-size: 0;
    font-family: var(--hcv-ui-font);
  }
  ${codexIconRules(`${active} ${selectTriggers} > .codicon-chevron-down`, 'down')}
  ${codexIconRules(`${active} ${selectTriggers} > .codicon-chevron-up`, 'down')}
  ${active} ${selectTriggers} > .codicon-chevron-up { rotate: 180deg; }
  ${active} ${toggle} {
    box-sizing: border-box;
    inline-size: ${codex.switch.width}px;
    min-inline-size: ${codex.switch.width}px;
    block-size: ${codex.switch.height}px;
    padding-inline: ${codex.switch.offset - 1}px;
    justify-content: flex-start;
    border: 1px solid var(--hcv-stroke);
    border-radius: 999px;
    background-color: var(--hcv-selected);
    box-shadow: none;
  }
  ${active} ${toggle}[data-state="checked"] { background-color: var(--hcv-action); border-color: transparent; }
  ${active} ${toggle} > ${thumb} {
    inline-size: ${switchThumb}px;
    block-size: ${switchThumb}px;
    translate: 0 0;
    transform: none;
    background-color: var(--hcv-text);
  }
  ${active} ${toggle}[data-state="checked"] > ${thumb} {
    translate: ${switchTravel}px 0;
    background-color: var(--hcv-ink);
  }
  ${active} ${toggle}[data-state="checked"]:dir(rtl) > ${thumb} { translate: -${switchTravel}px 0; }
  ${active} ${toggle}:is(:disabled, [aria-disabled="true"]) { opacity: .5; }

  /* Compact controls: the hover target includes the whole row, with a
     stable trailing slot so titles don't jump when the actions appear. */
  ${tabs} {
    box-sizing: border-box;
    block-size: 32px;
    min-block-size: 32px;
    max-block-size: 32px;
    align-self: center;
    margin-inline: 2px;
    padding-inline: 4px;
    border: 0;
    border-radius: 8px;
    box-shadow: none;
    background: transparent;
    color: var(--hcv-muted);
  }
  ${tabs}[data-closeable] { --pane-tab-close-width: 22px; padding-inline-end: var(--pane-tab-close-width); }
  ${mainTabs} {
    block-size: 28px;
    min-block-size: 28px;
    max-block-size: 28px;
    padding-inline: 8px;
  }
  ${mainTabs}[data-closeable] { padding-inline-end: calc(var(--pane-tab-close-width) + 4px); }
  ${tabs}[data-closeable]:hover > .pane-tab-content { mask-image: none; }
  ${tabs}[data-active="true"], ${tabs}[data-selected] { color: var(--hcv-text); background: var(--hcv-selected); }
  ${tabs} .pane-tab-content span { text-transform: none; letter-spacing: normal; }
  ${tabs} .pane-tab-content .truncate {
    font: 500 13px/18px var(--hcv-ui-font);
    letter-spacing: 0;
    text-transform: none;
    text-overflow: ellipsis;
    unicode-bidi: plaintext;
  }
  ${tabs} .pane-tab-content > span:first-child { margin-inline: 4px 0; }
  ${codexIconRules(`${tabs} .pane-tab-content .codicon-folder`, 'folder')}
  ${codexIconRules(`${paneAdd} > .codicon-add`, 'plus')}
  ${paneAdd} {
    inline-size: 26px;
    block-size: 26px;
    margin-inline: 2px;
    border-radius: 7px;
  }
  ${active} [data-titlebar-cluster] button[data-size="icon-titlebar"] { border-radius: 8px; }
  ${codexIconRules(`${active} [data-titlebar-cluster] .codicon-settings-gear`, 'settings')}
  ${codexIconRules(`${active} [data-titlebar-cluster] .codicon-comment-discussion`, 'hud')}
  ${codexIconRules(`${active} [data-titlebar-cluster] .codicon-arrow-swap`, 'swap')}
  ${codexIconRules(`${active} [data-titlebar-cluster] .codicon-layout`, 'layout')}
  ${projectRow} {
    min-block-size: ${codex.sidebar.rowHeight}px;
    border-radius: ${codex.sidebar.rowRadius}px;
    padding-inline: 2px 4px;
    color: var(--hcv-text);
    cursor: default;
  }
  ${projectRow}:has([data-state="open"][aria-haspopup="menu"]) { background: var(--hcv-selected); }
  ${projectRow} [data-slot="row-button"] > span { text-decoration: none; }
  ${projectRow} [data-row-actions] button {
    inline-size: 26px;
    block-size: 26px;
    border-radius: 6px;
  }
  ${projectRow} [data-row-actions] button:focus-visible,
  ${projectRow}[data-hcv-preview-open] [data-row-actions] button,
  ${projectRow}:has([data-state="open"][aria-haspopup="menu"]) [data-row-actions] button { opacity: 1; }
  ${projectRow} [data-row-actions] button > .codicon { font-size: 14px !important; }
  ${codexIconRules(`${projectRow} [data-row-actions] .codicon-kebab-vertical`, 'more')}
  ${codexIconRules(`${projectRow} [data-row-actions] .codicon-add`, 'newChat')}
  ${codexIconRules(`${active} [data-tour="sessions-sidebar"] [data-row-actions] .codicon-kebab-vertical`, 'more')}
  ${codexIconRules(`${active} [data-tour="sessions-sidebar"] .codicon-list-filter`, 'filter')}

  /* Shells share spacing but keep their own controls, labels and content. */
  ${pages}, ${shown} {
    font-family: var(--hcv-ui-font);
    --conversation-text-font-size: 14px;
    --conversation-caption-font-size: 12px;
    --conversation-caption-line-height: 18px;
  }
  ${pages} [data-catalog-card], ${pages} [data-tour="artifact-card"] {
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
  }
  ${pages} [data-catalog-card] button:has(> .text-lg) > span { font-size: 15px; line-height: 20px; }
  ${pages} [data-catalog-card] > div { padding-inline: 12px; }
  ${catalogDetail} {
    background: var(--hcv-chat);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
    --conversation-caption-font-size: 13px;
    --conversation-caption-line-height: 20px;
  }
  ${catalogDetail} [data-slot="dialog-title"] {
    font-size: 21px;
    line-height: 28px;
    font-weight: 600;
  }
  ${catalogDetail} button.row-hover {
    border-radius: 8px;
    border: 1px solid var(--hcv-hairline);
  }
  ${artifacts} div:has(> table) {
    border-radius: 12px;
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${artifacts} table th {
    padding: 8px 12px;
    background: var(--hcv-chat);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }
  ${artifacts} table tbody tr:focus-within { background: var(--hcv-hover); }
  ${pages} ${pageTabs} button {
    min-block-size: 30px;
    padding-inline: 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 18px;
  }
  ${pages} ${pageTabs} button:is([aria-current], [aria-selected="true"], [data-active="true"]) {
    color: var(--hcv-text);
    background: var(--hcv-selected);
  }
  ${capabilities} ${pageTabs} button {
    min-block-size: 26px;
    block-size: 26px;
    padding-inline: 8px;
    border-radius: 7px;
  }
  ${capabilities} ${pageTabs} button[data-active] > span { text-decoration-line: none; }
  :is(${pages}, ${shown}) ${pageSearch} {
    min-block-size: 32px;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 8px;
    opacity: 1;
    background-color: var(--hcv-form-surface);
  }
  :is(${pages}, ${shown}) ${pageSearch}:focus-within { border-color: var(--hcv-focus); }
  :is(${pages}, ${shown}) ${pageSearch} > input {
    height: auto;
    min-block-size: 30px;
    font-size: 13px;
    line-height: 18px;
  }
  ${codexIconRules(`:is(${pages}, ${shown}) ${pageSearch} > svg.tabler-icon-search`, 'search')}
  ${messageRows}, ${cron} [data-panel-row] {
    min-block-size: 32px;
    border-radius: 8px;
    font-size: 13px;
  }
  ${messageRows} { padding-inline: 8px 10px; }
  ${cron} header > div > h2 { font-size: 20px; line-height: 26px; letter-spacing: -.01em; }
  ${cron} [data-panel-row] > button:first-child { padding-inline: 8px; }
  ${codexIconRules(`${cron} .codicon-watch`, 'schedule')}
  ${codexIconRules(`${cron} .codicon-kebab-vertical`, 'more')}
  ${codexIconRules(`${cron} .codicon-add`, 'plus')}
  ${shown} {
    padding: clamp(10px, 2.4vw, 32px);
    background-color: rgb(0 0 0 / .24);
    backdrop-filter: blur(2px);
  }
  ${shown} > div > [data-glass-raised] {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-dialog-radius);
    background-color: var(--hcv-chat);
    box-shadow: var(--hcv-menu-shadow);
  }
  ${shown} main {
    padding-block-start: 24px;
    padding-block-end: 12px;
  }
  ${nav} { padding: 12px 8px; background: var(--hcv-sidebar); }
  ${nav} button.row-hover {
    height: auto;
    min-height: 30px;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    gap: 8px;
  }
  ${nav} button.row-hover[aria-current="page"] { background: var(--hcv-selected); color: var(--hcv-text); }
  ${nav} button.row-hover > svg { width: 16px; height: 16px; }
  ${shown} button[data-size="icon-titlebar"] { border-radius: 8px; }
  ${codexIconRules(`${shown} button[data-size="icon-titlebar"] .codicon-close`, 'close')}
  ${codexIconRules(`${nav} button[data-tour="nav-sessions"] > svg`, 'messages')}
  ${codexIconRules(`${nav} button[data-tour="nav-system"] > svg`, 'system')}
  ${codexIconRules(`${nav} button[data-tour="nav-usage"] > svg`, 'usage')}
  ${codexIconRules(`${nav} button[data-tour="nav-maintenance"] > svg`, 'wrench')}

  ${sessions} > header h2 { font-size: 22px; font-weight: 600; line-height: 28px; }
  ${sessions} > header p { margin-block-start: 4px; }
  ${sessions} > header:has(input) > :last-child { flex: 0 1 min(45%, 320px); }
  ${sessions} > header:has(input) > :last-child > div { inline-size: 100%; }
  ${sessions} > div > div > ul > li {
    margin-block: 2px;
    padding: 0 8px 0 0;
    border-radius: 10px;
  }
  ${sessions} > div > div > ul > li > button:first-child {
    min-block-size: 48px;
    padding: 8px 12px;
    border-radius: 10px;
  }
  ${sessions} > div > div > ul > li > button:first-child > div:first-child { font-size: 14px; }
  ${sessions} > div > div > ul > li:focus-within { background: var(--hcv-hover); }

  ${active} :is(${fields}, ${toggle}, [data-slot="checkbox"], [data-hcv-context-card] button, ${dialog} button):focus-visible,
  ${popupButtons}:focus-visible,
  ${noticeDetails}:focus-visible,
  ${shown} :is(button, a, input, textarea, select):focus-visible,
  ${projectRow} :is(button, a):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  :is(${pages}, ${shown}) ${pageSearch} > input:focus-visible { outline: none; }

  /* Codex Desktop bf55123332b3.css: menu item focus is a fill, with
     native outline behavior in forced colors. */
  ${active} :is(${items}, ${commandItems}, ${menuButtons}):focus {
    outline: none;
    box-shadow: none;
  }

  @media (hover: hover) and (pointer: fine) {
    ${capabilities} ${pageTabs} button[data-active="false"]:hover { background-color: var(--hcv-hover); }
    ${active} ${items}:hover:not([data-disabled], [aria-disabled="true"])::before {
      opacity: 1;
      transform: scale(1);
    }
    ${active} ${menuButtons}:hover:not(:disabled, [aria-disabled="true"]) {
      background-color: var(--hcv-hover-menu);
    }
    ${noticeDetails}:hover,
    ${quietPopupButtons}:hover:not(:disabled, [aria-disabled="true"]) {
      background-color: var(--hcv-hover-menu);
      color: var(--hcv-text);
    }
    ${active} ${toggle}[data-state="unchecked"]:not(:disabled, [aria-disabled="true"]):hover {
      background-color: color-mix(in srgb, var(--hcv-selected) 88%, var(--hcv-text));
    }
    ${tabs}:not([data-active="true"], [data-selected]):hover { background-color: var(--hcv-hover); }
    ${projectRow}:hover,
    ${paneAdd}:hover,
    ${nav} button.row-hover:not([aria-current="page"]):hover,
    ${sessions} > div > div > ul > li:hover { background-color: var(--hcv-hover); }
    ${artifacts} table tbody tr:hover { background-color: var(--hcv-hover); }
    ${pages} [data-catalog-card]:hover, ${pages} [data-tour="artifact-card"]:hover {
      border-color: var(--hcv-stroke);
      background: var(--hcv-hover);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${pages}, ${shown} > div > [data-glass-raised] {
      animation: hcv-surface-in var(--hcv-enter-time) var(--hcv-enter);
    }
    ${active} ${dialog}[data-state="open"] { animation: hcv-menu-in var(--hcv-enter-time) var(--hcv-enter) both; }
    ${active} ${dialog}[data-state="closed"] { animation: hcv-menu-out var(--hcv-exit-time) var(--hcv-exit) both; }
    ${active} ${dialogOverlay}[data-state="open"] { animation: hcv-surface-in var(--hcv-enter-time) var(--hcv-enter) both; }
    ${active} ${dialogOverlay}[data-state="closed"] { animation: hcv-surface-out var(--hcv-exit-time) var(--hcv-exit) both; }
    ${active} ${tip}:is([data-state="delayed-open"], [data-state="instant-open"]) {
      animation: hcv-menu-in ${codex.tooltip.duration} var(--hcv-enter) both;
    }
    ${active} ${tip}[data-state="closed"] { animation: hcv-tip-out ${codex.tooltip.duration} var(--hcv-enter) both; }
    ${active} ${toggle} {
      transition: background-color ${codex.switch.trackTime} linear ${codex.switch.trackDelay},
        border-color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active} ${toggle} > ${thumb} {
      transition: translate ${codex.switch.thumbTime} var(--hcv-move),
        background-color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active} ${items}::before {
      transition: opacity var(--hcv-exit-time) var(--hcv-ease),
        transform var(--hcv-enter-time) var(--hcv-enter);
    }
    ${popupButtons}, ${noticeDetails} {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease),
        color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active} ${items}:active:not([data-disabled])::before { transform: scale(var(--hcv-highlight-start-scale)); }
    ${active} :is(${menus}, ${popover}) {
      transform-origin: var(--hcv-sidebar-menu-origin, var(--radix-dropdown-menu-content-transform-origin,
        var(--radix-context-menu-content-transform-origin,
        var(--radix-popover-content-transform-origin,
        var(--radix-select-content-transform-origin, center top)))));
    }
    ${active} :is(${menus}, ${popover})[data-state="open"] {
      animation: hcv-menu-in var(--hcv-enter-time) var(--hcv-enter) both;
    }
    ${active} :is(${menus}, ${popover})[data-state="closed"] {
      animation: hcv-menu-out var(--hcv-exit-time) var(--hcv-exit) both;
      pointer-events: none;
    }
    ${tabs}, ${paneAdd}, ${card} button, ${projectRow}, ${projectRow} button,
    ${messageRows}, ${cron} [data-panel-row], :is(${pages}, ${shown}) ${pageSearch},
    ${nav} button, ${sessions} > div > div > ul > li,
    ${pages} :is([data-catalog-card], [data-tour="artifact-card"], ${pageTabs} button) {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease),
        color var(--hcv-enter-time) var(--hcv-ease),
        border-color var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (max-width: 760px) {
    ${shown} { padding: 16px 8px 8px; }
    ${shown} main { padding-block-start: 8px; }
    ${shown} [data-glass-raised] > div > .grid:has(> [data-tour="overlay-nav"]) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    ${nav} { display: none; }
    ${nav} + div { display: flex; }
    ${sessions} > header:has(input) > :last-child { flex: 1 1 100%; }
    ${sessions} > header:has(input) > :last-child > div { max-inline-size: none; }
  }
  @media (any-hover: none) {
    ${projectRow} [data-row-actions] button { opacity: 1; }
  }
  @keyframes hcv-menu-in {
    from { opacity: 0; transform: scale(var(--hcv-menu-start-scale)); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes hcv-menu-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(var(--hcv-menu-start-scale)); }
  }
  @keyframes hcv-tip-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(${codex.tooltip.exitScale}); }
  }
  @keyframes hcv-surface-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes hcv-surface-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
