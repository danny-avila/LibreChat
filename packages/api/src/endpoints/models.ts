import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CacheKeys, KnownEndpoints, EModelEndpoint, defaultModels } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import {
  processModelData,
  extractBaseURL,
  isUserProvided,
  resolveHeaders,
  deriveBaseURL,
  logAxiosError,
  inputSchema,
} from '~/utils';
import { standardCache } from '~/cache';

export interface FetchModelsParams {
  /** User ID for API requests */
  user?: string;
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API */
  baseURL?: string;
  /** Endpoint name (defaults to 'openAI') */
  name?: string;
  /** Whether directEndpoint was configured */
  direct?: boolean;
  /** Whether to fetch from Azure */
  azure?: boolean;
  /** Whether to send user ID as query parameter */
  userIdQuery?: boolean;
  /** Whether to create token configuration from API response */
  createTokenConfig?: boolean;
  /** Cache key for token configuration (uses name if omitted) */
  tokenKey?: string;
  /** Optional headers for the request */
  headers?: Record<string, string> | null;
  /** Optional user object for header resolution */
  userObject?: Partial<IUser>;
}

/**
 * Fetches Ollama models from the specified base API path.
 * @param baseURL - The Ollama server URL
 * @param options - Optional configuration
 * @returns Promise resolving to array of model names
 */
async function fetchOllamaModels(
  baseURL: string,
  options: { headers?: Record<string, string> | null; user?: Partial<IUser> } = {},
): Promise<string[]> {
  if (!baseURL) {
    return [];
  }

  const ollamaEndpoint = deriveBaseURL(baseURL);

  const resolvedHeaders = resolveHeaders({
    headers: options.headers ?? undefined,
    user: options.user,
  });

  const response = await axios.get<{ models: Array<{ name: string }> }>(
    `${ollamaEndpoint}/api/tags`,
    {
      headers: resolvedHeaders,
      timeout: 5000,
    },
  );

  return response.data.models.map((tag) => tag.name);
}

/**
 * Splits a string by commas and trims each resulting value.
 * @param input - The input string to split.
 * @returns An array of trimmed values.
 */
export function splitAndTrim(input: string | null | undefined): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Fetches models from the specified base API path or Azure, based on the provided configuration.
 *
 * @param params - The parameters for fetching the models.
 * @returns A promise that resolves to an array of model identifiers.
 */
export async function fetchModels({
  user,
  apiKey,
  baseURL: _baseURL,
  name = EModelEndpoint.openAI,
  direct = false,
  azure = false,
  userIdQuery = false,
  createTokenConfig = true,
  tokenKey,
  headers,
  userObject,
}: FetchModelsParams): Promise<string[]> {
  let models: string[] = [];
  const baseURL = direct ? extractBaseURL(_baseURL ?? '') : _baseURL;

  if (!baseURL && !azure) {
    return models;
  }

  if (!apiKey) {
    return models;
  }

  if (name && name.toLowerCase().startsWith(KnownEndpoints.ollama)) {
    try {
      return await fetchOllamaModels(baseURL ?? '', { headers, user: userObject });
    } catch (ollamaError) {
      const logMessage =
        'Failed to fetch models from Ollama API. Attempting to fetch via OpenAI-compatible endpoint.';
      logAxiosError({ message: logMessage, error: ollamaError as Error });
    }
  }

  try {
    const options: {
      headers: Record<string, string>;
      timeout: number;
      httpsAgent?: HttpsProxyAgent<string>;
    } = {
      headers: {
        ...(headers ?? {}),
      },
      timeout: 5000,
    };

    if (name === EModelEndpoint.anthropic) {
      options.headers = {
        'x-api-key': apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
      };
    } else {
      options.headers.Authorization = `Bearer ${apiKey}`;
    }

    if (process.env.PROXY) {
      options.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
    }

    if (process.env.OPENAI_ORGANIZATION && baseURL?.includes('openai')) {
      options.headers['OpenAI-Organization'] = process.env.OPENAI_ORGANIZATION;
    }

    const url = new URL(`${(baseURL ?? '').replace(/\/+$/, '')}${azure ? '' : '/models'}`);
    if (user && userIdQuery) {
      url.searchParams.append('user', user);
    }
    const res = await axios.get(url.toString(), options);

    const input = res.data;

    const validationResult = inputSchema.safeParse(input);
    if (validationResult.success && createTokenConfig) {
      const endpointTokenConfig = processModelData(input);
      const cache = standardCache(CacheKeys.TOKEN_CONFIG);
      await cache.set(tokenKey ?? name, endpointTokenConfig);
    }
    models = input.data.map((item: { id: string }) => item.id);
  } catch (error) {
    const logMessage = `Failed to fetch models from ${azure ? 'Azure ' : ''}${name} API`;
    logAxiosError({ message: logMessage, error: error as Error });
  }

  return models;
}

/** Options for fetching OpenAI models */
export interface GetOpenAIModelsOptions {
  /** User ID for API requests */
  user?: string;
  /** Whether to fetch from Azure */
  azure?: boolean;
  /** Whether to fetch models for the Assistants endpoint */
  assistants?: boolean;
  /** OpenAI API key (if not using environment variable) */
  openAIApiKey?: string;
  /** Whether user provides their own API key */
  userProvidedOpenAI?: boolean;
}

/**
 * Fetches models from OpenAI or Azure based on the provided options.
 * @param opts - Options for fetching models
 * @param _models - Fallback models array
 * @returns Promise resolving to array of model IDs
 */
export async function fetchOpenAIModels(
  opts: GetOpenAIModelsOptions,
  _models: string[] = [],
): Promise<string[]> {
  let models = _models.slice() ?? [];
  const apiKey = opts.openAIApiKey ?? process.env.OPENAI_API_KEY;
  const openaiBaseURL = 'https://api.openai.com/v1';
  let baseURL = openaiBaseURL;
  let reverseProxyUrl = process.env.OPENAI_REVERSE_PROXY;

  if (opts.assistants && process.env.ASSISTANTS_BASE_URL) {
    reverseProxyUrl = process.env.ASSISTANTS_BASE_URL;
  } else if (opts.azure) {
    return models;
  }

  if (reverseProxyUrl) {
    baseURL = extractBaseURL(reverseProxyUrl) ?? openaiBaseURL;
  }

  const modelsCache = standardCache(CacheKeys.MODEL_QUERIES);

  const cachedModels = await modelsCache.get(baseURL);
  if (cachedModels) {
    return cachedModels as string[];
  }

  if (baseURL || opts.azure) {
    models = await fetchModels({
      apiKey: apiKey ?? '',
      baseURL,
      azure: opts.azure,
      user: opts.user,
      name: EModelEndpoint.openAI,
    });
  }

  if (models.length === 0) {
    return _models;
  }

  if (baseURL === openaiBaseURL) {
    const regex = /(text-davinci-003|gpt-|o\d+)/;
    const excludeRegex = /audio|realtime/;
    models = models.filter((model) => regex.test(model) && !excludeRegex.test(model));
    const instructModels = models.filter((model) => model.includes('instruct'));
    const otherModels = models.filter((model) => !model.includes('instruct'));
    models = otherModels.concat(instructModels);
  }

  await modelsCache.set(baseURL, models);
  return models;
}

/**
 * Loads the default models for OpenAI or Azure.
 * @param opts - Options for getting models
 * @returns Promise resolving to array of model IDs
 */
export async function getOpenAIModels(opts: GetOpenAIModelsOptions = {}): Promise<string[]> {
  let models = defaultModels[EModelEndpoint.openAI];

  if (opts.assistants) {
    models = defaultModels[EModelEndpoint.assistants];
  } else if (opts.azure) {
    models = defaultModels[EModelEndpoint.azureAssistants];
  }

  let key: string;
  if (opts.assistants) {
    key = 'ASSISTANTS_MODELS';
  } else if (opts.azure) {
    key = 'AZURE_OPENAI_MODELS';
  } else {
    key = 'OPENAI_MODELS';
  }

  if (process.env[key]) {
    return splitAndTrim(process.env[key]);
  }

  if (opts.userProvidedOpenAI) {
    return models;
  }

  return await fetchOpenAIModels(opts, models);
}

/**
 * Fetches models from the Anthropic API.
 * @param opts - Options for fetching models
 * @param _models - Fallback models array
 * @returns Promise resolving to array of model IDs
 */
export async function fetchAnthropicModels(
  opts: { user?: string } = {},
  _models: string[] = [],
): Promise<string[]> {
  let models = _models.slice() ?? [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicBaseURL = 'https://api.anthropic.com/v1';
  let baseURL = anthropicBaseURL;
  const reverseProxyUrl = process.env.ANTHROPIC_REVERSE_PROXY;

  if (reverseProxyUrl) {
    baseURL = extractBaseURL(reverseProxyUrl) ?? anthropicBaseURL;
  }

  if (!apiKey) {
    return models;
  }

  const modelsCache = standardCache(CacheKeys.MODEL_QUERIES);

  const cachedModels = await modelsCache.get(baseURL);
  if (cachedModels) {
    return cachedModels as string[];
  }

  if (baseURL) {
    models = await fetchModels({
      apiKey,
      baseURL,
      user: opts.user,
      name: EModelEndpoint.anthropic,
      tokenKey: EModelEndpoint.anthropic,
    });
  }

  if (models.length === 0) {
    return _models;
  }

  await modelsCache.set(baseURL, models);
  return models;
}

/**
 * Gets Anthropic models from environment or API.
 * @param opts - Options for fetching models
 * @returns Promise resolving to array of model IDs
 */
export async function getAnthropicModels(
  opts: { user?: string; vertexModels?: string[] } = {},
): Promise<string[]> {
  const models = defaultModels[EModelEndpoint.anthropic];

  // Vertex AI models from YAML config take priority
  if (opts.vertexModels && opts.vertexModels.length > 0) {
    return opts.vertexModels;
  }

  if (process.env.ANTHROPIC_MODELS) {
    return splitAndTrim(process.env.ANTHROPIC_MODELS);
  }

  if (isUserProvided(process.env.ANTHROPIC_API_KEY)) {
    return models;
  }

  try {
    return await fetchAnthropicModels(opts, models);
  } catch (error) {
    logger.error('Error fetching Anthropic models:', error);
    return models;
  }
}

/**
 * Gets Google models from environment or defaults.
 * @returns Array of model IDs
 */
export function getGoogleModels(): string[] {
  let models = defaultModels[EModelEndpoint.google];
  if (process.env.GOOGLE_MODELS) {
    models = splitAndTrim(process.env.GOOGLE_MODELS);
  }
  return models;
}

/**
 * Gets Bedrock models from environment or defaults.
 * @returns Array of model IDs
 */
export function getBedrockModels(): string[] {
  let models = defaultModels[EModelEndpoint.bedrock];
  if (process.env.BEDROCK_AWS_MODELS) {
    models = splitAndTrim(process.env.BEDROCK_AWS_MODELS);
  }
  return models;
}
