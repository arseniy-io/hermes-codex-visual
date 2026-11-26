import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Test the real media controls with the local JSDOM fixture, without touching
// a Desktop profile, the network, or the operating-system audio device.
const require = createRequire(path.join(process.env.LOCALAPPDATA, 'hermes/source-archive/hermes-agent-main/package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM(`<html lang="ru" data-hermes-theme="codex-workspace"><body>
  <div data-chat-surface><div data-slot="aui_thread-content"><div data-slot="aui_assistant-message-content"><div class="aui-md">
    <span class="bg-muted/35"><span>sound.mp3</span><audio controls></audio></span>
    <span class="bg-muted/35"><span>movie.mp4</span><video controls></video></span>
  </div></div></div></div>
</body></html>`, { url: 'http://localhost/', runScripts: 'outside-only' })
const { window } = dom
const { document } = window
const colors = { matches: false, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn) },
  removeEventListener(_, fn) { this.listeners.delete(fn) },
  set(value) { this.matches = value; for (const fn of this.listeners) fn() } }
window.matchMedia = () => colors
window.HTMLElement.prototype.showPopover = function () {}
window.HTMLElement.prototype.hidePopover = function () {}
window.CSS = { supports: () => true }
Object.assign(window, { codexMask: () => '', svgMask: () => '', localAssets: null,
  codexReference: { tooltip: { padding: '0', radius: '0' } }, mountCSS: () => {}, mountStyle: () => {},
  codexIconRules: () => '', movedElementMatches: () => false })
const disposers = []
const ctx = {
  onDispose: fn => disposers.push(fn),
  addEventListener(target, name, fn) {
    target.addEventListener(name, fn)
    disposers.push(() => target.removeEventListener(name, fn))
  },
}
for (const kind of ['Audio', 'Video', 'Resources']) {
  const src = fs.readFileSync(`source/chat-${kind.toLowerCase()}.js`, 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replace(/^export (const|function) /gm, '$1 ')
  window[`registerChat${kind}`] = window.eval(`(()=>{${src}; return registerChat${kind}})()`)
}
window.registerChatResources(ctx, 'html[data-hermes-theme="codex-workspace"]')
const audio = document.querySelector('audio')
const video = document.querySelector('video')
const audioPlay = document.querySelector('.hcv-audio-play')
const videoPlay = document.querySelector('.hcv-video-row > button')
const videoControls = document.querySelector('.hcv-video-controls')
const audioControls = document.querySelector('[data-hcv-audio-controls]')
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

try {
  assert.equal(audioPlay.getAttribute('aria-label'), 'Воспроизвести sound.mp3')
  assert.equal(videoPlay.getAttribute('aria-label'), 'Воспроизвести видео')
  Object.defineProperty(audio, 'paused', { value: false, configurable: true })
  Object.defineProperty(video, 'paused', { value: false, configurable: true })
  audio.currentTime = 2
  video.currentTime = 3
  video.playbackRate = 1.5
  video.volume = .5
  video.muted = true
  audio.dispatchEvent(new window.Event('play'))
  video.dispatchEvent(new window.Event('play'))
  videoPlay.focus()

  document.documentElement.lang = 'en'
  await flush()
  assert.equal(audioPlay.getAttribute('aria-label'), 'Pause sound.mp3')
  assert.equal(videoPlay.getAttribute('aria-label'), 'Pause video')
  assert.equal(document.querySelector('.hcv-video-menu-item[role="menuitemradio"]:nth-of-type(7)').textContent, '1.5×')
  assert.equal(document.querySelector('.hcv-video-controls'), videoControls)
  assert.equal(document.querySelector('[data-hcv-audio-controls]'), audioControls)
  assert.equal(document.activeElement, videoPlay)
  assert.deepEqual([audio.currentTime, video.currentTime, audio.paused, video.paused, video.playbackRate, video.muted],
    [2, 3, false, false, 1.5, true])

  document.documentElement.lang = 'ru'
  await flush()
  assert.equal(audioPlay.getAttribute('aria-label'), 'Пауза sound.mp3')
  assert.equal(videoPlay.getAttribute('aria-label'), 'Приостановить воспроизведение видео')
  assert([...document.querySelectorAll('.hcv-video-menu-item')].some(node => node.textContent === '1,5×'))

  colors.set(true)
  assert.equal(document.querySelector('.hcv-video-controls'), null)
  assert.equal(document.querySelector('[data-hcv-audio-controls]'), null)
  assert.equal(video.controls, true)
  colors.set(false)
  assert(document.querySelector('.hcv-video-controls'))
  assert(document.querySelector('[data-hcv-audio-controls]'))
  console.log('Media language, playback state, focus and native-control restoration passed.')
} finally {
  for (const dispose of disposers) dispose()
  dom.window.close()
}
