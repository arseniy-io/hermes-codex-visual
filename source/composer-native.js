export const composerRoot = 'form[data-slot="composer-root"]'
export const composerCompletionDrawer = '[data-slot="composer-completion-drawer"][role="listbox"]'
export const composerQueuedEdit = '[data-slot="composer-surface"] [class~="bg-accent/18"]:has(> div > button + button)'
export const composerStopButton = 'button[type="submit"]:has(> span[class~="size-2.5"][class~="bg-current"])'
export const composerRichInput = '[data-slot="composer-rich-input"][contenteditable="true"]'
export const composerVoiceStartIcon = 'svg.tabler-icon-wave-sine'
export const composerVoiceStartGroup = `[data-slot="composer-surface"] span:has(> button[type="button"] > ${composerVoiceStartIcon})`

export const composerChatSurface = '[data-chat-surface]:is([data-composer-target="main"], [data-composer-target^="tile:"])'
const floatingHost = '[data-composer-owner][data-floating-composer-target]'

export function composerAwaitingInput(form, readFiber) {
  const target = form.closest(floatingHost)?.dataset.floatingComposerTarget
    ?? form.closest('[data-composer-target]')?.dataset.composerTarget
  if (!target) return false
  for (let fiber = readFiber(form); fiber; fiber = fiber.return) {
    for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
      const scope = dependency.memoizedValue
      if (scope?.target === target && scope.attachments && typeof scope.$messages?.get === 'function' &&
          typeof scope.$awaitingInput?.get === 'function') return scope.$awaitingInput.get() === true
    }
  }
  return false
}

function floatingOwnerMatches(host, surface) {
  return host?.dataset.composerOwner && host.dataset.composerOwner === surface.dataset.composerSurfaceId &&
    host.dataset.floatingComposerTarget === surface.dataset.composerTarget
}

export function surfaceForComposer(form) {
  if (!form?.matches(composerRoot)) return null
  const attached = form.closest(composerChatSurface)
  if (attached) return attached
  const host = form.closest(floatingHost)
  if (!host) return null
  // Hermes keeps the same composer mounted when its portal moves to body.
  const matches = [...form.ownerDocument.querySelectorAll(composerChatSurface)].filter(surface => floatingOwnerMatches(host, surface))
  return matches.length === 1 ? matches[0] : null
}

export function composerForSurface(surface) {
  const attached = surface.querySelector(composerRoot)
  if (attached) return attached
  const matches = [...surface.ownerDocument.querySelectorAll(floatingHost)].filter(host => floatingOwnerMatches(host, surface))
  return matches.length === 1 ? matches[0].querySelector(composerRoot) : null
}
