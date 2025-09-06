import { ProxyAgent } from 'undici';
import { Providers } from '@librechat/agents';
import { KnownEndpoints, EModelEndpoint } from 'librechat-data-provider';
import type { AnthropicClientOptions } from '@librechat/agents';
import type { AzureOpenAIInput } from '@langchain/openai';
import type * as t from '~/types';
import { getLLMConfig as getAnthropicLLMConfig } from '~/endpoints/anthropic/llm';
import { constructAzureURL } from '~/utils/azure';
import { createFetch } from '~/utils/generators';
import { getOpenAILLMConfig } from './llm';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SupportedLLMConfig =
  | AnthropicClientOptions
  | t.ClientOptions
  | (t.ClientOptions &
      AzureOpenAIInput & {
        useResponsesApi?: boolean;
        azureOpenAIApiKey?: string;
      });

/**
 * Overload for Anthropic configuration
 */
export function getOpenAIConfig(
  apiKey: string,
  options: t.OpenAIConfigOptions & {
    customParams: { defaultParamsEndpoint: typeof EModelEndpoint.anthropic };
  },
  endpoint?: string | null,
): t.LLMConfigResult<AnthropicClientOptions>;

/**
 * Overload for OpenAI/Azure configuration
 */
export function getOpenAIConfig(
  apiKey: string,
  options?: t.OpenAIConfigOptions,
  endpoint?: string | null,
): t.LLMConfigResult<t.ClientOptions>;

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
): t.LLMConfigResult<SupportedLLMConfig> {
  const {
    proxy,
    headers,
    addParams,
    dropParams,
    defaultQuery,
    directEndpoint,
    streaming = true,
    modelOptions = {},
    reverseProxyUrl: baseURL,
  } = options;

  let llmConfig: SupportedLLMConfig;
  let tools: t.LLMConfigResult['tools'];
  const isAnthropic = options.customParams?.defaultParamsEndpoint === EModelEndpoint.anthropic;

  const useOpenRouter =
    ((baseURL && baseURL.includes(KnownEndpoints.openrouter)) ||
      (endpoint != null && endpoint.toLowerCase().includes(KnownEndpoints.openrouter))) &&
    !isAnthropic;

  let azure = options.azure;
  if (isAnthropic) {
    const anthropicResult = getAnthropicLLMConfig(apiKey, {
      modelOptions,
      userId: options.userId || '',
      proxy: options.proxy,
      reverseProxyUrl: options.reverseProxyUrl,
    });
    llmConfig = anthropicResult.llmConfig;
    tools = anthropicResult.tools;
  } else {
    const openaiResult = getOpenAILLMConfig({
      azure,
      apiKey,
      baseURL,
      streaming,
      addParams,
      dropParams,
      modelOptions,
      useOpenRouter,
    });
    llmConfig = openaiResult.llmConfig;
    azure = openaiResult.azure;
    tools = openaiResult.tools;
  }

  const configOptions: t.OpenAIConfiguration = {};
  if (baseURL) {
    configOptions.baseURL = baseURL;
  }
  if (useOpenRouter) {
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
      headers,
    );
  } else if (headers) {
    configOptions.defaultHeaders = headers;
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

  if (azure && !isAnthropic) {
    const constructAzureResponsesApi = () => {
      if (!(llmConfig as t.ClientOptions).useResponsesApi || !azure) {
        return;
      }

      configOptions.baseURL = constructAzureURL({
        baseURL: configOptions.baseURL || 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
        azureOptions: azure,
      });

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
  }

  if (process.env.OPENAI_ORGANIZATION && !isAnthropic) {
    configOptions.organization = process.env.OPENAI_ORGANIZATION;
  }

  if (directEndpoint === true && configOptions?.baseURL != null) {
    configOptions.fetch = createFetch({
      directEndpoint: directEndpoint,
      reverseProxyUrl: configOptions?.baseURL,
    }) as unknown as Fetch;
  }

  const result: t.LLMConfigResult<SupportedLLMConfig> = {
    llmConfig,
    configOptions,
    tools,
  };
  if (useOpenRouter) {
    result.provider = Providers.OPENROUTER;
  }
  return result;
}
