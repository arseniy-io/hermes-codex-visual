import assert from 'node:assert/strict'

// The CSS family list alone cannot establish which font drew the glyphs.
// This is an isolated-profile measurement, including actual Chromium font faces.
export async function createTypographyAudit(page, save) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const states = []
  let serial = 0
  async function capture(name) {
    if (process.env.HERMES_VISUAL_TYPOGRAPHY === 'verify') {
      // The theme data attribute changes before React's theme paint and the
      // scoped styles finish mounting. Measure the settled state.
      await page.waitForFunction(() => {
        const root = document.documentElement
        if (root.dataset.hermesTheme !== 'codex-workspace' || !root.hasAttribute('data-hermes-codex-visual')) return true
        const body = getComputedStyle(document.body)
        return body.fontSize === '14px' && body.fontWeight === '430'
      }, undefined, { timeout: 10000 })
    }
    await page.evaluate(() => document.fonts.ready)
    const prefix = `hcv-font-${++serial}-`
    const inventory = await page.evaluate(prefix => {
      const groups = new Map()
      const probes = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let text
      while ((text = walker.nextNode())) {
        const value = text.textContent.trim()
        const node = text.parentElement
        if (!value || !node || node.closest('style,script,svg,[hidden],[data-pane-hidden]')) continue
        if (!node.getClientRects().length) continue
        const css = getComputedStyle(node)
        if (css.visibility !== 'visible' || css.display === 'none') continue
        const range = document.createRange()
        range.selectNode(text)
        if (!range.getBoundingClientRect().width) continue
        const style = {
          family: css.fontFamily, size: css.fontSize, weight: css.fontWeight,
          line: css.lineHeight, tracking: css.letterSpacing,
          synthesis: css.fontSynthesis, features: css.fontFeatureSettings,
        }
        const key = JSON.stringify(style)
        let entry = groups.get(key)
        if (!entry) {
          entry = { ...style, count: 0, examples: [], samples: {} }
          groups.set(key, entry)
        }
        entry.count++
        if (entry.examples.length < 4) entry.examples.push({ text: value.slice(0, 120),
          tag: node.tagName.toLowerCase(), classes: String(node.className).slice(0, 240),
          field: node.closest('[id]')?.id || '', slot: node.dataset.slot || '' })
        const script = /[А-Яа-яЁё]/.test(value) ? 'cyrillic' : /[A-Za-z]/.test(value) ? 'latin' : 'other'
        // Direct-text leaves avoid mixing a text face with a descendant icon font.
        if (!entry.samples[script] && !node.querySelector('svg,.codicon')) {
          const id = prefix + probes.length
          node.setAttribute('data-hcv-font-probe', id)
          entry.samples[script] = id
          probes.push({ id, key, script, text: value.slice(0, 120),
            field: node.closest('[id]')?.id || '',
            exception: node.closest('[id="setting-field-appearance.terminal-font"]') ? 'native-terminal-font-preview' : null })
        }
      }
      const rootStyle = getComputedStyle(document.documentElement)
      const nav = [...document.querySelectorAll('[data-tour="overlay-nav"] button.row-hover')].map(node => {
        const css = getComputedStyle(node)
        return { size: css.fontSize, weight: css.fontWeight, line: css.lineHeight }
      })
      const auxiliary = [...document.querySelectorAll('[id^="aux-task-"] .mt-1 > span.font-mono')].map(node => {
        const css = getComputedStyle(node)
        return { family: css.fontFamily, size: css.fontSize, weight: css.fontWeight, line: css.lineHeight }
      })
      const editors = [...document.querySelectorAll('[data-slot="composer-rich-input"]')]
        .filter(node => node.getClientRects().length && !node.closest('[hidden],[data-pane-hidden]')).map(node => {
          const css = getComputedStyle(node)
          return { size: css.fontSize, weight: css.fontWeight, line: css.lineHeight, family: css.fontFamily }
        })
      const uiRoles = []
      for (const [role, selector] of [
        ['setting-hint', '[data-overlay-surface] [class~="@container"] .mt-1.font-mono'],
        ['model-summary', '[id^="aux-task-"] .mt-1 > span.font-mono'],
        ['model-option', '[data-slot="command-item"].font-mono'],
        ['model-provider', '[cmdk-group-heading] .font-mono'],
        ['sync-label', '[data-chat-surface] div.font-mono.shadow-composer'],
        ['cron-prompt', '#cron-prompt[data-slot="textarea"]'],
      ]) {
        for (const node of document.querySelectorAll(selector)) {
          if (!node.getClientRects().length) continue
          const css = getComputedStyle(node)
          uiRoles.push({ role, text: node.textContent.trim().slice(0, 100), family: css.fontFamily,
            size: css.fontSize, weight: css.fontWeight, line: css.lineHeight })
        }
      }
      return { route: location.hash, theme: document.documentElement.dataset.hermesTheme,
        root: { rem: rootStyle.fontSize, synthesisWeight: rootStyle.fontSynthesisWeight,
          uiSize: rootStyle.getPropertyValue('--hcv-font-ui-size'), marker: document.documentElement.hasAttribute('data-hermes-codex-visual'),
          sans: rootStyle.getPropertyValue('--dt-font-sans'), mono: rootStyle.getPropertyValue('--dt-font-mono') },
        nav, auxiliary, editors, uiRoles,
        zoom: devicePixelRatio, body: {
          family: getComputedStyle(document.body).fontFamily,
          size: getComputedStyle(document.body).fontSize,
          weight: getComputedStyle(document.body).fontWeight,
          line: getComputedStyle(document.body).lineHeight,
        }, groups: [...groups.values()], probes }
    }, prefix)
    const { root } = await cdp.send('DOM.getDocument', { depth: 0, pierce: true })
    const fonts = []
    for (const probe of inventory.probes) {
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId, selector: `[data-hcv-font-probe="${probe.id}"]`,
      })
      if (!nodeId) continue
      const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      fonts.push({ ...probe, fonts: result.fonts })
    }
    await page.evaluate(prefix => {
      for (const node of document.querySelectorAll(`[data-hcv-font-probe^="${prefix}"]`)) node.removeAttribute('data-hcv-font-probe')
    }, prefix)
    delete inventory.probes
    const result = { name, ...inventory, fonts }
    states.push(result)
    save({ states, completed: false })
    if (process.env.HERMES_VISUAL_TYPOGRAPHY === 'verify' && result.theme === 'codex-workspace' && result.root.marker) {
      assert.equal(result.body.size, '14px', name)
      assert.equal(result.body.weight, '430', name)
      assert.equal(result.root.rem, '16px', 'Typography must not resize rem-based geometry')
      assert.equal(result.root.synthesisWeight, 'none', name)
      assert.match(result.root.mono, /^ui-monospace/, name)
      for (const row of result.nav) assert.deepEqual(row, { size: '14px', weight: '400', line: '21px' }, name)
      for (const row of result.auxiliary) {
        assert.match(row.family, /Segoe UI/)
        assert.deepEqual({ size: row.size, weight: row.weight, line: row.line },
          { size: '12px', weight: '430', line: '16px' }, name)
      }
      for (const role of result.uiRoles) {
        assert.match(role.family, /Segoe UI/, `${name}: ${role.role}`)
        assert.doesNotMatch(role.family, /monospace|Consolas|JetBrains/, `${name}: ${role.role}`)
      }
      const oldFaces = fonts.filter(sample => !sample.exception).flatMap(sample => sample.fonts.filter(face => face.glyphCount > 0 && face.familyName === 'JetBrains Mono')
        .map(face => ({ text: sample.text, face: face.familyName })))
      assert.deepEqual(oldFaces, [], `Unexpected Hermes text face in ${name}`)
    }
    return result
  }
  return {
    capture,
    async finish(extra = {}) {
      assert(states.length, 'Expected actual typography measurements')
      if (process.env.HERMES_VISUAL_TYPOGRAPHY === 'verify') {
        assert(states.some(state => state.theme === 'codex-workspace' && state.root.marker && state.body.size === '14px'),
          'Expected to measure the active, loaded Codex theme')
      }
      assert(states.some(state => state.fonts.some(sample => sample.fonts.some(face => face.glyphCount > 0))),
        'Expected Chromium to report the font faces that drew actual UI text')
      save({ ...extra, states, completed: true })
      await cdp.detach()
    },
  }
}
