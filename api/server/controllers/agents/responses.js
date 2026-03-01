const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Callback, ToolEndHandler, formatAgentMessages } = require('@librechat/agents');
const { EModelEndpoint, ResourceType, PermissionBits } = require('librechat-data-provider');
const {
  createRun,
  buildToolSet,
  createSafeUser,
  initializeAgent,
  getBalanceConfig,
  recordCollectedUsage,
  getTransactionsConfig,
  createToolExecuteHandler,
  // Responses API
  writeDone,
  buildResponse,
  generateResponseId,
  isValidationFailure,
  emitResponseCreated,
  createResponseContext,
  createResponseTracker,
  setupStreamingResponse,
  emitResponseInProgress,
  convertInputToMessages,
  validateResponseRequest,
  buildAggregatedResponse,
  createResponseAggregator,
  sendResponsesErrorResponse,
  createResponsesEventHandlers,
  createAggregatorEventHandlers,
} = require('@librechat/api');
const {
  createResponsesToolEndCallback,
  createToolEndCallback,
} = require('~/server/controllers/agents/callbacks');
const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const db = require('~/models');

/** @type {import('@librechat/api').AppConfig | null} */
let appConfig = null;

/**
 * Set the app config for the controller
 * @param {import('@librechat/api').AppConfig} config
 */
function setAppConfig(config) {
  appConfig = config;
}

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
        streamId: null,
      });
    } catch (error) {
      logger.error('Error loading tools for agent ' + agentId, error);
    }
  };
}

/**
 * Convert Open Responses input items to internal messages
 * @param {import('@librechat/api').InputItem[]} input
 * @returns {Array} Internal messages
 */
function convertToInternalMessages(input) {
  return convertInputToMessages(input);
}

/**
 * Load messages from a previous response/conversation
 * @param {string} conversationId - The conversation/response ID
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Messages from the conversation
 */
async function loadPreviousMessages(conversationId, userId) {
  try {
    const messages = await db.getMessages({ conversationId, user: userId });
    if (!messages || messages.length === 0) {
      return [];
    }

    // Convert stored messages to internal format
    return messages.map((msg) => {
      const internalMsg = {
        role: msg.isCreatedByUser ? 'user' : 'assistant',
        content: '',
        messageId: msg.messageId,
      };

      // Handle content - could be string or array
      if (typeof msg.text === 'string') {
        internalMsg.content = msg.text;
      } else if (Array.isArray(msg.content)) {
        // Handle content parts
        internalMsg.content = msg.content;
      } else if (msg.text) {
        internalMsg.content = String(msg.text);
      }

      return internalMsg;
    });
  } catch (error) {
    logger.error('[Responses API] Error loading previous messages:', error);
    return [];
  }
}

/**
 * Save input messages to database
 * @param {import('express').Request} req
 * @param {string} conversationId
 * @param {Array} inputMessages - Internal format messages
 * @param {string} agentId
 * @returns {Promise<void>}
 */
async function saveInputMessages(req, conversationId, inputMessages, agentId) {
  for (const msg of inputMessages) {
    if (msg.role === 'user') {
      await db.saveMessage(
        req,
        {
          messageId: msg.messageId || nanoid(),
          conversationId,
          parentMessageId: null,
          isCreatedByUser: true,
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          sender: 'User',
          endpoint: EModelEndpoint.agents,
          model: agentId,
        },
        { context: 'Responses API - save user input' },
      );
    }
  }
}

/**
 * Save response output to database
 * @param {import('express').Request} req
 * @param {string} conversationId
 * @param {string} responseId
 * @param {import('@librechat/api').Response} response
 * @param {string} agentId
 * @returns {Promise<void>}
 */
async function saveResponseOutput(req, conversationId, responseId, response, agentId) {
  // Extract text content from output items
  let responseText = '';
  for (const item of response.output) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          responseText += part.text;
        }
      }
    }
  }

  // Save the assistant message
  await db.saveMessage(
    req,
    {
      messageId: responseId,
      conversationId,
      parentMessageId: null,
      isCreatedByUser: false,
      text: responseText,
      sender: 'Agent',
      endpoint: EModelEndpoint.agents,
      model: agentId,
      finish_reason: response.status === 'completed' ? 'stop' : response.status,
      tokenCount: response.usage?.output_tokens,
    },
    { context: 'Responses API - save assistant response' },
  );
}

/**
 * Save or update conversation
 * @param {import('express').Request} req
 * @param {string} conversationId
 * @param {string} agentId
 * @param {object} agent
 * @returns {Promise<void>}
 */
async function saveConversation(req, conversationId, agentId, agent) {
  await db.saveConvo(
    {
      userId: req?.user?.id,
      isTemporary: req?.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    },
    {
      conversationId,
      endpoint: EModelEndpoint.agents,
      agentId,
      title: agent?.name || 'Open Responses Conversation',
      model: agent?.model,
    },
    { context: 'Responses API - save conversation' },
  );
}

/**
 * Convert stored messages to Open Responses output format
 * @param {Array} messages - Stored messages
 * @returns {Array} Output items
 */
function convertMessagesToOutputItems(messages) {
  const output = [];

  for (const msg of messages) {
    if (!msg.isCreatedByUser) {
      output.push({
        type: 'message',
        id: msg.messageId,
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: msg.text || '',
            annotations: [],
          },
        ],
      });
    }
  }

  return output;
}

/**
 * Create Response - POST /v1/responses
 *
 * Creates a model response following the Open Responses API specification.
 * Supports both streaming and non-streaming responses.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createResponse = async (req, res) => {
  const requestStartTime = Date.now();

  // Validate request
  const validation = validateResponseRequest(req.body);
  if (isValidationFailure(validation)) {
    return sendResponsesErrorResponse(res, 400, validation.error);
  }

  const request = validation.request;
  const agentId = request.model;
  const isStreaming = request.stream === true;

  // Look up the agent
  const agent = await db.getAgent({ id: agentId });
  if (!agent) {
    return sendResponsesErrorResponse(
      res,
      404,
      `Agent not found: ${agentId}`,
      'not_found',
      'model_not_found',
    );
  }

  // Generate IDs
  const responseId = generateResponseId();
  const conversationId = request.previous_response_id ?? uuidv4();
  const parentMessageId = null;

  // Create response context
  const context = createResponseContext(request, responseId);

  logger.debug(
    `[Responses API] Request ${responseId} started for agent ${agentId}, stream: ${isStreaming}`,
  );

  // Set up abort controller
  const abortController = new AbortController();

  // Handle client disconnect
  req.on('close', () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
      logger.debug('[Responses API] Client disconnected, aborting');
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
    const actuallyStreaming = isStreaming && !streamingDisabled;

    // Load previous messages if previous_response_id is provided
    let previousMessages = [];
    if (request.previous_response_id) {
      const userId = req.user?.id ?? 'api-user';
      previousMessages = await loadPreviousMessages(request.previous_response_id, userId);
    }

    // Convert input to internal messages
    const inputMessages = convertToInternalMessages(
      typeof request.input === 'string' ? request.input : request.input,
    );

    // Merge previous messages with new input
    const allMessages = [...previousMessages, ...inputMessages];

    const toolSet = buildToolSet(primaryConfig);
    const { messages: formattedMessages, indexTokenCountMap } = formatAgentMessages(
      allMessages,
      {},
      toolSet,
    );

    // Create tracker for streaming or aggregator for non-streaming
    const tracker = actuallyStreaming ? createResponseTracker() : null;
    const aggregator = actuallyStreaming ? null : createResponseAggregator();

    // Set up response for streaming
    if (actuallyStreaming) {
      setupStreamingResponse(res);

      // Create handler config
      const handlerConfig = {
        res,
        context,
        tracker,
      };

      // Emit response.created then response.in_progress per Open Responses spec
      emitResponseCreated(handlerConfig);
      emitResponseInProgress(handlerConfig);

      // Create event handlers
      const { handlers: responsesHandlers, finalizeStream } =
        createResponsesEventHandlers(handlerConfig);

      // Collect usage for balance tracking
      const collectedUsage = [];

      // Artifact promises for processing tool outputs
      /** @type {Promise<import('librechat-data-provider').TAttachment | null>[]} */
      const artifactPromises = [];
      // Use Responses API-specific callback that emits librechat:attachment events
      const toolEndCallback = createResponsesToolEndCallback({
        req,
        res,
        tracker,
        artifactPromises,
      });

      // Create tool execute options for event-driven tool execution
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

      // Combine handlers
      const handlers = {
        on_message_delta: responsesHandlers.on_message_delta,
        on_reasoning_delta: responsesHandlers.on_reasoning_delta,
        on_run_step: responsesHandlers.on_run_step,
        on_run_step_delta: responsesHandlers.on_run_step_delta,
        on_chat_model_end: {
          handle: (event, data) => {
            responsesHandlers.on_chat_model_end.handle(event, data);
            const usage = data?.output?.usage_metadata;
            if (usage) {
              collectedUsage.push(usage);
            }
          },
        },
        on_tool_end: new ToolEndHandler(toolEndCallback, logger),
        on_run_step_completed: { handle: () => {} },
        on_chain_stream: { handle: () => {} },
        on_chain_end: { handle: () => {} },
        on_agent_update: { handle: () => {} },
        on_custom_event: { handle: () => {} },
        on_tool_execute: createToolExecuteHandler(toolExecuteOptions),
      };

      // Create and run the agent
      const userId = req.user?.id ?? 'api-user';
      const userMCPAuthMap = primaryConfig.userMCPAuthMap;

      const run = await createRun({
        agents: [primaryConfig],
        messages: formattedMessages,
        indexTokenCountMap,
        runId: responseId,
        signal: abortController.signal,
        customHandlers: handlers,
        requestBody: {
          messageId: responseId,
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
            logger.error(`[Responses API] Tool Error "${toolId}"`, error);
          },
        },
      });

      // Record token usage against balance
      const balanceConfig = getBalanceConfig(req.config);
      const transactionsConfig = getTransactionsConfig(req.config);
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
        logger.error('[Responses API] Error recording usage:', err);
      });

      // Finalize the stream
      finalizeStream();
      res.end();

      const duration = Date.now() - requestStartTime;
      logger.debug(`[Responses API] Request ${responseId} completed in ${duration}ms (streaming)`);

      // Save to database if store: true
      if (request.store === true) {
        try {
          // Save conversation
          await saveConversation(req, conversationId, agentId, agent);

          // Save input messages
          await saveInputMessages(req, conversationId, inputMessages, agentId);

          // Build response for saving (use tracker with buildResponse for streaming)
          const finalResponse = buildResponse(context, tracker, 'completed');
          await saveResponseOutput(req, conversationId, responseId, finalResponse, agentId);

          logger.debug(
            `[Responses API] Stored response ${responseId} in conversation ${conversationId}`,
          );
        } catch (saveError) {
          logger.error('[Responses API] Error saving response:', saveError);
          // Don't fail the request if saving fails
        }
      }

      // Wait for artifact processing after response ends (non-blocking)
      if (artifactPromises.length > 0) {
        Promise.all(artifactPromises).catch((artifactError) => {
          logger.warn('[Responses API] Error processing artifacts:', artifactError);
        });
      }
    } else {
      const aggregatorHandlers = createAggregatorEventHandlers(aggregator);

      // Collect usage for balance tracking
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

      const handlers = {
        on_message_delta: aggregatorHandlers.on_message_delta,
        on_reasoning_delta: aggregatorHandlers.on_reasoning_delta,
        on_run_step: aggregatorHandlers.on_run_step,
        on_run_step_delta: aggregatorHandlers.on_run_step_delta,
        on_chat_model_end: {
          handle: (event, data) => {
            aggregatorHandlers.on_chat_model_end.handle(event, data);
            const usage = data?.output?.usage_metadata;
            if (usage) {
              collectedUsage.push(usage);
            }
          },
        },
        on_tool_end: new ToolEndHandler(toolEndCallback, logger),
        on_run_step_completed: { handle: () => {} },
        on_chain_stream: { handle: () => {} },
        on_chain_end: { handle: () => {} },
        on_agent_update: { handle: () => {} },
        on_custom_event: { handle: () => {} },
        on_tool_execute: createToolExecuteHandler(toolExecuteOptions),
      };

      const userId = req.user?.id ?? 'api-user';
      const userMCPAuthMap = primaryConfig.userMCPAuthMap;

      const run = await createRun({
        agents: [primaryConfig],
        messages: formattedMessages,
        indexTokenCountMap,
        runId: responseId,
        signal: abortController.signal,
        customHandlers: handlers,
        requestBody: {
          messageId: responseId,
          conversationId,
        },
        user: { id: userId },
      });

      if (!run) {
        throw new Error('Failed to create agent run');
      }

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
            logger.error(`[Responses API] Tool Error "${toolId}"`, error);
          },
        },
      });

      // Record token usage against balance
      const balanceConfig = getBalanceConfig(req.config);
      const transactionsConfig = getTransactionsConfig(req.config);
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
        logger.error('[Responses API] Error recording usage:', err);
      });

      if (artifactPromises.length > 0) {
        try {
          await Promise.all(artifactPromises);
        } catch (artifactError) {
          logger.warn('[Responses API] Error processing artifacts:', artifactError);
        }
      }

      const response = buildAggregatedResponse(context, aggregator);

      if (request.store === true) {
        try {
          await saveConversation(req, conversationId, agentId, agent);

          await saveInputMessages(req, conversationId, inputMessages, agentId);

          await saveResponseOutput(req, conversationId, responseId, response, agentId);

          logger.debug(
            `[Responses API] Stored response ${responseId} in conversation ${conversationId}`,
          );
        } catch (saveError) {
          logger.error('[Responses API] Error saving response:', saveError);
          // Don't fail the request if saving fails
        }
      }

      res.json(response);

      const duration = Date.now() - requestStartTime;
      logger.debug(
        `[Responses API] Request ${responseId} completed in ${duration}ms (non-streaming)`,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    logger.error('[Responses API] Error:', error);

    // Check if we already started streaming (headers sent)
    if (res.headersSent) {
      // Headers already sent, write error event and close
      writeDone(res);
      res.end();
    } else {
      // Forward upstream provider status codes (e.g., Anthropic 400s) instead of masking as 500
      const statusCode =
        typeof error?.status === 'number' && error.status >= 400 && error.status < 600
          ? error.status
          : 500;
      const errorType = statusCode >= 400 && statusCode < 500 ? 'invalid_request' : 'server_error';
      sendResponsesErrorResponse(res, statusCode, errorMessage, errorType);
    }
  }
};

/**
 * List available agents as models - GET /v1/models (also works with /v1/responses/models)
 *
 * Returns a list of available agents the user has remote access to.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listModels = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return sendResponsesErrorResponse(res, 401, 'Authentication required', 'auth_error');
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

    // Convert to models format
    const models = agents.map((agent) => ({
      id: agent.id,
      object: 'model',
      created: Math.floor(new Date(agent.createdAt).getTime() / 1000),
      owned_by: agent.author ?? 'librechat',
      // Additional metadata
      name: agent.name,
      description: agent.description,
      provider: agent.provider,
    }));

    res.json({
      object: 'list',
      data: models,
    });
  } catch (error) {
    logger.error('[Responses API] Error listing models:', error);
    sendResponsesErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to list models',
      'server_error',
    );
  }
};

/**
 * Get Response - GET /v1/responses/:id
 *
 * Retrieves a stored response by its ID.
 * The response ID maps to a conversationId in LibreChat's storage.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getResponse = async (req, res) => {
  try {
    const responseId = req.params.id;
    const userId = req.user?.id;

    if (!responseId) {
      return sendResponsesErrorResponse(res, 400, 'Response ID is required');
    }

    // The responseId could be either the response ID or the conversation ID
    // Try to find a conversation with this ID
    const conversation = await db.getConvo(userId, responseId);

    if (!conversation) {
      return sendResponsesErrorResponse(
        res,
        404,
        `Response not found: ${responseId}`,
        'not_found',
        'response_not_found',
      );
    }

    // Load messages for this conversation
    const messages = await db.getMessages({ conversationId: responseId, user: userId });

    if (!messages || messages.length === 0) {
      return sendResponsesErrorResponse(
        res,
        404,
        `No messages found for response: ${responseId}`,
        'not_found',
        'response_not_found',
      );
    }

    // Convert messages to Open Responses output format
    const output = convertMessagesToOutputItems(messages);

    // Find the last assistant message for usage info
    const lastAssistantMessage = messages.filter((m) => !m.isCreatedByUser).pop();

    // Build the response object
    const response = {
      id: responseId,
      object: 'response',
      created_at: Math.floor(new Date(conversation.createdAt || Date.now()).getTime() / 1000),
      completed_at: Math.floor(new Date(conversation.updatedAt || Date.now()).getTime() / 1000),
      status: 'completed',
      incomplete_details: null,
      model: conversation.agentId || conversation.model || 'unknown',
      previous_response_id: null,
      instructions: null,
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
      top_logprobs: null,
      reasoning: null,
      user: userId,
      usage: lastAssistantMessage?.tokenCount
        ? {
            input_tokens: 0,
            output_tokens: lastAssistantMessage.tokenCount,
            total_tokens: lastAssistantMessage.tokenCount,
          }
        : null,
      max_output_tokens: null,
      max_tool_calls: null,
      store: true,
      background: false,
      service_tier: 'default',
      metadata: {},
      safety_identifier: null,
      prompt_cache_key: null,
    };

    res.json(response);
  } catch (error) {
    logger.error('[Responses API] Error getting response:', error);
    sendResponsesErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to get response',
      'server_error',
    );
  }
};

module.exports = {
  createResponse,
  getResponse,
  listModels,
  setAppConfig,
};
