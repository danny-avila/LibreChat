/**
 * MCPDBLoader - Handles DB CRUD operations and registry synchronization
 *
 * ARCHITECTURE:
 * - Registry is the ONLY source for querying servers
 * - All CRUD operations update BOTH database AND registry
 * - Permissions calculated ON-DEMAND (not stored in cache)
 * - Controllers query registry, then enrich with permissions
 *
 * @typedef {import('librechat-data-provider').MCPOptions} MCPOptions
 * @typedef {import('librechat-data-provider').MCPServerDBObjectResponse} MCPServerDBObjectResponse
 * @typedef {import('librechat-data-provider').MCPServerDocument} MCPServerDocument
 * @typedef {import('@librechat/api/dist/types/mcp/types/index').ParsedServerConfig} ParsedServerConfig
 * @typedef {import('@librechat/api/dist/types/mcp/registry/MCPPrivateServerLoader').MCPPrivateServerLoader} MCPPrivateServerLoader
 */

const {
  createMCPServer,
  findMCPServerById,
  updateMCPServer,
  deleteMCPServer,
  getListMCPServersByIds,
} = require('~/models');
const {
  grantPermission,
  findAccessibleResources,
  getResourcePermissionsMap,
  removeAllPermissions,
} = require('~/server/services/PermissionService');
const {
  ResourceType,
  PermissionBits,
  AccessRoleIds,
  PrincipalType,
} = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { MCPPrivateServerLoader, mcpServersRegistry } = require('@librechat/api');

class MCPDBLoader {
  /**
   * Create configsLoader callback for MCPPrivateServerLoader
   * Returns server configs ONLY (NO permissions)
   * @param {string} userId - User ID
   * @param {string} [role] - User role
   * @returns {Function} Async function that loads user's server configs
   */
  createConfigsLoader(userId, role) {
    return async () => {
      const accessibleIds = await findAccessibleResources({
        userId,
        role,
        resourceType: ResourceType.MCPSERVER,
        requiredPermissions: PermissionBits.VIEW,
      });

      if (accessibleIds.length === 0) {
        return {};
      }

      const { data: servers } = await getListMCPServersByIds({
        ids: accessibleIds,
        limit: null,
      });

      return servers;
    };
  }

  /**
   * Ensure user's DB servers are loaded into registry
   * Called by controller before querying registry
   * @param {string} userId - User ID
   * @param {string} [role] - User role
   */
  async ensureServersLoaded(userId, role) {
    const configsLoader = this.createConfigsLoader(userId, role);
    await MCPPrivateServerLoader.loadPrivateServers(userId, configsLoader);
  }

  /**
   * Enrich server configs with permissions ON-DEMAND using BATCH query
   * @param {Record<string, ParsedServerConfig>} serverConfigs - Configs from registry
   * @param {string} userId - User ID
   * @param {string} [role] - User role
   * @returns {Promise<Record<string, MCPServerDBObjectResponse>} Enriched servers
   */
  async enrichWithPermissions(serverConfigs, userId, role) {
    const serverDBIds = Object.entries(serverConfigs)
      .map((entry) => entry[1].dbId)
      .filter((i) => i);

    const permissionsMap = await getResourcePermissionsMap({
      userId,
      role,
      resourceType: ResourceType.MCPSERVER,
      resourceIds: serverDBIds,
    });
    for (const [serverName, config] of Object.entries(serverConfigs)) {
      serverConfigs[serverName].effectivePermissions = permissionsMap.get(config.dbId) || 0;
    }
    return serverConfigs;
  }

  /**
   * Create MCP server
   * @param {string} userId - User ID
   * @param {MCPOptions} config - Server configuration
   * @returns {Promise<MCPServerDBObjectResponse>} Created server
   */
  async createServer(userId, config) {
    // 1. Create in DB
    const mcpServer = await createMCPServer({ config, author: userId });
    const { config: savedConfig, ...mcpServerDBMetadata } = mcpServer;
    // 2. Grant OWNER permission
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: userId,
      resourceType: ResourceType.MCPSERVER,
      resourceId: mcpServer._id,
      accessRoleId: AccessRoleIds.MCPSERVER_OWNER,
      grantedBy: userId,
    });

    // 3. Add to registry (config only, no permissions)
    await MCPPrivateServerLoader.addPrivateServer(userId, mcpServer.mcp_id, {
      ...savedConfig,
      dbId: mcpServer._id,
    });
    const serverConfig = await mcpServersRegistry.getServerConfig(mcpServer.mcp_id, userId);

    logger.info(`[MCPDBLoader] Created server: ${mcpServer.mcp_id} by ${userId}`);
    return { ...serverConfig, ...mcpServerDBMetadata, effectivePermissions: PermissionBits.OWNER };
  }

  /**
   * Update MCP server
   * @param {string} mcpId - MCP server ID
   * @param {MCPOptions} config - Updated configuration
   * @param {string} userId - User ID
   * @returns {Promise<MCPServersDBObjectResponse>} Updated server
   */
  async updateServer(mcpId, config, userId) {
    // 1. Update DB
    const updated = await updateMCPServer(mcpId, { config });
    if (!updated) {
      throw new Error(`Server ${mcpId} not found`);
    }
    const { config: savedConfig, ...mcpServerDBMetadata } = updated;

    // 2. Propagate config to all users (NO permissions in config)
    await MCPPrivateServerLoader.updatePrivateServer(mcpId, { ...savedConfig, dbId: updated._id });
    const effectivePermissions = await getResourcePermissionsMap({
      userId,
      resourceType: ResourceType.MCPSERVER,
      resourceIds: [updated._id],
    });

    logger.info(`[MCPDBLoader] Updated server: ${mcpId}`);
    return {
      ...savedConfig,
      ...mcpServerDBMetadata,
      effectivePermissions: effectivePermissions.get(updated._id) || 0,
    };
  }

  /**
   * Delete MCP server
   * @param {string} mcpId - MCP server ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Success message
   */
  async deleteServer(mcpId, userId) {
    const server = await findMCPServerById(mcpId);
    if (!server) {
      throw new Error(`Server ${mcpId} not found`);
    }

    // 1. Delete from DB
    await deleteMCPServer(mcpId);

    // 2. Remove all permissions
    await removeAllPermissions({
      resourceType: ResourceType.MCPSERVER,
      resourceId: server._id,
    });

    // 3. Remove from registry
    await mcpServersRegistry.removeServer(mcpId);

    logger.info(`[MCPDBLoader] Deleted server: ${mcpId} by ${userId}`);
    return { success: true, message: 'Server deleted successfully' };
  }

  /**
   * Share server with users/groups
   * @param {string} mcpId - MCP server ID
   * @param {Array<Object>} principals - List of principals to share with
   * @param {string} accessRoleId - Access role to grant
   * @param {string} grantedBy - User ID granting access
   */
  async shareServer(mcpId, principals, accessRoleId, grantedBy) {
    const server = await findMCPServerById(mcpId);
    if (!server) {
      throw new Error(`Server ${mcpId} not found`);
    }

    // Grant permissions to each principal
    for (const principal of principals) {
      await grantPermission({
        principalType: principal.type,
        principalId: principal.id,
        resourceType: ResourceType.MCPSERVER,
        resourceId: server._id,
        accessRoleId,
        grantedBy,
      });
    }

    // Get all user IDs who now have access
    const allUserIds = await this.getUsersWithAccess(server._id);

    // Update registry access (config only, no permissions)
    await MCPPrivateServerLoader.updatePrivateServerAccess(mcpId, allUserIds, {
      ...server.config,
      dbId: server._id,
    });

    logger.info(`[MCPDBLoader] Shared server ${mcpId} with ${principals.length} principals`);
  }
  detectOAuthFromConfig(config) {}
}

module.exports = new MCPDBLoader();
