import assert from 'node:assert/strict'
import { verifyChatTransitionTabs } from './chat-transition-tabs.spec-helper.mjs'

const viewportSelector = '[data-chat-surface]:not([data-pane-hidden] *, [hidden] *) [data-slot="aui_thread-viewport"]'
const overlaySelector = '[data-overlay-surface]'
const longReply = 'Ответ, абзац 53.'
const tolerance = 3

export async function verifyChatTransitions({ page, expect, sidebar, navigation, save }) {
  await page.bringToFront()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const recents = sidebar.locator('[data-hcv-recents-toggle]')
  if (await recents.getAttribute('aria-expanded') !== 'true') await recents.press('Enter')
  const saved = sidebar.locator('[data-hcv-recents-list]').getByRole('button', { name: 'Тест длинного сообщения', exact: true })
  await saved.click()
  const viewport = page.locator(viewportSelector + ':visible').filter({ hasText: longReply })
  const overlay = page.locator(overlaySelector).last()
  const routeBefore = await page.evaluate(() => location.hash)
  const bottomDistance = () => viewport.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const summary = page.locator('[data-hcv-context-toggle]:visible')
  await expect(summary).toHaveAttribute('aria-expanded', 'true')

  async function goToBottom() {
    if (await bottomDistance() > 2) {
      // Establish the existing reader position without using another chat's jump control.
      await viewport.hover({ position: { x: 90, y: 170 } })
      await page.mouse.wheel(0, 10000)
    }
    await expect.poll(bottomDistance).toBeLessThanOrEqual(2)
    await expect(viewport).toHaveAttribute('data-following', 'true')
  }

  async function readUp(amount) {
    await viewport.hover({ position: { x: 90, y: 170 } })
    await page.mouse.wheel(0, -amount)
    await expect.poll(bottomDistance).toBeGreaterThan(Math.min(150, amount))
    await expect(viewport).toHaveAttribute('data-following', 'false')
  }

  const scenarios = []
  async function measure(name, action, { relativeToBottom = false, settledOnly = false } = {}) {
    await expect(viewport).toHaveCSS('opacity', '1')
    await settle()
    await viewport.evaluate((node, { viewportSelector, overlaySelector, longReply }) => {
      const box = node.getBoundingClientRect()
      const visibleParagraphs = [...node.querySelectorAll('p')].filter(p => {
        const rect = p.getBoundingClientRect()
        return rect.height && rect.top >= box.top + 16 && rect.bottom <= box.bottom
      })
      const key = visibleParagraphs[Math.floor(visibleParagraphs.length / 2)]?.textContent
      let current = node
      let paragraph = visibleParagraphs.find(p => p.textContent === key)
      let request
      let closeAt = null
      const frames = []
      const noteClick = event => {
        const surface = event.target.closest(overlaySelector)
        if (surface && (event.target === surface || event.target.closest('button[data-size="icon-titlebar"]'))) {
          closeAt = performance.now()
        }
      }
      document.addEventListener('click', noteClick, true)
      function sample() {
        const now = performance.now()
        const covered = Boolean(document.querySelector(overlaySelector))
        if (!current?.isConnected || current.closest('[hidden], [data-pane-hidden]')) {
          current = [...document.querySelectorAll(viewportSelector)].find(candidate => candidate.textContent.includes(longReply))
          paragraph = null
        }
        if (current && !paragraph?.isConnected) paragraph = [...current.querySelectorAll('p')].find(p => p.textContent === key)
        const shown = current && !covered && getComputedStyle(current).opacity === '1' && getComputedStyle(current).visibility === 'visible'
        if (shown && paragraph) {
          const y = paragraph.getBoundingClientRect().top
          const distance = current.scrollHeight - current.clientHeight - current.scrollTop
          const editor = current.closest('[data-chat-surface]').querySelector('[data-slot="composer-surface"]')
          const editorTop = editor?.getBoundingClientRect().top
          frames.push({ now, y, fromBottom: y - current.getBoundingClientRect().bottom, fromEditor: y - editorTop,
            distance, following: current.dataset.following })
        }
        request = requestAnimationFrame(sample)
      }
      sample()
      window.hcvChatReturnMeasurement = () => {
        cancelAnimationFrame(request)
        document.removeEventListener('click', noteClick, true)
        delete window.hcvChatReturnMeasurement
        return { frames, closeAt }
      }
    }, { viewportSelector, overlaySelector, longReply })

    let sample
    try {
      await action()
      await expect(viewport).toHaveCSS('opacity', '1')
      await page.evaluate(() => new Promise(resolve => {
        const start = performance.now()
        let frames = 0
        function wait() {
          if (++frames >= 12 && performance.now() - start >= 600) resolve()
          else requestAnimationFrame(wait)
        }
        requestAnimationFrame(wait)
      }))
    } finally {
      sample = await page.evaluate(() => window.hcvChatReturnMeasurement())
    }
    const { frames, closeAt } = sample
    assert(frames.length >= 4, `${name}: the visible message must be measured before and after the action`)
    const first = frames[0]
    const last = frames.at(-1)
    const pinned = name.endsWith('/bottom')
    const coordinate = pinned ? 'fromEditor' : relativeToBottom ? 'fromBottom' : 'y'
    const compared = settledOnly ? [last] : frames
    const distance = frame => Math.abs(frame[coordinate] - first[coordinate])
    const drift = Math.max(...compared.map(frame => Number.isFinite(distance(frame)) ? distance(frame) : Math.abs(frame.y - first.y)))
    const result = { name, drift, finalBottomDistance: last.distance, beforeBottomDistance: first.distance,
      maxBottomDistance: Math.max(...frames.map(frame => frame.distance)),
      rawDrift: Math.max(...compared.map(frame => Math.abs(frame.y - first.y))),
      following: last.following, frames: frames.length }
    if (closeAt !== null) {
      const firstAfterClose = frames.find(frame => frame.now >= closeAt)
      assert(firstAfterClose, `${name}: the transcript must reappear after the click`)
      result.closeMs = Math.round(firstAfterClose.now - closeAt)
    }
    scenarios.push(result)
    save?.({ scenarios })
  }

  async function clickBackdrop() {
    const point = await overlay.evaluate(node => {
      const { left, right, top, bottom } = node.getBoundingClientRect()
      for (const x of [left + 4, right - 4]) {
        for (const y of [top + 150, (top + bottom) / 2]) {
          if (document.elementFromPoint(x, y) === node) return { x, y }
        }
      }
      return null
    })
    assert(point, 'The overlay backdrop must be reachable by a mouse click')
    await page.mouse.click(point.x, point.y)
  }

  const sessions = async () => {
    await page.keyboard.press('Control+.')
    await overlay.locator('[data-tour="nav-sessions"]').click()
    await expect(overlay.getByPlaceholder(/Поиск сеансов|Search sessions/i)).toBeVisible()
  }
  async function closeCase(name, open = sessions, close = clickBackdrop) {
    await measure(name, async () => {
      await open()
      await expect(overlay).toBeVisible()
      await close()
      await expect(overlay).toHaveCount(0)
    })
    assert.equal(await page.evaluate(() => location.hash), routeBefore, name)
  }

  await goToBottom()
  await closeCase('sessions/backdrop/bottom')
  await goToBottom()
  await closeCase('sessions/repeat/bottom')
  await readUp(600)
  await closeCase('sessions/backdrop/reading')
  await closeCase('sessions/escape/reading', sessions, () => page.keyboard.press('Escape'))
  await closeCase('sessions/button/reading', sessions, () => overlay.getByRole('button', { name: /^(Закрыть|Close)/i }).first().click())
  for (const route of ['settings', 'profiles', 'agents', 'cron', 'webhooks', 'starmap', 'session-import']) {
    await closeCase(route + '/backdrop/reading', async () => {
      if (route === 'settings') await page.keyboard.press('Control+,')
      else await page.evaluate(route => { location.hash = '#/' + route }, route)
    })
  }

  for (const route of ['capabilities', 'messaging', 'artifacts']) {
    await measure(route + '/back/reading', async () => {
      await navigation(route).click()
      await expect(page).toHaveURL(new RegExp('#/' + route))
      await page.locator('[data-hcv-history] button').first().click()
    })
  }

  const sidebarTabs = page.locator('[data-zone-tabstrip="grp-sessions"]')
  for (const tab of ['hermes-bots:pane', 'terminal']) {
    const switchTo = id => sidebarTabs.locator('[data-tree-tab="' + id + '"]')
    await measure(tab + '/sidebar-return', async () => {
      await switchTo(tab).click()
      await expect(switchTo(tab)).toHaveAttribute('aria-selected', 'true')
      await switchTo('sessions').click()
      await expect(switchTo('sessions')).toHaveAttribute('aria-selected', 'true')
    })
  }

  const activity = page.locator('[data-hcv-activity]')
  await measure('activity/escape/reading', async () => {
    await page.locator('[data-hcv-activity-button]:visible').click()
    await expect(activity).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(activity).toBeHidden()
  })

  const padding = () => viewport.evaluate(node => parseFloat(getComputedStyle(node).paddingRight))
  await measure('summary/reopen/reading', async () => {
    const initial = await padding()
    await summary.click()
    await expect(summary).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(padding).toBe(0)
    await summary.click()
    await expect(summary).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(padding).toBe(initial)
  }, { settledOnly: true })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await readUp(900)
  await closeCase('sessions/backdrop/deeper-reading/reduced-motion')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const tabs = await verifyChatTransitionTabs({ page, expect, sidebar, measure })
  return { scenarios, tabs }
}

export function assertChatTransitions({ scenarios }) {
  for (const result of scenarios) {
    assert(result.drift <= tolerance, JSON.stringify(result))
    assert(Math.abs(result.finalBottomDistance - result.beforeBottomDistance) <= tolerance, JSON.stringify(result))
    if (result.name.endsWith('/bottom')) {
      assert(result.maxBottomDistance <= tolerance && result.finalBottomDistance <= 2 &&
        result.following === 'true', JSON.stringify(result))
    }
  }
}
