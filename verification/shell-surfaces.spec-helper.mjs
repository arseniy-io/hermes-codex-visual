import assert from 'node:assert/strict'

// Hold the detached chat's native resume briefly. Files stays docked while
// Hermes releases ownership of the previous project's folder.
export async function installShellFixture(page) {
  let holding = false
  let release
  const resume = new Promise(resolve => { release = resolve })
  await page.routeWebSocket(url => url.hostname === '127.0.0.1' && url.pathname === '/api/ws', route => {
    const upstream = route.connectToServer()
    route.onMessage(message => {
      const frame = JSON.parse(String(message))
      if (holding && ['session.resume', 'session.activate'].includes(frame.method)) {
        void resume.then(() => upstream.send(message))
      } else {
        upstream.send(message)
      }
    })
  })
  return {
    hold() { holding = true },
    release() {
      holding = false
      release()
    },
  }
}

const paint = (locator) => locator.evaluate((element) => {
  const css = getComputedStyle(element)
  return {
    radius: css.borderRadius,
    background: css.backgroundColor,
    font: css.fontFamily,
    size: css.fontSize,
    height: Math.round(element.getBoundingClientRect().height),
    transform: css.textTransform,
  }
})

export async function verifyShellSurfaces({ app, page, expect, screenshot, projectChat, projectFolder, fixture }) {
  const before = process.env.HERMES_VISUAL_SHELL_BEFORE === '1'
  const footer = page.locator('[data-slot="statusbar"]:visible')
  const profiles = page.locator('[data-slot="profile-rail"]:visible')
  const gateway = footer.locator('button').filter({ hasText: /Шлюз/ }).first()
  const device = footer.locator('[data-slot="connection-switcher"] button[aria-haspopup="menu"]')
  const toggle = page.locator('[data-tour="right-pane-toggle"]:visible')
  const files = page.getByRole('complementary', { name: 'Правая боковая панель', exact: true })
  const openFolder = files.getByRole('button', { name: 'Открыть папку', exact: true })
  const observed = {}
  await expect(footer).toBeVisible()
  await expect(profiles).toBeVisible()
  await expect(gateway).toBeVisible()
  await expect(device).toBeVisible()
  const cron = page.getByRole('button', { name: 'Cron-задачи', exact: true }).first()
  if (await cron.getAttribute('aria-expanded') === 'false') await cron.click()
  await expect(page.getByText('Проверка Cron в боковой панели', { exact: true }).first()).toBeVisible()
  await gateway.hover()
  await expect.poll(() => gateway.evaluate(element => {
    const color = getComputedStyle(element).backgroundColor
    return element.matches(':hover') && color !== 'rgba(0, 0, 0, 0)' && !color.endsWith(' / 0)')
  })).toBe(true)
  observed.footer = await paint(gateway)
  observed.device = await paint(device)
  observed.profiles = await paint(profiles.getByRole('button', { name: /visual-/ }).first())
  const footerBox = await footer.boundingBox()
  await screenshot('bottom-hover.png', { clip: { x: 0, y: footerBox.y - 138, width: 650, height: footerBox.height + 138 } })
  await gateway.click()
  const gatewayAction = page.getByRole('button', { name: /переподключить шлюз/i })
  await expect(gatewayAction).toBeVisible()
  observed.gateway = await paint(gatewayAction)
  await screenshot('gateway-popup.png')
  await page.keyboard.press('Escape')
  await device.click()
  await expect(page.getByText('Hermes VPS HTTPS (тест)', { exact: true }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await projectChat('Ревью интерфейса').click()
  await expect(page.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  if (await files.isHidden()) await toggle.click()
  await expect(files).toBeVisible()
  const tree = files.locator('[data-project-tree]')
  const note = tree.getByText('fixture-note.md', { exact: true })
  await expect(note).toBeVisible()
  const noteRow = tree.locator('[class~="group/row"]').filter({ hasText: 'fixture-note.md' })
  await note.hover()
  observed.tree = await paint(noteRow)
  await screenshot('files-tree.png')

  await toggle.click()
  await expect(files).toBeHidden()
  if (!before) {
    const readMotion = () => files.evaluate((element) => element.getAnimations().map(animation => ({
      property: animation.transitionProperty,
      duration: animation.effect.getTiming().duration,
    })).sort((a, b) => a.property.localeCompare(b.property)))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: .1 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await toggle.click()
    await expect(files).toBeVisible()
    await expect.poll(readMotion).toEqual([
      { property: 'opacity', duration: 300 },
      { property: 'translate', duration: 300 },
    ])
    observed.motion = await readMotion()
    await screenshot('files-opening.png', { animations: 'allow' })
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
    await expect.poll(readMotion).toEqual([])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await toggle.click()
    await expect(files).toBeHidden()
    await toggle.click()
    await expect(files).toBeVisible()
    assert.deepEqual(await readMotion(), [])
  } else {
    await toggle.click()
    await expect(files).toBeVisible()
  }

  fixture.hold()
  await page.getByText('Чат без папки', { exact: true }).click()
  await expect(openFolder).toBeVisible()
  const label = files.getByText('Проект не открыт', { exact: true })
  observed.empty = { label: await paint(label), button: await paint(openFolder) }
  await screenshot('files-empty.png')
  await app.evaluate(({ dialog }) => {
    globalThis.fixtureFolderPicks = 0
    dialog.showOpenDialog = async () => {
      globalThis.fixtureFolderPicks++
      return { canceled: true, filePaths: [] }
    }
  })
  await openFolder.click()
  await expect.poll(() => app.evaluate(() => globalThis.fixtureFolderPicks)).toBe(1)
  fixture.release()
  await projectChat('Ревью интерфейса').click()
  await expect(page.getByText('Тестовый чат готов к проверке.', { exact: true })).toBeVisible()
  if (await files.isHidden()) await toggle.click()
  await expect(note).toBeVisible()

  await page.keyboard.press('Control+Shift+Backslash')
  const layouts = page.getByRole('heading', { name: 'Раскладки', exact: true }).locator('xpath=../../..')
  await expect(layouts).toBeVisible()
  observed.layouts = {
    panel: await paint(layouts),
    card: await paint(layouts.locator('section button').first()),
    handle: await paint(page.locator('.cursor-grab.outline-dashed > span:has(> .codicon-gripper):visible').first()),
  }
  await screenshot('layout-picker.png')
  await page.keyboard.press('Control+Shift+Backslash')
  await expect(layouts).toBeHidden()

  if (await files.isHidden()) await toggle.click()
  await expect(note).toBeVisible()
  await note.dblclick()
  const rendered = page.getByRole('button', { name: 'ПРЕДПРОСМОТР', exact: true })
  await expect(rendered).toBeVisible()
  await rendered.click()
  const markdown = page.locator('[data-preview-markdown]:visible')
  await expect(markdown.getByText('Тестовый файл', { exact: true })).toBeVisible()
  observed.preview = await paint(rendered)
  await screenshot('file-preview.png')
  const edit = page.getByRole('button', { name: 'Изменить', exact: true })
  await edit.click()
  const cancel = page.getByRole('button', { name: 'Отмена', exact: true })
  await expect(cancel).toBeVisible()
  observed.edit = await paint(cancel)
  await screenshot('file-edit.png')
  await cancel.click()
  await expect(rendered).toBeVisible()

  const review = page.getByRole('complementary', { name: 'Проверить', exact: true })
  await page.keyboard.press('Control+g')
  await expect(review).toBeVisible()
  const changes = await page.evaluate(async (cwd) => {
    const result = await window.hermesDesktop.git.review.list(cwd, 'uncommitted', null)
    return result.files.map(file => file.path)
  }, projectFolder)
  console.log('Native Git review results', changes)
  const reviewFile = review.getByText('fixture-note.md', { exact: true })
  if (changes.length) {
    await expect(reviewFile).toBeVisible()
    await reviewFile.click()
    observed.review = await paint(review.locator('.row-hover[aria-selected="true"]'))
    await expect(review.getByText(/Изменение для проверки/).first()).toBeVisible()
  } else {
    const label = review.getByText('Нет изменений', { exact: true })
    await expect(label).toBeVisible()
    observed.reviewEmpty = await paint(label)
  }
  await screenshot('changes-panel.png')

  if (!before) {
    await page.setViewportSize({ width: 620, height: 760 })
    const overlay = page.locator('[data-narrow-overlay="files"]')
    await toggle.click()
    await expect(overlay.getByText('fixture-note.md', { exact: true })).toBeVisible()
    assert(await overlay.evaluate(element => element.scrollWidth <= element.clientWidth + 1))
    await screenshot('files-narrow.png')

    assert.equal(observed.footer.radius, '7px')
    assert.equal(observed.device.radius, '7px')
    assert.equal(observed.profiles.radius, '7px')
    assert.equal(observed.gateway.radius, '7px')
    assert.equal(observed.tree.radius, '8px')
    if (observed.review) assert.equal(observed.review.radius, '8px')
    if (observed.reviewEmpty) assert.equal(observed.reviewEmpty.transform, 'none')
    assert.equal(observed.preview.radius, '7px')
    assert.equal(observed.edit.radius, '7px')
    assert.equal(observed.layouts.panel.radius, '16px')
    assert.equal(observed.layouts.card.radius, '10px')
    assert.equal(observed.layouts.handle.radius, '999px')
    assert.equal(observed.empty.label.transform, 'none')
    assert.equal(observed.empty.button.radius, '999px')
  }
  console.log('Shell surface measurements', JSON.stringify(observed))
}
