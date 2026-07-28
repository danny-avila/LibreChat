import { Providers } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { TEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
import type { EndpointDbMethods, OpenAIConfiguration, ServerRequest } from '~/types';
import type { ActivityLabelLLM } from './runtime';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveConfigHeaders } from '~/utils/headers';
import { createSafeUser } from '~/utils/env';

/** Cache-token details in the LangChain-standard normalized shape. */
interface CacheTokenDetails {
  cache_read?: number;
  cache_creation?: number;
}

/** Aggregated LLM metadata entries (shape varies by provider SDK). */
export interface CollectedMetadataEntry {
  usage?: {
    prompt_tokens?: number;
    input_tokens?: number;
    inputTokens?: number;
    completion_tokens?: number;
    output_tokens?: number;
    outputTokens?: number;
    /** Anthropic raw usage. */
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    /** OpenAI raw usage. */
    prompt_tokens_details?: { cached_tokens?: number };
  };
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    input_token_details?: CacheTokenDetails;
  };
}

export interface ActivityLabelUsage {
  input_tokens?: number;
  output_tokens?: number;
  /** Normalized cache tokens — `computeUsageCostUSD` and the transaction
   *  path read this shape first, so carrying it prices cached label calls
   *  at cache rates instead of the ordinary input rate (or not at all). */
  input_token_details?: CacheTokenDetails;
}

/**
 * Normalizes provider-specific aggregated metadata into the usage shape
 * `recordCollectedUsage` expects, cache-token details included — dropping
 * them made Anthropic cache tokens vanish from billing and charged OpenAI
 * cache reads at the full input rate. Mirrors the title path's inline
 * mapping otherwise.
 */
export function mapCollectedMetadataToUsage(
  collected: CollectedMetadataEntry[],
): ActivityLabelUsage[] {
  return collected.map((item) => {
    let input_tokens: number | undefined;
    let output_tokens: number | undefined;
    let cache_read: number | undefined;
    let cache_creation: number | undefined;
    if (item.usage) {
      input_tokens = item.usage.prompt_tokens ?? item.usage.input_tokens ?? item.usage.inputTokens;
      output_tokens =
        item.usage.completion_tokens ?? item.usage.output_tokens ?? item.usage.outputTokens;
      cache_read =
        item.usage.cache_read_input_tokens ?? item.usage.prompt_tokens_details?.cached_tokens;
      cache_creation = item.usage.cache_creation_input_tokens;
    } else if (item.tokenUsage) {
      input_tokens = item.tokenUsage.promptTokens;
      output_tokens = item.tokenUsage.completionTokens;
    } else if (item.usage_metadata) {
      input_tokens = item.usage_metadata.input_tokens;
      output_tokens = item.usage_metadata.output_tokens;
      cache_read = item.usage_metadata.input_token_details?.cache_read;
      cache_creation = item.usage_metadata.input_token_details?.cache_creation;
    }
    return {
      input_tokens,
      output_tokens,
      ...(cache_read != null || cache_creation != null
        ? { input_token_details: { cache_read, cache_creation } }
        : {}),
    };
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
  /** The PUBLIC endpoint the request came in on (e.g. `agents`) when it
   *  differs from the agent's rewritten provider endpoint — its config block
   *  wins per field over the provider's. */
  publicEndpoint?: string;
  /** Request-scoped ids for header placeholder resolution. */
  ids: { messageId?: string; conversationId?: string; parentMessageId?: string };
  db: EndpointDbMethods;
}

/** Azure resolution reads an instance name that only some configs carry. */
type MaybeAzureConfig = ClientOptions & {
  azureOpenAIApiInstanceName?: string;
  configuration?: OpenAIConfiguration;
};

/** Effective activity-label settings for one endpoint. */
export interface ResolvedActivityConfig {
  enabled: boolean;
  model?: string;
  endpoint?: string;
  prompt?: string;
  maxPerRun?: number;
  charLimit?: number;
}

/**
 * Reads the per-endpoint `activity*` settings, mirroring how titles resolve
 * theirs: an `endpoints.all` block wins over the named endpoint, which wins
 * over a custom endpoint's own config.
 */
/**
 * Reads ONE endpoint setting, global-then-named, rather than picking a whole
 * config object.
 *
 * Selecting wholesale means any `endpoints.all` block — even one carrying
 * nothing but `headers` — shadows the named/custom endpoint entirely, so a
 * single unrelated global setting silently hides every activity field AND the
 * `titleModel` fallback. Global still wins per field, so a real
 * `all.activityLabel` keeps overriding the endpoint.
 */
function pickEndpointField<K extends keyof TEndpoint>(
  appConfig: AppConfig | undefined,
  endpoint: string,
  customEndpointConfig: Partial<TEndpoint> | undefined,
  key: K,
  publicEndpoint?: string,
): TEndpoint[K] | undefined {
  const endpoints = appConfig?.endpoints as
    | (Record<string, TEndpoint | undefined> & { all?: TEndpoint })
    | undefined;
  const all = endpoints?.all as Partial<TEndpoint> | undefined;
  /** The PUBLIC endpoint the request came in on, when it differs from the
   *  backing provider. `initializeAgent` rewrites `agent.endpoint` to the
   *  provider (an agents-endpoint run backed by OpenAI reads `openAI`), so
   *  without this an admin's `endpoints.agents.activityLabel: true` — valid
   *  config, since `agentsEndpointSchema` inherits every activity field —
   *  is silently ignored. Public wins per field over the backing provider,
   *  mirroring how request-path options resolve. */
  const publicBlock =
    publicEndpoint != null && publicEndpoint !== endpoint
      ? (endpoints?.[publicEndpoint] as Partial<TEndpoint> | undefined)
      : undefined;
  const named = (endpoints?.[endpoint] ?? customEndpointConfig) as Partial<TEndpoint> | undefined;
  return all?.[key] ?? publicBlock?.[key] ?? named?.[key];
}

export function resolveActivityConfig(
  appConfig: AppConfig | undefined,
  endpoint: string,
  customEndpointConfig?: Partial<TEndpoint>,
  publicEndpoint?: string,
): ResolvedActivityConfig {
  const pick = <K extends keyof TEndpoint>(key: K): TEndpoint[K] | undefined =>
    pickEndpointField(appConfig, endpoint, customEndpointConfig, key, publicEndpoint);
  return {
    enabled: pick('activityLabel') === true,
    model: pick('activityModel'),
    endpoint: pick('activityEndpoint'),
    prompt: pick('activityPrompt'),
    maxPerRun: pick('activityMaxPerRun'),
    charLimit: pick('activityCharLimit'),
    /** `titleModel` is the documented fallback below, not a field here. */
  };
}

/**
 * Resolves provider + client options for the label model, mirroring
 * `titleConvo`'s resolution. Model precedence: the endpoint's
 * `activityModel` > its `titleModel` > the agent's own model. When
 * `activityEndpoint` names a different endpoint, the label runs on THAT
 * endpoint's credentials (title parity); an unknown name falls back to the
 * agent's endpoint with a warning rather than failing the run.
 */
export async function resolveActivityLabelModel({
  req,
  agent,
  publicEndpoint,
  ids,
  db,
}: ResolveActivityLabelModelParams): Promise<ActivityLabelLLM> {
  const appConfig = req.config as AppConfig | undefined;
  const agentEndpoint = agent.endpoint ?? '';
  let providerConfig = getProviderConfig({ provider: agentEndpoint, appConfig });
  const activity = resolveActivityConfig(
    appConfig,
    agentEndpoint,
    providerConfig.customEndpointConfig,
    publicEndpoint,
  );

  /**
   * Captured from the ORIGINATING endpoint, before any `activityEndpoint`
   * switch — matching how `titleConvo` reads its config. The documented
   * fallback is "this endpoint's `titleModel`", so reading it from the
   * destination instead would let an OpenAI endpoint configured with
   * `titleModel: claude-haiku` and `activityEndpoint: anthropic` fall through
   * to the OpenAI run model and send that name to Anthropic, failing every
   * label. The destination supplies credentials, not the model choice.
   */
  const originatingTitleModel = pickEndpointField(
    appConfig,
    agentEndpoint,
    providerConfig.customEndpointConfig,
    'titleModel',
    publicEndpoint,
  );
  let endpoint = agentEndpoint;
  if (activity.endpoint != null && activity.endpoint !== agentEndpoint) {
    try {
      providerConfig = getProviderConfig({ provider: activity.endpoint, appConfig });
      endpoint = activity.endpoint;
    } catch (error) {
      logger.warn(
        `[activityLabels] Unknown activityEndpoint "${activity.endpoint}", falling back to "${agentEndpoint}"`,
        error,
      );
      providerConfig = getProviderConfig({ provider: agentEndpoint, appConfig });
      endpoint = agentEndpoint;
    }
  }

  /** ONLY the originating endpoint's value. The documented precedence is
   *  `activityModel` → this endpoint's `titleModel` → the run model, so
   *  falling back to the DESTINATION's `titleModel` would make changing just
   *  the credential target silently change the model and its cost. The
   *  destination supplies credentials, never the model choice. */
  const titleModel = originatingTitleModel;
  /** `model_parameters.model` FIRST: `initializeAgent` merges the request's
   *  `endpointOption` override into it and the run itself gives it precedence,
   *  so the saved `agent.model` can be a stale or entirely different model.
   *  Reading it first is what makes "current model" mean the model the
   *  conversation is actually running on. */
  const runModel = agent.model_parameters?.model ?? agent.model;
  /** `current_model` means "the agent's model" for BOTH overrides — passing
   *  the literal through would send `model: "current_model"` to the provider
   *  and fail every label. An EXPLICIT `activityModel: current_model` resolves
   *  straight to the run model: the admin asked for it by name, so letting a
   *  configured `titleModel` win instead would route labels to an unintended
   *  model with different behavior and cost. The title fallback applies only
   *  when `activityModel` is absent. */
  let model: string | undefined;
  if (activity.model === Constants.CURRENT_MODEL) {
    model = runModel;
  } else if (activity.model != null) {
    model = activity.model;
  } else if (titleModel != null && titleModel !== Constants.CURRENT_MODEL) {
    model = titleModel;
  } else {
    model = runModel;
  }
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
  return {
    provider,
    clientOptions: clientOptions as ClientOptions,
    /** Priced with the LABEL endpoint's rates, not the agent's. */
    endpointTokenConfig: options.endpointTokenConfig,
    sameEndpoint: endpoint === agentEndpoint,
  };
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
