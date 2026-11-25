import { createElement as h } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@hermes/plugin-sdk'

// Keep Hermes' own menu behaviour (keyboard, dismissal, and focus restoration)
// while presenting the same compact grouping control as Codex.
export function UsageGroupSelect({ value, onChange, labels, label }) {
  const keys = ['feature', 'model', 'surface', 'trigger']
  return h(DropdownMenu, { modal: false },
    h(DropdownMenuTrigger, { asChild: true },
      h('button', { type: 'button', 'data-u-group-trigger': '', 'aria-label': `${label}: ${labels[value]}` },
        h('span', null, labels[value]),
        h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'm4 6 4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })))),
    h(DropdownMenuContent, { align: 'start', sideOffset: 6, collisionPadding: 8,
      'data-hcv-usage-group-menu': '', 'aria-label': label },
    keys.map(key => h(DropdownMenuItem, { key, role: 'menuitemradio', 'aria-checked': value === key,
      'data-hcv-usage-group-item': '', textValue: labels[key], onSelect: () => onChange(key) },
      h('span', null, labels[key]),
      value === key && h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'm3.5 8 3 3 6-6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))))))
}
