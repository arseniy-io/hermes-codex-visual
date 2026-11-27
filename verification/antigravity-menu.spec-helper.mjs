export async function verifyAntigravityModels({ page, expect, pill, screenshot }) {
  await pill.click()
  const catalog = page.locator('[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):visible')
  await expect(catalog).toBeVisible()
  await expect.poll(() => pill.evaluate(node => {
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'))
    let runtimeId
    for (let fiber = node[key]; fiber && !runtimeId; fiber = fiber.return) {
      for (let dep = fiber.dependencies?.firstContext; dep; dep = dep.next) {
        runtimeId = dep.memoizedValue?.$runtimeId?.get() || runtimeId
      }
    }
    if (!runtimeId) return false
    const client = globalThis.__HERMES_PLUGIN_SDK__.queryClient
    const query = client.getQueryCache().findAll({ queryKey: ['model-options'], type: 'active' }).find(entry =>
      entry.queryKey[2] === runtimeId && entry.state.data?.providers?.some(row => row.slug === 'openai-codex'))
    if (!query || query.state.fetchStatus !== 'idle') return false
    const testProvider = (slug, name, models) => ({
      slug, name, models,
      capabilities: Object.fromEntries(models.map(id => [id, { reasoning: true, fast: false, ultrafast: false }])),
    })
    client.setQueryData(query.queryKey, data => ({
      ...data,
      providers: [
        ...data.providers,
        testProvider('antigravity-oauth', 'Google Antigravity (OAuth)', [
          'gemini-3.8-flash', 'claude-opus-4-6-thinking', 'gemini-3.1-pro-preview',
        ]),
        testProvider('hcv-menu-control', 'Control Provider', ['synthetic-control-flash']),
      ],
    }))
    return true
  })).toBe(true)

  const title = catalog.locator('[class~="group/label"] > [data-hcv-provider-label="Google Antigravity"]')
  const search = catalog.locator('[data-slot="dropdown-menu-search"] input').or(catalog.getByRole('textbox')).first()
  const row = name => catalog.locator('[data-slot="dropdown-menu-sub-trigger"]').filter({
    has: page.getByText(name, { exact: true }),
  })
  const variant = (model, name) => model.locator(':scope > span > .uppercase.tracking-wide').filter({ hasText: name })
  const flash = row('Gemini 3.8')
  const thinking = row('Opus 4.6')
  await expect(title).toBeVisible()
  await expect.poll(() => title.evaluate(node => getComputedStyle(node, '::after').content)).toBe('"Google Antigravity"')
  await expect(title).toHaveCSS('font-size', '0px')
  await expect(variant(flash, /^Flash$/u)).toHaveCSS('display', 'none')
  await expect(variant(thinking, /^Thinking$/u)).toHaveCSS('display', 'none')
  await expect(variant(row('Gemini 3.1 Pro'), /^Preview$/u)).toBeVisible()
  if (screenshot) await screenshot('antigravity-model-catalog.png', { locator: catalog })

  // Starring moves the native row to Favorites without selecting it.
  const star = flash.locator('button[aria-pressed]')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await expect(variant(flash, /^Flash$/u)).toHaveCSS('display', 'none')

  // The full protocol ID remains searchable even with its variant chip hidden.
  await search.fill('gemini-3.8-flash')
  await expect(flash).toBeVisible()
  await expect(variant(flash, /^Flash$/u)).toHaveCSS('display', 'none')
  const owner = await flash.evaluate(node => {
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'))
    for (let fiber = node[key]; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps
      if (props?.family?.id && props.provider?.slug) return [props.provider.slug, props.family.id]
    }
    return null
  })
  if (owner?.[0] !== 'antigravity-oauth' || owner?.[1] !== 'gemini-3.8-flash') {
    throw new Error('Search resolved an unexpected Antigravity model: ' + JSON.stringify(owner))
  }
  await flash.press('ArrowRight')
  const options = page.locator('[data-slot="dropdown-menu-sub-content"]:visible').last()
  await expect(options.getByRole('menuitemradio').first()).toBeVisible()
  await page.keyboard.press('Escape')
  if (!(await catalog.isVisible())) await pill.click()
  await search.fill('synthetic-control-flash')
  await expect(catalog.locator('[data-slot="dropdown-menu-sub-trigger"]').getByText('Flash', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  console.log('HCV_ANTIGRAVITY_MODEL_CATALOG: display title, provider-scoped variant chips, Favorites, ID search and effort menu verified')
}
