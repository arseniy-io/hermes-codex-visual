import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

async function sampleMotion(project) {
  const handle = await project.evaluateHandle(node => {
    const records = new Map()
    let frame
    function sample() {
      for (const animation of node.getAnimations({ subtree: true })) {
        const effect = animation.effect
        const frames = effect.getKeyframes()
        if (effect.target?.hasAttribute('data-hcv-project-reveal-motion') && frames[0].height) {
          records.set(animation, { property: 'height', from: frames[0].height, to: frames.at(-1).height, ...effect.getTiming() })
        } else if (effect.target?.matches('.row-hover') && frames[0].translate && Number(frames[0].opacity) === 0) {
          records.set(animation, { property: 'opacity', from: frames[0].opacity, to: frames.at(-1).opacity, ...effect.getTiming() })
        }
      }
      frame = requestAnimationFrame(sample)
    }
    sample()
    return { stop: () => { cancelAnimationFrame(frame); return [...records.values()] } }
  })
  return async () => {
    const result = await handle.evaluate(state => state.stop())
    await handle.dispose()
    return result
  }
}

export async function verifySidebarMore({ app, page, expect, screenshot, sandbox, openThemeSettings, closeSettings, themeCard }) {
  const runtime = await app.evaluate(({ app }) => ({
    version: app.getVersion(), home: process.env.HERMES_HOME, userData: app.getPath('userData'),
  }))
  assert.equal(path.resolve(runtime.home), path.resolve(sandbox.hermesHome))
  assert.equal(path.resolve(runtime.userData), path.resolve(sandbox.userDataDir))
  const fixture = process.env.HERMES_VISUAL_FIXTURE_PLUGIN
  const loaded = fs.readFileSync(path.join(sandbox.hermesHome, 'desktop-plugins/hermes-codex-visual/plugin.js'))
  assert.deepEqual(loaded, fs.readFileSync(fixture))
  const moduleSha256 = createHash('sha256').update(loaded).digest('hex')
  const sidebar = page.locator('[data-tour="sessions-sidebar"]')
  const mode = sidebar.locator('[data-sessions-mode]').first()
  const heading = name => sidebar.getByRole('button', { name, exact: true })
  const item = name => heading(name).locator('xpath=ancestor::*[@data-sessions-project][1]')
  const chats = name => item(name).locator(
    ':scope > div.grid > .row-hover:visible, :scope > div.grid > [data-hcv-project-more-tail] > .row-hover:visible',
  )
  const more = name => item(name).getByRole('button', { name: 'Показать больше', exact: true })
  const oldMore = sidebar.getByRole('button', { name: /Показать все сессии|Show all .*sessions/i })
  const allProfiles = process.env.HERMES_VISUAL_FOCUS === 'sidebar-more-all'
  const main = 'Тестовый проект'
  const five = 'Пять чатов'
  const total = allProfiles ? 61 : 60
  const ensureOpen = async name => {
    await expect(heading(name)).toBeVisible({ timeout: 25000 })
    if (await heading(name).getAttribute('aria-expanded') === 'false') await heading(name).click()
  }
  const close = async name => {
    await heading(name).click()
    await expect(heading(name)).toHaveAttribute('aria-expanded', 'false')
    await expect(chats(name)).toHaveCount(0)
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  if (allProfiles) {
    await sidebar.getByRole('button', { name: /All profiles on this gateway|Все профили/i }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hermes.desktop.showAllProfiles'))).toBe('true')
    await expect(mode).toHaveAttribute('data-sessions-mode', /^(flat|projects)$/)
    if (await mode.getAttribute('data-sessions-mode') === 'flat') await sidebar.locator('[data-hcv-show-projects]:visible').click()
  }
  await expect(mode).toHaveAttribute('data-sessions-mode', 'projects', { timeout: 30000 })
  await ensureOpen(main)
  await expect(chats(main)).toHaveCount(4, { timeout: 30000 })
  await expect(more(main)).toBeVisible()
  await expect(oldMore).toHaveCount(0)
  await ensureOpen('Сайт')
  await expect(chats('Сайт')).toHaveCount(4, { timeout: 30000 })
  await expect(more('Сайт')).toHaveCount(0)
  await ensureOpen('Дизайн')
  await expect(chats('Дизайн')).toHaveCount(3)
  await expect(more('Дизайн')).toHaveCount(0)
  await close('Сайт')
  await close('Дизайн')

  await ensureOpen(five)
  await expect(chats(five)).toHaveCount(4, { timeout: 30000 })
  const button = more(five)
  await expect(button).toBeVisible()
  await page.mouse.move(500, 100)
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const style = control => control.evaluate(node => {
    const s = getComputedStyle(node)
    const { x, y, width, height } = node.getBoundingClientRect()
    const text = document.createRange()
    text.selectNodeContents(node)
    return { x, y, width, height, textX: text.getBoundingClientRect().left, children: node.children.length,
      color: s.color, background: s.backgroundColor, font: s.font, fontFamily: s.fontFamily,
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      radius: s.borderRadius, border: s.borderWidth, decoration: s.textDecorationLine, transition: s.transitionDuration }
  })
  const idle = await style(button)
  assert.equal(idle.children, 0)
  assert.equal(idle.height, 26)
  assert.equal(idle.border, '0px')
  assert.equal(idle.background, 'rgba(0, 0, 0, 0)')
  assert.equal(idle.decoration, 'none')
  const fourth = chats(five).nth(3)
  const fourthBounds = await fourth.boundingBox()
  const fourthLabel = await fourth.locator('.hover-marquee-inner').evaluate(node => {
    const style = getComputedStyle(node)
    return { x: node.getBoundingClientRect().left, fontFamily: style.fontFamily,
      fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color }
  })
  assert(idle.y >= fourthBounds.y + fourthBounds.height, 'More follows the fourth chat')
  assert(Math.abs(idle.textX - fourthLabel.x) <= 1, JSON.stringify({ buttonX: idle.textX, chatX: fourthLabel.x }))
  assert.equal(idle.fontFamily, fourthLabel.fontFamily)
  assert.equal(idle.fontSize, fourthLabel.fontSize)
  assert.equal(idle.lineHeight, fourthLabel.lineHeight)
  assert.equal(idle.fontWeight, '400')
  const captureProject = async name => screenshot(name, { animations: 'allow', clip: await item(five).boundingBox() })
  await captureProject('sidebar-more-idle.png')

  await button.hover()
  await expect(button).toHaveCSS('color', fourthLabel.color)
  const hovered = await style(button)
  assert.notEqual(hovered.background, idle.background)
  assert.notEqual(hovered.color, idle.color)
  assert.equal(hovered.color, fourthLabel.color)
  assert.equal(hovered.decoration, 'none')
  assert.equal(hovered.border, '0px')
  assert.equal(hovered.font, idle.font)
  assert.equal(hovered.width, idle.width)
  assert.equal(hovered.height, idle.height)
  assert.equal(hovered.textX, idle.textX)
  await captureProject('sidebar-more-hover.png')

  const sampleFive = await sampleMotion(item(five))
  await button.click()
  await expect(chats(five)).toHaveCount(5)
  await expect(button).toHaveCount(0)
  await expect(chats(five).nth(4)).toHaveCSS('opacity', '1')
  const fiveMotion = await sampleFive()
  assert(fiveMotion.some(({ property, from, to, duration, easing }) =>
    property === 'opacity' && Number(from) === 0 && Number(to) === 1 && duration === 220 && easing === 'ease-out'),
  JSON.stringify(fiveMotion))
  await expect(chats(main)).toHaveCount(4)
  await close(five)
  await ensureOpen(five)
  await expect(chats(five)).toHaveCount(4)
  await expect(more(five)).toBeVisible()
  await close(five)

  const sampleMain = await sampleMotion(item(main))
  await more(main).focus()
  await expect(more(main)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(chats(main)).toHaveCount(total, { timeout: 30000 })
  await expect(more(main)).toHaveCount(0)
  await expect(chats(main).nth(4).locator('button[data-slot="row-button"]')).toBeFocused()
  await expect(item(main).locator('[data-hcv-project-reveal-motion]')).toHaveCount(0)
  const mainMotion = await sampleMain()
  assert(mainMotion.some(({ property, from, to, duration }) =>
    property === 'height' && parseFloat(to) > parseFloat(from) && duration === 220), JSON.stringify(mainMotion))
  await expect(mode).toHaveAttribute('data-sessions-mode', 'projects')
  await expect(oldMore).toHaveCount(0)
  if (allProfiles) await expect(item(main).getByText('Чат другого профиля', { exact: true })).toBeVisible()
  await close(main)
  await ensureOpen(main)
  await expect(chats(main)).toHaveCount(4)
  await expect(more(main)).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sampleReduced = await sampleMotion(item(main))
  await more(main).click()
  await expect(chats(main)).toHaveCount(total, { timeout: 30000 })
  const reducedMotion = await sampleReduced()
  assert.deepEqual(reducedMotion, [])
  const restoredChat = chats(main).nth(4).locator('button[data-slot="row-button"]')
  await restoredChat.click()
  await expect(restoredChat).toBeVisible()
  await expect(mode).toHaveAttribute('data-sessions-mode', 'projects')

  await openThemeSettings()
  await themeCard('Nous').click()
  await closeSettings()
  await expect(page.locator('[data-hcv-project-more], [data-hcv-project-limited], [data-hcv-project-more-tail]')).toHaveCount(0)
  await openThemeSettings()
  await themeCard('Codex').click()
  await closeSettings()
  await ensureOpen(main)
  await expect(chats(main)).toHaveCount(4, { timeout: 25000 })
  await expect(more(main)).toBeVisible()
  await expect(oldMore).toHaveCount(0)
  await screenshot('sidebar-more-final.png')
  const result = { moduleSha256, scope: allProfiles ? 'all-profiles' : 'profile',
    counts: { small: [3, 4], five: [4, 5, 4], main: [4, total, 4] }, idle, hovered, fiveMotion, mainMotion,
    reducedMotion, inline: true, legacyHidden: true }
  console.log('Sidebar more verification', JSON.stringify(result))
  return result
}
