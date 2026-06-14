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
