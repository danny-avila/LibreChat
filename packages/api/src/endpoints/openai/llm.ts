import { ProxyAgent } from 'undici';
import { KnownEndpoints, removeNullishValues } from 'librechat-data-provider';
import type { OpenAI } from 'openai';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

function hasReasoningParams({
  reasoning_effort,
  reasoning_summary,
}: {
  reasoning_effort?: string | null;
  reasoning_summary?: string | null;
}): boolean {
  return (
    (reasoning_effort != null && reasoning_effort !== '') ||
    (reasoning_summary != null && reasoning_summary !== '')
  );
}

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
export function getOpenAIConfig(
  apiKey: string,
  options: t.OpenAIConfigOptions = {},
  endpoint?: string | null,
): t.LLMConfigResult {
  const {
    modelOptions: _modelOptions = {},
    reverseProxyUrl,
    defaultQuery,
    headers,
    proxy,
    azure,
    streaming = true,
    addParams,
    dropParams,
  } = options;
  const { reasoning_effort, reasoning_summary, ...modelOptions } = _modelOptions;
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

  if (
    hasReasoningParams({ reasoning_effort, reasoning_summary }) &&
    (llmConfig.useResponsesApi === true || useOpenRouter)
  ) {
    llmConfig.reasoning = removeNullishValues(
      {
        effort: reasoning_effort,
        summary: reasoning_summary,
      },
      true,
    ) as OpenAI.Reasoning;
  } else if (hasReasoningParams({ reasoning_effort })) {
    llmConfig.reasoning_effort = reasoning_effort;
  }

  if (llmConfig.max_tokens != null) {
    llmConfig.maxTokens = llmConfig.max_tokens;
    delete llmConfig.max_tokens;
  }

  /**
   * Note: OpenAI Web Search models do not support any known parameters besides `max_tokens`
   */
  if (modelOptions.model && /gpt-4o.*search/.test(modelOptions.model)) {
    const searchExcludeParams = [
      'frequency_penalty',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
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

  return {
    llmConfig,
    configOptions,
  };
}
