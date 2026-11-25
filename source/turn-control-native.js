// Hermes user-message.tsx/UserBubbleActions renders its single Stop only
// while showStop is true. Prove that native component, never its translated label.
export function nativeBubbleStop(button, readFiber) {
  if (!button?.matches('button[type="button"]')) return false
  const message = button.closest('[data-slot="aui_user-message-root"]')
  if (!message) return false
  for (let fiber = readFiber(button); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (props?.showStop === true && typeof props.onCancel === 'function' &&
        typeof props.messageId === 'string' && typeof props.fullText === 'string' &&
        typeof props.showRestore === 'boolean' && typeof props.touch === 'boolean') return true
    if (fiber.stateNode === message) break
  }
  return false
}
