import {
  CacheKeys,
  ErrorTypes,
  envVarRegex,
  FetchTokenConfig,
  extractEnvVariable,
} from 'librechat-data-provider';
import type { TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { BaseInitializeParams, InitializeResultBase, EndpointTokenConfig } from '~/types';
import { getOpenAIConfig } from '~/endpoints/openai/config';
import { getCustomEndpointConfig } from '~/app/config';
import { fetchModels } from '~/endpoints/models';
import { isUserProvided, checkUserKeyExpiry } from '~/utils';
import { standardCache } from '~/cache';

const { PROXY } = process.env;

/**
 * Builds custom options from endpoint configuration
 */
function buildCustomOptions(
  endpointConfig: Partial<TEndpoint>,
  appConfig?: AppConfig,
  endpointTokenConfig?: Record<string, unknown>,
) {
  const customOptions: Record<string, unknown> = {
    headers: endpointConfig.headers,
    addParams: endpointConfig.addParams,
    dropParams: endpointConfig.dropParams,
    customParams: endpointConfig.customParams,
    titleConvo: endpointConfig.titleConvo,
    titleModel: endpointConfig.titleModel,
    forcePrompt: endpointConfig.forcePrompt,
    summaryModel: endpointConfig.summaryModel,
    modelDisplayLabel: endpointConfig.modelDisplayLabel,
    titleMethod: endpointConfig.titleMethod ?? 'completion',
    contextStrategy: endpointConfig.summarize ? 'summarize' : null,
    directEndpoint: endpointConfig.directEndpoint,
    titleMessageRole: endpointConfig.titleMessageRole,
    streamRate: endpointConfig.streamRate,
    endpointTokenConfig,
  };

  const allConfig = appConfig?.endpoints?.all;
  if (allConfig) {
    customOptions.streamRate = allConfig.streamRate;
  }

  return customOptions;
}

/**
 * Initializes a custom endpoint client configuration.
 * This function handles custom endpoints defined in librechat.yaml, including
 * user-provided API keys and URLs.
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to endpoint configuration options
 * @throws Error if config is missing, API key is not provided, or base URL is missing
 */
export async function initializeCustom({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  const appConfig = req.config;
  const { key: expiresAt } = req.body;

  const endpointConfig = getCustomEndpointConfig({
    endpoint,
    appConfig,
  });

  if (!endpointConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const CUSTOM_API_KEY = extractEnvVariable(endpointConfig.apiKey ?? '');
  const CUSTOM_BASE_URL = extractEnvVariable(endpointConfig.baseURL ?? '');

  if (CUSTOM_API_KEY.match(envVarRegex)) {
    throw new Error(`Missing API Key for ${endpoint}.`);
  }

  if (CUSTOM_BASE_URL.match(envVarRegex)) {
    throw new Error(`Missing Base URL for ${endpoint}.`);
  }

  const userProvidesKey = isUserProvided(CUSTOM_API_KEY);
  const userProvidesURL = isUserProvided(CUSTOM_BASE_URL);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  const apiKey = userProvidesKey ? userValues?.apiKey : CUSTOM_API_KEY;
  const baseURL = userProvidesURL ? userValues?.baseURL : CUSTOM_BASE_URL;

  if (userProvidesKey && !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (userProvidesURL && !baseURL) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_BASE_URL,
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  if (!baseURL) {
    throw new Error(`${endpoint} Base URL not provided.`);
  }

  let endpointTokenConfig: EndpointTokenConfig | undefined;

  const userId = req.user?.id ?? '';

  const cache = standardCache(CacheKeys.TOKEN_CONFIG);
  /** tokenConfig is an optional extended property on custom endpoints */
  const hasTokenConfig = (endpointConfig as Record<string, unknown>).tokenConfig != null;
  const tokenKey =
    !hasTokenConfig && (userProvidesKey || userProvidesURL) ? `${endpoint}:${userId}` : endpoint;

  const cachedConfig =
    !hasTokenConfig &&
    FetchTokenConfig[endpoint.toLowerCase() as keyof typeof FetchTokenConfig] &&
    (await cache.get(tokenKey));

  endpointTokenConfig = (cachedConfig as EndpointTokenConfig) || undefined;

  if (
    FetchTokenConfig[endpoint.toLowerCase() as keyof typeof FetchTokenConfig] &&
    endpointConfig &&
    endpointConfig.models?.fetch &&
    !endpointTokenConfig
  ) {
    await fetchModels({ apiKey, baseURL, name: endpoint, user: userId, tokenKey });
    endpointTokenConfig = (await cache.get(tokenKey)) as EndpointTokenConfig | undefined;
  }

  const customOptions = buildCustomOptions(endpointConfig, appConfig, endpointTokenConfig);

  const clientOptions: Record<string, unknown> = {
    reverseProxyUrl: baseURL ?? null,
    proxy: PROXY ?? null,
    ...customOptions,
  };

  const modelOptions = { ...(model_parameters ?? {}), user: userId };
  const finalClientOptions = {
    modelOptions,
    ...clientOptions,
  };

  const options = getOpenAIConfig(apiKey, finalClientOptions, endpoint);
  if (options != null) {
    (options as InitializeResultBase).useLegacyContent = true;
    (options as InitializeResultBase).endpointTokenConfig = endpointTokenConfig;
  }

  const streamRate = clientOptions.streamRate as number | undefined;
  if (streamRate) {
    (options.llmConfig as Record<string, unknown>)._lc_stream_delay = streamRate;
  }

  return options;
}
