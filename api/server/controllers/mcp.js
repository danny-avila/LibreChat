/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 *
 * @import { MCPServerRegistry } from '@librechat/api'
 * @import { MCPServerDocument } from 'librechat-data-provider'
 */
const { logger } = require('@librechat/data-schemas');
const {
  isMCPDomainNotAllowedError,
  isMCPInspectionFailedError,
  MCPErrorCodes,
} = require('@librechat/api');
const { Constants, MCPServerUserInputSchema } = require('librechat-data-provider');
const { cacheMCPServerTools, getMCPServerTools } = require('~/server/services/Config');
const { getMCPManager, getMCPServersRegistry } = require('~/config');

/**
 * Handles MCP-specific errors and sends appropriate HTTP responses.
 * @param {Error} error - The error to handle
 * @param {import('express').Response} res - Express response object
 * @returns {import('express').Response | null} Response if handled, null if not an MCP error
 */
function handleMCPError(error, res) {
  if (isMCPDomainNotAllowedError(error)) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
  }

  if (isMCPInspectionFailedError(error)) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
  }

  // Fallback for legacy string-based error handling (backwards compatibility)
  if (error.message?.startsWith(MCPErrorCodes.DOMAIN_NOT_ALLOWED)) {
    return res.status(403).json({
      error: MCPErrorCodes.DOMAIN_NOT_ALLOWED,
      message: error.message.replace(/^MCP_DOMAIN_NOT_ALLOWED\s*:\s*/i, ''),
    });
  }

  if (error.message?.startsWith(MCPErrorCodes.INSPECTION_FAILED)) {
    return res.status(400).json({
      error: MCPErrorCodes.INSPECTION_FAILED,
      message: error.message,
    });
  }

  return null;
}

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

    const mcpConfig = await getMCPServersRegistry().getAllServerConfigs(userId);
    const configuredServers = mcpConfig ? Object.keys(mcpConfig) : [];

    if (!mcpConfig || Object.keys(mcpConfig).length == 0) {
      return res.status(200).json({ servers: {} });
    }

    const mcpManager = getMCPManager();
    const mcpServers = {};

    const cachePromises = configuredServers.map((serverName) =>
      getMCPServerTools(userId, serverName).then((tools) => ({ serverName, tools })),
    );
    const cacheResults = await Promise.all(cachePromises);

    const serverToolsMap = new Map();
    for (const { serverName, tools } of cacheResults) {
      if (tools) {
        serverToolsMap.set(serverName, tools);
        continue;
      }

      let serverTools;
      try {
        serverTools = await mcpManager.getServerToolFunctions(userId, serverName);
      } catch (error) {
        logger.error(`[getMCPTools] Error fetching tools for server ${serverName}:`, error);
        continue;
      }
      if (!serverTools) {
        logger.debug(`[getMCPTools] No tools found for server ${serverName}`);
        continue;
      }
      serverToolsMap.set(serverName, serverTools);

      if (Object.keys(serverTools).length > 0) {
        // Cache asynchronously without blocking
        cacheMCPServerTools({ userId, serverName, serverTools }).catch((err) =>
          logger.error(`[getMCPTools] Failed to cache tools for ${serverName}:`, err),
        );
      }
    }

    // Process each configured server
    for (const serverName of configuredServers) {
      try {
        const serverTools = serverToolsMap.get(serverName);

        // Get server config once
        const serverConfig = mcpConfig[serverName];
        const rawServerConfig = await getMCPServersRegistry().getServerConfig(serverName, userId);

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
 * Get all MCP servers with permissions
 * @route GET /api/mcp/servers
 */
const getMCPServersList = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // 2. Get all server configs from registry (YAML + DB)
    const serverConfigs = await getMCPServersRegistry().getAllServerConfigs(userId);

    return res.json(serverConfigs);
  } catch (error) {
    logger.error('[getMCPServersList]', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create MCP server
 * @route POST /api/mcp/servers
 */
const createMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { config } = req.body;

    const validation = MCPServerUserInputSchema.safeParse(config);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid configuration',
        errors: validation.error.errors,
      });
    }
    const result = await getMCPServersRegistry().addServer(
      'temp_server_name',
      validation.data,
      'DB',
      userId,
    );
    res.status(201).json({
      serverName: result.serverName,
      ...result.config,
    });
  } catch (error) {
    logger.error('[createMCPServer]', error);
    const mcpErrorResponse = handleMCPError(error, res);
    if (mcpErrorResponse) {
      return mcpErrorResponse;
    }
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get MCP server by ID
 */
const getMCPServerById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    if (!serverName) {
      return res.status(400).json({ message: 'Server name is required' });
    }
    const parsedConfig = await getMCPServersRegistry().getServerConfig(serverName, userId);

    if (!parsedConfig) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    res.status(200).json(parsedConfig);
  } catch (error) {
    logger.error('[getMCPServerById]', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Update MCP server
 * @route PATCH /api/mcp/servers/:serverName
 */
const updateMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    const { config } = req.body;

    const validation = MCPServerUserInputSchema.safeParse(config);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid configuration',
        errors: validation.error.errors,
      });
    }
    const parsedConfig = await getMCPServersRegistry().updateServer(
      serverName,
      validation.data,
      'DB',
      userId,
    );

    res.status(200).json(parsedConfig);
  } catch (error) {
    logger.error('[updateMCPServer]', error);
    const mcpErrorResponse = handleMCPError(error, res);
    if (mcpErrorResponse) {
      return mcpErrorResponse;
    }
    res.status(500).json({ message: error.message });
  }
};

/**
 * Delete MCP server
 * @route DELETE /api/mcp/servers/:serverName
 */
const deleteMCPServerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { serverName } = req.params;
    await getMCPServersRegistry().removeServer(serverName, 'DB', userId);
    res.status(200).json({ message: 'MCP server deleted successfully' });
  } catch (error) {
    logger.error('[deleteMCPServer]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMCPTools,
  getMCPServersList,
  createMCPServerController,
  getMCPServerById,
  updateMCPServerController,
  deleteMCPServerController,
};
