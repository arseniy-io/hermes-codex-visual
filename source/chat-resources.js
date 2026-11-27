import { mountStyle } from './style-scope.js'
import { codexIconRules, codexMask } from './codex-reference.js'
import { registerChatAudio } from './chat-audio.js'
import { registerChatVideo } from './chat-video.js'

// PreviewAttachment has no data-slot. The secondary action becomes Reveal
// once Hermes has resolved a local file. A directory only has the folder action.
const revealIcon = 'svg.tabler-icon-folder-open'
const secondaryAction = `button:has(> :is(svg.tabler-icon-download, ${revealIcon}))`
const directoryCard = `:has(> button:last-child > ${revealIcon})`
export const previewResourceCard = 'div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics):has(> span.truncate[title] + button)'

export function registerChatResources(ctx, active) {
  const thread = `${active} [data-chat-surface] [data-slot="aui_thread-content"]`
  const answer = `${thread} [data-slot="aui_assistant-message-content"]`
  const preview = `${answer} ${previewResourceCard}`
  const site = `${preview}:has(> span[title]:is([title^="http://" i], [title^="https://" i]))`
  const directory = `${preview}${directoryCard}`
  const file = `${preview}:not(${site}, ${directory})`
  const fileCard = `${file}:not([data-hcv-file-reference], [data-hcv-skill-card])`
  const artifact = `${answer} [data-slot="aui_artifact-card"]`
  const icon = `:is(${preview}, ${artifact}) > span:first-child`
  const withPreview = `${preview}:not(${directoryCard})`
  const open = `${withPreview} > button:last-child`
  const trailing = `${preview} > ${secondaryAction}`
  const secondary = `${preview} > ${secondaryAction}:not(:last-child)`
  const reveal = `${preview} > button:has(> ${revealIcon})`
  const media = `${answer} .aui-md span[class~="bg-muted/35"]`
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
/* Keep the native actions available to Results and inline file links. */
${fileCard} { display: none !important; }
@media (forced-colors: none) {
  /* fLcv and qO6B in 739301.37a39f26d6.js, Desktop tokens in 9ec44337a842.css. */
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
    corner-shape: superellipse(1.5);
    box-shadow: inset 0 0 0 .5px var(--hcv-hairline);
    background: color-mix(in oklab, var(--hcv-panel) 50%, transparent);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
  }
  ${preview} {
    container-type: inline-size;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    grid-template-rows: 1fr 1fr;
    gap: 0 10px;
  }
  :is(${file}, ${directory}) {
    max-inline-size: 32rem;
    min-block-size: 52px;
    padding: 6px;
  }
  ${directory} { grid-template-rows: 1fr; }
  ${directory} > span[title] { align-self: center; }
  ${artifact} { gap: 10px; }
  @supports (corner-shape: superellipse(1.5)) {
    :is(${preview}, ${artifact}) { border-radius: 12.5px; }
  }
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
    mask: ${codexMask('resourceDocument')} center / 20px no-repeat;
  }
  ${site} > span:first-child::before { mask-image: ${codexMask('web')}; mask-size: contain; }
  ${directory} > span:first-child::before { mask-image: ${codexMask('folder')}; mask-size: contain; }
  ${artifact} > span:first-child > :is(.codicon-browser, .codicon-symbol-color) {
    inline-size: 24px;
    block-size: 24px;
    background: currentColor;
    mask: ${codexMask('web')} center / contain no-repeat;
    font-size: 0;
  }
  ${artifact} > span:first-child > .codicon-symbol-color { mask-image: ${codexMask('image')}; }
  ${artifact} > span:first-child > :is(.codicon-browser, .codicon-symbol-color)::before { visibility: hidden; }
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
  ${trailing} {
    grid-area: 1 / 3 / 3 / 4;
    min-block-size: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${directory} > button { grid-row: 1; }
  ${reveal} {
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  }
  @container (max-width: 340px) {
    ${reveal} { min-inline-size: 28px; padding-inline: 0; font-size: 0; gap: 0; }
  }
  ${preview} > button > svg { inline-size: 16px; block-size: 16px; }
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
  /* GnI8 in 904817.6fbcca27bc.js reveals the trailing action on hover or focus. */
  @media (hover: hover) {
    ${secondary}:not(:disabled) { opacity: 0; pointer-events: none; }
    ${preview}:is(:hover, :focus-within) > ${secondaryAction}:not(:last-child):not(:disabled) {
      opacity: 1;
      pointer-events: auto;
    }
    ${preview}:hover:has(> button:last-child:not(:disabled)),
    ${artifact}:not(:disabled):hover {
      background-image: linear-gradient(var(--hcv-resource-hover), var(--hcv-resource-hover));
      --hcv-resource-hover: color-mix(in oklab, var(--hcv-hover-menu) 30%, transparent);
    }
  }
  @media (hover: none) {
    ${artifact} > span:nth-child(3) { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    :is(${preview}, ${artifact}, ${secondary}, ${artifact} > span:nth-child(3)) { transition: none; }
  }
  ${withPreview}:has(> button:last-child:focus-visible),
  :is(${artifact}, ${secondary}, ${reveal}, ${imageDownload}):focus-visible,
  ${generated} > button:first-of-type:focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${open}:focus-visible { outline: none; }

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
  :is(${secondary}, ${reveal}, ${imageDownload}):not(:disabled):hover {
    background: var(--hcv-selected);
    color: var(--hcv-text);
  }
  ${codexIconRules(`:is(${preview} > button, ${imageDownload}) > svg.tabler-icon-download`, 'download')}
  ${codexIconRules(`${reveal} > ${revealIcon}`, 'folderOpen')}

}
`
  mountStyle(ctx, style, { surface: '[data-slot="aui_assistant-message-content"], [data-slot="aui_user-message-root"]', retainAfterFirstUse: true })
  const players = [
    registerChatAudio(ctx, active, `${media} > audio`, forcedColors),
    registerChatVideo(ctx, active, `${media} > video`, forcedColors),
  ].filter(Boolean)
  const reconcileMedia = () => { for (const player of players) player.reconcile() }
  const mediaAppearance = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-hermes-theme')) reconcileMedia()
    if (records.some(record => record.attributeName === 'lang')) {
      for (const player of players) player.localize()
    }
  })
  mediaAppearance.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-hermes-theme', 'lang'],
  })
  ctx.addEventListener(forcedColors, 'change', reconcileMedia)
  reconcileMedia()
  // Use the real preview button without covering the filename's native tooltip.
  document.addEventListener('click', openFromCard)
  ctx.onDispose(() => {
    mediaAppearance.disconnect()
    document.removeEventListener('click', openFromCard)
    style.remove()
  })
}
