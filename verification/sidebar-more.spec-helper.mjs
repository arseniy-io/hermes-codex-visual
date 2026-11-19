import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export async function verifySidebarMore({ app, page, expect, screenshot, sandbox, openThemeSettings, closeSettings, themeCard }) {
  const runtime = await app.evaluate(({ app }) => ({
    version: app.getVersion(), home: process.env.HERMES_HOME, userData: app.getPath('userData'),
  }))
  assert.equal(path.resolve(runtime.home), path.resolve(sandbox.hermesHome))
  assert.equal(path.resolve(runtime.userData), path.resolve(sandbox.userDataDir))
  const fixture = process.env.HERMES_VISUAL_FIXTURE_PLUGIN
  const loaded = fs.readFileSync(path.join(sandbox.hermesHome, 'desktop-plugins/hermes-codex-visual/plugin.js'))
  assert.deepEqual(loaded, fs.readFileSync(fixture))
  const hash = createHash('sha256').update(loaded).digest('hex')
  const sidebar = page.locator('[data-tour="sessions-sidebar"]')
  const heading = name => sidebar.getByRole('button', { name, exact: true })
  const item = name => heading(name).locator('xpath=ancestor::*[@data-sessions-project][1]')
  const chats = name => item(name).locator(':scope > div.grid:not([data-hcv-project-row]) > .row-hover:visible')
  const more = name => item(name).getByRole('button', { name: 'Показать больше', exact: true })
  const count = async name => chats(name).count()
  const ensureOpen = async name => {
    await expect(heading(name)).toBeVisible({ timeout: 25000 })
    if (await heading(name).getAttribute('aria-expanded') === 'false') await heading(name).click()
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-more-all') {
    await sidebar.getByRole('button', { name: /All profiles on this gateway|Все профили/i }).click()
    // Hermes keeps a separate grouping preference for all profiles and may
    // start that view as a flat list even when the active profile uses projects.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hermes.desktop.showAllProfiles'))).toBe('true')
    await expect(sidebar.locator('[data-sessions-mode]').first()).toHaveAttribute('data-sessions-mode', /^(flat|projects)$/)
    const projects = sidebar.locator('[data-hcv-show-projects]:visible')
    if (await projects.count()) await projects.click()
    await expect(sidebar.locator('[data-sessions-mode="projects"]')).toBeVisible({ timeout: 30000 })
  }
  await ensureOpen('Тестовый проект')
  if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-more-all' && process.env.HERMES_VISUAL_MORE_DIAGNOSTIC !== '1') {
    const native = item('Тестовый проект').locator('button[class~="group/more"]')
    await expect(native).toBeVisible({ timeout: 30000 })
    console.log('All-profiles preview', JSON.stringify({ count: await count('Тестовый проект'), label: await native.textContent() }))
    await native.click()
    // The project view must remain usable after the sidebar has reconciled.
    await page.waitForTimeout(300)
    const projectView = sidebar.locator('[data-sessions-mode="project"]')
    await expect(projectView).toBeVisible({ timeout: 10000 })
    await expect.poll(() => projectView.locator('.row-hover:visible').count(), { timeout: 20000 }).toBeGreaterThan(3)
    await projectView.locator('button[class~="group/back"]').click()
    await expect(sidebar.locator('[data-sessions-mode="projects"]')).toBeVisible()
    await expect(heading('Тестовый проект')).toBeVisible()
    console.log('All profiles can open the complete project chat list.')
    return
  }
  if (process.env.HERMES_VISUAL_FOCUS === 'sidebar-more-all' && process.env.HERMES_VISUAL_MORE_DIAGNOSTIC === '1') {
    await expect(item('Тестовый проект').locator('button[class~="group/more"]')).toBeVisible({ timeout: 30000 })
    const info = await item('Тестовый проект').evaluate(async node => {
      const button = node.querySelector('[data-hcv-native-project-action]')
      const key = Object.keys(button).find(key => key.startsWith('__reactFiber$'))
      const propsKey = Object.keys(button).find(key => key.startsWith('__reactProps$'))
      let fiber = button[key]
      if (fiber?.memoizedProps !== button[propsKey]) fiber = fiber?.alternate
      while (fiber && !(fiber.memoizedProps?.project?.id === node.dataset.sessionsProject && typeof fiber.memoizedProps?.renderRows === 'function')) fiber = fiber.return
      if (!fiber) return { error: 'Project fiber missing' }
      const hooks = []
      for (let hook = fiber.memoizedState; hook; hook = hook.next) {
        const value = hook.memoizedState
        hooks.push({ value: value === null || ['number', 'boolean', 'string'].includes(typeof value) ? value : typeof value,
          keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 8) : [], dispatch: typeof hook.queue?.dispatch === 'function' })
      }
      const result = await window.hermesDesktop.api({ connectionId: 'local', path: '/api/profiles/projects/tree?preview_limit=100', timeoutMs: 20000 })
      const match = result.projects.find(project => project.id === node.dataset.sessionsProject)
      return { allProfiles: localStorage.getItem('hermes.desktop.showAllProfiles'), fiberName: fiber.type?.name,
        propsKeys: Object.keys(fiber.memoizedProps), hooks, nativeCount: fiber.memoizedProps.project.sessionCount,
        nativePreview: fiber.memoizedProps.project.previewSessions?.length, fetchedCount: match?.sessionCount,
        fetchedPreview: match?.previewSessions?.length, fetchedRepoSessions: match?.repos?.flatMap(repo => repo.groups.flatMap(group => group.sessions)).length }
    })
    console.log('All profiles project diagnostic', JSON.stringify(info))
    return
  }
  await expect.poll(() => count('Тестовый проект'), { timeout: 30000 }).toBe(4)
  await expect(more('Тестовый проект')).toBeVisible()
  await ensureOpen('Сайт')
  await expect.poll(() => count('Сайт'), { timeout: 30000 }).toBe(4)
  await expect(more('Сайт')).toHaveCount(0)
  await ensureOpen('Дизайн')
  await expect.poll(() => count('Дизайн'), { timeout: 30000 }).toBe(3)
  await expect(more('Дизайн')).toHaveCount(0)

  const button = more('Тестовый проект')
  await page.mouse.move(500, 100)
  const idle = await button.evaluate(node => {
    const s = getComputedStyle(node)
    return { color: s.color, font: s.font, height: s.height, decoration: s.textDecorationLine, transition: s.transitionDuration }
  })
  await button.hover()
  await expect.poll(() => button.evaluate(node => getComputedStyle(node).color)).not.toBe(idle.color)
  const hovered = await button.evaluate(node => ({ color: getComputedStyle(node).color, decoration: getComputedStyle(node).textDecorationLine }))
  assert.equal(hovered.decoration, 'none')
  await screenshot('sidebar-more-hover.png', { animations: 'allow' })

  for (const expected of [14, 24, 34, 44, 54, 60]) {
    await more('Тестовый проект').click()
    await expect.poll(() => count('Тестовый проект'), { timeout: 30000 }).toBe(expected)
  }
  await expect(more('Тестовый проект')).toHaveCount(0)
  await heading('Тестовый проект').click()
  await expect(heading('Тестовый проект')).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => count('Тестовый проект')).toBe(0)
  await heading('Тестовый проект').click()
  await expect.poll(() => count('Тестовый проект'), { timeout: 15000 }).toBe(4)
  await expect(more('Тестовый проект')).toBeVisible()
  await more('Тестовый проект').focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => count('Тестовый проект')).toBe(14)
  await expect(chats('Тестовый проект').nth(4).locator('button[data-slot="row-button"]')).toBeFocused()
  await chats('Тестовый проект').nth(4).locator('button[data-slot="row-button"]').click()
  await expect(chats('Тестовый проект').nth(4).locator('button[data-slot="row-button"]')).toBeVisible()

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('[data-hcv-project-more], [data-hcv-project-chat-hidden], [data-hcv-project-more-native]')).toHaveCount(0)
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await ensureOpen('Тестовый проект')
  await expect.poll(() => count('Тестовый проект'), { timeout: 20000 }).toBe(4)
  await expect(more('Тестовый проект')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedDuration = await more('Тестовый проект').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))
  assert(reducedDuration <= 0.001, `Reduced motion should be effectively immediate, got ${reducedDuration}s`)
  await screenshot('sidebar-more-final.png')
  console.log('Sidebar more verification', JSON.stringify({ runtime, moduleSha256: hash, idle, hovered,
    counts: [4, 14, 24, 34, 44, 54, 60], reset: 4, otherProjects: [4, 3] }))
}
