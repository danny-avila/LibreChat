const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { findToken, createToken, updateToken, deleteTokens } = require('~/models');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { updateMCPUserTools } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

/**
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {string} params.toolKey - The key of the tool to reinitialize
 * @param {string} params.serverName - The name of the MCP server
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
 */
async function reinitMCPServer({ req, toolKey, serverName, userMCPAuthMap }) {
  /** @type {MCPConnection | null} */
  let userConnection = null;
  /** @type {LCFunctionTool | null} */
  let toolDefinition = null;
  /** @type {ReturnType<MCPConnection['fetchTools']> | null} */
  let tools = null;
  let oauthRequired = false;
  let oauthUrl = null;
  try {
    const customUserVars = userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];

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
          logger.info(`[MCP Reinitialize] OAuth URL received: ${authURL}`);
          oauthUrl = authURL;
          oauthRequired = true;
        },
      });

      logger.info(`[MCP Reinitialize] Successfully established connection for ${serverName}`);
    } catch (err) {
      logger.info(`[MCP Reinitialize] getUserConnection threw error: ${err.message}`);
      logger.info(
        `[MCP Reinitialize] OAuth state - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
      );

      const isOAuthError =
        err.message?.includes('OAuth') ||
        err.message?.includes('authentication') ||
        err.message?.includes('401');

      const isOAuthFlowInitiated = err.message === 'OAuth flow initiated - return early';

      if (isOAuthError || oauthRequired || isOAuthFlowInitiated) {
        logger.info(
          `[MCP Reinitialize] OAuth required for ${serverName} (isOAuthError: ${isOAuthError}, oauthRequired: ${oauthRequired}, isOAuthFlowInitiated: ${isOAuthFlowInitiated})`,
        );
        oauthRequired = true;
      } else {
        logger.error(
          `[MCP Reinitialize] Error initializing MCP server ${serverName} for user:`,
          err,
        );
      }
    }

    if (userConnection && !oauthRequired) {
      tools = await userConnection.fetchTools();
      const availableTools = await updateMCPUserTools({
        userId: req.user.id,
        serverName,
        tools,
      });
      toolDefinition = availableTools?.[toolKey]?.function;
    }

    logger.debug(
      `[MCP Reinitialize] Sending response for ${serverName} - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
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
      toolDefinition,
      success: Boolean((userConnection && !oauthRequired) || (oauthRequired && oauthUrl)),
      message: getResponseMessage(),
      oauthRequired,
      serverName,
      oauthUrl,
      tools,
    };
    logger.debug(`[MCP Reinitialize] Response for ${serverName}:`, result);
    return result;
  } catch (error) {
    logger.error(
      '[MCP Reinitialize] Error loading MCP Tools, servers may still be initializing:',
      error,
    );
  }
}

module.exports = {
  reinitMCPServer,
};
