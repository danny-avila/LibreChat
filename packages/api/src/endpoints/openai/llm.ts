import { ProxyAgent } from 'undici';
import { Providers } from '@librechat/agents';
import { KnownEndpoints, removeNullishValues } from 'librechat-data-provider';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { AzureOpenAIInput } from '@langchain/openai';
import type { OpenAI } from 'openai';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { createFetch } from '~/utils/generators';
import { isEnabled } from '~/utils/common';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const knownOpenAIParams = new Set([
  // Constructor/Instance Parameters
  'model',
  'modelName',
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
  'n',
  'logitBias',
  'stop',
  'stopSequences',
  'user',
  'timeout',
  'stream',
  'maxTokens',
  'maxCompletionTokens',
  'logprobs',
  'topLogprobs',
  'apiKey',
  'organization',
  'audio',
  'modalities',
  'reasoning',
  'zdrEnabled',
  'service_tier',
  'supportsStrictToolCalling',
  'useResponsesApi',
  'configuration',
  // Call-time Options
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'response_format',
  'seed',
  'stream_options',
  'parallel_tool_calls',
  'strict',
  'prediction',
  'promptIndex',
  // Responses API specific
  'text',
  'truncation',
  'include',
  'previous_response_id',
  // LangChain specific
  '__includeRawResponse',
  'maxConcurrency',
  'maxRetries',
  'verbose',
  'streaming',
  'streamUsage',
  'disableStreaming',
]);

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
    directEndpoint,
    defaultQuery,
    headers,
    proxy,
    azure,
    streaming = true,
    addParams,
    dropParams,
  } = options;
  const { reasoning_effort, reasoning_summary, verbosity, ...modelOptions } = _modelOptions;
  const llmConfig: Partial<t.ClientOptions> &
    Partial<t.OpenAIParameters> &
    Partial<AzureOpenAIInput> = Object.assign(
    {
      streaming,
      model: modelOptions.model ?? '',
    },
    modelOptions,
  );

  const modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;

  if (verbosity != null && verbosity !== '') {
    modelKwargs.verbosity = verbosity;
    hasModelKwargs = true;
  }

  if (addParams && typeof addParams === 'object') {
    for (const [key, value] of Object.entries(addParams)) {
      if (knownOpenAIParams.has(key)) {
        (llmConfig as Record<string, unknown>)[key] = value;
      } else {
        hasModelKwargs = true;
        modelKwargs[key] = value;
      }
    }
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

    const constructBaseURL = () => {
      if (!configOptions.baseURL) {
        return;
      }
      const azureURL = constructAzureURL({
        baseURL: configOptions.baseURL,
        azureOptions: updatedAzure,
      });
      updatedAzure.azureOpenAIBasePath = azureURL.split(
        `/${updatedAzure.azureOpenAIApiDeploymentName}`,
      )[0];
    };

    constructBaseURL();
    Object.assign(llmConfig, updatedAzure);

    const constructAzureResponsesApi = () => {
      if (!llmConfig.useResponsesApi) {
        return;
      }

      configOptions.baseURL = constructAzureURL({
        baseURL: configOptions.baseURL || 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
        azureOptions: llmConfig,
      });

      delete llmConfig.azureOpenAIApiDeploymentName;
      delete llmConfig.azureOpenAIApiInstanceName;
      delete llmConfig.azureOpenAIApiVersion;
      delete llmConfig.azureOpenAIBasePath;
      delete llmConfig.azureOpenAIApiKey;
      llmConfig.apiKey = apiKey;

      configOptions.defaultHeaders = {
        ...configOptions.defaultHeaders,
        'api-key': apiKey,
      };
      configOptions.defaultQuery = {
        ...configOptions.defaultQuery,
        'api-version': configOptions.defaultQuery?.['api-version'] ?? 'preview',
      };
    };

    constructAzureResponsesApi();

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

  const tools: BindToolsInput[] = [];

  if (modelOptions.web_search) {
    llmConfig.useResponsesApi = true;
    tools.push({ type: 'web_search_preview' });
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

  if (modelKwargs.verbosity && llmConfig.useResponsesApi === true) {
    modelKwargs.text = { verbosity: modelKwargs.verbosity };
    delete modelKwargs.verbosity;
  }

  if (llmConfig.model && /\bgpt-[5-9]\b/i.test(llmConfig.model) && llmConfig.maxTokens != null) {
    const paramName =
      llmConfig.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
    modelKwargs[paramName] = llmConfig.maxTokens;
    delete llmConfig.maxTokens;
    hasModelKwargs = true;
  }

  if (hasModelKwargs) {
    llmConfig.modelKwargs = modelKwargs;
  }

  if (directEndpoint === true && configOptions?.baseURL != null) {
    configOptions.fetch = createFetch({
      directEndpoint: directEndpoint,
      reverseProxyUrl: configOptions?.baseURL,
    }) as unknown as Fetch;
  }

  const result: t.LLMConfigResult = {
    llmConfig,
    configOptions,
    tools,
  };
  if (useOpenRouter) {
    result.provider = Providers.OPENROUTER;
  }
  return result;
}
