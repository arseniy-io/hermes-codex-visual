import { codexIconRules } from './codex-reference.js'

export function registerSettingsProviders(ctx, active) {
  const settings = `${active}[data-hcv-screen="settings"][data-hcv-settings-tab="providers"]`
  const providerMain = `${settings} [data-overlay-surface] main`
  const localMain = `${settings}[data-hcv-settings-page="local"] [data-overlay-surface] main`
  const hero = `${active} button:has(> .arc-border.arc-nous)`
  const accounts = `${providerMain} section.mb-5.grid.gap-2`
  const account = `${accounts} > :is(button[data-slot="row-button"], div.group.grid:has(> button))`
  const endpointShortcut = `${providerMain} > section > div.h-full > button[data-slot="row-button"]`
  const keyCard = `${providerMain} [id^="provider-key-"] > [class~="group/card"]`
  const endpointList = `${providerMain} .space-y-6 > section > .divide-y.rounded-md.border`
  const endpointForm = `${providerMain} .space-y-6 > section > .grid.rounded-md.border.p-3`
  const endpointName = `${endpointList} > .grid > button:first-child`
  const localFiles = `${localMain} #local-model-browse .flex.flex-col.rounded-md.border`
  const localQuickstart = `${localMain} [class~="min-h-[60dvh]"] > .max-w-md`
  const search = `${providerMain} .inline-flex:has(> svg.tabler-icon-search + input[type="text"])`
  const badges = `:is(${accounts} > div.group.grid > button > div > span.inline-flex,
    ${accounts} > button > div > :is(div > span.inline-flex, span.inline-flex),
    ${providerMain} [data-slot="badge"])`
  const cards = `:is(${account}, ${endpointShortcut}, ${keyCard}, ${endpointList}, ${endpointForm}, ${localQuickstart})`
  const sheet = document.createElement('style')
  sheet.dataset.hcvSettingsProviders = ''
  sheet.textContent = `
@media (forced-colors: none) {
  /* Codex's recommendation variant (ZEx5 in 200452.4e72c790d9.js)
     has a clipped 20px frame. The shared Hermes row keeps its native arc. */
  ${hero} {
    border-radius: 20px;
    overflow: hidden;
  }
  ${hero} > .arc-border.arc-nous {
    --arc-standoff: 0px;
    border-radius: inherit;
  }
  ${hero} > div > div { flex-wrap: wrap; }
  ${hero} > div > div > span.inline-flex { border-radius: 999px; }

  ${cards} {
    border-radius: var(--hcv-settings-card-radius, 16px);
    background-color: var(--hcv-settings-group);
  }
  :is(${account}, ${endpointShortcut}, ${keyCard}, ${localQuickstart}) {
    box-shadow: inset 0 0 0 1px var(--hcv-settings-group-stroke);
  }
  ${account} > button:first-child,
  ${endpointName} {
    border-radius: var(--hcv-settings-control-radius, 8px);
  }
  ${account} > button:first-child > .flex { flex-wrap: wrap; }
  ${accounts} > button:has(> .arc-border.arc-nous) {
    background-color: var(--hcv-settings-group);
    box-shadow: inset 0 0 0 1px var(--hcv-settings-group-stroke);
  }
  ${badges} {
    border-radius: 999px;
    max-inline-size: 100%;
    white-space: normal;
    line-height: 1.25;
  }
  ${keyCard}.ring-1 { box-shadow: inset 0 0 0 1px var(--hcv-stroke); }
  ${keyCard}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${keyCard}:focus-within > .grid > div:first-child > svg { opacity: 1; }

  /* The search settings variant (okCa in 739301.37a39f26d6.js)
     uses a hairline, an inset glyph and the settings control radius. */
  ${search} {
    min-block-size: 32px;
    gap: 8px;
    padding-inline: 10px;
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-settings-control-radius, 8px);
    background-color: var(--hcv-form-surface);
    opacity: 1;
  }
  ${search}:focus-within { border-color: var(--hcv-focus); }
  ${search} > input {
    min-block-size: 30px;
    font-size: 13px;
    line-height: 18px;
  }
  ${codexIconRules(`${search} > svg.tabler-icon-search`, 'search')}

  :is(${endpointList}, ${endpointForm}, ${localFiles}) {
    border-color: var(--hcv-settings-group-stroke);
  }
  ${endpointList} > .grid {
    padding: 12px 16px;
    border-color: var(--hcv-hairline);
  }
  ${endpointForm} { padding: clamp(12px, 2vw, 16px); }
  ${localFiles} {
    border-radius: var(--hcv-settings-control-radius, 8px);
    background-color: var(--hcv-form-surface);
  }
  ${localQuickstart} { padding: clamp(16px, 3vw, 24px); }
  ${localQuickstart} > .flex { flex-wrap: wrap; }

  @media (hover: hover) and (pointer: fine) {
    :is(${account}, ${endpointShortcut}, ${keyCard}[role="button"],
      ${accounts} > button:has(> .arc-border.arc-nous)):hover:not(:disabled) {
      background-color: color-mix(in srgb, var(--hcv-settings-group) 90%, var(--hcv-text));
    }
    ${endpointName}:hover { color: var(--hcv-text); text-decoration: underline; }
    ${search}:hover:not(:focus-within) { border-color: var(--hcv-stroke); }
  }
}
@media (forced-colors: active) {
  ${hero} > .arc-border.arc-nous { display: none; }
  ${hero}:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
