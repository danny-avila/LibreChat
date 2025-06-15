const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { sendEvent, normalizeServerName } = require('@librechat/api');
const { Time, CacheKeys, StepTypes } = require('librechat-data-provider');
const { Constants: AgentConstants, Providers, GraphEvents } = require('@librechat/agents');
const {
  Constants,
  ContentTypes,
  isAssistantsEndpoint,
  convertJsonSchemaToZod,
} = require('librechat-data-provider');
const { logger, getMCPManager, getFlowStateManager } = require('~/config');
const { findToken, createToken, updateToken } = require('~/models');
const { getLogStores } = require('~/cache');

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 */
function createOAuthStart({ res, stepId, toolCall }) {
  /**
   * Creates a function to handle OAuth login requests.
   * @param {string} authURL - The URL to redirect the user for OAuth authentication.
   * @returns {boolean} Returns true to indicate the event was sent successfully.
   */
  return function (authURL) {
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
    sendEvent(res, { event: GraphEvents.ON_RUN_STEP_DELTA, data });
    logger.debug('Sent OAuth login request to client');
    return true;
  };
}

/**
 * @param {object} params
 * @param {ServerResponse} params.res - The Express response object for sending events.
 * @param {string} params.stepId - The ID of the step in the flow.
 * @param {ToolCallChunk} params.toolCall - The tool call object containing tool information.
 */
function createOAuthEnd({ res, stepId, toolCall }) {
  return function () {
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

function createAbortHandler({ userId, serverName, toolName }) {
  return function () {
    logger.info(`[MCP][User: ${userId}][${serverName}][${toolName}] Tool call aborted`);
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
  const toolDefinition = req.app.locals.availableTools[toolKey]?.function;
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
    let abortHandler = null;

    try {
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = getFlowStateManager(flowsCache);
      const derivedSignal = config?.signal ? AbortSignal.any([config.signal]) : undefined;
      const mcpManager = getMCPManager(userId);
      const provider = (config?.metadata?.provider || _provider)?.toLowerCase();

      const { args: _args, stepId, ...toolCall } = config.toolCall ?? {};
      const oauthStart = createOAuthStart({
        res,
        stepId,
        toolCall,
      });
      const oauthEnd = createOAuthEnd({
        res,
        stepId,
        toolCall,
      });

      if (config?.signal) {
        abortHandler = createAbortHandler({ userId, serverName, toolName });
        config.signal.addEventListener('abort', abortHandler, { once: true });
      }

      const result = await mcpManager.callTool({
        serverName,
        toolName,
        provider,
        toolArguments,
        options: {
          signal: derivedSignal,
          user: config?.configurable?.user,
        },
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
      if (abortHandler && config?.signal) {
        config.signal.removeEventListener('abort', abortHandler);
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
