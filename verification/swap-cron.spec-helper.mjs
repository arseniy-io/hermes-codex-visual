import assert from 'node:assert/strict'

async function verifyToolbar({ page, expect, screenshot }) {
  const toolbar = page.locator('[data-titlebar-cluster="right"]')
  const flip = toolbar.getByRole('button', { name: 'Поменять панели местами' })
  const rail = page.locator('[data-tree-group="grp-sessions"][data-window-top]')
  const workspace = page.locator('[data-tree-group="grp-main"][data-window-top]')
  const summary = page.locator('[data-hcv-context-card]')
  const barLayout = async () => {
    const [tools, side, main, card, right] = await Promise.all([
      ...[toolbar, rail, workspace, summary].map(locator => locator.boundingBox()),
      toolbar.evaluate(node => parseFloat(getComputedStyle(node).right)),
    ])
    if (!tools || !side || !main) return { tools, side, main, card }
    const flipped = side.x > main.x
    const fits = flipped ? tools.x + tools.width <= side.x - 8 : side.x + side.width <= tools.x && right === 13
    const cardFits = card && card.x + card.width <= main.x + main.width
    return { flipped, fits, cardFits, tools, side, main, card, right }
  }
  const sidebarControls = () => rail.locator('[data-hcv-sidebar-bar] button').evaluateAll(buttons =>
    buttons.map(button => {
      const box = button.getBoundingClientRect()
      const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return button.contains(target)
    }),
  )
  const bothButtonsReachable = [true, true]
  await expect.poll(barLayout).toMatchObject({ flipped: false, fits: true, cardFits: true })
  await flip.click()
  await expect.poll(barLayout).toMatchObject({ flipped: true, fits: true, cardFits: true })
  await expect.poll(sidebarControls).toEqual(bothButtonsReachable)
  await screenshot('toolbar-flipped.png')
  await flip.click()
  await expect.poll(barLayout).toMatchObject({ flipped: false, fits: true, cardFits: true })
  await flip.click()
  await expect.poll(barLayout).toMatchObject({ flipped: true, fits: true, cardFits: true })
  const tabs = rail.locator('[data-zone-tabstrip="grp-sessions"]')
  await tabs.locator('[data-tree-tab="hermes-bots:pane"]').click()
  await expect.poll(barLayout).toMatchObject({ flipped: true, fits: true })
  await tabs.locator('[data-tree-tab="sessions"]').click()
  await expect(tabs.locator('[data-tree-tab="sessions"]')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(sidebarControls).toEqual(bothButtonsReachable)
  await flip.click()
  await expect.poll(barLayout).toMatchObject({ flipped: false, fits: true, cardFits: true })
}

export async function verifySwapAndCron({ page, expect, sidebar, screenshot }) {
  await verifyToolbar({ page, expect, screenshot })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const preview = sidebar.locator('[data-hcv-cron-sidebar]')
  const previewToggle = preview.getByRole('button', { name: 'Cron-задачи', exact: true })
  await previewToggle.click()
  const title = 'Проверка Cron в боковой панели'
  const previewJob = preview.getByRole('button', { name: title, exact: true })
  await expect(previewJob).toBeVisible()
  await previewJob.hover()
  await expect(previewJob.locator('[data-hcv-cron-icon="right"]')).toHaveCSS('opacity', '1')
  await previewToggle.click()
  await expect(preview.locator('[data-hcv-cron-body]')).toHaveAttribute('inert', '')

  await sidebar.getByRole('button', { name: 'Фильтры', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Группировка/ }).press('ArrowRight')
  await page.getByRole('menuitemradio', { name: 'Обновление', exact: true }).click()
  for (let i = 0; i < 2 && await page.locator('[role="menu"][data-state="open"]').count(); i++) {
    await page.keyboard.press('Escape')
  }
  await expect(preview).toHaveCount(0)
  const cron = sidebar.locator('[data-hcv-cron-native]')
  const heading = cron.getByRole('button', { name: 'Cron-задачи', exact: true })
  const list = cron.locator(':scope > [data-slot="sidebar-group-content"]')
  const motion = '[data-hcv-disclosure-motion]'
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await heading.click()
  await expect(list).toHaveAttribute('data-hcv-disclosure-motion', '')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(cron.locator(motion)).toHaveCount(0)

  const row = cron.locator('[class~="group/cron"]').filter({ hasText: title })
  const job = row.locator(':scope > button[aria-expanded]')
  const label = row.getByText(title, { exact: true })
  const actions = row.locator('[data-row-actions] > div > div')
  const run = actions.getByRole('button', { name: 'Запустить сейчас' })
  const manage = actions.getByRole('button', { name: 'Управлять' })
  await page.mouse.move(700, 350)
  await expect(actions).toHaveCSS('opacity', '0')
  const before = await label.boundingBox()
  await job.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  assert.deepEqual(await label.boundingBox(), before, 'Job title must hold its position and width when actions appear')
  for (const icon of [heading.locator('.codicon-chevron-right'), job.locator('.codicon-chevron-right'), run.locator('.codicon-zap'), manage.locator('.codicon-watch')]) {
    await expect(icon).not.toHaveCSS('mask-image', 'none')
  }
  await manage.click({ trial: true })
  await screenshot('cron-native-hover.png')
  await job.focus()
  await page.keyboard.press('Tab')
  await expect(run).toBeFocused()
  await expect(actions).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab')
  await expect(manage).toBeFocused()

  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await job.click()
  const runs = row.locator('xpath=following-sibling::div[1]')
  await expect(runs).toHaveAttribute('data-hcv-disclosure-motion', '')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(runs).toContainText('Запусков пока не было')
  await expect(cron.locator(motion)).toHaveCount(0)
  await expect(job.locator('.codicon-chevron-right')).toHaveCSS('rotate', '90deg')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await job.click()
  await expect(job).toHaveAttribute('aria-expanded', 'false')
  await expect(runs).toHaveAttribute('inert', '')
  await job.click()
  await expect(job).toHaveAttribute('aria-expanded', 'true')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(cron.locator(motion)).toHaveCount(0)
  await expect(runs).not.toHaveAttribute('inert', '')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
  await heading.click()
  await expect(list).toHaveAttribute('inert', '')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await expect(list).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await heading.click()
  await expect(job).toHaveAttribute('aria-expanded', 'true')
  await expect(cron.locator(motion)).toHaveCount(0)
  await job.click()
  await expect(job).toHaveAttribute('aria-expanded', 'false')
  await expect(runs).toHaveCount(0)
  await job.click({ button: 'right' })
  const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: 'Запустить сейчас' }) })
  await expect(menu.getByRole('menuitem', { name: 'Управлять' })).toBeVisible()
  await page.mouse.click(700, 350)
  await expect(menu).toHaveCount(0)
  await heading.click()
  await expect(list).toHaveCount(0)
  console.log(JSON.stringify({ toolbarBothSides: true, sidebarControls: 2, cronBothModes: true, cronDisclosure: true }))
}
