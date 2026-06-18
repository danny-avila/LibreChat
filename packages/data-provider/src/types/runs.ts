import { inputTokensIncludesCache } from '../schemas';

export enum ContentTypes {
  TEXT = 'text',
  THINK = 'think',
  TEXT_DELTA = 'text_delta',
  TOOL_CALL = 'tool_call',
  IMAGE_FILE = 'image_file',
  IMAGE_URL = 'image_url',
  VIDEO_URL = 'video_url',
  INPUT_AUDIO = 'input_audio',
  AGENT_UPDATE = 'agent_update',
  SUMMARY = 'summary',
  ERROR = 'error',
}

export enum StepTypes {
  TOOL_CALLS = 'tool_calls',
  MESSAGE_CREATION = 'message_creation',
}

export enum ToolCallTypes {
  FUNCTION = 'function',
  RETRIEVAL = 'retrieval',
  FILE_SEARCH = 'file_search',
  CODE_INTERPRETER = 'code_interpreter',
  /* Agents Tool Call */
  TOOL_CALL = 'tool_call',
}

/** Event names dispatched by the agent graph and consumed by step handlers. */
export enum StepEvents {
  ON_RUN_STEP = 'on_run_step',
  ON_AGENT_UPDATE = 'on_agent_update',
  ON_MESSAGE_DELTA = 'on_message_delta',
  ON_REASONING_DELTA = 'on_reasoning_delta',
  ON_RUN_STEP_DELTA = 'on_run_step_delta',
  ON_RUN_STEP_COMPLETED = 'on_run_step_completed',
  ON_SUMMARIZE_START = 'on_summarize_start',
  ON_SUMMARIZE_DELTA = 'on_summarize_delta',
  ON_SUMMARIZE_COMPLETE = 'on_summarize_complete',
  ON_SUBAGENT_UPDATE = 'on_subagent_update',
}

/** Token-tracking event names streamed to the client (separate from StepEvents dispatch). */
export enum UsageEvents {
  ON_CONTEXT_USAGE = 'on_context_usage',
  ON_TOKEN_USAGE = 'on_token_usage',
}

/** Mirrors TokenBudgetBreakdown from @librechat/agents (data-provider cannot import it). */
export type TTokenBudgetBreakdown = {
  maxContextTokens: number;
  instructionTokens: number;
  systemMessageTokens: number;
  dynamicInstructionTokens: number;
  toolSchemaTokens: number;
  summaryTokens: number;
  toolCount: number;
  messageCount: number;
  messageTokens: number;
  availableForMessages: number;
  /** Per-tool schema token counts (post-multiplier), keyed by tool name */
  toolTokenCounts?: Record<string, number>;
  /** Names of counted tools that are deferred (`defer_loading`) and discovered */
  deferredToolNames?: string[];
};

/** Per-model-call context snapshot, dispatched after pruning and before the LLM call. */
export type TContextUsageEvent = {
  runId?: string;
  agentId?: string;
  breakdown: TTokenBudgetBreakdown;
  /** Usable budget this call: maxContextTokens minus output reserve */
  contextBudget?: number;
  /** Calibrated instruction overhead actually applied this call */
  effectiveInstructionTokens?: number;
  /** Calibrated message tokens before pruning (excluding instructions) */
  prePruneContextTokens?: number;
  /** Tokens still free after instructions + pruned messages */
  remainingContextTokens?: number;
  calibrationRatio?: number;
  /** Output tokens of the response's final model call (the call this pre-invoke
   *  snapshot precedes). Populated only on the persisted `metadata.contextUsage`
   *  blob so a reloaded multi-call turn adds the same post-snapshot delta the
   *  live finalizer did — not the full response `tokenCount`, which the snapshot
   *  already includes for earlier steps. */
  completedOutputTokens?: number;
};

/**
 * Request payload for a server-side context-usage projection: "what context
 * would the next call send for this branch under this config", computed by the
 * agents SDK without invoking the model. Powers the gauge in states the live
 * snapshot can't cover (page load of a snapshot-less branch, window/model
 * switch). `messageId` is the viewed branch's tail; the server walks its parent
 * chain.
 */
export type TContextProjectionRequest = {
  conversationId: string;
  messageId: string;
  endpoint: string;
  model?: string;
  agentId?: string;
  spec?: string;
  maxContextTokens?: number;
  /** Provider-calibrated ratio from a prior snapshot, applied as a static seed. */
  calibrationRatio?: number;
  /** Client-only cache-bust: a branch content revision so a message edit
   *  (which keeps the same tail id) refetches. The server ignores it. */
  revision?: number;
};

/**
 * Per-response usage rollup persisted on `responseMessage.metadata.usage`, in
 * display units (input excludes cache; output includes repaired completion).
 * Normalized per-event on the backend before summing so a reloaded conversation
 * reproduces the live branch/total usage exactly, even for mixed-provider turns
 * (summarization/subagent calls on a different provider than the primary).
 */
export type TResponseUsage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Authoritative USD cost; present only when `interface.contextCost` was on at save */
  cost?: number;
};

/** Provider-reported usage for a single completed model call. */
export type TTokenUsageEvent = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    cache_creation?: number;
    cache_read?: number;
  };
  model?: string;
  provider?: string;
  /** Non-primary buckets fold into session cost/totals but not the live
   *  context gauge: hidden sequential-agent calls (`sequential`), summary
   *  passes (`summarization`), and isolated subagent runs (`subagent`) */
  usage_type?: 'summarization' | 'subagent' | 'sequential';
  runId?: string;
  /** Per-run emission sequence; keeps identical payloads from distinct model calls unique */
  seq?: number;
  /** Authoritative USD cost of this call from the backend (premium tiers, cache
   *  rates); present only when `interface.contextCost` is enabled. Clients sum
   *  this rather than re-deriving cost from base rates. */
  cost?: number;
};

/**
 * Full prompt token count for one completed model call — the EXACT context the
 * model saw, provider-aware: additive providers (Bedrock) report `input_tokens`
 * excluding cache, so cache reads/writes are added back; subset providers
 * (Anthropic, OpenAI, …) already fold cache into `input_tokens`. When the
 * provider is absent (custom/OpenAI-compatible payloads), fall back to the same
 * magnitude heuristic `normalizeUsageUnits` uses — cache ≤ input means it's
 * already included — so cached events aren't re-inflated. The ground truth the
 * gauge reconciles its calibrated estimate to.
 */
export const promptTokensFromUsage = (event: TTokenUsageEvent): number => {
  const input = event.input_tokens ?? 0;
  const details = event.input_token_details ?? {};
  const cacheRead = details.cache_read ?? 0;
  const cacheCreation = details.cache_creation ?? 0;
  const includesCache =
    event.provider != null
      ? inputTokensIncludesCache(event.provider)
      : cacheRead + cacheCreation <= input;
  return includesCache ? input : input + cacheRead + cacheCreation;
};

/**
 * Reconciles a pre-invoke context snapshot's CALIBRATED estimate to a call's
 * ACTUAL prompt tokens. The SDK's calibration multiplier scales only
 * `messageTokens` (instructions/summary are raw tiktoken counts), and it can
 * over-shoot badly when a provider injects server-side content the SDK never
 * counted (e.g. Anthropic web search) — pinning the gauge several× too high and
 * persisting it. Trust the provider's own prompt count: keep the raw
 * instruction/summary rows, set `messageTokens` to the remainder, and recompute
 * the free space. No-op when `promptTokens` is unusable.
 */
export const reconcileContextUsage = (
  snapshot: TContextUsageEvent,
  promptTokens: number,
): TContextUsageEvent => {
  if (!Number.isFinite(promptTokens) || promptTokens <= 0) {
    return snapshot;
  }
  const { breakdown } = snapshot;
  const budget = snapshot.contextBudget ?? breakdown.maxContextTokens;
  const nonMessageTokens = (breakdown.instructionTokens ?? 0) + (breakdown.summaryTokens ?? 0);
  const messageTokens = Math.max(0, promptTokens - nonMessageTokens);
  return {
    ...snapshot,
    breakdown: { ...breakdown, messageTokens },
    remainingContextTokens:
      budget != null ? Math.max(0, budget - promptTokens) : snapshot.remainingContextTokens,
  };
};

/** Lifecycle phase carried on subagent-progress envelopes (mirrors SDK SubagentUpdatePhase). */
export type SubagentUpdatePhase =
  | 'start'
  | 'run_step'
  | 'run_step_delta'
  | 'run_step_completed'
  | 'message_delta'
  | 'reasoning_delta'
  | 'stop'
  | 'error';

/** Single streamed subagent update forwarded by the SDK's SubagentExecutor. */
export interface SubagentUpdateEvent {
  runId: string;
  subagentRunId: string;
  /** Parent-side `tool_call_id` for the `subagent` tool invocation that
   *  triggered this run. Surfaces from the SDK (`3.1.67-dev.2`+) so hosts
   *  can correlate child progress to the parent tool call deterministically. */
  parentToolCallId?: string;
  subagentType: string;
  subagentAgentId: string;
  parentAgentId?: string;
  phase: SubagentUpdatePhase;
  data?: unknown;
  label?: string;
  timestamp: string;
}
