import test from 'node:test'
import assert from 'node:assert/strict'
import { codexModelName, compactEffort, effortMenuLabel, modelLabel, modelSpeedDescription, providerName, speedDescription } from '../source/model-speed-data.js'

test('Codex formatting keeps provider abbreviations and model variants distinct', () => {
  assert.equal(codexModelName('gpt-6.2-sol'), 'GPT-6.2 Sol')
  assert.equal(codexModelName('gpt-6.1-sol-900k'), 'GPT-6.1 Sol 900k')
  assert.equal(codexModelName('Kimi K3'), 'Kimi K3')
  assert.equal(providerName('ChatGPT or Codex Subscription'), 'GPT')
  assert.equal(providerName('Kimi / Kimi Coding Plan'), 'Kimi')
  assert.equal(providerName('Other provider'), 'Other provider')
  assert.deepEqual(modelLabel('GPT-6.2-sol · Ultrafast'), { name: 'GPT-6.2 Sol', speed: 'ultrafast' })
  assert.deepEqual(modelLabel('GPT-6.2-sol · Fast'), { name: 'GPT-6.2 Sol', speed: 'fast' })
  assert.deepEqual(modelLabel('GPT-6.2-sol'), { name: 'GPT-6.2 Sol', speed: '' })
})

test('formats confirmed multipliers and leaves unspecified speeds without a number', () => {
  assert.equal(speedDescription({ multiplier: 1.5, increased_usage: true }), 'Скорость 1,5×, повышенный расход')
  assert.equal(speedDescription({ multiplier: 2, increased_usage: false }), 'Скорость 2×')
  assert.equal(speedDescription({ multiplier: 2, increased_usage: true }, 'en'), '2× speed, increased usage')
  assert.equal(speedDescription({}, 'ru'), '')
  assert.equal(speedDescription({ multiplier: NaN }, 'ru'), '')
  const codex = model => ({ model, provider: 'openai-codex' })
  const promotionEnd = Date.parse('2027-03-01T00:00:00-08:00')
  assert.equal(modelSpeedDescription('fast', codex('gpt-6.1-terra'), 'ru'), 'Скорость 1,5×\nЛимит 2,5×, кредиты 2×')
  assert.equal(modelSpeedDescription('fast', codex('gpt-6.2-sol'), 'ru'), 'Скорость 2×\nЛимит и кредиты 2×')
  assert.equal(modelSpeedDescription('ultrafast', codex('gpt-6.2-sol'), 'ru', promotionEnd - 1), 'Скорость до 4,5×\nЛимит 6×, кредиты 3×')
  assert.equal(modelSpeedDescription('ultrafast', codex('gpt-6.2-sol'), 'ru', promotionEnd), 'Скорость до 4,5×\nЛимит и кредиты 6×')
  assert.equal(modelSpeedDescription('ultrafast', codex('gpt-6-astra'), 'en'), 'Up to 8× speed\nAllowance 8×, credits 6×')
  assert.equal(modelSpeedDescription('ultrafast', codex('gpt-6.1-sol'), 'ru'), 'Наименьшая задержка\nЛимит 8×, кредиты 6×')
  assert.equal(modelSpeedDescription('fast', { model: 'gpt-6.2-sol', provider: 'custom' }, 'ru'), 'Повышенная скорость')
})

test('effort copy shows only the requested level in the menu and composer', () => {
  assert.equal(compactEffort('Max→XHigh'), 'Max')
  assert.equal(compactEffort('Min'), 'Min')
  assert.equal(effortMenuLabel('Усилия: Максимум (на этом маршруте отправляется Очень высокое)'), 'Усилия: Максимум')
  assert.equal(effortMenuLabel('Ultra (sends Max on this route)'), 'Ultra')
  assert.equal(effortMenuLabel('Минимально'), 'Минимальное')
  assert.equal(effortMenuLabel('Low (custom)'), 'Low (custom)')
})


test('Russian selected effort and menu labels follow the requested names', () => {
  for (const [input, expected] of [['Low', 'Лёгкое'], ['Med', 'Среднее'], ['High', 'Высокое'],
    ['XHigh', 'Очень высокое'], ['Max', 'Max'], ['Ultra', 'Ultra']]) {
    assert.equal(compactEffort(input + '→High', 'ru'), expected)
    assert.equal(compactEffort(input, 'en'), input)
  }
  for (const [input, expected] of [['Низкое', 'Лёгкое'], ['Среднее', 'Среднее'], ['Высокое', 'Высокое'],
    ['Очень высокое', 'Очень высокое'], ['Максимум', 'Max'], ['Ультра', 'Ultra']]) {
    assert.equal(effortMenuLabel(input, 'ru'), expected)
  }
  assert.equal(effortMenuLabel('Усилия: Максимум (на этом маршруте отправляется Очень высокое)', 'ru'), 'Усилия: Max')
  assert.equal(effortMenuLabel('Ultra (sends Max on this route)', 'en'), 'Ultra')
})
