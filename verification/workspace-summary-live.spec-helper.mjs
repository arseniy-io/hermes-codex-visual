import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export async function verifyWorkspaceSummaryLive({ page, expect, projectChat, projectFolder, screenshot }) {
  const root = path.resolve(projectFolder)
  const note = path.join(root, 'fixture-note.md')
  const rules = path.join(root, 'fixture-rules.txt')
  const localCommit = 'summary-local.txt'
  const fresh = path.join(root, 'summary-live-new.txt')
  const binary = path.join(root, 'summary-live-binary.bin')
  const directory = path.join(root, 'summary-live-folder')
  const nested = path.join(directory, 'nested.txt')
  const checkout = path.join(root, '.worktrees', 'summary-fixture')
  const branch = 'verify/a-long-branch-name-that-will-fade-under-the-counters'
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')))
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    return result.stdout
  }
  const focus = () => page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const card = page.locator('[data-hcv-context-card]')
  const row = card.locator('.hcv-context-changes')
  const stats = row.locator('.hcv-context-diff')
  const branchIcon = row.locator('[data-hcv-summary-changes-icon]')
  const label = row.locator('.hcv-context-label')
  const heading = card.locator('[data-hcv-summary-section="changes"] [data-hcv-summary-heading]')
  const counts = (added, removed) => expect(stats).toHaveText(
    '+' + new Intl.NumberFormat('ru').format(added) + '-' + new Intl.NumberFormat('ru').format(removed), { timeout: 20000 })
  const clean = git('rev-parse', 'HEAD').trim()
  git('update-ref', 'refs/remotes/origin/main', clean)
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  git('switch', '-c', branch)

  try {
    fs.writeFileSync(path.join(root, localCommit), 'Local commit\n'.repeat(12345))
    git('add', '--', localCommit)
    git('-c', 'user.name=Hermes Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
      'commit', '-m', 'Local branch change')
    fs.writeFileSync(rules, 'Замена строки\nЕщё строка\n')
    git('add', '--', 'fixture-rules.txt')
    fs.writeFileSync(fresh, 'Один\nДва\n')
    fs.mkdirSync(directory)
    fs.writeFileSync(nested, 'Один\nДва\nТри\n')
    fs.writeFileSync(binary, Buffer.from([0, 1, 2]))
    assert.match(git('diff', '--numstat', clean), /^12345\s+0\s+summary-local\.txt/m)
    assert.match(git('diff', '--numstat', 'HEAD'), /^2\s+1\s+fixture-rules\.txt/m)

    git('worktree', 'add', '--detach', checkout, clean)
    assert.match(git('ls-files', '--others', '--exclude-standard'), /\.worktrees\/summary-fixture\//)

    await projectChat('Ревью интерфейса').click()
    await expect(card).toBeVisible()
    await expect(heading).toHaveText('Изменения')
    await expect(label).toHaveText(path.basename(root) + ' · ' + branch)
    await expect(label).toHaveAttribute('data-overflow', '')
    await expect(label).toHaveCSS('mask-image', /linear-gradient/)
    await expect(branchIcon).toHaveCSS('width', '16px')
    await expect(branchIcon).toHaveCSS('opacity', '1')
    await counts(12354, 1)
    await expect(card.locator('.hcv-context-added')).toHaveCSS('color', 'rgb(64, 201, 119)')
    await expect(card.locator('.hcv-context-removed')).toHaveCSS('color', 'rgb(250, 66, 62)')
    await row.hover()
    await expect.poll(() => row.evaluate(node => getComputedStyle(node, '::before').backgroundColor))
      .toMatch(/255.*255.*255.*0\.06/)
    await counts(12354, 1)
    await expect(branchIcon).toHaveCSS('opacity', '1')
    await page.mouse.move(650, 160)
    await screenshot('workspace-summary-live.png')

    await row.click()
    const review = page.locator('[data-hcv-changes-pane]:visible')
    await expect(review.getByText('Изменения в ветке', { exact: true })).toBeVisible()
    await expect(review.getByRole('button', { name: localCommit, exact: true })).toBeVisible()
    await expect(review.getByRole('button', { name: 'summary-live-folder/nested.txt' })).toBeVisible()
    const file = review.getByRole('button', { name: 'fixture-rules.txt', exact: true })
    const diff = review.locator('[data-hcv-change-diff]')
    await file.click()
    await expect(diff).toContainText('+Замена строки')
    await expect(diff).toContainText('-Тестовое вложение')
    await review.getByRole('button', { name: 'summary-live-new.txt', exact: true }).click()
    await expect(diff).toContainText('+Два')
    await screenshot('workspace-summary-review.png')
    const tab = page.locator('[data-tree-tab="plugin-workspace:hermes-codex-visual-summary-changes"]')
    await tab.hover()
    await tab.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(review).toHaveCount(0)
    await expect(card).toBeVisible()

    // Changes by another application appear without switching chats.
    fs.appendFileSync(note, 'Один\nДва\nТри\n')
    await counts(12357, 1)

    git('restore', '--source=HEAD', '--staged', '--worktree', '--', 'fixture-note.md', 'fixture-rules.txt')
    fs.unlinkSync(fresh)
    fs.unlinkSync(nested)
    fs.rmdirSync(directory)
    await focus()
    await counts(12345, 0) // The remaining local commit still counts.
    git('switch', 'main')
    await focus()
    await counts(0, 0) // Binary file with no line additions or removals.
    fs.unlinkSync(binary)
    await focus()
    await expect(stats).toHaveCount(0, { timeout: 20000 })
    await expect(label).toHaveText(path.basename(root) + ' · main')
    await expect(label).not.toHaveAttribute('data-overflow', '')

    // Repo and branch come from the chat's Git root, not the project's title.
    const site = page.getByRole('button', { name: 'Сайт', exact: true })
    if (await site.getAttribute('aria-expanded') !== 'true') await site.click()
    await projectChat('Проверка каталога').click()
    await expect(label).toContainText('site')
    await counts(2, 0)
    await projectChat('Ревью интерфейса').click()
    await expect(stats).toHaveCount(0, { timeout: 20000 })
    fs.writeFileSync(fresh, 'Один\nДва\n')
    await projectChat('Вложенный каталог').click()
    await expect(label).toHaveText(path.basename(root) + ' · main')
    await counts(2, 0)
    return { branchTotals: true, reopenedReview: true, nestedNewFiles: true, externalRefresh: true, repositorySwitch: true, nestedWorktree: true }
  } finally {
    if (fs.existsSync(checkout)) git('worktree', 'remove', checkout)
    if (fs.existsSync(nested)) fs.unlinkSync(nested)
    if (fs.existsSync(directory)) fs.rmdirSync(directory)
    if (fs.existsSync(fresh)) fs.unlinkSync(fresh)
    if (fs.existsSync(binary)) fs.unlinkSync(binary)
    git('restore', '--source=HEAD', '--staged', '--worktree', '--', 'fixture-note.md', 'fixture-rules.txt')
    if (git('branch', '--show-current').trim() !== 'main') git('switch', 'main')
    fs.appendFileSync(note, '\nИзменение для проверки.\n')
  }
}
