import { Providers } from '@librechat/agents';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { TEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
import type { EndpointDbMethods, OpenAIConfiguration, ServerRequest } from '~/types';
import type { ActivityLabelLLM } from './runtime';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveConfigHeaders } from '~/utils/headers';
import { createSafeUser } from '~/utils/env';

/** Aggregated LLM metadata entries (shape varies by provider SDK). */
export interface CollectedMetadataEntry {
  usage?: {
    prompt_tokens?: number;
    input_tokens?: number;
    inputTokens?: number;
    completion_tokens?: number;
    output_tokens?: number;
    outputTokens?: number;
  };
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
}

export interface ActivityLabelUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Normalizes provider-specific aggregated metadata into the usage shape
 * `recordCollectedUsage` expects. Mirrors the title path's inline mapping.
 */
export function mapCollectedMetadataToUsage(
  collected: CollectedMetadataEntry[],
): ActivityLabelUsage[] {
  return collected.map((item) => {
    let input_tokens: number | undefined;
    let output_tokens: number | undefined;
    if (item.usage) {
      input_tokens = item.usage.prompt_tokens ?? item.usage.input_tokens ?? item.usage.inputTokens;
      output_tokens =
        item.usage.completion_tokens ?? item.usage.output_tokens ?? item.usage.outputTokens;
    } else if (item.tokenUsage) {
      input_tokens = item.tokenUsage.promptTokens;
      output_tokens = item.tokenUsage.completionTokens;
    } else if (item.usage_metadata) {
      input_tokens = item.usage_metadata.input_tokens;
      output_tokens = item.usage_metadata.output_tokens;
    }
    return { input_tokens, output_tokens };
  });
}

/** The agent fields the label model resolution needs. */
export interface ActivityLabelAgent {
  endpoint?: string;
  provider?: string;
  model?: string;
  model_parameters?: { model?: string };
}

export interface ResolveActivityLabelModelParams {
  req: ServerRequest;
  agent: ActivityLabelAgent;
  /** Request-scoped ids for header placeholder resolution. */
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: EndpointDbMethods;
}

/** Azure resolution reads an instance name that only some configs carry. */
type MaybeAzureConfig = ClientOptions & {
  azureOpenAIApiInstanceName?: string;
  configuration?: OpenAIConfiguration;
};

/**
 * Resolves provider + client options for the label model, mirroring
 * `titleConvo`'s resolution minus the title-specific branches. Precedence:
 * `ACTIVITY_LABEL_MODEL` env > the endpoint's `titleModel` > the agent's own
 * model, always on the agent's endpoint credentials.
 */
export async function resolveActivityLabelModel({
  req,
  agent,
  ids,
  db,
}: ResolveActivityLabelModelParams): Promise<ActivityLabelLLM> {
  const appConfig = req.config as AppConfig | undefined;
  const endpoint = agent.endpoint ?? '';
  const providerConfig = getProviderConfig({ provider: endpoint, appConfig });
  const endpoints = appConfig?.endpoints as
    | (Record<string, TEndpoint | undefined> & { all?: TEndpoint })
    | undefined;
  const endpointConfig: Partial<TEndpoint> | undefined =
    endpoints?.all ?? endpoints?.[endpoint] ?? providerConfig.customEndpointConfig;
  const model =
    process.env.ACTIVITY_LABEL_MODEL ||
    (endpointConfig?.titleModel != null && endpointConfig.titleModel !== Constants.CURRENT_MODEL
      ? endpointConfig.titleModel
      : (agent.model ?? agent.model_parameters?.model));
  const options = await providerConfig.getOptions({
    req,
    endpoint,
    model_parameters: { model },
    db,
  });
  const llmConfig = options.llmConfig as MaybeAzureConfig | undefined;
  let provider = (options.provider ??
    providerConfig.overrideProvider ??
    agent.provider) as Providers;
  if (endpoint === EModelEndpoint.azureOpenAI && llmConfig?.azureOpenAIApiInstanceName == null) {
    provider = Providers.OPENAI;
  } else if (
    endpoint === EModelEndpoint.azureOpenAI &&
    llmConfig?.azureOpenAIApiInstanceName != null &&
    provider !== Providers.AZURE
  ) {
    provider = Providers.AZURE;
  }
  const clientOptions = { ...(llmConfig ?? {}) } as MaybeAzureConfig;
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions;
  }
  /** Resolve request-based header placeholders across provider-specific
   *  header locations, mirroring titleConvo — proxies that key on
   *  conversation/user metadata need them on label calls too. */
  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user as IUser | undefined),
    body: ids,
  });
  return { provider, clientOptions: clientOptions as ClientOptions };
}

/**
 * Bounded wait for in-flight label fills so a label resolving during the
 * final batch still reaches the durable log and the saved message before the
 * job completes. Never delays finalization past the bound; fills that lose
 * the race leave the counts-only placeholder, which renders fine.
 */
export async function settlePendingLabelFills(
  pending: Array<Promise<void>>,
  timeoutMs = 3000,
  onTimeout?: () => void,
): Promise<void> {
  if (pending.length === 0) {
    return;
  }
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    timerId = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });
  await Promise.race([Promise.allSettled(pending), timeout]);
  if (timerId != null) {
    clearTimeout(timerId);
  }
  if (timedOut) {
    /** Stragglers must not mutate or emit for a response that is already
     *  finalizing: the caller aborts them and closes the slot gate. */
    onTimeout?.();
  }
}
