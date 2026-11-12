import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export async function verifySidebarChatOrder({ app, page, expect, screenshot, projectChat, sandbox }) {
  const host = await app.evaluate(({ app }) => ({
    version: app.getVersion(),
    userData: app.getPath('userData'),
    hermesHome: process.env.HERMES_HOME,
  }))
  assert.equal(path.resolve(host.hermesHome), path.resolve(sandbox.hermesHome))
  assert.equal(path.resolve(host.userData), path.resolve(sandbox.userDataDir))
  const fixture = process.env.HERMES_VISUAL_REPLACEMENT_PLUGIN || process.env.HERMES_VISUAL_FIXTURE_PLUGIN
  if (fixture) {
    const loaded = fs.readFileSync(path.join(sandbox.hermesHome, 'desktop-plugins/hermes-codex-visual/plugin.js'))
    assert.deepEqual(loaded, fs.readFileSync(fixture))
    console.log('Sidebar fixture', host.version, createHash('sha256').update(loaded).digest('hex'))
  }

  const capture = process.env.HERMES_VISUAL_SKIP_SCREENSHOTS !== '1'
  const names = ['Ревью интерфейса', 'Проверка каталога', 'Третий тестовый чат']
  const sidebar = page.locator('[data-tour="sessions-sidebar"]')
  const project = sidebar.getByRole('button', { name: 'Тестовый проект', exact: true })
  const line = page.locator('[data-hcv-chat-drop-line]')
  const ghost = page.locator('[data-hcv-sidebar-drag-ghost]')
  const workspace = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const composer = workspace.locator('[data-slot="composer-surface"]:visible').first()
  const overlay = workspace.locator('[data-slot="chat-drop-overlay"]')

  async function openProject() {
    await expect(project).toBeVisible({ timeout: 25000 })
    if (await project.getAttribute('aria-expanded') === 'false') await project.click()
    for (const name of names) await expect(projectChat(name)).toBeVisible()
  }

  async function order() {
    const rows = await Promise.all(names.map(async name => [name, (await projectChat(name).boundingBox())?.y ?? Infinity]))
    return rows.sort((a, b) => a[1] - b[1]).map(([name]) => name)
  }

  async function lift(name) {
    const bounds = await projectChat(name).boundingBox()
    assert(bounds)
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
  }

  async function overRow(name, fraction) {
    const bounds = await projectChat(name).boundingBox()
    assert(bounds)
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * fraction, { steps: 8 })
  }

  async function dropWithoutMotion(rows) {
    const elements = await Promise.all(rows.map(row => row.elementHandle()))
    await page.evaluate(nodes => {
      window.hcvSidebarDropFrames = new Promise(resolve => {
        window.addEventListener('pointerup', () => {
          const frames = []
          const sample = () => {
            const positions = nodes.map(node => node.isConnected ? node.getBoundingClientRect().top : null)
            const moving = document.getAnimations().some(({ effect }) =>
              effect?.target instanceof Element && nodes.some(node => effect.target.contains(node)) &&
              effect.getKeyframes().some(frame => frame.translate || frame.transform))
            const preview = document.querySelector('[data-hcv-chat-drop-line], [data-hcv-sidebar-drag-ghost]') !== null
            frames.push({ positions, moving, preview })
            if (frames.length === 4) resolve(frames)
            else requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        }, { capture: true, once: true })
      })
    }, elements)
    await page.mouse.up()
    const frames = await page.evaluate(() => window.hcvSidebarDropFrames)
    assert(frames.every(frame => !frame.moving && !frame.preview),
      'Neither row movement nor a drag preview should survive release: ' + JSON.stringify(frames))
    const first = frames[0].positions
    assert(first.every((top, index) => top !== null && (index === 0 || top > first[index - 1])),
      'The new order must be visible on the first frame: ' + JSON.stringify(frames))
    assert(frames.every(frame => frame.positions.every((top, index) => Math.abs(top - first[index]) < 1)),
      'Row positions should stay stable after release: ' + JSON.stringify(frames))
  }

  await openProject()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const projectItem = project.locator('xpath=ancestor::*[@data-sessions-project][1]')
  assert(await projectItem.locator('[class~="group/workspace"] > button[aria-expanded="true"]').count() >= 2)
  const initial = await order()
  const [first, second, third] = initial
  const expected = [second, first, third]
  await lift(second)
  await overRow(first, 0.2)
  await expect(line).toBeVisible()
  await expect(overlay).toHaveCSS('visibility', 'hidden')
  const chatPreview = await ghost.evaluate(node => {
    const icon = getComputedStyle(node, '::before')
    return { opacity: getComputedStyle(node).opacity, size: icon.maskSize, icon: icon.maskImage !== 'none' }
  })
  if (capture) await screenshot('insert.png', { animations: 'allow' })
  await dropWithoutMotion(expected.map(projectChat))
  assert.deepEqual(chatPreview, { opacity: '0.7', size: '16px 16px', icon: true })
  await expect.poll(order).toEqual(expected)
  await expect(line).toHaveCount(0)
  await expect(page.locator('[data-tree-tab^="session-tile:"]')).toHaveCount(0)
  const ordered = sidebar.locator('[data-hcv-sidebar-ordered="chat"]')
  await expect(ordered).toHaveCSS('reading-flow', 'grid-order')

  await lift(second)
  await overRow(first, 0.8)
  await expect(line).toBeVisible()
  await page.mouse.up()
  await expect.poll(order).toEqual(initial)
  await lift(second)
  await overRow(first, 0.2)
  await page.mouse.up()
  await expect.poll(order).toEqual(expected)

  await lift(second)
  await overRow(first, 0.8)
  await expect(line).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(line).toHaveCount(0)
  await expect.poll(order).toEqual(expected)

  await projectChat(first).click()
  await expect(page.locator('[data-tree-tab="workspace"]')).toContainText(first)
  await expect.poll(order).toEqual(expected)
  await lift(second)
  await overRow(first, 0.8)
  await expect(line).toBeVisible()
  const bounds = await workspace.boundingBox()
  assert(bounds)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 16 })
  await expect(line).toHaveCount(0)
  await expect(overlay).toContainText('Перетащите, чтобы связать этот чат')
  await expect(overlay).toHaveCSS('visibility', 'visible')
  await expect(overlay).toHaveCSS('opacity', '1')
  if (capture) await screenshot('link-drop.png')
  await page.mouse.up()
  await expect(composer.locator('[data-ref-kind="session"]')).toContainText(second)
  await expect.poll(order).toEqual(expected)

  const strip = page.locator('[data-zone-tabstrip]').filter({ has: page.locator('[data-tree-tab="workspace"]') })
  const tabStrip = await strip.boundingBox()
  assert(tabStrip)
  await lift(third)
  await page.mouse.move(tabStrip.x + tabStrip.width / 2, tabStrip.y + tabStrip.height / 2, { steps: 14 })
  await page.mouse.up()
  await expect(strip.locator('[data-tree-tab^="session-tile:"]').filter({ hasText: third })).toBeVisible()
  await expect.poll(order).toEqual(expected)
  if (capture) await screenshot('linked-and-stacked.png')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-hermes-theme', 'codex-workspace')
  await openProject()
  await expect.poll(order).toEqual(expected)
  if (capture) await screenshot('restored.png')

  const projectNames = ['Тестовый проект', 'Сайт', 'Дизайн']
  const projectButtons = Object.fromEntries(projectNames.map(name => [
    name, sidebar.locator('[data-hcv-project-name]').filter({ hasText: new RegExp('^' + name + '$') }),
  ]))
  async function projectOrder() {
    const bounds = await Promise.all(projectNames.map(async name => [name, (await projectButtons[name].boundingBox())?.y ?? Infinity]))
    return bounds.sort((a, b) => a[1] - b[1]).map(([name]) => name)
  }
  async function dragProject(name, target) {
    const start = await projectButtons[name].boundingBox()
    const end = await projectButtons[target].locator('xpath=ancestor::*[@data-hcv-project-row][1]').boundingBox()
    assert(start && end)
    await page.mouse.move(start.x + start.width / 3, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 3, end.y + end.height / 4, { steps: 12 })
  }
  for (const button of Object.values(projectButtons)) await expect(button).toBeVisible()
  const original = await projectOrder()
  const projectExpected = [original[1], original[0], original[2]]
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await dragProject(original[0], original[2])
  await expect(line).toBeVisible()
  await expect(line).toHaveCSS('height', '2px')
  await expect(line).toHaveCSS('background-color', 'rgb(2, 133, 255)')
  const dot = await line.evaluate(node => getComputedStyle(node, '::before').inlineSize)
  assert.equal(dot, '8px')
  await expect(ghost).toHaveAttribute('data-hcv-sidebar-drag-ghost', 'project')
  await expect(ghost).toHaveText(original[0])
  if (capture) await screenshot('project-insert.png', { animations: 'allow' })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(projectOrder).toEqual(original)
  await expect(ghost).toHaveCount(0)
  await dragProject(original[0], original[2])
  await expect(line).toBeVisible()
  const projectPreview = await ghost.evaluate(node => {
    const style = getComputedStyle(node)
    const icon = getComputedStyle(node, '::before')
    return { opacity: style.opacity, height: style.height, size: icon.maskSize, icon: icon.maskImage !== 'none' }
  })
  await dropWithoutMotion(projectExpected.map(name => projectButtons[name]))
  assert.deepEqual(projectPreview, { opacity: '0.7', height: '32px', size: '14px 14px', icon: true })
  await expect(line).toHaveCount(0)
  await expect.poll(projectOrder).toEqual(projectExpected)
  await expect.poll(order).toEqual(expected)
  await page.reload()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openProject()
  await expect.poll(projectOrder).toEqual(projectExpected)
  await expect.poll(order).toEqual(expected)
  console.log(JSON.stringify({ sidebarOrder: expected, projectOrder: projectExpected, restored: true, escape: true, nativeLink: true, nativeStack: true, stationaryDropFrames: 4 }))
}
