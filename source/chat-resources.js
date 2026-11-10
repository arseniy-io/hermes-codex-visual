import { codexIconRules, codexMask } from './codex-reference.js'

// PreviewAttachment has no data-slot. Use the entire native structure so a
// file title with an unrelated action elsewhere in the answer does not match.
export const previewResourceCard = 'div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics):has(> span.truncate[title] + button[aria-label] + button:not([aria-label]):last-child)'

export function registerChatResources(ctx, active) {
  const thread = `${active} [data-chat-surface] [data-slot="aui_thread-content"]`
  const answer = `${thread} [data-slot="aui_assistant-message-content"]`
  const preview = `${answer} ${previewResourceCard}`
  const site = `${preview}:has(> span[title]:is([title^="http://" i], [title^="https://" i]))`
  const artifact = `${answer} [data-slot="aui_artifact-card"]`
  const icon = `:is(${preview}, ${artifact}) > span:first-child`
  const open = `${preview} > button:last-child`
  const download = `${preview} > button[aria-label]`
  const media = `${answer} .aui-md span[class~="bg-muted/35"]:has(> :is(audio, video))`
  const image = `${thread} :is([data-slot="aui_embedded-images"], [data-slot="aui_markdown-image"])`
  const generated = `${answer} [data-slot="aui_generated-image"]`
  const imageDownload = `:is(${image}, ${generated}) button:has(> svg.tabler-icon-download)`
  const imageFocus = `${image} button:focus-visible > img`
  const forcedColors = window.matchMedia('(forced-colors: active)')
  function openFromCard(event) {
    const target = event.target
    if (event.defaultPrevented || forcedColors.matches || !(target instanceof Element) || target.closest('button')) return
    const card = target.closest(preview)
    if (card && document.getSelection()?.isCollapsed !== false) card.lastElementChild.click()
  }
  const style = document.createElement('style')
  style.dataset.hcvChatResources = ''
  style.textContent = `
@media (forced-colors: none) {
  :is(${preview}, ${artifact}) {
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 64px;
    margin-block: 6px;
    padding: 12px;
    border: 0;
    border-radius: 10px;
    box-shadow: inset 0 0 0 .5px var(--hcv-stroke);
    background: var(--hcv-panel);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
  }
  ${preview} {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    grid-template-rows: 1fr 1fr;
    gap: 0 10px;
  }
  ${artifact} { gap: 10px; }
  ${icon} {
    inline-size: 40px;
    block-size: 40px;
    border-radius: 10px;
    background: var(--hcv-hover);
    color: var(--hcv-muted);
  }
  ${preview} > span:first-child {
    grid-area: 1 / 1 / 3 / 2;
  }
  ${preview} > span:first-child > svg { display: none; }
  ${preview} > span:first-child::before {
    content: "";
    inline-size: 24px;
    block-size: 24px;
    background: currentColor;
    mask: ${codexMask('artifacts')} center / contain no-repeat;
  }
  ${site} > span:first-child::before { mask-image: ${codexMask('web')}; }
  ${preview} > span[title], ${artifact} > span:nth-child(2) > span:first-child {
    color: var(--hcv-text);
    font: 500 var(--conversation-text-font-size, 13px) / 20px var(--hcv-ui-font);
  }
  ${preview} > span[title] { grid-area: 1 / 2; align-self: end; }
  ${open}, ${artifact} > span:nth-child(2) > span + span {
    color: var(--hcv-muted);
    font: 400 calc(var(--conversation-text-font-size, 13px) - 1px) / 18px var(--hcv-ui-font);
  }
  ${open} {
    grid-area: 2 / 2;
    align-self: start;
    min-inline-size: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${preview}:has(> button:last-child:not(:disabled)) { cursor: pointer; }
  ${preview}:hover:has(> button:last-child:not(:disabled)),
  ${artifact}:not(:disabled):hover { background: var(--hcv-hover); }
  ${download} {
    grid-area: 1 / 3 / 3 / 4;
    min-block-size: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${download} > svg { inline-size: 14px; block-size: 14px; }
  ${artifact} > span:nth-child(3) {
    max-inline-size: 40%;
    overflow: hidden;
    padding: 4px 8px;
    border-radius: 8px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${artifact}:focus-visible > span:nth-child(3) { opacity: 1; }
  ${preview}:has(> button:last-child:focus-visible),
  :is(${artifact}, ${download}, ${imageDownload}):focus-visible,
  ${generated} > button:first-of-type:focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${open}:focus-visible { outline: none; }

  ${media} {
    padding: 12px;
    border: 0;
    border-radius: 10px;
    box-shadow: inset 0 0 0 .5px var(--hcv-stroke);
    background: var(--hcv-panel);
  }
  ${media} > span:first-child { color: var(--hcv-muted); font: 500 13px/18px var(--hcv-ui-font); }
  ${media} > video { border-radius: 8px; }
  ${image} img, ${generated} { border-radius: 12px; }
  ${image} img {
    border: 0;
    outline: 1px solid light-dark(oklch(0 0 0 / 0.1), oklch(1 0 0 / 0.1));
    outline-offset: -1px;
  }
  ${imageFocus} { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${imageDownload} {
    border: 0;
    border-radius: 8px;
    box-shadow: none;
    background: var(--hcv-panel);
    color: var(--hcv-muted);
  }
  :is(${download}, ${imageDownload}):not(:disabled):hover {
    background: var(--hcv-selected);
    color: var(--hcv-text);
  }
  ${codexIconRules(`:is(${download}, ${imageDownload}) > svg.tabler-icon-download`, 'download')}

  @media (prefers-reduced-motion: no-preference) {
    :is(${preview}, ${artifact}, ${download}) { transition: background-color 120ms ease-out, color 120ms ease-out; }
    ${download}:active:not(:disabled) { scale: .96; }
  }
}
`
  document.head.append(style)
  // Use the real preview button without covering the filename's native tooltip.
  document.addEventListener('click', openFromCard)
  ctx.onDispose(() => {
    document.removeEventListener('click', openFromCard)
    style.remove()
  })
}
