import { codexMask, codexReference } from './codex-reference.js'
import { movedElementMatches } from './dom-changes.js'
import { mountCSS } from './style-scope.js'

const cardSelector = '[data-hcv-video]'
const rates = [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2]
const labels = {
  ru: {
    play: 'Воспроизвести видео', pause: 'Приостановить воспроизведение видео',
    seek: 'Перемотка видео', volume: 'Громкость видео', mute: 'Отключить звук видео',
    options: 'Настройки видео', speed: 'Скорость воспроизведения', save: 'Сохранить видео как…',
    pictureInPicture: 'Картинка в картинке', fullscreen: 'Во весь экран',
    exitFullscreen: 'Выйти из полноэкранного режима', video: 'Видео',
    error: 'Не удалось выполнить это действие с видео. Попробуйте снова.',
  },
  en: {
    play: 'Play video', pause: 'Pause video', seek: 'Seek in video', volume: 'Video volume',
    mute: 'Mute video', options: 'Video options', speed: 'Playback speed', save: 'Save video as…',
    pictureInPicture: 'Picture in picture', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
    video: 'Video', error: 'Could not complete this video action. Try again',
  },
}

function element(tag, className) {
  const el = document.createElement(tag)
  el.className = className
  return el
}

function control(label, icon) {
  const el = element('button', 'hcv-video-button')
  el.type = 'button'
  el.dataset.icon = icon
  el.setAttribute('aria-label', label)
  return el
}

function range(label, max, step) {
  const el = element('input', 'hcv-video-range')
  el.type = 'range'
  el.min = '0'
  el.max = max
  el.step = step
  el.setAttribute('aria-label', label)
  return el
}

function setRange(el, value, max, description) {
  el.value = value
  el.style.setProperty('--hcv-video-position', el.valueAsNumber / max)
  el.setAttribute('aria-valuetext', description)
}

function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function popover(trigger, className, label, role) {
  const panel = element('span', `hcv-video-popover ${className}`)
  panel.setAttribute('popover', 'auto')
  panel.setAttribute('aria-label', label)
  trigger.setAttribute('aria-haspopup', role)
  trigger.setAttribute('aria-expanded', 'false')
  trigger.popoverTargetElement = panel
  return panel
}

function menuItem(label, role = 'menuitem') {
  const item = element('button', 'hcv-video-menu-item')
  item.type = 'button'
  item.tabIndex = -1
  item.setAttribute('role', role)
  item.textContent = label
  return item
}

function saveVideo(video, filename) {
  const url = video.currentSrc || video.src
  if (!url) throw new Error('Missing video source')
  const src = new URL(url, document.baseURI)
  if (src.protocol === 'hermes-media:' && window.hermesDesktop?.saveGatewayFile) {
    const params = src.searchParams
    return window.hermesDesktop.saveGatewayFile({
      path: decodeURIComponent(src.pathname.slice(1)),
      connectionId: params.get('connectionId') || (src.hostname === 'stream' ? 'local' : undefined),
      profile: params.get('profile') || undefined,
      sessionId: params.get('sessionId') || undefined,
      suggestedName: filename,
    })
  }
  const sameOrigin = /^(https?):$/.test(src.protocol) && src.origin === location.origin
  if (!sameOrigin && src.protocol !== 'blob:' && !/^data:video\//i.test(url)) {
    throw new Error('Video download source is unavailable')
  }
  const link = document.createElement('a')
  link.href = src.href
  link.download = filename
  link.click()
}

function attachPlayer(card, video) {
  const controller = new AbortController()
  const { signal } = controller
  let locale = /^ru\b/i.test(document.documentElement.lang) ? 'ru' : 'en'
  let copy = labels[locale]
  let formatPercent = new Intl.NumberFormat(locale, { style: 'percent' })
  let formatRate = new Intl.NumberFormat(locale)
  const nativeTitle = card.firstElementChild
  const filename = () => nativeTitle?.textContent.trim() || copy.video
  const nativeAttrs = ['controls', 'tabindex', 'preload', 'aria-label']
    .map(name => [name, video.getAttribute(name)])

  const controls = element('span', 'hcv-video-controls')
  const row = element('span', 'hcv-video-row')
  const actions = element('span', 'hcv-video-actions')
  const time = element('span', 'hcv-video-time')
  const status = element('span', 'hcv-video-status')
  status.setAttribute('role', 'status')
  status.hidden = true
  status.textContent = copy.error

  const play = control(copy.play, 'play')
  const seek = range(copy.seek, 1, .1)
  const volume = control(copy.volume, 'volume')
  const mute = control(copy.mute, 'volume')
  const volumeRange = range(copy.volume, 1, .01)
  const sound = popover(volume, 'hcv-video-sound', copy.volume, 'dialog')
  sound.append(mute, volumeRange)

  const options = control(copy.options, 'more')
  const menu = popover(options, 'hcv-video-menu', copy.options, 'menu')
  const save = menuItem(copy.save)
  const separator = document.createElement('hr')
  separator.setAttribute('role', 'separator')
  const heading = element('span', 'hcv-video-menu-label')
  heading.textContent = copy.speed
  const speedItems = rates.map(rate => menuItem(`${formatRate.format(rate)}×`, 'menuitemradio'))
  const items = [save, ...speedItems]
  menu.append(save, separator, heading, ...speedItems)
  const pip = document.pictureInPictureEnabled && !video.disablePictureInPicture
    ? menuItem(copy.pictureInPicture) : null
  if (pip) {
    menu.append(pip)
    items.push(pip)
  }

  const fullscreen = control(copy.fullscreen, 'fullscreen')
  actions.append(volume, sound, options, menu)
  if (document.fullscreenEnabled) actions.append(fullscreen)
  row.append(play, seek, time, actions)
  controls.append(row, status)
  video.after(controls)
  card.setAttribute('data-hcv-video', '')
  video.controls = false
  video.tabIndex = 0
  video.preload = 'metadata'
  video.setAttribute('aria-label', filename())

  const listen = (el, type, fn, extra) => el.addEventListener(type, fn, { signal, ...extra })
  const duration = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  let drag = null
  let wasFullscreen = false

  async function run(action) {
    status.hidden = true
    try {
      await action()
    } catch {
      status.hidden = false
    }
  }

  function updateTime() {
    const total = duration()
    const current = Math.min(video.currentTime, total)
    const progress = `${clock(current)} / ${clock(total)}`
    if (time.textContent !== progress) time.textContent = progress
    seek.max = total || 1
    seek.disabled = !total
    setRange(seek, current, total || 1, progress)
  }

  function updatePlayback() {
    const playing = !video.paused && !video.ended
    play.dataset.icon = playing ? 'pause' : 'play'
    play.setAttribute('aria-label', playing ? copy.pause : copy.play)
  }

  function updateVolume() {
    const level = video.muted ? 0 : video.volume
    volume.dataset.icon = mute.dataset.icon = level === 0 ? 'muted' : 'volume'
    mute.setAttribute('aria-pressed', video.muted)
    setRange(volumeRange, level, 1, formatPercent.format(level))
  }

  function updateSpeed() {
    for (const [i, item] of speedItems.entries()) item.setAttribute('aria-checked', video.playbackRate === rates[i])
  }

  function localize() {
    locale = /^ru\b/i.test(document.documentElement.lang) ? 'ru' : 'en'
    copy = labels[locale]
    formatPercent = new Intl.NumberFormat(locale, { style: 'percent' })
    formatRate = new Intl.NumberFormat(locale)
    status.textContent = copy.error
    seek.setAttribute('aria-label', copy.seek)
    volume.setAttribute('aria-label', copy.volume)
    mute.setAttribute('aria-label', copy.mute)
    volumeRange.setAttribute('aria-label', copy.volume)
    sound.setAttribute('aria-label', copy.volume)
    options.setAttribute('aria-label', copy.options)
    menu.setAttribute('aria-label', copy.options)
    save.textContent = copy.save
    heading.textContent = copy.speed
    for (const [i, item] of speedItems.entries()) item.textContent = `${formatRate.format(rates[i])}×`
    if (pip) pip.textContent = copy.pictureInPicture
    const full = document.fullscreenElement === card
    fullscreen.setAttribute('aria-label', full ? copy.exitFullscreen : copy.fullscreen)
    video.setAttribute('aria-label', filename())
    if (full) card.setAttribute('aria-label', filename())
    updatePlayback()
    updateVolume()
  }

  const togglePlayback = () => void run(() => video.paused ? video.play() : video.pause())
  listen(video, 'click', event => {
    event.preventDefault()
    togglePlayback()
  })
  listen(video, 'keydown', event => {
    if (event.key !== ' ' && event.code !== 'Space' && event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) togglePlayback()
  })
  listen(play, 'click', togglePlayback)
  listen(seek, 'input', () => {
    video.currentTime = seek.valueAsNumber
    updateTime()
  })
  listen(seek, 'pointerdown', event => {
    if (seek.disabled || event.button !== 0 || drag) return
    drag = { pointerId: event.pointerId, resume: !video.paused }
    seek.setPointerCapture(event.pointerId)
    video.pause()
  })
  function finishSeek(event) {
    if (drag?.pointerId !== event.pointerId) return
    const { resume } = drag
    drag = null
    if (resume) void run(() => video.play())
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(seek, event, finishSeek)
  listen(mute, 'click', () => { video.muted = !video.muted })
  listen(volumeRange, 'input', () => {
    video.volume = volumeRange.valueAsNumber
    video.muted = false
    updateVolume()
  })
  for (const [panel, button, role] of [[sound, volume, 'dialog'], [menu, options, 'menu']]) {
    listen(panel, 'beforetoggle', event => {
      if (event.newState === 'open') panel.setAttribute('role', role)
    })
    listen(panel, 'toggle', () => {
      const open = panel.matches(':popover-open')
      button.setAttribute('aria-expanded', open)
      if (!open) panel.removeAttribute('role')
      else if (panel === menu) items[0].focus({ preventScroll: true })
    })
  }
  listen(menu, 'keydown', event => {
    const index = items.indexOf(document.activeElement)
    let next
    switch (event.key) {
      case 'ArrowDown': next = (index + 1) % items.length; break
      case 'ArrowUp': next = index > 0 ? index - 1 : items.length - 1; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    event.preventDefault()
    items[next].focus({ preventScroll: true })
  })

  function choose(item, action) {
    listen(item, 'click', () => {
      menu.hidePopover()
      options.focus({ preventScroll: true })
      void run(action)
    })
  }
  choose(save, () => saveVideo(video, filename()))
  for (const [i, item] of speedItems.entries()) choose(item, () => { video.playbackRate = rates[i] })
  if (pip) choose(pip, () => document.pictureInPictureElement === video
    ? document.exitPictureInPicture() : video.requestPictureInPicture())

  const toggleFullscreen = () => run(() => document.fullscreenElement === card
    ? document.exitFullscreen() : card.requestFullscreen())
  listen(fullscreen, 'click', toggleFullscreen)
  listen(card, 'fullscreenchange', () => {
    const enabled = document.fullscreenElement === card
    fullscreen.dataset.icon = enabled ? 'exitFullscreen' : 'fullscreen'
    fullscreen.setAttribute('aria-label', enabled ? copy.exitFullscreen : copy.fullscreen)
    if (enabled) {
      card.setAttribute('role', 'dialog')
      card.setAttribute('aria-label', filename())
      video.focus({ preventScroll: true })
    } else if (wasFullscreen) {
      fullscreen.focus({ preventScroll: true })
      card.removeAttribute('role')
      card.removeAttribute('aria-label')
    }
    wasFullscreen = enabled
  })
  listen(card, 'keydown', event => {
    if (event.key !== 'Escape') return
    const panel = [sound, menu].find(el => el.matches(':popover-open'))
    if (!panel && document.fullscreenElement !== card) return
    event.preventDefault()
    event.stopPropagation()
    if (panel) {
      const trigger = panel === sound ? volume : options
      panel.hidePopover()
      trigger.focus({ preventScroll: true })
    } else void toggleFullscreen()
  })

  for (const event of ['durationchange', 'timeupdate', 'loadedmetadata', 'emptied']) listen(video, event, updateTime)
  for (const event of ['play', 'pause', 'ended', 'emptied']) listen(video, event, updatePlayback)
  listen(video, 'volumechange', updateVolume)
  listen(video, 'ratechange', updateSpeed)
  updateTime()
  updatePlayback()
  updateVolume()
  updateSpeed()

  return {
    localize,
    remove() {
      controller.abort()
      if (document.fullscreenElement === card) void document.exitFullscreen().catch(() => {})
      if (wasFullscreen) {
        card.removeAttribute('role')
        card.removeAttribute('aria-label')
      }
      if (drag?.resume && video.isConnected) void video.play().catch(() => {})
      controls.remove()
      card.removeAttribute('data-hcv-video')
      for (const [name, value] of nativeAttrs) {
        if (value === null) video.removeAttribute(name)
        else video.setAttribute(name, value)
      }
    },
  }
}

export function registerChatVideo(ctx, active, selector) {
  if (!HTMLElement.prototype.showPopover || !CSS.supports('bottom', 'anchor(top)')) return
  const card = `${active} ${cardSelector}`
  const iconRules = Object.entries({
    play: 'videoPlay', pause: 'videoPause', volume: 'videoVolume', muted: 'videoMuted',
    more: 'videoMore', fullscreen: 'videoFullscreen', exitFullscreen: 'videoExitFullscreen',
  }).map(([icon, mask]) => `${card} .hcv-video-button[data-icon="${icon}"]::before { mask-image: ${codexMask(mask)}; }`).join('\n')

  // Codex MarkdownVideoPlayer (Mqhc), 759492.83f55c24aa.js.
  mountCSS(ctx, 'data-hcv-chat-video', `
  ${card} {
    --hcv-video-surface: light-dark(#fff, #181818);
    --hcv-video-ink: light-dark(#181818, #dfdfdf);
    --hcv-video-secondary: light-dark(#666, #a1a1a1);
    --hcv-video-track: light-dark(#dedede, #2b2b2b);
    --hcv-video-divider: light-dark(#efefef, #222);
    --hcv-video-thumb: light-dark(#f3f3f3, #282828);
    --hcv-video-thumb-shadow: 0 2px 4px -1px #00000014;
    --hcv-video-ring: light-dark(#0169cc, #0285ff);
    --hcv-video-hover: light-dark(#eeeeee, #292929);
    --hcv-video-menu-surface: light-dark(#fff, #2d2d2d);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: fit-content;
    min-inline-size: min(100%, 14rem);
    max-inline-size: min(100%, 44rem);
    max-block-size: min(48vh, 32rem);
    margin-block: 12px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--hcv-video-surface);
    box-shadow: 0 2px 4px -1px #00000014;
    anchor-scope: --hcv-video-volume-anchor, --hcv-video-options-anchor;
  }
  ${card} > span:first-child { display: none; }
  ${card} > video {
    display: block;
    flex: 1 1 auto;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: auto;
    min-block-size: 0;
    max-block-size: none;
    margin: 0;
    border-radius: 8px 8px 0 0;
    background: transparent;
    object-fit: contain;
    cursor: pointer;
  }
  ${card}:fullscreen {
    inline-size: 100%;
    block-size: 100%;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
  }
  ${card}:fullscreen > video { border-radius: 0; }
  ${card} .hcv-video-controls {
    container: hcv-video-controls / inline-size;
    flex: none;
    border-block-start: 1px solid var(--hcv-video-divider);
    color: var(--hcv-video-secondary);
    font: 400 12px/16px var(--hcv-ui-font);
    user-select: none;
  }
  ${card} .hcv-video-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
    block-size: 40px;
    padding-inline: 8px;
  }
  ${card} .hcv-video-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    margin-inline-start: auto;
  }
  ${card} .hcv-video-time { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  ${card} .hcv-video-button {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    inline-size: 28px;
    block-size: 28px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--hcv-video-secondary);
    cursor: pointer;
  }
  ${card} .hcv-video-button:is(:hover, [aria-expanded="true"]) { background: var(--hcv-video-hover); }
  ${card} .hcv-video-button::before {
    content: "";
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: none center / contain no-repeat;
  }
  ${iconRules}
  ${card} .hcv-video-button::after {
    position: absolute;
    z-index: 1;
    inset-inline-end: 0;
    inset-block-end: calc(100% + 5px);
    content: attr(aria-label);
    inline-size: max-content;
    max-inline-size: 320px;
    padding: ${codexReference.tooltip.padding};
    border-radius: ${codexReference.tooltip.radius};
    background: var(--hcv-dropdown-background);
    color: var(--hcv-dropdown-text);
    box-shadow: var(--hcv-popover-shadow);
    font: 400 13px/18px var(--hcv-ui-font);
    letter-spacing: -.15px;
    pointer-events: none;
    visibility: hidden;
    transition: visibility 0s;
  }
  ${card} .hcv-video-row > .hcv-video-button::after { inset-inline: 0 auto; }
  ${card} .hcv-video-button:not([aria-expanded="true"]):is(:hover, :focus-visible)::after {
    visibility: visible;
    transition-delay: 150ms;
  }
  ${card} .hcv-video-range {
    appearance: none;
    flex: 1 1 0;
    min-inline-size: 0;
    block-size: 24px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    touch-action: none;
  }
  ${card} .hcv-video-range:disabled { opacity: .4; cursor: default; }
  ${card} .hcv-video-range::-webkit-slider-runnable-track {
    --fill: calc(8px + (100% - 16px) * var(--hcv-video-position, 0));
    block-size: 2px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--hcv-video-ink) var(--fill), var(--hcv-video-track) var(--fill));
  }
  ${card} .hcv-video-range::-webkit-slider-thumb {
    appearance: none;
    box-sizing: border-box;
    inline-size: 16px;
    block-size: 16px;
    margin-block-start: -7px;
    border: 1px solid color-mix(in srgb, var(--hcv-video-ink) 8%, transparent);
    border-radius: 50%;
    background: var(--hcv-video-thumb);
    box-shadow: var(--hcv-video-thumb-shadow);
    outline: none;
  }
  ${card} :is(video, .hcv-video-button, .hcv-video-menu-item):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${card} .hcv-video-range:focus { outline: none; }
  ${card} .hcv-video-range:focus-visible:not(:active)::-webkit-slider-thumb {
    box-shadow: 0 0 0 2px var(--hcv-video-ring), var(--hcv-video-thumb-shadow);
  }
  ${card} .hcv-video-actions > [data-icon="more"] { anchor-name: --hcv-video-options-anchor; }
  ${card} .hcv-video-actions > :is([data-icon="volume"], [data-icon="muted"]) { anchor-name: --hcv-video-volume-anchor; }
  ${card} .hcv-video-popover {
    position: fixed;
    inset: auto;
    right: anchor(right);
    bottom: calc(anchor(top) + 5px);
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    box-sizing: border-box;
    max-inline-size: calc(100vw - 16px);
    max-block-size: calc(100vh - 16px);
    margin: 0;
    padding: 4px;
    border: 0;
    border-radius: 16px;
    background: var(--hcv-video-menu-surface);
    box-shadow: 0 4px 12px #0003, inset 0 0 0 .5px #ffffff12;
    color: var(--hcv-video-ink);
  }
  ${card} .hcv-video-sound {
    position-anchor: --hcv-video-volume-anchor;
    inline-size: 168px;
    align-items: center;
    gap: 8px;
  }
  ${card} .hcv-video-sound:popover-open { display: flex; }
  ${card} .hcv-video-menu {
    position-anchor: --hcv-video-options-anchor;
    inline-size: max-content;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.43;
  }
  ${card} .hcv-video-menu-item, ${card} .hcv-video-menu-label { padding: 4px 8px; }
  ${card} .hcv-video-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    inline-size: 100%;
    min-block-size: 28px;
    border: 0;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  ${card} .hcv-video-menu-item:is(:hover, :focus-visible) { background: color-mix(in srgb, currentColor 10%, transparent); }
  ${card} .hcv-video-menu-item[aria-checked="true"]::after {
    content: "";
    inline-size: 14px;
    block-size: 14px;
    background: currentColor;
    mask: ${codexMask('check')} center / contain no-repeat;
  }
  ${card} .hcv-video-menu-label { display: block; color: var(--hcv-video-secondary); }
  ${card} .hcv-video-menu hr {
    margin: 4px;
    border: 0;
    border-block-start: 1px solid var(--hcv-video-track);
  }
  ${card} .hcv-video-status:not([hidden]) { display: block; padding: 0 8px 8px; }
  @container hcv-video-controls (width < 320px) {
    ${card} .hcv-video-row { block-size: auto; padding-block: 4px; }
    ${card} .hcv-video-row > .hcv-video-range { order: -1; flex-basis: 100%; }
  }
  `, { surface: cardSelector })

  const root = document.documentElement
  const forcedColors = window.matchMedia('(forced-colors: active)')
  const players = new Map()
  function collect() {
    for (const [video, player] of players) {
      if (video.isConnected && video.parentElement === player.card && video.matches(selector)) continue
      player.remove()
      players.delete(video)
    }
    for (const video of document.querySelectorAll(selector)) {
      if (players.has(video) || !video.controls) continue
      const card = video.parentElement
      players.set(video, { card, ...attachPlayer(card, video) })
    }
  }
  function clear() {
    for (const { remove } of players.values()) remove()
    players.clear()
  }
  const changes = new MutationObserver(records => {
    if (records.some(record => movedElementMatches(record, 'video'))) collect()
  })
  function reconcile() {
    changes.disconnect()
    if (!root.matches(active) || forcedColors.matches) {
      clear()
      return
    }
    collect()
    changes.observe(document.body, { childList: true, subtree: true })
  }
  const theme = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-hermes-theme')) reconcile()
    if (records.some(record => record.attributeName === 'lang')) {
      for (const player of players.values()) player.localize()
    }
  })
  theme.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'lang'] })
  forcedColors.addEventListener('change', reconcile)
  reconcile()
  ctx.onDispose(() => {
    theme.disconnect()
    changes.disconnect()
    forcedColors.removeEventListener('change', reconcile)
    clear()
  })
}
