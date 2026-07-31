import type { TFile } from './files';
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
  ACTIVITY_LABEL = 'activity_label',
  STEER = 'steer',
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
  ON_SANDBOX_STARTING = 'on_sandbox_starting',
}

/** Payload for {@link StepEvents.ON_SANDBOX_STARTING} — the stateful code
 * sandbox is cold-booting for the given code tool call. */
export type SandboxStartingEvent = {
  tool_call_id: string;
  runId?: string;
};

/** Token-tracking event names streamed to the client (separate from StepEvents dispatch). */
export enum UsageEvents {
  ON_CONTEXT_USAGE = 'on_context_usage',
  ON_TOKEN_USAGE = 'on_token_usage',
}

/**
 * Human-in-the-loop event names. Streamed to live clients when a run pauses for
 * tool approval (or an ask-user question). Reconnecting clients instead read the
 * same record from `resumeState.pendingAction` on the sync event / status route.
 */
export enum ApprovalEvents {
  ON_PENDING_ACTION = 'on_pending_action',
}

/**
 * Steering event names. `on_steer_applied` streams to live clients when a
 * queued steer message is injected at a tool-batch boundary; reconnecting
 * clients recover injected steers from `aggregatedContent` and still-queued
 * ones from `resumeState.pendingSteers`. Steers that never reach a boundary
 * ride the final/abort events as `pendingSteers`.
 */
export enum SteerEvents {
  ON_STEER_APPLIED = 'on_steer_applied',
  /** Durable capability correction for queued steers after HITL handover. */
  ON_STEER_UPDATED = 'on_steer_updated',
}

/**
 * Activity-label event names. `on_activity_label` streams to live clients
 * when a tool-batch label part is claimed (deterministic counts) and again
 * when the fast-model label resolves; reconnecting clients recover applied
 * labels from `aggregatedContent` like any other content part.
 */
export enum ActivityLabelEvents {
  ON_ACTIVITY_LABEL = 'on_activity_label',
}

/** Payload of the `on_activity_label` SSE event. */
export type TActivityLabelEvent = {
  /** Absolute content index the label part occupies. */
  index: number;
  part: {
    type: ContentTypes.ACTIVITY_LABEL;
    [ContentTypes.ACTIVITY_LABEL]: string;
    tool_call_ids?: string[];
    counts?: {
      searches: number;
      reads: number;
      writes: number;
      commands: number;
      other: number;
    };
    status?: 'ok' | 'partial' | 'failed';
    agentId?: string;
    pending?: boolean;
  };
  responseMessageId?: string;
  conversationId?: string;
};

/** A steer message queued server-side but not yet injected into the run. */
export type TPendingSteer = {
  steerId: string;
  /** Correlates a server steer with its optimistic chip when terminal delivery
   *  races ahead of the POST response. */
  clientSteerId?: string;
  text: string;
  createdAt?: number;
  files?: Partial<TFile>[];
  /** The steer asked to interrupt generation at the next safe boundary —
   *  kept on parked/replayed chips so the "interrupting" label survives. */
  preempt?: boolean;
  /** Monotonic server revision for last-writer-wins interrupt labels. */
  preemptRevision?: number;
};

/** Payload of the `on_steer_applied` SSE event. */
export type TSteerAppliedEvent = {
  steerId: string;
  /** Correlates the applied event with the optimistic chip before the POST settles. */
  clientSteerId?: string;
  /** Absolute content index the steer part was injected at. */
  index: number;
  part: {
    type: ContentTypes.STEER;
    [ContentTypes.STEER]: string;
    steerId?: string;
    clientSteerId?: string;
    createdAt?: number;
    files?: Partial<TFile>[];
  };
  responseMessageId?: string;
  conversationId?: string;
};

/** A queued steer's interrupt label changed without moving its FIFO slot. */
export type TSteerUpdatedEvent = {
  conversationId: string;
  steers: Array<{
    steerId: string;
    clientSteerId?: string;
    preempt: boolean;
    preemptRevision: number;
  }>;
};

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
   *  passes (`summarization`), isolated subagent runs (`subagent`), and
   *  fast-model activity headers (`activity-label`) */
  usage_type?: 'summarization' | 'subagent' | 'sequential' | 'activity-label';
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
