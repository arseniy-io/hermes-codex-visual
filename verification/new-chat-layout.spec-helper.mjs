import assert from 'node:assert/strict'

export async function verifyNewChatLayout({ page, expect, screenshot, newChat }) {
  const draftProject = page.locator('[data-hcv-draft-bar]:visible').getByRole('button', { name: 'Выбрать проект' })
  const filesRail = page.locator('[data-tree-tab="files"][data-vertical="true"]')
  const files = page.getByRole('complementary', { name: 'Правая боковая панель', exact: true })
  const filesToggle = page.locator('[data-tour="right-pane-toggle"]:visible')
  const wordmark = page.locator('[data-chat-surface][data-composer-target="main"] [data-slot="aui_intro"] .wordmark:visible')
  await expect(draftProject).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const chooseProject = async () => {
    await draftProject.click()
    await page.locator('[data-hcv-draft-menu="projects"]:popover-open')
      .getByRole('button', { name: 'Тестовый проект', exact: true }).click()
    await expect(draftProject).toHaveText('Тестовый проект')
  }
  await chooseProject()
  if (await files.isHidden()) await filesToggle.click()
  await expect(files).toBeVisible()
  await expect(files.locator('[data-project-tree]').getByText('fixture-note.md')).toBeVisible()
  await filesToggle.click()
  await expect(files).toBeHidden()
  await expect(filesRail).toHaveCount(1)
  await expect(filesRail).toBeHidden()
  await screenshot('new-chat-in-project.png')
  const verifyTransition = async (openNewChat) => {
    await expect(wordmark).toBeVisible()
    await page.evaluate(() => {
      const samples = []
      window.hcvLayoutFrames = samples
      function sample() {
        if (window.hcvLayoutFrames !== samples) return
        const main = document.querySelector('[data-chat-surface][data-composer-target="main"]:not([data-pane-hidden] *)')
        const rect = main?.getBoundingClientRect()
        const input = main?.querySelector('[data-slot="composer-surface"]')?.getBoundingClientRect()
        const title = main?.querySelector('[data-slot="aui_intro"] .wordmark')?.getBoundingClientRect()
        const rail = document.querySelector('[data-tree-tab="files"][data-vertical="true"]')
        const values = {
          center: rect && rect.x + rect.width / 2,
          inputTop: input?.top,
          titleTop: title?.top,
          project: main?.querySelector('[data-hcv-draft-label]')?.textContent,
          railPresent: Boolean(rail),
          railVisible: Boolean(rail?.getClientRects().length),
        }
        if (JSON.stringify(values) !== JSON.stringify(samples.at(-1))) samples.push(values)
        requestAnimationFrame(sample)
      }
      sample()
    })
    await openNewChat()
    await expect(draftProject).toHaveText('Без проекта')
    await expect(filesRail).toHaveCount(0)
    const frames = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const frames = window.hcvLayoutFrames
      delete window.hcvLayoutFrames
      return frames
    })
    console.log('New chat frames', JSON.stringify(frames))
    assert.equal(frames[0].project, 'Тестовый проект')
    assert.equal(frames.at(-1).project, 'Без проекта')
    for (const frame of frames) {
      assert.equal(frame.railVisible, false)
      assert.equal(frame.center, frames[0].center)
      assert.equal(frame.inputTop, frames[0].inputTop)
      assert.equal(frame.titleTop, frames[0].titleTop)
      if (!frame.railPresent) assert.equal(frame.project, 'Без проекта')
    }
  }

  await verifyTransition(() => newChat.click())
  await screenshot('new-chat-detached.png')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1120, height: 800 })
  await chooseProject()
  await expect(filesRail).toBeHidden()
  await verifyTransition(() => newChat.click())
  await chooseProject()
  await expect(filesRail).toHaveCount(1)
  await filesToggle.click()
  await expect(files).toBeVisible()
}
