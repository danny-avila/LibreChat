/**
 * MCP Tools Controller
 * Handles MCP-specific tool endpoints, decoupled from regular LibreChat tools
 *
 * @import { MCPServerRegistry } from '@librechat/api'
 * @import { MCPServerDocument } from 'librechat-data-provider'
 */
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const {
  checkAccess,
  isUserSourced,
  MCPErrorCodes,
  redactServerSecrets,
  redactAllServerSecrets,
  isMCPDomainNotAllowedError,
  isMCPInspectionFailedError,
} = require('@librechat/api');
const {
  Constants,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
  MCP_USER_INPUT_FIELDS,
  MCPServerUserInputSchema,
} = require('librechat-data-provider');
const {
  resolveConfigServers,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
} = require('~/server/services/MCP');
const { cacheMCPServerTools, getMCPServerTools } = require('~/server/services/Config');
const { getResourcePermissionsMap } = require('~/server/services/PermissionService');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getMCPManager, getMCPServersRegistry } = require('~/config');
const db = require('~/models');

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
 * Get all MCP tools available to the user.
 */
const getMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('[getMCPTools] User ID not found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const mcpConfig = await resolveAllMcpConfigs(userId, req.user);
    const configuredServers = Object.keys(mcpConfig);

    if (!configuredServers.length) {
      return res.status(200).json({ servers: {} });
    }

    const mcpManager = getMCPManager();
    const mcpServers = {};

    const serverToolsMap = new Map();
    const cacheResults = await Promise.all(
      configuredServers.map(async (serverName) => {
        try {
          return {
            serverName,
            tools: await getMCPServerTools(userId, serverName, mcpConfig[serverName]),
          };
        } catch (error) {
          logger.error(`[getMCPTools] Error fetching cached tools for ${serverName}:`, error);
          return { serverName, tools: null };
        }
      }),
    );
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
        cacheMCPServerTools({
          userId,
          serverName,
          serverTools,
          serverConfig: mcpConfig[serverName],
        }).catch((err) =>
          logger.error(`[getMCPTools] Failed to cache tools for ${serverName}:`, err),
        );
      }
    }

    // Process each configured server
    for (const serverName of configuredServers) {
      try {
        const serverTools = serverToolsMap.get(serverName);

        const serverConfig = mcpConfig[serverName];

        const server = {
          name: serverName,
          icon: serverConfig?.iconPath || '',
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
              sensitive: value.sensitive,
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
/** Mirrors canAccessResource's capability bypass plus per-resource ACL EDIT check. */
async function computeCanEditByServer(req, serverConfigs) {
  const canEditByServer = new Map();
  let bypass = false;
  try {
    bypass = await hasCapability(req.user, SystemCapabilities.MANAGE_MCP_SERVERS);
  } catch (err) {
    logger.warn(`[computeCanEditByServer] Capability bypass check failed: ${err.message}`);
  }
  if (bypass) {
    for (const name of Object.keys(serverConfigs)) {
      canEditByServer.set(name, true);
    }
    return canEditByServer;
  }
  const dbIdsToCheck = [];
  const dbIdToServerName = new Map();
  for (const [name, config] of Object.entries(serverConfigs)) {
    if (config.dbId) {
      dbIdsToCheck.push(config.dbId);
      dbIdToServerName.set(String(config.dbId), name);
      continue;
    }
    canEditByServer.set(name, isUserSourced(config));
  }
  if (dbIdsToCheck.length > 0) {
    try {
      const permsMap = await getResourcePermissionsMap({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.MCPSERVER,
        resourceIds: dbIdsToCheck,
      });
      for (const [dbIdStr, name] of dbIdToServerName) {
        const bits = permsMap.get(dbIdStr) ?? 0;
        canEditByServer.set(name, (bits & PermissionBits.EDIT) !== 0);
      }
    } catch (err) {
      logger.warn(
        `[computeCanEditByServer] ACL lookup failed, defaulting to no edit: ${err.message}`,
      );
      for (const name of dbIdToServerName.values()) {
        canEditByServer.set(name, false);
      }
    }
  }
  return canEditByServer;
}

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

    const serverConfigs = await resolveAllMcpConfigs(userId, req.user);
    const canEditByServer = await computeCanEditByServer(req, serverConfigs);
    return res.json(redactAllServerSecrets(serverConfigs, { canEditByServer }));
  } catch (error) {
    logger.error('[getMCPServersList]', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Returns true when the request body's parsed config configures OBO. We block
 * non-permission holders from creating or updating any DB-stored MCP server
 * that mints per-user delegated tokens.
 */
function configHasObo(parsedConfig) {
  return (
    !!parsedConfig &&
    typeof parsedConfig === 'object' &&
    'obo' in parsedConfig &&
    parsedConfig.obo != null
  );
}

/**
 * Fields a user without `CONFIGURE_OBO` may modify on an OBO server (allowlist).
 * Any field not on this list is locked: changes to it (add, modify, or remove)
 * require the permission. Allowlisting is fail-closed — when upstream introduces
 * a new MCP server config field, it lands in the locked set by default until
 * explicitly opted in here. Anything that could redirect the OBO token flow
 * (`url`, `proxy`, `headers`), change scopes (`obo`), or reroute auth (`oauth`,
 * `apiKey`, `customUserVars`) MUST stay locked.
 */
const OBO_USER_EDITABLE_FIELDS = new Set(['title', 'description', 'iconPath']);

/**
 * Returns true when any non-allowlisted user-input field differs between the
 * existing server config and the new payload. Treats add, remove, and modify
 * as changes (stable JSON compare, with absence on either side counting as a
 * change unless both sides are absent). The comparison surface is
 * `MCP_USER_INPUT_FIELDS` (schema-derived from `MCPServerUserInputSchema`),
 * so new fields on the schema are picked up automatically and stay locked
 * by default until added to the allowlist above.
 */
function violatesOboLockdown(existingConfig, newConfig) {
  for (const field of MCP_USER_INPUT_FIELDS) {
    if (OBO_USER_EDITABLE_FIELDS.has(field)) continue;
    const existing = existingConfig?.[field];
    const next = newConfig?.[field];
    if (existing === undefined && next === undefined) continue;
    if (JSON.stringify(existing) !== JSON.stringify(next)) {
      return true;
    }
  }
  return false;
}

async function callerCanConfigureObo(req) {
  return checkAccess({
    req,
    user: req.user,
    permissionType: PermissionTypes.MCP_SERVERS,
    permissions: [Permissions.CONFIGURE_OBO],
    getRoleByName: db.getRoleByName,
  });
}

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
    if (configHasObo(validation.data) && !(await callerCanConfigureObo(req))) {
      logger.warn(
        `[createMCPServer] User ${userId} attempted to configure OBO without ${Permissions.CONFIGURE_OBO} permission`,
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
    }
    const reservedServerNames = await resolveMcpConfigNames(req);
    const result = await getMCPServersRegistry().addServer(
      'temp_server_name',
      validation.data,
      'DB',
      userId,
      reservedServerNames,
    );
    res.status(201).json({
      serverName: result.serverName,
      ...redactServerSecrets(result.config, { canEdit: true }),
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
    const configServers = await resolveConfigServers(req);
    const parsedConfig = await getMCPServersRegistry().getServerConfig(
      serverName,
      userId,
      configServers,
    );

    if (!parsedConfig) {
      return res.status(404).json({ message: 'MCP server not found' });
    }

    const canEditMap = await computeCanEditByServer(req, { [serverName]: parsedConfig });
    const canEdit = canEditMap.get(serverName) ?? false;
    res.status(200).json(redactServerSecrets(parsedConfig, { canEdit }));
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

    /**
     * On an existing OBO server, lock down every user-input field except the
     * cosmetic allowlist (title, description, iconPath) for callers without
     * CONFIGURE_OBO. This closes the OBO redirect vector — without it, a user
     * with UPDATE could change `url` (or `proxy`/`headers`/`customUserVars`)
     * to point OBO-minted tokens at an attacker-controlled endpoint. Adds,
     * modifies, and removes are all caught.
     */
    const existingConfig = await getMCPServersRegistry().getServerConfig(serverName, userId);
    if (configHasObo(existingConfig) && !(await callerCanConfigureObo(req))) {
      if (violatesOboLockdown(existingConfig, validation.data)) {
        logger.warn(
          `[updateMCPServer] User ${userId} attempted to modify a locked field on OBO server '${serverName}' without ${Permissions.CONFIGURE_OBO} permission`,
        );
        return res
          .status(403)
          .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
      }
    } else if (configHasObo(validation.data) && !(await callerCanConfigureObo(req))) {
      // Adding OBO to a non-OBO server (or first-time configuration) still
      // requires the permission, even if existing has no OBO.
      logger.warn(
        `[updateMCPServer] User ${userId} attempted to add OBO to '${serverName}' without ${Permissions.CONFIGURE_OBO} permission`,
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: Insufficient permissions to configure OBO' });
    }

    const parsedConfig = await getMCPServersRegistry().updateServer(
      serverName,
      validation.data,
      'DB',
      userId,
    );

    res.status(200).json(redactServerSecrets(parsedConfig, { canEdit: true }));
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
