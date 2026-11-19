import { codexMask, codexReference as codex, localAssets, svgMask } from './codex-reference.js'
import { mountCSS } from './style-scope.js'

// Codex Desktop 26.1111.2228.0: F1Ti in 907538.0572f09d40.js.
const ZOOM_BASE = 1.2
const ZOOM_STEP = 0.1
const MIN_FACTOR = 0.5
const MAX_FACTOR = 3
const DISMISS_DELAY = 2000
const EXIT_TIME = 150

const minusFallback = svgMask('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>')
const minusMask = localAssets?.icons?.imagePreviewMinus ? svgMask(localAssets.icons.imagePreviewMinus) : minusFallback
const plusMask = localAssets?.icons?.imagePreviewPlus ? svgMask(localAssets.icons.imagePreviewPlus) : codexMask('plus')

export function registerZoomBanner(ctx, active, themeName) {
  const zoom = window.hermesDesktop?.zoom
  if (!zoom?.get || !zoom?.setPercent || !zoom?.onChanged) return

  const root = document.documentElement
  const layerSelector = `${active} [data-hcv-zoom-layer]`
  const bannerSelector = `${layerSelector} [data-hcv-zoom-banner]`
  mountCSS(ctx, 'data-hcv-zoom-styles', `
    ${layerSelector} {
      position: fixed; top: 8px; z-index: 90; display: flex; justify-content: flex-end;
      pointer-events: none; opacity: 1; transform: translateY(0);
      transition: opacity 150ms ease-out, transform 150ms ease-out;
      -webkit-app-region: no-drag;
    }
    ${layerSelector}[data-state="exiting"] { opacity: 0; transform: translateY(-4px); }
    ${bannerSelector} {
      box-sizing: border-box; display: inline-flex; align-items: center; height: 44px;
      overflow: hidden; padding: 0 8px; border: .5px solid; border-radius: 20px;
      pointer-events: auto; white-space: nowrap; font: 400 13px / 1 ${codex.font};
      box-shadow: 0 8px 16px -4px rgba(0, 0, 0, .12);
      animation: hcv-zoom-enter 150ms ${codex.enter} both;
    }
    ${bannerSelector} [data-hcv-zoom-value] {
      display: inline-block; flex: none; width: 48px; text-align: center;
      font: 600 13px / 1.428571 ${codex.font}; font-variant-numeric: tabular-nums;
    }
    ${bannerSelector} [data-hcv-zoom-controls] { display: flex; align-items: center; margin-inline-start: 4px; }
    ${bannerSelector} button {
      box-sizing: border-box; display: inline-flex; flex: none; align-items: center;
      justify-content: center; height: 28px; padding: 0 8px; border: 0; border-radius: 6px;
      background: transparent; font: 400 13px / 1 ${codex.font}; cursor: pointer;
    }
    ${bannerSelector} button[data-hcv-zoom-step] { width: 28px; padding: 0; }
    ${bannerSelector} button[data-hcv-zoom-step]::before {
      content: ''; display: block; width: 16px; height: 16px; background: currentColor;
      mask: ${minusMask} center / contain no-repeat;
    }
    ${bannerSelector} button[data-hcv-zoom-step="in"]::before { mask-image: ${plusMask}; }
    ${bannerSelector} [data-hcv-zoom-separator] { flex: none; width: 1px; height: 16px; margin: 0 4px; background: currentColor; opacity: .12; }
    ${bannerSelector} button:disabled { opacity: .5; cursor: default; }
    ${bannerSelector} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 2px; }
    @media (forced-colors: none) {
      ${bannerSelector} { color: light-dark(#0d0d0d, #ededed); background: light-dark(#f9f9f9, #181818); border-color: light-dark(#0d0d0d1a, #ffffff1f); }
      ${bannerSelector} button { color: light-dark(#8f8f8f, #8f8f8f); }
      ${bannerSelector} button:not(:disabled):hover { background: light-dark(#0d0d0d0f, #ffffff0f); }
    }
    @media (prefers-reduced-motion: reduce) {
      ${layerSelector} { transition: none; }
      ${layerSelector}[data-state="exiting"] { transform: none; }
      ${bannerSelector} { animation: none; }
    }
    @keyframes hcv-zoom-enter {
      from { opacity: 0; transform: translateY(-4px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `)

  let current = null
  let revision = 0
  let layer = null
  let dismissTimer = null
  let exitTimer = null
  let hovered = false
  let disposed = false

  function clearTimers() {
    clearTimeout(dismissTimer)
    clearTimeout(exitTimer)
    dismissTimer = exitTimer = null
  }

  function remove() {
    clearTimers()
    layer?.remove()
    layer = null
    hovered = false
  }

  function exit() {
    if (!layer) return
    clearTimers()
    layer.dataset.state = 'exiting'
    exitTimer = setTimeout(remove, EXIT_TIME)
  }

  function position() {
    if (!layer) return
    const overlay = navigator.windowControlsOverlay
    const rect = overlay?.visible ? overlay.getTitlebarAreaRect() : null
    const right = rect?.width ? Math.max(0, Math.round(window.innerWidth - rect.right)) : 0
    layer.style.right = `${16 + right}px`
  }

  function update() {
    if (!layer || !current) return
    layer.querySelector('[data-hcv-zoom-value]').textContent = `${current.percent}%`
    layer.querySelector('[data-hcv-zoom-reset]').disabled = Math.abs(current.level) < 1e-9
  }

  function create() {
    const ru = root.matches(':lang(ru)')
    layer = document.createElement('div')
    layer.dataset.hcvZoomLayer = ''
    layer.dataset.state = 'visible'
    const banner = document.createElement('div')
    banner.dataset.hcvZoomBanner = ''
    const value = document.createElement('span')
    value.dataset.hcvZoomValue = ''
    value.setAttribute('aria-live', 'polite')
    const controls = document.createElement('div')
    controls.dataset.hcvZoomControls = ''
    for (const [direction, label] of [['out', ru ? 'Уменьшить' : 'Zoom out'], ['in', ru ? 'Увеличить' : 'Zoom in']]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.hcvZoomStep = direction
      button.setAttribute('aria-label', label)
      button.addEventListener('click', () => step(direction === 'in' ? 1 : -1))
      controls.append(button)
    }
    const separator = document.createElement('span')
    separator.dataset.hcvZoomSeparator = ''
    separator.setAttribute('aria-hidden', 'true')
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.dataset.hcvZoomReset = ''
    reset.textContent = ru ? 'Сбросить' : 'Reset'
    reset.addEventListener('click', () => { zoom.setPercent(100); show() })
    banner.addEventListener('mouseenter', () => { hovered = true })
    banner.addEventListener('mouseleave', () => {
      hovered = false
      if (dismissTimer === null && layer?.dataset.state === 'visible') exit()
    })
    banner.append(value, controls, separator, reset)
    layer.append(banner)
    document.body.append(layer)
    position()
  }

  function show() {
    if (disposed || root.dataset.hermesTheme !== themeName || !current) return
    if (!layer) create()
    clearTimers()
    layer.dataset.state = 'visible'
    update()
    dismissTimer = setTimeout(() => {
      dismissTimer = null
      if (!hovered) exit()
    }, DISMISS_DELAY)
  }

  function step(direction) {
    if (!current) return
    const factor = Math.pow(ZOOM_BASE, current.level)
    const target = Math.round(100 * Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor + ZOOM_STEP * direction)))
    zoom.setPercent(target)
    show()
  }

  const off = zoom.onChanged(state => {
    if (disposed || !Number.isFinite(state?.level) || !Number.isFinite(state?.percent)) return
    revision++
    const previous = current
    current = state
    update()
    // Hermes emits this event for shortcuts, settings, and zoom restoration.
    // Ignore identical restoration events instead of inventing an input source.
    if (previous && Math.abs(previous.level - state.level) > 1e-9) show()
  })
  void zoom.get().then(state => {
    if (!disposed && revision === 0 && Number.isFinite(state?.level) && Number.isFinite(state?.percent)) current = state
  }).catch(() => {})
  const themeObserver = new MutationObserver(() => { if (root.dataset.hermesTheme !== themeName) remove() })
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })
  ctx.addEventListener(window, 'resize', position)
  const overlay = navigator.windowControlsOverlay
  overlay?.addEventListener('geometrychange', position)
  ctx.onDispose(() => {
    disposed = true
    off?.()
    overlay?.removeEventListener('geometrychange', position)
    themeObserver.disconnect()
    remove()
  })
}
