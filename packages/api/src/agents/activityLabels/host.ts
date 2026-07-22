import { Providers } from '@librechat/agents';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig, TEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
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

export interface ResolveActivityLabelModelParams {
  req: {
    config?: AppConfig;
    user?: Record<string, unknown>;
  };
  agent: {
    endpoint?: string;
    provider?: string;
    model?: string;
    model_parameters?: { model?: string };
  };
  /** Request-scoped ids for header placeholder resolution. */
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: { getUserKey: unknown; getUserKeyValues: unknown };
}

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
  const appConfig = req.config as AppConfig;
  const endpoint = agent.endpoint as string;
  const providerConfig = getProviderConfig({ provider: endpoint, appConfig });
  const endpointConfig: TEndpoint | undefined =
    appConfig?.endpoints?.all ??
    appConfig?.endpoints?.[endpoint as keyof typeof appConfig.endpoints] ??
    providerConfig.customEndpointConfig;
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
  let provider = (options.provider ??
    providerConfig.overrideProvider ??
    agent.provider) as Providers;
  if (
    endpoint === EModelEndpoint.azureOpenAI &&
    options.llmConfig?.azureOpenAIApiInstanceName == null
  ) {
    provider = Providers.OPENAI;
  } else if (
    endpoint === EModelEndpoint.azureOpenAI &&
    options.llmConfig?.azureOpenAIApiInstanceName != null &&
    provider !== Providers.AZURE
  ) {
    provider = Providers.AZURE;
  }
  const clientOptions = { ...options.llmConfig } as ClientOptions & {
    configuration?: unknown;
  };
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions;
  }
  /** Resolve request-based header placeholders across provider-specific
   *  header locations, mirroring titleConvo — proxies that key on
   *  conversation/user metadata need them on label calls too. */
  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user),
    body: ids,
  });
  return { provider, clientOptions };
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
