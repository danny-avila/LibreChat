/**
 * OpenAI-compatible chat completions service for agents.
 *
 * This service provides an OpenAI v1/chat/completions compatible API for
 * interacting with LibreChat agents. The agent_id is passed as the "model"
 * parameter per OpenAI spec.
 *
 * Usage:
 * ```typescript
 * import { createAgentChatCompletion } from '@librechat/api';
 *
 * // In your Express route handler:
 * app.post('/v1/chat/completions', async (req, res) => {
 *   await createAgentChatCompletion(req, res, {
 *     getAgent: db.getAgent,
 *     // ... other dependencies
 *   });
 * });
 * ```
 */
import { nanoid } from 'nanoid';
import type { Response as ServerResponse, Request } from 'express';
import type {
  ChatCompletionResponse,
  OpenAIResponseContext,
  ChatCompletionRequest,
  OpenAIErrorResponse,
  CompletionUsage,
  ChatMessage,
  ToolCall,
} from './types';
import type { OpenAIStreamHandlerConfig, EventHandler } from './handlers';
import {
  createOpenAIContentAggregator,
  createOpenAIStreamTracker,
  createOpenAIHandlers,
  sendFinalChunk,
  createChunk,
  writeSSE,
} from './handlers';
import type { ToolExecuteOptions } from '../handlers';

/**
 * Dependencies for the chat completion service
 */
export interface ChatCompletionDependencies {
  /** Get agent by ID */
  getAgent: (params: { id: string }) => Promise<Agent | null>;
  /** Initialize agent for use */
  initializeAgent: (params: InitializeAgentParams) => Promise<InitializedAgent>;
  /** Load agent tools */
  loadAgentTools?: LoadToolsFn;
  /** Get models config */
  getModelsConfig?: (req: Request) => Promise<unknown>;
  /** Validate agent model */
  validateAgentModel?: (
    params: unknown,
  ) => Promise<{ isValid: boolean; error?: { message: string } }>;
  /** Log violation */
  logViolation?: (
    req: Request,
    res: ServerResponse,
    type: string,
    info: unknown,
    score: number,
  ) => Promise<void>;
  /** Create agent run */
  createRun?: CreateRunFn;
  /** App config */
  appConfig?: AppConfig;
  /** Tool execute options for event-driven tool execution */
  toolExecuteOptions?: ToolExecuteOptions;
}

/**
 * Agent type from librechat-data-provider
 */
interface Agent {
  id: string;
  name?: string;
  model?: string;
  provider: string;
  tools?: string[];
  instructions?: string;
  model_parameters?: Record<string, unknown>;
  tool_resources?: Record<string, unknown>;
  tool_options?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Initialized agent type - note: after initialization, tools become structured tool objects
 */
interface InitializedAgent {
  id: string;
  name?: string;
  model?: string;
  provider: string;
  /** After initialization, tools are structured tool objects, not strings */
  tools: unknown[];
  instructions?: string;
  model_parameters?: Record<string, unknown>;
  tool_resources?: Record<string, unknown>;
  tool_options?: Record<string, unknown>;
  attachments: unknown[];
  toolContextMap: Record<string, unknown>;
  maxContextTokens: number;
  userMCPAuthMap?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

/**
 * Initialize agent params
 */
interface InitializeAgentParams {
  req: Request;
  res: ServerResponse;
  agent: Agent;
  conversationId?: string | null;
  parentMessageId?: string | null;
  requestFiles?: unknown[];
  loadTools?: LoadToolsFn;
  endpointOption?: Record<string, unknown>;
  allowedProviders: Set<string>;
  isInitialAgent?: boolean;
}

/**
 * Tool loading function type
 */
type LoadToolsFn = (params: {
  req: Request;
  res: ServerResponse;
  provider: string;
  agentId: string;
  tools: string[];
  model: string | null;
  tool_options: unknown;
  tool_resources: unknown;
}) => Promise<{
  tools: unknown[];
  toolContextMap: Record<string, unknown>;
  userMCPAuthMap?: Record<string, Record<string, string>>;
} | null>;

/**
 * Create run function type
 */
type CreateRunFn = (params: {
  agents: unknown[];
  messages: unknown[];
  runId: string;
  signal: AbortSignal;
  customHandlers: Record<string, EventHandler>;
  requestBody: Record<string, unknown>;
  user: Record<string, unknown>;
  tokenCounter?: (message: unknown) => number;
}) => Promise<{
  Graph?: unknown;
  processStream: (
    input: { messages: unknown[] },
    config: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<void>;
} | null>;

/**
 * App config type
 */
interface AppConfig {
  endpoints?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Convert OpenAI messages to LibreChat format
 */
export function convertMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((msg) => {
    let content: string | unknown[];
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (msg.content) {
      content = msg.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        if (part.type === 'image_url') {
          return { type: 'image_url', image_url: part.image_url };
        }
        return part;
      });
    } else {
      content = '';
    }

    return {
      role: msg.role,
      content,
      ...(msg.name && { name: msg.name }),
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
    };
  });
}

/**
 * Create an error response in OpenAI format
 */
export function createErrorResponse(
  message: string,
  type = 'invalid_request_error',
  code: string | null = null,
): OpenAIErrorResponse {
  return {
    error: {
      message,
      type,
      param: null,
      code,
    },
  };
}

/**
 * Send an error response
 */
export function sendErrorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
  type = 'invalid_request_error',
  code: string | null = null,
): void {
  res.status(statusCode).json(createErrorResponse(message, type, code));
}

/**
 * Validation result types for chat completion requests
 */
export type ChatCompletionValidationSuccess = { valid: true; request: ChatCompletionRequest };
export type ChatCompletionValidationFailure = { valid: false; error: string };
export type ChatCompletionValidationResult =
  | ChatCompletionValidationSuccess
  | ChatCompletionValidationFailure;

/**
 * Type guard for validation failure
 */
export function isChatCompletionValidationFailure(
  result: ChatCompletionValidationResult,
): result is ChatCompletionValidationFailure {
  return !result.valid;
}

/**
 * Validate the chat completion request
 */
export function validateRequest(body: unknown): ChatCompletionValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const request = body as Record<string, unknown>;

  if (!request.model || typeof request.model !== 'string') {
    return { valid: false, error: 'model (agent_id) is required' };
  }

  if (!request.messages || !Array.isArray(request.messages)) {
    return { valid: false, error: 'messages array is required' };
  }

  if (request.messages.length === 0) {
    return { valid: false, error: 'messages array cannot be empty' };
  }

  // Validate each message has role and content
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i] as Record<string, unknown>;
    if (!msg.role || typeof msg.role !== 'string') {
      return { valid: false, error: `messages[${i}].role is required` };
    }
    if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
      return {
        valid: false,
        error: `messages[${i}].role must be one of: system, user, assistant, tool`,
      };
    }
  }

  return { valid: true, request: request as unknown as ChatCompletionRequest };
}

/**
 * Build a non-streaming response from aggregated content
 */
export function buildNonStreamingResponse(
  context: OpenAIResponseContext,
  text: string,
  reasoning: string,
  toolCalls: Map<number, ToolCall>,
  usage: CompletionUsage,
): ChatCompletionResponse {
  const toolCallsArray = Array.from(toolCalls.values());
  const finishReason = toolCallsArray.length > 0 && !text ? 'tool_calls' : 'stop';

  return {
    id: context.requestId,
    object: 'chat.completion',
    created: context.created,
    model: context.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(reasoning && { reasoning }),
          ...(toolCallsArray.length > 0 && { tool_calls: toolCallsArray }),
        },
        finish_reason: finishReason,
      },
    ],
    usage,
  };
}

/**
 * Main handler for OpenAI-compatible chat completions with agents.
 *
 * This function:
 * 1. Validates the request
 * 2. Looks up the agent by ID (model parameter)
 * 3. Initializes the agent with tools
 * 4. Runs the agent and streams/returns the response
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param deps - Dependencies for the service
 */
export async function createAgentChatCompletion(
  req: Request,
  res: ServerResponse,
  deps: ChatCompletionDependencies,
): Promise<void> {
  // Validate request
  const validation = validateRequest(req.body);
  if (isChatCompletionValidationFailure(validation)) {
    sendErrorResponse(res, 400, validation.error);
    return;
  }

  const request = validation.request;
  const agentId = request.model;
  const requestedStreaming = request.stream === true;

  // Look up the agent
  const agent = await deps.getAgent({ id: agentId });
  if (!agent) {
    sendErrorResponse(
      res,
      404,
      `Agent not found: ${agentId}`,
      'invalid_request_error',
      'model_not_found',
    );
    return;
  }

  // Generate IDs
  const requestId = `chatcmpl-${nanoid()}`;
  const conversationId = request.conversation_id ?? nanoid();
  const created = Math.floor(Date.now() / 1000);

  // Build response context
  const context: OpenAIResponseContext = {
    created,
    requestId,
    model: agentId,
  };

  // Set up abort controller
  const abortController = new AbortController();

  // Handle client disconnect
  req.on('close', () => {
    abortController.abort();
  });

  try {
    // Build allowed providers set (empty = all allowed)
    const allowedProviders = new Set<string>();

    // Initialize the agent first to check for disableStreaming
    const initializedAgent = await deps.initializeAgent({
      req,
      res,
      agent,
      conversationId,
      parentMessageId: request.parent_message_id,
      loadTools: deps.loadAgentTools,
      endpointOption: {
        endpoint: agent.provider,
        model_parameters: agent.model_parameters ?? {},
      },
      allowedProviders,
      isInitialAgent: true,
    });

    // Determine if streaming is enabled (check both request and agent config)
    const streamingDisabled = !!(initializedAgent.model_parameters as Record<string, unknown>)
      ?.disableStreaming;
    const isStreaming = requestedStreaming && !streamingDisabled;

    // Create tracker for streaming or aggregator for non-streaming
    const tracker = isStreaming ? createOpenAIStreamTracker() : null;
    const aggregator = isStreaming ? null : createOpenAIContentAggregator();

    // Set up response headers for streaming
    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Send initial chunk with role
      const initialChunk = createChunk(context, { role: 'assistant' });
      writeSSE(res, initialChunk);
    }

    // Create handler config (only used for streaming)
    const handlerConfig: OpenAIStreamHandlerConfig | null =
      isStreaming && tracker
        ? {
            res,
            context,
            tracker,
          }
        : null;

    // Create event handlers
    const eventHandlers =
      isStreaming && handlerConfig
        ? createOpenAIHandlers(handlerConfig, deps.toolExecuteOptions)
        : {};

    // Convert messages to internal format
    const messages = convertMessages(request.messages);

    // Create and run the agent
    if (deps.createRun) {
      const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? 'api-user';

      const run = await deps.createRun({
        agents: [initializedAgent],
        messages,
        runId: requestId,
        signal: abortController.signal,
        customHandlers: eventHandlers,
        requestBody: {
          messageId: requestId,
          conversationId,
        },
        user: { id: userId },
      });

      if (run) {
        await run.processStream(
          { messages },
          {
            runName: 'AgentRun',
            configurable: {
              thread_id: conversationId,
              user_id: userId,
            },
            signal: abortController.signal,
            streamMode: 'values',
            version: 'v2',
          },
          {},
        );
      }
    }

    // Finalize response
    if (isStreaming && handlerConfig) {
      sendFinalChunk(handlerConfig);
      res.end();
    } else if (aggregator) {
      // Build and send non-streaming response
      const usage: CompletionUsage = {
        prompt_tokens: aggregator.usage.promptTokens,
        completion_tokens: aggregator.usage.completionTokens,
        total_tokens: aggregator.usage.promptTokens + aggregator.usage.completionTokens,
        ...(aggregator.usage.reasoningTokens > 0 && {
          completion_tokens_details: { reasoning_tokens: aggregator.usage.reasoningTokens },
        }),
      };
      const response = buildNonStreamingResponse(
        context,
        aggregator.getText(),
        aggregator.getReasoning(),
        aggregator.toolCalls,
        usage,
      );
      res.json(response);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';

    // Check if we already started streaming (headers sent)
    if (res.headersSent) {
      // Headers already sent, try to send error in stream format
      const errorChunk = createChunk(context, { content: `\n\nError: ${errorMessage}` }, 'stop');
      writeSSE(res, errorChunk);
      writeSSE(res, '[DONE]');
      res.end();
    } else {
      sendErrorResponse(res, 500, errorMessage, 'server_error');
    }
  }
}

/**
 * List available agents/models
 *
 * This provides a /v1/models compatible endpoint that lists available agents.
 */
export async function listAgentModels(
  _req: Request,
  res: ServerResponse,
  deps: { getAgents: (params: Record<string, unknown>) => Promise<Agent[]> },
): Promise<void> {
  try {
    const agents = await deps.getAgents({});

    const models = agents.map((agent) => ({
      id: agent.id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'librechat',
      permission: [],
      root: agent.id,
      parent: null,
      // Extensions
      name: agent.name,
      provider: agent.provider,
    }));

    res.json({
      object: 'list',
      data: models,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list models';
    sendErrorResponse(res, 500, errorMessage, 'server_error');
  }
}
