const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  Callback,
  ToolEndHandler,
  formatAgentMessages,
  ChatModelStreamHandler,
} = require('@librechat/agents');
const {
  createRun,
  createSafeUser,
  initializeAgent,
  // Responses API
  validateResponseRequest,
  isValidationFailure,
  convertInputToMessages,
  sendResponsesErrorResponse,
  generateResponseId,
  createResponseContext,
  setupStreamingResponse,
  createResponseTracker,
  createResponsesEventHandlers,
  emitResponseInProgress,
  writeDone,
  createResponseAggregator,
  buildAggregatedResponse,
  createAggregatorEventHandlers,
} = require('@librechat/api');
const { createToolEndCallback } = require('~/server/controllers/agents/callbacks');
const { loadAgentTools } = require('~/server/services/ToolService');
const { getConvoFiles } = require('~/models/Conversation');
const { getAgent, getAgents } = require('~/models/Agent');
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
 */
function createToolLoader(signal) {
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
 * Create Response - POST /v1/responses
 *
 * Creates a model response following the Open Responses API specification.
 * Supports both streaming and non-streaming responses.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createResponse = async (req, res) => {
  // Validate request
  const validation = validateResponseRequest(req.body);
  if (isValidationFailure(validation)) {
    return sendResponsesErrorResponse(res, 400, validation.error);
  }

  const request = validation.request;
  const agentId = request.model;
  const isStreaming = request.stream === true;

  // Look up the agent
  const agent = await getAgent({ id: agentId });
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
  const conversationId = request.previous_response_id ?? nanoid();
  const parentMessageId = null;
  const createdAt = Math.floor(Date.now() / 1000);

  // Create response context
  const context = createResponseContext(request, responseId);

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
        getConvoFiles,
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

    // Format for agent
    const toolSet = new Set((primaryConfig.tools ?? []).map((tool) => tool && tool.name));
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

      // Emit response.in_progress
      emitResponseInProgress(handlerConfig);

      // Create event handlers
      const { handlers: responsesHandlers, finalizeStream } =
        createResponsesEventHandlers(handlerConfig);

      // Built-in handler for processing raw model stream chunks
      const chatModelStreamHandler = new ChatModelStreamHandler();

      // Artifact promises for processing tool outputs
      /** @type {Promise<import('librechat-data-provider').TAttachment | null>[]} */
      const artifactPromises = [];
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises, streamId: null });

      // Combine handlers
      const handlers = {
        on_chat_model_stream: {
          handle: async (event, data, metadata, graph) => {
            await chatModelStreamHandler.handle(event, data, metadata, graph);
          },
        },
        on_message_delta: responsesHandlers.on_message_delta,
        on_reasoning_delta: responsesHandlers.on_reasoning_delta,
        on_run_step: responsesHandlers.on_run_step,
        on_run_step_delta: responsesHandlers.on_run_step_delta,
        on_chat_model_end: responsesHandlers.on_chat_model_end,
        on_tool_end: new ToolEndHandler(toolEndCallback, logger),
        on_run_step_completed: { handle: () => {} },
        on_chain_stream: { handle: () => {} },
        on_chain_end: { handle: () => {} },
        on_agent_update: { handle: () => {} },
        on_custom_event: { handle: () => {} },
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

      // Finalize the stream
      finalizeStream();
      res.end();

      // Wait for artifact processing after response ends (non-blocking)
      if (artifactPromises.length > 0) {
        Promise.all(artifactPromises).catch((artifactError) => {
          logger.warn('[Responses API] Error processing artifacts:', artifactError);
        });
      }
    } else {
      // Non-streaming response
      const aggregatorHandlers = createAggregatorEventHandlers(aggregator);

      // Built-in handler for processing raw model stream chunks
      const chatModelStreamHandler = new ChatModelStreamHandler();

      // Artifact promises for processing tool outputs
      /** @type {Promise<import('librechat-data-provider').TAttachment | null>[]} */
      const artifactPromises = [];
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises, streamId: null });

      // Combine handlers
      const handlers = {
        on_chat_model_stream: {
          handle: async (event, data, metadata, graph) => {
            await chatModelStreamHandler.handle(event, data, metadata, graph);
          },
        },
        on_message_delta: aggregatorHandlers.on_message_delta,
        on_reasoning_delta: aggregatorHandlers.on_reasoning_delta,
        on_run_step: aggregatorHandlers.on_run_step,
        on_run_step_delta: aggregatorHandlers.on_run_step_delta,
        on_chat_model_end: aggregatorHandlers.on_chat_model_end,
        on_tool_end: new ToolEndHandler(toolEndCallback, logger),
        on_run_step_completed: { handle: () => {} },
        on_chain_stream: { handle: () => {} },
        on_chain_end: { handle: () => {} },
        on_agent_update: { handle: () => {} },
        on_custom_event: { handle: () => {} },
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

      // Wait for artifacts before sending response
      if (artifactPromises.length > 0) {
        try {
          await Promise.all(artifactPromises);
        } catch (artifactError) {
          logger.warn('[Responses API] Error processing artifacts:', artifactError);
        }
      }

      // Build and send the response
      const response = buildAggregatedResponse(context, aggregator);
      res.json(response);
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
      sendResponsesErrorResponse(res, 500, errorMessage, 'server_error');
    }
  }
};

/**
 * List available agents as models - GET /v1/models (also works with /v1/responses/models)
 *
 * Returns a list of available agents in a format similar to OpenAI's models endpoint.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listModels = async (req, res) => {
  try {
    // Get the user from request (for filtering by access)
    const userId = req.user?.id;

    // Fetch all agents (or filter by user access in future)
    const agents = await getAgents({});

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

module.exports = {
  createResponse,
  listModels,
  setAppConfig,
};
