import { EModelEndpoint } from 'librechat-data-provider';
import { Providers, initializeModel } from '@librechat/agents';
import type { BaseMessage } from '@langchain/core/messages';
import type { ClientOptions } from '@librechat/agents';
import type { EndpointDbMethods, ServerRequest, EndpointTokenConfig } from '~/types';
import type { AutoReviewer, ReviewerModel } from './reviewer';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveRequestTenantId } from '~/middleware/tenant';
import { resolveConfigHeaders } from '~/utils/headers';
import { createAutoReviewer } from './reviewer';
import { createSafeUser } from '~/utils/env';

/** Resolve a reviewer independently of the chat model, using the configured endpoint's credentials. */
export function createConfiguredAutoReviewer({
  req,
  db,
  messages,
  onUsage,
}: {
  req: ServerRequest;
  db: EndpointDbMethods;
  messages: readonly BaseMessage[] | (() => readonly BaseMessage[]);
  onUsage?: (
    response: BaseMessage,
    model: string,
    provider: string,
    endpointTokenConfig?: EndpointTokenConfig,
  ) => Promise<void>;
}): AutoReviewer | undefined {
  const config = req.config?.endpoints?.agents?.toolApproval?.reviewer;
  if (req.body.codeApprovalMode !== 'auto' || config == null) return undefined;
  let modelPromise: Promise<ReviewerModel> | undefined;
  return createAutoReviewer({
    config,
    messages,
    getModel: () => {
      modelPromise ??= (async (): Promise<ReviewerModel> => {
        const endpoint = config.endpoint;
        const providerConfig = getProviderConfig({ provider: endpoint, appConfig: req.config });
        const options = await providerConfig.getOptions({
          req,
          endpoint,
          model_parameters: { model: config.model },
          db,
        });
        let provider = (options.provider ?? providerConfig.overrideProvider) as Providers;
        const clientOptions = {
          ...options.llmConfig,
          model: config.model,
          ...(options.configOptions && {
            configuration: { ...options.configOptions, maxRetries: 0 },
          }),
          streaming: false,
          maxRetries: 0,
        } as ClientOptions;
        if (endpoint === EModelEndpoint.azureOpenAI) {
          provider =
            'azureOpenAIApiInstanceName' in clientOptions &&
            clientOptions.azureOpenAIApiInstanceName != null
              ? Providers.AZURE
              : Providers.OPENAI;
        }
        resolveConfigHeaders({
          llmConfig: clientOptions,
          user: createSafeUser(req.user),
          tenantId: resolveRequestTenantId(req),
          body: req.body,
        });
        const model = initializeModel({ provider, clientOptions });
        return {
          invoke: async (prompt, signal) => {
            const response: BaseMessage = await model.invoke(prompt, {
              signal,
              tags: ['auto-review'],
            });
            await onUsage?.(response, config.model, provider, options.endpointTokenConfig);
            if (typeof response.content !== 'string') throw new Error('Review must return text');
            return response.content;
          },
        };
      })().catch((error: unknown) => {
        modelPromise = undefined;
        throw error;
      });
      return modelPromise;
    },
  });
}
