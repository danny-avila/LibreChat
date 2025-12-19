const { logger } = require('@librechat/data-schemas');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { findToken, createToken, updateToken, deleteTokens } = require('~/models');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { updateMCPServerTools } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

/**
 * @param {Object} params
 * @param {IUser} params.user - The user from the request object.
 * @param {string} params.serverName - The name of the MCP server
 * @param {boolean} params.returnOnOAuth - Whether to initiate OAuth and return, or wait for OAuth flow to finish
 * @param {AbortSignal} [params.signal] - The abort signal to handle cancellation.
 * @param {boolean} [params.forceNew]
 * @param {number} [params.connectionTimeout]
 * @param {FlowStateManager<any>} [params.flowManager]
 * @param {(authURL: string) => Promise<boolean>} [params.oauthStart]
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
 */
async function reinitMCPServer({
  user,
  signal,
  forceNew,
  serverName,
  userMCPAuthMap,
  connectionTimeout,
  returnOnOAuth = true,
  oauthStart: _oauthStart,
  flowManager: _flowManager,
}) {
  /** @type {MCPConnection | null} */
  let connection = null;
  /** @type {LCAvailableTools | null} */
  let availableTools = null;
  /** @type {ReturnType<MCPConnection['fetchTools']> | null} */
  let tools = null;
  let oauthRequired = false;
  let oauthUrl = null;
  try {
    const customUserVars = userMCPAuthMap?.[`${Constants.mcp_prefix}${serverName}`];
    const flowManager = _flowManager ?? getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const mcpManager = getMCPManager();

    const oauthStart =
      _oauthStart ??
      (async (authURL) => {
        logger.info(`[MCP Reinitialize] OAuth URL received for ${serverName}`);
        oauthUrl = authURL;
        oauthRequired = true;
      });

    try {
      connection = await mcpManager.getConnection({
        user,
        signal,
        forceNew,
        oauthStart,
        serverName,
        flowManager,
        returnOnOAuth,
        customUserVars,
        connectionTimeout,
        tokenMethods: {
          findToken,
          updateToken,
          createToken,
          deleteTokens,
        },
      });

      logger.info(`[MCP Reinitialize] Successfully established connection for ${serverName}`);
    } catch (err) {
      logger.info(`[MCP Reinitialize] getConnection threw error: ${err.message}`);
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

    if (connection && !oauthRequired) {
      tools = await connection.fetchTools();
      availableTools = await updateMCPServerTools({
        userId: user.id,
        serverName,
        tools,
      });
    }

    logger.debug(
      `[MCP Reinitialize] Sending response for ${serverName} - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
    );

    const getResponseMessage = () => {
      if (oauthRequired) {
        return `MCP server '${serverName}' ready for OAuth authentication`;
      }
      if (connection) {
        return `MCP server '${serverName}' reinitialized successfully`;
      }
      return `Failed to reinitialize MCP server '${serverName}'`;
    };

    const result = {
      availableTools,
      success: Boolean((connection && !oauthRequired) || (oauthRequired && oauthUrl)),
      message: getResponseMessage(),
      oauthRequired,
      serverName,
      oauthUrl,
      tools,
    };
    logger.debug(`[MCP Reinitialize] Response for ${serverName}:`, {
      success: result.success,
      oauthRequired: result.oauthRequired,
      oauthUrl: result.oauthUrl ? 'present' : null,
      toolsCount: tools?.length ?? 0,
    });
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
