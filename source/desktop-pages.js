import { codexIconRules } from './codex-reference.js'

export function registerDesktopPages(ctx, active) {
  const page = 'section.h-full.min-w-0.overflow-hidden:not([data-chat-surface])'
  const artifacts = `${active}[data-hcv-screen="artifacts"] ${page}`
  const messages = `${active}[data-hcv-screen="messaging"] ${page}`
  const scheduled = `${active}[data-hcv-screen="cron"] [data-overlay-surface]`
  const searches = `:is(${artifacts}, ${messages}, ${scheduled}) div:has(> svg.tabler-icon-search + input[placeholder])`
  const artifactRows = `${artifacts} tbody > tr`
  const artifactAction = `${artifactRows} > td > :is(a[href], button[data-slot="row-button"])`
  const platform = `${messages} aside li > button.row-hover`
  const task = `${scheduled} [data-panel-row]`

  const sheet = document.createElement('style')
  sheet.dataset.hcvDesktopPages = ''
  sheet.textContent = `
    @media (forced-colors: none) {
      /* okCa toolbar-compact in 739301.37a39f26d6.js. */
      ${searches} {
        min-block-size: 32px;
        border-color: var(--hcv-dropdown-outline);
        border-radius: 9999px;
        background: transparent;
        padding-inline: 12px;
      }
      ${searches} > input {
        min-inline-size: 0;
        min-block-size: 28px;
        font-size: 14px;
        line-height: 20px;
      }
      ${searches}:focus-within { border-color: var(--hcv-focus); }
      ${searches} > svg.tabler-icon-search {
        color: var(--hcv-muted);
        inline-size: 16px;
        block-size: 16px;
        flex: none;
      }

      /* The Codex resource list supplies surface, icon tile and type.
         Hermes keeps its columns, pagination and individual cell actions. */
      ${artifacts} div:has(> table) {
        border-radius: 12px;
        border-color: var(--hcv-hairline);
        background: var(--hcv-chat);
      }
      ${artifacts} thead { background: var(--hcv-chat); border-color: var(--hcv-hairline); }
      ${artifacts} table th {
        padding: 8px 12px;
        background: transparent;
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
      }
      ${artifacts} div.sticky:has(+ div > table) { background: var(--hcv-chat); }
      ${artifactRows} { height: 48px; }
      ${artifactRows} + tr { border-top: 1px solid var(--hcv-hairline); }
      ${artifactAction} {
        min-block-size: 47px;
        padding: 4px 12px;
        color: var(--hcv-text);
        text-decoration: none;
      }
      ${artifactAction}:hover { text-decoration: none; }
      ${artifactRows} > td:first-child > :is(a, button) > span:first-child {
        align-self: center;
        margin-block-start: 0;
        inline-size: 32px;
        block-size: 32px;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        color: var(--hcv-muted);
      }
      ${codexIconRules(`${artifactRows} td:first-child .tabler-icon-file-text`, 'artifacts')}
      ${codexIconRules(`${artifactRows} td:first-child .tabler-icon-link`, 'link')}
      ${artifactRows} td:first-child :is(.tabler-icon-file-text, .tabler-icon-link) {
        inline-size: 16px;
        block-size: 16px;
      }
      ${artifacts} [data-tour="page-tabs"] button { border-radius: 9999px; }

      ${messages} aside { padding: 8px 10px; }
      ${platform}, ${task} {
        min-block-size: 36px;
        border-radius: 10px;
        font-size: 14px;
        line-height: 20px;
      }
      ${platform} { padding-inline: 10px; }
      ${task} > button:first-child { padding-inline: 10px; }
      ${task} > button:first-child > span:last-child { font-weight: 430; }
      ${scheduled} header > div > h2 {
        font-size: 20px;
        line-height: 26px;
        letter-spacing: -.01em;
      }
      ${codexIconRules(`${scheduled} .codicon-watch`, 'schedule')}
      ${codexIconRules(`${scheduled} .codicon-kebab-vertical`, 'more')}
      ${codexIconRules(`${scheduled} .codicon-add`, 'plus')}

      ${artifactRows}:focus-within { background: var(--hcv-hover); }
      :is(${artifactAction}, ${platform}, ${task} > button:first-child):focus-visible {
        outline: 2px solid var(--hcv-focus);
        outline-offset: -2px;
        box-shadow: none;
      }
      @media (hover: hover) and (pointer: fine) {
        ${artifactRows}:hover { background: var(--hcv-hover); }
      }
      @media (prefers-reduced-motion: no-preference) {
        :is(${artifactRows}, ${platform}, ${task}) {
          transition: background-color 150ms var(--hcv-enter), color 150ms var(--hcv-enter);
        }
        ${searches} { transition: border-color 150ms var(--hcv-enter); }
      }
      @media (prefers-reduced-motion: reduce) {
        :is(${artifactRows}, ${artifactAction}, ${platform}, ${task}, ${searches}) { transition: none; }
      }
    }
  `
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
