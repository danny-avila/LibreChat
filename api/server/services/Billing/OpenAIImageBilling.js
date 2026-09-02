const { logger } = require('@librechat/data-schemas');
const { getBalanceConfig, getTransactionsConfig } = require('@librechat/api');
const { spendTokens } = require('~/models');

const IMAGE_PRICING = Object.freeze({
  'gpt-image-2': { textInput: 5, imageInput: 8, imageOutput: 30 },
  'gpt-image-1.5': { textInput: 5, imageInput: 8, imageOutput: 32 },
  'gpt-image-1-mini': { textInput: 2, imageInput: 2.5, imageOutput: 8 },
  'gpt-image-1': { textInput: 5, imageInput: 10, imageOutput: 40 },
});

function resolveImagePricing(model) {
  if (!model || typeof model !== 'string') {
    return null;
  }

  if (IMAGE_PRICING[model]) {
    return IMAGE_PRICING[model];
  }

  const matchedModel = Object.keys(IMAGE_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));

  return matchedModel ? IMAGE_PRICING[matchedModel] : null;
}

function toTokenCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function extractImageUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const imageTokens = toTokenCount(usage.input_tokens_details?.image_tokens);
  const explicitTextTokens = usage.input_tokens_details?.text_tokens;
  const textTokens =
    explicitTextTokens != null
      ? toTokenCount(explicitTextTokens)
      : Math.max(toTokenCount(usage.input_tokens) - imageTokens, 0);
  const outputTokens = toTokenCount(usage.output_tokens);

  if (textTokens === 0 && imageTokens === 0 && outputTokens === 0) {
    return null;
  }

  return { textTokens, imageTokens, outputTokens };
}

function calculateImageCredits({ model, usage }) {
  const pricing = resolveImagePricing(model);
  if (!pricing) {
    logger.warn(`[OpenAIImageBilling] Unknown image model pricing: ${model}`);
    return null;
  }

  const tokenUsage = extractImageUsage(usage);
  if (!tokenUsage) {
    return null;
  }

  const configuredMultiplier = Number(process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER ?? 1);
  const multiplier =
    Number.isFinite(configuredMultiplier) && configuredMultiplier >= 0 ? configuredMultiplier : 1;
  const baseCredits =
    tokenUsage.textTokens * pricing.textInput +
    tokenUsage.imageTokens * pricing.imageInput +
    tokenUsage.outputTokens * pricing.imageOutput;

  return Math.ceil(baseCredits * multiplier);
}

async function recordOpenAIImageUsage({ req, model, usage, conversationId, messageId }) {
  const credits = calculateImageCredits({ model, usage });
  if (!credits) {
    return;
  }

  const user = req?.user?.id;
  if (!user) {
    logger.warn('[OpenAIImageBilling] Cannot record image usage without a user ID');
    return;
  }

  const balance = getBalanceConfig(req?.config);
  const transactions = getTransactionsConfig(req?.config);
  if (!balance?.enabled && transactions?.enabled === false) {
    return;
  }

  await spendTokens(
    {
      user,
      model,
      conversationId,
      messageId,
      context: 'image_generation',
      balance,
      transactions,
      endpointTokenConfig: {
        [model]: {
          completion: 1,
        },
      },
    },
    {
      completionTokens: credits,
    },
  );
}

module.exports = {
  resolveImagePricing,
  extractImageUsage,
  calculateImageCredits,
  recordOpenAIImageUsage,
};
