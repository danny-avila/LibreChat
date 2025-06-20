import { ProxyAgent } from 'undici';
import { KnownEndpoints } from 'librechat-data-provider';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
export function getOpenAIConfig(
  apiKey: string,
  options: t.LLMConfigOptions = {},
  endpoint?: string | null,
): t.LLMConfigResult {
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

  const llmConfig: Partial<t.ClientOptions> & Partial<t.OpenAIParameters> = Object.assign(
    {
      streaming,
      model: modelOptions.model ?? '',
    },
    modelOptions,
  );

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
        delete llmConfig[param as keyof t.ClientOptions];
      }
    });
  } else if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.ClientOptions];
      }
    });
  }

  let useOpenRouter = false;
  const configOptions: t.OpenAIConfiguration = {};

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
    const proxyAgent = new ProxyAgent(proxy);
    configOptions.fetchOptions = {
      dispatcher: proxyAgent,
    };
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
    configOptions.organization = process.env.OPENAI_ORGANIZATION;
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
