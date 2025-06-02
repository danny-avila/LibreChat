import { HttpsProxyAgent } from 'https-proxy-agent';
import { KnownEndpoints } from 'librechat-data-provider';
import type { AzureOptions } from '~/utils/azure';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

/**
 * Model-specific options interface
 */
export interface ModelOptions {
  model?: string;
  user?: string;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  stop?: string[];
  maxOutputTokens?: number;
  maxTokens?: number;
  maxContextTokens?: number;
  reasoning_effort?: number;
}

/**
 * OpenAI Client configuration options
 */
export interface OpenAIClientOptions {
  streaming?: boolean;
  apiKey?: string;
  organization?: string;
  model?: string;
  user?: string;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  maxTokens?: number;
  stop?: string[];
  logit_bias?: Record<string, number>;
  seed?: number;
  response_format?: Record<string, unknown>;
  n?: number;
  logprobs?: boolean;
  include_reasoning?: boolean;
  reasoning?: { effort?: number };
  maxOutputTokens?: number;
  maxContextTokens?: number;
  reasoning_effort?: number;
  configuration?: OpenAIClientConfiguration;
}

/**
 * OpenAI Client configuration for initialization
 */
export interface OpenAIClientConfiguration {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: Record<string, string | number>;
  httpAgent?: HttpsProxyAgent;
  httpsAgent?: HttpsProxyAgent;
  organization?: string;
}

/**
 * Configuration options for the getLLMConfig function
 */
export interface LLMConfigOptions {
  modelOptions?: ModelOptions;
  reverseProxyUrl?: string;
  defaultQuery?: Record<string, string | number>;
  headers?: Record<string, string>;
  proxy?: string;
  azure?: AzureOptions;
  streaming?: boolean;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
}

/**
 * Return type for getLLMConfig function
 */
export interface LLMConfigResult {
  llmConfig: OpenAIClientOptions;
  configOptions: OpenAIClientConfiguration;
}

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
export function getLLMConfig(
  apiKey: string,
  options: LLMConfigOptions = {},
  endpoint?: string | null,
): LLMConfigResult {
  const {
    modelOptions = {},
    reverseProxyUrl,
    defaultQuery,
    headers,
    proxy,
    azure,
    streaming = true,
    addParams,
    dropParams,
  } = options;

  const llmConfig: OpenAIClientOptions = {
    streaming,
  };

  Object.assign(llmConfig, modelOptions);

  if (addParams && typeof addParams === 'object') {
    Object.assign(llmConfig, addParams);
  }

  // Note: OpenAI Web Search models do not support any known parameters besides `max_tokens`
  if (modelOptions.model && /gpt-4o.*search/.test(modelOptions.model)) {
    const searchExcludeParams = [
      'frequency_penalty',
      'presence_penalty',
      'temperature',
      'top_p',
      'top_k',
      'stop',
      'logit_bias',
      'seed',
      'response_format',
      'n',
      'logprobs',
      'user',
    ];

    const updatedDropParams = dropParams || [];
    const combinedDropParams = [...new Set([...updatedDropParams, ...searchExcludeParams])];

    combinedDropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof OpenAIClientOptions];
      }
    });
  } else if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof OpenAIClientOptions];
      }
    });
  }

  let useOpenRouter = false;
  const configOptions: OpenAIClientConfiguration = {};

  if (
    (reverseProxyUrl && reverseProxyUrl.includes(KnownEndpoints.openrouter)) ||
    (endpoint && endpoint.toLowerCase().includes(KnownEndpoints.openrouter))
  ) {
    useOpenRouter = true;
    llmConfig.include_reasoning = true;
    configOptions.baseURL = reverseProxyUrl;
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
      headers,
    );
  } else if (reverseProxyUrl) {
    configOptions.baseURL = reverseProxyUrl;
    if (headers) {
      configOptions.defaultHeaders = headers;
    }
  }

  if (defaultQuery) {
    configOptions.defaultQuery = defaultQuery;
  }

  if (proxy) {
    const proxyAgent = new HttpsProxyAgent(proxy);
    configOptions.httpAgent = proxyAgent;
    configOptions.httpsAgent = proxyAgent;
  }

  if (azure) {
    const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);
    const updatedAzure = { ...azure };
    updatedAzure.azureOpenAIApiDeploymentName = useModelName
      ? sanitizeModelName(llmConfig.model || '')
      : azure.azureOpenAIApiDeploymentName;

    if (process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      llmConfig.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    }

    if (configOptions.baseURL) {
      const azureURL = constructAzureURL({
        baseURL: configOptions.baseURL,
        azureOptions: updatedAzure,
      });
      updatedAzure.azureOpenAIBasePath = azureURL.split(
        `/${updatedAzure.azureOpenAIApiDeploymentName}`,
      )[0];
    }

    Object.assign(llmConfig, updatedAzure);
    llmConfig.model = updatedAzure.azureOpenAIApiDeploymentName;
  } else {
    llmConfig.apiKey = apiKey;
  }

  if (process.env.OPENAI_ORGANIZATION && azure) {
    llmConfig.organization = process.env.OPENAI_ORGANIZATION;
  }

  if (useOpenRouter && llmConfig.reasoning_effort != null) {
    llmConfig.reasoning = {
      effort: llmConfig.reasoning_effort,
    };
    delete llmConfig.reasoning_effort;
  }

  if (llmConfig.max_tokens != null) {
    llmConfig.maxTokens = llmConfig.max_tokens;
    delete llmConfig.max_tokens;
  }

  return {
    llmConfig,
    configOptions,
  };
}
