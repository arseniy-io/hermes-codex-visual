// Exact built-in gateway messages that Hermes also shows as a raw toast.
// Other server errors and all diagnostic details remain untouched.
const messages = new Map([
  ['The gateway is running a turn in this chat and did not confirm your message in time. It may already be queued there: check the chat before sending it again.',
    'Hermes не подтвердил отправку вовремя. Сообщение уже может быть в очереди. Проверьте чат, прежде чем отправлять его снова.'],
  ['The gateway is running a turn in this chat and a rewind or attachment cannot join its queue. Nothing was sent. Send it again when the current turn ends.',
    'В этом чате уже выполняется запрос. Возврат к прошлому состоянию или вложение нельзя добавить в очередь. Ничего не отправлено. Повторите отправку после завершения запроса.'],
  ['The gateway is running a turn in this chat and this kind of message cannot join its queue. Nothing was sent. Send it again when the current turn ends.',
    'В этом чате уже выполняется запрос. Такое сообщение нельзя добавить в очередь. Ничего не отправлено. Повторите отправку после завершения запроса.'],
  ['The gateway is running a turn in this chat and an image cannot join its queue, so it was removed from this message. Nothing was sent. Send it again when the current turn ends.',
    'В этом чате уже выполняется запрос. Изображение нельзя добавить в очередь, поэтому оно удалено из сообщения. Ничего не отправлено. Повторите отправку после завершения запроса.'],
])

export const translateSystemToast = value => messages.get(value) || value

export function registerSystemToastRussian(ctx) {
  const root = document.documentElement
  const regions = new Map()
  const changes = new Map()
  let watching = false

  function visit(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    if (!element?.isConnected) return
    const selector = '[role="alert"] p, [role="status"] p'
    const targets = element.matches(selector) ? [element] : []
    if (node.nodeType === Node.ELEMENT_NODE) targets.push(...element.querySelectorAll(selector))
    for (const target of targets) {
      if (target.childNodes.length !== 1 || target.firstChild.nodeType !== Node.TEXT_NODE) continue
      const text = target.firstChild
      const previous = changes.get(text)
      if (previous?.shown === text.data) continue
      if (previous) changes.delete(text)
      const original = text.data
      const shown = translateSystemToast(original)
      if (shown !== original) {
        changes.set(text, { original, shown })
        text.data = shown
      }
    }
  }

  function syncRegions() {
    if (!watching) return
    const found = new Set([...document.body.children].filter(element =>
      element.matches('[role="region"][aria-label="Уведомления"], [role="region"][aria-label="Notifications"]')))
    for (const [region, observer] of regions) if (!found.has(region)) { observer.disconnect(); regions.delete(region) }
    for (const region of found) {
      if (regions.has(region)) continue
      const observer = new MutationObserver(records => {
        let removed = false
        for (const record of records) {
          if (record.type === 'characterData') visit(record.target)
          else {
            removed ||= record.removedNodes.length > 0
            for (const node of record.addedNodes) visit(node)
          }
        }
        if (removed) for (const node of changes.keys()) if (!node.isConnected) changes.delete(node)
      })
      regions.set(region, observer)
      visit(region)
      observer.observe(region, { childList: true, subtree: true, characterData: true })
    }
  }

  const body = new MutationObserver(syncRegions)
  function stop() {
    body.disconnect()
    for (const observer of regions.values()) observer.disconnect()
    regions.clear()
    for (const [node, { original, shown }] of changes) if (node.data === shown) node.data = original
    changes.clear()
  }
  function sync() {
    const enabled = /^ru(?:-|$)/i.test(root.lang)
    if (enabled === watching) return
    watching = enabled
    if (enabled) {
      syncRegions()
      body.observe(document.body, { childList: true })
    } else stop()
  }
  const language = new MutationObserver(sync)
  language.observe(root, { attributes: true, attributeFilter: ['lang'] })
  ctx.onDispose(() => { language.disconnect(); stop() })
  sync()
}
