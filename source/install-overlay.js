import { codexMask } from './codex-reference.js'

const progressGlyphs = { pending: 'circle', done: 'circleCheck', failed: 'circleX', disclosure: 'right' }

export function registerInstallOverlayStyle(ctx, active) {
  // Only the progress/failure panel has a scrollable middle and a 90vh cap.
  const panel = `${active} div.fixed.inset-0[class~="z-(--z-setup)"] > .flex.flex-col[class~="max-h-[90vh]"]:has(> .overflow-y-auto)`
  const header = `${panel} > div:first-child`
  const body = `${panel} > .overflow-y-auto`
  const progress = `${body} [data-slot="progress"]`
  const row = `${body} > ol > li`
  const rowLabel = `${row} > div.min-w-0 > div:first-child`
  const icon = `${rowLabel} > span:nth-child(2)`
  const spinner = `${row} > div:first-child > [role="status"]`
  const error = `${body} > div:has(> .codicon-error)`
  const disclosure = `${body} > div:last-child > button`
  const log = `${body} > div:last-child > [data-selectable-text]`
  const footer = `${panel} > div:nth-child(3)`

  const sheet = document.createElement('style')
  sheet.dataset.hcvInstallOverlay = ''
  sheet.textContent = `
@media (forced-colors: none) {
  ${panel} {
    --hcv-install-info: light-dark(#0169cc, #66b5ff);
    max-inline-size: 560px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-menu);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
    overflow: hidden;
  }
  ${header} { gap: 12px; padding: 20px 20px 12px; }
  ${header} > span:first-child { inline-size: 36px; block-size: 36px; }
  ${header} h2 { font-size: 16px; line-height: 22px; font-weight: 600; letter-spacing: normal; }
  ${header} p { margin-block-start: 4px; font-size: 13px; line-height: 18px; color: var(--hcv-muted); }
  ${body} { padding: 0 20px 12px; }
  ${body} > div:has(> [data-slot="progress"]) { margin-block-end: 12px; }
  ${progress} { block-size: 8px; border-radius: 9999px; background: color-mix(in srgb, var(--hcv-text) 10%, transparent); }
  ${progress} > div { background: var(--hcv-install-info); transition: none; }
  ${progress} > .bg-destructive { background: var(--destructive); }
  ${body} > ol {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
  }
  ${row} { gap: 8px; margin: 0; padding: 0; min-block-size: 18px; }
  ${rowLabel} { gap: 8px; }
  ${rowLabel} > span:first-child { font-size: 13px; line-height: 18px; font-weight: 400; }
  ${row}:has(> div:first-child > [role="status"]) > div:first-child { margin: 0; inline-size: 16px; block-size: 16px; }
  ${row}:has(> div:first-child > [role="status"]) > div.min-w-0 > div:first-child > span:first-child { color: var(--hcv-install-info); }
  ${rowLabel}:has(> span > .codicon-check) > span:first-child { color: var(--hcv-install-info); }
  ${rowLabel}:has(> span > .codicon-error) > span:first-child { color: var(--destructive); }
  ${icon}, ${spinner} {
    order: -1;
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    color: var(--hcv-muted);
    mask: ${codexMask(progressGlyphs.pending)} center / contain no-repeat;
  }
  ${icon}:has(> .codicon-check) { color: var(--hcv-install-info); mask-image: ${codexMask(progressGlyphs.done)}; }
  ${icon}:has(> .codicon-error) { color: var(--destructive); mask-image: ${codexMask(progressGlyphs.failed)}; }
  ${icon} > *, ${spinner} > svg, ${disclosure} > svg > * { visibility: hidden; }
  ${spinner} {
    inline-size: 14px;
    block-size: 14px;
    color: var(--hcv-install-info);
    mask-image: ${codexMask('sidebarWorking')};
    animation: hcv-install-spin 2s steps(60, end) infinite;
  }
  @keyframes hcv-install-spin { to { rotate: 1turn; } }
  ${error} {
    margin-block-end: 12px;
    padding: 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
  }
  ${body} > div:last-child { padding-block-start: 12px; }
  ${disclosure} {
    min-block-size: 28px;
    margin-inline: 0;
    padding-inline: 8px;
    gap: 8px;
    border-radius: 8px;
    color: var(--hcv-muted);
    font-size: 13px;
    font-weight: 400;
  }
  ${disclosure} > svg {
    inline-size: 14px;
    block-size: 14px;
    background: currentColor;
    mask: ${codexMask(progressGlyphs.disclosure)} center / contain no-repeat;
    transition: rotate 300ms cubic-bezier(.4, 0, .2, 1);
  }
  ${disclosure}:has(+ [data-selectable-text]) > svg { rotate: 90deg; }
  ${log} {
    padding: 8px 12px;
    border-color: var(--hcv-hairline);
    border-radius: 8px;
    background: var(--hcv-form-surface);
    color: var(--hcv-muted);
  }
  ${footer} { padding: 12px 20px; background: var(--hcv-menu); }
  ${footer} > div, ${footer} > div > div { flex-wrap: wrap; justify-content: flex-end; }
  ${footer} > div > span { margin-inline-end: auto; overflow-wrap: anywhere; }
  ${footer} button { min-block-size: 28px; border-radius: 8px; }
  ${panel} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
  @media (hover: hover) and (pointer: fine) {
    ${disclosure}:hover, ${footer} button[data-variant="ghost"]:not(:disabled):hover {
      background: var(--hcv-selected);
      color: var(--hcv-text);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${spinner} { animation: none; }
    ${disclosure} > svg { transition: none; }
  }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
