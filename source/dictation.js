import { host } from '@hermes/plugin-sdk'
import { codexMask } from './codex-reference.js'
import { draftSelection, draftText, insertDictation, updateDictationAnchor } from './dictation-caret.js'
import { committedFiber } from './sidebar-recents.js'

const formSelector = 'form[data-slot="composer-root"]'
const editorSelector = '[data-slot="composer-rich-input"][contenteditable="true"]'
const hubSelector = '[data-slot="fan-menu-anchor"] > button:has(> .codicon-mic)'
const inputCell = '[class~="[grid-area:input]"]'
const captions = {
  ru: { record: 'Голосовая диктовка', stop: 'Остановить диктовку', cancel: 'Отменить диктовку', starting: 'Подключение микрофона…', transcribing: 'Расшифровка диктовки…', error: 'Диктовка не удалась', denied: 'Нет доступа к микрофону', empty: 'Речь не распознана', insert: 'Не удалось вставить диктовку в черновик' },
  en: { record: 'Voice dictation', stop: 'Stop dictation', cancel: 'Cancel dictation', starting: 'Connecting microphone…', transcribing: 'Transcribing dictation…', error: 'Dictation failed', denied: 'Microphone access denied', empty: 'No speech detected', insert: 'Could not insert dictation in the draft' },
}
const words = () => captions[document.documentElement.lang.toLowerCase().startsWith('ru') ? 'ru' : 'en']
const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/wav']

function composerTarget(form) {
  return form.closest('[data-floating-composer-target]')?.dataset.floatingComposerTarget
    ?? form.closest('[data-composer-target]')?.dataset.composerTarget
}

function nativeVoice(form) {
  if (!form?.isConnected || form.closest('[data-pane-hidden], [inert]') || !form.getClientRects().length) return null
  const editor = form.querySelector(editorSelector)
  if (!editor) return null
  for (let fiber = committedFiber(editor); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (typeof props?.onTranscribeAudio !== 'function' || typeof props.state?.voice?.enabled !== 'boolean') continue
    if (!props.state.voice.enabled || props.disabled) return null
    const target = composerTarget(form)
    const grid = editor.closest(inputCell)?.parentElement
    if (!target || !grid) return null
    return {
      form, editor, grid, target, transcribe: props.onTranscribeAudio, limit: props.maxRecordingSeconds ?? 120,
      address: JSON.stringify([target, props.sessionId, props.queueSessionKey, host.state.connectionId.get(),
        host.state.profile.get(), target === 'main' ? host.state.activeSessionId.get() : null]),
    }
  }
  return null
}

function nativeMenuOwner(item) {
  if (!item || item.getAttribute('data-disabled') !== null ||
      !Object.values(captions).some(copy => item.textContent.trim() === copy.record)) return null
  const id = item.closest('[role="menu"]')?.id
  return id ? document.querySelector(`${formSelector} button[aria-controls="${CSS.escape(id)}"]`) : null
}

function createStrip(grid, abort, stop) {
  const strip = document.createElement('div')
  strip.setAttribute('data-hcv-dictation', '')
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.setAttribute('data-hcv-dictation-cancel', '')
  cancel.addEventListener('click', abort)
  const wave = document.createElement('canvas')
  wave.setAttribute('aria-hidden', 'true')
  const status = document.createElement('span')
  status.setAttribute('role', 'status')
  status.setAttribute('data-hcv-dictation-caption', '')
  const finish = document.createElement('button')
  finish.type = 'button'
  finish.setAttribute('data-hcv-dictation-stop', '')
  finish.addEventListener('click', stop)
  strip.append(cancel, wave, status, finish)
  grid.append(strip)
  return { strip, cancel, wave, status, finish }
}

function startWaveform(canvas, stream) {
  const graphics = canvas.getContext('2d')
  if (!graphics) return () => {}
  let audio
  let analyser
  try {
    audio = new AudioContext()
    analyser = audio.createAnalyser()
    analyser.fftSize = 256
    audio.createMediaStreamSource(stream).connect(analyser)
    void audio.resume().catch(() => {})
  } catch {
    analyser = null
  }
  const samples = new Float32Array(256)
  const history = []
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const stillPattern = [.3, .5, 1, .7, .4, .7]
  const step = 5
  let lastSample = -Infinity
  let lastFrame
  let level = 0
  let phase = 0
  let frame
  const paint = now => {
    if (analyser && now - lastSample >= 100) {
      lastSample = now
      analyser.getFloatTimeDomainData(samples)
      const energy = samples.reduce((sum, sample) => sum + sample ** 2, 0)
      const rms = Math.sqrt(energy / samples.length)
      level = rms < .0025 ? 0 : Math.min(1, 8 * rms)
    }
    phase += Math.min(100, now - (lastFrame ?? now)) * .06
    lastFrame = now
    while (phase >= step) {
      phase -= step
      history.push(level)
      if (history.length > 256) history.shift()
    }
    frame = requestAnimationFrame(paint)
    const { clientWidth: width, clientHeight: height } = canvas
    if (!width || !height) return
    const scale = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
    }
    graphics.setTransform(scale, 0, 0, scale, 0, 0)
    graphics.clearRect(0, 0, width, height)
    graphics.fillStyle = getComputedStyle(canvas).color
    const reduced = motion.matches
    for (let index = 0, x = width - 2 - (reduced ? 0 : phase); x > 0; index++, x -= step) {
      const amplitude = reduced ? level * stillPattern[index % stillPattern.length] : history.at(-1 - index) ?? 0
      const fade = Math.min(1, Math.min(x, width - x - 2) / 20)
      const bar = 2 + amplitude * (.88 * height - 2)
      graphics.globalAlpha = (amplitude ? .45 : .225) * fade * fade * (3 - 2 * fade)
      graphics.beginPath()
      graphics.roundRect(Math.round(x * scale) / scale, (height - bar) / 2, 2, bar, 1)
      graphics.fill()
    }
    graphics.globalAlpha = 1
  }
  frame = requestAnimationFrame(paint)
  return () => {
    cancelAnimationFrame(frame)
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
  }
}

function styles(active) {
  const row = `${active} [data-hcv-dictation]`
  const surface = `${active} [data-slot="composer-surface"]:has([data-hcv-dictation])`
  const layout = 'div:has(> [data-hcv-dictation])'
  const hub = `${surface} button[data-hcv-dictation-hub]`
  return `
@media (forced-colors: none) {
  ${surface} { background-color: var(--hcv-composer); background-clip: padding-box; }
  ${surface} [data-slot="composer-fade"] { border-radius: inherit; }
  ${surface} ${layout} {
    grid-template-areas: "input input input" "menu dictation controls";
    grid-template-columns: auto minmax(28px, 1fr) auto;
    align-items: center; gap: 4px;
  }
  ${surface}:not(:has(button[data-hcv-dictation-hub])) ${layout} {
    grid-template-areas: "input input" "dictation dictation" "menu controls";
    grid-template-columns: auto minmax(0, 1fr);
  }
  ${surface} [class~="[grid-area:menu]"] { translate: none; align-self: center; }
  ${row} { grid-area: dictation; display: flex; min-inline-size: 0; align-items: center; gap: 8px; color: var(--hcv-muted); }
  ${row} button, ${hub} {
    display: grid; place-items: center; flex: none; inline-size: 28px; block-size: 28px; padding: 0;
    border-radius: 50%; color: var(--hcv-text); background: color-mix(in srgb, currentColor 6%, transparent);
  }
  ${row} button:hover, ${hub}:hover { background: color-mix(in srgb, currentColor 13%, transparent); }
  ${row} button:focus-visible, ${hub}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${row} button::before, ${hub}::after { content: ''; }
  ${row} [data-hcv-dictation-cancel]::before {
    inline-size: 14px; block-size: 14px; background: currentColor; mask: ${codexMask('close')} center / contain no-repeat;
  }
  ${row} [data-hcv-dictation-stop]::before, ${hub}::after {
    inline-size: 16px; block-size: 16px; background: currentColor;
    mask: ${codexMask('dictationStop')} center / contain no-repeat;
  }
  ${hub}::before { display: none !important; }
  ${surface}:has(button[data-hcv-dictation-hub]) [data-hcv-dictation-stop],
  ${row}:not([data-state="recording"]) [data-hcv-dictation-stop],
  ${row}[data-state="recording"] [data-hcv-dictation-caption],
  ${row}:not([data-state="recording"]) canvas { display: none; }
  ${row} canvas {
    display: block; flex: 1 1 0; inline-size: 0; min-inline-size: 0; block-size: 28px;
    color: var(--hcv-text);
  }
  ${row} [data-hcv-dictation-caption] {
    min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
  }
  ${hub}[data-hcv-dictation-hub="transcribing"]::after {
    mask: ${codexMask('sidebarWorking')} center / contain no-repeat;
  }
  @media (prefers-reduced-motion: no-preference) {
    ${hub}[data-hcv-dictation-hub="transcribing"]::after { animation: hcv-sidebar-spin 2s steps(60, end) infinite; }
  }
}
`
}

export function registerDictation(ctx, active) {
  const sheet = document.createElement('style')
  sheet.setAttribute('data-hcv-dictation-style', '')
  sheet.textContent = styles(active)
  document.head.append(sheet)
  const root = document.documentElement
  const contrast = matchMedia('(forced-colors: none)')
  const selections = new WeakMap()
  let current
  let frame
  const enabled = () => contrast.matches && root.matches(active)

  function rememberSelection() {
    const editor = window.getSelection()?.anchorNode
    const input = (editor instanceof Element ? editor : editor?.parentElement)?.closest(editorSelector)
    const position = input && draftSelection(input)
    if (position) selections.set(input, { ...position, text: draftText(input) })
  }

  function valid(run) {
    const live = enabled() && nativeVoice(run.form)
    return live && live.address === run.address && live.editor === run.editor && live.grid === run.grid
  }

  function restoreHub(run) {
    if (!run.hub) return
    const { button, label, pressed } = run.hub
    button.removeAttribute('data-hcv-dictation-hub')
    for (const [key, value] of [['aria-label', label], ['aria-pressed', pressed]]) {
      if (value === null) button.removeAttribute(key)
      else button.setAttribute(key, value)
    }
    run.hub = null
  }

  function paint(run) {
    const copy = words()
    const button = run.form.querySelector(hubSelector)
    if (run.hub?.button !== button) {
      restoreHub(run)
      if (button) run.hub = { button, label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed') }
    }
    if (button) {
      button.dataset.hcvDictationHub = run.phase
      button.setAttribute('aria-label', run.phase === 'transcribing' ? copy.transcribing : copy.stop)
      button.setAttribute('aria-pressed', 'true')
    }
    const { strip, cancel, status, finish } = run.ui
    strip.dataset.state = run.phase
    cancel.setAttribute('aria-label', copy.cancel)
    cancel.title = copy.cancel
    finish.setAttribute('aria-label', copy.stop)
    finish.title = copy.stop
    const caption = copy[run.phase] || copy.record
    if (status.textContent !== caption) status.textContent = caption
  }

  function release(run) {
    clearTimeout(run.timeout)
    run.stopWaveform?.()
    run.stopWaveform = null
    run.stream?.getTracks().forEach(track => track.stop())
  }

  function cancel(run = current) {
    if (!run || run !== current) return
    current = null
    run.observer.disconnect()
    if (run.recorder) {
      run.recorder.onstop = null
      run.recorder.onerror = null
      if (run.recorder.state !== 'inactive') run.recorder.stop()
    }
    release(run)
    restoreHub(run)
    run.ui.strip.remove()
  }

  function updateAnchor(run) {
    const next = draftText(run.editor)
    updateDictationAnchor(run.anchor, next, run.edit)
    run.edit = null
  }

  async function transcribe(run) {
    release(run)
    if (current !== run || !valid(run)) return cancel(run)
    run.phase = 'transcribing'
    paint(run)
    try {
      const audio = new Blob(run.chunks, { type: run.recorder.mimeType || run.chunks[0]?.type })
      const text = audio.size ? (await run.transcribe(audio)).trim() : ''
      if (current !== run || !valid(run)) return
      if (text) {
        updateAnchor(run)
        if (!insertDictation(run.editor, run.anchor, text)) throw new Error(words().insert)
      } else host.notify({ kind: 'warning', title: words().empty })
    } catch (error) {
      if (current === run && valid(run)) host.notifyError(error, words().error)
    } finally {
      cancel(run)
    }
  }

  function stop(run) {
    if (current !== run || run.phase === 'transcribing') return
    if (run.phase === 'starting' || !valid(run)) return cancel(run)
    clearTimeout(run.timeout)
    run.phase = 'transcribing'
    paint(run)
    if (run.recorder.state !== 'inactive') run.recorder.stop()
  }

  async function record(run) {
    try {
      const permitted = await window.hermesDesktop?.requestMicrophoneAccess?.()
      if (permitted === false) throw new Error(words().denied)
      if (current !== run || !valid(run)) return cancel(run)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (current !== run || !valid(run)) {
        stream.getTracks().forEach(track => track.stop())
        return cancel(run)
      }
      run.stream = stream
      const mimeType = formats.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = run.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = event => { if (event.data.size) run.chunks.push(event.data) }
      recorder.onstop = () => void transcribe(run)
      recorder.onerror = event => {
        if (current !== run) return
        cancel(run)
        host.notifyError(event.error, words().error)
      }
      recorder.start()
      run.phase = 'recording'
      paint(run)
      run.stopWaveform = startWaveform(run.ui.wave, stream)
      run.timeout = window.setTimeout(() => stop(run), Math.min(600, Math.max(1, run.limit)) * 1000)
    } catch (error) {
      if (current !== run) return
      cancel(run)
      host.notifyError(error, words().error)
    }
  }

  function toggle(form) {
    if (!enabled() || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false
    if (current?.form === form) {
      stop(current)
      return true
    }
    const voice = nativeVoice(form)
    if (!voice) return false
    cancel()
    const { editor, grid } = voice
    const text = draftText(editor)
    const selection = draftSelection(editor)
    const anchor = selection ? { ...selection, text } : { ...selections.get(editor) }
    if (anchor.text === undefined) Object.assign(anchor, { text, start: text.length, end: text.length })
    else updateDictationAnchor(anchor, text)
    const run = current = { ...voice, anchor, phase: 'starting', chunks: [] }
    run.ui = createStrip(grid, () => cancel(run), () => stop(run))
    run.observer = new MutationObserver(() => updateAnchor(run))
    run.observer.observe(editor, { childList: true, characterData: true, subtree: true })
    paint(run)
    void record(run)
    return true
  }

  function refresh() {
    frame = 0
    if (!current) return
    if (!valid(current)) cancel()
    else paint(current)
  }
  const schedule = () => { if (current && !frame) frame = requestAnimationFrame(refresh) }
  const observer = new MutationObserver(schedule)
  observer.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-hermes-theme', 'data-hermes-codex-visual', 'data-pane-hidden', 'contenteditable', 'inert', 'lang'],
  })
  const off = [host.state.activeSessionId, host.state.connectionId, host.state.profile].map(state => state.listen(schedule))
  contrast.addEventListener('change', schedule)
  ctx.addEventListener(document, 'selectionchange', rememberSelection)
  ctx.addEventListener(document, 'pointerdown', rememberSelection, true)
  ctx.addEventListener(document, 'beforeinput', event => {
    if (event.target === current?.editor) {
      current.edit = draftSelection(current.editor, event.getTargetRanges?.()[0])
    }
  }, true)
  ctx.addEventListener(document, 'input', event => {
    if (event.target === current?.editor) updateAnchor(current)
  })
  ctx.addEventListener(document, 'click', event => {
    if (!(event.target instanceof Element)) return
    if (current && event.target.closest('button:is([aria-label="Начать голосовой разговор"], [aria-label="Start voice conversation"])')) cancel()
    const item = event.target.closest('[role="menuitemcheckbox"]')
    const trigger = item && nativeMenuOwner(item)
    const button = event.target.closest(hubSelector) || trigger
    if (!button || button.disabled || !toggle(button.closest(formSelector))) return
    event.preventDefault()
    event.stopImmediatePropagation()
    item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  }, true)
  ctx.addEventListener(window, 'hermes:composer-dictation', event => {
    const form = [...document.querySelectorAll(formSelector)].find(node =>
      composerTarget(node) === event.detail?.target && nativeVoice(node),
    )
    if (form && toggle(form)) event.stopImmediatePropagation()
  }, true)
  ctx.addEventListener(window, 'hermes:composer-voice-toggle', () => cancel(), true)
  ctx.addEventListener(document, 'keydown', event => {
    if (current && event.target === current.editor && event.key === 'Enter' && !event.shiftKey &&
        !event.isComposing && event.keyCode !== 229 && !current.form.querySelector('[data-slot="composer-completion-drawer"]')) cancel()
  }, true)
  ctx.addEventListener(document, 'submit', event => { if (event.target === current?.form) cancel() }, true)
  ctx.addEventListener(window, 'pagehide', () => cancel())
  ctx.onDispose(() => {
    cancel()
    if (frame) cancelAnimationFrame(frame)
    observer.disconnect()
    contrast.removeEventListener('change', schedule)
    for (const unsubscribe of off) unsubscribe()
    sheet.remove()
  })
}
