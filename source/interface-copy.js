import { tooltipCopy } from './tooltip-copy.js'
import { tooltipSurfaces } from './tooltips.js'

const dialog = '[data-slot="dialog-content"]'
const noticeCopy = [
  `${dialog} :is([data-slot="dialog-title"], [data-slot="dialog-description"])`,
  `${dialog} > .text-destructive > span`,
  '[data-slot="alert"] :is([data-slot="alert-title"], [data-slot="alert-description"])',
  '[data-slot="aui_error-card"] :is(.aui-error-card-title, .aui-error-card-body)',
].join(', ')
const literal = [
  'pre, code, kbd, samp, svg, math, script, style, textarea',
  '[contenteditable]:not([contenteditable="false"]), .cm-editor, [data-terminal], [data-ref], [data-hcv-file-reference]',
].join(', ')
const dash = '\u2014'

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

export function registerInterfaceCopy(ctx, active, decorateTooltip) {
  const root = document.documentElement
  const edits = new Map()
  let enabled = false
  let russian = false
  let themed = false

  function restore(node, edit) {
    const current = edit.attribute ? node.getAttribute(edit.attribute) : node.data
    if (current === edit.shown) {
      if (edit.attribute) node.setAttribute(edit.attribute, edit.original)
      else node.data = edit.original
    }
    if (edit.tooltip?.title === edit.shown) edit.tooltip.title = edit.original
  }

  function updateText(node) {
    const parent = node.parentElement
    if (themed && /^(?:Голосовая диктовка|Voice dictation)$/i.test(node.data)) {
      const tip = parent.closest('[data-slot="tooltip-content"]')
      if (tip) decorateTooltip(tip)
    }
    const original = node.data
    const previous = edits.get(node)
    if (previous?.shown === original) return
    const notice = russian && parent.closest(noticeCopy)
    const separated = themed && /[·•]/u.test(original) && parent.closest(tooltipSurfaces)
    if (!notice && !original.includes(dash) && !separated) {
      if (previous) edits.delete(node)
      return
    }
    const translated = notice ? translateNotice(original) : original
    const shown = separated ? tooltipCopy(translated) : translated.replaceAll(dash, '-')
    if (shown === original) { edits.delete(node); return }
    const title = notice && parent.matches('[data-slot="alert-title"]') && parent.title === original ? parent : null
    edits.set(node, { original, shown, tooltip: title })
    node.data = shown
    if (title) title.title = shown
  }

  function updatePlaceholder(element) {
    const attribute = 'placeholder'
    const original = element.getAttribute(attribute)
    if (!original?.includes(dash)) return
    const shown = original.replaceAll(dash, '-')
    edits.set(element, { attribute, original, shown })
    element.setAttribute(attribute, shown)
  }

  function visit(node) {
    if (!node.isConnected) return
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return
    if (node instanceof Element) updatePlaceholder(node)
    if (element.closest(literal)) return
    if (node.nodeType === Node.TEXT_NODE) { updateText(node); return }
    if (!(node instanceof Element)) return
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, child => {
      if (child.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
      updatePlaceholder(child)
      return child.matches(literal) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
    })
    for (let child = walker.nextNode(); child; child = walker.nextNode()) updateText(child)
  }

  function restoreDetached(subtree) {
    if (subtree.isConnected) return
    if (edits.has(subtree)) {
      restore(subtree, edits.get(subtree))
      edits.delete(subtree)
    }
    for (const child of subtree.childNodes) restoreDetached(child)
  }

  const content = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target)
      else if (record.type === 'attributes') updatePlaceholder(record.target)
      else {
        for (const node of record.removedNodes) restoreDetached(node)
        for (const node of record.addedNodes) visit(node)
      }
    }
  })

  function stop() {
    content.disconnect()
    for (const [node, edit] of edits) restore(node, edit)
    edits.clear()
  }

  function sync() {
    const nextEnabled = root.hasAttribute('data-hermes-codex-visual')
    const nextTheme = root.matches(active)
    const nextRussian = nextTheme && /^ru(?:-|$)/i.test(root.lang)
    if (nextEnabled === enabled && nextRussian === russian && nextTheme === themed) return
    stop()
    enabled = nextEnabled
    russian = nextRussian
    themed = nextTheme
    if (enabled) {
      visit(document.body)
      // Streaming and portal content only visit changed text and added subtrees.
      content.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['placeholder'] })
    }
  }

  const settings = new MutationObserver(sync)
  settings.observe(root, { attributes: true, attributeFilter: ['lang', 'data-hermes-theme', 'data-hermes-codex-visual'] })
  ctx.onDispose(() => { settings.disconnect(); stop() })
  sync()
}
