const overflowing = 'data-hcv-title-overflow'
const marqueeDistance = '--hcv-title-distance'
const marqueeDuration = '--hcv-title-duration'
const marqueeTiming = '--hcv-title-timing'

function measureMarquee(label) {
  const zoom = label.currentCSSZoom || 1
  const width = label.getBoundingClientRect().width
  const content = label.firstElementChild
  if (!width || !content) return null
  const padding = Number.parseFloat(getComputedStyle(label).paddingInlineStart) || 0
  const distance = (content.getBoundingClientRect().width - width) / zoom + padding
  if (distance < 1) return null
  const fontSize = Number.parseFloat(getComputedStyle(content).fontSize)
  return { distance, fontSize: fontSize || 13 }
}

function setMarquee(label, motion) {
  if (!motion) {
    label.style.removeProperty(marqueeDistance)
    label.style.removeProperty(marqueeDuration)
    label.style.removeProperty(marqueeTiming)
    return
  }
  // Codex Desktop's stop-at-end marquee holds still for .35s, then
  // travels at 2em/s with a sampled cubic-bezier(.49, .60, .70, 1).
  const { distance, fontSize } = motion
  const travel = distance / (fontSize * 2)
  const hold = 0.35
  const duration = hold + travel
  const stops = ['0.0000 0.0000%']
  for (let index = 0; index <= 32; index++) {
    const t = index / 32
    const inverse = 1 - t
    const first = 3 * inverse ** 2 * t
    const second = 3 * inverse * t ** 2
    const third = t ** 3
    const x = first * .49 + second * .70 + third
    const y = first * .60 + second + third
    const percent = (hold + travel * x) / duration * 100
    stops.push(`${y.toFixed(4)} ${percent.toFixed(4)}%`)
  }
  label.style.setProperty(marqueeDistance, `${distance}px`)
  label.style.setProperty(marqueeDuration, `${duration.toFixed(3)}s`)
  label.style.setProperty(marqueeTiming, `linear(${stops.join(', ')})`)
}

export function trackTitleOverflow({ marquee = false } = {}) {
  const measured = new Map()
  const update = (labels) => {
    const sizes = labels.map((label) => {
      if (marquee) {
        const motion = measureMarquee(label)
        return { label, clipped: Boolean(motion), motion }
      }
      const width = label.clientWidth
      return { label, clipped: width > 0 && label.scrollWidth > width }
    })
    for (const { label, clipped, motion } of sizes) {
      const entry = measured.get(label)
      if (!entry) continue
      label.toggleAttribute(overflowing, clipped)
      if (marquee && (entry.motion?.distance !== motion?.distance || entry.motion?.fontSize !== motion?.fontSize)) {
        setMarquee(label, motion)
        entry.motion = motion
      }
    }
  }
  const observer = new ResizeObserver((entries) => {
    const resized = new Set()
    for (const { target } of entries) {
      const label = measured.has(target) ? target : target.parentElement
      if (measured.has(label)) resized.add(label)
    }
    update([...resized])
  })

  return (labels = []) => {
    const current = new Set(labels)
    for (const [label, entry] of measured) {
      if (current.has(label)) continue
      observer.unobserve(label)
      if (entry.content) observer.unobserve(entry.content)
      label.removeAttribute(overflowing)
      if (marquee) setMarquee(label, null)
      measured.delete(label)
    }
    const renamed = []
    for (const label of current) {
      const title = label.textContent
      let entry = measured.get(label)
      if (!entry) {
        entry = { title, content: null }
        measured.set(label, entry)
        observer.observe(label)
      }
      if (entry.title !== title) renamed.push(label)
      entry.title = title
      const content = marquee ? label.firstElementChild : null
      if (entry.content === content) continue
      if (entry.content) observer.unobserve(entry.content)
      if (content) observer.observe(content)
      entry.content = content
    }
    if (renamed.length) update(renamed)
  }
}

export function sidebarMarqueeStyles(row) {
  const viewport = `${row} .hover-marquee`
  const content = '.hover-marquee-inner'
  const hover = `${row}:hover .hover-marquee[${overflowing}]`
  return `
  ${viewport} {
    --hcv-title-fade-start: .571429em;
    --hcv-title-fade-end: 1.14286em;
    --hcv-title-direction: -1;
    --hcv-title-gradient: to right;
    display: block;
    box-sizing: border-box;
    inline-size: calc(100% + var(--hcv-title-fade-start));
    margin-inline-start: calc(-1 * var(--hcv-title-fade-start));
    padding-inline-start: var(--hcv-title-fade-start);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: clip;
    text-align: start;
  }
  ${viewport}:dir(rtl) { --hcv-title-direction: 1; --hcv-title-gradient: to left; mask-position: 100% 0; }
  ${viewport} > ${content} {
    display: inline-block;
    min-inline-size: max-content;
  }
  ${viewport}[data-marquee="true"] > ${content} { animation: none; }
  ${viewport}[${overflowing}] {
    mask-image: linear-gradient(var(--hcv-title-gradient), transparent, #000 var(--hcv-title-fade-start), #000 calc(100% - var(--hcv-title-fade-end)), transparent);
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
  }
  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    ${hover} { animation: hcv-chat-title-mask var(${marqueeDuration}) linear forwards; }
    ${hover} > ${content} {
      animation: hcv-chat-title-scroll var(${marqueeDuration}) var(${marqueeTiming}) forwards;
      will-change: transform;
    }
    @keyframes hcv-chat-title-scroll {
      to { transform: translateX(calc(var(--hcv-title-direction) * var(${marqueeDistance}))); }
    }
    @keyframes hcv-chat-title-mask {
      75% { mask-size: 100% 100%; }
      to { mask-size: calc(100% + var(--hcv-title-fade-end)) 100%; }
    }
  }
  `
}

export function fadingTitleStyles(selector, distance) {
  const edge = `#000 calc(100% - ${distance}), transparent`
  return `
  ${selector} { text-overflow: clip; }
  ${selector}[${overflowing}] { mask-image: linear-gradient(to right, ${edge}); }
  ${selector}[${overflowing}]:dir(rtl) { mask-image: linear-gradient(to left, ${edge}); }
  `
}
