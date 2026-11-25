import assert from 'node:assert/strict'

// No style/DOM substitutions. Repeated bottom placement here models an
// explicit "jump to latest" after a viewport resize; it does not replace the
// application's auto-follow behavior during a running response.
async function settleAtBottom(page) {
  return page.evaluate(async () => {
    await document.fonts?.ready
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
    let previous = '', stable = 0
    for (let frame = 0; frame < 120; frame++) {
      const samples = []
      for (const root of document.querySelectorAll('[data-chat-surface]')) {
        if (root.closest('[data-hud-shell]') || !root.getClientRects().length) continue
        const view = root.querySelector('[data-slot="aui_thread-viewport"]')
        const dock = root.querySelector('[data-slot="composer-dock"]:not([data-popped-out])')
        const editor = dock?.querySelector('[data-slot="composer-surface"]')
        if (!view?.clientHeight || !editor?.getClientRects().length) continue
        if (view.scrollHeight - view.clientHeight - view.scrollTop > 0) view.scrollTop = view.scrollHeight
        const box = node => node.getBoundingClientRect()
        const css = getComputedStyle(root)
        samples.push([root.getAttribute('data-session-anchor'), view.clientHeight, view.scrollHeight,
          Math.round(view.scrollTop * 100) / 100, box(dock).top, box(dock).height,
          box(editor).top, box(editor).height,
          css.getPropertyValue('--hcv-composer-dock-height'), css.getPropertyValue('--hcv-composer-surface-height'),
          css.getPropertyValue('--thread-viewport-height')])
      }
      const signature = JSON.stringify(samples)
      stable = samples.length && signature === previous ? stable + 1 : 0
      previous = signature
      if (stable >= 4) return { settled: true, frames: frame + 1, samples: samples.length }
      await nextFrame()
      await nextFrame()
    }
    return { settled: false, frames: 120, samples: JSON.parse(previous || '[]').length }
  })
}

// Codex Gjet.F, 632620.21f2e5d141.js: transcript pb-8 plus footer-height
// spacer. The 32px gap is above the WHOLE footer, including its leading/status
// rows. A visible editor below such rows is farther away by their own height.
export async function measureComposerBottomGap(page) {
  const settlement = await settleAtBottom(page)
  return page.locator('[data-chat-surface]:visible').evaluateAll((surfaces, settlement) => surfaces.flatMap(root => {
    const viewport = root.querySelector('[data-slot="aui_thread-viewport"]')
    const content = viewport?.querySelector('[data-slot="aui_thread-content"]')
    const dock = root.querySelector('[data-slot="composer-dock"]:not([data-popped-out])')
    const editor = dock?.querySelector('[data-slot="composer-surface"]')
    const clearance = content?.querySelector(':scope > [data-slot="aui_composer-clearance"]')
    if (!viewport?.clientHeight || !dock?.getClientRects().length || !editor || !clearance) return []
    const last = [...content.children].filter(node => node !== clearance &&
      getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0).at(-1)
    if (!last) return []
    const box = node => node.getBoundingClientRect()
    const zoom = Number(root.currentCSSZoom) || 1
    const rectangle = node => ({ top: box(node).top / zoom, bottom: box(node).bottom / zoom,
      height: box(node).height / zoom, width: box(node).width / zoom })
    const keys = ['--thread-viewport-height', '--composer-measured-height', '--composer-surface-measured-height',
      '--hcv-composer-dock-height', '--hcv-composer-surface-height', '--composer-shell-pad-block-end',
      '--thread-last-message-clearance']
    const vars = node => Object.fromEntries(keys.map(key => [key, getComputedStyle(node).getPropertyValue(key).trim()]))
    const ownVars = vars(root)
    return [{
      anchor: root.getAttribute('data-session-anchor'), target: root.getAttribute('data-composer-target'),
      normal: !root.closest('[data-hud-shell]'), zoom, settlement,
      surface: rectangle(root),
      viewport: { ...rectangle(viewport), height: viewport.clientHeight,
        scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight },
      viewportFrame: { ...rectangle(viewport.parentElement), inlineHeight: viewport.parentElement.style.height,
        computedHeight: getComputedStyle(viewport.parentElement).height },
      viewportContainer: rectangle(viewport.parentElement.parentElement),
      dock: rectangle(dock), editor: rectangle(editor),
      last: { slot: last.getAttribute('data-slot'), ...rectangle(last),
        hasActions: !!last.querySelector('[data-slot="aui_msg-actions"]'),
        hasSavedChanges: !!last.querySelector('[data-hcv-saved-turn-card]') },
      clearance: { ...rectangle(clearance), declared: vars(content)['--thread-last-message-clearance'] },
      computedVars: { rootDefaults: vars(document.documentElement), own: ownVars, content: vars(content) },
      inlineVars: Object.fromEntries(keys.map(key => [key, root.style.getPropertyValue(key)])),
      quantizationDelta: {
        dock: Number.parseFloat(ownVars['--composer-measured-height']) - box(dock).height / zoom,
        editor: Number.parseFloat(ownVars['--composer-surface-measured-height']) - box(editor).height / zoom,
      },
      distanceToBottom: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
      gapToFooter: (box(dock).top - box(last).bottom) / zoom,
      gapToEditor: (box(editor).top - box(last).bottom) / zoom,
      editorOffsetInsideFooter: (box(editor).top - box(dock).top) / zoom,
    }]
  }), settlement)
}

export async function verifyComposerBottomGap({ page, expect, screenshot,
  expectedGap = 32, baseline = false, includeNarrow = true }) {
  const original = page.viewportSize()
  const results = []
  async function measure(label) {
    const values = await measureComposerBottomGap(page)
    const normal = values.filter(value => value.normal)
    assert(normal.length, 'A real ordinary main/tile transcript must be measured')
    for (const value of normal) {
      assert(value.settlement.settled && value.distanceToBottom <= 1, JSON.stringify(value))
      if (baseline) continue
      assert(value.gapToFooter >= expectedGap - 1, JSON.stringify(value))
      if (value.viewport.scrollHeight > value.viewport.height + 100) {
        assert(Math.abs(value.gapToFooter - expectedGap) <= 1, JSON.stringify(value))
      }
      // Exact HCV values, rather than an arbitrary relaxation for Hermes'
      // coarse 8px buckets. Both remain local to the measured owning surface.
      assert(Math.abs(Number.parseFloat(value.computedVars.own['--hcv-composer-dock-height']) - value.dock.height) <= .1, JSON.stringify(value))
      assert(Math.abs(Number.parseFloat(value.computedVars.own['--hcv-composer-surface-height']) - value.editor.height) <= .1, JSON.stringify(value))
    }
    results.push({ label, values })
    await screenshot?.(`composer-bottom-gap-${label}.png`, { animations: 'allow' })
  }
  try {
    await measure('wide')
    if (includeNarrow) {
      await page.setViewportSize({ width: 790, height: 650 })
      await measure('narrow')
    }
  } finally {
    if (original) await page.setViewportSize(original)
  }
  return { expectedGap, baseline, results }
}
