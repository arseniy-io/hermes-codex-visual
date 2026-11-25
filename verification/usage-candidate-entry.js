// Isolated candidate while the main workspace is being changed by other tasks.
import base from '../source/plugin.js'
import { registerUsagePage } from '../source/usage-page.js'
import { registerUsageNavigation } from '../source/usage-nav.js'
import { registerUsageStyle } from '../source/usage-style.js'

export default {
  ...base,
  register(ctx) {
    base.register(ctx)
    const active = ':root[data-hermes-codex-visual][data-hermes-theme="codex-workspace"]'
    registerUsagePage(ctx)
    registerUsageNavigation(ctx, active)
    registerUsageStyle(ctx, active)
  },
}
