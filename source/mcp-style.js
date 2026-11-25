import { mountCSS } from './style-scope.js'

export function registerMcpStyle(ctx, active) {
  const page = `${active}[data-hcv-screen="capabilities"]:has([data-slot="connectors-directory"])`
  const details = `${active}[data-hcv-screen="capabilities"] [data-slot="dialog-content"]:has([data-slot="tools-list"], [data-slot="tools-summary"])`
  mountCSS(ctx, 'data-hcv-mcp-page', `
@media (forced-colors: none) {
  /* A solid scrim avoids blurring the large catalogue on every dialog frame. */
  ${page} [data-slot="dialog-overlay"] {
    backdrop-filter: none;
    background-color: light-dark(#0000004d, #00000080);
  }
  /* Russian status labels need more space than their English equivalents. */
  ${details} header > div.grid > div.flex {
    flex-wrap: wrap;
    row-gap: 4px;
  }
  ${details} header [data-slot="dialog-title"] {
    /* MCP's DialogHeader consumer uses heading-dialog font-semibold. */
    font-size: 18px;
    font-weight: 600;
    line-height: 28px;
    letter-spacing: normal;
    flex: none;
    max-inline-size: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  ${details} header [data-slot="dialog-description"] {
    font-size: 13px;
    line-height: calc(1.25 / .875);
    letter-spacing: normal;
  }
}
`, { screens: ['capabilities'] })
}
