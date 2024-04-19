const z = require('zod');
const { EModelEndpoint } = require('librechat-data-provider');

const models = [
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
];

const openAIModels = {
  'gpt-4': 8187, // -5 from max
  'gpt-4-0613': 8187, // -5 from max
  'gpt-4-32k': 32758, // -10 from max
  'gpt-4-32k-0314': 32758, // -10 from max
  'gpt-4-32k-0613': 32758, // -10 from max
  'gpt-4-1106': 127990, // -10 from max
  'gpt-4-0125': 127990, // -10 from max
  'gpt-4-turbo': 127990, // -10 from max
  'gpt-3.5-turbo': 16375, // -10 from max
  'gpt-3.5-turbo-0613': 4092, // -5 from max
  'gpt-3.5-turbo-0301': 4092, // -5 from max
  'gpt-3.5-turbo-16k': 16375, // -10 from max
  'gpt-3.5-turbo-16k-0613': 16375, // -10 from max
  'gpt-3.5-turbo-1106': 16375, // -10 from max
  'gpt-3.5-turbo-0125': 16375, // -10 from max
  'mistral-': 31990, // -10 from max
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
  'gemini-pro-vision': 12288, // -4096 from max
  'gemini-1.5': 1048576, // -8192 from max
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
  'claude-2': 100000,
  'claude-2.1': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-opus': 200000,
};

const togetherAIModels = {
  // models with context sizes != 4096 are included in this list
  // as that is the default max context size
  // https://docs.together.ai/docs/inference-models
  'allenai/OLMo-7B-Instruct': 2038,
  'allenai/OLMo-7B-Twin-2T': 2038,
  'allenai/OLMo-7B': 2038,
  'Austism/chronos-hermes-13b': 2038,
  'cognitivecomputations/dolphin-2.5-mixtral-8x7b': 32758,
  'databricks/dbrx-instruct': 32758,
  'deepseek-ai/deepseek-coder-33b-instruct': 16374,
  'google/gemma-2b-it': 8182,
  'google/gemma-7b-it': 8182,
  'codellama/CodeLlama-13b-Instruct-hf': 16374,
  'codellama/CodeLlama-34b-Instruct-hf': 16374,
  'codellama/CodeLlama-7b-Instruct-hf': 16374,
  'meta-llama/Llama-3-8b-chat-hf': 7990,
  'meta-llama/Llama-3-70b-chat-hf': 7990,
  'microsoft/WizardLM-2-8x22B': 65526,
  'mistralai/Mistral-7B-Instruct-v0.1': 8182,
  'mistralai/Mistral-7B-Instruct-v0.2': 32758,
  'mistralai/Mixtral-8x7B-Instruct-v0.1': 32758,
  'mistralai/Mixtral-8x22B-Instruct-v0.1': 65526,
  'NousResearch/Nous-Capybara-7B-V1p9': 8182,
  'NousResearch/Nous-Hermes-2-Mistral-7B-DPO': 32758,
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO': 32758,
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-SFT': 32758,
  'openchat/openchat-3.5-1210': 8182,
  'Open-Orca/Mistral-7B-OpenOrca': 8182,
  'Qwen/Qwen1.5-0.5B-Chat': 32758,
  'Qwen/Qwen1.5-1.8B-Chat': 32758,
  'Qwen/Qwen1.5-4B-Chat': 32758,
  'Qwen/Qwen1.5-7B-Chat': 32758,
  'Qwen/Qwen1.5-14B-Chat': 32758,
  'Qwen/Qwen1.5-32B-Chat': 32758,
  'Qwen/Qwen1.5-72B-Chat': 32758,
  'snorkelai/Snorkel-Mistral-PairRM-DPO': 32758,
  'togethercomputer/alpaca-7b': 2038,
  'teknium/OpenHermes-2-Mistral-7B': 8182,
  'teknium/OpenHermes-2p5-Mistral-7B': 8182,
  'togethercomputer/Llama-2-7B-32K-Instruct': 32758,
  'togethercomputer/RedPajama-INCITE-Chat-3B-v1': 2038,
  'togethercomputer/RedPajama-INCITE-7B-Chat': 2038,
  'togethercomputer/StripedHyena-Nous-7B': 32758,
};

const aggregateModels = {
  ...openAIModels,
  ...googleModels,
  ...anthropicModels,
  ...cohereModels,
  ...togetherAIModels,
};

// Order is important here: by model series and context size (gpt-4 then gpt-3, ascending)
const maxTokensMap = {
  [EModelEndpoint.azureOpenAI]: openAIModels,
  [EModelEndpoint.openAI]: aggregateModels,
  [EModelEndpoint.custom]: aggregateModels,
  [EModelEndpoint.google]: googleModels,
  [EModelEndpoint.anthropic]: anthropicModels,
};

/**
 * Retrieves the maximum tokens for a given model name. If the exact model name isn't found,
 * it searches for partial matches within the model name, checking keys in reverse order.
 *
 * @param {string} modelName - The name of the model to look up.
 * @param {string} endpoint - The endpoint (default is 'openAI').
 * @param {EndpointTokenConfig} [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns {number|undefined} The maximum tokens for the given model or undefined if no match is found.
 *
 * @example
 * getModelMaxTokens('gpt-4-32k-0613'); // Returns 32767
 * getModelMaxTokens('gpt-4-32k-unknown'); // Returns 32767
 * getModelMaxTokens('unknown-model'); // Returns undefined
 */
function getModelMaxTokens(modelName, endpoint = EModelEndpoint.openAI, endpointTokenConfig) {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  /** @type {EndpointTokenConfig | Record<string, number>} */
  const tokensMap = endpointTokenConfig ?? maxTokensMap[endpoint];
  if (!tokensMap) {
    return undefined;
  }

  if (tokensMap[modelName]?.context) {
    return tokensMap[modelName].context;
  }

  if (tokensMap[modelName]) {
    return tokensMap[modelName];
  }

  const keys = Object.keys(tokensMap);
  for (let i = keys.length - 1; i >= 0; i--) {
    if (modelName.includes(keys[i])) {
      const result = tokensMap[keys[i]];
      return result?.context ?? result;
    }
  }

  return undefined;
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

  const keys = Object.keys(tokensMap);
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (modelName.includes(modelKey)) {
      return modelKey;
    }
  }

  return modelName;
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

module.exports = {
  tiktokenModels: new Set(models),
  maxTokensMap,
  inputSchema,
  modelSchema,
  getModelMaxTokens,
  matchModelName,
  processModelData,
};
