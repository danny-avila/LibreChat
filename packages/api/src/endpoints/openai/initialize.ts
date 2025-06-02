import {
  ErrorTypes,
  EModelEndpoint,
  resolveHeaders,
  mapModelToAzureConfig,
} from 'librechat-data-provider';
import type {
  LLMConfigOptions,
  UserKeyValues,
  InitializeOpenAIOptionsParams,
  OpenAIOptionsResult,
} from '~/types';
import { createHandleLLMNewToken } from '~/utils/generators';
import { getAzureCredentials } from '~/utils/azure';
import { isUserProvided } from '~/utils/common';
import { getOpenAIConfig } from './llm';

/**
 * Initializes OpenAI options for agent usage. This function always returns configuration
 * options and never creates a client instance (equivalent to optionsOnly=true behavior).
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to OpenAI configuration options
 * @throws Error if API key is missing or user key has expired
 */
export const initializeOpenAI = async ({
  req,
  overrideModel,
  endpointOption,
  overrideEndpoint,
  getUserKeyValues,
  checkUserKeyExpiry,
}: InitializeOpenAIOptionsParams): Promise<OpenAIOptionsResult> => {
  const { PROXY, OPENAI_API_KEY, AZURE_API_KEY, OPENAI_REVERSE_PROXY, AZURE_OPENAI_BASEURL } =
    process.env;

  const { key: expiresAt } = req.body;
  const modelName = overrideModel ?? req.body.model;
  const endpoint = overrideEndpoint ?? req.body.endpoint;

  if (!endpoint) {
    throw new Error('Endpoint is required');
  }

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const userProvidesKey = isUserProvided(credentials[endpoint as keyof typeof credentials]);
  const userProvidesURL = isUserProvided(baseURLOptions[endpoint as keyof typeof baseURLOptions]);

  let userValues: UserKeyValues | null = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await getUserKeyValues({ userId: req.user.id, name: endpoint });
  }

  let apiKey = userProvidesKey
    ? userValues?.apiKey
    : credentials[endpoint as keyof typeof credentials];
  const baseURL = userProvidesURL
    ? userValues?.baseURL
    : baseURLOptions[endpoint as keyof typeof baseURLOptions];

  const clientOptions: LLMConfigOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: baseURL || undefined,
    streaming: true,
  };

  const isAzureOpenAI = endpoint === EModelEndpoint.azureOpenAI;
  const azureConfig = isAzureOpenAI && req.app.locals[EModelEndpoint.azureOpenAI];

  if (isAzureOpenAI && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL: configBaseURL,
      headers = {},
      serverless,
    } = mapModelToAzureConfig({
      modelName: modelName || '',
      modelGroupMap,
      groupMap,
    });

    clientOptions.reverseProxyUrl = configBaseURL ?? clientOptions.reverseProxyUrl;
    clientOptions.headers = resolveHeaders({ ...headers, ...(clientOptions.headers ?? {}) });

    const groupName = modelGroupMap[modelName || '']?.group;
    if (groupName && groupMap[groupName]) {
      clientOptions.addParams = groupMap[groupName]?.addParams;
      clientOptions.dropParams = groupMap[groupName]?.dropParams;
    }

    apiKey = azureOptions.azureOpenAIApiKey;
    clientOptions.azure = !serverless ? azureOptions : undefined;

    if (serverless === true) {
      clientOptions.defaultQuery = azureOptions.azureOpenAIApiVersion
        ? { 'api-version': azureOptions.azureOpenAIApiVersion }
        : undefined;

      if (!clientOptions.headers) {
        clientOptions.headers = {};
      }
      clientOptions.headers['api-key'] = apiKey;
    }
  } else if (isAzureOpenAI) {
    clientOptions.azure =
      userProvidesKey && userValues?.apiKey ? JSON.parse(userValues.apiKey) : getAzureCredentials();
    apiKey = clientOptions.azure?.azureOpenAIApiKey;
  }

  if (userProvidesKey && !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API Key not provided.`);
  }

  const modelOptions = {
    ...endpointOption.model_parameters,
    model: modelName,
    user: req.user.id,
  };

  const finalClientOptions: LLMConfigOptions = {
    ...clientOptions,
    modelOptions,
  };

  const options = getOpenAIConfig(apiKey, finalClientOptions, endpoint);

  const openAIConfig = req.app.locals[EModelEndpoint.openAI];
  const allConfig = req.app.locals.all;
  const azureRate = modelName?.includes('gpt-4') ? 30 : 17;

  let streamRate: number | undefined;

  if (isAzureOpenAI && azureConfig) {
    streamRate = azureConfig.streamRate ?? azureRate;
  } else if (!isAzureOpenAI && openAIConfig) {
    streamRate = openAIConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    streamRate = allConfig.streamRate;
  }

  if (streamRate) {
    options.llmConfig.callbacks = [
      {
        handleLLMNewToken: createHandleLLMNewToken(streamRate),
      },
    ];
  }

  const result: OpenAIOptionsResult = {
    ...options,
    streamRate,
  };

  return result;
};
