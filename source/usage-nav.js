import { host, pluginSettingsHref } from '@hermes/plugin-sdk'

// Codex 26.1111.2228.0, 220029.8f1e1490d7.js, nVNB: gauge-light-16.
const gauge = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.00122 1.47461C8.75515 1.47463 9.48307 1.59081 10.1672 1.80664C10.4438 1.89388 10.5972 2.18931 10.51 2.46582C10.4228 2.74215 10.1282 2.89554 9.85181 2.80859C9.26859 2.62459 8.64681 2.52541 8.00122 2.52539C4.60867 2.52539 1.85864 5.27542 1.85864 8.66797C1.8587 10.2884 2.48561 11.7614 3.51099 12.8594C3.70857 13.0713 3.69728 13.4037 3.4856 13.6016C3.27377 13.7994 2.94134 13.7878 2.74341 13.5762C1.54365 12.2914 0.807916 10.5649 0.807861 8.66797C0.807861 4.69552 4.02877 1.47461 8.00122 1.47461Z" fill="currentColor"/><path d="M14.2219 6.20605C14.499 6.12104 14.7931 6.27662 14.8782 6.55371C15.0836 7.22275 15.1936 7.93312 15.1936 8.66797C15.1936 10.5648 14.4588 12.2914 13.259 13.5762C13.0611 13.7879 12.7287 13.7994 12.5168 13.6016C12.3051 13.4037 12.2938 13.0713 12.4915 12.8594C13.5168 11.7614 14.1437 10.2884 14.1438 8.66797C14.1438 8.03884 14.0493 7.43252 13.8743 6.8623C13.7892 6.58519 13.9449 6.29124 14.2219 6.20605Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M11.8665 4.08203C12.0714 3.87724 12.4046 3.87721 12.6096 4.08203C12.8143 4.28693 12.8141 4.61924 12.6096 4.82422L9.77368 7.65918C9.94335 7.95688 10.0413 8.30086 10.0413 8.66797C10.0411 9.79469 9.12794 10.7079 8.00122 10.708C6.8744 10.708 5.96032 9.79476 5.96021 8.66797C5.96021 7.54108 6.87433 6.62695 8.00122 6.62695C8.37948 6.62699 8.73272 6.73163 9.03638 6.91113L11.8665 4.08203ZM8.00122 7.67773C7.45423 7.67773 7.01099 8.12098 7.01099 8.66797C7.0111 9.21486 7.4543 9.6582 8.00122 9.6582C8.54804 9.65809 8.99134 9.21479 8.99146 8.66797C8.99146 8.12105 8.54811 7.67785 8.00122 7.67773Z" fill="currentColor"/></svg>`

const href = () => pluginSettingsHref('hermes-codex-visual:usage')
const selected = () => {
  const [path, query = ''] = location.hash.slice(1).split('?')
  const params = new URLSearchParams(query)
  return path === '/settings' && params.get('tab') === 'plugins' &&
    params.get('plugin') === 'hermes-codex-visual:usage'
}
const label = () => document.documentElement.lang.toLowerCase().startsWith('ru') ? 'Использование' : 'Usage'

function makeButton(kind) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'row-hover flex h-7 w-full shrink-0 items-center justify-start gap-2 rounded-md border px-2 text-left'
  button.dataset.hcvUsageNav = kind
  button.dataset.tour = 'hcv-usage-nav'
  button.innerHTML = gauge + '<span class="min-w-0 flex-1 truncate"></span>'
  button.addEventListener('click', () => host.navigate(href()))
  return button
}

// The SDK owns the page and routing. This adapter adds the requested rail
// position without mutating Hermes's underlying navigation or settings data.
export function registerUsageNavigation(ctx, active) {
  const root = document.documentElement
  let disposed = false
  let queued = false
  let observer
  let observed = null
  function observe(target) {
    if (observed === target) return
    observer.disconnect()
    observed = target
    if (target) observer.observe(target, { subtree: true, childList: true })
  }
  function sync() {
    queued = false
    if (disposed) return
    const inSettings = location.hash.startsWith('#/settings')
    const enabled = root.matches(active) && inSettings
    root.toggleAttribute('data-hcv-usage-active', enabled && selected())
    if (!enabled) {
      observe(null)
      document.querySelectorAll('[data-hcv-usage-nav]').forEach(node => node.remove())
      return
    }
    const overlay = document.querySelector('[data-overlay-surface]:has([data-tour="overlay-nav"])')
    observe(overlay || document.body)
    const rail = overlay?.querySelector('[data-tour="overlay-nav"]')
    const sessions = rail?.querySelector('[data-tour="nav-sessions"]')
    if (rail && sessions) {
      let button = rail.querySelector('[data-hcv-usage-nav="rail"]')
      if (!button) button = makeButton('rail')
      const wrapper = sessions.parentElement
      const controlled = wrapper?.querySelector('[data-tour="nav-toggle-sessions"]')?.getAttribute('aria-controls')
      const child = controlled && wrapper?.nextElementSibling?.id === controlled ? wrapper.nextElementSibling : null
      const after = child || wrapper
      if (after && after.nextElementSibling !== button) after.after(button)
      const text = button.querySelector('span')
      if (text.textContent !== label()) text.textContent = label()
      if (selected()) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    // On narrow windows Hermes's own menu includes the registered page.
  }
  function schedule() {
    if (queued || disposed) return
    queued = true
    queueMicrotask(sync)
  }
  observer = new MutationObserver(schedule)
  const themeObserver = new MutationObserver(schedule)
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'data-hcv-screen', 'lang'] })
  ctx.addEventListener(window, 'hashchange', schedule)
  ctx.addEventListener(window, 'popstate', schedule)
  if (window.navigation) ctx.addEventListener(window.navigation, 'currententrychange', schedule)
  ctx.onDispose(() => {
    disposed = true
    observer.disconnect()
    themeObserver.disconnect()
    root.removeAttribute('data-hcv-usage-active')
    document.querySelectorAll('[data-hcv-usage-nav]').forEach(node => node.remove())
  })
  sync()
}
