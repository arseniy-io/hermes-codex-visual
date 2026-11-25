import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function verifyNewChatWelcome({ page, expect, screenshot, projectChat, projectFolder, reply, openThemeSettings, closeSettings, themeCard }) {
  const observe = process.env.HERMES_VISUAL_WELCOME_OBSERVE === '1'
  const summaryOnly = process.env.HERMES_VISUAL_SUMMARY_ENTRY_ONLY === '1'
  const surfaces = page.locator('[data-chat-surface]:visible')
  const main = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const summaryState = () => page.evaluate(() => {
    const info = node => {
      const box = node.getBoundingClientRect()
      return { target: node.getAttribute('data-composer-target'), anchor: node.getAttribute('data-session-anchor'),
        hidden: Boolean(node.closest('[hidden], [inert], [data-pane-hidden]')), width: box.width, right: box.right }
    }
    return { width: innerWidth, chats: [...document.querySelectorAll('[data-chat-surface]')].map(info),
      toggles: [...document.querySelectorAll('[data-hcv-context-toggle]')].map(node => ({
        label: node.getAttribute('aria-label'), visible: node.getClientRects().length > 0 })) }
  })
  await expect(main.locator('[data-slot="aui_intro"] .wordmark')).toBeVisible()
  console.log('Summary in main new chat', JSON.stringify(await summaryState()))
  const summaryToggle = page.locator('[data-hcv-context-toggle]:visible')
  if (!observe) {
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    if (await summaryToggle.getAttribute('aria-expanded') === 'true') await summaryToggle.click()
    await expect(summaryToggle).toHaveAttribute('aria-label', 'Показать сводку')
  }
  const mainIntro = await main.locator('[data-slot="aui_intro"]').evaluate(el => el.outerHTML)
  const wordmarkMetrics = element => element.evaluate(el => {
    const visible = el.querySelector(':scope > :not([aria-hidden]) > span')
    const box = visible.getBoundingClientRect()
    const surface = el.closest('[data-slot="aui_thread-viewport"]').getBoundingClientRect()
    const css = getComputedStyle(visible)
    return { width: box.width, height: box.height, centerOffset: box.x + box.width / 2 - (surface.x + surface.width / 2), y: box.y,
      fontFamily: css.fontFamily, fontSize: css.fontSize, lineHeight: css.lineHeight, color: css.color }
  })
  const mainMark = await wordmarkMetrics(main.locator('.wordmark'))
  if (observe) console.log('Baseline main welcome', JSON.stringify(mainMark))

  const project = page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ }).first()
  const existing = projectChat('Ревью интерфейса').first()
  if (!await existing.isVisible()) await project.click()
  await expect(existing).toBeVisible()
  await existing.click()
  await expect(page.locator('[data-zone-tabstrip="grp-main"] [role="tab"][data-tree-tab="workspace"]')).toContainText('Ревью интерфейса')
  if (process.env.HERMES_VISUAL_RIGHT_MIRROR_TEST === '1') {
    const { verifyRightSidebar } = await import('./right-sidebar.spec-helper.mjs')
    return await verifyRightSidebar({ page, expect, screenshot, openThemeSettings, closeSettings, themeCard })
  }
  if (process.env.HERMES_VISUAL_RIGHT_PROBE) {
    const { probeNativeRight } = await import(pathToFileURL(process.env.HERMES_VISUAL_RIGHT_PROBE).href)
    const rightToggle = page.locator('[data-tour="right-pane-toggle"]:visible').first()
    const before = await probeNativeRight(page)
    console.log('HCV_RIGHT_BEFORE', JSON.stringify(before))
    const row = before.selected || before.rootRows[0]
    if (before.exactBridge && row?.mode === 'positional-group' && typeof row.groupShown === 'boolean') {
      let needsRestore = false
      try {
        await rightToggle.click()
        needsRestore = true
        await expect.poll(async () => {
          const next = await probeNativeRight(page)
          return next.exactBridge && (next.selected || next.rootRows[0])?.groupShown
        }, { timeout: 5000 }).toBe(!row.groupShown)
        console.log('HCV_RIGHT_AFTER', JSON.stringify(await probeNativeRight(page)))
      } finally {
        if (needsRestore) {
          await rightToggle.click()
          await expect.poll(async () => {
            const restored = await probeNativeRight(page)
            return restored.exactBridge && (restored.selected || restored.rootRows[0])?.groupShown
          }, { timeout: 5000 }).toBe(row.groupShown)
          console.log('HCV_RIGHT_RESTORED', JSON.stringify(await probeNativeRight(page)))
        }
      }
    } else console.log('HCV_RIGHT_TOGGLE_SKIPPED')
  }
  if (process.env.HERMES_VISUAL_RIGHT_PROBE_ONLY === '1') return { rightProbeOnly: true }
  let primaryProjectTitle
  if (!observe && summaryOnly) {
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    if (await summaryToggle.getAttribute('aria-expanded') !== 'true') await summaryToggle.click()
    const heading = page.locator('[data-hcv-context-card]:visible :is(.hcv-context-changes .hcv-context-label, [data-hcv-summary-section="project"] [data-hcv-summary-heading])')
    await expect(heading).not.toHaveText('Проект', { timeout: 30000 })
    primaryProjectTitle = await heading.textContent()
    await summaryToggle.click()
  }
  const strip = page.locator('[data-zone-tabstrip="grp-main"]')
  await strip.locator('button:has(> .codicon-add)').click()
  const selectedTile = strip.locator('[role="tab"][data-tree-tab^="session-tile:"][aria-selected="true"]')
  await expect(selectedTile).toBeVisible({ timeout: 30000 })
  const id = (await selectedTile.getAttribute('data-tree-tab')).slice('session-tile:'.length)
  const tile = strip.locator(`[role="tab"][data-tree-tab="session-tile:${id}"]`)
  const chat = page.locator(`[data-chat-surface][data-session-anchor="session-tile:${id}"]:visible`)
  await expect(chat).toBeVisible({ timeout: 30000 })
  console.log('Summary in empty project tab', JSON.stringify(await summaryState()))
  if (!observe) {
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    if (await summaryToggle.getAttribute('aria-expanded') !== 'true') await summaryToggle.click()
    const summary = page.locator('[data-hcv-context-card]:visible')
    await expect(summary).toBeVisible()
    await expect(chat).toHaveAttribute('data-hcv-summary-focused', '')
    await expect(page.locator('[data-chat-surface][data-hcv-summary-focused]')).toHaveCount(1)
    await expect(summary.locator('[data-hcv-summary-agents]')).toHaveCount(0)
    await expect(summary.locator(':is(.hcv-context-changes .hcv-context-label, [data-hcv-summary-section="project"] [data-hcv-summary-heading])'))
      .not.toHaveText('Проект', { timeout: 30000 })
    await screenshot('empty-project-summary.png')
    await summaryToggle.click()
    await expect(summaryToggle).toHaveAttribute('aria-label', 'Показать сводку')
  }
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await expect(editor).toBeVisible()
  await expect.poll(() => chat.locator('[data-slot="aui_thread-content"]').count()).toBe(1)
  const initial = await chat.evaluate(root => {
    const content = root.querySelector('[data-slot="aui_thread-content"]')
    const viewport = root.querySelector('[data-slot="aui_thread-viewport"]')
    const rect = e => e && ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y,
      width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })
    return { surface: root.outerHTML.slice(0, 500), content: content?.outerHTML.slice(0, 4000),
      viewport: rect(viewport), intro: rect(root.querySelector('[data-slot="aui_intro"]')),
      nativeIntroCount: root.querySelectorAll('[data-slot="aui_intro"]').length }
  })
  console.log('Empty project tab', JSON.stringify(initial))
  await screenshot('empty-project-tab.png')
  let tileMark
  if (observe && await chat.locator('[data-hcv-project-welcome] .wordmark').isVisible()) {
    console.log('Baseline tile welcome', JSON.stringify(await wordmarkMetrics(chat.locator('[data-hcv-project-welcome] .wordmark'))))
  }
  if (!observe) {
    const welcome = chat.locator('[data-hcv-project-welcome]')
    const wordmark = welcome.locator('.wordmark')
    await expect(wordmark).toBeVisible()
    await expect(wordmark).toHaveAttribute('aria-label', 'HERMES AGENT')
    tileMark = await wordmarkMetrics(wordmark)
    assert.equal(tileMark.centerOffset, 0, JSON.stringify(tileMark))
    // The existing baseline currently has a different vertical intro position
    // for the main surface. Keep its full comparison in the welcome test; the
    // focused summary run records the pre-existing difference separately.
    if (!summaryOnly) {
      assert.deepEqual({ ...tileMark, centerOffset: 0 }, { ...mainMark, centerOffset: 0 }, JSON.stringify({ mainMark, tileMark }))
    }

    // A distinct owner of the same empty slot must win over our fallback.
    await welcome.evaluate(el => {
      const other = document.createElement('div')
      other.setAttribute('data-test-other-empty', '')
      el.parentElement.append(other)
    })
    await expect(welcome).toBeHidden()
    await chat.locator('[data-test-other-empty]').evaluate(el => el.remove())
    await expect(welcome).toBeVisible()

    const mainTab = strip.locator('[role="tab"][data-tree-tab="workspace"]')
    await mainTab.click()
    await expect(page.locator('[data-hcv-project-welcome]:visible')).toHaveCount(0)
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    await tile.click()
    await expect(wordmark).toBeVisible()
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    await expect(chat).toHaveAttribute('data-hcv-summary-focused', '')

    await strip.locator('button:has(> .codicon-add)').click()
    await expect(tile).toHaveAttribute('aria-selected', 'true')
    await expect(wordmark).toBeVisible()

    if (!summaryOnly) {
      await openThemeSettings()
      await themeCard('Nous').click()
      await closeSettings()
      await expect(chat.locator('[data-hcv-project-welcome]')).toHaveCount(0)
      await openThemeSettings()
      await themeCard('Codex').click()
      await closeSettings()
      await expect(wordmark).toBeVisible()

      const changeIntro = async enabled => {
        await openThemeSettings()
        const rail = page.locator('[data-tour="overlay-nav"]')
        const general = rail.locator('button[data-tour="nav-config:appearance:general"]')
        if (!await general.isVisible()) await rail.locator('button[data-tour="nav-config:appearance"]').click()
        await general.click()
        const toggle = page.getByRole('switch', { name: 'Экран приветствия', exact: true })
        await expect(toggle).toHaveAttribute('aria-checked', String(!enabled))
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-checked', String(enabled))
        await closeSettings()
      }
      await changeIntro(false)
      await expect(chat.locator('[data-hcv-project-welcome]')).toHaveCount(0)
      await changeIntro(true)
      await expect(wordmark).toBeVisible()
    }
  }

  const prompt = 'Проверка первого сообщения в новой вкладке проекта.'
  await editor.fill(prompt)
  await editor.press('Enter')
  const bubble = chat.locator('[data-slot="aui_user-message-root"] button.composer-human-message').filter({ hasText: prompt })
  await expect(bubble).toBeVisible({ timeout: 30000 })
  await expect.poll(() => chat.locator('[data-slot="aui_intro"]').count()).toBe(0)
  if (!observe) {
    await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
    await expect(chat).toHaveAttribute('data-hcv-summary-focused', '')
    if (await summaryToggle.getAttribute('aria-expanded') !== 'true') await summaryToggle.click()
    await expect(page.locator('[data-hcv-context-card]:visible')).toBeVisible()
    if (summaryOnly) {
      await expect(chat.getByText(reply, { exact: false }).first()).toBeVisible({ timeout: 30000 })
      const secondCwd = path.join(path.dirname(projectFolder), 'hcv-second-workspace')
      const changed = await page.evaluate(async ({ anchor, secondCwd }) => {
        const committed = element => {
          if (!element) return null
          const keys = Object.keys(element)
          let fiber = element[keys.find(key => key.startsWith('__reactFiber$'))]
          const props = element[keys.find(key => key.startsWith('__reactProps$'))]
          if (fiber?.memoizedProps !== props) fiber = fiber?.alternate
          return fiber?.memoizedProps === props ? fiber : null
        }
        const surface = [...document.querySelectorAll('[data-chat-surface]')].find(node => node.dataset.sessionAnchor === anchor)
        const views = new Set(), actions = new Set()
        for (let f = committed(surface); f; f = f.return) {
          if (f.memoizedProps?.value?.kind === 'tile') views.add(f.memoizedProps.value)
          for (let dep = f.dependencies?.firstContext; dep; dep = dep.next) {
            if (dep.memoizedValue?.kind === 'tile') views.add(dep.memoizedValue)
          }
        }
        for (let f = committed(document.querySelector('[data-slot="statusbar"]')); f; f = f.return) {
          if (typeof f.memoizedProps?.actions?.changeSessionCwd === 'function') actions.add(f.memoizedProps.actions.changeSessionCwd)
        }
        if (views.size !== 1 || actions.size !== 1) return false
        const runtime = [...views][0].$runtimeId.get()
        if (!runtime) return false
        await [...actions][0](secondCwd, runtime)
        return true
      }, { anchor: `session-tile:${id}`, secondCwd })
      assert(changed, 'Expected the native action for the focused tile')
      const heading = page.locator('[data-hcv-context-card]:visible :is(.hcv-context-changes .hcv-context-label, [data-hcv-summary-section="project"] [data-hcv-summary-heading])')
      await expect(heading).toHaveText('hcv-second-workspace', { timeout: 30000 })
      await strip.locator('[role="tab"][data-tree-tab="workspace"]').click()
      await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
      if (await summaryToggle.getAttribute('aria-expanded') !== 'true') await summaryToggle.click()
      await expect(heading).toHaveText(primaryProjectTitle, { timeout: 30000 })
      await tile.click()
      await expect(summaryToggle).toHaveCount(1, { timeout: 15000 })
      if (await summaryToggle.getAttribute('aria-expanded') !== 'true') await summaryToggle.click()
      await expect(heading).toHaveText('hcv-second-workspace', { timeout: 30000 })
    }
    await summaryToggle.click()
  }
  const measure = (target = chat) => target.evaluate(root => {
    const viewport = root.querySelector('[data-slot="aui_thread-viewport"]')
    const content = root.querySelector('[data-slot="aui_thread-content"]')
    const bubble = root.querySelector('[data-slot="aui_user-message-root"] button.composer-human-message')
    const tabbar = document.querySelector('[data-zone-tabstrip="grp-main"]')
    const rect = el => el?.getBoundingClientRect()
    const v = rect(viewport), c = rect(content), b = rect(bubble), t = rect(tabbar)
    return { viewportTop: v?.top, contentTop: c?.top, bubbleTop: b?.top, tabbarBottom: t?.bottom,
      contentPaddingTop: getComputedStyle(content).paddingTop, viewportMask: getComputedStyle(viewport).maskImage,
      scrollTop: viewport.scrollTop, toViewport: b?.top - v?.top, toTabbar: b?.top - t?.bottom }
  })
  await chat.locator('[data-slot="aui_thread-viewport"]').evaluate(node => { node.scrollTop = 0 })
  const sent = await measure()
  console.log('First prompt geometry', JSON.stringify(sent))
  await screenshot('first-message.png')
  if (!observe && !summaryOnly) {
    assert.equal(sent.contentPaddingTop, '32px')
    assert.equal(sent.toViewport, 32)
    assert.equal(sent.toTabbar, 32)
    assert.match(sent.viewportMask, /16px/)
    await page.setViewportSize({ width: 1000, height: 760 })
    await chat.locator('[data-slot="aui_thread-viewport"]').evaluate(node => { node.scrollTop = 0 })
    const narrow = await measure()
    assert.equal(narrow.toViewport, 32)
    await screenshot('first-message-narrow.png')
    await page.setViewportSize({ width: 1440, height: 920 })
    await strip.locator('button:has(> .codicon-add)').click()
    const secondTile = strip.locator('[role="tab"][data-tree-tab^="session-tile:"][aria-selected="true"]')
    await expect(secondTile).not.toHaveAttribute('data-tree-tab', `session-tile:${id}`, { timeout: 30000 })
    const secondId = (await secondTile.getAttribute('data-tree-tab')).slice('session-tile:'.length)
    const secondChat = page.locator(`[data-chat-surface][data-session-anchor="session-tile:${secondId}"]:visible`)
    await expect(secondChat.locator('[data-hcv-project-welcome] .wordmark')).toBeVisible({ timeout: 30000 })
    await tile.click()
    await expect(bubble).toBeVisible()
    await page.locator('[data-tour="sidebar-nav-new-session"]').locator('xpath=ancestor::button[1]').click()
    const freshMain = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
    await expect(freshMain.locator('[data-slot="aui_intro"] .wordmark')).toBeVisible()
    const mainEditor = freshMain.locator('[data-slot="composer-rich-input"]')
    await mainEditor.fill('Проверка первого сообщения в основном новом чате.')
    await mainEditor.press('Enter')
    await expect(freshMain.locator('button.composer-human-message').filter({ hasText: 'Проверка первого сообщения в основном новом чате.' })).toBeVisible({ timeout: 30000 })
    await freshMain.locator('[data-slot="aui_thread-viewport"]').evaluate(node => { node.scrollTop = 0 })
    const mainSent = await measure(freshMain)
    assert.equal(mainSent.contentPaddingTop, '32px')
    assert.equal(mainSent.toViewport, 32)
  }
  return { mainIntro, mainMark, tileMark, initial, sent, surfaces: await surfaces.count(),
    ownerPrecedence: !observe, themeReset: !observe && !summaryOnly, introPreference: !observe && !summaryOnly,
    multipleProjectTabs: !observe && !summaryOnly, mainFirstMessage: !observe && !summaryOnly,
    summaryTwoProjects: !observe && summaryOnly }
}
