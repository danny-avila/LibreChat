const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { Constants: AgentConstants, Providers, GraphEvents } = require('@librechat/agents');
const {
  sendEvent,
  MCPOAuthHandler,
  normalizeServerName,
  convertWithResolvedRefs,
} = require('@librechat/api');
const {
  Time,
  CacheKeys,
  StepTypes,
  Constants,
  ContentTypes,
  isAssistantsEndpoint,
} = require('librechat-data-provider');
const { getCachedTools, loadCustomConfig, updateMCPUserTools } = require('./Config');
const { findToken, createToken, updateToken, deleteTokens } = require('~/models');
const { getMCPManager, getFlowStateManager } = require('~/config');
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
 * @param {Record<string, Record<string, string>>} params.userMCPAuthMap
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({ req, res, toolKey, provider: _provider, userMCPAuthMap }) {
  const availableTools = await getCachedTools({ userId: req.user?.id, includeGlobal: true });
  /** @type {LCTool | undefined} */
  let toolDefinition = availableTools?.[toolKey]?.function;
  const [toolName, serverName] = toolKey.split(Constants.mcp_delimiter);
  if (!toolDefinition) {
    logger.warn(`Tool ${toolKey} not found in available tools, re-initializing available tools.`);
    try {
      const customUserVars = userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];
      /** @type {import('@librechat/api').MCPConnection | null} */
      let userConnection = null;
      let oauthRequired = false;
      let oauthUrl = null;

      try {
        const flowsCache = getLogStores(CacheKeys.FLOWS);
        const flowManager = getFlowStateManager(flowsCache);
        const mcpManager = getMCPManager();
        userConnection = await mcpManager.getUserConnection({
          user: req.user,
          serverName,
          flowManager,
          customUserVars,
          tokenMethods: {
            findToken,
            updateToken,
            createToken,
            deleteTokens,
          },
          returnOnOAuth: true,
          oauthStart: async (authURL) => {
            logger.info(`[createMCPTool] OAuth URL received: ${authURL}`);
            oauthUrl = authURL;
            oauthRequired = true;
          },
        });

        logger.info(`[createMCPTool] Successfully established connection for ${serverName}`);
      } catch (err) {
        logger.info(`[createMCPTool] getUserConnection threw error: ${err.message}`);
        logger.info(
          `[createMCPTool] OAuth state - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
        );

        const isOAuthError =
          err.message?.includes('OAuth') ||
          err.message?.includes('authentication') ||
          err.message?.includes('401');

        const isOAuthFlowInitiated = err.message === 'OAuth flow initiated - return early';

        if (isOAuthError || oauthRequired || isOAuthFlowInitiated) {
          logger.info(
            `[createMCPTool] OAuth required for ${serverName} (isOAuthError: ${isOAuthError}, oauthRequired: ${oauthRequired}, isOAuthFlowInitiated: ${isOAuthFlowInitiated})`,
          );
          oauthRequired = true;
        } else {
          logger.error(
            `[createMCPTool] Error initializing MCP server ${serverName} for user:`,
            err,
          );
        }
      }

      if (userConnection && !oauthRequired) {
        const tools = await userConnection.fetchTools();
        const availableTools = await updateMCPUserTools({
          userId: req.user.id,
          serverName,
          tools,
        });
        toolDefinition = availableTools?.[toolKey]?.function;
      }

      logger.debug(
        `[createMCPTool] Sending response for ${serverName} - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
      );

      const getResponseMessage = () => {
        if (oauthRequired) {
          return `MCP server '${serverName}' ready for OAuth authentication`;
        }
        if (userConnection) {
          return `MCP server '${serverName}' reinitialized successfully`;
        }
        return `Failed to reinitialize MCP server '${serverName}'`;
      };

      const result = {
        success: Boolean((userConnection && !oauthRequired) || (oauthRequired && oauthUrl)),
        message: getResponseMessage(),
        serverName,
        oauthRequired,
        oauthUrl,
      };
      logger.debug(`[createMCPTool] Response for ${serverName}:`, result);
    } catch (error) {
      logger.error(
        '[createMCPTool] Error loading MCP Tools, servers may still be initializing:',
        error,
      );
    }
  }

  if (!toolDefinition) {
    logger.error(`[createMCPTool] Tool definition not found for ${serverName}`);
    return;
  }

  /** @type {LCTool} */
  const { description, parameters } = toolDefinition;
  const isGoogle = _provider === Providers.VERTEXAI || _provider === Providers.GOOGLE;
  let schema = convertWithResolvedRefs(parameters, {
    allowEmptyObject: !isGoogle,
    transformOneOfAnyOf: true,
  });

  if (!schema) {
    schema = z.object({ input: z.string().optional() });
  }

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

      const result = await mcpManager.callTool({
        serverName,
        toolName,
        provider,
        toolArguments,
        options: {
          signal: derivedSignal,
        },
        user: config?.configurable?.user,
        requestBody: config?.configurable?.requestBody,
        customUserVars,
        flowManager,
        tokenMethods: {
          findToken,
          createToken,
          updateToken,
        },
        oauthStart,
        oauthEnd,
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
  toolInstance.mcpRawServerName = serverName;
  return toolInstance;
}

/**
 * Get MCP setup data including config, connections, and OAuth servers
 * @param {string} userId - The user ID
 * @returns {Object} Object containing mcpConfig, appConnections, userConnections, and oauthServers
 */
async function getMCPSetupData(userId) {
  const printConfig = false;
  const config = await loadCustomConfig(printConfig);
  const mcpConfig = config?.mcpServers;

  if (!mcpConfig) {
    throw new Error('MCP config not found');
  }

  const mcpManager = getMCPManager(userId);
  /** @type {ReturnType<MCPManager['getAllConnections']>} */
  let appConnections = new Map();
  try {
    appConnections = (await mcpManager.getAllConnections()) || new Map();
  } catch (error) {
    logger.error(`[MCP][User: ${userId}] Error getting app connections:`, error);
  }
  const userConnections = mcpManager.getUserConnections(userId) || new Map();
  const oauthServers = mcpManager.getOAuthServers() || new Set();

  return {
    mcpConfig,
    oauthServers,
    appConnections,
    userConnections,
  };
}

/**
 * Check OAuth flow status for a user and server
 * @param {string} userId - The user ID
 * @param {string} serverName - The server name
 * @returns {Object} Object containing hasActiveFlow and hasFailedFlow flags
 */
async function checkOAuthFlowStatus(userId, serverName) {
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);

  try {
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      return { hasActiveFlow: false, hasFailedFlow: false };
    }

    const flowAge = Date.now() - flowState.createdAt;
    const flowTTL = flowState.ttl || 180000; // Default 3 minutes

    if (flowState.status === 'FAILED' || flowAge > flowTTL) {
      const wasCancelled = flowState.error && flowState.error.includes('cancelled');

      if (wasCancelled) {
        logger.debug(`[MCP Connection Status] Found cancelled OAuth flow for ${serverName}`, {
          flowId,
          status: flowState.status,
          error: flowState.error,
        });
        return { hasActiveFlow: false, hasFailedFlow: false };
      } else {
        logger.debug(`[MCP Connection Status] Found failed OAuth flow for ${serverName}`, {
          flowId,
          status: flowState.status,
          flowAge,
          flowTTL,
          timedOut: flowAge > flowTTL,
          error: flowState.error,
        });
        return { hasActiveFlow: false, hasFailedFlow: true };
      }
    }

    if (flowState.status === 'PENDING') {
      logger.debug(`[MCP Connection Status] Found active OAuth flow for ${serverName}`, {
        flowId,
        flowAge,
        flowTTL,
      });
      return { hasActiveFlow: true, hasFailedFlow: false };
    }

    return { hasActiveFlow: false, hasFailedFlow: false };
  } catch (error) {
    logger.error(`[MCP Connection Status] Error checking OAuth flows for ${serverName}:`, error);
    return { hasActiveFlow: false, hasFailedFlow: false };
  }
}

/**
 * Get connection status for a specific MCP server
 * @param {string} userId - The user ID
 * @param {string} serverName - The server name
 * @param {Map} appConnections - App-level connections
 * @param {Map} userConnections - User-level connections
 * @param {Set} oauthServers - Set of OAuth servers
 * @returns {Object} Object containing requiresOAuth and connectionState
 */
async function getServerConnectionStatus(
  userId,
  serverName,
  appConnections,
  userConnections,
  oauthServers,
) {
  const getConnectionState = () =>
    appConnections.get(serverName)?.connectionState ??
    userConnections.get(serverName)?.connectionState ??
    'disconnected';

  const baseConnectionState = getConnectionState();
  let finalConnectionState = baseConnectionState;

  if (baseConnectionState === 'disconnected' && oauthServers.has(serverName)) {
    const { hasActiveFlow, hasFailedFlow } = await checkOAuthFlowStatus(userId, serverName);

    if (hasFailedFlow) {
      finalConnectionState = 'error';
    } else if (hasActiveFlow) {
      finalConnectionState = 'connecting';
    }
  }

  return {
    requiresOAuth: oauthServers.has(serverName),
    connectionState: finalConnectionState,
  };
}

module.exports = {
  createMCPTool,
  getMCPSetupData,
  checkOAuthFlowStatus,
  getServerConnectionStatus,
};
