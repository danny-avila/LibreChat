/**
 * Open Responses API Service
 *
 * Core service for processing Open Responses API requests.
 * Handles input conversion, message formatting, and request validation.
 */
import type { Response as ServerResponse } from 'express';
import type {
  ResponseRequest,
  RequestValidationResult,
  InputItem,
  InputContent,
  ResponseContext,
  Response,
} from './types';
import {
  writeDone,
  emitResponseCompleted,
  emitMessageItemAdded,
  emitMessageItemDone,
  emitTextContentPartAdded,
  emitOutputTextDelta,
  emitOutputTextDone,
  emitTextContentPartDone,
  emitFunctionCallItemAdded,
  emitFunctionCallArgumentsDelta,
  emitFunctionCallArgumentsDone,
  emitFunctionCallItemDone,
  emitFunctionCallOutputItem,
  emitReasoningItemAdded,
  emitReasoningContentPartAdded,
  emitReasoningDelta,
  emitReasoningDone,
  emitReasoningContentPartDone,
  emitReasoningItemDone,
  updateTrackerUsage,
  type StreamHandlerConfig,
} from './handlers';

/* =============================================================================
 * REQUEST VALIDATION
 * ============================================================================= */

/**
 * Validate a request body
 */
export function validateResponseRequest(body: unknown): RequestValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const request = body as Record<string, unknown>;

  // Required: model
  if (!request.model || typeof request.model !== 'string') {
    return { valid: false, error: 'model is required and must be a string' };
  }

  // Required: input (string or array)
  if (request.input === undefined || request.input === null) {
    return { valid: false, error: 'input is required' };
  }

  if (typeof request.input !== 'string' && !Array.isArray(request.input)) {
    return { valid: false, error: 'input must be a string or array of items' };
  }

  // Optional validations
  if (request.stream !== undefined && typeof request.stream !== 'boolean') {
    return { valid: false, error: 'stream must be a boolean' };
  }

  if (request.temperature !== undefined) {
    const temp = request.temperature as number;
    if (typeof temp !== 'number' || temp < 0 || temp > 2) {
      return { valid: false, error: 'temperature must be a number between 0 and 2' };
    }
  }

  if (request.max_output_tokens !== undefined) {
    if (typeof request.max_output_tokens !== 'number' || request.max_output_tokens < 1) {
      return { valid: false, error: 'max_output_tokens must be a positive number' };
    }
  }

  return { valid: true, request: request as unknown as ResponseRequest };
}

/**
 * Check if validation failed
 */
export function isValidationFailure(
  result: RequestValidationResult,
): result is { valid: false; error: string } {
  return !result.valid;
}

/* =============================================================================
 * INPUT CONVERSION
 * ============================================================================= */

/** Internal message format (LibreChat-compatible) */
export interface InternalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/**
 * Convert Open Responses input to internal message format.
 * Handles both string input and array of items.
 */
export function convertInputToMessages(input: string | InputItem[]): InternalMessage[] {
  // Simple string input becomes a user message
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }

  const messages: InternalMessage[] = [];

  for (const item of input) {
    if (item.type === 'item_reference') {
      // Skip item references - they're handled by previous_response_id
      continue;
    }

    if (item.type === 'message') {
      const messageItem = item as {
        type: 'message';
        role: string;
        content: string | InputContent[];
      };

      let content: InternalMessage['content'];

      if (typeof messageItem.content === 'string') {
        content = messageItem.content;
      } else if (Array.isArray(messageItem.content)) {
        content = messageItem.content.map((part) => {
          if (part.type === 'input_text') {
            return { type: 'text', text: part.text };
          }
          if (part.type === 'input_image') {
            return {
              type: 'image_url',
              image_url: {
                url: (part as { image_url?: string }).image_url,
                detail: (part as { detail?: string }).detail,
              },
            };
          }
          return { type: part.type };
        });
      } else {
        content = '';
      }

      // Map developer role to system (LibreChat convention)
      let role: InternalMessage['role'];
      if (messageItem.role === 'developer') {
        role = 'system';
      } else if (messageItem.role === 'user') {
        role = 'user';
      } else if (messageItem.role === 'assistant') {
        role = 'assistant';
      } else if (messageItem.role === 'system') {
        role = 'system';
      } else {
        role = 'user';
      }

      messages.push({ role, content });
    }

    if (item.type === 'function_call') {
      // Function call items represent prior tool calls from assistant
      const fcItem = item as {
        type: 'function_call';
        call_id: string;
        name: string;
        arguments: string;
      };

      // Add as assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: fcItem.call_id,
            type: 'function',
            function: { name: fcItem.name, arguments: fcItem.arguments },
          },
        ],
      });
    }

    if (item.type === 'function_call_output') {
      // Function call output items represent tool results
      const fcoItem = item as { type: 'function_call_output'; call_id: string; output: string };

      messages.push({
        role: 'tool',
        content: fcoItem.output,
        tool_call_id: fcoItem.call_id,
      });
    }

    // Reasoning items are typically not passed back as input
    // They're model-generated and may be encrypted
  }

  return messages;
}

/**
 * Merge previous conversation messages with new input
 */
export function mergeMessagesWithInput(
  previousMessages: InternalMessage[],
  newInput: InternalMessage[],
): InternalMessage[] {
  return [...previousMessages, ...newInput];
}

/* =============================================================================
 * ERROR RESPONSE
 * ============================================================================= */

/**
 * Send an error response in Open Responses format
 */
export function sendResponsesErrorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
  type: string = 'invalid_request',
  code?: string,
): void {
  res.status(statusCode).json({
    error: {
      type,
      message,
      code: code ?? null,
      param: null,
    },
  });
}

/* =============================================================================
 * RESPONSE CONTEXT
 * ============================================================================= */

/**
 * Generate a unique response ID
 */
export function generateResponseId(): string {
  return `resp_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a response context from request
 */
export function createResponseContext(
  request: ResponseRequest,
  responseId?: string,
): ResponseContext {
  return {
    responseId: responseId ?? generateResponseId(),
    model: request.model,
    createdAt: Math.floor(Date.now() / 1000),
    previousResponseId: request.previous_response_id,
    instructions: request.instructions,
  };
}

/* =============================================================================
 * STREAMING SETUP
 * ============================================================================= */

/**
 * Set up streaming response headers
 */
export function setupStreamingResponse(res: ServerResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/* =============================================================================
 * STREAM HANDLER FACTORY
 * ============================================================================= */

/**
 * State for tracking streaming progress
 */
interface StreamState {
  messageStarted: boolean;
  messageContentStarted: boolean;
  reasoningStarted: boolean;
  reasoningContentStarted: boolean;
  activeToolCalls: Set<string>;
  completedToolCalls: Set<string>;
}

/**
 * Create LibreChat event handlers that emit Open Responses events
 */
export function createResponsesEventHandlers(config: StreamHandlerConfig): {
  handlers: Record<string, { handle: (event: string, data: unknown) => void }>;
  state: StreamState;
  finalizeStream: () => void;
} {
  const state: StreamState = {
    messageStarted: false,
    messageContentStarted: false,
    reasoningStarted: false,
    reasoningContentStarted: false,
    activeToolCalls: new Set(),
    completedToolCalls: new Set(),
  };

  /**
   * Ensure message item is started
   */
  const ensureMessageStarted = (): void => {
    if (!state.messageStarted) {
      emitMessageItemAdded(config);
      state.messageStarted = true;
    }
  };

  /**
   * Ensure message content part is started
   */
  const ensureMessageContentStarted = (): void => {
    ensureMessageStarted();
    if (!state.messageContentStarted) {
      emitTextContentPartAdded(config);
      state.messageContentStarted = true;
    }
  };

  /**
   * Ensure reasoning item is started
   */
  const ensureReasoningStarted = (): void => {
    if (!state.reasoningStarted) {
      emitReasoningItemAdded(config);
      state.reasoningStarted = true;
    }
  };

  /**
   * Ensure reasoning content part is started
   */
  const ensureReasoningContentStarted = (): void => {
    ensureReasoningStarted();
    if (!state.reasoningContentStarted) {
      emitReasoningContentPartAdded(config);
      state.reasoningContentStarted = true;
    }
  };

  /**
   * Close any open content streams
   */
  const closeOpenStreams = (): void => {
    // Close message content if open
    if (state.messageContentStarted) {
      emitOutputTextDone(config);
      emitTextContentPartDone(config);
      state.messageContentStarted = false;
    }

    // Close message item if open
    if (state.messageStarted) {
      emitMessageItemDone(config);
      state.messageStarted = false;
    }

    // Close reasoning content if open
    if (state.reasoningContentStarted) {
      emitReasoningDone(config);
      emitReasoningContentPartDone(config);
      state.reasoningContentStarted = false;
    }

    // Close reasoning item if open
    if (state.reasoningStarted) {
      emitReasoningItemDone(config);
      state.reasoningStarted = false;
    }
  };

  const handlers = {
    /**
     * Handle text message deltas
     */
    on_message_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as { delta?: { content?: Array<{ type: string; text?: string }> } };
        const content = deltaData?.delta?.content;

        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              ensureMessageContentStarted();
              emitOutputTextDelta(config, part.text);
            }
          }
        }
      },
    },

    /**
     * Handle reasoning deltas
     */
    on_reasoning_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as {
          delta?: { content?: Array<{ type: string; text?: string; think?: string }> };
        };
        const content = deltaData?.delta?.content;

        if (Array.isArray(content)) {
          for (const part of content) {
            const text = part.think || part.text;
            if (text) {
              ensureReasoningContentStarted();
              emitReasoningDelta(config, text);
            }
          }
        }
      },
    },

    /**
     * Handle run step (tool call initiation)
     */
    on_run_step: {
      handle: (_event: string, data: unknown): void => {
        const stepData = data as {
          stepDetails?: { type: string; tool_calls?: Array<{ id?: string; name?: string }> };
        };
        const stepDetails = stepData?.stepDetails;

        if (stepDetails?.type === 'tool_calls' && stepDetails.tool_calls) {
          // Close any open message/reasoning before tool calls
          closeOpenStreams();

          for (const tc of stepDetails.tool_calls) {
            const callId = tc.id ?? '';
            const name = tc.name ?? '';

            if (callId && !state.activeToolCalls.has(callId)) {
              state.activeToolCalls.add(callId);
              emitFunctionCallItemAdded(config, callId, name);
            }
          }
        }
      },
    },

    /**
     * Handle run step delta (tool call argument streaming)
     */
    on_run_step_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as {
          delta?: { type: string; tool_calls?: Array<{ index?: number; args?: string }> };
        };
        const delta = deltaData?.delta;

        if (delta?.type === 'tool_calls' && delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const args = tc.args ?? '';
            if (!args) {
              continue;
            }

            // Find the call_id for this tool call by index
            const toolCallsArray = Array.from(state.activeToolCalls);
            const callId = toolCallsArray[tc.index ?? 0];

            if (callId) {
              emitFunctionCallArgumentsDelta(config, callId, args);
            }
          }
        }
      },
    },

    /**
     * Handle tool end (tool execution complete)
     */
    on_tool_end: {
      handle: (_event: string, data: unknown): void => {
        const toolData = data as { tool_call_id?: string; output?: string };
        const callId = toolData?.tool_call_id;
        const output = toolData?.output ?? '';

        if (callId && state.activeToolCalls.has(callId) && !state.completedToolCalls.has(callId)) {
          state.completedToolCalls.add(callId);

          // Complete the function call item
          emitFunctionCallArgumentsDone(config, callId);
          emitFunctionCallItemDone(config, callId);

          // Emit the function call output (internal tool result)
          emitFunctionCallOutputItem(config, callId, output);
        }
      },
    },

    /**
     * Handle chat model end (usage collection)
     */
    on_chat_model_end: {
      handle: (_event: string, data: unknown): void => {
        const endData = data as {
          output?: {
            usage_metadata?: {
              input_tokens?: number;
              output_tokens?: number;
              // OpenAI format
              input_token_details?: {
                cache_creation?: number;
                cache_read?: number;
              };
              // Anthropic format
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          };
        };

        const usage = endData?.output?.usage_metadata;
        if (usage) {
          // Extract cached tokens from either OpenAI or Anthropic format
          const cachedTokens =
            (usage.input_token_details?.cache_read ?? 0) + (usage.cache_read_input_tokens ?? 0);

          updateTrackerUsage(config.tracker, {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            cachedTokens,
          });
        }
      },
    },
  };

  /**
   * Finalize the stream - close open items and emit completed
   */
  const finalizeStream = (): void => {
    closeOpenStreams();
    emitResponseCompleted(config);
    writeDone(config.res);
  };

  return { handlers, state, finalizeStream };
}

/* =============================================================================
 * NON-STREAMING AGGREGATOR
 * ============================================================================= */

/**
 * Aggregator for non-streaming responses
 */
export interface ResponseAggregator {
  textChunks: string[];
  reasoningChunks: string[];
  toolCalls: Map<
    string,
    {
      id: string;
      name: string;
      arguments: string;
    }
  >;
  toolOutputs: Map<string, string>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
  };
  addText: (text: string) => void;
  addReasoning: (text: string) => void;
  getText: () => string;
  getReasoning: () => string;
}

/**
 * Create an aggregator for non-streaming responses
 */
export function createResponseAggregator(): ResponseAggregator {
  const aggregator: ResponseAggregator = {
    textChunks: [],
    reasoningChunks: [],
    toolCalls: new Map(),
    toolOutputs: new Map(),
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
    },
    addText: (text: string) => {
      aggregator.textChunks.push(text);
    },
    addReasoning: (text: string) => {
      aggregator.reasoningChunks.push(text);
    },
    getText: () => aggregator.textChunks.join(''),
    getReasoning: () => aggregator.reasoningChunks.join(''),
  };
  return aggregator;
}

/**
 * Build a non-streaming response from aggregator
 * Includes all required fields per Open Responses spec
 */
export function buildAggregatedResponse(
  context: ResponseContext,
  aggregator: ResponseAggregator,
): Response {
  const output: Response['output'] = [];

  // Add reasoning item if present
  const reasoningText = aggregator.getReasoning();
  if (reasoningText) {
    output.push({
      type: 'reasoning',
      id: `reason_${Date.now().toString(36)}`,
      status: 'completed',
      content: [{ type: 'reasoning_text', text: reasoningText }],
      summary: [],
    });
  }

  // Add function calls and outputs
  for (const [callId, tc] of aggregator.toolCalls) {
    output.push({
      type: 'function_call',
      id: `fc_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
      call_id: callId,
      name: tc.name,
      arguments: tc.arguments,
      status: 'completed',
    });

    const toolOutput = aggregator.toolOutputs.get(callId);
    if (toolOutput) {
      output.push({
        type: 'function_call_output',
        id: `fco_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
        call_id: callId,
        output: toolOutput,
        status: 'completed',
      });
    }
  }

  // Add message item if there's text (or always add one if no other output)
  const text = aggregator.getText();
  if (text || output.length === 0) {
    output.push({
      type: 'message',
      id: `msg_${Date.now().toString(36)}`,
      role: 'assistant',
      status: 'completed',
      content: text ? [{ type: 'output_text', text, annotations: [], logprobs: [] }] : [],
    });
  }

  return {
    // Required fields per Open Responses spec
    id: context.responseId,
    object: 'response',
    created_at: context.createdAt,
    completed_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    incomplete_details: null,
    model: context.model,
    previous_response_id: context.previousResponseId ?? null,
    instructions: context.instructions ?? null,
    output,
    error: null,
    tools: [],
    tool_choice: 'auto',
    truncation: 'disabled',
    parallel_tool_calls: true,
    text: { format: { type: 'text' } },
    temperature: 1,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_logprobs: 0,
    reasoning: null,
    user: null,
    usage: {
      input_tokens: aggregator.usage.inputTokens,
      output_tokens: aggregator.usage.outputTokens,
      total_tokens: aggregator.usage.inputTokens + aggregator.usage.outputTokens,
      input_tokens_details: { cached_tokens: aggregator.usage.cachedTokens },
      output_tokens_details: { reasoning_tokens: aggregator.usage.reasoningTokens },
    },
    max_output_tokens: null,
    max_tool_calls: null,
    store: false,
    background: false,
    service_tier: 'default',
    metadata: {},
    safety_identifier: null,
    prompt_cache_key: null,
  };
}

/**
 * Create event handlers for non-streaming aggregation
 */
export function createAggregatorEventHandlers(aggregator: ResponseAggregator): Record<
  string,
  {
    handle: (event: string, data: unknown) => void;
  }
> {
  const activeToolCalls = new Set<string>();

  return {
    on_message_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as { delta?: { content?: Array<{ type: string; text?: string }> } };
        const content = deltaData?.delta?.content;

        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              aggregator.addText(part.text);
            }
          }
        }
      },
    },

    on_reasoning_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as {
          delta?: { content?: Array<{ type: string; text?: string; think?: string }> };
        };
        const content = deltaData?.delta?.content;

        if (Array.isArray(content)) {
          for (const part of content) {
            const text = part.think || part.text;
            if (text) {
              aggregator.addReasoning(text);
            }
          }
        }
      },
    },

    on_run_step: {
      handle: (_event: string, data: unknown): void => {
        const stepData = data as {
          stepDetails?: { type: string; tool_calls?: Array<{ id?: string; name?: string }> };
        };
        const stepDetails = stepData?.stepDetails;

        if (stepDetails?.type === 'tool_calls' && stepDetails.tool_calls) {
          for (const tc of stepDetails.tool_calls) {
            const callId = tc.id ?? '';
            const name = tc.name ?? '';

            if (callId && !activeToolCalls.has(callId)) {
              activeToolCalls.add(callId);
              aggregator.toolCalls.set(callId, { id: callId, name, arguments: '' });
            }
          }
        }
      },
    },

    on_run_step_delta: {
      handle: (_event: string, data: unknown): void => {
        const deltaData = data as {
          delta?: { type: string; tool_calls?: Array<{ index?: number; args?: string }> };
        };
        const delta = deltaData?.delta;

        if (delta?.type === 'tool_calls' && delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const args = tc.args ?? '';
            if (!args) {
              continue;
            }

            const toolCallsArray = Array.from(activeToolCalls);
            const callId = toolCallsArray[tc.index ?? 0];

            if (callId) {
              const existing = aggregator.toolCalls.get(callId);
              if (existing) {
                existing.arguments += args;
              }
            }
          }
        }
      },
    },

    on_tool_end: {
      handle: (_event: string, data: unknown): void => {
        const toolData = data as { tool_call_id?: string; output?: string };
        const callId = toolData?.tool_call_id;
        const output = toolData?.output ?? '';

        if (callId) {
          aggregator.toolOutputs.set(callId, output);
        }
      },
    },

    on_chat_model_end: {
      handle: (_event: string, data: unknown): void => {
        const endData = data as {
          output?: {
            usage_metadata?: {
              input_tokens?: number;
              output_tokens?: number;
              // OpenAI format
              input_token_details?: {
                cache_creation?: number;
                cache_read?: number;
              };
              // Anthropic format
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          };
        };

        const usage = endData?.output?.usage_metadata;
        if (usage) {
          aggregator.usage.inputTokens = usage.input_tokens ?? 0;
          aggregator.usage.outputTokens = usage.output_tokens ?? 0;

          // Extract cached tokens from either OpenAI or Anthropic format
          aggregator.usage.cachedTokens =
            (usage.input_token_details?.cache_read ?? 0) + (usage.cache_read_input_tokens ?? 0);
        }
      },
    },
  };
}
