const { logger } = require('~/config');

/**
 * Model pricing configuration with historical data
 * Prices are in USD per 1M tokens
 * 
 * Format:
 * - Each model has an array of pricing periods
 * - Periods are sorted by effectiveFrom date (newest first)
 * - effectiveTo is optional (null means current pricing)
 */
const PRICING_DATA = {
  // OpenAI Models
  'gpt-4o': [
    {
      effectiveFrom: new Date('2024-05-13'),
      prompt: 5.0,
      completion: 15.0,
    },
  ],
  'gpt-4o-mini': [
    {
      effectiveFrom: new Date('2024-07-18'),
      prompt: 0.15,
      completion: 0.6,
    },
  ],
  'gpt-4-turbo': [
    {
      effectiveFrom: new Date('2024-04-09'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4': [
    {
      effectiveFrom: new Date('2024-01-01'),
      prompt: 30.0,
      completion: 60.0,
    },
  ],
  'gpt-3.5-turbo': [
    {
      effectiveFrom: new Date('2024-01-25'),
      prompt: 0.5,
      completion: 1.5,
    },
    {
      effectiveFrom: new Date('2023-11-06'),
      effectiveTo: new Date('2024-01-24'),
      prompt: 1.0,
      completion: 2.0,
    },
  ],
  'o1': [
    {
      effectiveFrom: new Date('2024-12-05'),
      prompt: 15.0,
      completion: 60.0,
      reasoning: 15.0,
    },
  ],
  'o1-mini': [
    {
      effectiveFrom: new Date('2024-09-12'),
      prompt: 3.0,
      completion: 12.0,
      reasoning: 3.0,
    },
  ],
  'o1-preview': [
    {
      effectiveFrom: new Date('2024-09-12'),
      prompt: 15.0,
      completion: 60.0,
      reasoning: 15.0,
    },
  ],

  // Anthropic Models
  'claude-3-5-sonnet': [
    {
      effectiveFrom: new Date('2024-06-20'),
      prompt: 3.0,
      completion: 15.0,
      cacheWrite: 3.75,
      cacheRead: 0.3,
    },
  ],
  'claude-3.5-sonnet': [
    {
      effectiveFrom: new Date('2024-06-20'),
      prompt: 3.0,
      completion: 15.0,
      cacheWrite: 3.75,
      cacheRead: 0.3,
    },
  ],
  'claude-3-5-haiku': [
    {
      effectiveFrom: new Date('2024-11-01'),
      prompt: 0.8,
      completion: 4.0,
      cacheWrite: 1.0,
      cacheRead: 0.08,
    },
  ],
  'claude-3.5-haiku': [
    {
      effectiveFrom: new Date('2024-11-01'),
      prompt: 0.8,
      completion: 4.0,
      cacheWrite: 1.0,
      cacheRead: 0.08,
    },
  ],
  'claude-3-opus': [
    {
      effectiveFrom: new Date('2024-03-04'),
      prompt: 15.0,
      completion: 75.0,
    },
  ],
  'claude-3-sonnet': [
    {
      effectiveFrom: new Date('2024-03-04'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'claude-3-haiku': [
    {
      effectiveFrom: new Date('2024-03-04'),
      prompt: 0.25,
      completion: 1.25,
      cacheWrite: 0.3,
      cacheRead: 0.03,
    },
  ],

  // Google Models
  'gemini-1.5-pro': [
    {
      effectiveFrom: new Date('2024-02-15'),
      prompt: 2.5,
      completion: 10.0,
    },
  ],
  'gemini-1.5-flash': [
    {
      effectiveFrom: new Date('2024-05-14'),
      prompt: 0.15,
      completion: 0.6,
    },
  ],
  'gemini-1.5-flash-8b': [
    {
      effectiveFrom: new Date('2024-10-03'),
      prompt: 0.075,
      completion: 0.3,
    },
  ],

  // Additional OpenAI Models
  'gpt-4.5-preview': [
    {
      effectiveFrom: new Date('2025-02-27'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4.5-preview-2025-02-27': [
    {
      effectiveFrom: new Date('2025-02-27'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4-vision-preview': [
    {
      effectiveFrom: new Date('2023-11-06'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4-turbo-preview': [
    {
      effectiveFrom: new Date('2024-01-25'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4-1106-preview': [
    {
      effectiveFrom: new Date('2023-11-06'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-4-0125-preview': [
    {
      effectiveFrom: new Date('2024-01-25'),
      prompt: 10.0,
      completion: 30.0,
    },
  ],
  'gpt-3.5-turbo-0125': [
    {
      effectiveFrom: new Date('2024-01-25'),
      prompt: 0.5,
      completion: 1.5,
    },
  ],
  'gpt-3.5-turbo-1106': [
    {
      effectiveFrom: new Date('2023-11-06'),
      prompt: 1.0,
      completion: 2.0,
    },
  ],
  'gpt-3.5-turbo-16k': [
    {
      effectiveFrom: new Date('2023-06-13'),
      prompt: 3.0,
      completion: 4.0,
    },
  ],
  'gpt-3.5-turbo-instruct': [
    {
      effectiveFrom: new Date('2023-09-14'),
      prompt: 1.5,
      completion: 2.0,
    },
  ],
  'chatgpt-4o-latest': [
    {
      effectiveFrom: new Date('2024-05-13'),
      prompt: 5.0,
      completion: 15.0,
    },
  ],
  'gpt-4o-2024-05-13': [
    {
      effectiveFrom: new Date('2024-05-13'),
      prompt: 5.0,
      completion: 15.0,
    },
  ],
  'gpt-4o-2024-08-06': [
    {
      effectiveFrom: new Date('2024-08-06'),
      prompt: 2.5,
      completion: 10.0,
    },
  ],

  // Additional Anthropic Models
  'claude-opus-4-20250514': [
    {
      effectiveFrom: new Date('2025-05-14'),
      prompt: 15.0,
      completion: 75.0,
    },
  ],
  'claude-opus-4-latest': [
    {
      effectiveFrom: new Date('2025-05-14'),
      prompt: 15.0,
      completion: 75.0,
    },
  ],
  'claude-sonnet-4-20250514': [
    {
      effectiveFrom: new Date('2025-05-14'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'claude-sonnet-4-latest': [
    {
      effectiveFrom: new Date('2025-05-14'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'claude-3-7-sonnet-latest': [
    {
      effectiveFrom: new Date('2025-02-19'),
      prompt: 1.5,
      completion: 7.5,
    },
  ],
  'claude-3-7-sonnet-20250219': [
    {
      effectiveFrom: new Date('2025-02-19'),
      prompt: 1.5,
      completion: 7.5,
    },
  ],
  'claude-3-5-sonnet-20240620': [
    {
      effectiveFrom: new Date('2024-06-20'),
      prompt: 3.0,
      completion: 15.0,
      cacheWrite: 3.75,
      cacheRead: 0.3,
    },
  ],
  'claude-3-5-sonnet-20241022': [
    {
      effectiveFrom: new Date('2024-10-22'),
      prompt: 3.0,
      completion: 15.0,
      cacheWrite: 3.75,
      cacheRead: 0.3,
    },
  ],
  'claude-2.1': [
    {
      effectiveFrom: new Date('2023-11-21'),
      prompt: 8.0,
      completion: 24.0,
    },
  ],
  'claude-2': [
    {
      effectiveFrom: new Date('2023-07-11'),
      prompt: 8.0,
      completion: 24.0,
    },
  ],
  'claude-instant-1': [
    {
      effectiveFrom: new Date('2023-03-14'),
      prompt: 0.8,
      completion: 2.4,
    },
  ],

  // Additional Google Models
  'gemini-2.0-flash-001': [
    {
      effectiveFrom: new Date('2024-12-11'),
      prompt: 0.15,
      completion: 0.6,
    },
  ],
  'gemini-2.0-flash-exp': [
    {
      effectiveFrom: new Date('2024-12-11'),
      prompt: 0.0,  // Free during experimental phase
      completion: 0.0,
    },
  ],
  'gemini-2.0-flash-lite': [
    {
      effectiveFrom: new Date('2024-12-11'),
      prompt: 0.075,
      completion: 0.3,
    },
  ],
  'gemini-2.0-pro-exp-02-05': [
    {
      effectiveFrom: new Date('2025-02-05'),
      prompt: 0.0,  // Free during experimental phase
      completion: 0.0,
    },
  ],
  'gemini-1.5-flash-001': [
    {
      effectiveFrom: new Date('2024-05-14'),
      prompt: 0.15,
      completion: 0.6,
    },
  ],
  'gemini-1.5-flash-002': [
    {
      effectiveFrom: new Date('2024-09-24'),
      prompt: 0.15,
      completion: 0.6,
    },
  ],
  'gemini-1.5-pro-001': [
    {
      effectiveFrom: new Date('2024-02-15'),
      prompt: 2.5,
      completion: 10.0,
    },
  ],
  'gemini-1.5-pro-002': [
    {
      effectiveFrom: new Date('2024-09-24'),
      prompt: 1.25,
      completion: 5.0,
    },
  ],
  'gemini-1.0-pro-001': [
    {
      effectiveFrom: new Date('2023-12-06'),
      prompt: 0.5,
      completion: 1.5,
    },
  ],

  // AWS Bedrock Models (using same pricing as direct API)
  'anthropic.claude-3-5-sonnet-20241022-v2:0': [
    {
      effectiveFrom: new Date('2024-10-22'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'anthropic.claude-3-5-sonnet-20240620-v1:0': [
    {
      effectiveFrom: new Date('2024-06-20'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'anthropic.claude-3-5-haiku-20241022-v1:0': [
    {
      effectiveFrom: new Date('2024-11-01'),
      prompt: 0.8,
      completion: 4.0,
    },
  ],
  'anthropic.claude-3-opus-20240229-v1:0': [
    {
      effectiveFrom: new Date('2024-03-04'),
      prompt: 15.0,
      completion: 75.0,
    },
  ],
  'anthropic.claude-3-sonnet-20240229-v1:0': [
    {
      effectiveFrom: new Date('2024-03-04'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],
  'anthropic.claude-3-haiku-20240307-v1:0': [
    {
      effectiveFrom: new Date('2024-03-07'),
      prompt: 0.25,
      completion: 1.25,
    },
  ],

  // Cohere Models (via Bedrock)
  'cohere.command-r-v1:0': [
    {
      effectiveFrom: new Date('2024-03-01'),
      prompt: 0.5,
      completion: 1.5,
    },
  ],
  'cohere.command-r-plus-v1:0': [
    {
      effectiveFrom: new Date('2024-04-01'),
      prompt: 3.0,
      completion: 15.0,
    },
  ],

  // Meta Llama Models (via Bedrock)
  'meta.llama2-13b-chat-v1': [
    {
      effectiveFrom: new Date('2023-07-01'),
      prompt: 0.75,
      completion: 1.0,
    },
  ],
  'meta.llama2-70b-chat-v1': [
    {
      effectiveFrom: new Date('2023-07-01'),
      prompt: 1.95,
      completion: 2.56,
    },
  ],
  'meta.llama3-8b-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-04-18'),
      prompt: 0.3,
      completion: 0.6,
    },
  ],
  'meta.llama3-70b-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-04-18'),
      prompt: 2.65,
      completion: 3.5,
    },
  ],
  'meta.llama3-1-8b-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-07-23'),
      prompt: 0.22,
      completion: 0.22,
    },
  ],
  'meta.llama3-1-70b-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-07-23'),
      prompt: 0.99,
      completion: 0.99,
    },
  ],
  'meta.llama3-1-405b-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-07-23'),
      prompt: 5.32,
      completion: 16.0,
    },
  ],

  // Mistral Models (via Bedrock and direct)
  'mistral.mistral-7b-instruct-v0:2': [
    {
      effectiveFrom: new Date('2023-09-27'),
      prompt: 0.15,
      completion: 0.2,
    },
  ],
  'mistral.mixtral-8x7b-instruct-v0:1': [
    {
      effectiveFrom: new Date('2023-12-11'),
      prompt: 0.45,
      completion: 0.7,
    },
  ],
  'mistral.mistral-large-2402-v1:0': [
    {
      effectiveFrom: new Date('2024-02-26'),
      prompt: 4.0,
      completion: 12.0,
    },
  ],
  'mistral.mistral-large-2407-v1:0': [
    {
      effectiveFrom: new Date('2024-07-24'),
      prompt: 2.0,
      completion: 6.0,
    },
  ],
  'mistral.mistral-small-2410-v1:0': [
    {
      effectiveFrom: new Date('2024-10-01'),
      prompt: 0.2,
      completion: 0.6,
    },
  ],

  // AI21 Models (via Bedrock)
  'ai21.jamba-instruct-v1:0': [
    {
      effectiveFrom: new Date('2024-03-01'),
      prompt: 0.5,
      completion: 0.7,
    },
  ],

  // Amazon Titan Models
  'amazon.titan-text-lite-v1': [
    {
      effectiveFrom: new Date('2023-11-29'),
      prompt: 0.3,
      completion: 0.4,
    },
  ],
  'amazon.titan-text-express-v1': [
    {
      effectiveFrom: new Date('2023-11-29'),
      prompt: 0.8,
      completion: 1.1,
    },
  ],
  'amazon.titan-text-premier-v1:0': [
    {
      effectiveFrom: new Date('2024-05-01'),
      prompt: 5.0,
      completion: 15.0,
    },
  ],

  // xAI Models
  'grok-2': [
    {
      effectiveFrom: new Date('2024-08-01'),
      prompt: 5.0,
      completion: 10.0,
    },
  ],
  'grok-2-mini': [
    {
      effectiveFrom: new Date('2024-08-01'),
      prompt: 2.0,
      completion: 6.0,
    },
  ],

  // DeepSeek Models
  'deepseek-chat': [
    {
      effectiveFrom: new Date('2024-05-01'),
      prompt: 0.14,
      completion: 0.28,
    },
  ],
  'deepseek-coder': [
    {
      effectiveFrom: new Date('2024-05-01'),
      prompt: 0.14,
      completion: 0.28,
    },
  ],

  // Add more models as needed
};

/**
 * Get pricing for a model at a specific date
 * @param {string} model - Model identifier
 * @param {Date} [date] - Date to get pricing for (defaults to now)
 * @returns {Object|null} Pricing data or null if not found
 */
function getModelPricing(model, date = new Date()) {
  const modelPricing = PRICING_DATA[model];
  if (!modelPricing) {
    logger.warn(`No pricing data found for model: ${model}`);
    return null;
  }

  // Find the pricing period that was effective at the given date
  for (const period of modelPricing) {
    if (date >= period.effectiveFrom && (!period.effectiveTo || date <= period.effectiveTo)) {
      return period;
    }
  }

  // If no exact match, return the earliest pricing as fallback
  return modelPricing[modelPricing.length - 1];
}

/**
 * Calculate cost for token usage
 * @param {string} model - Model identifier
 * @param {Object} usage - Token usage object
 * @param {number} [usage.promptTokens] - Number of prompt tokens
 * @param {number} [usage.completionTokens] - Number of completion tokens
 * @param {number} [usage.cacheWriteTokens] - Number of cache write tokens
 * @param {number} [usage.cacheReadTokens] - Number of cache read tokens
 * @param {number} [usage.reasoningTokens] - Number of reasoning tokens
 * @param {Date} [date] - Date for pricing calculation (defaults to now)
 * @returns {Object} Cost breakdown
 */
function calculateTokenCost(model, usage, date = new Date()) {
  const pricing = getModelPricing(model, date);
  if (!pricing) {
    return {
      prompt: 0,
      completion: 0,
      cacheWrite: 0,
      cacheRead: 0,
      reasoning: 0,
      total: 0,
      error: 'No pricing data available',
    };
  }

  const costs = {
    prompt: 0,
    completion: 0,
    cacheWrite: 0,
    cacheRead: 0,
    reasoning: 0,
  };

  // Calculate each cost component (convert from per million to actual cost)
  if (usage.promptTokens) {
    costs.prompt = (usage.promptTokens / 1_000_000) * pricing.prompt;
  }

  if (usage.completionTokens) {
    costs.completion = (usage.completionTokens / 1_000_000) * pricing.completion;
  }

  if (usage.cacheWriteTokens && pricing.cacheWrite) {
    costs.cacheWrite = (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  }

  if (usage.cacheReadTokens && pricing.cacheRead) {
    costs.cacheRead = (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead;
  }

  if (usage.reasoningTokens && pricing.reasoning) {
    costs.reasoning = (usage.reasoningTokens / 1_000_000) * pricing.reasoning;
  }

  // Calculate total
  costs.total = costs.prompt + costs.completion + costs.cacheWrite + costs.cacheRead + costs.reasoning;

  return costs;
}

/**
 * Get all supported models
 * @returns {string[]} Array of model identifiers
 */
function getSupportedModels() {
  return Object.keys(PRICING_DATA);
}

/**
 * Get model provider from model name
 * @param {string} model - Model identifier
 * @returns {string} Provider name
 */
function getModelProvider(model) {
  if (model.includes('gpt') || model.includes('o1') || model.includes('chatgpt')) {
    return 'OpenAI';
  }
  if (model.includes('claude') || model.startsWith('anthropic.')) {
    return 'Anthropic';
  }
  if (model.includes('gemini')) {
    return 'Google';
  }
  if (model.includes('mistral')) {
    return 'Mistral';
  }
  if (model.includes('command') || model.startsWith('cohere.')) {
    return 'Cohere';
  }
  if (model.includes('llama') || model.startsWith('meta.')) {
    return 'Meta';
  }
  if (model.includes('titan') || model.startsWith('amazon.')) {
    return 'Amazon';
  }
  if (model.includes('grok')) {
    return 'xAI';
  }
  if (model.includes('deepseek')) {
    return 'DeepSeek';
  }
  if (model.startsWith('ai21.')) {
    return 'AI21';
  }
  return 'Unknown';
}

module.exports = {
  getModelPricing,
  calculateTokenCost,
  getSupportedModels,
  getModelProvider,
  PRICING_DATA,
};