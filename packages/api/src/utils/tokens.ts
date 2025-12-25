import z from 'zod';
import { EModelEndpoint, maxTokensMap, maxOutputTokensMap } from 'librechat-data-provider';
import type { EndpointTokenConfig, TokenConfig } from '~/types';

/**
 * Finds the first matching pattern in the tokens map.
 * @param {string} modelName
 * @param {Record<string, number> | EndpointTokenConfig} tokensMap
 * @returns {string|null}
 */
export function findMatchingPattern(
  modelName: string,
  tokensMap: Record<string, number> | EndpointTokenConfig,
): string | null {
  const keys = Object.keys(tokensMap);
  const lowerModelName = modelName.toLowerCase();
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (lowerModelName.includes(modelKey)) {
      return modelKey;
    }
  }

  return null;
}

/**
 * Retrieves a token value for a given model name from a tokens map.
 *
 * @param modelName - The name of the model to look up.
 * @param tokensMap - The map of model names to token values.
 * @param [key='context'] - The key to look up in the tokens map.
 * @returns The token value for the given model or undefined if no match is found.
 */
export function getModelTokenValue(
  modelName: string,
  tokensMap?: EndpointTokenConfig | Record<string, number>,
  key = 'context' as keyof TokenConfig,
): number | undefined {
  if (typeof modelName !== 'string' || !tokensMap) {
    return undefined;
  }

  const value = tokensMap[modelName];
  if (typeof value === 'number') {
    return value;
  }

  if (value?.context) {
    return value.context;
  }

  const matchedPattern = findMatchingPattern(modelName, tokensMap);

  if (matchedPattern) {
    const result = tokensMap[matchedPattern];
    if (typeof result === 'number') {
      return result;
    }

    const tokenValue = result?.[key];
    if (typeof tokenValue === 'number') {
      return tokenValue;
    }
    return tokensMap.system_default as number | undefined;
  }

  return tokensMap.system_default as number | undefined;
}

/**
 * Retrieves the maximum tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum tokens for the given model or undefined if no match is found.
 */
export function getModelMaxTokens(
  modelName: string,
  endpoint = EModelEndpoint.openAI,
  endpointTokenConfig?: EndpointTokenConfig,
): number | undefined {
  const tokensMap = endpointTokenConfig ?? maxTokensMap[endpoint as keyof typeof maxTokensMap];
  return getModelTokenValue(modelName, tokensMap);
}

/**
 * Retrieves the maximum output tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum output tokens for the given model or undefined if no match is found.
 */
export function getModelMaxOutputTokens(
  modelName: string,
  endpoint = EModelEndpoint.openAI,
  endpointTokenConfig?: EndpointTokenConfig,
): number | undefined {
  const tokensMap =
    endpointTokenConfig ?? maxOutputTokensMap[endpoint as keyof typeof maxOutputTokensMap];
  return getModelTokenValue(modelName, tokensMap, 'output');
}

/**
 * Retrieves the model name key for a given model name input. If the exact model name isn't found,
 * it searches for partial matches within the model name, checking keys in reverse order.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @returns The model name key for the given model; returns input if no match is found and is string.
 *
 * @example
 * matchModelName('gpt-4-32k-0613'); // Returns 'gpt-4-32k-0613'
 * matchModelName('gpt-4-32k-unknown'); // Returns 'gpt-4-32k'
 * matchModelName('unknown-model'); // Returns undefined
 */
export function matchModelName(
  modelName: string,
  endpoint = EModelEndpoint.openAI,
): string | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  const tokensMap: Record<string, number> = maxTokensMap[endpoint as keyof typeof maxTokensMap];
  if (!tokensMap) {
    return modelName;
  }

  if (tokensMap[modelName]) {
    return modelName;
  }

  const matchedPattern = findMatchingPattern(modelName, tokensMap);
  return matchedPattern || modelName;
}

export const modelSchema = z.object({
  id: z.string(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  context_length: z.number(),
});

export const inputSchema = z.object({
  data: z.array(modelSchema),
});

/**
 * Processes a list of model data from an API and organizes it into structured data based on URL and specifics of rates and context.
 * @param {{ data: Array<z.infer<typeof modelSchema>> }} input The input object containing base URL and data fetched from the API.
 * @returns {EndpointTokenConfig} The processed model data.
 */
export function processModelData(input: z.infer<typeof inputSchema>): EndpointTokenConfig {
  const validationResult = inputSchema.safeParse(input);
  if (!validationResult.success) {
    throw new Error('Invalid input data');
  }
  const { data } = validationResult.data;

  /** @type {EndpointTokenConfig} */
  const tokenConfig: EndpointTokenConfig = {};

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

export const tiktokenModels = new Set([
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
