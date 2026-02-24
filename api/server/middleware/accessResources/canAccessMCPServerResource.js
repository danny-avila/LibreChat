const { ResourceType } = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { findMCPServerByServerName } = require('~/models');

/**
 * MCP Server name resolver function
 * Resolves MCP server name (e.g., "my-mcp-server") to MongoDB ObjectId
 *
 * @param {string} serverName - Server name from route parameter
 * @returns {Promise<Object|null>} MCP server document with _id field, or null if not found
 */
const resolveMCPServerName = async (serverName) => {
  return await findMCPServerByServerName(serverName);
};

/**
 * MCP Server-specific middleware factory that creates middleware to check MCP server access permissions.
 * This middleware extends the generic canAccessResource to handle MCP server custom ID resolution.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @param {string} [options.resourceIdParam='serverName'] - The name of the route parameter containing the MCP server custom ID
 * @returns {Function} Express middleware function
 *
 * @example
 * // Basic usage for viewing MCP servers
 * router.get('/servers/:serverName',
 *   canAccessMCPServerResource({ requiredPermission: 1 }),
 *   getMCPServer
 * );
 *
 * @example
 * // Custom resource ID parameter and edit permission
 * router.patch('/servers/:id',
 *   canAccessMCPServerResource({
 *     requiredPermission: 2,
 *     resourceIdParam: 'id'
 *   }),
 *   updateMCPServer
 * );
 */
const canAccessMCPServerResource = (options) => {
  const { requiredPermission, resourceIdParam = 'serverName' } = options;

  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error(
      'canAccessMCPServerResource: requiredPermission is required and must be a number',
    );
  }

  return canAccessResource({
    resourceType: ResourceType.MCPSERVER,
    requiredPermission,
    resourceIdParam,
    idResolver: resolveMCPServerName,
  });
};

module.exports = {
  canAccessMCPServerResource,
};
