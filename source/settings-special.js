import { codexIconRules } from './codex-reference.js'

export function registerSettingsSpecial(ctx, active) {
  const settings = `${active}[data-hcv-screen="settings"] [data-overlay-surface]`
  const main = `${settings} main`
  const page = tab => `${active}[data-hcv-settings-tab="${tab}"] [data-overlay-surface] main`

  const gateways = page('gateway')
  const registryEditor = `${gateways} .space-y-3.rounded-lg.border:has(> .grid.grid-cols-2)`
  const gatewayAgent = `${gateways} [class~="ring-primary/25"].rounded-md:has(> [class~="@container"])`
  const billing = page('billing')
  const billingNotice = `${billing} .mb-6.rounded-xl.p-4:has(> .mt-1)`
  const billingTiles = `${billing} [class~="@container"].mb-6 > .grid[class~="@2xl:grid-cols-3"]:has(> .min-w-0 > .tabular-nums)`
  const billingUsage = `${billing} section.mb-6 > [class~="@container"]:has(> [class~="@container"] > .grid.py-3)`
  const planTile = `${billing} .grid[class~="@3xl:grid-cols-3"] > .rounded-lg.outline-none[tabindex="-1"]`
  const confirmPlan = `${planTile} [role="status"][aria-live="polite"]`

  const shortcuts = page('keybinds')
  const shortcutList = `${shortcuts} > section > .h-full > div.px-2[class~="py-1.5"]:has([data-slot="kbd"], [class~="group/kbd-cat"])`
  const shortcutRow = `:is(${shortcutList} > div, ${shortcutList} > section > div).rounded-lg:has([data-slot="kbd"])`
  const shortcutCategory = `${shortcutList} [class~="group/kbd-cat"]`
  const keycap = `${shortcuts} [data-slot="kbd"]`

  const archiveRow = '[id^="archived-session-"]'
  const archive = `${main} .grid:has(> ${archiveRow})`
  const pluginRow = 'button[data-testid^="plugin-settings-row-"]'
  const plugins = `${main} .grid:has(> ${pluginRow})`
  const pluginManage = `${page('plugins')} a[data-slot="button"][href*="capabilities"]`
  const keyRow = '[id^="credential-key-"] > [class~="group/card"]'
  const toolKey = `${page('keys')} ${keyRow}`
  const emptyKeys = `${page('keys')} .rounded-lg.border-dashed`

  const about = page('about')
  const uninstall = `${about} .max-w-2xl > .rounded-xl.border:is([class~="border-destructive/30"], [class~="bg-background/40"])`
  const uninstallOption = `${uninstall} button.rounded-lg.border.text-left`
  const inlineAlert = `${shortcuts} [role="alert"] > div.rounded-xl[class~="border-destructive/30"]`

  const sheet = document.createElement('style')
  sheet.dataset.hcvSettingsSpecial = ''
  sheet.textContent = `
@media (forced-colors: none) {
  /* ZEx5 card surfaces and dividers from Codex 200452.4e72c790d9.js. */
  ${registryEditor}, ${billingTiles}, ${billingUsage}, ${planTile}, ${archive}, ${plugins}, ${emptyKeys} {
    min-inline-size: 0;
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-card-radius);
    background-color: var(--hcv-settings-group);
  }
  ${gatewayAgent} {
    border-radius: var(--hcv-settings-control-radius);
    background-color: var(--hcv-settings-group);
    box-shadow: inset 0 0 0 1px var(--hcv-hairline);
  }
  ${registryEditor} > .grid > button { min-inline-size: 0; overflow-wrap: anywhere; white-space: normal; }
  ${registryEditor} > .grid > button[data-variant="default"]:not(:disabled) {
    background: var(--hcv-hover-menu);
    color: var(--hcv-text);
    box-shadow: inset 0 0 0 1px var(--hcv-stroke);
  }

  /* Codex Usage (333192.5177e7c555.js) supplies the neutral table surface;
     keep Hermes' different stats, plan artwork, and warning colors. */
  ${billingTiles}, ${billingUsage} { padding-inline: clamp(8px, 2vw, 16px); }
  ${billingTiles} { padding-block: 12px; }
  ${billingUsage} > [class~="@container"] + [class~="@container"] { border-block-start: 1px solid var(--hcv-hairline); }
  ${billingNotice}, ${uninstall} { border-radius: var(--hcv-settings-card-radius); }
  ${billingNotice} { border: 1px solid var(--hcv-settings-group-stroke); }
  ${billingNotice}[class~="bg-(--ui-bg-quaternary)"] { background-color: var(--hcv-settings-group); }
  ${planTile}[class~="bg-(--ui-green)/10"] {
    border-color: color-mix(in srgb, var(--ui-green) 34%, transparent);
    background-color: color-mix(in srgb, var(--ui-green) 10%, var(--hcv-settings-group));
  }
  ${confirmPlan} {
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-control-radius);
    background-color: var(--hcv-chat);
  }
  ${planTile}:focus-visible, ${confirmPlan}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }

  /* The Codex shortcuts editor keeps command labels and keycaps on one row
     and uses a visible focus outline for capture (566048.88ccc86b80.js). */
  ${shortcutList} {
    padding: 8px;
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: var(--hcv-settings-card-radius);
    background-color: var(--hcv-settings-group);
  }
  ${shortcutCategory} { min-block-size: 28px; padding-block: 4px; border-radius: 8px; }
  ${shortcutCategory} > span { color: var(--hcv-muted); font-size: 11px; letter-spacing: .06em; }
  ${shortcutRow} { min-block-size: 34px; border-radius: var(--hcv-settings-control-radius); }
  ${shortcutRow}:focus-within { background-color: var(--hcv-hover-menu); }
  ${keycap} { border-radius: 5px; box-shadow: none; }

  ${archive} { gap: 0; padding-inline: clamp(8px, 2vw, 16px); }
  ${archive} > ${archiveRow} + ${archiveRow} { border-block-start: 1px solid var(--hcv-hairline); }
  ${plugins} > ${pluginRow} {
    min-block-size: 44px;
    border-color: var(--hcv-hairline);
    background-color: transparent;
  }
  ${plugins} > ${pluginRow}:first-child { border-start-start-radius: 15px; border-start-end-radius: 15px; }
  ${plugins} > ${pluginRow}:last-child { border-end-start-radius: 15px; border-end-end-radius: 15px; }
  ${codexIconRules(`${plugins} > ${pluginRow} > .codicon-chevron-right`, 'right')}
  ${pluginManage} { border-radius: var(--hcv-settings-control-radius); }

  ${toolKey} {
    min-inline-size: 0;
    border-radius: var(--hcv-settings-card-radius);
    background-color: var(--hcv-settings-group);
    box-shadow: inset 0 0 0 1px var(--hcv-settings-group-stroke);
  }
  ${toolKey}.ring-1 { box-shadow: inset 0 0 0 1px var(--hcv-stroke); }
  ${toolKey}[role="button"]:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }

  ${uninstall}:not([class~="border-destructive/30"]) { background-color: var(--hcv-settings-group); }
  ${uninstallOption} { border-radius: 12px; }
  ${inlineAlert} { border-radius: var(--hcv-settings-card-radius); }

  @media (hover: hover) and (pointer: fine) {
    ${plugins} > ${pluginRow}:hover, ${shortcutCategory}:hover, ${shortcutRow}:hover,
    ${toolKey}.row-hover:hover {
      background-color: var(--hcv-hover-menu);
    }
  }
}
`
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
