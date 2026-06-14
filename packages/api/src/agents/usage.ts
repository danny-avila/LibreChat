import { logger } from '@librechat/data-schemas';
import { inputTokensIncludesCache } from 'librechat-data-provider';
import type {
  TCustomConfig,
  TResponseUsage,
  TTokenUsageEvent,
  TContextUsageEvent,
  TTransactionsConfig,
} from 'librechat-data-provider';
import type {
  StructuredTokenUsage,
  BulkWriteDeps,
  PreparedEntry,
  TxMetadata,
  TokenUsage,
  PricingFns,
} from './transactions';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { EndpointTokenConfig } from '~/types/tokens';
import {
  prepareStructuredTokenSpend,
  bulkWriteTransactions,
  prepareTokenSpend,
} from './transactions';

type SpendTokensFn = (txData: TxMetadata, tokenUsage: TokenUsage) => Promise<unknown>;
type SpendStructuredTokensFn = (
  txData: TxMetadata,
  tokenUsage: StructuredTokenUsage,
) => Promise<unknown>;

/**
 * Resolves `completionTokens` for billing, repairing providers whose
 * `usage_metadata.output_tokens` undercounts.
 *
 * The documented `UsageMetadata` contract (`@langchain/core`) is
 * `total_tokens === input_tokens + output_tokens`. Compliant providers
 * (OpenAI, Anthropic, Google API via agents' `CustomChatGoogleGenerativeAI`)
 * include any reasoning/thinking tokens inside `output_tokens` already,
 * so the invariant holds and this function is a no-op for them.
 *
 * **Vertex AI undercount (issue #13006):** `@langchain/google-common`'s streaming
 * path emits `output_tokens = candidatesTokenCount` and drops `thoughtsTokenCount`,
 * so `total - input > output`. The gap is recovered as `total - input`.
 *
 * **Bedrock / Anthropic cache inflation:** additive providers keep cache tokens
 * separate from `input_tokens`, making
 * `total = input + output + cache_read + cache_creation`. Without adjustment
 * the Vertex recovery fires on every cached step and returns
 * `output + cache_read + cache_creation` instead of `output`, inflating
 * completion counts by orders of magnitude. The fix subtracts the cache
 * adjustment before the gap test — but only for additive providers; subset
 * providers (Google, OpenAI, …) already include cache inside `input_tokens`
 * so their `cacheAdjustment` is zero and the Vertex recovery is unaffected.
 */
function resolveCompletionTokens(usage: UsageMetadata): number {
  const output = Number(usage.output_tokens) || 0;
  const total = Number(usage.total_tokens) || 0;
  const input = Number(usage.input_tokens) || 0;

  // For additive providers (Bedrock, Anthropic), cache tokens are separate
  // from input_tokens and are included in total_tokens, widening the gap
  // independently of any missing thinking tokens. Subtract them so the gap
  // check only fires when output_tokens genuinely undercounts (Vertex case).
  // Subset providers fold cache into input_tokens, so their adjustment is 0.
  const cacheRead =
    Number(usage.input_token_details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;
  const cacheCreation =
    Number(usage.input_token_details?.cache_creation) ||
    Number(usage.cache_creation_input_tokens) ||
    0;
  const cacheAdjustment = inputTokensIncludesCache(usage.provider) ? 0 : cacheRead + cacheCreation;

  if (total > input + output + cacheAdjustment) {
    return total - input - cacheAdjustment;
  }
  return output;
}

interface SplitUsage {
  /** Non-cached input portion — what gets billed at the standard input rate */
  inputOnly: number;
  cacheCreation: number;
  cacheRead: number;
  /** Total prompt tokens including cached portion */
  totalInput: number;
  /** Output tokens for billing (includes reasoning when omitted from `output_tokens`) */
  completion: number;
}

function splitUsage(usage: UsageMetadata): SplitUsage {
  const cacheCreation =
    Number(usage.input_token_details?.cache_creation) ||
    Number(usage.cache_creation_input_tokens) ||
    0;
  const cacheRead =
    Number(usage.input_token_details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;
  const rawInput = Number(usage.input_tokens) || 0;
  const completion = resolveCompletionTokens(usage);
  if (inputTokensIncludesCache(usage.provider)) {
    return {
      inputOnly: Math.max(0, rawInput - cacheCreation - cacheRead),
      cacheCreation,
      cacheRead,
      totalInput: rawInput,
      completion,
    };
  }
  return {
    inputOnly: rawInput,
    cacheCreation,
    cacheRead,
    totalInput: rawInput + cacheCreation + cacheRead,
    completion,
  };
}

export interface RecordUsageDeps {
  spendTokens: SpendTokensFn;
  spendStructuredTokens: SpendStructuredTokensFn;
  pricing?: PricingFns;
  bulkWriteOps?: BulkWriteDeps;
}

/**
 * Authoritative USD cost of one model call. Reuses the exact billing
 * functions (`prepareTokenSpend`/`prepareStructuredTokenSpend` → `getMultiplier`
 * with `inputTokenCount` for premium tiers) so the figure emitted to the
 * client matches what is charged against balance — the client must not
 * re-derive pricing from base rates. `tokenValue` is credits (USD × 1e6).
 */
export function computeUsageCostUSD(
  usage: UsageMetadata,
  pricing: PricingFns,
  endpointTokenConfig?: EndpointTokenConfig,
): number {
  const { inputOnly, cacheCreation, cacheRead, completion } = splitUsage(usage);
  /** user/context/conversationId only populate the transaction doc, which is
   *  discarded here — only `tokenValue` (credits) is summed */
  const txData: TxMetadata = {
    user: '',
    context: 'message',
    conversationId: '',
    model: usage.model,
    endpointTokenConfig,
  };
  const entries =
    cacheCreation > 0 || cacheRead > 0
      ? prepareStructuredTokenSpend(
          txData,
          {
            promptTokens: { input: inputOnly, write: cacheCreation, read: cacheRead },
            completionTokens: completion,
          },
          pricing,
        )
      : prepareTokenSpend(
          txData,
          { promptTokens: inputOnly, completionTokens: completion },
          pricing,
        );
  const credits = entries.reduce((sum, entry) => sum + Math.abs(entry.tokenValue), 0);
  return credits / 1e6;
}

/**
 * Aggregates the per-model-call `on_token_usage` payloads emitted for one
 * response into a single rollup, persisted on `responseMessage.metadata.usage`.
 *
 * Each event is normalized into display units with the SAME logic the live
 * client uses (`splitUsage`: input excludes cache, output is repaired) BEFORE
 * summing, so the rollup reproduces the live branch/total usage exactly even
 * when a turn mixes providers (e.g. a summarization or subagent call on a
 * different provider than the primary). `cost` is the additive sum of the
 * authoritative per-event cost, included only when at least one event carried
 * it (i.e. `interface.contextCost` was on).
 */
export function aggregateEmittedUsage(
  events: ReadonlyArray<TTokenUsageEvent>,
): TResponseUsage | null {
  if (events.length === 0) {
    return null;
  }
  let input = 0;
  let output = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let cost = 0;
  let hasCost = false;
  for (const event of events) {
    const units = normalizeEventUnits(event);
    input += units.input;
    output += units.output;
    cacheWrite += units.cacheWrite;
    cacheRead += units.cacheRead;
    if (event.cost != null) {
      cost += event.cost;
      hasCost = true;
    }
  }
  const rollup: TResponseUsage = { input, output, cacheWrite, cacheRead };
  if (hasCost) {
    rollup.cost = cost;
  }
  return rollup;
}

/**
 * Per-event display-unit normalization, mirroring the client's
 * `normalizeUsageUnits` EXACTLY — including the magnitude fallback when
 * `provider` is absent — so a reloaded rollup matches what the live client
 * folded. This is deliberately distinct from billing `splitUsage`, which treats
 * a missing provider as additive (no magnitude fallback); the divergence only
 * surfaces for provider-less cached events (e.g. some OpenAI-compatible/custom
 * payloads), where the client subtracts cache from input but `splitUsage`
 * would not. Keep in sync with `normalizeUsageUnits` in client/src/utils/tokens.ts.
 */
function normalizeEventUnits(event: TTokenUsageEvent): {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
} {
  const rawInput = event.input_tokens ?? 0;
  const rawOutput = event.output_tokens ?? 0;
  const total = event.total_tokens ?? 0;
  const cacheWrite = event.input_token_details?.cache_creation ?? 0;
  const cacheRead = event.input_token_details?.cache_read ?? 0;
  const includesCache =
    event.provider != null
      ? inputTokensIncludesCache(event.provider)
      : cacheWrite + cacheRead <= rawInput;
  const cacheAdjustment = includesCache ? 0 : cacheRead + cacheWrite;
  const output =
    total > rawInput + rawOutput + cacheAdjustment ? total - rawInput - cacheAdjustment : rawOutput;
  return {
    input: includesCache ? Math.max(0, rawInput - cacheRead - cacheWrite) : rawInput,
    output,
    cacheWrite,
    cacheRead,
  };
}

/** Output tokens of the response's final primary model call — the call the
 *  latest pre-invoke snapshot precedes. Persisted as the snapshot's
 *  `completedOutputTokens` so a reloaded multi-call turn adds only this delta
 *  (matching the live finalizer) instead of the full response `tokenCount`,
 *  which the snapshot already counts for earlier steps. */
function finalCallOutputTokens(events: ReadonlyArray<TTokenUsageEvent>): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].usage_type == null) {
      return normalizeEventUnits(events[i]).output;
    }
  }
  return 0;
}

/**
 * Projects the latest live context snapshot into the blob persisted on
 * `responseMessage.metadata.contextUsage`. Trims zero-valued per-tool counts
 * (privacy/size) and records the final call's output as `completedOutputTokens`
 * so rehydration adds the same post-snapshot delta the live gauge did. The
 * client re-anchors the blob to the response message id on load.
 */
export function buildPersistedContextUsage(
  snapshot: TContextUsageEvent,
  usageEvents: ReadonlyArray<TTokenUsageEvent> = [],
): TContextUsageEvent {
  const { breakdown } = snapshot;
  const completedOutputTokens = finalCallOutputTokens(usageEvents);
  let toolTokenCounts = breakdown.toolTokenCounts;
  if (toolTokenCounts != null) {
    const trimmed: Record<string, number> = {};
    for (const [name, count] of Object.entries(toolTokenCounts)) {
      if (count > 0) {
        trimmed[name] = count;
      }
    }
    toolTokenCounts = Object.keys(trimmed).length > 0 ? trimmed : undefined;
  }
  return {
    ...snapshot,
    breakdown: { ...breakdown, toolTokenCounts },
    ...(completedOutputTokens > 0 && { completedOutputTokens }),
  };
}

export interface RecordUsageParams {
  user: string;
  conversationId: string;
  collectedUsage: UsageMetadata[];
  model?: string;
  context?: string;
  messageId?: string;
  balance?: Partial<TCustomConfig['balance']> | null;
  transactions?: Partial<TTransactionsConfig>;
  endpointTokenConfig?: EndpointTokenConfig;
}

export interface RecordUsageResult {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Records token usage for collected LLM calls and spends tokens against balance.
 * This handles both sequential execution (tool calls) and parallel execution (multiple agents).
 *
 * When `pricing` and `bulkWriteOps` deps are provided, prepares all transaction documents
 * in-memory first, then writes them in a single `insertMany` + one `updateBalance` call.
 */
export async function recordCollectedUsage(
  deps: RecordUsageDeps,
  params: RecordUsageParams,
): Promise<RecordUsageResult | undefined> {
  const {
    user,
    model,
    balance,
    messageId,
    transactions,
    conversationId,
    collectedUsage,
    endpointTokenConfig,
    context = 'message',
  } = params;

  if (!collectedUsage || !collectedUsage.length) {
    return;
  }

  const messageUsages: UsageMetadata[] = [];
  const summarizationUsages: UsageMetadata[] = [];
  const subagentUsages: UsageMetadata[] = [];
  /** Hidden sequential-agent calls: billed, but excluded from the reported
   *  output total since their output never reaches the visible message */
  const sequentialUsages: UsageMetadata[] = [];
  for (const usage of collectedUsage) {
    if (usage == null) {
      continue;
    }
    if (usage.usage_type === 'summarization') {
      summarizationUsages.push(usage);
    } else if (usage.usage_type === 'subagent') {
      subagentUsages.push(usage);
    } else if (usage.usage_type === 'sequential') {
      sequentialUsages.push(usage);
    } else {
      messageUsages.push(usage);
    }
  }

  const firstUsage = messageUsages[0];
  const input_tokens = firstUsage == null ? 0 : splitUsage(firstUsage).totalInput;

  let total_output_tokens = 0;

  const { pricing, bulkWriteOps } = deps;
  const useBulk = pricing && bulkWriteOps;

  const processUsageGroup = (
    usages: UsageMetadata[],
    usageContext: string,
    docs: PreparedEntry[],
    options?: { excludeFromOutputTotal?: boolean },
  ): void => {
    for (const usage of usages) {
      if (!usage) {
        continue;
      }

      const { inputOnly, cacheCreation, cacheRead, completion } = splitUsage(usage);

      if (options?.excludeFromOutputTotal !== true) {
        total_output_tokens += completion;
      }

      const txMetadata: TxMetadata = {
        user,
        balance,
        messageId,
        transactions,
        conversationId,
        endpointTokenConfig,
        context: usageContext,
        model: usage.model ?? model,
      };

      if (useBulk) {
        const entries =
          cacheCreation > 0 || cacheRead > 0
            ? prepareStructuredTokenSpend(
                txMetadata,
                {
                  promptTokens: {
                    input: inputOnly,
                    write: cacheCreation,
                    read: cacheRead,
                  },
                  completionTokens: completion,
                },
                pricing,
              )
            : prepareTokenSpend(
                txMetadata,
                {
                  promptTokens: inputOnly,
                  completionTokens: completion,
                },
                pricing,
              );
        docs.push(...entries);
        continue;
      }

      if (cacheCreation > 0 || cacheRead > 0) {
        deps
          .spendStructuredTokens(txMetadata, {
            promptTokens: {
              input: inputOnly,
              write: cacheCreation,
              read: cacheRead,
            },
            completionTokens: completion,
          })
          .catch((err) => {
            logger.error(
              `[packages/api #recordCollectedUsage] Error spending structured ${usageContext} tokens`,
              err,
            );
          });
        continue;
      }

      deps
        .spendTokens(txMetadata, {
          promptTokens: inputOnly,
          completionTokens: completion,
        })
        .catch((err) => {
          logger.error(
            `[packages/api #recordCollectedUsage] Error spending ${usageContext} tokens`,
            err,
          );
        });
    }
  };

  const allDocs: PreparedEntry[] = [];
  processUsageGroup(messageUsages, context, allDocs);
  processUsageGroup(summarizationUsages, 'summarization', allDocs);
  /**
   * Subagent child-run usage is billed in full (transactions + balance) but
   * excluded from the reported output total: the result's `output_tokens`
   * becomes the parent response message's `tokenCount` (see BaseClient's
   * `getStreamUsage` consumer), and child output the parent never saw would
   * distort next-turn context accounting by orders of magnitude.
   */
  processUsageGroup(subagentUsages, 'subagent', allDocs, { excludeFromOutputTotal: true });
  processUsageGroup(sequentialUsages, 'sequential', allDocs, { excludeFromOutputTotal: true });
  if (useBulk && allDocs.length > 0) {
    try {
      await bulkWriteTransactions({ user, docs: allDocs }, bulkWriteOps);
    } catch (err) {
      logger.error('[packages/api #recordCollectedUsage] Error in bulk write', err);
    }
  }

  return {
    input_tokens,
    output_tokens: total_output_tokens,
  };
}

/**
 * Structural mirror of the agents SDK's `SubagentUsageEvent` (added after
 * `@librechat/agents` 3.2.33). Defined locally so type-checking does not
 * depend on the unreleased SDK — replace with
 * `import type { SubagentUsageEvent } from '@librechat/agents'` once the
 * dependency is bumped.
 */
export interface SubagentUsageEvent {
  /** Usage metadata reported by the child's model call. */
  usage: UsageMetadata;
  /** Model that produced this usage (per-call, falls back to the child config's model). */
  model?: string;
  /** Provider enum value of the subagent's configured agent. */
  provider?: string;
  /** Subagent `type` identifier from the SubagentConfig. */
  subagentType: string;
  /** Child run ID (unique per subagent execution). */
  subagentRunId: string;
  /** Child agent ID assigned to this subagent execution. */
  subagentAgentId: string;
  /** Parent run ID under which the subagent was spawned. */
  runId: string;
}

/**
 * Builds the host-side `subagentUsageSink` for `Run.create`. Subagent child
 * graphs execute outside the run's `streamEvents` loop, so their model calls
 * never reach the `CHAT_MODEL_END` handler (`ModelEndHandler`) — the SDK
 * reports them through this sink instead. Each event is tagged
 * `usage_type: 'subagent'` with the child's model/provider and pushed onto
 * the same `collectedUsage` array the handler fills, so
 * {@link recordCollectedUsage} bills child calls (transactions + balance)
 * alongside the parent's.
 */
export function createSubagentUsageSink(
  collectedUsage: UsageMetadata[],
  onUsage?: (usage: UsageMetadata) => void,
): (event: SubagentUsageEvent) => void {
  return (event) => {
    if (event?.usage == null) {
      return;
    }
    const usage: UsageMetadata = { ...event.usage, usage_type: 'subagent' };
    if (event.model != null && event.model !== '') {
      usage.model = event.model;
    }
    if (event.provider != null && event.provider !== '') {
      usage.provider = event.provider;
    }
    collectedUsage.push(usage);
    /** Lets the host stream the billed child usage to the client (tagged
     *  `subagent`, so it folds into session cost/totals but not the live
     *  gauge) — child runs never reach ModelEndHandler's emit path. */
    onUsage?.(usage);
  };
}
