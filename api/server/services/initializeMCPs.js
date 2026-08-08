const mongoose = require('mongoose');
const { logger, tenantStorage, assertMCPAuthorityReadiness } = require('@librechat/data-schemas');
const { mergeAppTools, getAppConfig } = require('./Config');
const { initializeMCPAuthority, setMCPAvailability } = require('./MCPAuthority');
const { createMCPServersRegistry, createMCPManager } = require('~/config');
const db = require('~/models');

function unavailableFromReadiness(error) {
  return {
    available: false,
    reason:
      error && typeof error === 'object' && typeof error.reason === 'string'
        ? error.reason
        : 'prerequisite_missing',
    message: error instanceof Error ? error.message : 'MCP authority prerequisites are unavailable',
    retryable: error && typeof error === 'object' && error.retryable === true,
  };
}

async function initializeUnavailableMCPRuntime() {
  createMCPServersRegistry(mongoose, undefined, undefined, resolveMCPAllowlists);
  await createMCPManager({});
}

/**
 * Resolves the current request's effective MCP allowlists from the merged (tenant-scoped)
 * config. The registry calls this per inspection/connection so admin-panel `mcpSettings`
 * overrides are honored without a restart. Tenant comes from the ALS context inside
 * `getAppConfig`; `userId`/`role` pick up user/role-scoped overrides when an actor exists.
 * @param {{ userId?: string, role?: string, tenantId?: string | null, refresh?: boolean }} [ctx]
 */
async function resolveMCPAllowlists(ctx) {
  const resolve = () =>
    getAppConfig({
      role: ctx?.role,
      userId: ctx?.userId,
      tenantId: ctx?.tenantId ?? undefined,
      refresh: ctx?.refresh,
      failClosed: ctx?.refresh,
    });
  const appConfig = Object.prototype.hasOwnProperty.call(ctx ?? {}, 'tenantId')
    ? await tenantStorage.run({ tenantId: ctx.tenantId ?? undefined }, resolve)
    : await resolve();
  return {
    allowedDomains: appConfig?.mcpSettings?.allowedDomains,
    allowedAddresses: appConfig?.mcpSettings?.allowedAddresses,
  };
}

/**
 * Initialize MCP servers
 */
async function initializeMCPs(options = {}) {
  const validateAuthorityReadiness =
    process.env.NODE_ENV !== 'test' || options.validateAuthorityReadiness === true;
  if (validateAuthorityReadiness) {
    try {
      await assertMCPAuthorityReadiness(mongoose.connection, {
        cosmosStrongConsistencyConfirmed:
          process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED === 'true',
      });
      await db.initializeMCPAuthorityConsistency();
    } catch (error) {
      const unavailable = setMCPAvailability(unavailableFromReadiness(error));
      logger.error(
        `[MCP] Authority unavailable (${unavailable.reason}): ${unavailable.message}. Run \`npm run migrate:mcp-authority\` after reconciling any interrupted authority mutation.`,
      );
      await initializeUnavailableMCPRuntime();
      return;
    }
  }
  const appConfig = await getAppConfig({ baseOnly: true });
  const mcpServers = appConfig.mcpConfig;
  initializeMCPAuthority(appConfig);

  try {
    createMCPServersRegistry(
      mongoose,
      appConfig?.mcpSettings?.allowedDomains,
      appConfig?.mcpSettings?.allowedAddresses,
      resolveMCPAllowlists,
    );
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPServersRegistry:', error);
    throw error;
  }

  try {
    const mcpManager = await createMCPManager(mcpServers || {});

    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const mcpTools = (await mcpManager.getAppToolFunctions()) || {};
      await mergeAppTools(mcpTools);
      const serverCount = Object.keys(mcpServers).length;
      const toolCount = Object.keys(mcpTools).length;
      logger.info(
        `[MCP] Initialized with ${serverCount} configured ${serverCount === 1 ? 'server' : 'servers'} and ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}.`,
      );
    } else {
      logger.debug('[MCP] No servers configured. MCPManager ready for UI-based servers.');
    }
  } catch (error) {
    logger.error('[MCP] Failed to initialize MCPManager:', error);
    throw error;
  }
}

module.exports = initializeMCPs;
