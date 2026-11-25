// Extracted from Codex Desktop 26.1117.4957.0: O5Ra formats a GPT display name.
export function codexModelName(value) {
  if (typeof value !== 'string' || !value.trimStart().toLowerCase().startsWith('gpt')) return value
  const separator = /^gpt-\d/iu.test(value.trimStart()) ? ' ' : '-'
  return value.split(/(\s+)/).map(word => word.trim().length === 0 ? word : word.split('-').map((part, index) =>
    part.toLowerCase() === 'gpt' ? 'GPT' : part.toLowerCase() === 'oai' ? 'OAI' :
      index > 0 && part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part,
  ).join(separator).replace(/^GPT (?=\d)/u, 'GPT-')).join('')
}

export function providerName(value) {
  if (typeof value !== 'string') return value
  if (/^(?:chatgpt or codex subscription|openai-codex)$/i.test(value.trim())) return 'GPT'
  if (/^(?:kimi\s*\/\s*kimi coding plan|kimi coding plan|kimi-coding)$/i.test(value.trim())) return 'Kimi'
  return value
}

// The native Hermes label changes when the selected session's tier changes.
export function modelLabel(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^(.*?)\s+·\s+(Ultrafast|Fast)$/i)
  return { name: codexModelName(match ? match[1] : value), speed: match ? match[2].toLowerCase() : '' }
}

const russianEffortLabels = new Map([
  ['Low', 'Лёгкое'], ['Низкое', 'Лёгкое'],
  ['Med', 'Среднее'], ['Medium', 'Среднее'], ['Среднее', 'Среднее'],
  ['High', 'Высокое'], ['Высокое', 'Высокое'],
  ['XHigh', 'Очень высокое'], ['Extra High', 'Очень высокое'], ['Очень высокое', 'Очень высокое'],
  ['Max', 'Max'], ['Максимум', 'Max'], ['Ultra', 'Ultra'], ['Ультра', 'Ultra'],
])

export function compactEffort(value, language = '') {
  const label = value.split('→', 1)[0]
  return /^ru(?:-|$)/i.test(language) ? russianEffortLabels.get(label) || label : label
}

export function effortMenuLabel(value, language = '') {
  let label = value.replace(/ \((?:на этом маршруте отправляется [^()]+|sends [^()]+ on this route)\)$/iu, '')
  if (label === 'Минимально') label = 'Минимальное'
  if (/^ru(?:-|$)/i.test(language)) {
    const prefix = label.match(/^(Усилия:\s*)(.*)$/u)
    label = prefix ? prefix[1] + (russianEffortLabels.get(prefix[2]) || prefix[2]) : russianEffortLabels.get(label) || label
  }
  return label
}

function formatFactor(number, isRu) {
  return new Intl.NumberFormat(isRu ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 }).format(number) + '×'
}

export function speedDescription(tier, language = 'ru') {
  if (!tier || typeof tier !== 'object') return ''
  const number = typeof tier.multiplier === 'number' && Number.isFinite(tier.multiplier) &&
    tier.multiplier > 0 && tier.multiplier < 100 ? tier.multiplier : null
  if (!number) return ''
  const isRu = /^ru(?:-|$)/i.test(language)
  const factor = formatFactor(number, isRu)
  return isRu ? `Скорость ${tier.up_to ? 'до ' : ''}${factor}${tier.increased_usage ? ', повышенный расход' : ''}` :
    `${tier.up_to ? 'Up to ' : ''}${factor} speed${tier.increased_usage ? ', increased usage' : ''}`
}

// Generation speed: ChatGPT Learn / Speed and the Codex catalog (2026-11-23).
// Account usage: https://learn.chatgpt.com/docs/pricing#speed-multipliers
// The native catalog still decides which choices this account can select.
const fastModes = new Map([
  ['gpt-6.2-astra', { speed: 1.5, limit: 2, credits: 2 }],
  ['gpt-6.2-sol', { speed: 2, limit: 2, credits: 2 }],
  ['gpt-6.1-sol', { speed: 2, limit: 2.5, credits: 2 }],
  ['gpt-6.1-terra', { speed: 1.5, limit: 2.5, credits: 2 }],
  ['gpt-6-astra', { speed: 2, limit: 2.5, credits: 2 }],
  ['gpt-6-sol', { limit: 2.5, credits: 2 }],
  ['gpt-6-luna', { limit: 2.5, credits: 2 }],
  ['gpt-5.6-astra', { speed: 1.5 }],
  ['gpt-5.6-sol', { speed: 1.5 }],
  ['gpt-5.6-terra', { speed: 1.5 }],
])
const gpt62Ultrafast = { speed: 4.5, limit: 6, credits: 6, promoCredits: 3 }
const ultrafastModes = new Map([
  ['gpt-6.2-astra', gpt62Ultrafast],
  ['gpt-6.2-sol', gpt62Ultrafast],
  ['gpt-6-astra', { speed: 8, limit: 8, credits: 6 }],
  ['gpt-6.1-sol', { limit: 8, credits: 6 }],
])
const creditsPromotionEnd = Date.parse('2027-03-01T00:00:00-08:00')

export function modelSpeedDescription(kind, { model, provider }, language, now = Date.now()) {
  const isRu = /^ru(?:-|$)/i.test(language)
  const ultra = kind === 'ultrafast'
  const id = model.toLowerCase().replace(/-(?:fast|\d+k|\d+m)$/u, '')
  const rate = provider === 'openai-codex' ? (ultra ? ultrafastModes : fastModes).get(id) : null
  const fallback = ultra ? (isRu ? 'Наименьшая задержка' : 'Lowest latency') :
    (isRu ? 'Повышенная скорость' : 'Faster responses')
  const speed = speedDescription({ multiplier: rate?.speed, up_to: ultra, increased_usage: rate && !rate.limit }, language) || fallback
  if (!rate?.limit) return speed
  const credits = rate.promoCredits && now < creditsPromotionEnd ? rate.promoCredits : rate.credits
  const limitText = formatFactor(rate.limit, isRu)
  const creditsText = formatFactor(credits, isRu)
  const usage = rate.limit === credits
    ? `${isRu ? 'Лимит и кредиты' : 'Allowance and credits'} ${limitText}`
    : isRu ? `Лимит ${limitText}, кредиты ${creditsText}` : `Allowance ${limitText}, credits ${creditsText}`
  return `${speed}\n${usage}`
}
