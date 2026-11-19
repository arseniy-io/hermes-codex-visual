const dialog = '[data-slot="dialog-content"]'
const chat = '[data-chat-surface]:not([data-hud-shell] *)'
const noticeCopy = [
  `${dialog} :is([data-slot="dialog-title"], [data-slot="dialog-description"])`,
  `${dialog} > .text-destructive > span`,
  '[data-slot="alert"] :is([data-slot="alert-title"], [data-slot="alert-description"])',
  '[data-slot="aui_error-card"] :is(.aui-error-card-title, .aui-error-card-body)',
].join(', ')
const prose = [
  `${chat} [data-slot="aui_assistant-message-content"] .aui-md.prose`,
  `${chat} [data-slot="aui_user-message-text"]`,
  '[data-hcv-subagent-result] .aui-md.prose',
].join(', ')
const surfaces = `${noticeCopy}, ${prose}`
const literal = 'pre, code, kbd, samp, svg, math, a, script, style, textarea, [contenteditable]:not([contenteditable="false"]), [data-ref], [data-hcv-file-reference]'

// Hermes composes these strings in model_selection_guards.py,
// model_cost_guard.py, model_data_policy_guard.py and user_messages.py.
const notices = new Map([
  ['!!! LARGE CONTEXT MODEL SWITCH !!!', 'Смена модели в длинном чате'],
  ['Confirm only if you intend to switch now.', 'Подтвердите, если хотите сменить модель сейчас.'],
  ['!!! EXPENSIVE MODEL WARNING !!!', 'Высокая стоимость модели'],
  ['Threshold: more than $20/M input tokens or more than $100/M output tokens.',
    'Порог предупреждения - свыше 20 $ за миллион входных токенов или 100 $ за миллион выходных.'],
  ['did you mean to select openai/gpt-5.5?', 'Возможно, вы хотели выбрать openai/gpt-5.5?'],
  ['Confirm only if you intend to use this model.', 'Подтвердите, если хотите использовать эту модель.'],
  ['!!! CONTRIBUTOR TIER — TRAINS ON YOUR DATA !!!', 'Тариф Contributor - обучение на ваших данных'],
  ["This is Meta's contributor tier. Selecting it permits Meta to use your prompts and completions to train future Meta models.",
    'При выборе тарифа Contributor вы разрешаете Meta использовать ваши запросы и ответы для обучения будущих моделей.'],
  ['See current pricing and rate limits for the Meta Model API here:', 'Цены и лимиты запросов Meta Model API:'],
  ['It lowers the barrier to entry for prototyping, testing integrations, and scaling experiments where training on your data is acceptable. Do NOT use it for confidential, proprietary, personal, or otherwise sensitive data. For the same model with no training on your data, select the standard variant (without the -contributor suffix).',
    'Тариф подходит для прототипов, проверки интеграций и экспериментов, где допустимо обучение на ваших данных. Для личных, служебных и других конфиденциальных данных выбирайте обычную версию модели без суффикса -contributor.'],
  ['Confirm only if training on your prompts and completions is acceptable.',
    'Подтвердите, если согласны на обучение моделей на ваших запросах и ответах.'],
  ['Model switch failed', 'Не удалось сменить модель'],
  ['Gateway disconnected', 'Связь с Hermes потеряна.'],
  ['Gateway is not connected', 'Нет подключения к Hermes.'],
  ['Gateway not connected', 'Нет подключения к Hermes.'],
  ['Gateway unavailable', 'Служба Hermes недоступна.'],
  ['Gateway reconnect is unavailable', 'Повторное подключение к Hermes недоступно.'],
  ['Failed to fetch', 'Не удалось получить ответ от сервера.'],
  ['Connection closed', 'Соединение закрыто.'],
  ['Session not found', 'Чат не найден.'],
  ['Could not stop the process', 'Не удалось остановить процесс.'],
  ['Hermes is still starting this session (loading tools), so this command could not run yet. Wait for the status bar to show ready and try again.',
    'Hermes ещё запускает чат и загружает инструменты. Дождитесь статуса готовности и повторите команду.'],
  ['Hermes could not start the assistant for this session, so your message was not run. Reopen the session (or start a new one with /new) and send it again.',
    'Hermes не смог запустить помощника в этом чате. Откройте чат заново или начните новый командой /new и повторите отправку.'],
])

const number = value => value.replaceAll(',', '\u00a0')
const price = value => value === 'unknown' ? 'неизвестно' : `${value.slice(1, -2).replace('.', ',')} $ за миллион`
const templates = [
  [/^This session holds ~([\d,]+) tokens of context\.$/m,
    (_, count) => `В этом чате около ${number(count)} токенов истории.`],
  [/^Switching to (.+) makes the next reply re-read all of it uncached \(providers key prompt caches per model\) — a one-time full-price input cost\.$/m,
    (_, model) => `После перехода на ${model} первый запрос заново обработает всю историю. Новая модель получит её без сохранённой копии, поэтому входные токены в этом запросе будут стоить полную цену.`],
  [/^Threshold: model\.switch_context_confirm_tokens \(currently ([\d,]+); 0 disables this check\)\.$/m,
    (_, limit) => `Порог предупреждения - ${number(limit)} токенов (model.switch_context_confirm_tokens, значение 0 отключает проверку).`],
  [/^(.+) has known pricing above Hermes' safety threshold\.$/m,
    (_, model) => `Стоимость ${model} превышает порог предупреждения Hermes.`],
  [/^Input tokens: (unknown|\$\d+\.\d{2}\/M)$/m, (_, value) => `Входные токены - ${price(value)}`],
  [/^Output tokens: (unknown|\$\d+\.\d{2}\/M)$/m, (_, value) => `Выходные токены - ${price(value)}`],
  [/^Pricing source: (.+)\.$/m, (_, source) => `Источник цен - ${source}.`],
  [/^Backend for "([^"]+)" is reconnecting; retry after it settles\.$/m,
    (_, profile) => `Hermes восстанавливает соединение для профиля «${profile}». Повторите попытку после подключения.`],
  [/^Hermes could not start the assistant for this session\. Details: /,
    'Hermes не смог запустить помощника в этом чате. Подробности: '],
  [/Check the model and provider with \/model, or run `hermes setup` in a terminal to reconfigure\.$/,
    'Проверьте модель и поставщика командой /model или запустите `hermes setup` в терминале, чтобы настроить их заново.'],
]

function translateNotice(value) {
  // Keep unrecognized clauses and diagnostics from the gateway. Several
  // warnings may arrive together in one ConfirmDialog description.
  const text = value.replaceAll('\r\n', '\n')
  const paragraphs = text.split('\n\n').map(paragraph => {
    // The data-policy warning wraps its paragraphs at fixed columns.
    return notices.get(paragraph.trim().replace(/\s+/g, ' ')) ??
      paragraph.split('\n').map(line => notices.get(line.trim()) ?? line).join('\n')
  })
  const translated = templates.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), paragraphs.join('\n\n'))
  return translated === text ? value : translated
}

export function registerInterfaceCopy(ctx, active) {
  const root = document.documentElement
  const edits = new Map()
  let watching = false

  function restore(node, edit) {
    if (node.data === edit.shown) node.data = edit.original
    if (edit.tooltip?.title === edit.shown) edit.tooltip.title = edit.original
    edits.delete(node)
  }

  function update(node, notice) {
    const original = node.data
    const previous = edits.get(node)
    if (previous?.shown === original) return
    if (previous) restore(node, previous)
    const shown = (notice ? translateNotice(original) : original).replaceAll('—', '-')
    if (shown === original) return
    const heading = node.parentElement
    const tooltip = notice && heading?.matches('[data-slot="alert-title"]') && heading.title === original ? heading : null
    edits.set(node, { original, shown, tooltip })
    node.data = shown
    if (tooltip) tooltip.title = shown
  }

  function visitText(element, notice) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, node => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
      return node.matches(literal) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
    })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) update(node, notice)
  }

  function visit(node) {
    if (!node.isConnected) return
    if (node.nodeType === Node.TEXT_NODE && !node.data.trim()) return
    const element = node instanceof Element ? node : node.parentElement
    if (!element || element.closest(literal)) return
    const surface = element.closest(surfaces)
    if (node.nodeType === Node.TEXT_NODE) {
      if (surface) update(node, surface.matches(noticeCopy))
    } else if (node instanceof Element) {
      if (surface) visitText(node, surface.matches(noticeCopy))
      else for (const match of node.querySelectorAll(surfaces)) {
        if (!match.closest(literal)) visitText(match, match.matches(noticeCopy))
      }
    }
  }

  const content = new MutationObserver(records => {
    let removed = false
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target)
      else {
        removed ||= record.removedNodes.length > 0
        for (const node of record.addedNodes) visit(node)
      }
    }
    if (removed) for (const [node, edit] of edits) {
      if (!node.isConnected || !node.parentElement?.closest(surfaces) || node.parentElement.closest(literal)) restore(node, edit)
    }
  })

  function stop() {
    content.disconnect()
    for (const [node, edit] of edits) restore(node, edit)
  }

  function sync() {
    const enabled = /^ru(?:-|$)/i.test(root.lang) && root.matches(active)
    if (enabled === watching) return
    watching = enabled
    if (enabled) {
      visit(document.body)
      // Only new or changed text is visited after startup, including streaming
      // Markdown and dialog portals. Existing chat history is not rescanned.
      content.observe(document.body, { childList: true, subtree: true, characterData: true })
    } else stop()
  }

  const settings = new MutationObserver(sync)
  settings.observe(root, { attributes: true, attributeFilter: ['lang', 'data-hermes-theme', 'data-hermes-codex-visual'] })
  ctx.onDispose(() => { settings.disconnect(); stop() })
  sync()
}
