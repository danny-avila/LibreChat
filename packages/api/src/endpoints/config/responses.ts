import { EModelEndpoint, mapModelToAzureConfig } from 'librechat-data-provider';
import type { ResponsesApiRouting } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { getAzureCredentials } from '~/utils/azure';
import { getOpenAILLMConfig } from '../openai/llm';
import { isUserProvided } from '~/utils/common';

/** Publish only routing booleans, never URLs, credentials, headers or addParams.
 * Uses the same request shaper as execution, so parameter precedence is not
 * reimplemented in the browser. No inference requests or database reads. */
export function getResponsesApiRouting(
  appConfig: AppConfig,
  endpoint: EModelEndpoint.openAI | EModelEndpoint.azureOpenAI,
): ResponsesApiRouting {
  const isAzure = endpoint === EModelEndpoint.azureOpenAI;
  const azureConfig = appConfig.endpoints?.azureOpenAI;
  const models =
    isAzure && azureConfig
      ? Object.keys(azureConfig.modelGroupMap ?? {})
      : ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'];
  const result: ResponsesApiRouting = {};
  for (const model of ['*', ...models]) {
    try {
      let baseURL = isAzure ? process.env.AZURE_OPENAI_BASEURL : process.env.OPENAI_REVERSE_PROXY;
      let serverless = false;
      let azure: Parameters<typeof getOpenAILLMConfig>[0]['azure'];
      const native = appConfig.endpoints?.openAI;
      let addParams = isAzure ? undefined : native?.addParams;
      let dropParams = isAzure ? undefined : native?.dropParams;
      if (isAzure && azureConfig) {
        // Unknown deployments must not acquire a guessed Responses capability.
        if (model === '*') {
          result[model] = { default: false, on: false, off: false };
          continue;
        }
        const mapped = mapModelToAzureConfig({ modelName: model, ...azureConfig });
        baseURL = mapped.baseURL ?? baseURL;
        const groupName = azureConfig.modelGroupMap[model]?.group;
        const group = groupName ? azureConfig.groupMap[groupName] : undefined;
        if (!group) throw new Error('Missing Azure route group');
        addParams = group.addParams;
        dropParams = group.dropParams;
        serverless = mapped.serverless === true;
        azure = serverless ? undefined : mapped.azureOptions;
      } else if (isAzure) {
        azure = getAzureCredentials();
      }
      const globalDrop = appConfig.endpoints?.all?.dropParams;
      if (globalDrop?.length) dropParams = [...new Set([...(dropParams ?? []), ...globalDrop])];
      const route = (value?: boolean) => {
        const effectiveValue = serverless ? true : value;
        return (
          getOpenAILLMConfig({
            apiKey: 'route-policy',
            streaming: true,
            endpoint,
            baseURL,
            azure,
            addParams,
            dropParams,
            modelOptions: {
              model: model === '*' ? '' : model,
              ...(effectiveValue == null ? {} : { useResponsesApi: effectiveValue }),
            },
          }).llmConfig.useResponsesApi === true
        );
      };
      result[model] = {
        default: isUserProvided(baseURL) ? false : route(),
        on: route(true),
        off: route(false),
      };
    } catch {
      // Incomplete configuration must not break /api/endpoints or advertise
      // uploads for a route that execution cannot construct.
      result[model] = { default: false, on: false, off: false };
    }
  }
  return result;
}
