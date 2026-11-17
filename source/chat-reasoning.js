import { codexReference } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

const surface = '[data-chat-surface]:not([data-hud-shell] *)'
const bodySlot = '[data-slot="aui_thinking-body"]'
const textSlot = '[data-slot="aui_reasoning-text"]'
export function registerChatReasoning(ctx, active) {
  const body = `${active} ${surface} ${bodySlot}`
  const text = `${body} ${textSlot}`
  // Streamdown renders the Markdown blocks inside its own root div.
  const flow = `:is(${text}, ${text} > div)`
  const heading = ':is(h1, h2, h3, h4, h5, h6)'
  const headingBlock = `:is(${heading}, div:has(> ${heading}))`
  mountCSS(ctx, 'data-hcv-chat-reasoning-style', `
    @media (forced-colors: none) {
      ${body} {
        margin: 0; padding: 0; max-block-size: 8.75rem;
        overflow-y: auto; overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--hcv-text) 30%, transparent) transparent;
      }
      ${text} {
        --paragraph-gap: 4px;
        --dt-line-height: 1.625;
        --hcv-thought-text: var(--hcv-chat-prose, var(--hcv-text));
        color: color-mix(in oklab, var(--hcv-thought-text) 60%, transparent);
        font: 430 var(--hcv-activity-font, 14px)/1.625 ${codexReference.font};
        overflow-wrap: anywhere;
      }
      ${text} :where(p, li, blockquote, h1, h2, h3, h4, h5, h6) {
        font-size: inherit; line-height: 1.625;
        margin-block: 0;
      }
      ${text} :is(p, li, blockquote, h1, h2, h3, h4, h5, h6, strong, em, a, code) {
        color: color-mix(in oklab, var(--hcv-thought-text) 50%, transparent);
      }
      ${text} :is(strong, b, h1, h2, h3, h4, h5, h6) { font-weight: 600; }
      ${flow} > p + p,
      ${flow} > ${headingBlock} + * { margin-block-start: 4px; }
      ${flow} > ${headingBlock}:not(:first-child) { margin-block-start: 8px; }
      ${text} :is(ul, ol) { margin-block: 0; }
      ${text} ul { padding-inline-start: 1rem; }
      ${text} ol { padding-inline-start: 2rem; }
      ${text} p:has(code) { padding-block: 2px; }
      ${text} code:not(pre code) {
        font-family: var(--hcv-activity-mono, monospace);
        font-size: .92em; font-weight: 400; padding: 1px 6px; border-radius: 6px;
        box-decoration-break: clone;
        background: var(--ui-inline-code-background);
      }
      ${text} pre { overflow-x: auto; }
      @supports (animation-timeline: scroll(self block)) {
        ${body} {
          mask-image: linear-gradient(to bottom, transparent, black var(--hcv-thought-fade-top, 0px)
            calc(100% - var(--hcv-thought-fade-bottom, 0px)), transparent);
          animation: hcv-thought-scroll-fade linear both;
          animation-timeline: scroll(self block);
        }
      }
    }
    @property --hcv-thought-fade-top { syntax: "<length>"; inherits: false; initial-value: 0px; }
    @property --hcv-thought-fade-bottom { syntax: "<length>"; inherits: false; initial-value: 0px; }
    @keyframes hcv-thought-scroll-fade {
      0%, 1% { --hcv-thought-fade-top: 0px; --hcv-thought-fade-bottom: 16px; }
      99%, 100% { --hcv-thought-fade-top: 16px; --hcv-thought-fade-bottom: 0px; }
    }
  `, { surface: bodySlot, retainAcrossChatTabs: true })
}
