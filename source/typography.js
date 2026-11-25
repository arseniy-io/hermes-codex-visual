import { codexReference as codex } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

// Families use the native theme contract. This layer supplies the corresponding
// text roles, including Hermes controls whose data has no Codex-specific markup.
// Wordmarks, math, icons, embedded documents and xterm's canvas keep their own
// resource contracts. No universal descendant font reset is used.
export function registerTypography(ctx, active) {
  const settings = `${active}[data-hcv-screen="settings"]`
  const model = `${settings}[data-hcv-settings-tab="config:model"]`
  const main = '[data-overlay-surface] main'
  const rowCopy = '[class~="@container"] > .grid.gap-3.py-3 > div:first-child'
  const description = `${rowCopy} > .mt-1`
  const commandDialog = '[data-slot="dialog-content"]:has([data-slot="command"])'
  const modelDescription = `:is(${model} [id^="aux-task-"] ${description}, ${model}[data-hcv-settings-page="moa"] ${description})`
  const route = `${model}[data-hcv-settings-page="delegation"] li > button`
  const memory = `${settings}[data-hcv-settings-tab="config:memory"]`
  const localModels = `${settings}[data-hcv-settings-tab="providers"][data-hcv-settings-page="local"]`
  const sectionLabel = '[data-hcv-sidebar-shell] [class~="group/section-label"] > span:has(> .dither)'
  mountCSS(ctx, 'data-hcv-typography', `
  ${active} {
    --hcv-mono-font: ${codex.fontMono};
    --hcv-font-ui-size: ${codex.typography.ui}px;
    --hcv-font-small-size: ${codex.typography.small}px;
    --hcv-font-caption-size: ${codex.typography.caption}px;
    --hcv-font-small-line: ${codex.typography.smallLine};
    font-synthesis-weight: none;
  }
  ${active} body {
    font-size: var(--hcv-font-ui-size);
    font-weight: ${codex.typography.weight};
    line-height: ${codex.typography.uiLine};
    letter-spacing: 0;
  }
  ${active} [data-tour="overlay-nav"] button.row-hover {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-ui-size);
    font-weight: 400;
    line-height: 21px;
  }
  /* SGc2 -> D8ee.s -> b5fQ.RQ: Pinned/Projects section titles. */
  ${active} ${sectionLabel},
  ${active} ${sectionLabel} > span.truncate,
  ${active} [data-hcv-projects-header] > [data-hcv-section-toggle] {
    font: 500 14px/21px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }
  ${active} [data-hcv-sidebar-shell] [class~="group/workspace"] > span.uppercase,
  ${active} [data-hcv-sidebar-shell] [class~="group/workspace"] > button > span.uppercase {
    font: 500 12px/16px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }
  /* TjgH status tag, excluding the host's icon-corner count variant. */
  ${active} [data-slot="badge"]:not([class~="text-[7px]"]) {
    font: 500 12px/16px var(--hcv-ui-font);
  }
  ${active} [data-slot="badge"].border:not([class~="text-[7px]"]) { line-height: 12px; }
  /* Sm6l button default/toolbar (739154.e5ff8d46b9.js). Do not give
     glyph-only buttons a text size; their icon metrics have a separate role. */
  ${active} [data-slot="button"]:not([data-size^="icon"], [data-size="inline"]) {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-small-size);
    font-weight: ${codex.typography.weight};
    line-height: 18px;
  }
  ${active} [data-slot="button"][data-size="xs"] {
    font-size: var(--hcv-font-caption-size);
    line-height: 16px;
  }
  ${active} [data-slot="dialog-footer"] [data-slot="button"] {
    font-weight: 500;
  }
  /* Input Container-IlLvT8 uses --text-sm/400 and inherits its line height. */
  ${active} :is(input, textarea)[data-slot]:not([type="file"], [type="checkbox"], [type="range"], [type="color"]) {
    font-size: var(--hcv-font-small-size);
    font-weight: 400;
  }
  /* Source-kILllF > pre in 0cf36033c2f9.css; inline snippets keep .92em. */
  ${active} [data-slot="aui_assistant-message-content"] .aui-md pre,
  ${active} .cm-editor .cm-content {
    font-family: var(--hcv-mono-font);
    font-size: ${codex.typography.code}px;
    font-weight: 400;
    line-height: 20px;
  }
  ${active} [data-slot="aui_assistant-message-content"] .aui-md pre code {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }
  /* Inputs containing source/config retain the code face. Model-name inputs
     below are values in a picker, rather than source editors. */
  ${active} :is(input, textarea)[data-slot].font-mono {
    font-family: var(--hcv-mono-font);
    font-size: ${codex.typography.code}px;
    font-weight: 400;
  }
  ${active}[data-hcv-screen="cron"] #cron-prompt[data-slot="textarea"] {
    font: 430 14px/20px var(--hcv-ui-font);
  }
  ${active} [data-chat-surface] [aria-hidden].pointer-events-none > div.font-mono.shadow-composer,
  ${active} [data-chat-surface] [aria-live="polite"].font-mono.shadow-composer {
    font: 430 13px/18.571429px var(--hcv-ui-font);
  }
  ${active} [data-slot="aui_assistant-message-stopped"] {
    font: 430 12px/16px var(--hcv-ui-font);
  }
  ${model} input[data-slot="input"].font-mono,
  ${memory} input[data-slot="input"].font-mono,
  ${active} [data-slot="select-item"].font-mono,
  ${active} ${commandDialog} [data-slot="dialog-description"].font-mono,
  ${active} :is([data-slot="command-item"], [data-slot="dropdown-menu-sub-trigger"]).font-mono,
  ${active} :is([data-slot="command-item"], [data-slot="dropdown-menu-sub-trigger"]) > span.font-mono {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-small-size);
    font-weight: ${codex.typography.weight};
    line-height: var(--hcv-font-small-line);
  }
  ${active} ${commandDialog} :is(span, div).font-mono:not(pre *, code *, .cm-content *) {
    font-family: var(--hcv-ui-font);
  }
  ${model} input[data-slot="input"].font-mono,
  ${memory} input[data-slot="input"].font-mono {
    font-weight: 400;
    line-height: inherit;
  }
  ${active} ${commandDialog} [data-slot="command-item"] .font-mono,
  ${active} ${commandDialog} [data-slot="command-item"] > span.shrink-0:not(:has(svg)),
  ${active} ${commandDialog} [cmdk-group-heading] .font-mono,
  ${active} ${commandDialog} [cmdk-group-items] > div.font-mono {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-caption-size);
    font-weight: ${codex.typography.weight};
    line-height: 16px;
  }
  /* AWNZ.ic: an ordinary setting description, not a code sample. */
  ${modelDescription} > span.font-mono,
  ${settings} ${description}.font-mono,
  ${model}[data-hcv-settings-page="moa"] .mb-2.text-xs > span.font-mono,
  ${model} .grow.font-medium > span.font-mono,
  ${route} span.font-mono,
  ${memory} [data-testid="memory-layers"] span.font-mono,
  ${memory} [data-slot="dialog-content"] span.self-start.font-mono,
  ${active}[data-hcv-screen="profiles"] dl dd > span.font-mono,
  ${active}[data-hcv-screen="command-center"] li > span.truncate.font-mono {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-caption-size);
    font-weight: ${codex.typography.weight};
    line-height: ${codex.typography.captionLine}px;
    letter-spacing: normal;
  }
  ${localModels} #local-model-browse span.font-mono,
  ${localModels} ${rowCopy} > div:first-child span.font-mono {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-small-size);
    font-weight: 500;
    line-height: var(--hcv-font-small-line);
  }
  ${route} > span:first-child > span.font-mono,
  ${memory} [data-testid="memory-layers"] span.font-mono {
    font-size: var(--hcv-font-small-size);
    font-weight: 500;
    line-height: var(--hcv-font-small-line);
  }
  ${model} [id^="aux-task-"] [data-slot="badge"] {
    font: 400 var(--hcv-font-caption-size)/${codex.typography.captionLine}px var(--hcv-ui-font);
  }
  ${memory} [data-slot="dialog-content"] h3.font-mono {
    font-family: var(--hcv-ui-font);
    font-size: var(--hcv-font-small-size);
    font-weight: 500;
    line-height: var(--hcv-font-small-line);
    letter-spacing: normal;
    text-transform: none;
  }
  /* The native panel metadata list uses 0.7rem, outside the Codex scale. */
  ${active} [data-overlay-surface] dl.grid {
    font-size: var(--hcv-font-caption-size);
    line-height: ${codex.typography.captionLine}px;
  }
  ${active}[data-hcv-screen="command-center"] ${main} section > ul > li > span {
    font-size: var(--hcv-font-caption-size);
    line-height: ${codex.typography.captionLine}px;
  }
  /* Jqpj.D row and YTCn creator metadata (card titles have their own rule). */
  ${active} [data-catalog] div[data-entry-id] > span.pointer-events-none > span:first-child > span.truncate {
    font: 430 14px/21px var(--hcv-ui-font);
  }
  ${active} [data-catalog] div[data-entry-id] > span.pointer-events-none > span.line-clamp-2 {
    font-size: 13px;
    line-height: 1.625;
  }
  ${active} [data-catalog] :is(.catalog-card-dates, .catalog-card-footer),
  ${active} [data-catalog] div[data-entry-id] > span.pointer-events-none > span.mt-1\\.5 {
    font-size: 12px;
    font-weight: 430;
    line-height: 16px;
  }
  /* The native model-limit bar is literal ASCII, whose columns need mono. */
  ${active} ${commandDialog} .font-mono > span[aria-hidden="true"].whitespace-pre {
    font-family: var(--hcv-mono-font);
    font-size: var(--hcv-font-caption-size);
    font-weight: 400;
  }
  `)
}
