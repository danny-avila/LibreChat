import { ProxyAgent } from 'undici';
import { extractDefaultParams } from '../openai/llm';
import type * as t from '~/types';

export function getNovitaConfig(
  apiKey: string,
  options: t.OpenAIConfigOptions = {},
  endpoint?: string | null,
): t.OpenAIConfigResult {
  const {
    proxy,
    addParams,
    dropParams,
    defaultQuery,
    streaming = true,
    modelOptions = {},
  } = options;

  const defaultParams = extractDefaultParams(options.customParams?.paramDefinitions);

  const openaiResult = getOpenAILLMConfig({
    apiKey,
    baseURL: options.reverseProxyUrl ?? null,
    endpoint: endpoint ?? 'novita',
    streaming,
    addParams,
    dropParams,
    defaultParams,
    modelOptions,
    useOpenRouter: false,
  });

  const configOptions: t.OpenAIConfiguration = {
    baseURL: options.reverseProxyUrl ?? 'https://api.novita.ai/openai',
  };

  if (defaultQuery) {
    configOptions.defaultQuery = defaultQuery;
  }

  if (proxy) {
    const proxyAgent = new ProxyAgent(proxy);
    configOptions.fetchOptions = { dispatcher: proxyAgent };
  }

  return { llmConfig: openaiResult.llmConfig, configOptions, tools: openaiResult.tools };
}
