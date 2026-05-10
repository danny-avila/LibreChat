import { ProxyAgent } from 'undici';
import { Providers } from '@librechat/agents';
import { KnownEndpoints, EModelEndpoint } from 'librechat-data-provider';
import type * as t from '~/types';
import { getLLMConfig as getAnthropicLLMConfig } from '~/endpoints/anthropic/llm';
import { getOpenAILLMConfig, extractDefaultParams } from './llm';
import { getGoogleConfig } from '~/endpoints/google/llm';
import { transformToOpenAIConfig } from './transform';
import { constructAzureURL } from '~/utils/azure';
import { createFetch } from '~/utils/generators';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const OPENROUTER_DEFAULT_PARAMS = { promptCache: true };

function includesOpenRouter(value?: string | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(KnownEndpoints.openrouter);
}

function getDefaultParams({
  customDefaultParams,
  useOpenRouter,
}: {
  customDefaultParams?: Record<string, unknown>;
  useOpenRouter: boolean;
}): Record<string, unknown> | undefined {
  if (!useOpenRouter) {
    return customDefaultParams;
  }

  return {
    ...OPENROUTER_DEFAULT_PARAMS,
    ...customDefaultParams,
  };
}

function mergeHeadersPreservingAnthropicBeta(
  headers: Record<string, string> | undefined,
  defaultHeaders: Record<string, string>,
): Record<string, string> {
  const mergedHeaders = Object.assign({}, headers ?? {}, defaultHeaders);
  const existingBetaHeader = headers?.['anthropic-beta'];
  const defaultBetaHeader = defaultHeaders['anthropic-beta'];

  if (existingBetaHeader && defaultBetaHeader) {
    const betaValues = [existingBetaHeader, defaultBetaHeader]
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    mergedHeaders['anthropic-beta'] = Array.from(new Set(betaValues)).join(',');
  }

  return mergedHeaders;
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
): t.OpenAIConfigResult {
  const {
    proxy,
    addParams,
    dropParams,
    defaultQuery,
    directEndpoint,
    streaming = true,
    modelOptions = {},
    reverseProxyUrl: baseURL,
  } = options;

  let llmConfig: t.OAIClientOptions;
  let tools: t.LLMConfigResult['tools'];
  const isAnthropic = options.customParams?.defaultParamsEndpoint === EModelEndpoint.anthropic;
  const isGoogle = options.customParams?.defaultParamsEndpoint === EModelEndpoint.google;
  const isOpenRouter = options.customParams?.defaultParamsEndpoint === KnownEndpoints.openrouter;

  const useOpenRouter =
    !isAnthropic &&
    !isGoogle &&
    (isOpenRouter || includesOpenRouter(baseURL) || includesOpenRouter(endpoint));
  const isVercel =
    !isAnthropic &&
    !isGoogle &&
    ((baseURL && baseURL.includes('ai-gateway.vercel.sh')) ||
      (endpoint != null && endpoint.toLowerCase().includes(KnownEndpoints.vercel)));
  const defaultParams = getDefaultParams({
    customDefaultParams: extractDefaultParams(options.customParams?.paramDefinitions),
    useOpenRouter: Boolean(useOpenRouter),
  });

  let azure = options.azure;
  let headers = options.headers;
  if (isAnthropic) {
    const anthropicResult = getAnthropicLLMConfig(apiKey, {
      modelOptions,
      proxy: options.proxy,
      reverseProxyUrl: baseURL,
      addParams,
      dropParams,
      defaultParams,
    });
    /** Transform handles addParams/dropParams - it knows about OpenAI params */
    const transformed = transformToOpenAIConfig({
      addParams,
      dropParams,
      llmConfig: anthropicResult.llmConfig,
      fromEndpoint: EModelEndpoint.anthropic,
    });
    llmConfig = transformed.llmConfig;
    tools = anthropicResult.tools;
    if (transformed.configOptions?.defaultHeaders) {
      headers = mergeHeadersPreservingAnthropicBeta(
        headers,
        transformed.configOptions.defaultHeaders as Record<string, string>,
      );
    }
  } else if (isGoogle) {
    const googleResult = getGoogleConfig(
      apiKey,
      {
        modelOptions,
        reverseProxyUrl: baseURL ?? undefined,
        authHeader: true,
        addParams,
        dropParams,
        defaultParams,
      },
      true,
    );
    /** Transform handles addParams/dropParams - it knows about OpenAI params */
    const transformed = transformToOpenAIConfig({
      addParams,
      dropParams,
      defaultParams,
      tools: googleResult.tools,
      llmConfig: googleResult.llmConfig,
      fromEndpoint: EModelEndpoint.google,
    });
    llmConfig = transformed.llmConfig;
    tools = transformed.tools;
  } else {
    const openaiResult = getOpenAILLMConfig({
      azure,
      apiKey,
      baseURL,
      endpoint,
      streaming,
      addParams,
      dropParams,
      defaultParams,
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
  if (useOpenRouter || isVercel) {
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
        'X-OpenRouter-Title': 'LibreChat',
        'X-OpenRouter-Categories': 'general-chat,personal-agent',
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
      if (!llmConfig.useResponsesApi || !azure) {
        return;
      }

      const updatedUrl = configOptions.baseURL?.replace(/\/deployments(?:\/.*)?$/, '/v1');

      configOptions.baseURL = constructAzureURL({
        baseURL: updatedUrl || 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
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

  const result: t.OpenAIConfigResult = {
    llmConfig,
    configOptions,
    tools,
  };
  if (useOpenRouter) {
    result.provider = Providers.OPENROUTER;
  }
  return result;
}
