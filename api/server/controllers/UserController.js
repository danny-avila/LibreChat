const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  getNewS3URL,
  needsRefresh,
  GenerationJobManager,
  getAppConfigOptionsFromUser,
  normalizeHttpError,
  getWebSearchInstallEntries,
  getWebSearchUninstallFields,
  deleteAgentCheckpoints,
  deleteAllSharedLinksWithCleanup,
  revokeUserCodeEnvironmentWorkers,
} = require('@librechat/api');
const { Tools, Constants, FileSources, ResourceType } = require('librechat-data-provider');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { verifyOTPOrBackupCode } = require('~/server/services/twoFactorService');
const { verifyEmail, resendVerificationEmail } = require('~/server/services/AuthService');
const { getMCPManager } = require('~/config');
const { maybeUninstallOAuthMCP } = require('~/server/services/MCP/oauthCleanup');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { processDeleteRequest } = require('~/server/services/Files/process');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const {
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
} = require('~/server/services/Agents/triggers');
const { getAppConfig, invalidateCodeEnvironmentConfigCache } = require('~/server/services/Config');
const { randomUUID } = require('node:crypto');
const {
  quiesceUserSchedules,
  restoreUserSchedulesFromDeletion,
} = require('~/server/services/Schedules');
const db = require('~/models');

const PUBLIC_USER_RESPONSE_FIELDS = [
  '_id',
  'id',
  'name',
  'username',
  'email',
  'emailVerified',
  'avatar',
  'provider',
  'role',
  'plugins',
  'twoFactorEnabled',
  'termsAccepted',
  'personalization',
  'favorites',
  'skillStates',
  'createdAt',
  'updatedAt',
  'tenantId',
];

const sanitizeUserForResponse = (user) => {
  const source = user.toObject != null ? user.toObject() : user;
  return PUBLIC_USER_RESPONSE_FIELDS.reduce((userData, field) => {
    if (source[field] !== undefined) {
      userData[field] = source[field];
    }
    return userData;
  }, {});
};

const getUserController = async (req, res) => {
  const appConfig = req.config ?? (await getAppConfig(getAppConfigOptionsFromUser(req.user)));
  /** @type {IUser} */
  const userData = sanitizeUserForResponse(req.user);
  if (appConfig.fileStrategy === FileSources.s3 && userData.avatar) {
    const avatarNeedsRefresh = needsRefresh(userData.avatar, 3600);
    if (!avatarNeedsRefresh) {
      return res.status(200).send(userData);
    }
    const originalAvatar = userData.avatar;
    try {
      userData.avatar = await getNewS3URL(userData.avatar);
      await db.updateUser(userData.id, { avatar: userData.avatar });
    } catch (error) {
      userData.avatar = originalAvatar;
      logger.error('Error getting new S3 URL for avatar:', error);
    }
  }
  res.status(200).send(userData);
};

const getTermsStatusController = async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id, 'termsAccepted termsAcceptedAt');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({
      termsAccepted: !!user.termsAccepted,
      termsAcceptedAt: user.termsAcceptedAt || null,
    });
  } catch (error) {
    logger.error('Error fetching terms acceptance status:', error);
    res.status(500).json({ message: 'Error fetching terms acceptance status' });
  }
};

const acceptTermsController = async (req, res) => {
  try {
    const user = await db.acceptTerms(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({
      message: 'Terms accepted successfully',
      termsAcceptedAt: user.termsAcceptedAt,
    });
  } catch (error) {
    logger.error('Error accepting terms:', error);
    res.status(500).json({ message: 'Error accepting terms' });
  }
};

const deleteUserFiles = async (req) => {
  try {
    const userFiles = await db.getFiles({ user: req.user.id });
    await processDeleteRequest({
      req,
      files: userFiles,
    });
  } catch (error) {
    logger.error('[deleteUserFiles]', error);
  }
};

/**
 * Deletes MCP servers solely owned by the user and cleans up their ACLs.
 * Disconnects live sessions for deleted servers before removing DB records.
 * Servers with other owners are left intact; the caller is responsible for
 * removing the user's own ACL principal entries separately.
 *
 * Also handles legacy (pre-ACL) MCP servers that only have the author field set,
 * ensuring they are not orphaned if no permission migration has been run.
 * @param {string} userId - The ID of the user.
 */
const deleteUserMcpServers = async (userId) => {
  try {
    const MCPServer = mongoose.models.MCPServer;
    const AclEntry = mongoose.models.AclEntry;
    if (!MCPServer) {
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const soleOwnedIds = await db.getSoleOwnedResourceIds(userObjectId, ResourceType.MCPSERVER);

    const authoredServers = await MCPServer.find({ author: userObjectId })
      .select('_id serverName')
      .lean();

    const migratedEntries =
      authoredServers.length > 0
        ? await AclEntry.find({
            resourceType: ResourceType.MCPSERVER,
            resourceId: { $in: authoredServers.map((s) => s._id) },
          })
            .select('resourceId')
            .lean()
        : [];
    const migratedIds = new Set(migratedEntries.map((e) => e.resourceId.toString()));
    const legacyServers = authoredServers.filter((s) => !migratedIds.has(s._id.toString()));
    const legacyServerIds = legacyServers.map((s) => s._id);

    const allServerIdsToDelete = [...soleOwnedIds, ...legacyServerIds];

    if (allServerIdsToDelete.length === 0) {
      return;
    }

    const aclOwnedServers =
      soleOwnedIds.length > 0
        ? await MCPServer.find({ _id: { $in: soleOwnedIds } })
            .select('serverName')
            .lean()
        : [];
    const allServersToDelete = [...aclOwnedServers, ...legacyServers];

    const mcpManager = getMCPManager();
    await Promise.allSettled(
      allServersToDelete.map(async (s) => {
        try {
          await invalidateCachedTools({ userId, serverName: s.serverName });
        } catch (error) {
          logger.warn(
            `[deleteUserMcpServers] Failed to invalidate tools for ${s.serverName}:`,
            error,
          );
        } finally {
          try {
            await mcpManager?.disconnectUserConnection(userId, s.serverName);
          } catch (error) {
            logger.warn(`[deleteUserMcpServers] Failed to disconnect ${s.serverName}:`, error);
          }
        }
      }),
    );

    await AclEntry.deleteMany({
      resourceType: ResourceType.MCPSERVER,
      resourceId: { $in: allServerIdsToDelete },
    });

    await MCPServer.deleteMany({ _id: { $in: allServerIdsToDelete } });
  } catch (error) {
    logger.error('[deleteUserMcpServers] General error:', error);
  }
};

const updateUserPluginsController = async (req, res) => {
  const appConfig = req.config ?? (await getAppConfig(getAppConfigOptionsFromUser(req.user)));
  const { user } = req;
  const { pluginKey, action, auth, isEntityTool } = req.body;
  try {
    if (!isEntityTool) {
      await db.updateUserPlugins(user._id, user.plugins, pluginKey, action);
    }

    if (auth == null) {
      return res.status(200).send();
    }

    let authEntries = Object.entries(auth);

    const isMCPTool = pluginKey.startsWith('mcp_') || pluginKey.includes(Constants.mcp_delimiter);

    // Early exit condition:
    // If auth is empty (meaning auth: {} was likely sent for uninstall or install)
    // AND it's not web_search (which expands its uninstall fields)
    // AND it's NOT (an uninstall action FOR an MCP tool - we need to proceed for this case to clear all its auth)
    // THEN return.
    if (
      authEntries.length === 0 &&
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
      authEntries =
        action === 'install'
          ? getWebSearchInstallEntries({ auth, config: webSearchConfig })
          : getWebSearchUninstallFields(webSearchConfig).map((field) => [field, '']);
    }

    if (action === 'install') {
      for (const [field, value] of authEntries) {
        authService =
          pluginKey === Tools.web_search && value === ''
            ? await deleteUserPluginAuth(user.id, field)
            : await updateUserPluginAuth(user.id, field, pluginKey, value);
        if (authService instanceof Error) {
          logger.error('[authService]', authService);
          ({ status, message } = normalizeHttpError(authService));
          if (pluginKey === Tools.web_search) {
            break;
          }
        }
      }
    } else if (action === 'uninstall') {
      // const isMCPTool was defined earlier
      if (isMCPTool && authEntries.length === 0) {
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
        const serverName = pluginKey.replace(Constants.mcp_prefix, '');
        try {
          await invalidateCachedTools({ userId: user.id, serverName });
        } catch (error) {
          logger.error(
            `[updateUserPluginsController] Error fencing MCP connection before OAuth teardown for user ${user.id}:`,
            error,
          );
        }
        try {
          await getMCPManager()?.disconnectUserConnection(user.id, serverName);
        } catch (error) {
          logger.error(
            `[updateUserPluginsController] Error disconnecting MCP connection before OAuth teardown for user ${user.id}:`,
            error,
          );
        }
        try {
          // if the MCP server uses OAuth, perform a full cleanup and token revocation
          await maybeUninstallOAuthMCP(user.id, pluginKey, appConfig);
        } catch (error) {
          logger.error(
            `[updateUserPluginsController] Error uninstalling OAuth MCP for ${pluginKey}:`,
            error,
          );
          status = 503;
          message = 'OAuth credential cleanup is temporarily unavailable';
        }
      } else {
        // This handles:
        // 1. Web_search uninstall (entries include every configured field).
        // 2. Other tools uninstall (if auth fields were provided).
        // 3. MCP tool uninstall if specific fields were provided in `auth`.
        for (const [field] of authEntries) {
          authService = await deleteUserPluginAuth(user.id, field); // Deletes by authField name
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
          // Extract server name from pluginKey (format: "mcp_<serverName>")
          const serverName = pluginKey.replace(Constants.mcp_prefix, '');
          if (mcpManager) {
            logger.info(
              `[updateUserPluginsController] Attempting disconnect of MCP server "${serverName}" for user ${user.id} after plugin auth update.`,
            );
          }
          let invalidationError;
          try {
            await invalidateCachedTools({ userId: user.id, serverName });
          } catch (error) {
            invalidationError = error;
          }
          try {
            await mcpManager?.disconnectUserConnection(user.id, serverName);
          } catch (error) {
            logger.error(
              `[updateUserPluginsController] Error disconnecting MCP connection for user ${user.id} after plugin auth update:`,
              error,
            );
          }
          if (invalidationError) {
            throw invalidationError;
          }
        } catch (disconnectError) {
          logger.error(
            `[updateUserPluginsController] Error fencing MCP connection for user ${user.id} after plugin auth update:`,
            disconnectError,
          );
          // A credential mutation is not safely published until the shared generation fence moves.
          throw disconnectError;
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
  let triggerDeletionFence;
  let scheduleSuspensionToken;
  let userDeleted = false;

  try {
    const existingUser = await db.getUserById(
      user.id,
      '+totpSecret +backupCodes _id twoFactorEnabled',
    );
    if (existingUser && existingUser.twoFactorEnabled) {
      const { token, backupCode } = req.body;
      const result = await verifyOTPOrBackupCode({ user: existingUser, token, backupCode });

      if (!result.verified) {
        const msg =
          result.message ??
          'TOTP token or backup code is required to delete account with 2FA enabled';
        return res.status(result.status ?? 400).json({ message: msg });
      }
    }

    // Block new trigger admissions across replicas while preserving the user
    // principal so a transient cleanup failure remains retryable.
    triggerDeletionFence = new Date();
    const fenceState = await db.beginAgentTriggerUserDeletion(user.id, triggerDeletionFence);
    if (fenceState === 'in_progress') {
      triggerDeletionFence = undefined;
      throw new Error('Agent trigger account deletion is already in progress');
    }
    if (fenceState === 'missing') {
      triggerDeletionFence = undefined;
    }
    if (triggerDeletionFence != null) {
      await prepareAgentTriggerUserPurge(user.id, triggerDeletionFence, user.tenantId);
    }
    const deletionAppConfig = await getAppConfig({ baseOnly: true });
    await drainAgentTriggerDeliveriesForUser(user.id);
    await subagentThreadTaskStore.cancelAndDrainForOwner(user.id, user.tenantId);
    // Reversibly suspend the user's schedules under a per-attempt token BEFORE draining.
    // A later cascade step (or this drain) can still fail and cancel the deletion, and the
    // catch below restores exactly this attempt's rows — so a failed deletion never leaves
    // a live user with silently disabled, erasure-eligible schedules.
    scheduleSuspensionToken = randomUUID();
    if (!(await quiesceUserSchedules(user.id, scheduleSuspensionToken))) {
      throw new Error('Scheduled executions could not be confirmed stopped');
    }
    const activeAgentRuns = await GenerationJobManager.getCleanupBlockingJobIdsForUser(
      user.id,
      user.tenantId,
    );
    await Promise.all(
      activeAgentRuns.map((streamId) =>
        GenerationJobManager.abortJob(streamId, { awaitProviderDrain: true }),
      ),
    );

    await db.deleteMessages({ user: user.id });
    await db.deleteAllUserSessions({ userId: user.id });
    await db.deleteTransactions({ user: user.id });
    await db.deleteUserKey({ userId: user.id, all: true });
    await db.deleteBalances({ user: user._id });
    await db.deletePresets(user.id);
    try {
      const convoDeletion = await db.deleteConvos(user.id);
      // HITL: prune the deleted conversations' durable checkpoints — a paused run's
      // checkpoint would otherwise persist until the Mongo TTL. Never throws.
      const appConfig =
        req.config ??
        (await getAppConfig({
          role: req.user?.role,
          userId: req.user?.id,
          tenantId: req.user?.tenantId,
        }));
      await deleteAgentCheckpoints(
        convoDeletion?.conversationIds,
        appConfig?.endpoints?.agents?.checkpointer,
      );
    } catch (error) {
      logger.error('[deleteUserController] Error deleting user convos, likely no convos', error);
    }
    await deleteUserPluginAuth(user.id, null, true);
    await deleteAllSharedLinksWithCleanup(user.id);
    await deleteUserFiles(req);
    await db.deleteFiles(null, user.id);
    await db.deleteToolCalls(user.id);
    await db.deleteUserAgents(user.id);
    await db.deleteAllAgentApiKeys(user._id);
    await db.deleteAssistants({ user: user.id });
    await db.deleteConversationTags({ user: user.id });
    await db.deleteAllUserMemories(user.id);
    await db.deleteUserPrompts(user.id);
    await db.deleteUserSkills(user.id);
    await deleteUserMcpServers(user.id);
    await db.deleteActions({ user: user.id });
    await db.deleteTokens({ userId: user.id });
    await db.removeUserFromAllGroups(user.id);
    await db.deleteAclEntries({ principalId: user._id });
    await db.deleteSchedulesByUser(user.id);
    const deleteResult = await db.deleteUserById(user.id);
    if (deleteResult.deletedCount !== 1) {
      throw new Error('User disappeared before account deletion could commit');
    }
    userDeleted = true;
    let codeEnvironmentCleanupSafe = true;
    try {
      await revokeUserCodeEnvironmentWorkers({
        mongoose,
        userId: user.id,
        appConfig: deletionAppConfig,
      });
    } catch (error) {
      codeEnvironmentCleanupSafe = false;
      logger.error('[deleteUserController] Failed to revoke code environment workers', error);
    }
    if (codeEnvironmentCleanupSafe) {
      try {
        await db.deleteUserCodeEnvironments(user.id);
      } catch (error) {
        logger.error('[deleteUserController] Failed to delete code environments', error);
      }
    }
    await invalidateCodeEnvironmentConfigCache(user.tenantId).catch((error) => {
      logger.error('[deleteUserController] code environment cache invalidation failed:', error);
    });
    await purgeAgentTriggerDeliveriesForUser(user.id);
    logger.info(`User deleted account. Email: ${user.email} ID: ${user.id}`);
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    // The account survives this failed attempt, so its schedules must too: restore the
    // exact rows this attempt suspended (re-enabled/re-armed from their snapshot). Fenced
    // to the token, so a schedule the owner deleted meanwhile is not resurrected. A
    // successful deletion never reaches here (userDeleted short-circuits it).
    //
    // RESTORE BEFORE RELEASING THE DELETION FENCE. That fence is what refuses new schedule
    // writes/claims for this user; releasing it first opens a window where an owner PATCH
    // could edit a still-suspended row and then have its enabled/next-run state overwritten
    // by this older snapshot, and where a second deletion attempt could re-suspend these
    // rows under a new token — making this restore a no-op and stranding the disabled
    // snapshot permanently.
    if (scheduleSuspensionToken != null && !userDeleted) {
      try {
        await restoreUserSchedulesFromDeletion(user.id, scheduleSuspensionToken);
      } catch (restoreError) {
        // Every retry is exhausted at this point. The fence is still released below on
        // purpose: retaining it would refuse this live account's schedule writes AND make
        // `beginAgentTriggerUserDeletion` report `in_progress` forever, blocking the retry
        // that is the convergence path — a later attempt re-suspends by ADOPTING this
        // snapshot, so its cancel restores these exact rows. Log the token so the state is
        // recoverable directly if that never happens.
        logger.error(
          `[deleteUserController] Failed to restore suspended schedules after a cancelled deletion; they remain disabled for user ${user.id} under suspension token ${scheduleSuspensionToken}`,
          restoreError,
        );
      }
    }
    if (triggerDeletionFence != null && !userDeleted) {
      try {
        await cancelAgentTriggerUserPurge(user.id, triggerDeletionFence);
      } catch (purgeFenceError) {
        logger.error(
          '[deleteUserController] Failed to disarm trigger purge recovery',
          purgeFenceError,
        );
      }
      try {
        await db.cancelAgentTriggerUserDeletion(user.id, triggerDeletionFence);
      } catch (fenceError) {
        logger.error('[deleteUserController] Failed to release trigger deletion fence', fenceError);
      }
    }
    logger.error('[deleteUserController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const verifyEmailController = async (req, res) => {
  try {
    const verifyEmailService = await verifyEmail(req);
    if (verifyEmailService instanceof Error) {
      return res.status(400).json({ message: verifyEmailService.message });
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
      return res.status(400).json({ message: result.message });
    } else {
      return res.status(result.status ?? 200).json({ message: result.message });
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

module.exports = {
  getUserController,
  getTermsStatusController,
  acceptTermsController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
  deleteUserMcpServers,
  maybeUninstallOAuthMCP,
};
