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
  /** Persist cost only with COMPLETE coverage — every call priced. A partial
   *  sum (e.g. one call's `computeUsageCostUSD` threw and emitted without cost)
   *  would read back as authoritative and under-report; omitting it makes the
   *  client treat coverage as unknown and hide the cost, matching the live fold.
   *  Naturally false when `contextCost` is off (no event carries cost). */
  let allHaveCost = true;
  for (const event of events) {
    const units = normalizeEventUnits(event);
    input += units.input;
    output += units.output;
    cacheWrite += units.cacheWrite;
    cacheRead += units.cacheRead;
    if (event.cost != null) {
      cost += event.cost;
    } else {
      allHaveCost = false;
    }
  }
  const rollup: TResponseUsage = { input, output, cacheWrite, cacheRead };
  if (allHaveCost) {
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

/** Output tokens of the final primary model call belonging to the snapshot's
 *  run — the call the latest pre-invoke snapshot precedes. Persisted as the
 *  snapshot's `completedOutputTokens` so a reloaded multi-call turn adds only
 *  this delta (matching the live finalizer) instead of the full response
 *  `tokenCount`, which the snapshot already counts for earlier steps. Filtering
 *  by `runId` prevents a parallel run's later usage from being attributed to this
 *  snapshot; untagged events (older lib / resume) match any run for back-compat. */
function finalCallOutputTokens(events: ReadonlyArray<TTokenUsageEvent>, runId?: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.usage_type != null) {
      continue;
    }
    if (runId != null && event.runId != null && event.runId !== runId) {
      continue;
    }
    return normalizeEventUnits(event).output;
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
  const completedOutputTokens = finalCallOutputTokens(usageEvents, snapshot.runId);
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

/**
 * Sum of this response's output tokens already folded into a later snapshot's
 * pre-invoke baseline that the response message's `tokenCount` ALSO carries — the
 * overlap `computeSummaryUsedTokens` subtracts from the marker so the live-path
 * client estimate (`summaryBaseline + responseTokenCount`) doesn't double-count:
 *  - earlier tool-loop PRIMARY calls: a multi-call turn's first output sits in the
 *    kept-message context of the next call's snapshot AND in `tokenCount`.
 *  - the SUMMARIZATION call's generated summary: it sits in the snapshot baseline
 *    as `summaryTokens` AND in `tokenCount` (`recordCollectedUsage` folds
 *    summarization completion into the reported output total; subagent/sequential
 *    are kept out of that total, so they are excluded here too).
 *
 * Both are matched by `runId` and bounded by `beforeIndex` to the calls that
 * preceded the snapshot. The summarize detour inherits the graph run id
 * (`traceConfig` spreads `config.metadata.run_id`), so it shares the snapshot's
 * `runId`; a parallel sibling run's summary carries a DIFFERENT `runId` and must
 * NOT be subtracted (its summary lives in the sibling's baseline, not this one).
 * Untagged events (older lib / resume) match any run for back-compat.
 *
 * Only the live path (which builds `tokenCount` via `recordCollectedUsage`) calls
 * this; the abort path subtracts nothing — see {@link buildAbortedResponseMetadata}.
 */
export function priorRunOutputTokens(
  events: ReadonlyArray<TTokenUsageEvent>,
  beforeIndex: number,
  runId?: string,
): number {
  let total = 0;
  const end = Math.min(beforeIndex, events.length);
  for (let i = 0; i < end; i++) {
    const event = events[i];
    if (event.usage_type != null && event.usage_type !== 'summarization') {
      continue;
    }
    if (runId != null && event.runId != null && event.runId !== runId) {
      continue;
    }
    total += normalizeEventUnits(event).output;
  }
  return total;
}

/**
 * Pre-invoke compacted context size for a summarized turn (instructions +
 * summary + kept messages), or `undefined` when the turn did not summarize.
 * Persisted as the lightweight `summaryUsedTokens` marker so the client estimate
 * fallback caps the discarded pre-summary history instead of re-summing it (the
 * gauge otherwise reads 100% in perpetuity after a compaction). Pre-invoke, so
 * it carries none of the `completedOutputTokens` ambiguity that keeps the full
 * snapshot off some save paths. `summaryTokens` is a SEPARATE breakdown field, so
 * the non-`remainingContextTokens` fallback adds it explicitly.
 *
 * `priorOutputTokens` (this response's earlier tool-loop outputs, see
 * {@link priorRunOutputTokens}) is subtracted: those tokens are inside the
 * baseline's kept messages AND in the response message's `tokenCount` the client
 * adds on top, so leaving them in the marker double-counts them on a tool-loop
 * summarized turn. Single-call turns pass 0 and are unaffected.
 */
export function computeSummaryUsedTokens(
  snapshot: TContextUsageEvent | null | undefined,
  priorOutputTokens = 0,
): number | undefined {
  const summaryTokens = snapshot?.breakdown?.summaryTokens ?? 0;
  if (!snapshot || summaryTokens <= 0) {
    return undefined;
  }
  const maxTokens = snapshot.contextBudget ?? snapshot.breakdown.maxContextTokens ?? 0;
  const baseUsed =
    snapshot.remainingContextTokens != null
      ? maxTokens - snapshot.remainingContextTokens
      : (snapshot.effectiveInstructionTokens ?? snapshot.breakdown.instructionTokens ?? 0) +
        summaryTokens +
        (snapshot.breakdown.messageTokens ?? 0);
  const adjusted = baseUsed - Math.max(0, priorOutputTokens);
  return adjusted > 0 ? Math.round(adjusted) : undefined;
}

function parseUsageEvents(value?: string | null): TTokenUsageEvent[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as TTokenUsageEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Builds the response `metadata` for a STOPPED generation from the job's
 * persisted emitted usage, so a stopped reply keeps its accurate cost rollup on
 * reload (finding: stopped responses otherwise lose cost). Shared by every abort
 * save path (agents abort route + legacy abort middleware).
 *
 * Deliberately omits the full `contextUsage`: unlike the live path, the abort
 * path can't tell whether the FINAL call (the one the latest snapshot precedes)
 * emitted usage — the job stores only the latest snapshot, not the snapshot
 * count. If the final call emitted none, `completedOutputTokens` would reuse an
 * earlier call's output the snapshot already counts → reload over-reports. So a
 * stopped response falls back to the per-message gauge estimate on reload.
 *
 * It DOES persist the `summaryUsedTokens` marker when the stopped turn had
 * summarized: that marker is pre-invoke (no `completedOutputTokens` ambiguity),
 * and without it the fallback estimate re-sums the history the compaction
 * discarded — leaving a stopped summarized turn pinned at 100%. Unlike the live
 * path, the abort `tokenCount` comes from `countTokens(text)` (abortMiddleware) or
 * is absent (agents abort route) — it does NOT fold in the summarization or
 * earlier-call output the way `recordCollectedUsage` does. So the marker subtracts
 * NOTHING: the full pre-invoke baseline is correct, and the client adds only the
 * partial answer text on top (no overlap to cancel).
 */
export function buildAbortedResponseMetadata(
  job: { tokenUsage?: string | null; contextUsage?: string | null } | null | undefined,
): { usage?: TResponseUsage; summaryUsedTokens?: number } | undefined {
  const events = parseUsageEvents(job?.tokenUsage);
  const usage = aggregateEmittedUsage(events);

  let snapshot: TContextUsageEvent | null = null;
  if (typeof job?.contextUsage === 'string' && job.contextUsage.length > 0) {
    try {
      snapshot = JSON.parse(job.contextUsage) as TContextUsageEvent;
    } catch {
      snapshot = null;
    }
  }
  /** Subtract nothing: the abort `tokenCount` (countTokens(text) or absent) does
   *  not fold in summarization/earlier-call output, so the full baseline is the
   *  marker and the client's partial-text addition has no overlap to cancel. */
  const summaryUsedTokens = computeSummaryUsedTokens(snapshot);

  const metadata: { usage?: TResponseUsage; summaryUsedTokens?: number } = {};
  if (usage) {
    metadata.usage = usage;
  }
  if (summaryUsedTokens != null) {
    metadata.summaryUsedTokens = summaryUsedTokens;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Resolves the endpoint token config for a usage item by its producing agent.
 * Multi-endpoint graphs tag each call with `agentId`; that agent's resolved
 * config is authoritative — including `undefined`, which means "no configured
 * rates, use built-in pricing" (e.g. a non-custom agent in a custom-primary
 * graph). Only an untagged or unknown agent falls back to `fallback` (the
 * primary config), so single-endpoint graphs are unchanged. `byAgentId` must
 * hold an entry for every known agent (value may be `undefined`) so `has`
 * distinguishes "known, no rates" from "unknown".
 */
export function resolveAgentTokenConfig({
  agentId,
  byAgentId,
  fallback,
}: {
  agentId?: string | null;
  byAgentId?: Map<string, EndpointTokenConfig | undefined>;
  fallback?: EndpointTokenConfig;
}): EndpointTokenConfig | undefined {
  if (agentId != null && byAgentId?.has(agentId)) {
    return byAgentId.get(agentId);
  }
  return fallback;
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
  /**
   * Per-usage endpoint token config resolver for multi-endpoint graphs. Called
   * with each usage item; when provided it is authoritative — its result prices
   * that item, including `undefined` (built-in pricing for a known agent with no
   * configured rates). It owns its own fallback to the primary config for
   * untagged/unknown agents (see {@link resolveAgentTokenConfig}). Single-config
   * callers (responses.js / openai.js) omit it and use `endpointTokenConfig`.
   */
  resolveEndpointTokenConfig?: (usage: UsageMetadata) => EndpointTokenConfig | undefined;
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
    resolveEndpointTokenConfig,
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
        /** Price with the producing agent's endpoint config when a resolver is
         *  provided (multi-endpoint graphs); it owns the fallback to the primary
         *  config, so `undefined` here means built-in pricing, not the batch one. */
        endpointTokenConfig: resolveEndpointTokenConfig
          ? resolveEndpointTokenConfig(usage)
          : endpointTokenConfig,
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
    /** Tag the child's agent id so the host can price this usage with the
     *  subagent's own endpoint token config (its endpoint may differ from the
     *  parent's). The same tagged object is pushed AND handed to `onUsage`. */
    if (event.subagentAgentId != null && event.subagentAgentId !== '') {
      usage.agentId = event.subagentAgentId;
    }
    collectedUsage.push(usage);
    /** Lets the host stream the billed child usage to the client (tagged
     *  `subagent`, so it folds into session cost/totals but not the live
     *  gauge) — child runs never reach ModelEndHandler's emit path. */
    onUsage?.(usage);
  };
}
