const motion = 'data-hcv-activity-motion'

export async function captureDisclosureMotion({ expect, page, scope, panel, phase, trigger }) {
  // Capture the real source animation in the same task that creates it. A
  // click/expect/evaluate round trip can otherwise outlive its 150/300ms run.
  await scope.evaluate((root, { marker, phase }) => {
    if (globalThis.__hcvActivityMotionSample) throw new Error('Motion capture already armed')
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    const original = descriptor.value
    const state = { descriptor, animations: new Map() }
    globalThis.__hcvActivityMotionSample = state
    Object.defineProperty(Element.prototype, 'animate', { ...descriptor, value: function (...args) {
      const animation = Reflect.apply(original, this, args)
      if (root.contains(this) && this.getAttribute(marker) === phase &&
          animation.effect?.getKeyframes().some(frame => 'blockSize' in frame)) {
        animation.pause()
        animation.currentTime = 0
        state.animations.set(this, animation)
      }
      return animation
    } })
  }, { marker: motion, phase })
  let result
  try {
    await trigger()
    await expect(panel).toHaveAttribute(motion, phase)
    result = await panel.evaluate(async node => {
      const animation = globalThis.__hcvActivityMotionSample?.animations.get(node)
      if (!animation) throw new Error('Source disclosure animation was not captured for this panel')
      await animation.ready
      const { duration } = animation.effect.getTiming()
      const frames = [0, duration / 4, duration].map(time => {
        animation.currentTime = time
        return { height: node.getBoundingClientRect().height, opacity: Number(getComputedStyle(node).opacity) }
      })
      const easing = animation.effect.getTiming().easing
      return { duration, easing, frames }
    })
  } finally {
    await page.evaluate(() => {
      const state = globalThis.__hcvActivityMotionSample
      if (!state) return
      Object.defineProperty(Element.prototype, 'animate', state.descriptor)
      delete globalThis.__hcvActivityMotionSample
      // A turn can animate several panels. Finish every captured panel so the
      // source Promise.all keeps its normal disclosure cleanup and close path.
      for (const animation of state.animations.values()) if (animation.playState !== 'idle') animation.finish()
    })
  }
  return result
}
