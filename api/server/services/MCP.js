const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { Time, CacheKeys, StepTypes } = require('librechat-data-provider');
const { sendEvent, normalizeServerName, MCPOAuthHandler } = require('@librechat/api');
const { Constants: AgentConstants, Providers, GraphEvents } = require('@librechat/agents');
const {
  Constants,
  ContentTypes,
  isAssistantsEndpoint,
  convertJsonSchemaToZod,
} = require('librechat-data-provider');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { findToken, createToken, updateToken } = require('~/models');
const { getCachedTools } = require('./Config');
const { getLogStores } = require('~/cache');

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 * @param {string} params.loginFlowId - The ID of the login flow.
 * @param {FlowStateManager<any>} params.flowManager - The flow manager instance.
 */
function createOAuthStart({ res, stepId, toolCall, loginFlowId, flowManager, signal }) {
  /**
   * Creates a function to handle OAuth login requests.
   * @param {string} authURL - The URL to redirect the user for OAuth authentication.
   * @returns {Promise<boolean>} Returns true to indicate the event was sent successfully.
   */
  return async function (authURL) {
    /** @type {{ id: string; delta: AgentToolCallDelta }} */
    const data = {
      id: stepId,
      delta: {
        type: StepTypes.TOOL_CALLS,
        tool_calls: [{ ...toolCall, args: '' }],
        auth: authURL,
        expires_at: Date.now() + Time.TWO_MINUTES,
      },
    };
    /** Used to ensure the handler (use of `sendEvent`) is only invoked once */
    await flowManager.createFlowWithHandler(
      loginFlowId,
      'oauth_login',
      async () => {
        sendEvent(res, { event: GraphEvents.ON_RUN_STEP_DELTA, data });
        logger.debug('Sent OAuth login request to client');
        return true;
      },
      signal,
    );
  };
}

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 * @param {string} params.loginFlowId - The ID of the login flow.
 * @param {FlowStateManager<any>} params.flowManager - The flow manager instance.
 */
function createOAuthEnd({ res, stepId, toolCall }) {
  return async function () {
    /** @type {{ id: string; delta: AgentToolCallDelta }} */
    const data = {
      id: stepId,
      delta: {
        type: StepTypes.TOOL_CALLS,
        tool_calls: [{ ...toolCall }],
      },
    };
    sendEvent(res, { event: GraphEvents.ON_RUN_STEP_DELTA, data });
    logger.debug('Sent OAuth login success to client');
  };
}

/**
 * @param {object} params
 * @param {string} params.userId - The ID of the user.
 * @param {string} params.serverName - The name of the server.
 * @param {string} params.toolName - The name of the tool.
 * @param {FlowStateManager<any>} params.flowManager - The flow manager instance.
 */
function createAbortHandler({ userId, serverName, toolName, flowManager }) {
  return function () {
    logger.info(`[MCP][User: ${userId}][${serverName}][${toolName}] Tool call aborted`);
    const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);
    flowManager.failFlow(flowId, 'mcp_oauth', new Error('Tool call aborted'));
  };
}

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {ServerRequest} params.req - The Express request object, containing user/request info.
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @param {import('@librechat/agents').Providers | EModelEndpoint} params.provider - The provider for the tool.
 * @param {string} params.model - The model for the tool.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({ req, res, toolKey, provider: _provider }) {
  const availableTools = await getCachedTools({ includeGlobal: true });
  const toolDefinition = availableTools?.[toolKey]?.function;
  if (!toolDefinition) {
    logger.error(`Tool ${toolKey} not found in available tools`);
    return null;
  }
  /** @type {LCTool} */
  const { description, parameters } = toolDefinition;
  const isGoogle = _provider === Providers.VERTEXAI || _provider === Providers.GOOGLE;
  let schema = convertJsonSchemaToZod(parameters, {
    allowEmptyObject: !isGoogle,
    transformOneOfAnyOf: true,
  });

  if (!schema) {
    schema = z.object({ input: z.string().optional() });
  }

  const [toolName, serverName] = toolKey.split(Constants.mcp_delimiter);
  const normalizedToolKey = `${toolName}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`;

  if (!req.user?.id) {
    logger.error(
      `[MCP][${serverName}][${toolName}] User ID not found on request. Cannot create tool.`,
    );
    throw new Error(`User ID not found on request. Cannot create tool for ${toolKey}.`);
  }

  /** @type {(toolArguments: Object | string, config?: GraphRunnableConfig) => Promise<unknown>} */
  const _call = async (toolArguments, config) => {
    const userId = config?.configurable?.user?.id || config?.configurable?.user_id;
    /** @type {ReturnType<typeof createAbortHandler>} */
    let abortHandler = null;
    /** @type {AbortSignal} */
    let derivedSignal = null;

    try {
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = getFlowStateManager(flowsCache);
      derivedSignal = config?.signal ? AbortSignal.any([config.signal]) : undefined;
      const mcpManager = getMCPManager(userId);
      const provider = (config?.metadata?.provider || _provider)?.toLowerCase();

      const { args: _args, stepId, ...toolCall } = config.toolCall ?? {};
      const loginFlowId = `${serverName}:oauth_login:${config.metadata.thread_id}:${config.metadata.run_id}`;
      const oauthStart = createOAuthStart({
        res,
        stepId,
        toolCall,
        loginFlowId,
        flowManager,
        signal: derivedSignal,
      });
      const oauthEnd = createOAuthEnd({
        res,
        stepId,
        toolCall,
      });

      if (derivedSignal) {
        abortHandler = createAbortHandler({ userId, serverName, toolName, flowManager });
        derivedSignal.addEventListener('abort', abortHandler, { once: true });
      }

      const customUserVars =
        config?.configurable?.userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];

      // Extract conversation context for file URL generation
      const conversationId = config?.metadata?.thread_id || config?.metadata?.conversationId;

      console.log('[MCP Service - STEP 1] Starting conversation context extraction:', {
        conversationId,
        userId: config?.configurable?.user?.id,
        serverName,
        toolName,
        hasConversationId: !!conversationId
      });

      // Get current message files from the request (not all conversation files)
      // This ensures we only include files from the current message
      let messageFiles = [];

      // First, try to get files from the current request context
      const requestFiles = req?.body?.files || [];
      if (requestFiles.length > 0) {
        messageFiles = requestFiles.map(file => file.file_id).filter(Boolean);
        console.log('[MCP Service - STEP 2] Using files from current request:', {
          conversationId,
          userId: config?.configurable?.user?.id,
          fileCount: messageFiles.length,
          messageFiles,
          requestFiles: requestFiles.map(f => ({ file_id: f.file_id, filename: f.filename })),
          extractedFrom: 'currentRequest'
        });
      } else if (conversationId) {
        // Fallback: Get files from active context if no request files
        console.log('[MCP Service - STEP 2] No files in current request, checking active context...');
        const activeFileContextService = require('./Files/ActiveFileContextService');

        console.log('[MCP Service - STEP 3] Calling getActiveFiles...');
        const activeContext = activeFileContextService.getActiveFiles(conversationId, config?.configurable?.user?.id);

        console.log('[MCP Service - STEP 4] ActiveFileContextService response:', {
          hasActiveContext: !!activeContext,
          fileCount: activeContext?.files?.length || 0,
          files: activeContext?.files?.map(f => ({ file_id: f.file_id, filename: f.filename })) || []
        });

        if (activeContext && activeContext.files) {
          messageFiles = activeContext.files.map(file => file.file_id).filter(Boolean);
          console.log('[MCP Service - STEP 5] Extracted messageFiles from active context (fallback):', {
            conversationId,
            userId: config?.configurable?.user?.id,
            fileCount: messageFiles.length,
            messageFiles,
            extractedFrom: 'activeContextFallback'
          });
        } else {
          console.log('[MCP Service - STEP 5] No files found in active context:', {
            conversationId,
            userId: config?.configurable?.user?.id,
            activeContext: !!activeContext
          });
        }
      } else {
        console.log('[MCP Service - STEP 2] No conversationId available and no request files, skipping file extraction');
      }

      const conversationContext = {
        conversationId,
        messageFiles,
        mcpClientId: serverName,
        clientIP: req.ip || req.connection?.remoteAddress,
        userAgent: req.get?.('User-Agent'),
        requestId: req.headers?.['x-request-id'] || `mcp-${Date.now()}`
      };

      console.log('[MCP Service - STEP 6] Created conversation context:', {
        conversationId,
        messageFiles,
        messageFilesCount: messageFiles.length,
        mcpClientId: serverName,
        hasClientIP: !!conversationContext.clientIP,
        hasUserAgent: !!conversationContext.userAgent,
        requestId: conversationContext.requestId
      });

      console.log('[MCP Service - STEP 7] Full context for tool execution:', {
        conversationId,
        serverName,
        toolName,
        userId: config?.configurable?.user?.id,
        hasConversationContext: !!conversationId,
        messageFilesCount: messageFiles.length,
        messageFiles,
        configMetadata: config?.metadata,
        extractedFrom: {
          thread_id: config?.metadata?.thread_id,
          conversationId: config?.metadata?.conversationId,
          metadata_keys: Object.keys(config?.metadata || {})
        }
      });

      console.log('[MCP Service - STEP 8] Calling mcpManager.callTool with context:', {
        serverName,
        toolName,
        hasConversationContext: !!conversationContext,
        conversationContextKeys: Object.keys(conversationContext),
        messageFilesInContext: conversationContext.messageFiles,
        messageFilesCount: conversationContext.messageFiles?.length || 0
      });

      const result = await mcpManager.callTool({
        serverName,
        toolName,
        provider,
        toolArguments,
        options: {
          signal: derivedSignal,
        },
        user: config?.configurable?.user,
        customUserVars,
        conversationContext,
        flowManager,
        tokenMethods: {
          findToken,
          createToken,
          updateToken,
        },
        oauthStart,
        oauthEnd,
      });

      console.log('[MCP Service - STEP 9] mcpManager.callTool completed:', {
        serverName,
        toolName,
        hasResult: !!result,
        resultType: typeof result
      });

      if (isAssistantsEndpoint(provider) && Array.isArray(result)) {
        return result[0];
      }
      if (isGoogle && Array.isArray(result[0]) && result[0][0]?.type === ContentTypes.TEXT) {
        return [result[0][0].text, result[1]];
      }
      return result;
    } catch (error) {
      logger.error(
        `[MCP][User: ${userId}][${serverName}] Error calling "${toolName}" MCP tool:`,
        error,
      );

      /** OAuth error, provide a helpful message */
      const isOAuthError =
        error.message?.includes('401') ||
        error.message?.includes('OAuth') ||
        error.message?.includes('authentication') ||
        error.message?.includes('Non-200 status code (401)');

      if (isOAuthError) {
        throw new Error(
          `OAuth authentication required for ${serverName}. Please check the server logs for the authentication URL.`,
        );
      }

      throw new Error(
        `"${toolKey}" tool call failed${error?.message ? `: ${error?.message}` : '.'}`,
      );
    } finally {
      // Clean up abort handler to prevent memory leaks
      if (abortHandler && derivedSignal) {
        derivedSignal.removeEventListener('abort', abortHandler);
      }
    }
  };

  const toolInstance = tool(_call, {
    schema,
    name: normalizedToolKey,
    description: description || '',
    responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
  });
  toolInstance.mcp = true;
  return toolInstance;
}

module.exports = {
  createMCPTool,
};
