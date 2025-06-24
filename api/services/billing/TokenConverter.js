const { readFileSync } = require('fs');
const path = require('path');
const { ceil } = require('mathjs');

/*
  Файл с прайс-листом лежит в /config/pricing.json, пример строки:

  [
    { "provider": "openai", "model": "gpt-4o",          "input_per_million": 5,  "output_per_million": 15 },
    { "provider": "openai", "model": "dall-e-3",        "each": 0.04 },
    { "provider": "anthropic", "model": "claude-3-sonnet", "input_per_million": 8, "output_per_million": 24 }
  ]
*/
const PRICING_PATH = path.join(process.cwd(), 'config', 'pricing.json');
const pricing = JSON.parse(readFileSync(PRICING_PATH, 'utf8'));

//  курс внутреннего «кредита» и наценка
const TOKEN_PRICE_USD = Number(process.env.CREDIT_PRICE_USD ?? 0.02); // $0.02 за 1 кредит
const MARGIN_MULTIPLIER = Number(process.env.MARGIN_MULTIPLIER ?? 1.25); // +25 %

/**
 * @typedef {Object} ProviderUsage
 * @property {string} provider  – "openai" | "anthropic" | …
 * @property {string} model
 * @property {number} [inputTokens]
 * @property {number} [outputTokens]
 * @property {number} [images]
 * @property {number} [seconds]
 */
/** Получить строку прайса и провайдера по имени модели */
function getPricingRow(modelName) {
  const row = pricing.find((entry) => entry.model === modelName);
  if (!row) throw new Error(`No pricing row found for model: ${modelName}`);
  return row;
}

/** Конвертирует сырые затраты провайдера в кредиты LibreChat. */
function toCredits(usage /*: ProviderUsage */) {
  const row = pricing.find((r) => r.provider === usage.provider && r.model === usage.model);
  if (!row) throw new Error(`No pricing for ${usage.provider}/${usage.model}`);

  let usd = 0;

  // 1. текстовые токены
  if (usage.inputTokens && row.input_per_million)
    usd += (usage.inputTokens / 1e6) * row.input_per_million;
  if (usage.outputTokens && row.output_per_million)
    usd += (usage.outputTokens / 1e6) * row.output_per_million;

  // 2. картинки / сек
  if (usage.images && row.each) usd += usage.images * row.each;
  if (usage.seconds && row.each) usd += usage.seconds * row.each;

  // 3. наценка + перевод в кредиты
  const credits = ceil((usd * MARGIN_MULTIPLIER) / TOKEN_PRICE_USD);
  return credits < 1 ? 1 : credits;
}

module.exports = { TokenConverter: { toCredits, getPricingRow } };
