import { chatStyles, mountStyle } from './style-scope.js'
import { codexIconRules, codexMask, codexReference as codex } from './codex-reference.js'
import { registerComposerApproval } from './composer-approval.js'
import { registerComposerChanges } from './composer-changes.js'

export function registerComposerLayout(ctx, active) {
  const dock = `${active} [data-slot="composer-dock"]:not([data-popped-out], [data-hud-shell] *)`
  const surface = `${dock} [data-slot="composer-surface"]`
  const fallback = `${active} [data-chat-surface]:not([data-hud-shell] *) .composer-fallback-surface`
  const statusSection = '[data-slot="status-stack-section"]'
  const subagentRoster = '[data-slot="composer-subagents"]'
  const onlySubagents = `[data-slot="status-stack-content"] > ${statusSection}:only-child > ${subagentRoster}`
  const subagentsOnlyDock = `${dock}:has(${onlySubagents}):not(:has(.coding-status-bar))`
  const consentIcon = '[data-slot="status-row"] > .status-row-icon > .codicon-graph'
  const consentSection = `${statusSection}:has(> ${consentIcon})`
  const consent = `${dock} ${consentSection} > [data-slot="status-row"]`
  const consentDrawer = `${dock} > .status-drawer:is(:has([data-slot="status-stack-content"] > ${statusSection}:only-child > ${consentIcon}), :has([data-slot="status-stack-content"] > ${statusSection}:first-child > ${consentIcon}):has([data-slot="status-stack-content"] > ${statusSection}:last-child:nth-child(2) > ${subagentRoster}))`
  const attachedComposer = `${consentDrawer}:not([data-collapsed]) + [data-slot="composer-root"]`
  const draftConsentDock = `${dock}:has(> [data-hcv-draft-bar] + .status-drawer:not([data-collapsed])):is(:has(> .status-drawer [data-slot="status-stack-content"] > ${statusSection}:only-child > ${consentIcon}), :has(> .status-drawer [data-slot="status-stack-content"] > ${statusSection}:first-child > ${consentIcon}):has(> .status-drawer [data-slot="status-stack-content"] > ${statusSection}:last-child:nth-child(2) > ${subagentRoster}))`
  const backing = '> .pointer-events-none.absolute.inset-0.-z-10[aria-hidden]'
  const input = '[class~="[grid-area:input]"]'
  const leading = '[class~="[grid-area:menu]"]'
  const trailing = '[class~="[grid-area:controls]"]'
  const grid = `${surface} [data-slot="composer-fade"] > div:has(> ${input} + ${trailing})`
  const regularGrid = `${grid}:not(:has(> [data-hcv-dictation]))`
  const editor = '[data-slot="composer-rich-input"]'
  const controls = `${grid} > :is(${leading}, ${trailing})`
  const reasoning = '[data-testid="reasoning-pill"]'
  const ghost = `${controls} :is(button[aria-haspopup="menu"], button[data-tour="model-pill"], [data-slot="fan-menu-anchor"] > button):not([data-hcv-approval], [data-tour="model-pill"]:has(> span.truncate), ${reasoning})`
  const rail = `${active} [data-hcv-composer-changes]`
  const chip = `${rail} [data-hcv-composer-changes-chip]`
  const approval = `${active} [data-hcv-approval]`
  const approvalMenu = `${active} [data-hcv-approval-menu]`
  const approvalOption = `${approvalMenu} [role="menuitemradio"]`
  const sheet = document.createElement('style')
  sheet.setAttribute('data-hcv-composer-layout', '')
  sheet.textContent = `
    /* The owner uses the summary for subagents; keep the native data alive. */
    ${dock} [data-slot="status-stack-content"] > ${statusSection}:has(> ${subagentRoster}),
    ${dock} [data-slot="composer-status-stack"]:has(${onlySubagents}),
    ${subagentsOnlyDock} > .status-drawer,
    ${subagentsOnlyDock} [data-slot="status-drawer-toggle"] { display: none; }
    @media (forced-colors: none) {
      ${active} {
        --hcv-composer-light-blur: 80px;
        --hcv-composer-shadow: 0 0 0 1px #0000000a, 0 2px 8px #0000000a, 0 4px var(--hcv-composer-light-blur) 8px #00000006;
      }
      @media (max-width: 760px) { ${active} { --hcv-composer-light-blur: 40px; } }
      ${active}[data-hermes-mode="dark"] { --hcv-composer-shadow: inset 0 0 1px #fff3; }
      ${surface} {
        /* Codex ef088f0f36db.css paints the fill and shadow on one surface.
           Hermes reserves a 1px native border. Move that pixel into the padding. */
        border: 0 !important;
        background-color: var(--composer-fill);
        box-shadow: var(--hcv-composer-shadow);
        --composer-control-size: 28px;
        --composer-control-primary-size: 28px;
        --composer-surface-pad-x: 8px;
        --composer-surface-pad-y: 8px;
        --hcv-composer-hover: var(--hcv-control-hover);
      }
      ${surface} ${backing}, ${fallback} ${backing},
      ${dock} > [data-slot="composer-root"] > .pointer-events-none.absolute.inset-0 {
        display: none;
      }
      ${fallback} {
        border-color: transparent;
        border-radius: 22px;
        background-color: var(--hcv-composer);
        box-shadow: var(--hcv-composer-shadow);
      }
      ${dock} .coding-status-bar { border-block-end-color: transparent; }
      ${dock} .coding-status-bar button:has(> .codicon-kebab-vertical) { display: none; }
      ${dock} .coding-status-bar button:has(> .codicon-git-branch):focus-visible {
        outline: 2px solid var(--hcv-focus); outline-offset: 1px; border-radius: 3px;
      }
      /* The strip is Hermes-specific. Reuse Codex's branch/count typography and
         colors while keeping its native controls and repository data. */
      ${dock} .coding-status-bar button.contents > span[title],
      ${dock} .coding-status-bar [data-slot="coding-status-cwd"] {
        font: 400 12px/1.428571 var(--hcv-ui-font);
      }
      ${dock} .coding-status-bar button.contents > span[title] { color: light-dark(#1a1c1f, #dfdfdf); }
      ${dock} .coding-status-bar [data-slot="coding-status-cwd"] { color: var(--hcv-muted); }
      ${dock} .coding-status-bar [class~="text-(--ui-green)"] { color: light-dark(#00a240, #40c977); }
      ${dock} .coding-status-bar [class~="text-(--ui-red)"] { color: light-dark(#ba2623, #fa423e); }
      /* The painted 28px grip gets 14px of horizontal reach on each side and
         12px above and below it. The editor starts below this small target. */
      ${dock} [data-slot="status-drawer-toggle"] {
        inline-size: 56px; block-size: 24px; inset-block-start: -12px;
        transition: opacity 180ms ${codex.disclosure.ease}, color 180ms ${codex.disclosure.ease};
      }
      ${dock} [data-slot="status-drawer-toggle"] > span {
        position: absolute; inset-block-end: 10.5px; inset-inline-start: 50%;
        translate: -50% 0; pointer-events: none;
      }
      @media (hover: hover) and (pointer: fine) {
        ${dock} [data-slot="status-drawer-toggle"]:not(:hover, :focus-visible) { opacity: 0; }
        ${dock} [data-slot="status-drawer-toggle"]:is(:hover, :focus-visible) { opacity: 1; }
      }
      /* The native drawer stays in layout; matching the fade and slide makes
         the small expansion and its reversal easier to follow. */
      ${dock} .status-drawer,
      ${dock} .status-drawer[data-collapsed] {
        transition: grid-template-rows 280ms ${codex.disclosure.ease};
      }
      ${dock} .status-drawer .status-drawer-content {
        transition: opacity 160ms ${codex.disclosure.ease}, transform 280ms ${codex.disclosure.ease}, visibility 0s;
      }
      ${dock} .status-drawer[data-collapsed] .status-drawer-content {
        transition: opacity 160ms ${codex.disclosure.ease}, transform 280ms ${codex.disclosure.ease}, visibility 0s 280ms;
      }
      @media (prefers-reduced-motion: reduce) {
        ${dock} .status-drawer,
        ${dock} .status-drawer[data-collapsed],
        ${dock} .status-drawer .status-drawer-content,
        ${dock} .status-drawer[data-collapsed] .status-drawer-content,
        ${dock} [data-slot="status-drawer-toggle"] { transition: none; }
      }
      /* The assistant's attached rail in Codex d6fe5799461e.css shares the
         composer's silhouette. Keep the Hermes drawer and its actions native. */
      ${consentDrawer} [data-slot="composer-status-stack"] > div {
        margin-inline: 5px;
        border-radius: 22px 22px 0 0;
        border: 0;
        background: var(--hcv-composer);
        backdrop-filter: none;
      }
      /* A draft toolbar above the native consent card shares its outer edges.
         Round the top toolbar only, so the adjoining card has no protruding corners. */
      ${draftConsentDock} > [data-hcv-draft-bar] {
        margin-inline: 5px;
        border-start-start-radius: 22px;
        border-start-end-radius: 22px;
      }
      ${draftConsentDock} > .status-drawer [data-slot="composer-status-stack"] > div {
        border-start-start-radius: 0;
        border-start-end-radius: 0;
      }
      ${attachedComposer} [data-slot="composer-surface"] {
        border-start-start-radius: 0;
        border-start-end-radius: 0;
        box-shadow: none;
      }
      ${dock} ${consentSection} { container-type: inline-size; }
      ${consent} {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr) auto;
        gap: 6px 8px;
        padding: 10px 12px 6px;
        color: var(--hcv-text);
        font: 13px/18px var(--hcv-ui-font);
      }
      ${consent}:hover { background: transparent; }
      ${consent} > .status-row-icon { grid-column: 1; align-self: start; inline-size: 16px; block-size: 18px; }
      ${consent} > .status-row-content { grid-column: 2; }
      ${consent} > .status-row-content > span {
        overflow: visible;
        white-space: normal;
        overflow-wrap: anywhere;
        font: inherit;
        color: inherit;
      }
      ${consent} > .status-row-content > span > span:first-child { display: block; font-weight: 600; }
      ${consent} > .status-row-content > span > span:nth-child(2) {
        display: block;
        color: var(--hcv-muted);
        font-size: 12px;
        line-height: 17px;
      }
      ${consent} > .status-row-actions { grid-column: 3; align-self: center; flex-wrap: wrap; gap: 4px; }
      ${consent} > .status-row-actions > button {
        min-block-size: 26px;
        margin-block-start: 0;
        padding-inline: 8px;
        border: 1px solid var(--hcv-hairline);
        border-radius: 8px;
        background: transparent;
        color: var(--hcv-text);
        font: 13px/18px var(--hcv-ui-font);
      }
      ${consent} > .status-row-actions > button:last-child { border-color: transparent; color: var(--hcv-muted); }
      ${consent} > .status-row-actions > button:not(:disabled):hover {
        background: var(--hcv-dropdown-hover);
        color: var(--hcv-text);
      }
      @container (width < 640px) {
        ${consent} { grid-template-columns: 16px minmax(0, 1fr); }
        ${consent} > .status-row-actions { grid-area: 2 / 2; }
      }
      ${surface} [data-slot="composer-fade"] { container-type: inline-size; }
      ${regularGrid} {
        grid-template-areas: "input input" "menu controls";
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        column-gap: 4px;
        row-gap: 0;
      }
      ${grid} > ${input} { padding-inline: 4px; align-self: start; }
      /* Keep the measured editor frame. The normal multiline O5pN.U
         editor uses leading 1.35; its 40px frame is a separate constraint. */
      ${regularGrid} > ${input} { padding-block: 6px 8px; }
      ${regularGrid} > ${input} ${editor} { min-block-size: 40px; }
      ${grid}:has(> [data-hcv-dictation]) > ${input} { min-block-size: 40px; padding-block-start: 8px; }
      ${grid} > ${leading} { align-self: center; align-items: center; translate: none; }
      ${grid} > ${input} ${editor} {
        inline-size: 100%; min-inline-size: 0; padding: 0;
        font-size: 14px; line-height: 1.35;
      }
      ${grid} > ${input} ${editor}[data-empty]::before { opacity: .5; }
      ${ghost} { border-radius: 999px; }
      ${ghost}:is(:hover, [data-state="open"]):not(:disabled) {
        background: var(--hcv-composer-hover); color: var(--hcv-text);
      }
      ${controls} > button:has(> .codicon-add) { color: var(--hcv-text); }
      ${codexIconRules(`${controls} > button > .codicon-add`, 'plus')}
      ${controls} > button > .codicon-add { inline-size: 16px; block-size: 16px; }
      ${controls} [data-slot="fan-menu-anchor"] > button { color: var(--hcv-text); }
      ${controls} button[type="submit"] > span[class~="rounded-[0.1875rem]"] {
        inline-size: 16px; block-size: 16px; background: currentColor;
        mask: ${codexMask('dictationStop')} center / contain no-repeat;
      }
      ${active} [data-hcv-approval-anchor] { display: contents; }
      ${active}:has([data-hcv-approval]:not([data-pane-hidden] *)) [data-hcv-approval-source] { display: none; }
      ${approval} {
        display: flex; flex: none; align-items: center; gap: 4px;
        block-size: 28px; padding-inline: 6px;
        border-radius: 999px; color: var(--hcv-muted); font: 13px/18px var(--hcv-ui-font);
        cursor: pointer;
      }
      ${approval}[data-hcv-approval="off"] { color: light-dark(#ab4108, #ff8549); }
      ${approval}:is(:hover, [data-state="open"]):not(:disabled) { background: var(--hcv-composer-hover); }
      ${approval}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
      ${approval} [data-hcv-approval-icon] { inline-size: 16px; block-size: 16px; flex: none; }
      ${approvalMenu} {
        inline-size: min(260px, calc(100vw - 16px));
      }
      /* Codex bqtn.G renders two lines of text and centers the trailing check. */
      ${approvalOption} { align-items: center; }
      ${approvalOption} > span:first-child { gap: 0; }
      ${approvalOption} > span:first-child > span:first-child {
        color: var(--hcv-dropdown-text);
        font: 400 13px/18px var(--hcv-ui-font);
      }
      ${approvalOption} > span:first-child > span:nth-child(2) {
        color: var(--hcv-dropdown-muted);
        font: 400 12px/14px var(--hcv-ui-font);
      }
      @container (width < 400px) {
        ${approval} { justify-content: center; inline-size: 28px; padding-inline: 0; }
        ${approval} [data-hcv-approval-label] { display: none; }
      }
      ${rail} { display: flex; min-inline-size: 0; justify-content: center; margin-block-end: 8px; }
      /* The native expanded status panel occupies the same position. */
      ${dock}:has([data-slot="status-drawer-toggle"][aria-expanded="true"]):has(.coding-status-bar, [data-slot="composer-status-stack"]) > [data-hcv-composer-changes] { display: none; }
      ${subagentsOnlyDock} > [data-hcv-composer-changes] { display: flex; }
      ${chip} {
        display: flex; align-items: center; gap: 4px;
        max-inline-size: calc(100% - 16px); padding: 6px 12px;
        border: 1px solid var(--hcv-hairline); border-radius: 14px;
        background: var(--hcv-menu); color: var(--hcv-muted);
        font: 14px/20px var(--hcv-ui-font); white-space: nowrap;
      }
      ${rail} [data-hcv-composer-changes-warning] {
        align-items: center; padding: 6px 12px; border: 1px solid var(--hcv-hairline);
        border-radius: 14px; background: var(--hcv-menu); color: var(--hcv-muted);
        font: 14px/20px var(--hcv-ui-font);
      }
      ${rail} [data-hcv-composer-changes-warning][hidden], ${chip}[hidden] { display: none; }
      ${chip} { cursor: pointer; flex-wrap: wrap; justify-content: center; }
      ${chip}:focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
      ${chip} :is([data-hcv-composer-changes-label], [data-hcv-composer-changes-coverage]) { white-space: normal; }
      ${chip} [data-hcv-composer-changes-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
      ${chip} [data-hcv-composer-changes-totals] { display: inline-flex; align-items: center; gap: 4px; flex: none; }
      ${chip} [data-hcv-composer-changes-added] { color: light-dark(#00a240, #40c977); }
      ${chip} [data-hcv-composer-changes-removed] { color: light-dark(#ba2623, #fa423e); }
      ${chip} :is([data-hcv-composer-changes-added], [data-hcv-composer-changes-removed], [data-hcv-changes-digits]) {
        display: inline-flex; align-items: center; font-variant-numeric: tabular-nums; letter-spacing: -.025em;
      }
      ${chip} [data-hcv-changes-digit] { display: inline-block; inline-size: 1ch; block-size: 1lh; overflow: hidden; }
      ${chip} [data-hcv-changes-reel] { display: flex; flex-direction: column; block-size: 1lh; contain: layout size style; }
      ${chip} [data-hcv-changes-reel] > span { flex: 0 0 1lh; }
      @media (prefers-reduced-motion: no-preference) {
        ${ghost}, ${approval} { transition: background-color 150ms ease, color 150ms ease; }
        ${rail} { animation: hcv-changes-enter 150ms ease-out backwards; }
        ${chip} [data-hcv-changes-reel] { transition: transform 300ms cubic-bezier(.16, 1, .3, 1); }
        @keyframes hcv-changes-enter { from { opacity: 0; translate: 0 4px; } }
      }
      @media (prefers-reduced-motion: reduce) {
        ${ghost}, ${approval} { transition: none; }
      }
    }
  `
  mountStyle(ctx, sheet, chatStyles)
  // Hermes exposes the branch actions through its native context menu. Once
  // the separate kebab is hidden, offer the same menu from the focused branch.
  const openBranchContext = event => {
    if (event.defaultPrevented || !document.documentElement.matches(active) ||
        !(event.target instanceof Element) || event.ctrlKey || event.altKey || event.metaKey ||
        !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return
    const button = event.target.closest(`${dock} .coding-status-bar button`)
    const row = button?.closest('.coding-status-bar')
    if (!button || button.disabled ||
        !button.matches(':has(> .codicon-git-branch), .contents:has(> span[title])') ||
        !row?.querySelector('button:has(> .codicon-kebab-vertical)')) return
    const bounds = (button.querySelector(':scope > span[title]') || button).getBoundingClientRect()
    event.preventDefault()
    event.stopPropagation()
    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true,
      button: 2, buttons: 2, clientX: bounds.left + Math.min(12, bounds.width / 2), clientY: bounds.bottom }))
  }
  document.addEventListener('keydown', openBranchContext, true)
  ctx.onDispose(() => document.removeEventListener('keydown', openBranchContext, true))
  registerComposerApproval(ctx, active)
  registerComposerChanges(ctx, active)
}
