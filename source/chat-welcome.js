import { createElement as h, useSyncExternalStore } from 'react'
import { CHAT_EMPTY_AREA, host, useTheme, Wordmark } from '@hermes/plugin-sdk'

// Hermes owns the intro preference and the lettering. The empty-chat slot is
// mounted only while the transcript is empty and removes its children on send.
const introEnabled = () => host.settings.get('intro-splash.v1')
const subscribeIntro = change => host.settings.subscribe('intro-splash.v1', change)

function ProjectChatWelcome() {
  const enabled = useSyncExternalStore(subscribeIntro, introEnabled, introEnabled)
  const { themeName } = useTheme()
  if (!enabled || themeName !== 'codex-workspace') return null
  return h('div', {
    'data-slot': 'aui_intro',
    'data-hcv-project-welcome': '',
    style: { display: 'none' },
    className: 'pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8',
  }, h('div', { className: 'w-full min-w-0' },
    h(Wordmark, { className: 'mb-1', text: 'HERMES AGENT' }),
    // Reserve the same two-line space as Hermes's rotating introduction.
    // The selected text and personality are not exposed by the host SDK.
    h('p', { className: 'm-0 text-center leading-normal tracking-tight', 'aria-hidden': 'true' }),
  ))
}

export function registerProjectChatWelcome(ctx) {
  ctx.register({
    id: 'project-chat-welcome',
    area: CHAT_EMPTY_AREA,
    data: { render: () => h(ProjectChatWelcome) },
  })
}
