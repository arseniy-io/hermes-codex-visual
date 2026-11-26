import { codexMask, localAssets, svgMask } from './codex-reference.js'
import { movedElementMatches } from './dom-changes.js'
import { mountCSS } from './style-scope.js'

const mark = 'data-hcv-audio'
const controls = 'data-hcv-audio-controls'
const mediaEvents = [
  'emptied', 'loadedmetadata', 'durationchange', 'timeupdate', 'seeking', 'play', 'pause', 'ended', 'error',
]

function node(tag, className) {
  const element = document.createElement(tag)
  if (className) element.className = className
  return element
}

function clock(seconds) {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`
}

function attachPlayer(card, audio) {
  const nativeTitle = card.firstElementChild
  const player = node('span')
  const header = node('span', 'hcv-audio-header')
  const glyph = node('span', 'hcv-audio-glyph')
  const info = node('span', 'hcv-audio-info')
  const title = node('span', 'hcv-audio-title')
  const subtitle = node('span', 'hcv-audio-subtitle')
  const play = node('button', 'hcv-audio-play')
  const options = node('button', 'hcv-audio-options')
  const timeline = node('span', 'hcv-audio-timeline')
  const seek = node('input')
  const time = node('span')
  const listeners = new AbortController()
  const { signal } = listeners
  let currentName
  let currentLocale
  let currentPlaying
  let currentError
  let currentDuration

  play.type = options.type = 'button'
  options.setAttribute('aria-expanded', 'false')
  seek.type = 'range'
  seek.min = '0'
  seek.step = '0.1'
  glyph.setAttribute('aria-hidden', 'true')
  player.setAttribute(controls, '')
  info.append(title, subtitle)
  header.append(glyph, info, play, options)
  timeline.append(seek, time)
  player.append(header, timeline)
  card.insertBefore(player, audio)
  card.setAttribute(mark, '')

  function sync() {
    const ru = /^ru\b/i.test(document.documentElement.lang)
    const name = nativeTitle.textContent.trim()
    const unavailable = !!audio.error
    const playing = !audio.paused && !audio.ended
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
    const position = Math.min(audio.currentTime, duration)
    const labelChanged = name !== currentName || ru !== currentLocale
    if (labelChanged) {
      title.title = title.textContent = name
      options.title = ru ? 'Параметры воспроизведения' : 'Playback options'
      options.setAttribute('aria-label', `${options.title} · ${name}`)
      seek.setAttribute('aria-label', `${ru ? 'Позиция воспроизведения' : 'Playback position'} · ${name}`)
      currentName = name
      currentLocale = ru
    }
    if (labelChanged || unavailable !== currentError) {
      const format = name.match(/\.([a-z\d]+)$/i)?.[1]?.toUpperCase()
      const audioType = format ? (ru ? `Аудио ${format}` : `${format} audio`) : (ru ? 'Аудио' : 'Audio')
      subtitle.textContent = unavailable ? (ru ? 'Аудио недоступно' : 'Audio unavailable') : audioType
      play.disabled = unavailable
    }
    if (labelChanged || playing !== currentPlaying) {
      const action = playing ? (ru ? 'Пауза' : 'Pause') : (ru ? 'Воспроизвести' : 'Play')
      play.dataset.playing = String(playing)
      play.setAttribute('aria-label', `${action} ${name}`)
      currentPlaying = playing
    }
    if (duration !== currentDuration || unavailable !== currentError) {
      seek.disabled = unavailable || duration <= 0
      seek.max = String(duration || 1)
      currentDuration = duration
      currentError = unavailable
    }
    seek.value = String(position)
    const progress = `${clock(position)} / ${clock(duration)}`
    if (time.textContent !== progress) time.textContent = progress
  }

  play.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(sync)
    else audio.pause()
  }, { signal })
  seek.addEventListener('input', () => {
    if (seek.disabled) return
    audio.currentTime = seek.valueAsNumber
    sync()
  }, { signal })
  options.addEventListener('click', () => {
    const expanded = card.toggleAttribute('data-hcv-audio-expanded')
    options.setAttribute('aria-expanded', String(expanded))
  }, { signal })
  for (const event of mediaEvents) audio.addEventListener(event, sync, { signal })
  sync()

  return {
    sync,
    remove() {
      listeners.abort()
      player.remove()
      card.removeAttribute(mark)
      card.removeAttribute('data-hcv-audio-expanded')
    },
  }
}

export function registerChatAudio(ctx, active, selector, forcedColors) {
  const root = document.documentElement
  const players = new Map()
  const card = `${active} [${mark}]`
  const waveform = localAssets?.icons.resourceAudioLight && localAssets?.icons.resourceAudioDark
    ? `background: light-dark(${svgMask(localAssets.icons.resourceAudioLight)}, ${svgMask(localAssets.icons.resourceAudioDark)}) center / contain no-repeat;`
    : `background: var(--hcv-focus); mask: ${codexMask('audio')} center / contain no-repeat;`

  // nAYi (962887.6110684754.js) uses the compact resource row from fLcv
  // (739301.37a39f26d6.js). Hermes keeps ownership of the underlying audio.
  mountCSS(ctx, 'data-hcv-chat-audio', `
@media (forced-colors: none) {
  ${card} {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 32rem;
    container: hcv-audio-card / inline-size;
    padding: 0;
    border: 0;
    border-radius: 10px;
    corner-shape: superellipse(1.5);
    background: color-mix(in oklab, var(--hcv-panel) 50%, transparent);
    box-shadow: inset 0 0 0 .5px var(--hcv-hairline);
    color: var(--hcv-text);
  }
  @supports (corner-shape: superellipse(1.5)) {
    ${card}, ${card} .hcv-audio-glyph { border-radius: 12.5px; }
  }
  ${card} > span:first-child, ${card}:not([data-hcv-audio-expanded]) > audio { display: none; }
  ${card} > [${controls}] { display: block; }
  ${card} > audio { box-sizing: border-box; padding: 0 12px 8px; }
  ${card} .hcv-audio-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
  }
  ${card} .hcv-audio-glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 10px;
    background: var(--hcv-hover);
  }
  ${card} .hcv-audio-glyph::before {
    content: '';
    inline-size: 24px;
    block-size: 24px;
    ${waveform}
  }
  ${card} .hcv-audio-info {
    display: grid;
    flex: 1;
    min-inline-size: 0;
    margin-inline: 6px;
  }
  ${card} :is(.hcv-audio-title, .hcv-audio-subtitle) {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  ${card} .hcv-audio-title { font: 500 var(--conversation-text-font-size, 13px)/20px var(--hcv-ui-font); }
  ${card} :is(.hcv-audio-subtitle, .hcv-audio-timeline) {
    color: var(--hcv-muted);
    font: 400 calc(var(--conversation-text-font-size, 13px) - 1px)/18px var(--hcv-ui-font);
  }
  ${card} :is(.hcv-audio-play, .hcv-audio-options) {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-muted);
    cursor: pointer;
  }
  ${card} .hcv-audio-play {
    inline-size: 32px;
    block-size: 32px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--hcv-text) 5%, transparent);
    color: var(--hcv-text);
  }
  ${card} .hcv-audio-play:not(:disabled):hover { background: color-mix(in srgb, var(--hcv-text) 10%, transparent); }
  ${card} .hcv-audio-options:hover { color: var(--hcv-text); }
  ${card} .hcv-audio-play:disabled { opacity: .4; cursor: default; }
  ${card} :is(.hcv-audio-play, .hcv-audio-options)::before {
    content: '';
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: ${codexMask('resourcePlay')} center / contain no-repeat;
  }
  ${card} .hcv-audio-play[data-playing="true"]::before { mask-image: ${codexMask('resourcePause')}; }
  ${card} .hcv-audio-options::before { mask-image: ${codexMask('resourceMore')}; }
  ${card} .hcv-audio-timeline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-block-start: 1px solid var(--hcv-hairline);
    font-variant-numeric: tabular-nums;
  }
  ${card} .hcv-audio-timeline input {
    flex: 1;
    min-inline-size: 0;
    block-size: 20px;
    margin: 0;
    accent-color: var(--hcv-focus);
    cursor: pointer;
  }
  ${card} .hcv-audio-timeline input:disabled { opacity: .4; cursor: default; }
  ${card} :is(.hcv-audio-play, .hcv-audio-options, input):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 1px;
  }
  @container hcv-audio-card (max-width: 175px) {
    ${card} .hcv-audio-header { flex-wrap: wrap; }
    ${card} .hcv-audio-info { flex: 1 1 calc(100% - 64px); }
    ${card} .hcv-audio-play { margin-inline-start: auto; }
  }
  @container hcv-audio-card (max-width: 110px) {
    ${card} .hcv-audio-timeline { flex-wrap: wrap; }
    ${card} .hcv-audio-timeline input { flex: 1 1 30px; }
  }
}
`, { surface: `[${mark}]` })

  function clear() {
    for (const player of players.values()) player.remove()
    players.clear()
  }

  function collect() {
    for (const [audio, player] of players) {
      if (audio.isConnected && audio.matches(selector)) continue
      player.remove()
      players.delete(audio)
    }
    for (const audio of document.querySelectorAll(selector)) {
      if (players.has(audio)) continue
      players.set(audio, attachPlayer(audio.parentElement, audio))
    }
  }

  const changes = new MutationObserver(records => {
    // Removed subtrees no longer match the theme/answer ancestors.
    if (records.some(record => movedElementMatches(record, 'audio'))) collect()
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

  ctx.onDispose(() => {
    changes.disconnect()
    clear()
  })
  return {
    reconcile,
    localize() {
      for (const player of players.values()) player.sync()
    },
  }
}
