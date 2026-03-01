const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { Callback, ToolEndHandler, formatAgentMessages } = require('@librechat/agents');
const { EModelEndpoint, ResourceType, PermissionBits } = require('librechat-data-provider');
const {
  writeSSE,
  createRun,
  createChunk,
  buildToolSet,
  sendFinalChunk,
  createSafeUser,
  validateRequest,
  initializeAgent,
  getBalanceConfig,
  createErrorResponse,
  recordCollectedUsage,
  getTransactionsConfig,
  createToolExecuteHandler,
  buildNonStreamingResponse,
  createOpenAIStreamTracker,
  createOpenAIContentAggregator,
  isChatCompletionValidationFailure,
} = require('@librechat/api');
const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
const { createToolEndCallback } = require('~/server/controllers/agents/callbacks');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const db = require('~/models');

/**
 * Creates a tool loader function for the agent.
 * @param {AbortSignal} signal - The abort signal
 * @param {boolean} [definitionsOnly=true] - When true, returns only serializable
 *   tool definitions without creating full tool instances (for event-driven mode)
 */
function createToolLoader(signal, definitionsOnly = true) {
  return async function loadTools({
    req,
    res,
    tools,
    model,
    agentId,
    provider,
    tool_options,
    tool_resources,
  }) {
    const agent = { id: agentId, tools, provider, model, tool_options };
    try {
      return await loadAgentTools({
        req,
        res,
        agent,
        signal,
        tool_resources,
        definitionsOnly,
        streamId: null, // No resumable stream for OpenAI compat
      });
    } catch (error) {
      logger.error('Error loading tools for agent ' + agentId, error);
    }
  };
}

/**
 * Convert content part to internal format
 * @param {Object} part - Content part
 * @returns {Object} Converted part
 */
function convertContentPart(part) {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }
  if (part.type === 'image_url') {
    return { type: 'image_url', image_url: part.image_url };
  }
  return part;
}

/**
 * Convert OpenAI messages to internal format
 * @param {Array} messages - OpenAI format messages
 * @returns {Array} Internal format messages
 */
function convertMessages(messages) {
  return messages.map((msg) => {
    let content;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (msg.content) {
      content = msg.content.map(convertContentPart);
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
 * Send an error response in OpenAI format
 */
function sendErrorResponse(res, statusCode, message, type = 'invalid_request_error', code = null) {
  res.status(statusCode).json(createErrorResponse(message, type, code));
}

/**
 * OpenAI-compatible chat completions controller for agents.
 *
 * POST /v1/chat/completions
 *
 * Request format:
 * {
 *   "model": "agent_id_here",
 *   "messages": [{"role": "user", "content": "Hello!"}],
 *   "stream": true,
 *   "conversation_id": "optional",
 *   "parent_message_id": "optional"
 * }
 */
const OpenAIChatCompletionController = async (req, res) => {
  const appConfig = req.config;
  const requestStartTime = Date.now();

  // Validate request
  const validation = validateRequest(req.body);
  if (isChatCompletionValidationFailure(validation)) {
    return sendErrorResponse(res, 400, validation.error);
  }

  const request = validation.request;
  const agentId = request.model;

  // Look up the agent
  const agent = await db.getAgent({ id: agentId });
  if (!agent) {
    return sendErrorResponse(
      res,
      404,
      `Agent not found: ${agentId}`,
      'invalid_request_error',
      'model_not_found',
    );
  }

  // Generate IDs
  const requestId = `chatcmpl-${nanoid()}`;
  const conversationId = request.conversation_id ?? nanoid();
  const parentMessageId = request.parent_message_id ?? null;
  const created = Math.floor(Date.now() / 1000);

  const context = {
    created,
    requestId,
    model: agentId,
  };

  logger.debug(
    `[OpenAI API] Request ${requestId} started for agent ${agentId}, stream: ${request.stream}`,
  );

  // Set up abort controller
  const abortController = new AbortController();

  // Handle client disconnect
  req.on('close', () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
      logger.debug('[OpenAI API] Client disconnected, aborting');
    }
  });

  try {
    // Build allowed providers set
    const allowedProviders = new Set(
      appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders,
    );

    // Create tool loader
    const loadTools = createToolLoader(abortController.signal);

    // Initialize the agent first to check for disableStreaming
    const endpointOption = {
      endpoint: agent.provider,
      model_parameters: agent.model_parameters ?? {},
    };

    const primaryConfig = await initializeAgent(
      {
        req,
        res,
        loadTools,
        requestFiles: [],
        conversationId,
        parentMessageId,
        agent,
        endpointOption,
        allowedProviders,
        isInitialAgent: true,
      },
      {
        getConvoFiles: db.getConvoFiles,
        getFiles: db.getFiles,
        getUserKey: db.getUserKey,
        getMessages: db.getMessages,
        updateFilesUsage: db.updateFilesUsage,
        getUserKeyValues: db.getUserKeyValues,
        getUserCodeFiles: db.getUserCodeFiles,
        getToolFilesByIds: db.getToolFilesByIds,
        getCodeGeneratedFiles: db.getCodeGeneratedFiles,
      },
    );

    // Determine if streaming is enabled (check both request and agent config)
    const streamingDisabled = !!primaryConfig.model_parameters?.disableStreaming;
    const isStreaming = request.stream === true && !streamingDisabled;

    // Create tracker for streaming or aggregator for non-streaming
    const tracker = isStreaming ? createOpenAIStreamTracker() : null;
    const aggregator = isStreaming ? null : createOpenAIContentAggregator();

    // Set up response for streaming
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

    // Create handler config for OpenAI streaming (only used when streaming)
    const handlerConfig = isStreaming
      ? {
          res,
          context,
          tracker,
        }
      : null;

    const collectedUsage = [];
    /** @type {Promise<import('librechat-data-provider').TAttachment | null>[]} */
    const artifactPromises = [];

    const toolEndCallback = createToolEndCallback({ req, res, artifactPromises, streamId: null });

    const toolExecuteOptions = {
      loadTools: async (toolNames) => {
        return loadToolsForExecution({
          req,
          res,
          agent,
          toolNames,
          signal: abortController.signal,
          toolRegistry: primaryConfig.toolRegistry,
          userMCPAuthMap: primaryConfig.userMCPAuthMap,
          tool_resources: primaryConfig.tool_resources,
        });
      },
      toolEndCallback,
    };

    const openaiMessages = convertMessages(request.messages);

    const toolSet = buildToolSet(primaryConfig);
    const { messages: formattedMessages, indexTokenCountMap } = formatAgentMessages(
      openaiMessages,
      {},
      toolSet,
    );

    /**
     * Create a simple handler that processes data
     */
    const createHandler = (processor) => ({
      handle: (_event, data) => {
        if (processor) {
          processor(data);
        }
      },
    });

    /**
     * Stream text content in OpenAI format
     */
    const streamText = (text) => {
      if (!text) {
        return;
      }
      if (isStreaming) {
        tracker.addText();
        writeSSE(res, createChunk(context, { content: text }));
      } else {
        aggregator.addText(text);
      }
    };

    /**
     * Stream reasoning content in OpenAI format (OpenRouter convention)
     */
    const streamReasoning = (text) => {
      if (!text) {
        return;
      }
      if (isStreaming) {
        tracker.addReasoning();
        writeSSE(res, createChunk(context, { reasoning: text }));
      } else {
        aggregator.addReasoning(text);
      }
    };

    // Event handlers for OpenAI-compatible streaming
    const handlers = {
      // Text content streaming
      on_message_delta: createHandler((data) => {
        const content = data?.delta?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              streamText(part.text);
            }
          }
        }
      }),

      // Reasoning/thinking content streaming
      on_reasoning_delta: createHandler((data) => {
        const content = data?.delta?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const text = part.think || part.text;
            if (text) {
              streamReasoning(text);
            }
          }
        }
      }),

      // Tool call initiation - streams id and name (from on_run_step)
      on_run_step: createHandler((data) => {
        const stepDetails = data?.stepDetails;
        if (stepDetails?.type === 'tool_calls' && stepDetails.tool_calls) {
          for (const tc of stepDetails.tool_calls) {
            const toolIndex = data.index ?? 0;
            const toolId = tc.id ?? '';
            const toolName = tc.name ?? '';
            const toolCall = {
              id: toolId,
              type: 'function',
              function: { name: toolName, arguments: '' },
            };

            // Track tool call in tracker or aggregator
            if (isStreaming) {
              if (!tracker.toolCalls.has(toolIndex)) {
                tracker.toolCalls.set(toolIndex, toolCall);
              }
              // Stream initial tool call chunk (like OpenAI does)
              writeSSE(
                res,
                createChunk(context, {
                  tool_calls: [{ index: toolIndex, ...toolCall }],
                }),
              );
            } else {
              if (!aggregator.toolCalls.has(toolIndex)) {
                aggregator.toolCalls.set(toolIndex, toolCall);
              }
            }
          }
        }
      }),

      // Tool call argument streaming (from on_run_step_delta)
      on_run_step_delta: createHandler((data) => {
        const delta = data?.delta;
        if (delta?.type === 'tool_calls' && delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const args = tc.args ?? '';
            if (!args) {
              continue;
            }

            const toolIndex = tc.index ?? 0;

            // Update tool call arguments
            const targetMap = isStreaming ? tracker.toolCalls : aggregator.toolCalls;
            const tracked = targetMap.get(toolIndex);
            if (tracked) {
              tracked.function.arguments += args;
            }

            // Stream argument delta (only for streaming)
            if (isStreaming) {
              writeSSE(
                res,
                createChunk(context, {
                  tool_calls: [
                    {
                      index: toolIndex,
                      function: { arguments: args },
                    },
                  ],
                }),
              );
            }
          }
        }
      }),

      // Usage tracking
      on_chat_model_end: createHandler((data) => {
        const usage = data?.output?.usage_metadata;
        if (usage) {
          collectedUsage.push(usage);
          const target = isStreaming ? tracker : aggregator;
          target.usage.promptTokens += usage.input_tokens ?? 0;
          target.usage.completionTokens += usage.output_tokens ?? 0;
        }
      }),
      on_run_step_completed: createHandler(),
      // Use proper ToolEndHandler for processing artifacts (images, file citations, code output)
      on_tool_end: new ToolEndHandler(toolEndCallback, logger),
      on_chain_stream: createHandler(),
      on_chain_end: createHandler(),
      on_agent_update: createHandler(),
      on_custom_event: createHandler(),
      // Event-driven tool execution handler
      on_tool_execute: createToolExecuteHandler(toolExecuteOptions),
    };

    // Create and run the agent
    const userId = req.user?.id ?? 'api-user';

    // Extract userMCPAuthMap from primaryConfig (needed for MCP tool connections)
    const userMCPAuthMap = primaryConfig.userMCPAuthMap;

    const run = await createRun({
      agents: [primaryConfig],
      messages: formattedMessages,
      indexTokenCountMap,
      runId: requestId,
      signal: abortController.signal,
      customHandlers: handlers,
      requestBody: {
        messageId: requestId,
        conversationId,
      },
      user: { id: userId },
    });

    if (!run) {
      throw new Error('Failed to create agent run');
    }

    // Process the stream
    const config = {
      runName: 'AgentRun',
      configurable: {
        thread_id: conversationId,
        user_id: userId,
        user: createSafeUser(req.user),
        ...(userMCPAuthMap != null && { userMCPAuthMap }),
      },
      signal: abortController.signal,
      streamMode: 'values',
      version: 'v2',
    };

    await run.processStream({ messages: formattedMessages }, config, {
      callbacks: {
        [Callback.TOOL_ERROR]: (graph, error, toolId) => {
          logger.error(`[OpenAI API] Tool Error "${toolId}"`, error);
        },
      },
    });

    // Record token usage against balance
    const balanceConfig = getBalanceConfig(appConfig);
    const transactionsConfig = getTransactionsConfig(appConfig);
    recordCollectedUsage(
      { spendTokens: db.spendTokens, spendStructuredTokens: db.spendStructuredTokens },
      {
        user: userId,
        conversationId,
        collectedUsage,
        context: 'message',
        balance: balanceConfig,
        transactions: transactionsConfig,
        model: primaryConfig.model || agent.model_parameters?.model,
      },
    ).catch((err) => {
      logger.error('[OpenAI API] Error recording usage:', err);
    });

    // Finalize response
    const duration = Date.now() - requestStartTime;
    if (isStreaming) {
      sendFinalChunk(handlerConfig);
      res.end();
      logger.debug(`[OpenAI API] Request ${requestId} completed in ${duration}ms (streaming)`);

      // Wait for artifact processing after response ends (non-blocking)
      if (artifactPromises.length > 0) {
        Promise.all(artifactPromises).catch((artifactError) => {
          logger.warn('[OpenAI API] Error processing artifacts:', artifactError);
        });
      }
    } else {
      // For non-streaming, wait for artifacts before sending response
      if (artifactPromises.length > 0) {
        try {
          await Promise.all(artifactPromises);
        } catch (artifactError) {
          logger.warn('[OpenAI API] Error processing artifacts:', artifactError);
        }
      }

      // Build usage from aggregated data
      const usage = {
        prompt_tokens: aggregator.usage.promptTokens,
        completion_tokens: aggregator.usage.completionTokens,
        total_tokens: aggregator.usage.promptTokens + aggregator.usage.completionTokens,
      };

      if (aggregator.usage.reasoningTokens > 0) {
        usage.completion_tokens_details = {
          reasoning_tokens: aggregator.usage.reasoningTokens,
        };
      }

      const response = buildNonStreamingResponse(
        context,
        aggregator.getText(),
        aggregator.getReasoning(),
        aggregator.toolCalls,
        usage,
      );
      res.json(response);
      logger.debug(`[OpenAI API] Request ${requestId} completed in ${duration}ms (non-streaming)`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    logger.error('[OpenAI API] Error:', error);

    // Check if we already started streaming (headers sent)
    if (res.headersSent) {
      // Headers already sent, send error in stream
      const errorChunk = createChunk(context, { content: `\n\nError: ${errorMessage}` }, 'stop');
      writeSSE(res, errorChunk);
      writeSSE(res, '[DONE]');
      res.end();
    } else {
      // Forward upstream provider status codes (e.g., Anthropic 400s) instead of masking as 500
      const statusCode =
        typeof error?.status === 'number' && error.status >= 400 && error.status < 600
          ? error.status
          : 500;
      const errorType =
        statusCode >= 400 && statusCode < 500 ? 'invalid_request_error' : 'server_error';
      sendErrorResponse(res, statusCode, errorMessage, errorType);
    }
  }
};

/**
 * List available agents as models (filtered by remote access permissions)
 *
 * GET /v1/models
 */
const ListModelsController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return sendErrorResponse(res, 401, 'Authentication required', 'auth_error');
    }

    // Find agents the user has remote access to (VIEW permission on REMOTE_AGENT)
    const accessibleAgentIds = await findAccessibleResources({
      userId,
      role: userRole,
      resourceType: ResourceType.REMOTE_AGENT,
      requiredPermissions: PermissionBits.VIEW,
    });

    // Get the accessible agents
    let agents = [];
    if (accessibleAgentIds.length > 0) {
      agents = await db.getAgents({ _id: { $in: accessibleAgentIds } });
    }

    const models = agents.map((agent) => ({
      id: agent.id,
      object: 'model',
      created: Math.floor(new Date(agent.createdAt || Date.now()).getTime() / 1000),
      owned_by: 'librechat',
      permission: [],
      root: agent.id,
      parent: null,
      // LibreChat extensions
      name: agent.name,
      description: agent.description,
      provider: agent.provider,
    }));

    res.json({
      object: 'list',
      data: models,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list models';
    logger.error('[OpenAI API] Error listing models:', error);
    sendErrorResponse(res, 500, errorMessage, 'server_error');
  }
};

/**
 * Get a specific model/agent (with remote access permission check)
 *
 * GET /v1/models/:model
 */
const GetModelController = async (req, res) => {
  try {
    const { model } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return sendErrorResponse(res, 401, 'Authentication required', 'auth_error');
    }

    const agent = await db.getAgent({ id: model });

    if (!agent) {
      return sendErrorResponse(
        res,
        404,
        `Model not found: ${model}`,
        'invalid_request_error',
        'model_not_found',
      );
    }

    // Check if user has remote access to this agent
    const accessibleAgentIds = await findAccessibleResources({
      userId,
      role: userRole,
      resourceType: ResourceType.REMOTE_AGENT,
      requiredPermissions: PermissionBits.VIEW,
    });

    const hasAccess = accessibleAgentIds.some((id) => id.toString() === agent._id.toString());

    if (!hasAccess) {
      return sendErrorResponse(
        res,
        403,
        `No remote access to model: ${model}`,
        'permission_error',
        'access_denied',
      );
    }

    res.json({
      id: agent.id,
      object: 'model',
      created: Math.floor(new Date(agent.createdAt || Date.now()).getTime() / 1000),
      owned_by: 'librechat',
      permission: [],
      root: agent.id,
      parent: null,
      // LibreChat extensions
      name: agent.name,
      description: agent.description,
      provider: agent.provider,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get model';
    logger.error('[OpenAI API] Error getting model:', error);
    sendErrorResponse(res, 500, errorMessage, 'server_error');
  }
};

module.exports = {
  OpenAIChatCompletionController,
  ListModelsController,
  GetModelController,
};
