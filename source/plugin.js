import { mountCSS, mountStyle, registerStyleScope } from './style-scope.js'
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
import { codexMask, codexReference } from './codex-reference.js'
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
import { sidebarSessionRow } from './sidebar-projects.js'
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
const sidebarNav = `${sidebarMenuButton}[data-hcv-sidebar-nav]`
const sidebarFill = `${sidebarNav} > [data-hcv-sidebar-fill]`
const navButton = (name) => `${sidebarMenuButton}:has(> [data-tour="sidebar-nav-${name}"])`
const localizedNewChat = `${navButton('new-session')}:is(:lang(ru), :lang(en))`
const titleButton = `${active} [data-titlebar-cluster] button[data-size="icon-titlebar"]`
const foldOnly = `${composerSurface} button:has(> ${chevron}):not(:has(> :not(${chevron})))`
const sidebarChatRow = `${sidebar} ${sidebarSessionRow}`
// These classes are the rendered variants of Hermes's SessionStatusDot.
const runningDot = '[role="status"]:is([class~="bg-(--ui-accent)"], [class~="border-(--ui-accent)"])'
const unreadDot = '[role="status"][class~="bg-(--ui-success)"]'
const trailingDot = `:is(${runningDot}, ${unreadDot})`
const busyRowState = `:has(${runningDot})`
const unreadRowState = `:has(${unreadDot})`
const activeSidebarChatRow = `${sidebarChatRow}:is(${busyRowState}, ${unreadRowState})`
const sidebarStatus = `${sidebar} [data-hcv-project-status]:not([hidden])`
const sidebarWorking = `${sidebar} [data-hcv-project-status="working"]:not([hidden])`
const workingChatIcon = `${sidebarChatRow}${busyRowState}::after`
const changedFiles = `${chat} [data-slot="aui_changed-files"]`
const fileSummary = `${changedFiles}[data-hcv-file-card]`
const fileHeader = `${fileSummary} > div:first-child`
const fileList = `${fileSummary} > div:nth-child(2)`
const fileRow = `${fileList} > button`
const assistantRoot = `${chat} [data-slot="aui_assistant-message-root"]`
const elapsedBar = `${chat} [data-hcv-turn-line]`
const liveTurn = `${chat} :is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"], [data-hcv-live-turn])`
const thinkingLabel = `${liveTurn} > [data-hcv-thinking]`
const thinkingSweep = `${thinkingLabel} > [data-hcv-thinking-sweep]`
const arrow = codexMask('turnDisclosure')

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
    --hcv-sidebar-highlight: var(--hcv-selected);
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

  /* The fixed ghost fill fades independently of the text and icon. */
  ${sidebarNav}, ${sidebarNav}:is(:hover, :active, :focus-visible, [data-active="true"]) {
    position: relative;
    isolation: isolate;
    background-color: transparent;
    border: 0;
    border-radius: 10px;
    transition: none;
  }

  @supports (corner-shape: superellipse(1.5)) {
    ${sidebarNav}, ${sidebarNav}:is(:hover, :active, :focus-visible, [data-active="true"]) {
      border-radius: 12.5px;
      corner-shape: superellipse(1.5);
    }
  }

  ${sidebarFill} {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    border-radius: inherit;
    corner-shape: inherit;
    background-color: var(--hcv-sidebar-highlight);
    opacity: 0;
    transition: none;
  }

  ${sidebarNav}:is(:focus-visible, :active, [data-active="true"]) > [data-hcv-sidebar-fill] { opacity: 1; }
  @media (hover: hover) {
    ${sidebarNav}:hover > [data-hcv-sidebar-fill] { opacity: 1; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${sidebarFill} { transition: opacity 150ms cubic-bezier(.4, 0, .2, 1); }
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

  ${sidebarChatRow} span[aria-hidden="true"][class~="size-1"][class~="rounded-full"] {
    opacity: 0;
  }
  ${sidebarChatRow} [data-row-actions] span:has(> time[datetime]) { display: none; }
  ${sidebarChatRow} [data-row-actions]:has(time[datetime]) > button[aria-haspopup="menu"] { position: static; }
  /* Keep native labels available to assistive technology. Paint the two
     relocated statuses on the right without moving any click targets. */
  ${activeSidebarChatRow} { padding-inline-end: 23px; }
  ${activeSidebarChatRow} ${trailingDot} { opacity: 0; }
  ${sidebarChatRow} > .arc-row { display: none; }
  ${activeSidebarChatRow}::after {
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
    inline-size: 16px; block-size: 16px;
    background: color-mix(in srgb, var(--hcv-text) 70%, transparent);
    mask: ${codexMask('sidebarWorking')} center / contain no-repeat;
    animation: hcv-sidebar-spin 2s steps(60, end) infinite;
  }
  ${workingChatIcon} { inset-inline-end: 8px; }
  ${sidebar} [data-hcv-project-status="unread"]:not([hidden])::before {
    content: ''; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--hcv-unread);
  }
  ${sidebarChatRow}${unreadRowState}:not(${busyRowState})::after {
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
    /* Hermes's default text scale is 110%. Keep its scale control relative
       to the reference Desktop size of 14px. */
    --conversation-text-base-size: calc(14px / 1.1);
    --hcv-chat-prose: light-dark(#1a1c1f, #dfdfdf);
    max-inline-size: calc(var(--composer-width) + 32px);
    padding-inline: 16px;
  }
  ${assistantRoot} .aui-md.prose, ${chat} [data-slot="aui_user-inline-text"] {
    color: var(--hcv-chat-prose, var(--hcv-text));
    font-weight: 430;
  }
  ${assistantRoot} .aui-md.prose { --tw-prose-bold: var(--hcv-chat-prose, var(--hcv-text)); }

  ${chat} [data-slot="aui_intro"] .wordmark { mix-blend-mode: normal; }
  ${chat} [data-slot="aui_intro"] .wordmark + p {
    font-size: 13px;
    line-height: 20px;
    /* Keep the wordmark anchored while Hermes rotates one- and two-line copy. */
    min-block-size: 2lh;
  }

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
    registerStyleScope(ctx, themeName)
    const sheet = document.createElement('style')
    sheet.setAttribute(marker, '')
    sheet.textContent = styles

    ctx.onDispose(() => {
      sheet.remove()
      if (!document.head.querySelector(`style[${marker}]`)) {
        root.removeAttribute(marker)
      }
    })

    mountStyle(ctx, sheet)
    mountCSS(ctx, 'data-hcv-turn-styles', `
@media (forced-colors: none) {
  ${elapsedBar} {
    align-self: flex-start;
    max-inline-size: 100%;
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: light-dark(rgb(26 28 31 / .495), rgb(255 255 255 / .498));
    font: 430 var(--conversation-text-font-size)/1.5 ${codexReference.font};
    text-align: start;
  }
  ${chat} [data-slot="aui_response-group"][data-hcv-turn-summary] {
    /* Codex mRLe inserts a 16px conversation spacer after the disclosure. */
    row-gap: 16px;
  }
  ${chat} [data-hcv-turn-folded] [data-slot="aui_assistant-message-content"]
    > .aui-md:nth-child(1 of :is([data-slot="tool-block"], [data-slot="aui_thinking-disclosure"], [data-slot="aui_turn-activity"], .aui-md):not([data-hcv-turn-step])) {
    margin-block-start: 0;
  }
  ${chat} button[data-hcv-turn-line] { cursor: pointer; }
  ${chat} button[data-hcv-turn-line]:hover { color: var(--hcv-chat-prose, var(--hcv-text)); }
  ${chat} button[data-hcv-turn-line]:focus-visible {
    outline: 1px solid var(--hcv-focus);
    outline-offset: 2px;
  }
  ${chat} [data-hcv-turn-folded] [data-hcv-turn-step],
  ${chat} [data-hcv-turn-summary] [data-slot="aui_turn-duration"] { display: none !important; }
  ${chat} button[data-hcv-turn-line]::after {
    content: '';
    inline-size: 14px;
    block-size: 14px;
    flex: none;
    background: currentColor;
    mask: ${arrow} center / contain no-repeat;
  }
  @media (prefers-reduced-motion: no-preference) {
    ${chat} button[data-hcv-turn-line]::after { transition: transform 150ms ease; }
  }
  ${chat} button[data-hcv-turn-line][aria-expanded="true"]::after {
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
    ${chat} button[data-hcv-turn-line]::after { transition: none; }
  }

  /* Codex Desktop 26.1111.2228.0, completed TurnDiffContent (ev)
     and the resource card header (fLcv). */
  ${fileSummary} {
    --hcv-file-padding: 12px;
    --hcv-file-radius: 10px;
    --hcv-file-stroke: light-dark(rgb(26 28 31 / 11.7%), rgb(255 255 255 / 15.6%));
    --hcv-file-border: light-dark(rgb(26 28 31 / 7.8%), rgb(255 255 255 / 8.4%));
    --hcv-file-hover: light-dark(rgb(26 28 31 / 5.35%), rgb(255 255 255 / 7.8%));
    --hcv-file-text: light-dark(#1a1c1f, #dfdfdf);
    --hcv-file-description: color-mix(in srgb, var(--hcv-file-text) 70%, transparent);
    --hcv-file-focus: #0285ff;
    border: 0;
    border-radius: var(--hcv-file-radius);
    box-shadow: 0 0 0 .5px var(--hcv-file-stroke);
    background: light-dark(#fff, #222222);
    margin: 14px .5px 8px;
    padding: 0;
    color: var(--hcv-file-text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    font-weight: 430;
    line-height: 1.5;
  }
  ${fileHeader} {
    position: relative;
    min-inline-size: 0;
    display: flex;
    align-items: center;
    column-gap: 10px;
    padding: 12px var(--hcv-file-padding);
  }
  ${fileHeader}::before,
  ${fileHeader}::after {
    content: '';
    pointer-events: none;
  }
  ${fileHeader}::before {
    flex: none;
    position: relative;
    z-index: 1;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--hcv-file-radius);
    background: light-dark(#f7f7f7, #151515);
  }
  ${fileHeader}::after {
    position: absolute;
    z-index: 1;
    inset-inline-start: calc(var(--hcv-file-padding) + 8px);
    inset-block-start: calc(50% - 12px);
    inline-size: 24px;
    block-size: 24px;
    background: color-mix(in srgb, var(--hcv-file-text) 65%, transparent);
    mask: ${codexMask('turnDiff')} center / contain no-repeat;
  }
  ${fileSummary} button {
    cursor: pointer;
  }
  ${fileSummary} button:focus-visible {
    box-shadow: inset 0 0 0 2px var(--hcv-file-focus);
    outline: none;
  }
  ${fileHeader} > [data-hcv-files-open] {
    position: absolute;
    inset: 0;
    border-radius: var(--hcv-file-radius);
    background: transparent;
  }
  ${fileHeader}:hover > [data-hcv-files-open] {
    background: color-mix(in oklab, var(--hcv-file-hover) 30%, transparent);
  }
  ${fileSummary} [data-hcv-file-native-title] { display: none; }
  ${fileSummary} [data-hcv-files-heading] {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-inline-size: 0;
    pointer-events: none;
  }
  ${fileSummary} :is([data-hcv-files-title], [data-hcv-files-subtitle], [data-hcv-files-more-label], [data-hcv-file-directory], [data-hcv-file-basename]) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  ${fileSummary} [data-hcv-files-title] { font-weight: 500; }
  ${fileSummary} [data-hcv-files-subtitle] {
    color: var(--hcv-file-description);
    font-size: 13px;
  }
  ${fileSummary} [data-hcv-files-hover] {
    display: none;
    align-items: center;
    gap: 4px;
  }
  ${fileHeader}:is(:hover, :focus-within) [data-hcv-files-hover] { display: inline-flex; }
  ${fileHeader}:is(:hover, :focus-within) [data-hcv-files-totals] { display: none; }
  ${fileSummary} [data-hcv-files-totals] {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    line-height: 1;
    letter-spacing: -.025em;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "cv01" on, "cv02" on;
  }
  ${fileSummary} [data-hcv-files-added] { color: light-dark(#00a240, #40c977); }
  ${fileSummary} [data-hcv-files-removed] { color: light-dark(#ba2623, #fa423e); }
  ${fileHeader} > :is([data-hcv-file-review], [data-hcv-files-checkpoint]) {
    position: relative;
    z-index: 1;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    block-size: 28px;
    border-radius: var(--hcv-file-radius);
    padding-inline: 8px;
    color: inherit;
    font-size: 13px;
    font-weight: 430;
    line-height: 18px;
    white-space: nowrap;
  }
  ${fileHeader} > [data-hcv-file-review] {
    gap: 0;
    border: 1px solid var(--hcv-file-border);
    background: light-dark(#fff, #292929);
    font-size: 0;
  }
  ${fileHeader} > [data-hcv-files-checkpoint] + [data-hcv-file-review] { margin-inline-start: -2px; }
  ${fileHeader} > [data-hcv-file-review]::after { content: attr(data-hcv-file-review); font-size: 13px; }
  ${fileHeader} > :is([data-hcv-file-review], [data-hcv-files-checkpoint]):hover {
    background-color: var(--hcv-file-hover);
  }
  ${fileHeader} > :is([data-hcv-file-review], [data-hcv-files-checkpoint]):focus-visible {
    box-shadow: 0 0 0 2px var(--hcv-file-focus);
  }
  ${fileHeader} > [data-hcv-files-checkpoint]:not(:hover) { background: transparent; }
  ${fileSummary} :is([data-hcv-files-checkpoint], [data-hcv-files-hover], [data-hcv-files-more])::after {
    content: '';
    flex: none;
    inline-size: 14px;
    block-size: 14px;
    background: currentColor;
    mask: var(--hcv-file-icon) center / contain no-repeat;
  }
  ${fileSummary} [data-hcv-files-checkpoint] { --hcv-file-icon: ${codexMask('turnDiffUndo')}; }
  ${fileSummary} [data-hcv-files-hover] { --hcv-file-icon: ${codexMask('turnDiffOpen')}; }
  ${fileSummary} [data-hcv-files-more] { --hcv-file-icon: ${codexMask('turnDiffDown')}; }
  ${fileSummary} [data-hcv-files-more][aria-expanded="true"]::after { transform: rotate(180deg); }
  ${fileList} {
    max-height: none !important;
    overflow: visible;
    mask: none;
    animation: none;
    margin: 0;
    padding: 0;
    border-block-start: 1px solid var(--hcv-file-border);
  }
  ${fileSummary}[data-hcv-file-single] > div:nth-child(2),
  ${fileSummary}[data-hcv-files-foldable]:not([data-hcv-files-open]) > div:nth-child(2) > button:nth-of-type(n + 4) {
    display: none;
  }
  ${fileRow} > :not([data-hcv-generated]) { display: none; }
  ${fileSummary} [data-hcv-file-accessible-path] {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  ${fileSummary} [data-hcv-file-path] {
    display: flex;
    align-items: center;
    flex: 1;
    min-inline-size: 0;
  }
  ${fileSummary} [data-hcv-file-directory] { min-inline-size: 0; color: var(--hcv-file-description); }
  ${fileSummary} [data-hcv-file-basename] { max-inline-size: 100%; flex-shrink: 0; }
  ${fileRow},
  ${fileSummary} [data-hcv-files-more] {
    display: flex;
    inline-size: 100%;
    block-size: 36px;
    flex: none;
    align-items: center;
    gap: 8px;
    border-radius: 0;
    padding: 4px var(--hcv-file-padding);
    color: inherit;
    text-align: start;
  }
  ${fileRow} { background: light-dark(#fff, #1c1c1c); }
  ${fileRow}:hover { background: color-mix(in oklab, var(--hcv-file-hover) 60%, transparent); }
  ${fileSummary}:not([data-hcv-files-foldable]) > div:nth-child(2) > button:last-of-type,
  ${fileSummary} [data-hcv-files-more] {
    border-end-start-radius: var(--hcv-file-radius);
    border-end-end-radius: var(--hcv-file-radius);
  }
  ${fileSummary} [data-hcv-files-more]:hover {
    background: color-mix(in oklab, var(--hcv-file-hover) 30%, transparent);
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${fileSummary} { --hcv-file-radius: 12.5px; }
    ${fileSummary},
    ${fileHeader}::before,
    ${fileSummary} button { corner-shape: superellipse(1.5); }
  }
  ${assistantRoot}:has(> [data-hcv-file-card]) > :has([data-slot="aui_msg-actions"]) { order: 1; }
  ${assistantRoot}:has(> [data-hcv-file-card]) [data-slot="aui_msg-actions"] { margin-inline-end: auto; }

}
`, { surface: '[data-hcv-turn-line], [data-slot="aui_turn-duration"], [data-slot="aui_response-loading"], [data-slot="aui_turn-activity"], [data-slot="aui_changed-files"]', retainAcrossChatTabs: true })
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
    // Local installations record activation through the plugin's own data folder.
    if (typeof HCV_LOCAL_VERSION !== 'undefined' && HCV_LOCAL_VERSION && ctx.files) {
      void ctx.files.writeText(ctx.files.dataFolder, 'loaded-version.json', JSON.stringify({
        version: HCV_LOCAL_VERSION,
        theme: root.dataset.hermesTheme,
        loadedAt: new Date().toISOString(),
      }) + '\n')
    }
  },
}
