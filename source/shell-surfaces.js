import { codexIconRules, codexReference as codex } from './codex-reference.js'

export function registerShellSurfaces(ctx, active) {
  // Files and Review share this native aside. The class pair also identifies
  // them when their group moves to a different dock or a narrow overlay.
  const panel = `${active} aside[class~="before:pointer-events-none"][class~="pt-(--titlebar-height)"]`
  const overlay = `${active} :is([data-narrow-overlay="files"], [data-narrow-overlay="review"])`
  const panelEntrance = `:is(${panel}:not([data-narrow-overlay] *), ${overlay})`
  const header = `${panel} [class~="group/project-header"]`
  const label = `${panel} span:has(> .dither[aria-hidden="true"])`
  const empty = `${panel} > div:has(> button > .codicon-folder-opened)`
  const openFolder = `${empty} > button`
  const rows = `${panel} :is([data-project-tree] [class~="group/row"], [class~="group/review-row"])`
  const panelActions = `${panel} :is([class~="group/project-header"], [class~="group/review-row"], [data-suppress-pane-reveal-side]) button[data-size="icon-xs"]`
  // ReviewScopeRow renders both controls, with TabDropdown used by the native narrow layout.
  const scopeRow = '[data-suppress-pane-reveal-side]:has(> div > button[aria-pressed]):has(> div > button[aria-haspopup="menu"])'
  const reviewScope = `${panel} > ${scopeRow}`
  const reviewHeader = `${panel}:has(> ${scopeRow}) > [class~="group/project-header"]`
  const reviewPicker = `${reviewScope} > div > button[aria-haspopup="menu"]`
  const reviewFooter = `${panel} > [data-suppress-pane-reveal-side]:has(> div > textarea):has(> div > button > span.underline)`
  const askForPr = `${reviewFooter} > div > button:has(> span.underline)`
  const previewToolbar = `${active} .flex.h-full.flex-col.overflow-hidden.bg-transparent > .flex.h-7.shrink-0.items-center.justify-end.gap-3:has(> button.underline-offset-4, > div > button > :is(svg.tabler-icon-pencil, svg.tabler-icon-x))`
  const previewActions = `:is(${previewToolbar} > button, ${previewToolbar} > div > button)`

  const footer = `${active} [data-slot="statusbar"]`
  const statusActions = `:is(${footer} > div > :is(button, a[href]), ${footer} [data-slot="connection-switcher"] button[aria-haspopup="menu"])`
  const profiles = `${active} [data-slot="profile-rail"]`
  const gateway = `${active} [data-slot="dropdown-menu-content"]:has(> .text-sm > div > div > button > svg.tabler-icon-power)`
  const gatewayTools = `${gateway} > .text-sm > .flex:first-child > div > button`

  // The native layout editor is a draggable card outside the dialog system.
  const layouts = `${active} div[class~="w-[26rem]"][class~="z-50"]:has(> header h2):has(> div > div > section .grid-cols-4)`
  const layoutCards = `${layouts} section :is(.grid > button[aria-pressed], [class~="group/preset"] > button:first-child)`
  const layoutHandles = `${active} [data-tree-group] > .cursor-grab.outline-dashed > span:has(> .codicon-gripper)`
  const sheet = document.createElement('style')
  sheet.dataset.hcvShellSurfaces = ''
  sheet.textContent = `
@media (forced-colors: none) {
  ${panel} {
    background-color: var(--hcv-sidebar);
    border-color: var(--hcv-hairline);
    box-shadow: none;
    font-family: var(--hcv-ui-font);
  }
  ${panel}.border-l { border-start-end-radius: 12px; }
  ${panel}.border-r { border-start-start-radius: 12px; }
  ${overlay}.right-0 { border-start-start-radius: 12px; border-end-start-radius: 12px; }
  ${overlay}.left-0 { border-start-end-radius: 12px; border-end-end-radius: 12px; }
  ${header} { block-size: 32px; gap: 2px; padding-inline: 12px 6px; }
  ${reviewHeader} { padding-inline: 8px; }
  ${reviewScope} { padding: 0 8px 4px; }
  ${reviewScope} > div:has(> button[aria-pressed]) { display: none; }
  ${reviewScope} > div:has(> button[aria-haspopup="menu"]) { display: flex; block-size: auto; padding: 0; }
  ${reviewPicker}, ${askForPr} {
    min-inline-size: 0;
    max-inline-size: 100%;
    block-size: ${codex.quietControl.height};
    border-radius: ${codex.quietControl.radius};
    color: var(--hcv-muted);
    font: 500 12px/16px var(--hcv-ui-font);
  }
  ${reviewPicker} { gap: 6px; padding-inline: 8px; }
  ${reviewPicker} > .codicon { flex: none; }
  ${codexIconRules(`${reviewPicker} > .codicon-chevron-down`, 'down')}
  ${reviewFooter} { padding: 8px; gap: 4px; }
  ${askForPr} { padding-inline: 8px 28px; background-color: transparent; }
  ${askForPr} > span { text-decoration-line: none; }
  ${label} {
    gap: 6px;
    padding-inline-start: 0;
    color: var(--hcv-muted);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    letter-spacing: normal;
    text-transform: none;
  }
  ${label} > .dither { display: none; }
  ${label} > span.leading-none { line-height: inherit; }
  ${empty} { gap: 10px; }
  ${empty} > span:has(> .dither) { font-size: 13px; }
  ${empty} > span > span.truncate { white-space: normal; }
  ${openFolder} {
    block-size: auto;
    min-block-size: 30px;
    max-inline-size: 100%;
    padding: 5px 12px;
    gap: 6px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 999px;
    background: var(--hcv-form-surface);
    color: var(--hcv-text);
    font-size: 12px;
    line-height: 16px;
    white-space: normal;
  }
  ${openFolder} > .codicon-folder-opened { flex: none; inline-size: 16px; block-size: 16px; }
  ${codexIconRules(`${openFolder} > .codicon-folder-opened`, 'folderOpen')}
  ${rows} {
    margin-inline: 6px;
    border-radius: 8px;
    font-size: 12px;
  }
  ${rows}[aria-selected="true"] { background-color: var(--hcv-selected); color: var(--hcv-text); }
  ${panelActions} { border-radius: 7px; }
  ${codexIconRules(`${panel} [data-project-tree] .codicon-folder`, 'folder')}
  ${codexIconRules(`${panel} [data-project-tree] .codicon-folder-opened`, 'folderOpen')}

  ${previewToolbar} {
    block-size: auto;
    min-block-size: 32px;
    flex-wrap: wrap;
    padding: 3px 8px;
    gap: 2px;
    border-color: var(--hcv-hairline);
    font-family: var(--hcv-ui-font);
  }
  ${previewActions} {
    min-block-size: 24px;
    padding: 3px 7px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
  }
  ${previewToolbar} > button.underline {
    background-color: var(--hcv-selected);
    color: var(--hcv-text);
    text-decoration: none;
  }
  ${codexIconRules(`${previewActions} > svg.tabler-icon-pencil`, 'edit')}

  ${footer} {
    block-size: 26px;
    padding: 2px 6px;
    font-family: var(--hcv-ui-font);
  }
  ${statusActions} {
    border-radius: 7px;
    font-size: 11px;
    line-height: 16px;
  }
  ${statusActions}:is([aria-expanded="true"], [aria-pressed="true"], [data-state="open"]) {
    background-color: var(--hcv-selected);
    color: var(--hcv-text);
  }
  ${profiles} { font-family: var(--hcv-ui-font); }
  ${profiles} button { border-radius: 7px; }
  ${gateway} > .text-sm { font-family: var(--hcv-ui-font); }
  ${gateway} > .text-sm > .flex:first-child { padding: 10px 12px; gap: 8px; }
  ${gateway} > .text-sm > .flex:first-child > div:first-child { gap: 4px; font-size: 12px; line-height: 15px; }
  ${gateway} [class~="text-[0.62rem]"] {
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
  }
  ${gatewayTools} { inline-size: 24px; block-size: 24px; border-radius: 7px; }
  ${codexIconRules(`${gatewayTools} > svg.tabler-icon-refresh:not(.animate-spin)`, 'refresh')}
  ${codexIconRules(`${gatewayTools} > svg.tabler-icon-layout-dashboard`, 'system')}

  ${layouts} {
    border-color: var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-menu);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
  }
  ${layouts} > header h2 { font-size: 15px; line-height: 20px; }
  ${layouts} > header button, ${layouts} section button { border-radius: 8px; }
  ${layouts} section > span {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
  }
  ${layoutCards} { border-radius: var(--hcv-popup-button-radius); }
  ${layoutCards} > span { font-size: 11px; line-height: 15px; }
  ${layoutHandles} {
    gap: 6px;
    padding: 4px 10px;
    border-color: var(--hcv-hairline);
    border-radius: 999px;
    background: var(--hcv-menu);
    font: 500 12px/16px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }

  :is(${openFolder}, ${panelActions}, ${previewActions}, ${statusActions}, ${profiles} button, ${gatewayTools}, ${layouts} button, ${reviewPicker}, ${askForPr}):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
}
@media (forced-colors: none) and (hover: hover) {
  :is(${openFolder}, ${panelActions}, ${previewActions}:not(.bg-primary), ${statusActions}, ${gatewayTools}):hover:not(:disabled, [aria-disabled="true"]) {
    background-color: var(--hcv-hover-menu);
  }
  :is(${reviewPicker}, ${askForPr}):is(:hover, [data-state="open"]):not(:disabled) {
    background-color: var(--hcv-hover-menu);
    color: var(--hcv-text);
  }
  ${gatewayTools}:has(> svg.tabler-icon-power):hover { color: var(--destructive); }
  ${rows}:hover:not([aria-selected="true"]) { background-color: var(--hcv-hover); }
}
@media (forced-colors: none) and (prefers-reduced-motion: no-preference) {
  ${panelEntrance} {
    opacity: 1;
    translate: 0 0;
    transition: opacity ${codex.summaryTime} var(--hcv-enter), translate ${codex.summaryTime} var(--hcv-enter);
  }
  :is(${panel}.border-r, ${overlay}.left-0) { --hcv-pane-enter-x: -8px; }
  ${layouts} {
    opacity: 1;
    scale: 1;
    transition: opacity var(--hcv-enter-time) var(--hcv-enter), scale var(--hcv-enter-time) var(--hcv-enter);
  }
  @starting-style {
    ${panelEntrance} { opacity: .2; translate: var(--hcv-pane-enter-x, 8px) 0; }
    ${layouts} { opacity: 0; scale: .98; }
  }
  :is(${openFolder}, ${statusActions}, ${gatewayTools}) {
    transition: background-color var(--hcv-enter-time) var(--hcv-ease), color var(--hcv-enter-time) var(--hcv-ease);
  }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
