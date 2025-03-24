const z = require('zod');
const { EModelEndpoint } = require('librechat-data-provider');

const openAIModels = {
  'o3-mini': 195000, // -5000 from max
  o1: 195000, // -5000 from max
  'o1-mini': 127500, // -500 from max
  'o1-preview': 127500, // -500 from max
  'gpt-4': 8187, // -5 from max
  'gpt-4-0613': 8187, // -5 from max
  'gpt-4-32k': 32758, // -10 from max
  'gpt-4-32k-0314': 32758, // -10 from max
  'gpt-4-32k-0613': 32758, // -10 from max
  'gpt-4-1106': 127500, // -500 from max
  'gpt-4-0125': 127500, // -500 from max
  'gpt-4.5': 127500, // -500 from max
  'gpt-4o': 127500, // -500 from max
  'gpt-4o-mini': 127500, // -500 from max
  'gpt-4o-2024-05-13': 127500, // -500 from max
  'gpt-4o-2024-08-06': 127500, // -500 from max
  'gpt-4-turbo': 127500, // -500 from max
  'gpt-4-vision': 127500, // -500 from max
  'gpt-3.5-turbo': 16375, // -10 from max
  'gpt-3.5-turbo-0613': 4092, // -5 from max
  'gpt-3.5-turbo-0301': 4092, // -5 from max
  'gpt-3.5-turbo-16k': 16375, // -10 from max
  'gpt-3.5-turbo-16k-0613': 16375, // -10 from max
  'gpt-3.5-turbo-1106': 16375, // -10 from max
  'gpt-3.5-turbo-0125': 16375, // -10 from max
};

const mistralModels = {
  'mistral-': 31990, // -10 from max
  'mistral-7b': 31990, // -10 from max
  'mistral-small': 31990, // -10 from max
  'mixtral-8x7b': 31990, // -10 from max
  'mistral-large-2402': 127500,
  'mistral-large-2407': 127500,
};

const cohereModels = {
  'command-light': 4086, // -10 from max
  'command-light-nightly': 8182, // -10 from max
  command: 4086, // -10 from max
  'command-nightly': 8182, // -10 from max
  'command-r': 127500, // -500 from max
  'command-r-plus': 127500, // -500 from max
};

const googleModels = {
  /* Max I/O is combined so we subtract the amount from max response tokens for actual total */
  gemini: 30720, // -2048 from max
  'gemini-pro-vision': 12288,
  'gemini-exp': 2000000,
  'gemini-2.0': 2000000,
  'gemini-2.0-flash': 1000000,
  'gemini-2.0-flash-lite': 1000000,
  'gemini-1.5': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-flash-8b': 1000000,
  'text-bison-32k': 32758, // -10 from max
  'chat-bison-32k': 32758, // -10 from max
  'code-bison-32k': 32758, // -10 from max
  'codechat-bison-32k': 32758,
  /* Codey, -5 from max: 6144 */
  'code-': 6139,
  'codechat-': 6139,
  /* PaLM2, -5 from max: 8192 */
  'text-': 8187,
  'chat-': 8187,
};

const anthropicModels = {
  'claude-': 100000,
  'claude-instant': 100000,
  'claude-2': 100000,
  'claude-2.1': 200000,
  'claude-3': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3.5-haiku': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3.7-sonnet': 200000,
  'claude-3-5-sonnet-latest': 200000,
  'claude-3.5-sonnet-latest': 200000,
};

const deepseekModels = {
  'deepseek-reasoner': 63000, // -1000 from max (API)
  deepseek: 63000, // -1000 from max (API)
  'deepseek.r1': 127500,
};

const metaModels = {
  // Basic patterns
  llama3: 8000,
  llama2: 4000,
  'llama-3': 8000,
  'llama-2': 4000,

  // llama3.x pattern
  'llama3.1': 127500,
  'llama3.2': 127500,
  'llama3.3': 127500,

  // llama3-x pattern
  'llama3-1': 127500,
  'llama3-2': 127500,
  'llama3-3': 127500,

  // llama-3.x pattern
  'llama-3.1': 127500,
  'llama-3.2': 127500,
  'llama-3.3': 127500,

  // llama3.x:Nb pattern
  'llama3.1:405b': 127500,
  'llama3.1:70b': 127500,
  'llama3.1:8b': 127500,
  'llama3.2:1b': 127500,
  'llama3.2:3b': 127500,
  'llama3.2:11b': 127500,
  'llama3.2:90b': 127500,
  'llama3.3:70b': 127500,

  // llama3-x-Nb pattern
  'llama3-1-405b': 127500,
  'llama3-1-70b': 127500,
  'llama3-1-8b': 127500,
  'llama3-2-1b': 127500,
  'llama3-2-3b': 127500,
  'llama3-2-11b': 127500,
  'llama3-2-90b': 127500,
  'llama3-3-70b': 127500,

  // llama-3.x-Nb pattern
  'llama-3.1-405b': 127500,
  'llama-3.1-70b': 127500,
  'llama-3.1-8b': 127500,
  'llama-3.2-1b': 127500,
  'llama-3.2-3b': 127500,
  'llama-3.2-11b': 127500,
  'llama-3.2-90b': 127500,
  'llama-3.3-70b': 127500,

  // Original llama2/3 patterns
  'llama3-70b': 8000,
  'llama3-8b': 8000,
  'llama2-70b': 4000,
  'llama2-13b': 4000,
  'llama3:70b': 8000,
  'llama3:8b': 8000,
  'llama2:70b': 4000,
};

const ollamaModels = {
  'qwen2.5': 32000,
};

const ai21Models = {
  'ai21.j2-mid-v1': 8182, // -10 from max
  'ai21.j2-ultra-v1': 8182, // -10 from max
  'ai21.jamba-instruct-v1:0': 255500, // -500 from max
};

const amazonModels = {
  'amazon.titan-text-lite-v1': 4000,
  'amazon.titan-text-express-v1': 8000,
  'amazon.titan-text-premier-v1:0': 31500, // -500 from max
  // https://aws.amazon.com/ai/generative-ai/nova/
  'amazon.nova-micro-v1:0': 127000, // -1000 from max,
  'amazon.nova-lite-v1:0': 295000, // -5000 from max,
  'amazon.nova-pro-v1:0': 295000, // -5000 from max,
};

const bedrockModels = {
  ...anthropicModels,
  ...mistralModels,
  ...cohereModels,
  ...ollamaModels,
  ...deepseekModels,
  ...metaModels,
  ...ai21Models,
  ...amazonModels,
};

const xAIModels = {
  'grok-beta': 131072,
  'grok-vision-beta': 8192,
  'grok-2': 131072,
  'grok-2-latest': 131072,
  'grok-2-1212': 131072,
  'grok-2-vision': 32768,
  'grok-2-vision-latest': 32768,
  'grok-2-vision-1212': 32768,
};

const aggregateModels = { ...openAIModels, ...googleModels, ...bedrockModels, ...xAIModels };

const maxTokensMap = {
  [EModelEndpoint.azureOpenAI]: openAIModels,
  [EModelEndpoint.openAI]: aggregateModels,
  [EModelEndpoint.agents]: aggregateModels,
  [EModelEndpoint.custom]: aggregateModels,
  [EModelEndpoint.google]: googleModels,
  [EModelEndpoint.anthropic]: anthropicModels,
  [EModelEndpoint.bedrock]: bedrockModels,
};

const modelMaxOutputs = {
  o1: 32268, // -500 from max: 32,768
  'o1-mini': 65136, // -500 from max: 65,536
  'o1-preview': 32268, // -500 from max: 32,768
  system_default: 1024,
};

const anthropicMaxOutputs = {
  'claude-3-haiku': 4096,
  'claude-3-sonnet': 4096,
  'claude-3-opus': 4096,
  'claude-3.5-sonnet': 8192,
  'claude-3-5-sonnet': 8192,
};

const maxOutputTokensMap = {
  [EModelEndpoint.anthropic]: anthropicMaxOutputs,
  [EModelEndpoint.azureOpenAI]: modelMaxOutputs,
  [EModelEndpoint.openAI]: modelMaxOutputs,
  [EModelEndpoint.custom]: modelMaxOutputs,
};

/**
 * Finds the first matching pattern in the tokens map.
 * @param {string} modelName
 * @param {Record<string, number>} tokensMap
 * @returns {string|null}
 */
function findMatchingPattern(modelName, tokensMap) {
  const keys = Object.keys(tokensMap);
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (modelName.includes(modelKey)) {
      return modelKey;
    }
  }

  return null;
}

/**
 * Retrieves a token value for a given model name from a tokens map.
 *
 * @param {string} modelName - The name of the model to look up.
 * @param {EndpointTokenConfig | Record<string, number>} tokensMap - The map of model names to token values.
 * @param {string} [key='context'] - The key to look up in the tokens map.
 * @returns {number|undefined} The token value for the given model or undefined if no match is found.
 */
function getModelTokenValue(modelName, tokensMap, key = 'context') {
  if (typeof modelName !== 'string' || !tokensMap) {
    return undefined;
  }

  if (tokensMap[modelName]?.context) {
    return tokensMap[modelName].context;
  }

  if (tokensMap[modelName]) {
    return tokensMap[modelName];
  }

  const matchedPattern = findMatchingPattern(modelName, tokensMap);

  if (matchedPattern) {
    const result = tokensMap[matchedPattern];
    return result?.[key] ?? result ?? tokensMap.system_default;
  }

  return tokensMap.system_default;
}

/**
 * Retrieves the maximum tokens for a given model name.
 *
 * @param {string} modelName - The name of the model to look up.
 * @param {string} endpoint - The endpoint (default is 'openAI').
 * @param {EndpointTokenConfig} [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns {number|undefined} The maximum tokens for the given model or undefined if no match is found.
 */
function getModelMaxTokens(modelName, endpoint = EModelEndpoint.openAI, endpointTokenConfig) {
  const tokensMap = endpointTokenConfig ?? maxTokensMap[endpoint];
  return getModelTokenValue(modelName, tokensMap);
}

/**
 * Retrieves the maximum output tokens for a given model name.
 *
 * @param {string} modelName - The name of the model to look up.
 * @param {string} endpoint - The endpoint (default is 'openAI').
 * @param {EndpointTokenConfig} [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns {number|undefined} The maximum output tokens for the given model or undefined if no match is found.
 */
function getModelMaxOutputTokens(modelName, endpoint = EModelEndpoint.openAI, endpointTokenConfig) {
  const tokensMap = endpointTokenConfig ?? maxOutputTokensMap[endpoint];
  return getModelTokenValue(modelName, tokensMap, 'output');
}

/**
 * Retrieves the model name key for a given model name input. If the exact model name isn't found,
 * it searches for partial matches within the model name, checking keys in reverse order.
 *
 * @param {string} modelName - The name of the model to look up.
 * @param {string} endpoint - The endpoint (default is 'openAI').
 * @returns {string|undefined} The model name key for the given model; returns input if no match is found and is string.
 *
 * @example
 * matchModelName('gpt-4-32k-0613'); // Returns 'gpt-4-32k-0613'
 * matchModelName('gpt-4-32k-unknown'); // Returns 'gpt-4-32k'
 * matchModelName('unknown-model'); // Returns undefined
 */
function matchModelName(modelName, endpoint = EModelEndpoint.openAI) {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  const tokensMap = maxTokensMap[endpoint];
  if (!tokensMap) {
    return modelName;
  }

  if (tokensMap[modelName]) {
    return modelName;
  }

  const matchedPattern = findMatchingPattern(modelName, tokensMap);
  return matchedPattern || modelName;
}

const modelSchema = z.object({
  id: z.string(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  context_length: z.number(),
});

const inputSchema = z.object({
  data: z.array(modelSchema),
});

/**
 * Processes a list of model data from an API and organizes it into structured data based on URL and specifics of rates and context.
 * @param {{ data: Array<z.infer<typeof modelSchema>> }} input The input object containing base URL and data fetched from the API.
 * @returns {EndpointTokenConfig} The processed model data.
 */
function processModelData(input) {
  const validationResult = inputSchema.safeParse(input);
  if (!validationResult.success) {
    throw new Error('Invalid input data');
  }
  const { data } = validationResult.data;

  /** @type {EndpointTokenConfig} */
  const tokenConfig = {};

  for (const model of data) {
    const modelKey = model.id;
    if (modelKey === 'openrouter/auto') {
      model.pricing = {
        prompt: '0.00001',
        completion: '0.00003',
      };
    }
    const prompt = parseFloat(model.pricing.prompt) * 1000000;
    const completion = parseFloat(model.pricing.completion) * 1000000;

    tokenConfig[modelKey] = {
      prompt,
      completion,
      context: model.context_length,
    };
  }

  return tokenConfig;
}

const tiktokenModels = new Set([
  'text-davinci-003',
  'text-davinci-002',
  'text-davinci-001',
  'text-curie-001',
  'text-babbage-001',
  'text-ada-001',
  'davinci',
  'curie',
  'babbage',
  'ada',
  'code-davinci-002',
  'code-davinci-001',
  'code-cushman-002',
  'code-cushman-001',
  'davinci-codex',
  'cushman-codex',
  'text-davinci-edit-001',
  'code-davinci-edit-001',
  'text-embedding-ada-002',
  'text-similarity-davinci-001',
  'text-similarity-curie-001',
  'text-similarity-babbage-001',
  'text-similarity-ada-001',
  'text-search-davinci-doc-001',
  'text-search-curie-doc-001',
  'text-search-babbage-doc-001',
  'text-search-ada-doc-001',
  'code-search-babbage-code-001',
  'code-search-ada-code-001',
  'gpt2',
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
]);

module.exports = {
  tiktokenModels,
  maxTokensMap,
  inputSchema,
  modelSchema,
  matchModelName,
  processModelData,
  getModelMaxTokens,
  getModelMaxOutputTokens,
};
