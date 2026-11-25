// The desktop process supplies these built-in uninstall instructions outside
// the locale catalog. Match exact messages only; never translate paths or data
// received from plugins, servers, chats or the user.
const messages = new Map([
  ['To uninstall, go to Windows Settings → Apps → Installed apps.',
    'Чтобы удалить приложение, откройте в Windows «Параметры» → «Приложения» → «Установленные приложения».'],
  ['This Hermes desktop app was installed by Nix. Uninstall it the same way you installed it: remove hermes-agent from your flake or profile, then rebuild.',
    'Это приложение Hermes установлено через Nix. Удалите hermes-agent из flake или профиля и выполните сборку заново.'],
  ['Another package manager installed this Hermes desktop app. Uninstall it with that package manager, the same way you installed it.',
    'Это приложение Hermes установлено другим менеджером пакетов. Удалите его тем же способом, которым установили.'],
  ['Delete the Hermes AppImage (or app directory) from wherever you saved it.',
    'Удалите сохранённый AppImage Hermes или папку приложения.'],
])

export const translateSystemInstruction = value => messages.get(value) || value

export function registerSystemStaticRussian(ctx) {
  const root = document.documentElement
  const changes = new Map()
  let watching = false

  function visit(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    if (!element?.isConnected) return
    const targets = element.matches('[data-overlay-surface] main p') ? [element] : []
    if (node.nodeType === Node.ELEMENT_NODE) targets.push(...element.querySelectorAll('[data-overlay-surface] main p'))
    for (const target of targets) {
      if (target.childNodes.length !== 1 || target.firstChild.nodeType !== Node.TEXT_NODE) continue
      const text = target.firstChild
      const previous = changes.get(text)
      if (previous?.shown === text.data) continue
      if (previous) changes.delete(text)
      const original = text.data
      const shown = translateSystemInstruction(original)
      if (shown !== original) {
        changes.set(text, { original, shown })
        text.data = shown
      }
    }
  }

  const content = new MutationObserver(records => {
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

  function stop() {
    content.disconnect()
    for (const [node, { original, shown }] of changes) if (node.data === shown) node.data = original
    changes.clear()
  }

  function sync() {
    let about = false
    try {
      const route = new URL(location.hash.slice(1), 'https://local.invalid')
      about = route.pathname === '/settings' && route.searchParams.get('tab') === 'about'
    } catch { /* No settings route. */ }
    const enabled = /^ru(?:-|$)/i.test(root.lang) && about
    if (enabled === watching) return
    watching = enabled
    if (enabled) {
      visit(document.body)
      content.observe(document.body, { childList: true, subtree: true, characterData: true })
    } else stop()
  }

  const language = new MutationObserver(sync)
  language.observe(root, { attributes: true, attributeFilter: ['lang'] })
  ctx.addEventListener(window, 'hashchange', sync)
  ctx.addEventListener(window, 'popstate', sync)
  if (window.navigation) ctx.addEventListener(window.navigation, 'currententrychange', sync)
  ctx.onDispose(() => { language.disconnect(); stop() })
  sync()
}
