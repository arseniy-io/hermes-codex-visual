import { THEMES_AREA } from '@hermes/plugin-sdk'
import { registerWorkspaceChrome } from './chrome.js'
import { registerWorkspaceCard } from './workspace-card.js'
import { registerLocalEnvironment } from './local-environment.js'
import { registerTurnExperience } from './turns.js'
import { registerChatDisplay } from './chat-display.js'
import { registerChatResources } from './chat-resources.js'
import { registerChatActivity } from './chat-activity.js'
import { registerChatTables } from './chat-tables.js'
import { registerSubagents } from './subagents.js'
import { registerDraftSetup } from './draft-setup.js'
import { codexMask } from './codex-reference.js'
import { registerInterface } from './interface.js'
import { registerDesktopPages } from './desktop-pages.js'
import { registerDesktopCorners } from './desktop-corners.js'
import { registerSettingsStyle } from './settings.js'
import { registerSettingsProviders } from './settings-providers.js'
import { registerSettingsSpecial } from './settings-special.js'
import { registerAppUpdatesStyle } from './app-updates.js'
import { registerInstallOverlayStyle } from './install-overlay.js'
import { registerRemainingSurfaces } from './remaining-surfaces.js'
import { registerShellSurfaces } from './shell-surfaces.js'
import { registerSessionTabs } from './session-tabs.js'
import { registerContextMeter } from './context-meter.js'
import { registerComposer } from './composer.js'
import { registerDictation } from './dictation.js'

const id = 'hermes-codex-visual'
const marker = `data-${id}`
const themeName = 'codex-workspace'
const active = `:root[${marker}][data-hermes-theme="${themeName}"]`
const sidebar = `${active} [data-slot="sidebar"][data-tour="sessions-sidebar"]`
const chat = `${active} [data-chat-surface]`
const dock = `${chat} [data-slot="composer-dock"]`
const composerSurface = `${dock} [data-slot="composer-surface"]`
const docked = `${dock}:not([data-popped-out])`

const light = {
  rail: '#f2f2f2',
  sidebar: '#f6f6f6',
  chat: '#ffffff',
  panel: '#fafafa',
  summary: '#f5f5f5',
  menu: '#ffffff',
  bubble: '#ededed',
  composer: '#f5f5f5',
  hover: '#eeeeee',
  selected: '#e5e5e5',
  stroke: '#d5d5d5',
  text: '#202020',
  muted: '#5e5e5e',
  focus: '#656565',
  action: '#242424',
  ink: '#ffffff',
  unread: '#0766cb',
  error: '#aa2626',
  errorInk: '#ffffff',
}
const dark = {
  rail: '#121212',
  sidebar: '#161616',
  chat: '#181818',
  panel: '#202020',
  summary: '#222222',
  menu: '#2d2d2d',
  bubble: '#222222',
  composer: '#363636',
  hover: '#252525',
  selected: '#292929',
  stroke: '#393939',
  text: '#e8e8e8',
  muted: '#a9a9a9',
  focus: '#a6a6a6',
  action: '#e8e8e8',
  ink: '#181818',
  unread: '#339cf5',
  error: '#f28080',
  errorInk: '#210909',
}

function themeColors(palette) {
  return {
    background: palette.chat,
    foreground: palette.text,
    card: palette.panel,
    cardForeground: palette.text,
    muted: palette.hover,
    mutedForeground: palette.muted,
    popover: palette.menu,
    popoverForeground: palette.text,
    primary: palette.action,
    primaryForeground: palette.ink,
    secondary: palette.selected,
    secondaryForeground: palette.text,
    accent: palette.selected,
    accentForeground: palette.text,
    border: palette.stroke,
    input: palette.stroke,
    ring: palette.focus,
    midground: palette.focus,
    midgroundForeground: palette.ink,
    composerRing: palette.focus,
    destructive: palette.error,
    destructiveForeground: palette.errorInk,
    sidebarBackground: palette.sidebar,
    sidebarBorder: palette.stroke,
    userBubble: palette.bubble,
    userBubbleBorder: palette.bubble,
  }
}

const theme = {
  name: themeName,
  label: 'Codex',
  description: 'Светлое и тёмное оформление Codex',
  colors: themeColors(light),
  darkColors: themeColors(dark),
}

function paletteVariables({ error, errorInk, ...colors }) {
  return Object.entries(colors)
    .map(([name, color]) => `--hcv-${name}: ${color};`)
    .join('\n    ')
}

const newChatLabel = '[data-tour="sidebar-nav-new-session"]'
const chevron = 'svg.tabler-icon-chevron-down'
const sidebarMenuButton = `${sidebar} [data-sidebar="menu-button"]`
const sidebarNav = `${sidebarMenuButton}:has(> [data-tour^="sidebar-nav-"])`
const navButton = (name) => `${sidebarMenuButton}:has(> [data-tour="sidebar-nav-${name}"])`
const localizedNewChat = `${navButton('new-session')}:is(:lang(ru), :lang(en))`
const titleButton = `${active} [data-titlebar-cluster] button[data-size="icon-titlebar"]`
const foldOnly = `${composerSurface} button:has(> ${chevron}):not(:has(> :not(${chevron})))`
const rowBody = 'button[data-slot="row-button"]'
const projectChatRow = `${sidebar} [data-sessions-mode] .row-hover:has(> ${rowBody} .hover-marquee-inner)`
// These classes are the rendered variants of Hermes's SessionStatusDot.
const runningDot = '[role="status"]:is([class~="bg-(--ui-accent)"], [class~="border-(--ui-accent)"])'
const unreadDot = '[role="status"][class~="bg-(--ui-success)"]'
const trailingDot = `:is(${runningDot}, ${unreadDot})`
const busyRowState = `:is(:has(> ${rowBody} ${runningDot}), [data-working="true"]:has(> .arc-row))`
const unreadRowState = `:has(> ${rowBody} ${unreadDot})`
const activeProjectChatRow = `${projectChatRow}:is(${busyRowState}, ${unreadRowState})`
const sidebarStatus = `${sidebar} [data-hcv-project-status]:not([hidden])`
const sidebarWorking = `${sidebar} [data-hcv-project-status="working"]:not([hidden])`
const workingChatIcon = `${projectChatRow}${busyRowState}::after`
const changedFiles = `${chat} [data-slot="aui_changed-files"]`
const fileSummary = `${changedFiles}[data-hcv-file-card]`
const assistantRoot = `${chat} [data-slot="aui_assistant-message-root"]`
const elapsedBar = `${chat} [data-hcv-turn-line]`
const liveTurn = `${chat} :is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"], [data-hcv-live-turn])`
const thinkingLabel = `${liveTurn} > [data-hcv-thinking]`
const thinkingSweep = `${thinkingLabel} > [data-hcv-thinking-sweep]`
const arrow = codexMask('right')

const glyphs = [
  [navButton('new-session'), '.codicon-robot', 'newChat'],
  [navButton('capabilities'), '.codicon-symbol-misc', 'plugins'],
  [navButton('messaging'), '.codicon-comment', 'messages'],
  [navButton('artifacts'), '.codicon-files', 'artifacts'],
  [navButton('cron'), '.codicon-watch', 'schedule'],
  [titleButton, '.codicon-layout-sidebar-left', 'sidebar'],
  [titleButton, '.codicon-layout-sidebar-right', 'sidebarRight', true],
  [foldOnly, chevron, 'sliders'],
  [`${composerSurface} button`, ':is(.codicon-mic, svg.tabler-icon-microphone)', 'mic'],
  [`${composerSurface} button[type="submit"]`, '.codicon-arrow-up', 'send'],
]

function iconRules() {
  return glyphs
    .map(([button, nativeIcon, icon, flip]) => {
      const selector = `${button}:has(> ${nativeIcon})`
      return `
  ${selector} > ${nativeIcon} { display: none; }
  ${selector}::before {
    content: '';
    display: block;
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: ${codexMask(icon)} center / contain no-repeat;
    ${flip ? 'scale: -1 1;' : ''}
    pointer-events: none;
  }`
    })
    .join('\n')
}

const styles = `
@media (forced-colors: none) {
  ${active} {
    ${paletteVariables(light)}
    --hcv-ui-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --ui-bg-chrome: var(--hcv-rail);
    --ui-bg-sidebar: var(--hcv-sidebar);
    --ui-bg-editor: var(--hcv-chat);
    --ui-bg-elevated: var(--hcv-menu);
    --ui-bg-card: var(--hcv-panel);
    --ui-bg-input: var(--hcv-composer);
    --ui-surface-background: var(--hcv-chat);
    --ui-sidebar-surface-background: var(--hcv-sidebar);
    --ui-chat-surface-background: var(--hcv-chat);
    --ui-widget-surface-background: var(--hcv-panel);
    --ui-chat-bubble-background: var(--hcv-bubble);
    --ui-row-hover-background: var(--hcv-hover);
    --ui-row-active-background: var(--hcv-selected);
    --ui-row-open-background: var(--hcv-hover);
    --ui-control-hover-background: var(--hcv-hover);
    --ui-control-active-background: var(--hcv-selected);
    --ui-text-primary: var(--hcv-text);
    --ui-text-secondary: var(--hcv-muted);
    --ui-text-tertiary: var(--hcv-muted);
    --ui-accent: var(--hcv-focus);
    --ui-accent-secondary: var(--hcv-action);
    --ui-stroke-secondary: var(--hcv-stroke);
    --ui-stroke-tertiary: var(--hcv-stroke);
    --ui-selection-background: color-mix(in srgb, var(--hcv-text) 25%, transparent);
    --dt-background: var(--hcv-rail);
    --dt-card: var(--hcv-panel);
    --dt-popover: var(--hcv-menu);
    --dt-user-bubble: var(--hcv-bubble);
    --sidebar-edge-border: var(--hcv-stroke);
    --chrome-action-hover: var(--hcv-hover);
    --pane-tab-active-bg: var(--hcv-selected);
    --pane-tab-active-accent: transparent;
  }

  ${active}[data-hermes-mode="dark"] {
    ${paletteVariables(dark)}
  }

  ${active} :is(input, textarea)::placeholder {
    color: var(--hcv-muted);
    opacity: 1;
  }

  ${active} :is([data-titlebar-cluster], [data-hcv-sidebar-shell], [data-chat-surface]) {
    font-family: var(--hcv-ui-font);
  }

  ${active} :is([data-sidebar="menu-button"], [data-slot="pane-tab"], [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-sub-trigger"], [data-slot="dropdown-menu-radio-item"], [data-slot="dropdown-menu-checkbox-item"], [data-tour="overlay-nav"] button, [data-titlebar-cluster] [data-size="icon-titlebar"]),
  ${sidebar} .row-hover {
    border-radius: 8px;
  }

  /* Codex NavItem uses the same ghost fill for hover and the selected row. */
  ${sidebarNav} {
    --ui-control-hover-background: var(--hcv-selected);
    border: 0;
    border-radius: 10px;
  }

  @supports (corner-shape: superellipse(1.5)) {
    ${sidebarNav} { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }

  ${sidebarNav}:focus-visible {
    outline: 2px solid light-dark(#339cff, rgb(51 156 255 / 70%));
    outline-offset: -2px;
    box-shadow: none;
  }

  ${active} [data-slot="pane-tab"]:hover {
    background-color: var(--hcv-hover);
  }

  ${active} [data-slot="pane-tab"][data-active="true"] {
    background-color: var(--hcv-selected);
  }

  ${localizedNewChat} > ${newChatLabel} { display: none; }
  ${navButton('new-session')} > [data-slot="kbd-group"] { display: none; }
  ${navButton('new-session')}:lang(ru)::after { content: 'Новый чат'; }
  ${navButton('new-session')}:lang(en)::after { content: 'New chat'; }
  ${localizedNewChat}::after { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }

  ${projectChatRow} > ${rowBody} span[aria-hidden="true"][class~="size-1"][class~="rounded-full"] {
    opacity: 0;
  }
  ${projectChatRow} [data-row-actions] span:has(> time[datetime]) { display: none; }
  ${projectChatRow} [data-row-actions]:has(time[datetime]) > button[aria-haspopup="menu"] { position: static; }
  /* Keep native labels available to assistive technology. Paint the two
     relocated statuses on the right without moving any click targets. */
  ${activeProjectChatRow} { padding-inline-end: 23px; }
  ${activeProjectChatRow} > ${rowBody} ${trailingDot} { opacity: 0; }
  ${projectChatRow}${busyRowState} > .arc-row { display: none; }
  ${activeProjectChatRow}::after {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 7px;
    translate: 0 -50%;
    box-sizing: border-box;
    inline-size: 10px;
    block-size: 10px;
    border-radius: 50%;
    content: '';
    pointer-events: none;
  }
  ${sidebarStatus} {
    display: grid; place-items: center; flex: none;
    inline-size: 20px; block-size: 20px; pointer-events: none;
  }
  ${sidebarWorking}::before { content: ''; }
  ${workingChatIcon}, ${sidebarWorking}::before {
    inline-size: 14px; block-size: 14px;
    background: color-mix(in srgb, var(--hcv-text) 70%, transparent);
    mask: ${codexMask('sidebarWorking')} center / contain no-repeat;
    animation: hcv-sidebar-spin 2s steps(60, end) infinite;
  }
  ${workingChatIcon} { inset-inline-end: 8px; }
  ${sidebar} [data-hcv-project-status="unread"]:not([hidden])::before {
    content: ''; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--hcv-unread);
  }
  ${projectChatRow}${unreadRowState}:not(${busyRowState})::after {
    background: var(--hcv-unread);
    scale: .75;
  }
  @keyframes hcv-sidebar-spin { to { rotate: 1turn; } }
  @media (prefers-reduced-motion: reduce) {
    ${workingChatIcon}, ${sidebarWorking}::before { animation: none; }
  }

  ${chat} {
    /* Codex desktop's 48rem thread body has a 16px inset on each side. */
    --composer-width: 736px;
    --message-text-indent: 0px;
    --conversation-text-font-size: 13px;
    --conversation-tool-font-size: 12px;
    --conversation-line-height: 21px;
    --conversation-turn-gap: 18px;
    --scaffold-block-gap: 9px;
    --paragraph-gap: 10px;
  }

  /* Match the dock's own 16px inset without touching its scroll clearance. */
  ${chat} [data-slot="aui_thread-content"] {
    max-inline-size: calc(var(--composer-width) + 32px);
    padding-inline: 16px;
  }

  ${chat} [data-slot="aui_intro"] .wordmark { mix-blend-mode: normal; }
  ${chat} [data-slot="aui_intro"] .wordmark + p { font-size: 13px; line-height: 20px; }

  ${elapsedBar} {
    inline-size: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    min-block-size: 27px;
    margin-block: 2px 5px;
    padding: 1px 0 4px;
    border-block-end: 1px solid color-mix(in srgb, var(--hcv-muted) 18%, transparent);
    color: var(--hcv-muted);
    font-size: 13px;
    line-height: 1.4;
    text-align: start;
    font-variant-numeric: tabular-nums;
  }
  ${chat} button[data-hcv-turn-line] { cursor: pointer; }
  ${chat} button[data-hcv-turn-line]:hover { color: var(--hcv-text); }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more]):focus-visible {
    outline: 1px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${chat} [data-hcv-turn-folded] [data-hcv-turn-step],
  ${chat} [data-hcv-turn-summary] [data-slot="aui_turn-duration"] { display: none !important; }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])::after {
    content: '';
    inline-size: 12px;
    block-size: 12px;
    flex: none;
    background: currentColor;
    mask: ${arrow} center / contain no-repeat;
    transition: transform 150ms cubic-bezier(.23, 1, .32, 1);
  }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])[aria-expanded="true"]::after {
    transform: rotate(90deg);
  }

  ${liveTurn} {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 18px;
    margin-block-start: 9px;
    color: var(--hcv-muted);
    font-variant-numeric: tabular-nums;
  }
  ${liveTurn} > .dither { display: none; }
  ${thinkingLabel} {
    position: relative;
    display: inline-block;
    flex: none;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
    font-size: var(--conversation-text-font-size);
    line-height: calc(var(--conversation-text-font-size) + 8px);
    color: color-mix(in srgb, var(--hcv-text) 38.5%, transparent);
  }
  ${thinkingSweep} {
    position: absolute; inset: 0 auto 0 0; inline-size: 100%; overflow: hidden; pointer-events: none;
    transform: translateX(-50%);
    mask-image: linear-gradient(90deg, transparent 0%, black 20% 30%, transparent 50% 100%);
  }
  ${thinkingSweep}::before {
    content: attr(data-hcv-thinking-sweep);
    display: block; inline-size: 100%; overflow: hidden;
    color: #ffffffbf;
    transform: translateX(50%);
  }
  /* Codex's first sweep waits 600 ms, then runs for one second every four. */
  @media (prefers-reduced-motion: no-preference) {
    ${thinkingSweep} { animation: hcv-thinking-sweep 4s .6s infinite; }
    ${thinkingSweep}::before { animation: hcv-thinking-highlight 4s .6s infinite; }
  }
  @keyframes hcv-thinking-sweep {
    0% { transform: translateX(-50%); animation-timing-function: steps(48, end); }
    25%, 100% { transform: translateX(125%); }
  }
  @keyframes hcv-thinking-highlight {
    0% { transform: translateX(50%); animation-timing-function: steps(48, end); }
    25%, 100% { transform: translateX(-125%); }
  }
  ${liveTurn} > :is([data-hcv-live-time], [aria-hidden="true"]:not(.dither, [data-hcv-thinking])) {
    color: var(--hcv-muted);
    font-size: 10px;
    line-height: 1.2;
  }
  @media (prefers-reduced-motion: reduce) {
    ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])::after { transition: none; }
  }

  ${changedFiles} {
    border: 1px solid var(--hcv-stroke);
    border-radius: 10px;
    background: color-mix(in srgb, var(--hcv-summary) 45%, var(--hcv-chat));
    margin-block-start: 14px;
    padding: 0;
    font-size: 13px;
  }
  ${changedFiles} > div:first-child {
    min-block-size: 58px;
    flex-wrap: wrap;
    column-gap: 10px;
    border-block-end: 1px solid var(--hcv-stroke);
    border-start-start-radius: 9px;
    border-start-end-radius: 9px;
    background: var(--hcv-summary);
    padding: 10px;
    font-weight: 600;
  }
  ${changedFiles} > div:first-child::before {
    content: '';
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border-radius: 9px;
    background: var(--hcv-chat);
    background-image: ${codexMask('changes', '#5e5e5e')};
    background-size: 18px 18px;
    background-repeat: no-repeat;
    background-position: center;
  }
  ${changedFiles} > div:first-child > button {
    border: 1px solid var(--hcv-stroke);
    border-radius: 8px;
    background: var(--hcv-hover);
    padding: 4px 8px 5px;
    color: var(--hcv-text);
    font-weight: 400;
  }
  ${changedFiles} > div:first-child > button:hover { background: var(--hcv-selected); }
  ${fileSummary} [data-hcv-file-native-title] { display: none; }
  ${fileSummary} [data-hcv-files-heading] { display: grid; flex: 1; min-inline-size: 0; gap: 2px; }
  ${fileSummary} [data-hcv-files-totals] {
    display: flex;
    gap: 3px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
  }
  ${fileSummary} [data-hcv-files-totals]:not(:has(> :not(:empty))) { display: none; }
  ${fileSummary} [data-hcv-files-added] { color: var(--ui-green); }
  ${fileSummary} [data-hcv-files-removed] { color: var(--ui-red); }
  ${fileSummary} [data-hcv-file-review] { font-size: 0; }
  ${fileSummary} [data-hcv-file-review]::after { content: attr(data-hcv-file-review); font-size: 12px; }
  ${fileSummary} > div:first-child > [data-hcv-files-checkpoint] {
    display: flex;
    align-items: center;
    gap: 4px;
    border-color: transparent;
    background: transparent;
    font-size: 12px;
  }
  ${fileSummary} [data-hcv-files-checkpoint]::after {
    content: '';
    inline-size: 13px;
    block-size: 13px;
    background: currentColor;
    mask: ${codexMask('checkpoint')} center / contain no-repeat;
  }
  ${changedFiles} > div:nth-child(2) { margin: 0; padding: 0; }
  ${changedFiles} > div:nth-child(2) > button { min-block-size: 32px; border-radius: 0; padding: 4px 10px; }
  ${fileSummary}[data-hcv-files-foldable]:not([data-hcv-files-open]) > div:nth-child(2) > button:nth-of-type(n + 4) { display: none; }
  ${fileSummary} > div:nth-child(2) { max-block-size: min(60vh, 384px) !important; }
  ${fileSummary} [data-hcv-files-more] {
    display: flex;
    inline-size: 100%;
    min-block-size: 32px;
    align-items: center;
    gap: 6px;
    border-block-start: 1px solid color-mix(in srgb, var(--hcv-stroke) 65%, transparent);
    border-end-start-radius: 9px;
    border-end-end-radius: 9px;
    padding: 4px 10px;
    text-align: start;
    background: var(--hcv-summary);
    cursor: pointer;
  }
  ${fileSummary} [data-hcv-files-more]:hover { background: var(--hcv-hover); }
  ${assistantRoot}:has(> [data-slot="aui_changed-files"]) > :has([data-slot="aui_msg-actions"]) { order: 1; }
  ${assistantRoot}:has(> [data-slot="aui_changed-files"]) [data-slot="aui_msg-actions"] { margin-inline-end: auto; }

  ${chat} [data-slot="aui_user-bubble-actions"] {
    inline-size: fit-content;
    min-inline-size: min(92px, 100%);
    max-inline-size: 70%;
    margin-inline-start: auto;
  }

  ${chat} [data-slot="aui_user-bubble-actions"] .composer-human-message {
    border-color: transparent;
    border-radius: 15px;
    padding-block: 9px;
  }

  ${docked} [data-slot="composer-root"] {
    --composer-fill: var(--hcv-composer);
    border-radius: 22px;
  }

  ${composerSurface} button > ${chevron},
  ${composerSurface} [data-slot="fan-menu-anchor"] > .codicon-chevron-up {
    display: none;
  }

  ${composerSurface} button:has(> ${chevron}) {
    border-radius: 8px;
  }

  ${composerSurface} button:has(> ${chevron}):not(:disabled):hover {
    background-color: var(--hcv-selected);
  }

  ${composerSurface} button[type="submit"] {
    border-radius: 50%;
  }

  ${composerSurface} button[type="submit"]:not(:disabled) {
    background-color: var(--hcv-action);
    color: var(--hcv-ink);
  }

  ${composerSurface} button[type="submit"]:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--hcv-action) 85%, var(--hcv-ink));
  }

  ${iconRules()}
}
`

export default {
  id,
  name: 'Hermes Codex Visual',
  description: 'An independent Codex-style workspace theme for Hermes Desktop.',
  defaultEnabled: false,
  register(ctx) {
    ctx.register({ id: 'theme', area: THEMES_AREA, data: theme })
    const root = document.documentElement
    const sheet = document.createElement('style')
    sheet.setAttribute(marker, '')
    sheet.textContent = styles

    ctx.onDispose(() => {
      sheet.remove()
      if (!document.head.querySelector(`style[${marker}]`)) {
        root.removeAttribute(marker)
      }
    })

    document.head.append(sheet)
    root.setAttribute(marker, '')
    registerWorkspaceChrome(ctx, themeName)
    const roster = registerSubagents(ctx, active)
    const localEnvironment = registerLocalEnvironment(ctx, active)
    registerWorkspaceCard(ctx, themeName, roster, localEnvironment)
    registerTurnExperience(ctx, active)
    registerChatDisplay(ctx, active)
    registerChatResources(ctx, active)
    registerChatActivity(ctx, active)
    registerChatTables(ctx, active)
    registerInterface(ctx, active)
    registerDesktopPages(ctx, active)
    registerDesktopCorners(ctx, active)
    registerSettingsStyle(ctx, active)
    registerSettingsProviders(ctx, active)
    registerSettingsSpecial(ctx, active)
    registerAppUpdatesStyle(ctx, active)
    registerInstallOverlayStyle(ctx, active)
    registerRemainingSurfaces(ctx, active)
    registerShellSurfaces(ctx, active)
    registerSessionTabs(ctx, active)
    registerContextMeter(ctx, active)
    registerComposer(ctx, active)
    registerDraftSetup(ctx, active, localEnvironment)
    registerDictation(ctx, active)
  },
}
