import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'

const prompt = 'Проверь группировку действий в живой ленте.'
const interim = 'Сначала проверю страницу и файлы.'
const answer = 'Проверка группировки завершена.'
const middle = 'Страница проверена, продолжаю работу.'
const commandIntro = 'Сверю результаты трёх команд.'
const nativeCommands = ['echo fixture-one', 'echo fixture-two', 'echo fixture-three']
const browser = { name: 'mcp__chrome_devtools__list_pages', id: 'bundle-browser-1' }
const command = { name: 'terminal', id: 'bundle-command-1' }
const failed = { name: 'mcp__chrome_devtools__take_snapshot', id: 'bundle-browser-failed' }
const agent = { name: 'delegate_task', id: 'bundle-agent-1', goal: 'Проверка тестовым агентом',
  subagentId: 'bundle-reviewer', childSession: '20261120_170001_bab001', taskName: 'bundle_reviewer' }
const read = { name: 'read_file', id: 'bundle-read-1' }
const second = { name: 'mcp__chrome_devtools__click', id: 'bundle-browser-2' }
const agentFields = () => ({ subagent_id: agent.subagentId, child_session_id: agent.childSession,
  task_name: agent.taskName, agent_path: '/root/' + agent.taskName, goal: agent.goal, task_index: 0,
  model: 'gpt-6.1-sol', reasoning_effort: 'max' })

// Local protocol events only. No GitHub request, browser action, command, or
// model invocation is performed. Captions and states come from the Codex
// contracts recorded in docs/chat-timeline-contract.md.
export function createActivityBundlesFixture() {
  let emit
  let commandFinished = false
  let secondFinished = false
  return {
    intercept(frame, route) {
      if (frame.method !== 'prompt.submit' || frame.params?.text !== prompt) return false
      const session = frame.params.session_id
      emit = (type, payload = {}) => route.send(JSON.stringify({ jsonrpc: '2.0', method: 'event',
        params: { type, payload, session_id: session } }))
      route.send(JSON.stringify({ jsonrpc: '2.0', id: frame.id,
        result: { admission_id: 'hcv-bundles', ref: { session_id: session }, sequence: 1,
          status: 'started', outcome: null, authority_epoch: 1, execution_generation: 1 } }))
      setTimeout(() => {
        emit('message.start')
        emit('reasoning.delta', { text: 'Подготовка тестового хода.' })
      }, 150)
      return true
    },
    firstComment() {
      emit('message.delta', { text: interim })
      emit('message.interim', { text: interim, already_streamed: true })
      emit('reasoning.delta', { text: 'Смотрю страницу.' })
      for (let index = 0; index < 13; index++) {
        const id = 'bundle-github-' + index
        emit('tool.start', { name: 'mcp__github__fetch_file', tool_id: id, args: {
          path: 'fixture-' + index + '.md', hermes_tool_labels: [{ kind: 'mcp', app: 'GitHub',
            name: 'mcp__github__fetch_file', action: 'fetch file', emoji: '', preview: '', text: 'GitHub · fetch file',
            display: { version: 1, registered_name: 'mcp__github__fetch_file', server: 'github', tool: 'fetch_file',
              definition: { title: 'fetch_file' } } }],
        } })
        emit('tool.complete', { name: 'mcp__github__fetch_file', tool_id: id,
          result: { success: true, content: 'Тестовый файл ' + index } })
      }
      emit('tool.start', { name: browser.name, tool_id: browser.id, args: {} })
    },
    next() {
      assert(emit, 'Expected the isolated prompt to start')
      emit('tool.complete', { name: browser.name, tool_id: browser.id, result: { success: true, content: 'Страница проверена.' } })
      emit('reasoning.delta', { text: 'Теперь проверяю файлы.' })
      emit('tool.start', { name: command.name, tool_id: command.id, args: { command: 'echo fixture-bundle' } })
    },
    beginError() {
      emit('tool.complete', { name: command.name, tool_id: command.id, result: 'fixture-bundle-output' })
      commandFinished = true
      emit('reasoning.delta', { text: 'Проверяю ошибку.' })
      emit('tool.start', { name: failed.name, tool_id: failed.id, args: {} })
    },
    fail() {
      emit('tool.complete', { name: failed.name, tool_id: failed.id,
        result: { error: 'Тестовая ошибка браузера', success: false } })
    },
    beginAgent() {
      emit('tool.start', { name: agent.name, tool_id: agent.id,
        args: { tasks: [{ goal: agent.goal, task_name: agent.taskName }] } })
      const delegation_id = 'bundle-delegation'
      emit('subagent.start', { ...agentFields(), delegation_id, status: 'running', started_at: Date.now() / 1000 })
      // The native background call confirms dispatch while the child is still running.
      emit('tool.complete', { name: agent.name, tool_id: agent.id,
        result: { status: 'dispatched', mode: 'background', delegation_id, goals: [agent.goal],
          subagent_ids: [agent.subagentId], task_names: [agent.taskName], agent_paths: ['/root/' + agent.taskName] } })
    },
    completeAgent() {
      const summary = 'Агент завершил проверку.'
      emit('subagent.complete', { ...agentFields(), status: 'completed', duration_seconds: 8, summary })
      emit('reasoning.delta', { text: 'Проверяю файл после агента.' })
      emit('tool.start', { name: read.name, tool_id: read.id, args: { path: 'fixture-note.md' } })
    },
    nextComment() {
      emit('tool.complete', { name: read.name, tool_id: read.id, result: { content: 'fixture note' } })
      emit('tool.start', { name: 'write_file', tool_id: 'bundle-created-file', args: { path: 'fixture-created.md' } })
      emit('tool.complete', { name: 'write_file', tool_id: 'bundle-created-file', result: {
        files_created: ['fixture-created.md'],
        diff: '--- /dev/null\n+++ b/fixture-created.md\n@@ -0,0 +1,1216 @@\n' + '+fixture line\n'.repeat(1216),
      } })
      emit('message.delta', { text: middle })
      emit('message.interim', { text: middle, already_streamed: true })
      emit('reasoning.delta', { text: 'Ещё один шаг после комментария.' })
      emit('tool.start', { name: second.name, tool_id: second.id, args: {} })
    },
    announceNativeCommands() {
      emit('tool.complete', { name: second.name, tool_id: second.id, result: { success: true, content: 'Шаг проверен.' } })
      secondFinished = true
      emit('message.delta', { text: commandIntro })
      emit('message.interim', { text: commandIntro, already_streamed: true })
    },
    startNativeCommand(index) {
      emit('tool.start', { name: 'terminal', tool_id: 'bundle-native-command-' + index, args: { command: nativeCommands[index] } })
    },
    completeNativeCommand(index) {
      const result = index === 1 ? { exit_code: 1, stderr: 'fixture failure' } : { exit_code: 0, stdout: 'fixture success' }
      emit('tool.complete', { name: 'terminal', tool_id: 'bundle-native-command-' + index, result })
    },
    finish() {
      assert(emit, 'Expected the isolated prompt to start')
      if (!commandFinished) emit('tool.complete', { name: command.name, tool_id: command.id, result: 'fixture-bundle-output' })
      else if (!secondFinished) emit('tool.complete', { name: second.name, tool_id: second.id,
        result: { success: true, content: 'Последний шаг проверен.' } })
      emit('message.delta', { text: answer })
      emit('message.complete', { text: answer })
    },
  }
}

async function startCommandRecording(page, intro) {
  if (process.env.HCV_RECORD_COMMAND_MOTION !== '1') return async () => {}
  const name = process.env.HERMES_VISUAL_EVIDENCE_VERSION
  assert.match(name, /^[a-zA-Z0-9-]+$/)
  const directory = new URL('../evidence/' + name + '-frames/', import.meta.url)
  await fs.mkdir(directory)
  const bounds = await intro.boundingBox()
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const client = await page.context().newCDPSession(page)
  const frames = []
  client.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    void client.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    if (metadata.timestamp != null) frames.push({ data, timestamp: metadata.timestamp })
  })
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  return async () => {
    await client.send('Page.stopScreencast')
    await client.detach()
    assert(frames.length > 30, 'Expected a recording of the real command animation')
    const timings = []
    for (const [index, frame] of frames.entries()) {
      const file = 'frame-' + String(index).padStart(4, '0') + '.png'
      await fs.writeFile(new URL(file, directory), Buffer.from(frame.data, 'base64'))
      timings.push({ file, timestamp: frame.timestamp })
    }
    await fs.writeFile(new URL('timeline.json', directory), JSON.stringify({ size, bounds, frames: timings }, null, 2))
  }
}

async function verifyCommandMotion({ page, expect, screenshot, fixture, turn, intro, nativeRun, nativeLabel }) {
  const caption = 'data-hcv-command-caption'
  const sweep = 'data-hcv-command-sweep'
  const handoff = 'data-hcv-command-handoff'
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await intro.scrollIntoViewIfNeeded()
  await intro.evaluate(async node => {
    // Rendering the preceding (large) file disclosure can still move the
    // transcript after scrollIntoViewIfNeeded returns during a live turn.
    let previous = node.getBoundingClientRect().top
    let stableSince = performance.now()
    const deadline = stableSince + 2000
    while (performance.now() < deadline) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const top = node.getBoundingClientRect().top
      if (Math.abs(top - previous) > 0.1) stableSince = performance.now()
      if (performance.now() - stableSince >= 200) return
      previous = top
    }
    throw new Error('Command recording started before the transcript settled')
  })
  await page.evaluate(() => {
    window.hcvCommandMotionTrace = []
    document.addEventListener('animationstart', event => {
      if (!event.animationName.startsWith('hcv-command-')) return
      const label = event.target.closest('[data-hcv-command-caption]') ||
        event.target.querySelector('[data-hcv-command-caption]')
      const text = label?.textContent
      if (text?.includes('echo fixture-')) {
        window.hcvCommandMotionTrace.push({ text, name: event.animationName, time: performance.now() })
      }
    })
  })
  const trace = () => page.evaluate(() => window.hcvCommandMotionTrace)
  const stopRecording = await startCommandRecording(page, intro)
  try {
    if (process.env.HCV_RECORD_COMMAND_MOTION === '1') await page.waitForTimeout(270)
    fixture.startNativeCommand(0)
    const standalone = turn.locator('[data-tool-row]:visible').filter({ hasText: nativeCommands[0] })
    await expect(standalone.locator('[data-hcv-command-caption]')).toBeVisible()
    await expect.poll(async () => (await trace()).some(event => event.name === 'hcv-command-receive' &&
      event.text.endsWith(nativeCommands[0]))).toBe(true)
    const dots = standalone.locator('[role="status"] > .glyph-spinner')
    await expect(dots).toHaveCSS('display', 'none')
    const terminal = await dots.evaluate(node => {
      const status = node.parentElement
      const glyph = status.parentElement
      const { width, height, top } = glyph.getBoundingClientRect()
      const text = glyph.parentElement.querySelector('[data-hcv-command-text]').getBoundingClientRect()
      return { mask: getComputedStyle(glyph).maskImage, width, height,
        verticalOffset: text.top + text.height / 2 - (top + height / 2),
        animatedDots: node.getAnimations({ subtree: true }).length,
        accessibleStatus: Boolean(status.getAttribute('aria-label')) }
    })
    assert.match(terminal.mask, /data:image\/svg\+xml/)
    assert.equal(terminal.width, 16)
    assert.equal(terminal.height, 16)
    assert(Math.abs(terminal.verticalOffset) < 0.5)
    assert.equal(terminal.animatedDots, 0)
    assert(terminal.accessibleStatus)
    if (process.env.HCV_RECORD_COMMAND_MOTION === '1') await page.waitForTimeout(400)
    fixture.completeNativeCommand(0)
    fixture.startNativeCommand(1)
    fixture.startNativeCommand(2)
    await expect(nativeLabel).toHaveText('Выполняется ' + nativeCommands[2])
    await expect(nativeLabel).toHaveAttribute(sweep, '')
    const mask = nativeLabel.locator('[data-hcv-command-highlight]')
    const visual = await mask.evaluate(node => {
      const computed = getComputedStyle(node)
      return { mask: computed.maskImage, baseColor: getComputedStyle(node.parentElement).color,
        highlightColor: getComputedStyle(node, '::before').color,
        duration: computed.animationDuration, timing: computed.animationTimingFunction,
        keyframes: node.getAnimations().find(animation => animation.animationName === 'hcv-command-sweep')
          ?.effect.getKeyframes().map(frame => frame.transform) }
    })
    await expect(mask).toHaveAttribute('aria-hidden', 'true')
    assert.match(visual.mask, /0%.*20%.*30%.*50%.*100%/)
    assert.equal(visual.duration, '1s')
    assert.equal(visual.timing, 'steps(48)')
    assert.deepEqual(visual.keyframes, ['translateX(-50%)', 'translateX(125%)'])
    await screenshot('command-motion-sweep.png', { animations: 'allow' })
    const summaryIcon = () => nativeLabel.evaluate(node => getComputedStyle(node.parentElement, '::before').maskImage)
    assert.equal(await summaryIcon(), terminal.mask)
    await expect(nativeRun.locator('[data-tool-ticker]')).toHaveCSS('display', 'none')
    const groupedDots = nativeRun.locator('[data-tool-row][data-hcv-activity-icon="activityTerminal"] .glyph-spinner')
    await expect(groupedDots).toHaveCount(2)
    await expect.poll(() => groupedDots.evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).display))).toEqual(['none', 'none'])
    const groupHeight = await nativeLabel.evaluate(node => node.parentElement.getBoundingClientRect().height)
    assert.equal(groupHeight, 21)
    const passes = async () => (await trace()).filter(event => event.name === 'hcv-command-sweep' &&
      event.text.endsWith(nativeCommands[2]))
    await expect.poll(async () => (await passes()).length, { timeout: 6500 }).toBe(2)
    const [first, second] = await passes()
    const periodMs = second.time - first.time
    assert(periodMs >= 3750 && periodMs <= 4600, 'Unexpected sweep period: ' + periodMs)
    fixture.completeNativeCommand(2)
    await expect(nativeLabel).toHaveText('Выполняется ' + nativeCommands[1])
    await expect(nativeLabel).toHaveAttribute(handoff, '')
    const transition = await nativeLabel.evaluate(async node => {
      const title = node.parentElement
      const viewport = node.querySelector('[data-hcv-command-viewport]')
      const incoming = viewport.querySelector('[data-hcv-command-text]')
      const outgoing = node.querySelector('[data-hcv-command-outgoing]')
      const outgoingStyle = getComputedStyle(outgoing)
      const details = {
        iconAlignment: getComputedStyle(title).alignItems,
        outgoingHidden: outgoing.getAttribute('aria-hidden'),
        outgoingDuration: outgoingStyle.animationDuration,
        outgoingTiming: outgoingStyle.animationTimingFunction,
        incomingDuration: getComputedStyle(viewport).animationDuration,
        offsets: viewport.getAnimations().find(animation => animation.animationName === 'hcv-command-reveal')
          ?.effect.getKeyframes().map(frame => frame.offset),
      }
      const deadline = performance.now() + 1600
      const samples = []
      do {
        const row = title.getBoundingClientRect()
        const rowCenter = row.top + row.height / 2
        const line = incoming.getBoundingClientRect()
        const previous = outgoing.getBoundingClientRect()
        samples.push({ height: row.height, incoming: line.top + line.height / 2 - rowCenter,
          outgoing: previous.top + previous.height / 2 - rowCenter })
        await new Promise(resolve => requestAnimationFrame(resolve))
      } while (node.hasAttribute('data-hcv-command-handoff') && performance.now() < deadline)
      return { ...details, samples }
    })
    assert.equal(transition.outgoingHidden, 'true')
    assert.equal(transition.outgoingDuration, '0.2s')
    assert.equal(transition.outgoingTiming, 'ease-out')
    assert.equal(transition.incomingDuration, '1s')
    const { offsets, samples } = transition
    assert.deepEqual(offsets, [0, 0.74, 1])
    assert.equal(transition.iconAlignment, 'center')
    assert(samples.length > 1)
    const maxOffset = Math.max(...samples.flatMap(sample => [Math.abs(sample.incoming), Math.abs(sample.outgoing)]))
    assert(samples.every(sample => sample.height === groupHeight))
    assert(maxOffset < 0.5, 'Command captions must share the icon center throughout the transition')
    await expect(nativeLabel).not.toHaveAttribute(handoff, '')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(nativeLabel).not.toHaveAttribute(sweep, '')
    await expect(nativeLabel).toHaveAttribute(caption, '')
    await expect(nativeLabel).toHaveText('Выполняется ' + nativeCommands[1])
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(nativeLabel).toHaveAttribute(sweep, '')
    fixture.completeNativeCommand(1)
    await expect(nativeLabel).toHaveText('Выполнил команды')
    assert.equal(await summaryIcon(), terminal.mask)
    await expect(nativeRun.locator('.glyph-spinner')).toHaveCount(0)
    await expect(nativeLabel).not.toHaveAttribute(caption, '')
    await expect(nativeLabel).not.toHaveAttribute(sweep, '')
    if (process.env.HCV_RECORD_COMMAND_MOTION === '1') await page.waitForTimeout(560)
    return { ...visual, offsets, periodMs, standaloneEntry: true, change: true, reducedMotion: true,
      alignment: { groupHeight, sampledFrames: samples.length, maxOffset, standaloneOffset: terminal.verticalOffset },
      completed: true, terminal: { width: terminal.width, height: terminal.height, animatedDots: terminal.animatedDots,
        accessibleStatus: terminal.accessibleStatus, sameIcon: true, hiddenDotsInGroup: true } }
  } finally {
    await stopRecording()
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
}

export async function verifyActivityBundles({ page, expect, screenshot, fixture }) {
  const chat = page.locator('[data-chat-surface][data-composer-target="main"]:visible')
  const editor = chat.locator('[data-slot="composer-rich-input"]')
  await editor.fill(prompt)
  await editor.press('Enter')
  const turn = chat.locator('[data-slot="aui_turn-pair"]').filter({ hasText: prompt }).last()
  const reasoning = turn.locator('[data-slot="aui_thinking-disclosure"]')
  await expect(reasoning.first()).toBeAttached({ timeout: 30000 })
  await expect(reasoning.filter({ visible: true })).toHaveCount(0)
  await expect(turn.locator('[data-hcv-thinking], [data-hcv-live-turn]')).toHaveCount(0)
  fixture.firstComment()
  const opening = turn.getByText(interim, { exact: true })
  await expect(opening).toBeVisible({ timeout: 30000 })
  await expect(opening).toHaveCount(1)
  fixture.next()
  const groups = turn.locator('[data-hcv-activity-group] > button')
  await expect(groups.first()).toHaveText('Выполняется echo fixture-bundle', { timeout: 30000 })
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'false')
  await expect(turn.locator('[data-hcv-activity-member]:visible')).toHaveCount(0)
  await opening.hover()
  await expect(turn.locator('[data-slot="aui_msg-actions"]:visible, [data-slot="aui_turn-duration"]:visible')).toHaveCount(0)
  await expect(reasoning.filter({ visible: true })).toHaveCount(0)
  await screenshot('bundles-live-collapsed.png')
  await page.keyboard.down('Tab')
  await groups.first().focus()
  await page.keyboard.up('Tab')
  await page.keyboard.press('Enter')
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true')
  const liveCommand = turn.locator('[data-tool-row][data-hcv-activity-icon="activityTerminal"]:visible').last()
  const liveTimer = liveCommand.locator('span[class~="inline-flex"][class~="tracking-[0.02em]"]')
  await expect(liveTimer).toBeAttached()
  await expect(liveTimer).toHaveCSS('display', 'none')
  await expect(reasoning.filter({ visible: true })).toHaveCount(0)
  const repeated = turn.locator('[data-hcv-activity-repeat="activityGithub"] > button')
  try {
    await expect(repeated).toHaveText('fetch_file · 13 вызовов')
  } catch (error) {
    const debug = await turn.evaluate(turn => {
      const compactPart = part => part && ({ type: part.type, toolName: part.toolName,
        toolCallId: part.toolCallId, resultPresent: part.result !== undefined,
        completedAt: part.completedAt, args: part.args, isError: part.isError, status: part.status })
      const fiber = element => {
        const keys = Object.keys(element)
        let node = element[keys.find(key => key.startsWith('__reactFiber$'))]
        const props = element[keys.find(key => key.startsWith('__reactProps$'))]
        if (node?.memoizedProps !== props) node = node?.alternate
        const trace = []
        for (let level = 0; node && level < 10; node = node.return, level++) {
          const props = node.memoizedProps
          trace.push({ name: typeof node.type === 'string' ? node.type : node.type?.name || node.type?.displayName,
            propKeys: Object.keys(props || {}), part: compactPart(props?.part), alternatePart: compactPart(node.alternate?.memoizedProps?.part),
            start: props?.startIndex, end: props?.endIndex, live: props?.live,
            contexts: [...(function* () { for (let c = node.dependencies?.firstContext; c; c = c.next) yield {
              keys: Object.keys(c.memoizedValue || {}), messageKeys: Object.keys(c.memoizedValue?.message || {}) } })()] })
        }
        return trace
      }
      return { headers: [...turn.querySelectorAll('[data-hcv-activity-group]')].map(node => node.outerHTML),
        nativeGroups: [...turn.querySelectorAll('[data-tool-group]')].map(node => ({
          html: node.outerHTML.slice(0, 6000), trace: fiber(node) })),
        rows: [...turn.querySelectorAll('[data-tool-row]')].map(node => ({
          html: node.outerHTML.slice(0, 1500), parent: node.parentElement.outerHTML.slice(0, 450),
          ancestors: [...(function* () { for (let parent = node.parentElement, n = 0; parent && n < 5; parent = parent.parentElement, n++) yield {
            tag: parent.tagName, slot: parent.getAttribute('data-slot'), toolGroup: parent.hasAttribute('data-tool-group'),
            activity: parent.getAttribute('data-hcv-activity-member') } })()],
          trace: fiber(node) })) }
    })
    console.log('Activity bundles repeat diagnostic', JSON.stringify(debug))
    throw error
  }
  await expect(repeated).toHaveAttribute('aria-expanded', 'false')
  const repeatedRows = turn.locator('[data-hcv-activity-repeat-member]')
  await expect(repeatedRows).toHaveCount(13)
  await expect(repeatedRows.first()).toBeHidden()
  await repeated.click()
  await expect(repeated).toHaveAttribute('aria-expanded', 'true')
  await expect(repeatedRows.first()).toBeVisible()
  await expect(repeatedRows.locator('[data-hcv-activity-label]')).toHaveText(Array(13).fill('fetch_file'))
  // ConnectorTool's original row and caption stay mounted. Only the Codex
  // presentation label and missing glyph are painted beside that source.
  await expect(repeatedRows.locator('[data-hcv-activity-native-label]')).toHaveText(Array(13).fill('GitHub · fetch file'))
  await expect(repeatedRows.locator('[data-hcv-activity-fallback-icon]')).toHaveCount(13)
  const repeatedGlyphs = await repeatedRows.evaluateAll(rows => rows.map(row => {
    const title = row.querySelector('[data-hcv-activity-fallback-icon]')
    const css = getComputedStyle(title, '::before')
    return { icon: row.getAttribute('data-hcv-activity-icon'), width: css.width, height: css.height,
      mask: css.maskImage, content: css.content, originalParent: row.parentElement.hasAttribute('data-hcv-activity-repeat') === false }
  }))
  for (const glyph of repeatedGlyphs) {
    const svg = /data:image\/svg\+xml,([^")]+)/.exec(glyph.mask)?.[1]
    assert.equal(glyph.icon, 'activityGithub')
    assert.equal(glyph.width, '16px')
    assert.equal(glyph.height, '16px')
    assert.equal(glyph.originalParent, true)
    assert.equal(createHash('sha256').update(decodeURIComponent(svg || '')).digest('hex'),
      'd21c134c8753518eee32edb146e4a0c95381dc412769a9c42925bee0526ed39b')
  }
  await repeated.click()
  await expect(repeatedRows.first()).toBeHidden()
  await expect(turn.getByRole('button', { name: 'List pages', exact: true })).toBeVisible()
  fixture.beginError()
  fixture.fail()
  const errorRow = turn.locator('[data-tool-row][data-hcv-activity-failed][data-hcv-activity-icon="activityIntegration"]')
    .filter({ has: page.locator('[data-hcv-activity-label]').getByText('Take snapshot', { exact: true }) }).last()
  await expect(errorRow).toBeVisible({ timeout: 30000 })
  await expect(errorRow.locator('[data-hcv-activity-label]')).toHaveText('Take snapshot')
  await expect(errorRow.locator('[data-hcv-activity-native-label]')).toBeHidden()
  const failedGlyph = await errorRow.locator('svg.text-destructive[aria-label]').evaluate(svg => {
    const css = getComputedStyle(svg)
    return { color: css.color, mask: css.maskImage, width: css.width, height: css.height,
      paintedPaths: [...svg.children].filter(path => getComputedStyle(path).visibility !== 'hidden').length,
      expectedColor: getComputedStyle(svg.parentElement).color }
  })
  const failedAsset = /data:image\/svg\+xml,([^")]+)/.exec(failedGlyph.mask)?.[1]
  assert.equal(createHash('sha256').update(decodeURIComponent(failedAsset || '')).digest('hex'),
    'e4b6a7951536f14d9a6a3025ce0a9a8e89344483ead9f3b294118d5255432c43')
  assert.equal(failedGlyph.color, failedGlyph.expectedColor)
  assert.equal(failedGlyph.width, '16px')
  assert.equal(failedGlyph.height, '16px')
  assert.equal(failedGlyph.paintedPaths, 0)
  await expect(groups.first()).toHaveText('Использовано интеграции GitHub и Chrome Devtools выполнил команду')
  assert.equal(await groups.first().textContent(), (await groups.first().textContent()).replace(' · есть ошибки', ''))
  fixture.beginAgent()
  const started = turn.locator('[data-hcv-agent-activity="started"]')
  await expect(started).toHaveText('Bundle reviewer начал(-и) работу', { timeout: 30000 })
  await expect(started.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/)
  fixture.completeAgent()
  const completed = turn.locator('[data-hcv-agent-activity="completed"]')
  await expect(completed).toHaveText('Bundle reviewer завершил(-и) работу', { timeout: 30000 })
  assert.equal(await completed.locator('img').getAttribute('src'), await started.locator('img').getAttribute('src'))
  await expect(turn.locator('[data-hcv-agent-activity="dispatched"], [data-hcv-agent-activity="queued"]')).toHaveCount(0)
  await expect(started.locator('button[data-hcv-agent-name]')).toHaveText('Bundle reviewer')
  await expect(started.locator('button[data-hcv-agent-name]')).toBeEnabled()
  await groups.first().click()
  await expect(errorRow).toBeHidden()
  await expect(started).toBeVisible()
  await expect(completed).toBeVisible()
  await groups.first().click()
  await expect(errorRow).toBeVisible()
  await errorRow.getByRole('button').first().click()
  await expect(errorRow).toContainText('Тестовая ошибка браузера')
  await errorRow.getByRole('button').first().click()
  await screenshot('bundles-live-error-agent.png')
  fixture.nextComment()
  await expect(turn.getByText(middle, { exact: true })).toBeVisible({ timeout: 30000 })
  const editGroup = turn.locator('[data-hcv-activity-group="activityEdit"] > button')
  await expect(editGroup).toHaveAttribute('aria-expanded', 'false')
  await editGroup.click()
  const created = turn.locator('[data-tool-row][data-hcv-activity-icon="activityEdit"]')
  await expect(created).toHaveCount(1)
  const createdLabel = created.locator('[data-hcv-file-activity-label]')
  await expect(createdLabel).toHaveText('Создано fixture-created.md +1\u00a0216 −0')
  const marker = createdLabel.locator('[data-hcv-file-activity-marker="add"]')
  await expect(marker).toHaveCSS('width', '6px')
  await expect(marker).toHaveCSS('height', '6px')
  await expect(createdLabel.locator('[data-hcv-file-activity-counts]')).toHaveCSS('font-size', '13px')
  const createdToggle = created.locator('button[aria-expanded]').first()
  const toggleCreated = async () => {
    await page.keyboard.down('Tab')
    await createdToggle.focus()
    await page.keyboard.up('Tab')
    await expect(createdToggle).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await toggleCreated()
  await expect(createdLabel).toHaveText('Созданный файл')
  await expect(createdLabel.locator('[data-hcv-file-activity-marker]')).toHaveCount(0)
  await toggleCreated()
  await expect(createdLabel).toHaveText('Создано fixture-created.md +1\u00a0216 −0')
  await expect(marker).toBeVisible()
  const lastGroup = groups.last()
  await expect(lastGroup).toHaveText('Click', { timeout: 30000 })
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'false')
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true')

  fixture.announceNativeCommands()
  const intro = turn.getByText(commandIntro, { exact: true })
  await expect(intro).toBeVisible({ timeout: 30000 })
  await intro.hover()
  await expect(turn.locator('[data-hcv-turn-line]:visible, [data-slot="aui_msg-actions"]:visible')).toHaveCount(0)
  await page.mouse.move(290, 120)
  const nativeRun = turn.locator('[data-tool-group]:has(> [data-hcv-command-run-header])')
  const nativeHeader = nativeRun.locator('[data-hcv-command-run-header] button[aria-expanded]')
  const nativeLabel = nativeHeader.locator('[data-hcv-activity-label]')
  const motion = await verifyCommandMotion({ page, expect, screenshot, fixture, turn, intro, nativeRun, nativeLabel })
  await expect(nativeRun).toHaveCount(1)
  await expect(nativeHeader).toHaveAttribute('aria-expanded', 'false')
  await expect(nativeRun.locator('[data-tool-row]:visible')).toHaveCount(0)
  await expect(nativeLabel).toHaveCSS('text-overflow', 'ellipsis')
  const collapsedHeight = await nativeHeader.evaluate(button => button.getBoundingClientRect().height)
  await expect(nativeLabel).toHaveText('Выполнил команды')
  await expect(nativeHeader).toBeVisible()
  // While Tab is held, Hermes keeps the selected control's keyboard focus.
  await page.keyboard.down('Tab')
  await nativeHeader.focus()
  await page.keyboard.up('Tab')
  await expect(nativeHeader).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(nativeHeader).toHaveAttribute('aria-expanded', 'true')
  const nativeRows = nativeRun.locator('[data-tool-row]:visible')
  await expect(nativeRows).toHaveCount(3)
  await expect(nativeRows.nth(0)).toContainText(nativeCommands[0])
  await expect(nativeRows.nth(1)).toContainText(nativeCommands[1])
  await expect(nativeRows.nth(2)).toContainText(nativeCommands[2])
  const nativeSucceeded = nativeRows.first()
  await nativeSucceeded.getByRole('button').first().click()
  await expect(nativeSucceeded).toContainText('fixture success')
  await nativeSucceeded.getByRole('button').first().click()
  const nativeFailed = nativeRows.nth(1)
  await expect(nativeFailed).toHaveAttribute('data-hcv-activity-failed', '')
  await nativeFailed.getByRole('button').first().click()
  await expect(nativeFailed).toContainText('fixture failure')
  await expect(nativeFailed).toContainText('Код выхода 1')
  await nativeFailed.getByRole('button').first().click()
  await screenshot('bundles-native-command-open.png')
  await nativeHeader.click()
  await expect(nativeRows).toHaveCount(0)

  fixture.finish()
  await expect(turn.getByText(answer, { exact: true })).toBeVisible({ timeout: 30000 })
  await turn.getByText(answer, { exact: true }).hover()
  const answerActions = turn.locator('[data-slot="aui_msg-actions"]:visible')
  await expect(answerActions).toHaveCSS('opacity', '1')
  await expect(answerActions.getByRole('button', { name: /^(Копировать|Скопировать ответ)$/ })).toBeVisible()
  const finished = turn.locator('button[data-hcv-turn-line]')
  if (await finished.count() && await finished.getAttribute('aria-expanded') !== 'true') await finished.click()
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'false')
  await lastGroup.click()
  await expect(lastGroup).toHaveAttribute('aria-expanded', 'true')
  await expect(groups.first()).toHaveText('Использовано интеграции GitHub и Chrome Devtools выполнил команду')
  const metrics = await groups.first().evaluate(button => {
    const label = button.querySelector('span > span')
    const css = getComputedStyle(label)
    return { size: css.fontSize, line: css.lineHeight, weight: css.fontWeight,
      color: css.color, icon: getComputedStyle(button.firstElementChild, '::before').width }
  })
  assert.deepEqual(metrics, { size: '14px', line: '21px', weight: '430', color: 'rgba(255, 255, 255, 0.5)', icon: '16px' })
  await screenshot('bundles-complete-open.png')
  return { runningGroup: true, keyboardExpansion: true, repeatCount: 13, integrationNames: ['GitHub', 'Chrome Devtools'],
    errorsOnlyInside: true, namedAgentEvents: true, commentaryBoundary: true,
    commandMotion: motion,
    liveNoise: { openingCommentCount: 1, reasoningVisible: false, toolTimerVisible: false, hoverOnlyOnCompletion: true },
    nativeCommandRun: { pendingCalls: 2, expandedCalls: 3, collapsedRows: 1, collapsedHeight,
      nativeTickerHidden: true, keyboardExpansion: true },
    createdFile: { added: 1216, removed: 0, markerSize: 6, countsSize: 13 }, metrics }
}
