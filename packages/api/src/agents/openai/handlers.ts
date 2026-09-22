/**
 * OpenAI-compatible event handlers for agent streaming.
 *
 * These handlers convert LibreChat's internal graph events into OpenAI-compatible
 * streaming format (SSE with chat.completion.chunk objects).
 */
import type { Response as ServerResponse } from 'express';
import type { Graph } from '@librechat/agents';
import type {
  ChatCompletionChunkChoice,
  OpenAIResponseContext,
  ChatCompletionChunk,
  CompletionUsage,
  ToolCall,
} from './types';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { ToolExecuteOptions } from '~/agents/handlers';
import type { JsonValue } from '../json';
import { createToolExecuteHandler } from '~/agents/handlers';
import { aggregateCollectedUsage } from '../usage';

/**
 * Create a chat completion chunk in OpenAI format
 */
export function createChunk(
  context: OpenAIResponseContext,
  delta: ChatCompletionChunkChoice['delta'],
  finishReason: ChatCompletionChunkChoice['finish_reason'] = null,
  usage?: CompletionUsage,
): ChatCompletionChunk {
  return {
    id: context.requestId,
    object: 'chat.completion.chunk',
    created: context.created,
    model: context.model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
    ...(usage && { usage }),
  };
}

/**
 * Write an SSE event to the response
 */
export function writeSSE(res: ServerResponse, data: ChatCompletionChunk | string): void {
  if (typeof data === 'string') {
    res.write(`data: ${data}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

/**
 * Lightweight tracker for streaming responses.
 * Only tracks what's needed for finish_reason and usage - doesn't store content.
 */
export interface OpenAIStreamTracker {
  /** Successful response completion, installed by the response handlers. */
  finishToolCalls?: () => void;
  abortToolCalls?: () => void;
  /** Whether any text content was emitted */
  hasText: boolean;
  /** Whether any reasoning content was emitted */
  hasReasoning: boolean;
  /** Accumulated tool calls by index */
  toolCalls: Map<number, ToolCall>;
  /** Accumulated usage metadata */
  usage: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  };
  /** Mark that text was emitted */
  addText: () => void;
  /** Mark that reasoning was emitted */
  addReasoning: () => void;
}

/**
 * Create a lightweight stream tracker (doesn't store content)
 */
export function createOpenAIStreamTracker(): OpenAIStreamTracker {
  const tracker: OpenAIStreamTracker = {
    hasText: false,
    hasReasoning: false,
    toolCalls: new Map(),
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
    },
    addText: () => {
      tracker.hasText = true;
    },
    addReasoning: () => {
      tracker.hasReasoning = true;
    },
  };
  return tracker;
}

/**
 * Content aggregator for non-streaming responses.
 * Accumulates full text content, reasoning, and tool calls.
 * Uses arrays for O(n) text accumulation instead of O(n²) string concatenation.
 */
export interface OpenAIContentAggregator {
  /** Successful response completion, installed by the response handlers. */
  finishToolCalls?: () => void;
  abortToolCalls?: () => void;
  /** Accumulated text chunks */
  textChunks: string[];
  /** Accumulated reasoning/thinking chunks */
  reasoningChunks: string[];
  /** Accumulated tool calls by index */
  toolCalls: Map<number, ToolCall>;
  /** Accumulated usage metadata */
  usage: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  };
  /** Get accumulated text (joins chunks) */
  getText: () => string;
  /** Get accumulated reasoning (joins chunks) */
  getReasoning: () => string;
  /** Add text chunk */
  addText: (text: string) => void;
  /** Add reasoning chunk */
  addReasoning: (text: string) => void;
}

/**
 * Create a content aggregator for non-streaming responses
 */
export function createOpenAIContentAggregator(): OpenAIContentAggregator {
  const textChunks: string[] = [];
  const reasoningChunks: string[] = [];

  return {
    textChunks,
    reasoningChunks,
    toolCalls: new Map(),
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
    },
    getText: () => textChunks.join(''),
    getReasoning: () => reasoningChunks.join(''),
    addText: (text: string) => textChunks.push(text),
    addReasoning: (text: string) => reasoningChunks.push(text),
  };
}

/**
 * Handler configuration for OpenAI streaming
 */
export interface OpenAIStreamHandlerConfig {
  signal?: AbortSignal;
  res: ServerResponse;
  context: OpenAIResponseContext;
  tracker: OpenAIStreamTracker;
}

/**
 * Graph event types from @librechat/agents
 */
export const GraphEvents = {
  CHAT_MODEL_END: 'on_chat_model_end',
  TOOL_END: 'on_tool_end',
  CHAT_MODEL_STREAM: 'on_chat_model_stream',
  ON_RUN_STEP: 'on_run_step',
  ON_RUN_STEP_DELTA: 'on_run_step_delta',
  ON_RUN_STEP_COMPLETED: 'on_run_step_completed',
  ON_MESSAGE_DELTA: 'on_message_delta',
  ON_REASONING_DELTA: 'on_reasoning_delta',
  ON_TOOL_EXECUTE: 'on_tool_execute',
} as const;

/**
 * Step types from librechat-data-provider
 */
export const StepTypes = {
  MESSAGE_CREATION: 'message_creation',
  TOOL_CALLS: 'tool_calls',
} as const;

/**
 * Event data interfaces
 */
export interface MessageDeltaData {
  id?: string;
  content?: Array<{ type: string; text?: string; think?: string }>;
  delta?: { content?: MessageDeltaData['content'] };
}

/**
 * One tool-call fragment of a run step delta, as `@librechat/agents` emits it:
 * `id` and `name` arrive on the fragment that opens a call, `args` on the ones
 * that stream its arguments, and `index` is the provider's content-block index
 * within the current model invocation. `function` is accepted for callers that
 * hand-build the OpenAI wire shape instead.
 */
export interface RunStepToolCallChunk {
  index?: number;
  id?: string;
  name?: string;
  args?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface RunStepDeltaData {
  /** The run step these fragments belong to. */
  id?: string;
  delta?: {
    type?: string;
    tool_calls?: RunStepToolCallChunk[];
  };
}

/** A tool call as the run step that opened it declares it. */
export interface RunStepToolCall {
  /** Parsed declaration snapshot, not an append-only delta. */
  args?: JsonValue;
  index?: number;
  id?: string;
  name?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface RunStepData {
  /** The run step's own id, shared with every delta dispatched for it. */
  id?: string;
  /** The step's position in the response content, not a tool-call index. */
  index?: number;
  stepDetails?: {
    type?: string;
    tool_calls?: RunStepToolCall[];
  };
}

export interface ToolEndData {
  output?: {
    name?: string;
    tool_call_id?: string;
    content?: string;
  };
}

export interface ModelEndData {
  output?: {
    usage_metadata?: {
      input_tokens?: number;
      output_tokens?: number;
      model?: string;
      output_token_details?: {
        reasoning?: number;
        reasoning_tokens?: number;
      };
    };
  };
}

/**
 * Event handler interface
 */
export interface EventHandler {
  handle(
    event: string,
    data: unknown,
    metadata?: Record<string, unknown>,
    graph?: unknown,
  ): void | Promise<void>;
}

/**
 * Projects the graph's tool-call events onto the OpenAI wire format.
 *
 * A client accumulates `delta.tool_calls` by `index`: the first chunk at an
 * index declares the call and must carry `id` and `function.name`, and every
 * later chunk at that index belongs to that same call. Neither index the graph
 * reports can serve as that key. A run step's `index` is its position in the
 * response's content, so a tool call that follows text does not start at zero,
 * and consecutive steps each carry a single-element `tool_calls` array rather
 * than one array holding every call. A fragment's `index` is the provider's
 * content-block index, which restarts at zero on each model invocation of the
 * run, so two different calls can share it.
 *
 * Outward indexes are allocated per run step and provider tool-call id. Provider
 * IDs can repeat across steps too; they are not completion-wide identities.
 */
export interface OpenAIToolCallStreamConfig {
  /** Accumulated tool calls, keyed by their outward index. */
  toolCalls: Map<number, ToolCall>;
  /** Emits one outward delta. Omitted for non-streaming responses. */
  emit?: (delta: ChatCompletionChunkChoice['delta']) => void;
  signal?: AbortSignal;
}

export interface OpenAIToolCallStream {
  /** Declares the tool calls a run step opened. */
  onRunStep: (data: RunStepData, metadata?: Record<string, unknown>, graph?: ToolCallGraph) => void;
  /** Accumulates the name and argument fragments streamed for a run step. */
  onRunStepDelta: (
    data: RunStepDeltaData,
    metadata?: Record<string, unknown>,
    graph?: ToolCallGraph,
  ) => void;
  /** Flush complete-only snapshots once, after successful execution, before DONE/JSON. */
  finish: () => void;
  /** Discard pending snapshots on failure and reject further writes. */
  abort: () => void;
}

type ToolCallGraph = Pick<Graph, 'getStepBaseKey'>;

interface ProjectedToolCall {
  providerId: string;
  index: number;
  id: string;
  pendingArgs: string[];
  declared: boolean;
  snapshot?: string;
  hasFragments: boolean;
}

interface ToolCallStep {
  byId: Map<string, ProjectedToolCall>;
  byProviderIndex: Map<number, ProjectedToolCall>;
  /** Declaration position is a fallback, never stronger than a provider binding. */
  byPosition: Map<number, ProjectedToolCall>;
}

export function createOpenAIToolCallStream(
  config: OpenAIToolCallStreamConfig,
): OpenAIToolCallStream {
  const { toolCalls, emit, signal } = config;
  let phase: 'open' | 'finished' | 'aborted' = 'open';
  let unattributableArguments = false;
  const steps = new Map<string, ToolCallStep>();
  const wireIds = new Set<string>();
  const invocations = new Map<string, Map<number, ProjectedToolCall>>();
  const stepScopes = new Map<string, string>();

  /** SDK deltas may use the latest step ID while still referring to an earlier
   * parallel call. Provider indexes span that model invocation, not that step.
   * Without invocation metadata, fall back to step isolation rather than guess. */
  const getBindings = (
    stepId: string,
    metadata?: Record<string, unknown>,
    graph?: ToolCallGraph,
  ): Map<number, ProjectedToolCall> => {
    let scope = stepScopes.get(stepId);
    if (scope === undefined) {
      scope =
        typeof metadata?.langgraph_node === 'string' && typeof metadata.langgraph_step === 'number'
          ? JSON.stringify([
              metadata.run_id ?? '',
              metadata.thread_id ?? '',
              metadata.langgraph_node,
              metadata.langgraph_step,
              metadata.langgraph_checkpoint_ns ?? metadata.checkpoint_ns ?? '',
            ])
          : JSON.stringify(['step', stepId]);
      if (graph && metadata) {
        /** The SDK owns segment, checkpoint and invoked-tool transitions. */
        scope = graph.getStepBaseKey(metadata);
      }
      stepScopes.set(stepId, scope);
    }
    let bindings = invocations.get(scope);
    if (bindings === undefined) {
      bindings = new Map();
      invocations.set(scope, bindings);
    }
    return bindings;
  };
  let nextIndex = 0;

  const getStep = (stepId: string): ToolCallStep => {
    let step = steps.get(stepId);
    if (step === undefined) {
      step = { byId: new Map(), byProviderIndex: new Map(), byPosition: new Map() };
      steps.set(stepId, step);
    }
    return step;
  };

  const getCall = (step: ToolCallStep, id: string): ProjectedToolCall => {
    let call = step.byId.get(id);
    if (call !== undefined) {
      return call;
    }
    const index = nextIndex++;
    let wireId = id;
    /** Index-based clients and id-based consumers must both see distinct calls. */
    while (wireIds.has(wireId)) {
      wireId = `${wireId}_${index}`;
    }
    wireIds.add(wireId);
    call = {
      providerId: id,
      index,
      id: wireId,
      pendingArgs: [],
      declared: false,
      hasFragments: false,
    };
    step.byId.set(id, call);
    return call;
  };

  const append = (call: ProjectedToolCall, args: string): void => {
    if (!args) {
      return;
    }
    if (!call.declared) {
      call.pendingArgs.push(args);
      return;
    }
    const tracked = toolCalls.get(call.index);
    if (tracked === undefined) {
      return;
    }
    tracked.function.arguments += args;
    emit?.({ tool_calls: [{ index: call.index, function: { arguments: args } }] });
  };

  const declare = (call: ProjectedToolCall, name: string): void => {
    if (call.declared || !name) {
      return;
    }
    call.declared = true;
    const toolCall: ToolCall = {
      id: call.id,
      type: 'function',
      function: { name, arguments: '' },
    };
    toolCalls.set(call.index, toolCall);
    emit?.({
      tool_calls: [{ index: call.index, ...toolCall, function: { ...toolCall.function } }],
    });
    append(call, call.pendingArgs.join(''));
    call.pendingArgs.length = 0;
  };

  const abort = (): void => {
    if (phase !== 'finished') {
      phase = 'aborted';
    }
    steps.clear();
    stepScopes.clear();
    invocations.clear();
    wireIds.clear();
  };

  const writable = (): boolean => {
    if (signal?.aborted) {
      abort();
    }
    return phase === 'open';
  };

  return {
    abort,
    finish: () => {
      if (phase === 'finished') {
        return;
      }
      if (!writable()) {
        const error = new Error('Agent response aborted');
        error.name = 'AbortError';
        throw error;
      }
      try {
        if (unattributableArguments) {
          throw new Error('Unattributable tool call arguments in agent response');
        }
        /** A declaration can be a partial parsed snapshot. Any actual argument
         * fragments take precedence, even when they arrive after the snapshot.
         * Never concatenate both representations or repair a failed stream with
         * a stale snapshot. Validate all terminal payloads before flushing any
         * fallback, so malformed input never completes a snapshot-only call. */
        for (const step of steps.values()) {
          for (const call of step.byId.values()) {
            const args = call.hasFragments
              ? toolCalls.get(call.index)?.function.arguments
              : call.snapshot;
            if (!call.declared || args === undefined || args === '') {
              throw new Error('Incomplete tool call in agent response');
            }
            try {
              JSON.parse(args);
            } catch {
              throw new Error('Invalid tool call arguments in agent response');
            }
          }
        }
        for (const step of steps.values()) {
          for (const call of step.byId.values()) {
            if (call.declared && !call.hasFragments && call.snapshot !== undefined) {
              append(call, call.snapshot);
            }
          }
        }
        phase = 'finished';
      } finally {
        abort();
      }
    },
    onRunStep: (data, metadata, graph) => {
      if (!writable()) {
        return;
      }
      const details = data?.stepDetails;
      if (details?.type !== StepTypes.TOOL_CALLS || !Array.isArray(details.tool_calls)) {
        return;
      }
      const step = getStep(data.id ?? '');
      const bindings = getBindings(data.id ?? '', metadata, graph);
      for (const [position, toolCall] of details.tool_calls.entries()) {
        if (!toolCall.id) {
          continue;
        }
        const call = getCall(step, toolCall.id);
        if (toolCall.index !== undefined) {
          step.byProviderIndex.set(toolCall.index, call);
          bindings.set(toolCall.index, call);
        } else if (details.tool_calls.length > 1) {
          step.byPosition.set(position, call);
        }
        const snapshot =
          toolCall.function?.arguments ??
          (toolCall.args === undefined ? undefined : JSON.stringify(toolCall.args));
        if (!call.hasFragments && snapshot !== undefined) {
          call.snapshot = snapshot;
        }
        declare(call, toolCall.name ?? toolCall.function?.name ?? '');
      }
    },

    onRunStepDelta: (data, metadata, graph) => {
      if (!writable()) {
        return;
      }
      const delta = data?.delta;
      if (delta?.type !== StepTypes.TOOL_CALLS || !Array.isArray(delta.tool_calls)) {
        return;
      }
      const step = getStep(data.id ?? '');
      const bindings = getBindings(data.id ?? '', metadata, graph);
      for (const fragment of delta.tool_calls) {
        let call: ProjectedToolCall | undefined;
        if (fragment.id) {
          const bound = fragment.index === undefined ? undefined : bindings.get(fragment.index);
          call = bound?.providerId === fragment.id ? bound : getCall(step, fragment.id);
          if (fragment.index !== undefined) {
            step.byProviderIndex.set(fragment.index, call);
            bindings.set(fragment.index, call);
          }
        } else if (fragment.index !== undefined) {
          call = bindings.get(fragment.index) ?? step.byPosition.get(fragment.index);
        }
        /** Only an unbound singleton can safely adopt an unknown provider index.
         * Once bound, an unrelated index must not append to that call. */
        if (
          call === undefined &&
          !fragment.id &&
          step.byId.size === 1 &&
          (fragment.index === undefined || step.byProviderIndex.size === 0)
        ) {
          call = step.byId.values().next().value;
          if (call !== undefined && fragment.index !== undefined) {
            step.byProviderIndex.set(fragment.index, call);
            bindings.set(fragment.index, call);
          }
        }
        if (call === undefined) {
          unattributableArguments ||= !!(fragment.args ?? fragment.function?.arguments);
          continue;
        }
        declare(call, fragment.name ?? fragment.function?.name ?? '');
        const args = fragment.args ?? fragment.function?.arguments ?? '';
        if (args) {
          call.hasFragments = true;
          call.snapshot = undefined;
          append(call, args);
        }
      }
    },
  };
}

/** Success publishes fallback snapshots; failure/abort never does. Both hosts
 * use this boundary so late provider events cannot mutate a settled response. */
export async function completeOpenAIToolCalls(
  lifecycle: Pick<OpenAIToolCallStream, 'finish' | 'abort'>,
  execute: () => Promise<void>,
): Promise<void> {
  try {
    await execute();
    lifecycle.finish();
  } finally {
    lifecycle.abort();
  }
}

/**
 * Handler for message delta events - streams text content
 */
export class OpenAIMessageDeltaHandler implements EventHandler {
  constructor(private config: OpenAIContentHandlerConfig) {}

  handle(_event: string, data: MessageDeltaData): void {
    const content = data?.delta?.content ?? data?.content;
    if (!content || !Array.isArray(content)) {
      return;
    }

    for (const part of content) {
      if (part.type === 'text' && part.text) {
        if ('aggregator' in this.config) {
          this.config.aggregator.addText(part.text);
          continue;
        }
        this.config.tracker.addText();
        const chunk = createChunk(this.config.context, { content: part.text });
        writeSSE(this.config.res, chunk);
      }
    }
  }
}

/**
 * Handler for run step delta events - accumulates streamed tool call fragments
 */
export class OpenAIRunStepDeltaHandler implements EventHandler {
  constructor(private toolCallStream: OpenAIToolCallStream) {}

  handle(
    _event: string,
    data: RunStepDeltaData,
    metadata?: Record<string, unknown>,
    graph?: ToolCallGraph,
  ): void {
    this.toolCallStream.onRunStepDelta(data, metadata, graph);
  }
}

/**
 * Handler for run step events - declares a tool call's id and name at its
 * outward index, before any argument fragment references that index
 */
export class OpenAIRunStepHandler implements EventHandler {
  constructor(private toolCallStream: OpenAIToolCallStream) {}

  handle(
    _event: string,
    data: RunStepData,
    metadata?: Record<string, unknown>,
    graph?: ToolCallGraph,
  ): void {
    this.toolCallStream.onRunStep(data, metadata, graph);
  }
}

/**
 * Handler for model end events - captures usage
 */
export class OpenAIModelEndHandler implements EventHandler {
  constructor(private config: OpenAIContentHandlerConfig) {}

  handle(_event: string, data: ModelEndData): void {
    const usage = data?.output?.usage_metadata;
    if (!usage) {
      return;
    }

    const target = 'aggregator' in this.config ? this.config.aggregator : this.config.tracker;
    target.usage.promptTokens += usage.input_tokens ?? 0;
    target.usage.completionTokens += usage.output_tokens ?? 0;
    target.usage.reasoningTokens +=
      usage.output_token_details?.reasoning ?? usage.output_token_details?.reasoning_tokens ?? 0;
  }
}

/**
 * Handler for chat model stream events
 */
export class OpenAIChatModelStreamHandler implements EventHandler {
  handle(): void {
    // Handled by message delta handler
  }
}

/**
 * Handler for tool end events
 */
export class OpenAIToolEndHandler implements EventHandler {
  handle(): void {
    // Tool results don't need to be streamed in OpenAI format
    // They're used internally by the agent
  }
}

/**
 * Handler for reasoning delta events.
 * Streams reasoning/thinking content using the `delta.reasoning` field (OpenRouter convention).
 */
export class OpenAIReasoningDeltaHandler implements EventHandler {
  constructor(private config: OpenAIContentHandlerConfig) {}

  handle(_event: string, data: MessageDeltaData): void {
    const content = data?.delta?.content ?? data?.content;
    if (!content || !Array.isArray(content)) {
      return;
    }

    for (const part of content) {
      if ((part.type === 'text' || part.type === 'think') && (part.think || part.text)) {
        const text = part.think || part.text!;
        if ('aggregator' in this.config) {
          this.config.aggregator.addReasoning(text);
          continue;
        }
        // Mark that reasoning was emitted
        this.config.tracker.addReasoning();

        // Stream as delta.reasoning (OpenRouter convention)
        const chunk = createChunk(this.config.context, { reasoning: text });
        writeSSE(this.config.res, chunk);
      }
    }
  }
}

/**
 * Create all handlers for OpenAI streaming format
 */
export interface OpenAIAggregationHandlerConfig {
  aggregator: OpenAIContentAggregator;
  signal?: AbortSignal;
}

type OpenAIContentHandlerConfig = OpenAIStreamHandlerConfig | OpenAIAggregationHandlerConfig;

export function createOpenAIHandlers(
  config: OpenAIContentHandlerConfig,
  toolExecuteOptions?: ToolExecuteOptions,
): Record<string, EventHandler> {
  /** One projection across both events, so a call keeps a single outward index. */
  const toolCallStream = createOpenAIToolCallStream({
    signal: config.signal,
    toolCalls: 'aggregator' in config ? config.aggregator.toolCalls : config.tracker.toolCalls,
    emit:
      'aggregator' in config
        ? undefined
        : (delta) => writeSSE(config.res, createChunk(config.context, delta)),
  });
  const target = 'aggregator' in config ? config.aggregator : config.tracker;
  target.finishToolCalls = toolCallStream.finish;
  target.abortToolCalls = toolCallStream.abort;
  const handlers: Record<string, EventHandler> = {
    [GraphEvents.ON_MESSAGE_DELTA]: new OpenAIMessageDeltaHandler(config),
    [GraphEvents.ON_RUN_STEP_DELTA]: new OpenAIRunStepDeltaHandler(toolCallStream),
    [GraphEvents.ON_RUN_STEP]: new OpenAIRunStepHandler(toolCallStream),
    [GraphEvents.ON_RUN_STEP_COMPLETED]: new OpenAIRunStepHandler(toolCallStream),
    [GraphEvents.CHAT_MODEL_END]: new OpenAIModelEndHandler(config),
    [GraphEvents.CHAT_MODEL_STREAM]: new OpenAIChatModelStreamHandler(),
    [GraphEvents.TOOL_END]: new OpenAIToolEndHandler(),
    [GraphEvents.ON_REASONING_DELTA]: new OpenAIReasoningDeltaHandler(config),
  };

  if (toolExecuteOptions) {
    handlers[GraphEvents.ON_TOOL_EXECUTE] = createToolExecuteHandler(toolExecuteOptions);
  }

  return handlers;
}

/**
 * Send the final chunk with finish_reason and optional usage
 */
export function sendFinalChunk(
  config: OpenAIStreamHandlerConfig,
  finishReason: ChatCompletionChunkChoice['finish_reason'] = 'stop',
  usageOverride?: CompletionUsage,
): void {
  const { res, context, tracker } = config;
  tracker.finishToolCalls?.();

  // Determine finish reason based on content
  let reason = finishReason;
  if (tracker.toolCalls.size > 0 && !tracker.hasText) {
    reason = 'tool_calls';
  }

  // Build usage object with reasoning token details (OpenRouter/OpenAI convention)
  const usage: CompletionUsage = usageOverride ?? {
    prompt_tokens: tracker.usage.promptTokens,
    completion_tokens: tracker.usage.completionTokens,
    total_tokens: tracker.usage.promptTokens + tracker.usage.completionTokens,
  };

  // Add reasoning token breakdown if there are reasoning tokens
  if (usageOverride == null && tracker.usage.reasoningTokens > 0) {
    usage.completion_tokens_details = {
      reasoning_tokens: tracker.usage.reasoningTokens,
    };
  }

  const finalChunk = createChunk(context, {}, reason, usage);
  writeSSE(res, finalChunk);

  // Send [DONE] marker
  writeSSE(res, '[DONE]');
}

/** Build provider-normalized chat-completion usage from every billed call. */
export function buildCompletionUsage(
  collectedUsage: ReadonlyArray<UsageMetadata | null | undefined>,
): CompletionUsage {
  const { total, primary, subagent } = aggregateCollectedUsage(collectedUsage);
  return {
    prompt_tokens: total.inputTokens,
    completion_tokens: total.outputTokens,
    total_tokens: total.totalTokens,
    ...(total.reasoningTokens > 0 && {
      completion_tokens_details: { reasoning_tokens: total.reasoningTokens },
    }),
    primary: {
      prompt_tokens: primary.inputTokens,
      completion_tokens: primary.outputTokens,
      total_tokens: primary.totalTokens,
    },
    subagent: {
      prompt_tokens: subagent.inputTokens,
      completion_tokens: subagent.outputTokens,
      total_tokens: subagent.totalTokens,
    },
  };
}
