/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 */
const { logger } = require('@librechat/data-schemas');
const { Constants, MCPServerUserInputSchema } = require('librechat-data-provider');
const {
  cacheMCPServerTools,
  getMCPServerTools,
  getAppConfig,
} = require('~/server/services/Config');
const { getMCPManager } = require('~/config');
const {
  createMCPServer,
  findMCPServerById,
  getListMCPServersByIds,
  updateMCPServer,
  deleteMCPServer,
} = require('~/models');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
  removeAllPermissions,
} = require('~/server/services/PermissionService');
const {
  ResourceType,
  PermissionBits,
  AccessRoleIds,
  PrincipalType,
} = require('librechat-data-provider');

/**
 * Get all MCP tools available to the user
 */
const getMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[getMCPTools] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const appConfig = req.config ?? (await getAppConfig({ role: req.user?.role }));
    if (!appConfig?.mcpConfig) {
      return res.status(200).json({ servers: {} });
    }

    const mcpManager = getMCPManager();
    const configuredServers = Object.keys(appConfig.mcpConfig);
    const mcpServers = {};

    const cachePromises = configuredServers.map((serverName) =>
      getMCPServerTools(serverName).then((tools) => ({ serverName, tools })),
    );
    const cacheResults = await Promise.all(cachePromises);

    const serverToolsMap = new Map();
    for (const { serverName, tools } of cacheResults) {
      if (tools) {
        serverToolsMap.set(serverName, tools);
        continue;
      }

      const serverTools = await mcpManager.getServerToolFunctions(userId, serverName);
      if (!serverTools) {
        logger.debug(`[getMCPTools] No tools found for server ${serverName}`);
        continue;
      }
      serverToolsMap.set(serverName, serverTools);

      if (Object.keys(serverTools).length > 0) {
        // Cache asynchronously without blocking
        cacheMCPServerTools({ serverName, serverTools }).catch((err) =>
          logger.error(`[getMCPTools] Failed to cache tools for ${serverName}:`, err),
        );
      }
    }

    // Process each configured server
    for (const serverName of configuredServers) {
      try {
        const serverTools = serverToolsMap.get(serverName);

        // Get server config once
        const serverConfig = appConfig.mcpConfig[serverName];
        const rawServerConfig = mcpManager.getRawConfig(serverName);

        // Initialize server object with all server-level data
        const server = {
          name: serverName,
          icon: rawServerConfig?.iconPath || '',
          authenticated: true,
          authConfig: [],
          tools: [],
        };

        // Set authentication config once for the server
        if (serverConfig?.customUserVars) {
          const customVarKeys = Object.keys(serverConfig.customUserVars);
          if (customVarKeys.length > 0) {
            server.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
              authField: key,
              label: value.title || key,
              description: value.description || '',
            }));
            server.authenticated = false;
          }
        }

        // Process tools efficiently - no need for convertMCPToolToPlugin
        if (serverTools) {
          for (const [toolKey, toolData] of Object.entries(serverTools)) {
            if (!toolData.function || !toolKey.includes(Constants.mcp_delimiter)) {
              continue;
            }

            const toolName = toolKey.split(Constants.mcp_delimiter)[0];
            server.tools.push({
              name: toolName,
              pluginKey: toolKey,
              description: toolData.function.description || '',
            });
          }
        }

        // Only add server if it has tools or is configured
        if (server.tools.length > 0 || serverConfig) {
          mcpServers[serverName] = server;
        }
      } catch (error) {
        logger.error(`[getMCPTools] Error loading tools for server ${serverName}:`, error);
      }
    }

    res.status(200).json({ servers: mcpServers });
  } catch (error) {
    logger.error('[getMCPTools]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Create a new MCP server
 */
const createMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { config } = req.body;

    // Validate config using Zod schema
    const validation = MCPServerUserInputSchema.safeParse(config);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid MCP server configuration',
        errors: validation.error.errors,
      });
    }

    // Additional business rule: title is required
    if (!validation.data.title) {
      return res.status(400).json({ message: 'Server title is required' });
    }

    const mcpServer = await createMCPServer({
      config: validation.data, // Use validated data
      author: userId,
    });

    // Auto-grant owner permission to creator
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: userId,
      resourceType: ResourceType.MCPSERVER,
      resourceId: mcpServer._id,
      accessRoleId: AccessRoleIds.MCPSERVER_OWNER,
      grantedBy: userId,
    });

    logger.info(`[MCP Server] Created: ${mcpServer.mcp_id} by ${userId}`);

    res.status(201).json(mcpServer);
  } catch (error) {
    logger.error('[createMCPServer]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get MCP server by ID
 */
const getMCPServerById = async (req, res) => {
  try {
    const { mcp_id } = req.params;
    if (!mcp_id) {
      return res.status(400).json({ message: 'MCP ID is required' });
    }
    const mcpServer = await findMCPServerById(mcp_id);

    if (!mcpServer) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    res.status(200).json(mcpServer);
  } catch (error) {
    logger.error('[getMCPServerById]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get a paginated list of MCP servers with ACL permissions (ownership + explicit shares)
 * Supports search and filtering on title and description
 * @route GET /api/mcp/servers
 */
const getMCPServersList = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[getMCPServersList] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { search, limit, cursor } = req.query;
    let requiredPermission = req.query.requiredPermission;

    if (typeof requiredPermission === 'string') {
      requiredPermission = parseInt(requiredPermission, 10);
      if (isNaN(requiredPermission)) {
        requiredPermission = PermissionBits.VIEW;
      }
    } else if (typeof requiredPermission !== 'number') {
      requiredPermission = PermissionBits.VIEW;
    }

    // Base filter
    const filter = {};

    // Handle search filter - search in config.title and config.description fields
    if (search && search.trim() !== '') {
      filter.$or = [
        { 'config.title': { $regex: search.trim(), $options: 'i' } },
        { 'config.description': { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Get MCP server IDs the user has access to via ACL
    const accessibleIds = await findAccessibleResources({
      userId,
      role: req.user.role,
      resourceType: ResourceType.MCPSERVER,
      requiredPermissions: requiredPermission,
    });

    const publiclyAccessibleIds = await findPubliclyAccessibleResources({
      resourceType: ResourceType.MCPSERVER,
      requiredPermissions: PermissionBits.VIEW,
    });

    // Use the ACL-aware function to get paginated list
    const data = await getListMCPServersByIds({
      ids: accessibleIds,
      otherParams: filter,
      limit,
      after: cursor,
    });

    // Mark public servers
    if (data?.data?.length) {
      data.data = data.data.map((server) => {
        if (publiclyAccessibleIds.some((id) => id.equals(server._id))) {
          server.isPublic = true;
        }
        return server;
      });
    }

    return res.json(data);
  } catch (error) {
    logger.error('[getMCPServersList] Error listing MCP servers', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update an MCP server
 */
const updateMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[updateMCPServer] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { mcp_id } = req.params;
    const { config } = req.body;

    // Check if server exists and user owns it
    const existingServer = await findMCPServerById(mcp_id);
    if (!existingServer) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    // Validate config if provided
    if (config !== undefined) {
      const validation = MCPServerUserInputSchema.safeParse(config);
      if (!validation.success) {
        return res.status(400).json({
          message: 'Invalid MCP server configuration',
          errors: validation.error.errors,
        });
      }

      // Use validated data
      const updatedServer = await updateMCPServer(mcp_id, { config: validation.data });
      return res.status(200).json(updatedServer);
    }

    // If no config provided, return existing server
    const updatedServer = await updateMCPServer(mcp_id, {});
    res.status(200).json(updatedServer);
  } catch (error) {
    logger.error('[updateMCPServer]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Delete an MCP server
 */
const deleteMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[deleteMCPServer] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { mcp_id } = req.params;

    // Check if server exists and user owns it
    const existingServer = await findMCPServerById(mcp_id);
    if (!existingServer) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    const deletedServer = await deleteMCPServer(mcp_id);

    // Clean up ACL permissions
    if (deletedServer) {
      await removeAllPermissions({
        resourceType: ResourceType.MCPSERVER,
        resourceId: deletedServer._id,
      });
      logger.info(`[MCP Server] Deleted: ${mcp_id} by ${userId}`);
    }

    res.status(200).json({ message: 'MCP server deleted successfully' });
  } catch (error) {
    logger.error('[deleteMCPServer]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
  createMCPServerController,
  getMCPServerById,
  getMCPServersList,
  updateMCPServerController,
  deleteMCPServerController,
};
