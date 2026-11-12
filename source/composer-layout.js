import { codexIconRules, codexMask } from './codex-reference.js'
import { registerComposerApproval } from './composer-approval.js'
import { registerComposerChanges } from './composer-changes.js'

export function registerComposerLayout(ctx, active) {
  const dock = `${active} [data-slot="composer-dock"]:not([data-popped-out], [data-hud-shell] *)`
  const surface = `${dock} [data-slot="composer-surface"]`
  const fallback = `${active} [data-chat-surface]:not([data-hud-shell] *) .composer-fallback-surface`
  const backing = '> .pointer-events-none.absolute.inset-0.-z-10[aria-hidden]'
  const input = '[class~="[grid-area:input]"]'
  const leading = '[class~="[grid-area:menu]"]'
  const trailing = '[class~="[grid-area:controls]"]'
  const grid = `${surface} [data-slot="composer-fade"] > div:has(> ${input} + ${trailing})`
  const regularGrid = `${grid}:not(:has(> [data-hcv-dictation]))`
  const editor = '[data-slot="composer-rich-input"]'
  const controls = `${grid} > :is(${leading}, ${trailing})`
  const reasoning = '[data-testid="reasoning-pill"]'
  const ghost = `${controls} :is(button[aria-haspopup="menu"], button[data-tour="model-pill"], [data-slot="fan-menu-anchor"] > button):not([data-hcv-approval])`
  const rail = `${active} [data-hcv-composer-changes]`
  const chip = `${rail} [data-hcv-composer-changes-chip]`
  const approval = `${active} [data-hcv-approval]`
  const approvalMenu = `${active} [data-hcv-approval-menu]`
  const approvalOption = `${approvalMenu} [role="menuitemradio"]`
  const sheet = document.createElement('style')
  sheet.setAttribute('data-hcv-composer-layout', '')
  sheet.textContent = `
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
        --hcv-composer-hover: var(--hcv-dropdown-hover);
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
      @media (hover: hover) and (pointer: fine) {
        ${dock} [data-slot="status-drawer-toggle"][aria-expanded="false"]:not(:hover, :focus-visible) { opacity: 0; }
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
      /* Codex desktop uses 14px above the editor, two 20px lines,
         and 8px before the controls. The surface already adds 8px above. */
      ${regularGrid} > ${input} { padding-block: 6px 8px; }
      ${regularGrid} > ${input} ${editor} { min-block-size: 40px; }
      ${grid}:has(> [data-hcv-dictation]) > ${input} { min-block-size: 40px; padding-block-start: 8px; }
      ${grid} > ${leading} { align-self: center; align-items: center; translate: none; }
      ${grid} > ${input} ${editor} {
        inline-size: 100%; min-inline-size: 0; padding: 0;
        font-size: 14px; line-height: 20px;
      }
      ${grid} > ${input} ${editor}[data-empty]::before { opacity: .5; }
      ${ghost} { border-radius: 999px; }
      ${ghost}:is(:hover, [data-state="open"]):not(:disabled) {
        background: var(--hcv-composer-hover); color: var(--hcv-text);
      }
      ${controls} > button:has(> .codicon-add) { color: var(--hcv-text); }
      ${codexIconRules(`${controls} > button > .codicon-add`, 'plus')}
      ${controls} > button > .codicon-add { inline-size: 16px; block-size: 16px; }
      ${controls} :is(button[data-tour="model-pill"], ${reasoning}) { font-size: 13px; padding-inline: 8px; }
      ${controls} :is(button[data-tour="model-pill"], [data-slot="fan-menu-anchor"] > button) { color: var(--hcv-text); }
      ${controls} button[data-tour="model-pill"]:has(+ ${reasoning}) { padding-inline-end: 3px; margin-inline-end: -4px; }
      ${controls} ${reasoning} { padding-inline-start: 3px; }
      ${controls} ${reasoning}::after {
        content: ''; inline-size: 12px; block-size: 12px; background: currentColor; opacity: .65;
        mask: ${codexMask('down')} center / contain no-repeat;
      }
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
      ${chip} {
        display: flex; align-items: center; gap: 4px;
        max-inline-size: calc(100% - 16px); padding: 6px 12px;
        border: 1px solid var(--hcv-hairline); border-radius: 14px;
        background: var(--hcv-menu); color: var(--hcv-muted);
        font: 14px/20px var(--hcv-ui-font); white-space: nowrap;
      }
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
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
  registerComposerApproval(ctx, active)
  registerComposerChanges(ctx, active)
}
