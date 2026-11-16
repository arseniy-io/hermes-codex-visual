async function iconMask(locator, pseudo = null) {
  return locator.evaluate((node, pseudo) => {
    const mask = getComputedStyle(node, pseudo).maskImage
    const encoded = mask.match(/^url\(["']?data:image\/svg\+xml,([^"']+)["']?\)$/)?.[1]
    return encoded ? decodeURIComponent(encoded) : mask
  }, pseudo)
}

export async function verifyProjectCatalogFix({ page, expect, screenshot, navigation, projectChat, localIcons }) {
  if (localIcons) {
    await expect.poll(() => iconMask(navigation('new-session'), '::before')).toBe(localIcons.newChat)
    await expect.poll(() => iconMask(navigation('capabilities'), '::before')).toBe(localIcons.plugins)
  }
  const projectName = 'Тестовый проект'
  const renamed = 'Проект с новым именем'
  const project = page.locator('[data-sessions-project]:not([data-sessions-mode])')
    .filter({ has: page.locator('[data-hcv-project-name]').filter({ hasText: /^Тестовый проект$/ }) }).first()
  const id = await project.getAttribute('data-sessions-project')
  const label = project.locator('[data-hcv-project-name]')
  await label.hover()
  const preview = page.locator('[data-hcv-project-preview]:visible')
  const rename = preview.getByRole('button', { name: 'Переименовать проект', exact: true })
  await expect(rename).toBeVisible()
  if (localIcons) {
    await expect.poll(() => iconMask(preview.locator('[data-hcv-icon="folder"]').first())).toBe(localIcons.folder)
    const laptop = page.locator('[data-hcv-draft-bar] [data-hcv-draft-icon="laptop"]').first()
    if (await laptop.count()) await expect.poll(() => iconMask(laptop)).toBe(localIcons.laptop)
  }
  await rename.click()
  const dialog = page.getByRole('dialog', { name: /Переименовать проект/ })
  const input = dialog.locator('input').first()
  await expect(input).toHaveValue(projectName)
  await expect(dialog.getByRole('button', { name: /создать/i })).toHaveCount(0)
  await screenshot('rename-project.png')
  await input.fill(renamed)
  await input.press('Enter')
  await expect(dialog).toHaveCount(0)
  const sameProject = page.locator(`[data-sessions-project="${id}"]:not([data-sessions-mode])`)
  await expect(sameProject.locator('[data-hcv-native-project-action][data-slot="row-button"]')).toHaveText(renamed)
  await expect(sameProject.locator('[data-hcv-project-name]')).toHaveText(renamed)
  await expect(projectChat('Ревью интерфейса')).toBeVisible()
  await page.reload()
  await expect(sameProject.locator('[data-hcv-project-name]')).toHaveText(renamed, { timeout: 25000 })
  await expect(projectChat('Ревью интерфейса')).toBeVisible()

  await navigation('capabilities').click()
  await page.locator('[data-tour="tab-plugins"]:visible').click()
  const cards = page.locator('[data-catalog-card]:visible')
  const plain = cards.filter({ has: page.getByRole('button', { name: 'Fixture plugin 1', exact: true }) })
  await expect(plain).toBeVisible()
  const background = await plain.evaluate(node => getComputedStyle(node).backgroundColor)
  for (const name of ['Bots', 'Kanban']) {
    const card = cards.filter({ has: page.getByRole('button', { name, exact: true }) })
    await expect(card).toBeVisible()
    const art = card.locator('.catalog-card-image')
    await expect(art).toHaveCount(1)
    await expect(art).toBeHidden()
    await expect(card).toHaveCSS('background-image', 'none')
    if (await card.getAttribute('data-catalog-variant') === 'default') {
      await expect(card).toHaveCSS('background-color', background)
    }
    await expect(card.locator('[role="switch"]')).toBeVisible()
  }
  const illustrated = cards.filter({ has: page.getByRole('button', { name: 'Fixture plugin 0', exact: true }) })
  await expect(illustrated.locator('.catalog-card-image')).toBeVisible()
  await screenshot('plugin-cards.png')

  await page.locator('[data-tour="tab-connectors"]:visible').click()
  const logo = page.locator('[data-slot="connector-row-card"] > :first-child :is(img, svg):visible').first()
  await expect(logo).toBeVisible()
}
