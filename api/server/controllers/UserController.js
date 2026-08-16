const mongoose = require('mongoose');
const {
  logger,
  getTenantId,
  webSearchKeys,
  runAsSystem,
  tenantStorage,
  UNREADABLE_ABORT_FENCE,
} = require('@librechat/data-schemas');
const {
  getNewS3URL,
  needsRefresh,
  MCPOAuthHandler,
  MCPTokenStorage,
  getAppConfigOptionsFromUser,
  normalizeHttpError,
  extractWebSearchEnvVars,
  deleteAgentCheckpoints,
  deleteAllSharedLinksWithCleanup,
  registerShutdownTask,
  GenerationJobManager,
} = require('@librechat/api');
const {
  Tools,
  CacheKeys,
  Constants,
  FileSources,
  ResourceType,
} = require('librechat-data-provider');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { verifyOTPOrBackupCode } = require('~/server/services/twoFactorService');
const { verifyEmail, resendVerificationEmail } = require('~/server/services/AuthService');
const { getMCPManager, getFlowStateManager, getMCPServersRegistry } = require('~/config');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { quiesceUserSchedules } = require('~/server/services/Schedules');
const { markUserDeleting } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
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

    // COMMIT to automatic completion BEFORE the barrier goes up. Ordering is the
    // whole guarantee: once the barrier is durable, authentication is refused, so a
    // barrier without a commitment is an unrecoverable lockout (the sweep only
    // consumes committed rows). Committed-without-barrier is inert — nothing
    // consults the marker except the sweep, which requires the barrier too — so a
    // failure HERE refuses cleanly while the user is still fully functional.
    let committed = false;
    for (let attempt = 1; attempt <= 3 && !committed; attempt++) {
      try {
        await db.markUserDeletionCommitted(user.id);
        committed = true;
      } catch (error) {
        logger.error(
          `[deleteUserController] Failed to commit deletion (attempt ${attempt}/3)`,
          error,
        );
      }
    }
    if (!committed) {
      return res.status(503).json({
        message: 'Could not start account deletion. Please retry.',
      });
    }

    // Quiesce scheduled chats FIRST: mark all the user's schedules non-claimable
    // (so the engine can't fire a new occurrence mid-cascade) and abort any
    // in-flight loopback runs, so a scheduled generation can't persist messages
    // after the messages/conversations below are deleted. Best-effort — a failure
    // here must not block account deletion (deleteSchedulesByUser still erases rows).
    // BARRIER FIRST, before anything slow. Quiescing takes time, and the whole drain
    // window has to already be refusing new work: a one-shot disable scan cannot close
    // the create race (a schedule created after the scan simply is not in it), so every
    // scheduling admission consults this durable user-level flag instead. Raising it
    // also invalidates the auth user-doc cache, without which the barrier would only be
    // as strong as the shortest cache TTL.
    let barrierRaised = true;
    try {
      await markUserDeleting(user.id);
    } catch (error) {
      barrierRaised = false;
      logger.error('[deleteUserController] Failed to raise the deletion barrier', error);
    }
    if (!barrierRaised) {
      // FAIL CLOSED. Without the barrier we cannot promise that admission is refused for
      // the rest of the cascade, so destroying now could let concurrently-created work
      // outlive the account. Refuse rather than proceed on an unenforced guarantee.
      return res.status(503).json({
        message: 'Could not start account deletion. Please retry.',
      });
    }

    const quiesced = await quiesceUserSchedules(user.id).catch((error) => {
      logger.error('[deleteUserController] Failed to quiesce scheduled chats', error);
      return false;
    });
    if (!quiesced) {
      // DEFER rather than destroy on an unconfirmed drain. A scheduled generation that
      // could not be confirmed settled may still persist messages, and deleting now
      // would let it resurrect data for a deleted account. The barrier is durable and
      // stays up, so nothing new accumulates; `getUsersPendingDeletion` makes this a
      // resumable work list for a later pass to finish.
      logger.warn(
        `[deleteUserController] Deferring destructive deletion for ${user.id}: scheduled runs ` +
          'did not confirm settlement. The deletion barrier remains in place.',
      );
      // MUST be non-2xx: the client's delete mutation treats any 2xx as success and
      // calls logout(), so a 202 would log the user out believing the account was gone
      // when it was only deferred. 503 + Retry-After tells the client to try again.
      res.set('Retry-After', '30');
      return res.status(503).json({
        message:
          'Account deletion could not finish because scheduled work is still settling. ' +
          'Please try again shortly.',
      });
    }

    // Same deferral discipline for INTERACTIVE generations: an abort changes the
    // job's status, it does not drain the generation owner's asynchronous message,
    // usage, and balance persistence — cascading now would let those writes recreate
    // records for the deleted account. Any discovered job is aborted and the cascade
    // deferred; the commitment above makes the sweep finish it autonomously.
    const interactiveSettled = await quiesceInteractiveGenerations(user).catch((error) => {
      logger.error('[deleteUserController] Failed to quiesce interactive generations', error);
      return false;
    });
    if (!interactiveSettled) {
      logger.warn(
        `[deleteUserController] Deferring destructive deletion for ${user.id}: interactive ` +
          'generations are still settling. The deletion barrier remains in place.',
      );
      res.set('Retry-After', '30');
      return res.status(503).json({
        message:
          'Account deletion could not finish because active chats are still stopping. ' +
          'Please try again shortly.',
      });
    }

    await executeUserDeletion(user, req.config);
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    logger.error('[deleteUserController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

/**
 * Interactive-generation quiesce: aborts the user's active interactive jobs and
 * reports whether the cascade may proceed. Settlement is NOT provable within the
 * pass that aborts — a job leaves the active set the moment the abort CAS lands,
 * BEFORE the generation owner's asynchronous message/usage/balance writes drain —
 * so ANY discovered job (and any unreadable store: fail closed) defers the cascade
 * to a later pass. By the next pass the aborted owners have long unwound, and the
 * auth barrier guarantees nothing new started in between; an empty enumeration is
 * then a real settlement signal, not a race. Cross-replica delivery of the abort
 * remains unconfirmed by design (see FOLLOWUPS) — the deferral bounds that window
 * to the sweep interval instead of racing the cascade against it.
 */
/**
 * Settlement attempt for one durable abort fence — a deletion-side abort whose signal
 * provably never left the aborting replica. The shared job went terminal at the abort
 * CAS, so the peer OWNER may still be generating with nothing in the active set to
 * show for it; the fence is the evidence, and it clears only on an acknowledgeable
 * outcome: the publish finally leaves this replica (delivered or republished), or the
 * job is gone/reassigned (the owner finished and cleaned up, so its writes are done).
 * Anything else keeps the fence and defers.
 */
const settleAbortFence = async (user, streamId) => {
  if (streamId === UNREADABLE_ABORT_FENCE) {
    return false;
  }
  let job;
  try {
    job = await GenerationJobManager.getJob(streamId);
  } catch (error) {
    logger.warn(`[quiesceInteractiveGenerations] Could not read job ${streamId}`, error);
    return false;
  }
  // OWNERSHIP from the facade's metadata, not the top level: getJob returns a
  // GenerationJob whose owner lives at `metadata.userId`, so comparing `job.userId`
  // read undefined and cleared every fence as "reassigned" without ever re-signalling.
  const ownerId = job?.metadata?.userId;
  const ownerTenantId = job?.metadata?.tenantId;
  if (
    job == null ||
    ownerId !== user.id ||
    (ownerTenantId ?? undefined) !== (user.tenantId ?? undefined)
  ) {
    await db.clearUserAbortFence(user.id, streamId).catch((err) => {
      logger.warn(`[quiesceInteractiveGenerations] Failed to clear fence ${streamId}`, err);
    });
    return false;
  }
  // EVERY status whose owner is still persisting is unsettled — complete, error,
  // AND aborted (the Stop route's checkpoint prune / partial save run behind the
  // abort CAS), plus a barrier-held pause. Keep the fence and defer: the owner
  // clears the flag when its writes land, and stale-owner recovery bounds the wait.
  if (job.terminalPersistencePending === true) {
    return false;
  }
  if (job.status === 'running' || job.status === 'requires_action') {
    // Live again despite terminal-at-CAS bookkeeping: re-abort and keep the fence.
    await GenerationJobManager.abortJob(streamId).catch(() => undefined);
    return false;
  }
  if (job.status === 'complete' || job.status === 'error') {
    // The generation reached its OWN terminal — the run ended by its own means, so
    // there is no stop left to deliver and re-signalling (aborted-only) could never
    // clear this fence; it would sit permanent, deferring deletion forever. Any
    // post-terminal billed work is what the owner-finalization markers above fence.
    await db.clearUserAbortFence(user.id, streamId).catch((err) => {
      logger.warn(`[quiesceInteractiveGenerations] Failed to clear fence ${streamId}`, err);
    });
    return false;
  }
  const resignal = await GenerationJobManager.resignalAbort(streamId, job.createdAt).catch(() => ({
    delivered: false,
    published: false,
  }));
  if (!resignal.delivered && !resignal.published) {
    return false;
  }
  try {
    await db.clearUserAbortFence(user.id, streamId);
  } catch (error) {
    // The signal left, but the fence is still durable: report unsettled so a later
    // pass retries the clear rather than cascading on an unrecorded acknowledgement.
    logger.warn(`[quiesceInteractiveGenerations] Failed to clear fence ${streamId}`, error);
    return false;
  }
  return true;
};

/**
 * Drains the user's in-flight interactive generations before the destructive cascade.
 *
 * SCOPE: this covers work enrolled in GenerationJobManager — the agents chat path and
 * scheduled fires. The remote OpenAI-compatible and Responses controllers run on
 * private per-request abort controllers this quiesce cannot see, so an
 * already-admitted request there (notably Responses `store: true`) can persist
 * conversations/messages/usage after the cascade. That gap predates this barrier
 * (those paths were never drainable) and is tracked as a follow-up (see issue 14594):
 * enrolling them in the job manager so deletion can fence them like everything else.
 */
const quiesceInteractiveGenerations = async (user) => {
  // MARKERS BEFORE THE ACTIVE SCAN — the read order is what makes the admission
  // lease -> durable job handoff atomic from this side. Writers hold the lease
  // strictly until the job is active-set visible, so with leases read FIRST, any
  // interleaving either shows the lease here or the job below; jobs-first allowed
  // a request to create its job after this scan and release its lease before the
  // count, hiding both. The count itself gates settlement further down; this early
  // read only has to ORDER before the job scan.
  const earlyPendingOwnerWork = await GenerationJobManager.countUserFinalizations(
    user.id,
    user.tenantId,
  );
  // A writer whose replica temporarily loses the primary lease store promotes its
  // hold into Mongo before the primary TTL can expire. Read that fallback before the
  // active scan for the same lease-to-job handoff ordering used above.
  const earlyFallbackOwnerWork = await db.countUserFinalizationFallbackLeases(user.id);
  const activeJobIds = await GenerationJobManager.getActiveJobIdsForUser(user.id, user.tenantId);
  for (const streamId of activeJobIds ?? []) {
    // FENCE BEFORE THE CAS. An abort transitions the shared job to terminal, which
    // hides it from every later active-set scan; if the signal then turns out never
    // to have left this replica, the only thing standing between a still-generating
    // peer and the destructive cascade is this record. Stamping it first makes a
    // write failure harmless — nothing has been aborted yet, so refusing simply
    // defers. (Cleared below the moment the abort is acknowledged, so the common
    // case leaves nothing behind.)
    try {
      await db.addUserAbortFence(user.id, streamId);
    } catch (error) {
      logger.warn(
        `[quiesceInteractiveGenerations] Deferring ${user.id}: could not fence abort of ${streamId}`,
        error,
      );
      return false;
    }
    const result = await GenerationJobManager.abortJob(streamId).catch((err) => {
      logger.warn(`[quiesceInteractiveGenerations] Failed to abort active job ${streamId}`, err);
      return null;
    });
    // Clearing requires POSITIVE evidence — a won abort whose signal fields say the
    // stop was delivered or at least left this replica. Everything else is
    // inconclusive: a THROW can land after the terminal CAS (content refresh, required
    // persistence, publication), and a `success: false` result carries NO signal
    // fields at all (job already terminal — e.g. a concurrent Stop whose own publish
    // failed — or a lost CAS), so testing `!== false` read those absent fields as
    // acknowledgement and cleared the one record standing between a still-generating
    // peer and the destructive cascade. Keep the fence: this pass defers on the
    // active-set check below, and `settleAbortFence` re-signals and settles it on a
    // later pass (or in the deferred-deletion sweep) — including clearing it for a
    // run that reached its own complete/error terminal, so fences never go permanent.
    const acknowledged =
      result?.success === true &&
      (result.signalDelivered !== false || result.signalPublished !== false);
    if (acknowledged) {
      await db.clearUserAbortFence(user.id, streamId).catch((err) => {
        logger.warn(`[quiesceInteractiveGenerations] Failed to clear fence ${streamId}`, err);
      });
    } else {
      await GenerationJobManager.resignalAbort(streamId).catch(() => undefined);
    }
  }
  if (activeJobIds?.length) {
    return false;
  }
  // Settlement needs positive evidence, not an empty active set: the success path
  // completes its job fire-and-forget and then runs the deferred title, whose billed
  // balance/transaction writes land AFTER the job left the set, and a deletion-side
  // abort can win its CAS without its signal ever leaving this replica. Two fences
  // cover those: TTL-bounded job-store markers the OWNER clears once its writes land,
  // and durable (TTL-free, so an outage can never read as settlement) abort fences on
  // the user document. Multi-replica deployments require the Redis job store (see
  // isTopologySafeToArm), where the owner markers are cross-replica visible.
  const pendingOwnerWork =
    earlyPendingOwnerWork > 0
      ? earlyPendingOwnerWork
      : await GenerationJobManager.countUserFinalizations(user.id, user.tenantId);
  if (pendingOwnerWork > 0) {
    logger.info(
      `[quiesceInteractiveGenerations] ${pendingOwnerWork} owner finalization(s) still landing for ${user.id}`,
    );
    return false;
  }
  const fallbackOwnerWork =
    earlyFallbackOwnerWork > 0
      ? earlyFallbackOwnerWork
      : await db.countUserFinalizationFallbackLeases(user.id);
  if (fallbackOwnerWork > 0) {
    logger.info(
      `[quiesceInteractiveGenerations] ${fallbackOwnerWork} fallback finalization(s) still landing for ${user.id}`,
    );
    return false;
  }
  const fences = await db.getUserAbortFences(user.id);
  if (fences.length === 0) {
    return true;
  }
  let allSettled = true;
  for (const streamId of fences) {
    const settled = await settleAbortFence(user, streamId);
    allSettled = allSettled && settled;
  }
  if (!allSettled) {
    logger.info(
      `[quiesceInteractiveGenerations] unacknowledged abort(s) still fencing ${user.id}; deferring`,
    );
  }
  return allSettled;
};

/**
 * The destructive account-deletion cascade. Runs only AFTER the durable barrier is up
 * and BOTH quiesces (scheduled runs, interactive generations) confirmed settlement.
 * Shared by the interactive controller and the deferred-deletion sweep: a quiesce that
 * could not confirm defers with the barrier still raised, and authentication is
 * refused behind the barrier, so no client retry can ever arrive — the sweep is the
 * promised retry.
 */
const executeUserDeletion = async (user, providedAppConfig) => {
  const appConfig =
    providedAppConfig ??
    (await getAppConfig({
      role: user.role,
      userId: user.id,
      tenantId: user.tenantId,
    }));
  /** Minimal request shim for the file-deletion service (reads user, config, body). */
  const req = { user, config: appConfig, body: {} };
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
    await deleteAgentCheckpoints(
      convoDeletion?.conversationIds,
      appConfig?.endpoints?.agents?.checkpointer,
    );
  } catch (error) {
    logger.error('[executeUserDeletion] Error deleting user convos, likely no convos', error);
  }
  await deleteUserPluginAuth(user.id, null, true);
  await db.deleteSchedulesByUser(user.id);
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
  // The user document goes LAST: it is the retry marker. Every step above is an
  // idempotent bulk delete, so an interruption (crash, SIGTERM mid-sweep) leaves the
  // document and its deletion markers in place and the next pass re-runs the whole
  // cascade; deleting the document earlier made everything after it unreachable —
  // getUsersPendingDeletion could no longer rediscover the account, permanently
  // orphaning shared links, files, agents, and the rest. Authentication is refused
  // behind the barrier the whole time, so the surviving document admits nothing.
  await db.deleteUserById(user.id);
  logger.info(`User deleted account. Email: ${user.email} ID: ${user.id}`);
};

/** Deferred deletions retried per sweep pass; small — deferral is a rare race. */
const PENDING_DELETION_BATCH = 5;
/** Head start for the interactive request that raised the barrier (or a local-auth
 *  retry) before the sweep competes with it. */
const PENDING_DELETION_MIN_AGE_MS = 60_000;

/**
 * Finishes account deletions that deferred on an unconfirmed schedule quiesce. The
 * barrier is durable and blocks authentication, so without this pass a deferred
 * OpenID account stays locked-but-undeleted with no way to issue the promised retry.
 * Every step is idempotent and the window rotates, so concurrent workers are safe.
 */
const processPendingUserDeletions = async () => {
  // System context for the cross-tenant scan and stamp; strict tenant isolation
  // would otherwise throw on this timer-driven pass (no request, no ALS context)
  // and every deferred user would stay locked behind the barrier forever.
  const pending = await runAsSystem(() => db.getUsersPendingDeletion(PENDING_DELETION_BATCH));
  const due = pending.filter(
    (user) =>
      user.deletionRequestedAt != null &&
      Date.now() - new Date(user.deletionRequestedAt).getTime() >= PENDING_DELETION_MIN_AGE_MS,
  );
  if (due.length === 0) {
    return;
  }
  await runAsSystem(() =>
    db.markDeletionSweepAttempted(due.map((user) => user._id.toString())),
  ).catch((err) => logger.warn('[processPendingUserDeletions] Failed to stamp attempts', err));
  for (const pendingUser of due) {
    const user = { ...pendingUser, id: pendingUser._id.toString() };
    // Each user's quiesce + cascade runs in THEIR tenant context, matching the
    // interactive controller's request-scoped context.
    await tenantStorage.run({ tenantId: user.tenantId, userId: user.id }, async () => {
      try {
        // RE-ESTABLISH the auth-cache fence before cascading. markUserDeleting can
        // stamp Mongo and then throw on its REQUIRED invalidation; the controller
        // 503s, but both markers already exist, so this sweep would otherwise run
        // the cascade behind a fence that was never confirmed — a surviving cached
        // document could admit a generation that outlives the sweep delay. The call
        // is idempotent (monotonic stamp) and fail-closed; a throw defers this user
        // to a later pass with the barrier still up.
        try {
          await db.markUserDeleting(user.id);
        } catch (fenceError) {
          logger.warn(
            `[processPendingUserDeletions] Deferring ${user.id}: auth-cache fence could not be established`,
            fenceError,
          );
          return;
        }
        const quiesced = await quiesceUserSchedules(user.id).catch((error) => {
          logger.error(`[processPendingUserDeletions] Quiesce failed for ${user.id}`, error);
          return false;
        });
        if (!quiesced) {
          logger.warn(
            `[processPendingUserDeletions] Deferring ${user.id} again: scheduled runs did not confirm settlement`,
          );
          return;
        }
        const interactiveSettled = await quiesceInteractiveGenerations(user).catch((error) => {
          logger.error(
            `[processPendingUserDeletions] Interactive quiesce failed for ${user.id}`,
            error,
          );
          return false;
        });
        if (!interactiveSettled) {
          logger.warn(
            `[processPendingUserDeletions] Deferring ${user.id} again: interactive generations are still settling`,
          );
          return;
        }
        await executeUserDeletion(user);
      } catch (error) {
        logger.error(`[processPendingUserDeletions] Cascade failed for ${user.id}`, error);
      }
    });
  }
};

const PENDING_DELETION_SWEEP_INTERVAL_MS = 5 * 60_000;
let pendingDeletionSweepStarted = false;
let pendingDeletionSweepStopped = false;
/** The in-flight pass, so graceful shutdown can drain it instead of truncating a
 *  cascade mid-write. The user-document-last ordering makes even a hard kill
 *  recoverable; this keeps the ORDERLY path from relying on that backstop. */
let activePendingDeletionPass = null;

/** Idempotent per process; safe in every worker (the pass itself is idempotent). */
const startPendingDeletionSweep = () => {
  if (pendingDeletionSweepStarted) {
    return;
  }
  pendingDeletionSweepStarted = true;
  // Production disables Mongoose autoIndex, so the partial
  // (deletionSweepAt, deletionRequestedAt) index the sweep scans on is never built
  // there by schema declaration alone — build it explicitly, best-effort.
  db.ensureUserDeletionIndexes?.().catch((err) =>
    logger.warn('[startPendingDeletionSweep] Failed to ensure deletion indexes', err),
  );
  const run = () => {
    if (pendingDeletionSweepStopped) {
      return;
    }
    activePendingDeletionPass = processPendingUserDeletions()
      .catch((err) => logger.error('[startPendingDeletionSweep] Sweep pass failed', err))
      .finally(() => {
        activePendingDeletionPass = null;
      });
  };
  const timer = setInterval(run, PENDING_DELETION_SWEEP_INTERVAL_MS);
  timer.unref?.();
  setTimeout(run, PENDING_DELETION_MIN_AGE_MS).unref?.();
  registerShutdownTask('pending deletion sweep', async () => {
    pendingDeletionSweepStopped = true;
    clearInterval(timer);
    if (activePendingDeletionPass) {
      await activePendingDeletionPass;
    }
  });
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

/** Best-effort cleanup of stored MCP OAuth tokens and flow state. */
const clearStoredMCPOAuthState = async (userId, serverName) => {
  try {
    await MCPTokenStorage.deleteUserTokens({
      userId,
      serverName,
      deleteToken: async (filter) => {
        await db.deleteTokens(filter);
      },
    });
  } catch (error) {
    logger.warn(
      `[clearStoredMCPOAuthState] Failed to delete MCP OAuth tokens for ${serverName}:`,
      error,
    );
  }

  try {
    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const baseFlowId = MCPOAuthHandler.generateFlowId(userId, serverName);
    const tenantId = getTenantId();
    const tokenFlowId = MCPOAuthHandler.generateTokenFlowId(userId, serverName, tenantId);
    const oauthFlowId = MCPOAuthHandler.generateFlowId(userId, serverName, tenantId);
    const flowDeletes = [
      [tokenFlowId, 'mcp_get_tokens'],
      [oauthFlowId, 'mcp_oauth'],
      [baseFlowId, 'mcp_get_tokens'],
      [baseFlowId, 'mcp_oauth'],
    ].filter(
      ([flowId, type], index, deletes) =>
        deletes.findIndex(([candidateId, candidateType]) => {
          return candidateId === flowId && candidateType === type;
        }) === index,
    );
    const results = await Promise.allSettled(
      flowDeletes.map(([flowId, type]) =>
        type === 'mcp_oauth'
          ? MCPOAuthHandler.deleteFlowAndStateMapping(flowId, flowManager)
          : flowManager.deleteFlow(flowId, type),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(
          `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
          result.reason,
        );
      }
    }
  } catch (error) {
    logger.warn(
      `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
      error,
    );
  }
};

/** Revokes MCP OAuth tokens at the provider when possible, then clears local state. */
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
  if (!oauthServers.has(serverName) || !serverConfig) {
    await clearStoredMCPOAuthState(userId, serverName);
    return;
  }

  // 1. get client info used for revocation (client id, secret)
  let clientTokenData = null;
  try {
    clientTokenData = await MCPTokenStorage.getClientInfoAndMetadata({
      userId,
      serverName,
      findToken: db.findToken,
    });
  } catch (error) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth client metadata for ${serverName}; clearing local MCP OAuth state only.`,
      error,
    );
    await clearStoredMCPOAuthState(userId, serverName);
    return;
  }
  if (clientTokenData == null) {
    logger.info(
      `[maybeUninstallOAuthMCP] Missing OAuth client metadata for ${serverName}; clearing local MCP OAuth state only.`,
    );
    await clearStoredMCPOAuthState(userId, serverName);
    return;
  }
  const { clientInfo, clientMetadata } = clientTokenData;
  const storedServerUrl = clientMetadata.server_url;
  const storedClientSource = clientMetadata.client_source;
  if (
    typeof storedServerUrl !== 'string' ||
    typeof clientMetadata.token_endpoint !== 'string' ||
    typeof clientMetadata.revocation_endpoint !== 'string' ||
    typeof clientMetadata.credential_set_id !== 'string' ||
    (storedClientSource !== 'configured' && storedClientSource !== 'dynamic')
  ) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Stored OAuth binding metadata is incomplete for ${serverName}; clearing local MCP OAuth state without remote revocation.`,
    );
    await clearStoredMCPOAuthState(userId, serverName);
    return;
  }

  // 2. get decrypted tokens before deletion
  let tokens = null;
  try {
    tokens = await MCPTokenStorage.getTokens({
      userId,
      serverName,
      findToken: db.findToken,
    });
    if (tokens) {
      MCPTokenStorage.assertCredentialSetBinding(
        serverName,
        tokens.credential_set_id,
        clientMetadata,
      );
    }
  } catch (error) {
    tokens = null;
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth tokens for ${serverName}; clearing local token state.`,
      error,
    );
  }

  // 3. revoke OAuth tokens at the provider
  const revocationEndpoint = clientMetadata.revocation_endpoint;
  const revocationEndpointAuthMethodsSupported =
    clientMetadata.revocation_endpoint_auth_methods_supported;
  const oauthHeaders = serverConfig.oauth_headers ?? {};
  // Use the request's merged (tenant/principal-scoped) allowlists so admin-panel mcpSettings
  // overrides are honored for OAuth revocation, consistent with inspection/connection.
  const allowedDomains = appConfig?.mcpSettings?.allowedDomains;
  const allowedAddresses = appConfig?.mcpSettings?.allowedAddresses;

  if (tokens?.access_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.access_token,
        'access',
        {
          serverUrl: storedServerUrl,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(
        `[maybeUninstallOAuthMCP] Error revoking OAuth access token for ${serverName}:`,
        error,
      );
    }
  }

  if (tokens?.refresh_token) {
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        tokens.refresh_token,
        'refresh',
        {
          serverUrl: storedServerUrl,
          clientId: clientInfo.client_id,
          clientSecret: clientInfo.client_secret ?? '',
          revocationEndpoint,
          revocationEndpointAuthMethodsSupported,
        },
        oauthHeaders,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(
        `[maybeUninstallOAuthMCP] Error revoking OAuth refresh token for ${serverName}:`,
        error,
      );
    }
  }

  // 4. delete tokens from the DB and clear the flow state after revocation attempts
  await clearStoredMCPOAuthState(userId, serverName);
};

module.exports = {
  processPendingUserDeletions,
  startPendingDeletionSweep,
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
