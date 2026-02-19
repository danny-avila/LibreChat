/**
 * OpenAI-compatible event handlers for agent streaming.
 *
 * These handlers convert LibreChat's internal graph events into OpenAI-compatible
 * streaming format (SSE with chat.completion.chunk objects).
 */
import type { Response as ServerResponse } from 'express';
import type {
  ChatCompletionChunkChoice,
  OpenAIResponseContext,
  ChatCompletionChunk,
  CompletionUsage,
  ToolCall,
} from './types';
import type { ToolExecuteOptions } from '~/agents/handlers';
import { createToolExecuteHandler } from '~/agents/handlers';

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
  content?: Array<{ type: string; text?: string }>;
}

export interface RunStepDeltaData {
  id?: string;
  delta?: {
    type?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
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
 * Handler for message delta events - streams text content
 */
export class OpenAIMessageDeltaHandler implements EventHandler {
  constructor(private config: OpenAIStreamHandlerConfig) {}

  handle(_event: string, data: MessageDeltaData): void {
    const content = data?.content;
    if (!content || !Array.isArray(content)) {
      return;
    }

    for (const part of content) {
      if (part.type === 'text' && part.text) {
        this.config.tracker.addText();
        const chunk = createChunk(this.config.context, { content: part.text });
        writeSSE(this.config.res, chunk);
      }
    }
  }
}

/**
 * Handler for run step delta events - streams tool calls
 */
export class OpenAIRunStepDeltaHandler implements EventHandler {
  constructor(private config: OpenAIStreamHandlerConfig) {}

  handle(_event: string, data: RunStepDeltaData): void {
    const delta = data?.delta;
    if (!delta || delta.type !== StepTypes.TOOL_CALLS) {
      return;
    }

    const toolCalls = delta.tool_calls;
    if (!toolCalls || !Array.isArray(toolCalls)) {
      return;
    }

    for (const tc of toolCalls) {
      if (tc.index === undefined) {
        continue;
      }

      // Initialize tool call in tracker if needed
      let trackedTc = this.config.tracker.toolCalls.get(tc.index);
      if (!trackedTc && tc.id) {
        trackedTc = {
          id: tc.id,
          type: 'function',
          function: {
            name: '',
            arguments: '',
          },
        };
        this.config.tracker.toolCalls.set(tc.index, trackedTc);
      }

      // Build the streaming delta
      const streamDelta: ChatCompletionChunkChoice['delta'] = {
        tool_calls: [
          {
            index: tc.index,
            ...(tc.id && { id: tc.id }),
            ...(tc.type && { type: tc.type as 'function' }),
            ...(tc.function && {
              function: {
                ...(tc.function.name && { name: tc.function.name }),
                ...(tc.function.arguments && { arguments: tc.function.arguments }),
              },
            }),
          },
        ],
      };

      // Update tracked tool call
      if (trackedTc) {
        if (tc.function?.name) {
          trackedTc.function.name += tc.function.name;
        }
        if (tc.function?.arguments) {
          trackedTc.function.arguments += tc.function.arguments;
        }
      }

      const chunk = createChunk(this.config.context, streamDelta);
      writeSSE(this.config.res, chunk);
    }
  }
}

/**
 * Handler for run step events - sends initial tool call info
 */
export class OpenAIRunStepHandler implements EventHandler {
  constructor(private config: OpenAIStreamHandlerConfig) {}

  handle(_event: string, data: { stepDetails?: { type?: string } }): void {
    // Run step events are primarily for LibreChat UI, we use deltas for streaming
    // This handler is a no-op for OpenAI format
    if (data?.stepDetails?.type === StepTypes.TOOL_CALLS) {
      // Tool calls will be streamed via delta events
    }
  }
}

/**
 * Handler for model end events - captures usage
 */
export class OpenAIModelEndHandler implements EventHandler {
  constructor(private config: OpenAIStreamHandlerConfig) {}

  handle(_event: string, data: ModelEndData): void {
    const usage = data?.output?.usage_metadata;
    if (!usage) {
      return;
    }

    this.config.tracker.usage.promptTokens += usage.input_tokens ?? 0;
    this.config.tracker.usage.completionTokens += usage.output_tokens ?? 0;
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
  constructor(private config: OpenAIStreamHandlerConfig) {}

  handle(_event: string, data: MessageDeltaData): void {
    const content = data?.content;
    if (!content || !Array.isArray(content)) {
      return;
    }

    for (const part of content) {
      if (part.type === 'text' && part.text) {
        // Mark that reasoning was emitted
        this.config.tracker.addReasoning();

        // Stream as delta.reasoning (OpenRouter convention)
        const chunk = createChunk(this.config.context, { reasoning: part.text });
        writeSSE(this.config.res, chunk);
      }
    }
  }
}

/**
 * Create all handlers for OpenAI streaming format
 */
export function createOpenAIHandlers(
  config: OpenAIStreamHandlerConfig,
  toolExecuteOptions?: ToolExecuteOptions,
): Record<string, EventHandler> {
  const handlers: Record<string, EventHandler> = {
    [GraphEvents.ON_MESSAGE_DELTA]: new OpenAIMessageDeltaHandler(config),
    [GraphEvents.ON_RUN_STEP_DELTA]: new OpenAIRunStepDeltaHandler(config),
    [GraphEvents.ON_RUN_STEP]: new OpenAIRunStepHandler(config),
    [GraphEvents.ON_RUN_STEP_COMPLETED]: new OpenAIRunStepHandler(config),
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
): void {
  const { res, context, tracker } = config;

  // Determine finish reason based on content
  let reason = finishReason;
  if (tracker.toolCalls.size > 0 && !tracker.hasText) {
    reason = 'tool_calls';
  }

  // Build usage object with reasoning token details (OpenRouter/OpenAI convention)
  const usage: CompletionUsage = {
    prompt_tokens: tracker.usage.promptTokens,
    completion_tokens: tracker.usage.completionTokens,
    total_tokens: tracker.usage.promptTokens + tracker.usage.completionTokens,
  };

  // Add reasoning token breakdown if there are reasoning tokens
  if (tracker.usage.reasoningTokens > 0) {
    usage.completion_tokens_details = {
      reasoning_tokens: tracker.usage.reasoningTokens,
    };
  }

  const finalChunk = createChunk(context, {}, reason, usage);
  writeSSE(res, finalChunk);

  // Send [DONE] marker
  writeSSE(res, '[DONE]');
}
