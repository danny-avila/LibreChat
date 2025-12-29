const { logger, webSearchKeys } = require('@librechat/data-schemas');
const { Tools, CacheKeys, Constants, FileSources } = require('librechat-data-provider');
const {
  MCPOAuthHandler,
  MCPTokenStorage,
  normalizeHttpError,
  extractWebSearchEnvVars,
} = require('@librechat/api');
const {
  deleteAllUserSessions,
  deleteAllSharedLinks,
  updateUserPlugins,
  deleteUserById,
  deleteMessages,
  deletePresets,
  deleteUserKey,
  deleteConvos,
  deleteFiles,
  updateUser,
  findToken,
  getFiles,
} = require('~/models');
const {
  ConversationTag,
  Transaction,
  MemoryEntry,
  Assistant,
  AclEntry,
  Balance,
  Action,
  Group,
  Token,
  User,
} = require('~/db/models');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { verifyEmail, resendVerificationEmail } = require('~/server/services/AuthService');
const { getMCPManager, getFlowStateManager, getMCPServersRegistry } = require('~/config');
const { needsRefresh, getNewS3URL } = require('~/server/services/Files/S3/crud');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { getAppConfig } = require('~/server/services/Config');
const { deleteToolCalls } = require('~/models/ToolCall');
const { deleteUserPrompts } = require('~/models/Prompt');
const { deleteUserAgents } = require('~/models/Agent');
const { getLogStores } = require('~/cache');

const getUserController = async (req, res) => {
  const appConfig = await getAppConfig({ role: req.user?.role });
  /** @type {IUser} */
  const userData = req.user.toObject != null ? req.user.toObject() : { ...req.user };
  /**
   * These fields should not exist due to secure field selection, but deletion
   * is done in case of alternate database incompatibility with Mongo API
   * */
  delete userData.password;
  delete userData.totpSecret;
  delete userData.backupCodes;
  if (appConfig.fileStrategy === FileSources.s3 && userData.avatar) {
    const avatarNeedsRefresh = needsRefresh(userData.avatar, 3600);
    if (!avatarNeedsRefresh) {
      return res.status(200).send(userData);
    }
    const originalAvatar = userData.avatar;
    try {
      userData.avatar = await getNewS3URL(userData.avatar);
      await updateUser(userData.id, { avatar: userData.avatar });
    } catch (error) {
      userData.avatar = originalAvatar;
      logger.error('Error getting new S3 URL for avatar:', error);
    }
  }
  res.status(200).send(userData);
};

const getTermsStatusController = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ termsAccepted: !!user.termsAccepted });
  } catch (error) {
    logger.error('Error fetching terms acceptance status:', error);
    res.status(500).json({ message: 'Error fetching terms acceptance status' });
  }
};

const acceptTermsController = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { termsAccepted: true }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'Terms accepted successfully' });
  } catch (error) {
    logger.error('Error accepting terms:', error);
    res.status(500).json({ message: 'Error accepting terms' });
  }
};

const deleteUserFiles = async (req) => {
  try {
    const userFiles = await getFiles({ user: req.user.id });
    await processDeleteRequest({
      req,
      files: userFiles,
    });
  } catch (error) {
    logger.error('[deleteUserFiles]', error);
  }
};

const updateUserPluginsController = async (req, res) => {
  const appConfig = await getAppConfig({ role: req.user?.role });
  const { user } = req;
  const { pluginKey, action, auth, isEntityTool } = req.body;
  try {
    if (!isEntityTool) {
      await updateUserPlugins(user._id, user.plugins, pluginKey, action);
    }

    if (auth == null) {
      return res.status(200).send();
    }

    let keys = Object.keys(auth);
    const values = Object.values(auth); // Used in 'install' block

    const isMCPTool = pluginKey.startsWith('mcp_') || pluginKey.includes(Constants.mcp_delimiter);

    // Early exit condition:
    // If keys are empty (meaning auth: {} was likely sent for uninstall, or auth was empty for install)
    // AND it's not web_search (which has special key handling to populate `keys` for uninstall)
    // AND it's NOT (an uninstall action FOR an MCP tool - we need to proceed for this case to clear all its auth)
    // THEN return.
    if (
      keys.length === 0 &&
      pluginKey !== Tools.web_search &&
      !(action === 'uninstall' && isMCPTool)
    ) {
      return res.status(200).send();
    }

    /** @type {number} */
    let status = 200;
    /** @type {string} */
    let message;
    /** @type {IPluginAuth | Error} */
    let authService;

    if (pluginKey === Tools.web_search) {
      /** @type  {TCustomConfig['webSearch']} */
      const webSearchConfig = appConfig?.webSearch;
      keys = extractWebSearchEnvVars({
        keys: action === 'install' ? keys : webSearchKeys,
        config: webSearchConfig,
      });
    }

    if (action === 'install') {
      for (let i = 0; i < keys.length; i++) {
        authService = await updateUserPluginAuth(user.id, keys[i], pluginKey, values[i]);
        if (authService instanceof Error) {
          logger.error('[authService]', authService);
          ({ status, message } = normalizeHttpError(authService));
        }
      }
    } else if (action === 'uninstall') {
      // const isMCPTool was defined earlier
      if (isMCPTool && keys.length === 0) {
        // This handles the case where auth: {} is sent for an MCP tool uninstall.
        // It means "delete all credentials associated with this MCP pluginKey".
        authService = await deleteUserPluginAuth(user.id, null, true, pluginKey);
        if (authService instanceof Error) {
          logger.error(
            `[authService] Error deleting all auth for MCP tool ${pluginKey}:`,
            authService,
          );
          ({ status, message } = normalizeHttpError(authService));
        }
        try {
          // if the MCP server uses OAuth, perform a full cleanup and token revocation
          await maybeUninstallOAuthMCP(user.id, pluginKey, appConfig);
        } catch (error) {
          logger.error(
            `[updateUserPluginsController] Error uninstalling OAuth MCP for ${pluginKey}:`,
            error,
          );
        }
      } else {
        // This handles:
        // 1. Web_search uninstall (keys will be populated with all webSearchKeys if auth was {}).
        // 2. Other tools uninstall (if keys were provided).
        // 3. MCP tool uninstall if specific keys were provided in `auth` (not current frontend behavior).
        // If keys is empty for non-MCP tools (and not web_search), this loop won't run, and nothing is deleted.
        for (let i = 0; i < keys.length; i++) {
          authService = await deleteUserPluginAuth(user.id, keys[i]); // Deletes by authField name
          if (authService instanceof Error) {
            logger.error('[authService] Error deleting specific auth key:', authService);
            ({ status, message } = normalizeHttpError(authService));
          }
        }
      }
    }

    if (status === 200) {
      // If auth was updated successfully, disconnect MCP sessions as they might use these credentials
      if (pluginKey.startsWith(Constants.mcp_prefix)) {
        try {
          const mcpManager = getMCPManager();
          if (mcpManager) {
            // Extract server name from pluginKey (format: "mcp_<serverName>")
            const serverName = pluginKey.replace(Constants.mcp_prefix, '');
            logger.info(
              `[updateUserPluginsController] Attempting disconnect of MCP server "${serverName}" for user ${user.id} after plugin auth update.`,
            );
            await mcpManager.disconnectUserConnection(user.id, serverName);
          }
        } catch (disconnectError) {
          logger.error(
            `[updateUserPluginsController] Error disconnecting MCP connection for user ${user.id} after plugin auth update:`,
            disconnectError,
          );
          // Do not fail the request for this, but log it.
        }
      }
      return res.status(status).send();
    }

    const normalized = normalizeHttpError({ status, message });
    return res.status(normalized.status).send({ message: normalized.message });
  } catch (err) {
    logger.error('[updateUserPluginsController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const deleteUserController = async (req, res) => {
  const { user } = req;

  try {
    await deleteMessages({ user: user.id }); // delete user messages
    await deleteAllUserSessions({ userId: user.id }); // delete user sessions
    await Transaction.deleteMany({ user: user.id }); // delete user transactions
    await deleteUserKey({ userId: user.id, all: true }); // delete user keys
    await Balance.deleteMany({ user: user._id }); // delete user balances
    await deletePresets(user.id); // delete user presets
    try {
      await deleteConvos(user.id); // delete user convos
    } catch (error) {
      logger.error('[deleteUserController] Error deleting user convos, likely no convos', error);
    }
    await deleteUserPluginAuth(user.id, null, true); // delete user plugin auth
    await deleteUserById(user.id); // delete user
    await deleteAllSharedLinks(user.id); // delete user shared links
    await deleteUserFiles(req); // delete user files
    await deleteFiles(null, user.id); // delete database files in case of orphaned files from previous steps
    await deleteToolCalls(user.id); // delete user tool calls
    await deleteUserAgents(user.id); // delete user agents
    await Assistant.deleteMany({ user: user.id }); // delete user assistants
    await ConversationTag.deleteMany({ user: user.id }); // delete user conversation tags
    await MemoryEntry.deleteMany({ userId: user.id }); // delete user memory entries
    await deleteUserPrompts(req, user.id); // delete user prompts
    await Action.deleteMany({ user: user.id }); // delete user actions
    await Token.deleteMany({ userId: user.id }); // delete user OAuth tokens
    await Group.updateMany(
      // remove user from all groups
      { memberIds: user.id },
      { $pull: { memberIds: user.id } },
    );
    await AclEntry.deleteMany({ principalId: user._id }); // delete user ACL entries
    logger.info(`User deleted account. Email: ${user.email} ID: ${user.id}`);
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    logger.error('[deleteUserController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const verifyEmailController = async (req, res) => {
  try {
    const verifyEmailService = await verifyEmail(req);
    if (verifyEmailService instanceof Error) {
      return res.status(400).json(verifyEmailService);
    } else {
      return res.status(200).json(verifyEmailService);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const resendVerificationController = async (req, res) => {
  try {
    const result = await resendVerificationEmail(req);
    if (result instanceof Error) {
      return res.status(400).json(result);
    } else {
      return res.status(200).json(result);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

/**
 * OAuth MCP specific uninstall logic
 */
const maybeUninstallOAuthMCP = async (userId, pluginKey, appConfig) => {
  if (!pluginKey.startsWith(Constants.mcp_prefix)) {
    // this is not an MCP server, so nothing to do here
    return;
  }

  const serverName = pluginKey.replace(Constants.mcp_prefix, '');
  const serverConfig =
    (await getMCPServersRegistry().getServerConfig(serverName, userId)) ??
    appConfig?.mcpServers?.[serverName];
  const oauthServers = await getMCPServersRegistry().getOAuthServers(userId);
  if (!oauthServers.has(serverName)) {
    // this server does not use OAuth, so nothing to do here as well
    return;
  }

  // 1. get client info used for revocation (client id, secret)
  const clientTokenData = await MCPTokenStorage.getClientInfoAndMetadata({
    userId,
    serverName,
    findToken,
  });
  if (clientTokenData == null) {
    return;
  }
  const { clientInfo, clientMetadata } = clientTokenData;

  // 2. get decrypted tokens before deletion
  const tokens = await MCPTokenStorage.getTokens({
    userId,
    serverName,
    findToken,
  });

  // 3. revoke OAuth tokens at the provider
  const revocationEndpoint =
    serverConfig.oauth?.revocation_endpoint ?? clientMetadata.revocation_endpoint;
  const revocationEndpointAuthMethodsSupported =
    serverConfig.oauth?.revocation_endpoint_auth_methods_supported ??
    clientMetadata.revocation_endpoint_auth_methods_supported;
  const oauthHeaders = serverConfig.oauth_headers ?? {};

  if (tokens?.access_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.access_token,
        'access',
        {
          serverUrl: serverConfig.url,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
      );
    } catch (error) {
      logger.error(`Error revoking OAuth access token for ${serverName}:`, error);
    }
  }

  if (tokens?.refresh_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.refresh_token,
        'refresh',
        {
          serverUrl: serverConfig.url,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
      );
    } catch (error) {
      logger.error(`Error revoking OAuth refresh token for ${serverName}:`, error);
    }
  }

  // 4. delete tokens from the DB after revocation attempts
  await MCPTokenStorage.deleteUserTokens({
    userId,
    serverName,
    deleteToken: async (filter) => {
      await Token.deleteOne(filter);
    },
  });

  // 5. clear the flow state for the OAuth tokens
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);
  await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
  await flowManager.deleteFlow(flowId, 'mcp_oauth');
};

module.exports = {
  getUserController,
  getTermsStatusController,
  acceptTermsController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
};
