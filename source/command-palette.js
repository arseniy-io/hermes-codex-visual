import { codexIconRules } from './codex-reference.js'

export const commandRoot = '[data-slot="command"]'

// Hermes' palette is a Radix dialog with a direct cmdk root. The session
// switcher and inline command pickers use different containers.
const paletteDialog = '[role="dialog"][data-state]:not([data-slot])'
const paletteRoot = `${commandRoot}[cmdk-root]`
const icons = {
  plus: 'newChat',
  'app-window': 'activityBrowser',
  settings: 'settings',
  tool: 'skills',
  'message-circle': 'chatTab',
  package: 'artifacts',
  clock: 'schedule',
  users: 'team',
  cpu: 'system',
  'chart-dots-3': 'graph',
  folder: 'folder',
  'chevron-right': 'right',
  check: 'check',
}

export function commandPaletteStyles(active) {
  const dialog = `${active} ${paletteDialog}:has(> ${paletteRoot})`
  const root = `${active} ${paletteDialog} > ${paletteRoot}`
  const search = `${root} > [data-slot="command-input-wrapper"]`
  const list = `${root} > [data-slot="command-list"]`
  const item = `${list} [data-slot="command-item"]`
  const enabled = `${item}:not([aria-disabled="true"], [data-disabled="true"])`
  const heading = `${list} [cmdk-group-heading]`

  return `
  /* Codex global search (757723.3067c948bc.js, 20dca5934f5d.css).
     Keep the surface opaque so moving the highlight never samples the chat. */
  ${dialog} {
    --hcv-palette-top: max(calc(var(--titlebar-height, 34px) + 6px), calc((100dvh - 504px) / 2));
    inset-block-start: var(--hcv-palette-top);
    display: flex;
    inline-size: min(768px, 92vw);
    max-block-size: calc(100dvh - var(--hcv-palette-top) - 16px);
    border: 1px solid var(--hcv-dropdown-outline);
    border-radius: 16px;
    background: var(--hcv-dropdown-background);
    box-shadow: 0 16px 32px -8px #00000030;
    color: var(--hcv-dropdown-text);
    outline: none;
    transform-origin: top center;
    animation: none;
  }
  ${dialog}[data-state="closed"] { pointer-events: none; }
  ${root} {
    min-block-size: 0;
    block-size: auto;
    padding: 4px;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: 430 14px/20px var(--hcv-ui-font);
  }
  ${search} {
    flex: none;
    block-size: 44px;
    padding-inline: 10px;
    border-block-end: 1px solid var(--hcv-dropdown-outline);
    color: var(--hcv-muted);
  }
  ${search} > input {
    min-inline-size: 0;
    block-size: 100%;
    padding: 0;
    color: var(--hcv-dropdown-text);
    font: inherit;
  }
  ${search} > input::placeholder { color: var(--hcv-muted); opacity: 1; }
  ${search} > svg {
    inline-size: 16px;
    block-size: 16px;
    color: inherit;
  }
  ${codexIconRules(`${search} > svg.tabler-icon-search`, 'search')}
  ${root} > button:first-of-type {
    flex: none;
    border-radius: 8px;
    border-color: var(--hcv-dropdown-outline);
    transition: none;
  }
  ${list} {
    min-block-size: 0;
    max-block-size: min(440px, calc(90dvh - 64px));
    contain: layout paint;
    overscroll-behavior: contain;
    scrollbar-width: none;
    scroll-padding-block: 4px;
  }
  ${list} [data-slot="command-group"] { padding: 4px 0 0; }
  ${heading} {
    padding: 4px 10px 2px;
    color: var(--hcv-muted);
    font: 500 12px/18px var(--hcv-ui-font);
    text-transform: none;
    letter-spacing: normal;
  }
  ${item} {
    content-visibility: auto;
    contain-intrinsic-block-size: auto 36px;
    gap: 8px;
    min-block-size: 36px;
    padding: 8px 10px;
    border-radius: 10px;
    color: inherit;
    font: inherit;
    transition: none;
  }
  ${enabled} { cursor: pointer; opacity: .75; }
  ${enabled}:is([data-selected="true"], :focus-visible, :active) {
    background-color: var(--hcv-dropdown-hover);
    color: inherit;
    opacity: 1;
  }
  @media (hover: hover) and (pointer: fine) {
    ${enabled}:hover { opacity: 1; }
    ${enabled}:hover:not([data-selected="true"], :active, :focus-visible) {
      background-color: color-mix(in srgb, var(--hcv-dropdown-hover) 25%, transparent);
    }
  }
  ${item} > :is([data-slot="kbd-group"], [data-slot="command-shortcut"], kbd) { display: none; }
  ${item} > svg {
    inline-size: 16px;
    block-size: 16px;
    flex: none;
  }
  ${item} > svg:is(.tabler-icon-chevron-right, .tabler-icon-check):not(:first-child) { margin-inline-start: auto; }
  ${Object.entries(icons).map(([native, glyph]) => codexIconRules(`${item} > svg.tabler-icon-${native}`, glyph)).join('')}
  @supports (corner-shape: superellipse(1.5)) {
    ${dialog} { border-radius: 20px; corner-shape: superellipse(1.5); }
    ${item} { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${dialog}[data-state="open"] { animation: hcv-palette-in 150ms var(--hcv-enter) both; }
    ${dialog}[data-state="closed"] { animation: hcv-palette-out 150ms var(--hcv-enter) both; }
  }
  @keyframes hcv-palette-in {
    from { opacity: 0; scale: .98; }
    to { opacity: 1; scale: 1; }
  }
  @keyframes hcv-palette-out {
    from { opacity: 1; scale: 1; }
    to { opacity: 0; scale: .98; }
  }
  `
}
