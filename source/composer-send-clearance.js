import { composerChatSurface, composerCompletionDrawer, composerQueuedEdit, composerRichInput,
  composerRoot } from './composer-native.js'
import { nativeSessionView } from './sidebar-session-state.js'

const dockedComposer = '[data-slot="composer-dock"]:not([data-popped-out])'
const spacerSelector = '[data-slot="aui_composer-clearance"]'
const sendButton = 'button[type="submit"]:enabled:has(> .codicon-arrow-up)'
const turnPair = '[data-slot="aui_turn-pair"]'
const responseGroup = '[data-slot="aui_response-group"]'
const hiddenSurface = '[hidden], [data-pane-hidden], [data-hud-shell]'
const maxHoldMs = 1200

export function registerComposerSendClearance(ctx, { enabled, viewportSelector, promptSelector }) {
  const held = new Map()
  const view = document.defaultView

  function onSend(event) {
    if (!event.isTrusted || event.defaultPrevented || !enabled() || !(event.target instanceof Element)) return
    let form = event.target
    if (event.type === 'keydown') {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey ||
          event.repeat || event.isComposing || event.keyCode === 229) return
      form = form.closest(composerRichInput)?.closest(composerRoot)
      if (form?.querySelector(composerCompletionDrawer)) return
    }
    if (!form?.matches(composerRoot) || form.querySelector(composerQueuedEdit)) return
    const submit = event.type === 'submit' ? event.submitter : form.querySelector(sendButton)
    if (!submit?.matches(sendButton)) return

    const surface = form.closest(dockedComposer)?.closest(composerChatSurface)
    if (!surface || surface.closest(hiddenSurface)) return
    const viewport = surface.querySelector(viewportSelector)
    const spacer = viewport?.querySelector(spacerSelector)
    const height = surface.style.getPropertyValue('--hcv-composer-surface-height')
    if (viewport?.dataset.following !== 'true' || !spacer || !height) return
    const session = nativeSessionView(surface)?.view
    if (session?.$busy?.get() !== false || !session.$storedId.get()) return
    const latestPrompt = () => [...viewport.querySelectorAll(promptSelector)].at(-1)
    const priorPrompt = latestPrompt()
    if (!priorPrompt) return
    const priorId = priorPrompt.dataset.messageId

    held.get(surface)?.release()
    if (spacer.style.minBlockSize) return
    // The draft and the previous response can lose height before the new
    // prompt mounts. Hold their current space while native scroll follow owns
    // the viewport. chat-display.js adds 32px to the measured composer.
    const lastResponse = priorPrompt.closest(turnPair)?.querySelector(`:scope > ${responseGroup}`)
    const responseHeight = lastResponse?.offsetHeight
    spacer.style.minBlockSize = `calc(${height} + 32px)`
    const applied = [[spacer, spacer.style.minBlockSize]]
    if (responseHeight && !lastResponse.style.minBlockSize) {
      lastResponse.style.minBlockSize = `${responseHeight}px`
      applied.push([lastResponse, lastResponse.style.minBlockSize])
    }
    const release = () => {
      observer.disconnect()
      view.clearTimeout(timeout)
      unlisten()
      for (const [node, size] of applied) {
        if (node.style.minBlockSize === size) node.style.removeProperty('min-block-size')
      }
      held.delete(surface)
    }
    const observer = new MutationObserver(records => {
      if (viewport.dataset.following !== 'true') return release()
      const newPrompt = records.some(record => record.attributeName === 'data-message-id' ||
        [...record.addedNodes].some(node => node instanceof Element &&
          (node.matches(promptSelector) || node.querySelector(promptSelector))))
      if (!newPrompt) return
      const id = latestPrompt()?.dataset.messageId
      if (id !== priorId && id?.startsWith('user-')) release()
    })
    const timeout = view.setTimeout(release, maxHoldMs)
    const unlisten = session.$storedId.listen(release)
    observer.observe(viewport, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-message-id', 'data-following'] })
    held.set(surface, { release, spacer })
  }

  ctx.addEventListener(document, 'keydown', onSend, true)
  ctx.addEventListener(document, 'submit', onSend, true)
  ctx.onDispose(() => { for (const { release } of held.values()) release() })
  return () => {
    for (const [surface, { release, spacer }] of held) {
      if (!enabled() || !spacer.isConnected || surface.closest(hiddenSurface)) release()
    }
  }
}
