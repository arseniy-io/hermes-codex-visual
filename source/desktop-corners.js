import { codexReference as codex } from './codex-reference.js'

export function registerDesktopCorners(ctx, active) {
  const messaging = `${active}[data-hcv-screen="messaging"] main`
  const scheduled = `${active}[data-hcv-screen="cron"] [data-overlay-surface]`
  const capabilities = `${active}[data-hcv-screen="capabilities"]`
  const setupCard = `${messaging} :is([data-testid^="relay-link-"], section > .mt-3 > div.rounded-xl.border[class~="bg-(--ui-surface-secondary,transparent)"])`
  const featuredControls = `${capabilities} :is(.catalog-featured-controls > button[data-size="icon-xs"], .catalog-hero-action button[data-size="xs"])`
  const kanbanCard = `${active} div[draggable].rounded-md.border-l-2[style*="--kanban-tone:"]`
  const sessionArc = `${active} [data-tour="sessions-sidebar"] .row-hover > .arc-border.arc-row`
  const tour = `${active} .driver-popover`
  const sheet = document.createElement('style')
  sheet.dataset.hcvDesktopCorners = ''
  sheet.textContent = `
    @media (forced-colors: none) {
      /* Settings card and control geometry adapted to Hermes's QR setup. */
      ${setupCard} {
        border-radius: 12px;
        border-color: var(--hcv-hairline);
      }
      ${setupCard} button[data-size="sm"],
      ${scheduled} header:has(h3) button[data-slot="button"][data-size="sm"],
      ${featuredControls} {
        border-radius: ${codex.quietControl.radius};
      }
      ${scheduled} section > pre.rounded[class~="bg-foreground/5"] {
        border-radius: 10px;
      }

      /* The working session arc has zero standoff. Follow the painted row. */
      ${sessionArc} { border-radius: inherit; }

      /* The board's left status border is 2px while its other sides are 1px. */
      ${kanbanCard} { border-radius: 10px; }
      ${kanbanCard} > .kanban-arc { inset: -1px -1px -1px -2px; }

      ${tour} { border-radius: var(--hcv-dropdown-radius); }
      ${tour} .driver-popover-footer-btn { border-radius: ${codex.quietControl.radius}; }
    }
  `
  document.head.append(sheet)
  ctx.onDispose(() => sheet.remove())
}
