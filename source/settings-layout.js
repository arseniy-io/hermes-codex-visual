// Native ListRow from app/settings/primitives.tsx. Keep the wrappers that
// own deep links, focus and config writes; only their visual role changes.
export const settingsRowHost = '[class~="@container"]'
const body = '.grid.gap-3.py-3'
const hostBody = `${settingsRowHost} > ${body}`
const row = `${settingsRowHost}:has(> ${body})`
const wrapped = ':is([id^="setting-field-"], [id^="aux-task-"], [id^="archived-session-"]):not([class~="@container"])'
const member = `:is(${settingsRowHost}, ${wrapped})`

export function settingsLayoutRules(screen, main) {
  const grid = `${main} ${hostBody}`
  const copy = `${grid} > div:first-child`
  const trailing = `${grid} > div:nth-child(2)`
  const group = `${main} :where(div, section):where(:not(${member}):has(> ${hostBody}, > ${wrapped} > ${hostBody}):not(:has(> :not(${member}))))`
  const delegation = `${main} [id="setting-field-delegation.model"]`
  const delegationRows = `${delegation} .grid.gap-1:has(> ${hostBody})`
  const moa = `${screen}[data-hcv-settings-tab="config:model"][data-hcv-settings-page="moa"] [data-overlay-surface] main`
  const addReference = 'button[data-slot="button"][data-variant="textStrong"]'
  const moaRows = `${moa} .grid.gap-1:has(> ${settingsRowHost} + ${addReference} + ${hostBody})`
  const loose = `${main} :where(${row}:not(${group} > *, ${group} > ${wrapped} > *, ${delegation} *, ${moaRows} > *))`
  const looseRun = `${main} .grid.gap-1:has(> ${settingsRowHost} + ${hostBody}):not(:where(${group}, ${delegationRows}, ${moaRows}))`
  const attachmentSize = '[id="setting-field-chat.attachment-size"]'
  const imageMode = '[id="setting-field-agent.image_input_mode"]:only-child'
  const attachmentTail = `${main} ${attachmentSize} + .grid:has(> ${imageMode} > ${hostBody})`
  const attachmentHead = `${main} ${attachmentSize}:has(+ .grid > ${imageMode} > ${hostBody})`
  const divider = '1px solid var(--hcv-settings-group-stroke)'
  const profile = `${main} .grid.gap-2:has(> .flex.flex-wrap[class~="gap-1.5"] > button.rounded-full.border[type="button"])`
  const auxIntro = `${screen}[data-hcv-settings-page="auxiliary"] [data-overlay-surface] main section:has(> .grid > [id^="aux-task-"])`
  const actionRail = `${main} [id^="aux-task-"] ${hostBody} > div:nth-child(2) > .flex`
  const modelList = `${main} :is([id^="aux-task-"], [id="setting-field-delegation.model"]) ${hostBody}`
  const presetBar = `${moa} .flex.flex-wrap:has(> label > [role="switch"]):has(> [data-slot="select-trigger"])`
  const modelEditor = `${moaRows} > ${settingsRowHost} > ${body} > div:first-child > .mt-2.flex`
  const modelTitle = `:is(${modelList}, ${moaRows} > ${hostBody}) > div:first-child > div:first-child > span.flex`
  const fontRow = `${main} :is([id="setting-field-appearance.chat-font"], [id="setting-field-appearance.terminal-font"]) ${hostBody}`
  const routeModes = `${main} [role="radiogroup"]:has(> [data-mode] > button[role="radio"])`

  return `
  /* Codex AWNZ.ic / ZEx5: a flat list of rows within one frame. A deep-link
     wrapper is a member of that list, never another card inside it. */
  ${group}, ${loose}, ${moaRows} {
    min-inline-size: 0;
    padding-inline: var(--hcv-settings-inset);
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-card-radius);
    background-color: var(--hcv-settings-group);
  }
  ${group}, ${looseRun}, ${delegationRows}, ${moaRows} { gap: 0; }
  /* Separate independent cards while preserving intentionally joined rows. */
  :is(${group}) + :is(${group}),
  :is(${group}) + :is(${loose}),
  :is(${loose}):not(:is(${attachmentHead})) + :is(${group}) {
    margin-block-start: var(--hcv-settings-block-gap);
  }
  ${group} > ${member} { min-inline-size: 0; border-radius: 0; }
  ${group} > ${member} + ${member},
  ${delegationRows} > ${settingsRowHost} + ${settingsRowHost},
  ${moaRows} > ${settingsRowHost} + ${settingsRowHost} { border-block-start: ${divider}; }
  ${loose} + ${settingsRowHost} {
    border-start-start-radius: 0;
    border-start-end-radius: 0;
    border-block-start-color: var(--hcv-settings-group-stroke);
  }
  ${loose}:has(+ ${settingsRowHost} > ${body}) {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    border-block-end-width: 0;
  }
  ${attachmentHead} {
    border-block-end: 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  ${attachmentTail} {
    border-block-start: 0;
    border-start-start-radius: 0;
    border-start-end-radius: 0;
  }
  ${attachmentTail} > ${imageMode} { border-block-start: ${divider}; }

  ${grid} {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px var(--hcv-settings-row-gap);
    padding-block: var(--hcv-settings-row-pad);
  }
  ${copy} > div:first-child { font-size: 13px; font-weight: 500; line-height: calc(1.25 / .875); }
  ${copy} > div:first-child > span { min-inline-size: 0; overflow-wrap: anywhere; }
  ${copy} > .mt-1 { margin-block-start: 2px; overflow-wrap: anywhere; }
  ${trailing} { min-inline-size: 0; gap: 8px; }
  ${trailing} > :is(div, button, input) { max-inline-size: 100%; }
  ${grid}:has(> div:nth-child(2) > [role="switch"]:only-child) {
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
  }
  ${grid}:has(> div:nth-child(2) > [role="switch"]:only-child) > div:nth-child(2) {
    justify-self: end;
  }
  @container (min-width: 480px) {
    ${grid}:has(> div + div) {
      grid-template-columns: minmax(0, 1fr) fit-content(54%);
      align-items: center;
    }
    ${grid}[class~="@2xl:items-start"] { align-items: start; }
    ${trailing} { justify-self: end; justify-content: flex-end; }
  }
  @container (width < 480px) {
    ${copy} > div:first-child { flex-wrap: wrap; gap: 4px 8px; }
    ${trailing} { justify-self: start; justify-content: flex-start; }
  }

  /* Hermes-only controls mapped to stacked rows and compact actions. */
  ${delegationRows} > div.pb-3:empty { display: none; }
  ${delegationRows} > div.pb-3:not(:empty) { padding-block: 4px 12px; }
  ${routeModes} {
    gap: 0;
    padding-inline: var(--hcv-settings-inset);
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-card-radius);
    background: var(--hcv-settings-group);
  }
  ${routeModes} > [data-mode] { border: 0; border-radius: 0; background: transparent; }
  ${routeModes} > [data-mode] + [data-mode] { border-block-start: ${divider}; }
  ${routeModes} > [data-mode] > button[role="radio"] { padding: 10px 0; }
  ${routeModes} > [data-blocked="true"] { background: color-mix(in srgb, #f59e0b 8%, transparent); }
  @media (hover: hover) and (pointer: fine) {
    ${routeModes} > [data-mode]:has(> button[role="radio"]:hover:not(:disabled)) { background: var(--hcv-settings-button); }
  }
  @container hcv-settings-main (min-width: 540px) {
    ${auxIntro} {
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      align-items: center;
      gap: 12px 16px;
    }
    ${auxIntro} > * { grid-column: 1 / -1; }
    ${auxIntro} > div:first-child { grid-area: 1 / 2; margin: 0; }
    ${auxIntro} > p:nth-child(2) { grid-area: 1 / 1; margin: 0; }
  }
  ${modelTitle} { flex-wrap: wrap; gap: 2px 8px; }
  ${modelTitle} > [data-slot="badge"] {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--hcv-muted);
    font: 400 12px/16px var(--hcv-ui-font);
    white-space: normal;
    text-align: start;
  }
  ${actionRail} { flex-wrap: wrap; flex-shrink: 1; justify-content: inherit; gap: 4px 8px; }
  ${modelList} > div:first-child > .mt-2.grid { margin-block-start: 8px; padding-block-start: 0; }
  ${presetBar} > [data-slot="select-trigger"] {
    inline-size: auto;
    min-inline-size: min(136px, 100%);
  }
  ${presetBar} > label:has(> [role="switch"]) {
    min-block-size: 28px;
    padding: 2px 8px;
    border-radius: 8px;
  }
  ${moaRows} > ${addReference} {
    justify-self: end;
    margin-block: 8px;
  }
  ${moaRows} > ${settingsRowHost}:has(+ ${addReference}) { border-block-end: ${divider}; }
  ${moaRows} > ${addReference} + ${settingsRowHost} { border-block-start: ${divider}; }
  ${modelEditor} { margin-block-start: 6px; padding-block-start: 0; gap: 6px 8px; }
  ${modelEditor} > :is(button, div) { max-inline-size: 100%; min-inline-size: 0; }
  ${modelEditor} > :is([data-slot$="select-trigger"], div:has(> [data-slot="input"])) {
    inline-size: auto;
    flex: 1 1 160px;
  }
  ${moaRows} > ${hostBody}:has(> div:nth-child(2)) { align-items: start; }
  ${moaRows} > ${hostBody} > div:nth-child(2) { padding-block-start: 1px; }
  ${fontRow} > div > .space-y-2 { margin-block-start: 8px; }
  ${fontRow} > div > .space-y-2 > div:first-child { flex-wrap: wrap; gap: 8px; }
  ${fontRow} > div > .space-y-2 > div:first-child > div { min-inline-size: min(200px, 100%); }
  ${fontRow} > div > .space-y-2 > .overflow-hidden {
    padding: 6px 0 0;
    overflow-wrap: anywhere;
  }
  ${profile} { gap: 4px; margin-block-end: 16px; }
  ${profile} > .flex { gap: 6px; }
  ${profile} > .flex > button {
    padding: 3px 8px;
    max-inline-size: 100%;
    min-block-size: 24px;
    border-radius: 8px;
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  `
}
