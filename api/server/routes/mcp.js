const { Router } = require('express');
const {
  logger,
  getTenantId,
  tenantStorage,
  digestMCPAuthorityValue,
  MCPAuthorityProofError,
} = require('@librechat/data-schemas');
const {
  CacheKeys,
  Constants,
  Permissions,
  PermissionBits,
  PermissionTypes,
} = require('librechat-data-provider');
const {
  getBasePath,
  createSafeUser,
  MCPOAuthHandler,
  MCPTokenStorage,
  setOAuthSession,
  PENDING_STALE_MS,
  getUserMCPAuthMap,
  validateOAuthCsrf,
  OAUTH_CSRF_COOKIE,
  setOAuthCsrfCookie,
  generateCheckAccess,
  validateOAuthSession,
  OAUTH_SESSION_COOKIE,
  mcpConfig: mcpSettings,
} = require('@librechat/api');
const {
  createMCPServerController,
  updateMCPServerController,
  deleteMCPServerController,
  getMCPServersList,
  getMCPServerById,
  getMCPTools,
} = require('~/server/controllers/mcp');
const {
  getOAuthReconnectionManager,
  getMCPServersRegistry,
  getFlowStateManager,
  getMCPManager,
} = require('~/config');
const {
  getServerConnectionStatus,
  resolveConfigServers,
  getMCPSetupData,
  userCanUseMCPServersFresh,
} = require('~/server/services/MCP');
const { requireJwtAuth, canAccessMCPServerResource } = require('~/server/middleware');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { updateMCPServerTools } = require('~/server/services/Config/mcp');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const {
  resolveCurrentMCPDiscoveryScope,
  resolveCurrentMCPToolAuthority,
} = require('~/server/services/MCPDiscoveryScope');
const { getMCPAuthorityResolver } = require('~/server/services/MCPAuthority');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const router = Router();

const OAUTH_CSRF_COOKIE_PATH = '/api/mcp';

class MCPAuthorityChangedError extends Error {}

const getOAuthFlowId = (userId, serverName, tenantId = getTenantId()) =>
  MCPOAuthHandler.generateFlowId(userId, serverName, tenantId);

const canAccessOAuthFlow = (flowId, userId) => {
  const parsed = MCPOAuthHandler.parseFlowId(flowId);
  if (!parsed) {
    return false;
  }
  if (parsed.tenantId && parsed.tenantId !== getTenantId()) {
    return false;
  }
  return parsed.userId === userId;
};

const clearGetTokensFlow = async ({ flowManager, flowId, tokens }) => {
  const state = await flowManager.getFlowState(flowId, 'mcp_get_tokens');
  if (state?.type === 'mcp_get_tokens' && state.status === 'PENDING') {
    await flowManager.completeFlow(flowId, 'mcp_get_tokens', tokens);
    return;
  }
  await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
};

const matchesOAuthFlowAuthority = (captured, current, allowOAuthGrantChange = false) =>
  captured != null &&
  current != null &&
  captured.tenant === current.tenant &&
  captured.principal === current.principal &&
  captured.server === current.server &&
  captured.policy === current.policy &&
  captured.config === current.config &&
  (allowOAuthGrantChange || captured.credentials === current.credentials);

async function rejectStaleOAuthFlow({ flowManager, flowId, state, reason }) {
  await flowManager.failFlow(flowId, 'mcp_oauth', reason);
  await MCPOAuthHandler.deleteStateMapping(state, flowManager);
}

async function validateOAuthFlowAuthority({
  flowManager,
  flowId,
  flowState,
  user,
  serverName,
  allowOAuthGrantChange = false,
  schemas = null,
}) {
  if (flowState.userId === 'system') {
    await rejectStaleOAuthFlow({
      flowManager,
      flowId,
      state: flowState.state,
      reason: 'System MCP OAuth is unavailable without proof-backed operator authority',
    });
    throw new MCPAuthorityChangedError('System MCP OAuth is unavailable');
  }
  const currentAuthority = await resolveCurrentMCPToolAuthority({
    user,
    serverName,
    schemas,
    oauthRequiredHint: true,
    allowMissingAuthorization: true,
  });
  const parsedConfig = currentAuthority?.parsedConfig;
  if (
    parsedConfig?.catalogScope &&
    (await userCanUseMCPServersFresh(parsedConfig.actor.user)) &&
    matchesOAuthFlowAuthority(
      flowState.authorityScope,
      parsedConfig.catalogScope,
      allowOAuthGrantChange,
    )
  ) {
    return currentAuthority;
  }
  await rejectStaleOAuthFlow({
    flowManager,
    flowId,
    state: flowState.state,
    reason: 'MCP authority changed during OAuth',
  });
  throw new MCPAuthorityChangedError(
    `Current MCP authority changed during OAuth for ${serverName}`,
  );
}

const checkMCPUsePermissions = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const checkMCPCreate = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName: db.getRoleByName,
});

/**
 * Get all MCP tools available to the user
 * Returns only MCP tools, completely decoupled from regular LibreChat tools
 */
router.get('/tools', requireJwtAuth, checkMCPUsePermissions, async (req, res) => {
  return getMCPTools(req, res);
});

/**
 * Initiate OAuth flow
 * This endpoint is called when the user clicks the auth link in the UI
 */
router.get('/:serverName/oauth/initiate', requireJwtAuth, setOAuthSession, async (req, res) => {
  try {
    const { serverName } = req.params;
    const { userId, flowId } = req.query;
    const user = req.user;
    const tenantId = user?.tenantId ?? getTenantId();

    // Verify the userId matches the authenticated user
    if (typeof userId !== 'string' || userId !== user.id) {
      return res.status(403).json({ error: 'User mismatch' });
    }

    const expectedFlowId = getOAuthFlowId(user.id, serverName, tenantId);
    if (typeof flowId !== 'string' || flowId !== expectedFlowId) {
      logger.error('[MCP OAuth] Invalid flow ID for initiate request', {
        serverName,
        userId,
        flowId,
        expectedFlowId,
      });
      return res.status(403).json({ error: 'Flow mismatch' });
    }

    logger.debug('[MCP OAuth] Initiate request', { serverName, userId, flowId });

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    /** Flow state to retrieve OAuth config */
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      logger.error('[MCP OAuth] Flow state not found', { flowId });
      return res.status(404).json({ error: 'Flow not found' });
    }

    const {
      authorizationUrl: storedAuthorizationUrl,
      serverName: flowServerName,
      userId: flowUserId,
    } = flowState.metadata || {};

    if (flowUserId && flowUserId !== user.id) {
      logger.error('[MCP OAuth] Flow user mismatch', { flowId, userId, flowUserId });
      return res.status(403).json({ error: 'User mismatch' });
    }

    if (flowServerName && flowServerName !== serverName) {
      logger.error('[MCP OAuth] Flow server mismatch', { flowId, serverName, flowServerName });
      return res.status(400).json({ error: 'Invalid flow state' });
    }

    const pendingAge = flowState.createdAt ? Date.now() - flowState.createdAt : Infinity;
    const isFreshPendingFlow = flowState.status === 'PENDING' && pendingAge < PENDING_STALE_MS;
    if (!isFreshPendingFlow) {
      logger.error('[MCP OAuth] Flow is not active for initiation', {
        flowId,
        status: flowState.status,
        pendingAge,
      });
      return res.status(400).json({ error: 'Invalid flow state' });
    }
    const initiationAuthority = await validateOAuthFlowAuthority({
      flowManager,
      flowId,
      flowState: flowState.metadata,
      user,
      serverName,
      schemas:
        typeof storedAuthorizationUrl === 'string' && storedAuthorizationUrl.length > 0
          ? { storedAuthorizationUrl }
          : null,
    });

    if (typeof storedAuthorizationUrl === 'string' && storedAuthorizationUrl.length > 0) {
      return await getMCPAuthorityResolver().useIssuedResolution(
        initiationAuthority,
        async (current) => {
          logger.debug('[MCP OAuth] Reusing stored authorization URL', {
            serverName: current.parsedConfig.serverName,
            userId: current.parsedConfig.actor.userId,
            flowId,
          });
          setOAuthCsrfCookie(res, flowId, OAUTH_CSRF_COOKIE_PATH);
          return res.redirect(current.schemas.storedAuthorizationUrl);
        },
      );
    }

    const initiationResult = await getMCPAuthorityResolver().useIssuedResolution(
      initiationAuthority,
      async (current) => {
        const parsedConfig = current.parsedConfig;
        const currentServerUrl = parsedConfig.effectiveConfig?.url;
        const currentOAuthConfig =
          parsedConfig.effectiveConfig?.oauth ?? parsedConfig.sourceConfig.oauth;
        if (!currentServerUrl || !currentOAuthConfig) {
          throw new MCPAuthorityChangedError(
            `Current OAuth configuration is unavailable for ${parsedConfig.serverName}`,
          );
        }
        return await MCPOAuthHandler.initiateOAuthFlow(
          parsedConfig.serverName,
          currentServerUrl,
          parsedConfig.actor.userId,
          parsedConfig.effectiveConfig.oauth_headers ?? {},
          currentOAuthConfig,
          parsedConfig.securityPolicy.allowedDomains,
          undefined,
          parsedConfig.securityPolicy.allowedAddresses,
          parsedConfig.actor.tenantId,
        );
      },
    );

    const initiationParsedConfig = initiationAuthority.parsedConfig;
    const publicationAuthority = await resolveCurrentMCPToolAuthority({
      user: initiationParsedConfig.actor.user,
      serverName: initiationParsedConfig.serverName,
      schemas: {
        initiationResult,
        previousState: flowState.metadata?.state ?? null,
      },
      oauthRequiredHint: true,
      allowMissingAuthorization: true,
      bounded: true,
      expectedServerConfig: initiationParsedConfig.sourceConfig,
    });
    if (
      !publicationAuthority ||
      !matchesOAuthFlowAuthority(
        initiationParsedConfig.catalogScope,
        publicationAuthority.parsedConfig.catalogScope,
      )
    ) {
      throw new MCPAuthorityChangedError(`MCP authority changed during OAuth initiation`);
    }
    return await getMCPAuthorityResolver().useIssuedResolution(
      publicationAuthority,
      async (current) => {
        const parsedConfig = current.parsedConfig;
        const {
          authorizationUrl,
          flowId: oauthFlowId,
          flowMetadata,
        } = current.schemas.initiationResult;
        logger.debug('[MCP OAuth] OAuth flow initiated', { oauthFlowId, authorizationUrl });
        if (typeof current.schemas.previousState === 'string') {
          await MCPOAuthHandler.deleteStateMapping(current.schemas.previousState, flowManager);
        }
        const metadataWithUrl = {
          ...flowMetadata,
          authorizationUrl,
          tenantId: parsedConfig.actor.tenantId,
          role: parsedConfig.actor.user.role,
          authorityScope: parsedConfig.catalogScope,
        };
        await flowManager.initFlow(oauthFlowId, 'mcp_oauth', metadataWithUrl);
        await MCPOAuthHandler.storeStateMapping(flowMetadata.state, oauthFlowId, flowManager);
        setOAuthCsrfCookie(res, oauthFlowId, OAUTH_CSRF_COOKIE_PATH);
        return res.redirect(authorizationUrl);
      },
    );
  } catch (error) {
    logger.error('[MCP OAuth] Failed to initiate OAuth', error);
    res.status(500).json({ error: 'Failed to initiate OAuth' });
  }
});

/**
 * OAuth callback handler
 * This handles the OAuth callback after the user has authorized the application
 */
router.get('/:serverName/oauth/callback', async (req, res) => {
  const basePath = getBasePath();
  try {
    const { serverName } = req.params;
    const { code, state, error: oauthError } = req.query;

    logger.debug('[MCP OAuth] Callback received', {
      serverName,
      code: code ? 'present' : 'missing',
      state,
      error: oauthError,
    });

    if (oauthError) {
      logger.error('[MCP OAuth] OAuth error received', { error: oauthError });
      // Gate failFlow behind callback validation to prevent DoS via leaked state
      if (state && typeof state === 'string') {
        try {
          const flowsCache = getLogStores(CacheKeys.FLOWS);
          const flowManager = getFlowStateManager(flowsCache);
          const flowId = await MCPOAuthHandler.resolveStateToFlowId(state, flowManager);
          if (flowId) {
            const parsed = MCPOAuthHandler.parseFlowId(flowId);
            if (!parsed) {
              logger.warn('[MCP OAuth] Invalid flow ID format for OAuth error callback', {
                flowId,
              });
            } else {
              const hasCsrf = validateOAuthCsrf(req, res, flowId, OAUTH_CSRF_COOKIE_PATH);
              const hasSession = !hasCsrf && validateOAuthSession(req, parsed.userId);
              if (hasCsrf || hasSession) {
                /** A stale mapping can resolve a superseded attempt's state to the
                 *  current flow (deterministic flow ids); only fail the flow this
                 *  error callback actually belongs to */
                const flowMeta = await MCPOAuthHandler.getFlowState(flowId, flowManager);
                if (flowMeta?.state === state) {
                  await flowManager.failFlow(flowId, 'mcp_oauth', String(oauthError));
                  logger.debug('[MCP OAuth] Marked flow as FAILED with OAuth error', {
                    flowId,
                    error: oauthError,
                  });
                } else {
                  logger.warn('[MCP OAuth] Skipping failFlow for superseded OAuth error callback', {
                    flowId,
                  });
                }
              }
            }
          }
        } catch (err) {
          logger.debug('[MCP OAuth] Could not mark flow as failed', err);
        }
      }
      return res.redirect(
        `${basePath}/oauth/error?error=${encodeURIComponent(String(oauthError))}`,
      );
    }

    if (!code || typeof code !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid code');
      return res.redirect(`${basePath}/oauth/error?error=missing_code`);
    }

    if (!state || typeof state !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid state');
      return res.redirect(`${basePath}/oauth/error?error=missing_state`);
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    const flowId = await MCPOAuthHandler.resolveStateToFlowId(state, flowManager);
    if (!flowId) {
      logger.error('[MCP OAuth] Could not resolve state to flow ID', { state });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }
    logger.debug('[MCP OAuth] Resolved flow ID from state', { flowId });

    const parsedFlowId = MCPOAuthHandler.parseFlowId(flowId);
    if (!parsedFlowId) {
      logger.error('[MCP OAuth] Invalid flow ID format', { flowId });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    const hasCsrf = validateOAuthCsrf(req, res, flowId, OAUTH_CSRF_COOKIE_PATH);
    const hasSession = !hasCsrf && validateOAuthSession(req, parsedFlowId.userId);
    let hasActiveFlow = false;
    if (!hasCsrf && !hasSession) {
      const pendingFlow = await flowManager.getFlowState(flowId, 'mcp_oauth');
      const pendingAge = pendingFlow?.createdAt ? Date.now() - pendingFlow.createdAt : Infinity;
      hasActiveFlow = pendingFlow?.status === 'PENDING' && pendingAge < PENDING_STALE_MS;
      if (hasActiveFlow) {
        logger.debug(
          '[MCP OAuth] CSRF/session cookies absent, validating via active PENDING flow',
          {
            flowId,
          },
        );
      }
    }

    if (!hasCsrf && !hasSession && !hasActiveFlow) {
      logger.error(
        '[MCP OAuth] CSRF validation failed: no valid CSRF cookie, session cookie, or active flow',
        {
          flowId,
          hasCsrfCookie: !!req.cookies?.[OAUTH_CSRF_COOKIE],
          hasSessionCookie: !!req.cookies?.[OAUTH_SESSION_COOKIE],
        },
      );
      return res.redirect(`${basePath}/oauth/error?error=csrf_validation_failed`);
    }

    logger.debug('[MCP OAuth] Getting flow state for flowId: ' + flowId);
    const flowState = await MCPOAuthHandler.getFlowState(flowId, flowManager);

    if (!flowState) {
      logger.error('[MCP OAuth] Flow state not found for flowId:', flowId);
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    /**
     * Flow ids are deterministic (userId:serverName), so a stale state mapping
     * can resolve to a newer flow for the same server. The stored state is the
     * only per-attempt nonce; a mismatch means this callback belongs to a
     * superseded authorization attempt and must not consume the current flow.
     */
    if (flowState.state !== state) {
      logger.error('[MCP OAuth] State mismatch for flow', { flowId, serverName });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }
    if (
      parsedFlowId.serverName !== serverName ||
      flowState.serverName !== serverName ||
      flowState.userId !== parsedFlowId.userId
    ) {
      await rejectStaleOAuthFlow({
        flowManager,
        flowId,
        state,
        reason: 'OAuth flow principal or server mismatch',
      });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    logger.debug('[MCP OAuth] Flow state details', {
      serverName: flowState.serverName,
      userId: flowState.userId,
      hasMetadata: !!flowState.metadata,
      hasClientInfo: !!flowState.clientInfo,
      hasCodeVerifier: !!flowState.codeVerifier,
    });

    /** Check if this flow has already been completed (idempotency protection) */
    const currentFlowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (currentFlowState?.status === 'COMPLETED') {
      logger.warn('[MCP OAuth] Flow already completed, preventing duplicate token exchange', {
        flowId,
        serverName,
      });
      return res.redirect(`${basePath}/oauth/success?serverName=${encodeURIComponent(serverName)}`);
    }
    const isStalePendingFlow =
      currentFlowState?.status === 'PENDING' &&
      (!currentFlowState.createdAt || Date.now() - currentFlowState.createdAt >= PENDING_STALE_MS);
    if (currentFlowState?.status === 'FAILED' || isStalePendingFlow) {
      logger.warn('[MCP OAuth] Refusing token exchange for terminal flow', {
        flowId,
        serverName,
        status: currentFlowState.status,
      });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    const normalizeTenantId = (tenantId) => (tenantId == null ? null : String(tenantId));
    const normalizePrincipalValue = (value) => (value == null ? null : String(value));
    const flowTenantId = normalizeTenantId(flowState.tenantId);
    const loadCallbackUser = async () =>
      await tenantStorage.run(
        { tenantId: flowTenantId ?? undefined },
        async () => await db.findUser({ _id: flowState.userId }, 'role tenantId idOnTheSource'),
      );
    const toCallbackUser = (storedUser) => ({
      id: flowState.userId,
      tenantId: normalizeTenantId(storedUser.tenantId) ?? undefined,
      role: storedUser.role,
      idOnTheSource: normalizePrincipalValue(storedUser.idOnTheSource),
    });
    let callbackUser;
    let callbackTenantId = flowTenantId;
    let storedCredentialSetId;
    let preExchangeAuthority;
    let postStoreAuthority;
    let preStoreRuntimeAuthorityRevision;
    const removeStoredOAuthGeneration = async () => {
      if (!storedCredentialSetId) {
        return;
      }
      const credentialSetId = storedCredentialSetId;
      storedCredentialSetId = undefined;
      try {
        await db.deleteTokens({
          userId: flowState.userId,
          metadataCredentialSetId: credentialSetId,
        });
      } catch (cleanupError) {
        logger.error('[MCP OAuth] Failed to remove revoked credential generation', cleanupError);
      }
    };
    const runStoredAuthorityFence = async (fence) => {
      try {
        return await fence();
      } catch (error) {
        if (error instanceof MCPAuthorityChangedError || error instanceof MCPAuthorityProofError) {
          await removeStoredOAuthGeneration();
        }
        throw error;
      }
    };
    const validateStoredOAuthAuthority = async (user, schemas = null) => {
      try {
        const authority = await validateOAuthFlowAuthority({
          flowManager,
          flowId,
          flowState,
          user,
          serverName,
          allowOAuthGrantChange: true,
          schemas,
        });
        const parsedConfig = authority.parsedConfig;
        if (
          preStoreRuntimeAuthorityRevision &&
          digestMCPAuthorityValue({
            authorizationKind: parsedConfig.authorization.kind,
            customUserVars: parsedConfig.customUserVars ?? {},
            effectiveServerConfig: parsedConfig.effectiveConfig,
          }) !== preStoreRuntimeAuthorityRevision
        ) {
          throw new MCPAuthorityChangedError(
            `Current MCP runtime authority changed during OAuth for ${serverName}`,
          );
        }
        return authority;
      } catch (error) {
        await removeStoredOAuthGeneration();
        throw error;
      }
    };
    if (!flowState.userId) {
      throw new Error(`OAuth callback user scope is unavailable for ${serverName}`);
    }
    if (flowState.userId === 'system') {
      await rejectStaleOAuthFlow({
        flowManager,
        flowId,
        state: flowState.state,
        reason: 'System MCP OAuth callbacks are disabled without operator authority',
      });
      throw new MCPAuthorityChangedError('System MCP OAuth callbacks are unavailable');
    }
    {
      let storedUser;
      try {
        storedUser = await loadCallbackUser();
      } catch (error) {
        throw new Error(`Current user scope is unavailable for ${serverName}`, { cause: error });
      }
      if (!storedUser) {
        throw new Error(`Current user scope was not found for ${serverName}`);
      }
      callbackTenantId = normalizeTenantId(storedUser.tenantId);
      if (flowTenantId !== callbackTenantId) {
        throw new Error(`Current tenant scope changed during OAuth for ${serverName}`);
      }
      callbackUser = toCallbackUser(storedUser);
      preExchangeAuthority = await tenantStorage.run(
        { tenantId: callbackTenantId ?? undefined },
        async () =>
          await validateOAuthFlowAuthority({
            flowManager,
            flowId,
            flowState,
            user: callbackUser,
            serverName,
          }),
      );
    }

    logger.debug('[MCP OAuth] Completing OAuth flow');
    await tenantStorage.run({ tenantId: callbackTenantId ?? undefined }, async () => {
      const oauthHeaders = preExchangeAuthority.parsedConfig.effectiveConfig.oauth_headers ?? {};
      const tokens = await MCPOAuthHandler.completeOAuthFlow(
        flowId,
        code,
        flowManager,
        oauthHeaders,
        async (exchangedTokens) => {
          if (!flowState?.userId) {
            return exchangedTokens;
          }

          let preStoreAuthority;
          if (callbackUser) {
            let currentStoredUser;
            try {
              currentStoredUser = await loadCallbackUser();
            } catch (error) {
              throw new Error(`Current user scope is unavailable for ${serverName}`, {
                cause: error,
              });
            }
            if (!currentStoredUser) {
              throw new Error(`Current user scope was not found for ${serverName}`);
            }
            const currentCallbackUser = toCallbackUser(currentStoredUser);
            if (
              normalizeTenantId(currentCallbackUser.tenantId) !== callbackTenantId ||
              normalizePrincipalValue(currentCallbackUser.role) !==
                normalizePrincipalValue(callbackUser.role) ||
              currentCallbackUser.idOnTheSource !== callbackUser.idOnTheSource
            ) {
              throw new Error(`Current principal scope changed during OAuth for ${serverName}`);
            }
            const storedClientMetadata = MCPOAuthHandler.buildStoredClientMetadata(
              flowState.metadata,
              flowState.resourceMetadata,
              flowState.serverUrl,
              flowState.clientSource,
            );
            preStoreAuthority = await validateOAuthFlowAuthority({
              flowManager,
              flowId,
              flowState,
              user: currentCallbackUser,
              serverName,
              schemas: {
                exchangedTokens,
                clientInfo: flowState.clientInfo,
                storedClientMetadata,
              },
            });
            const preStoreParsedConfig = preStoreAuthority.parsedConfig;
            preStoreRuntimeAuthorityRevision = digestMCPAuthorityValue({
              authorizationKind: preStoreParsedConfig.authorization.kind,
              customUserVars: preStoreParsedConfig.customUserVars ?? {},
              effectiveServerConfig: preStoreParsedConfig.effectiveConfig,
            });
          }

          let storedTokens;
          try {
            if (!preStoreAuthority) {
              throw new MCPAuthorityChangedError(
                `Pre-store MCP authority is unavailable for ${serverName}`,
              );
            }
            storedTokens =
              (await getMCPAuthorityResolver().useIssuedResolution(
                preStoreAuthority,
                async (current) => {
                  const parsedConfig = current.parsedConfig;
                  return await MCPTokenStorage.storeTokens({
                    userId: parsedConfig.actor.userId,
                    serverName: parsedConfig.serverName,
                    tokens: current.schemas.exchangedTokens,
                    createToken: db.createToken,
                    updateToken: db.updateToken,
                    deleteTokens: db.deleteTokens,
                    findToken: db.findToken,
                    clientInfo: current.schemas.clientInfo,
                    metadata: current.schemas.storedClientMetadata,
                  });
                },
              )) ?? exchangedTokens;
            storedCredentialSetId = storedTokens.credential_set_id;
            logger.debug('[MCP OAuth] Stored OAuth tokens before completing callback flow', {
              serverName,
              userId: flowState.userId,
            });
          } catch (error) {
            logger.error('[MCP OAuth] Failed to store OAuth tokens before flow completion', error);
            throw error;
          }

          /**
           * Clear any cached `mcp_get_tokens` flow result before the OAuth flow wakes its
           * waiters, so they cannot observe stale credentials after completion.
           */
          if (callbackUser) {
            postStoreAuthority = await validateStoredOAuthAuthority(callbackUser, {
              storedTokens,
            });
          }
          const wakeTokenFlows = async (tokensToWake) => {
            if (typeof flowManager?.deleteFlow !== 'function') {
              return;
            }
            try {
              const tokenFlowId = MCPOAuthHandler.generateTokenFlowId(
                flowState.userId,
                serverName,
                callbackTenantId ?? undefined,
              );
              await clearGetTokensFlow({
                flowManager,
                flowId: tokenFlowId,
                tokens: tokensToWake,
              });
              if (tokenFlowId !== flowId) {
                await clearGetTokensFlow({
                  flowManager,
                  flowId,
                  tokens: tokensToWake,
                });
              }
            } catch (error) {
              logger.error('[MCP OAuth] Failed to clear cached token flow state', error);
              await removeStoredOAuthGeneration();
              throw error;
            }
          };
          if (postStoreAuthority) {
            await runStoredAuthorityFence(async () =>
              getMCPAuthorityResolver().useIssuedResolution(
                postStoreAuthority,
                async (current) => await wakeTokenFlows(current.schemas.storedTokens),
              ),
            );
          } else {
            throw new MCPAuthorityChangedError(
              `Post-store MCP authority is unavailable for ${serverName}`,
            );
          }

          return storedTokens;
        },
        callbackUser
          ? {
              exchange: async (action) =>
                await getMCPAuthorityResolver().useIssuedResolution(preExchangeAuthority, action),
              complete: async (action) => {
                if (!postStoreAuthority) {
                  throw new MCPAuthorityChangedError(
                    `Stored MCP authority is unavailable for ${serverName}`,
                  );
                }
                return await runStoredAuthorityFence(async () =>
                  getMCPAuthorityResolver().useIssuedResolution(postStoreAuthority, action),
                );
              },
            }
          : undefined,
      );
      logger.info('[MCP OAuth] OAuth flow completed, tokens received in callback route');

      if (callbackUser) {
        await validateStoredOAuthAuthority(callbackUser);
      }

      let mcpManager;
      let userConnection;
      try {
        mcpManager = getMCPManager(flowState.userId);
        logger.debug(`[MCP OAuth] Attempting to reconnect ${serverName} with new OAuth tokens`);

        if (callbackUser) {
          const user = callbackUser;
          const reconnectAuthority = await validateStoredOAuthAuthority(user);
          userConnection = await runStoredAuthorityFence(async () =>
            getMCPAuthorityResolver().useIssuedResolution(reconnectAuthority, async (current) => {
              const parsedConfig = current.parsedConfig;
              return await mcpManager.getUserConnection({
                user: parsedConfig.actor.user,
                serverName: parsedConfig.serverName,
                flowManager,
                serverConfig: parsedConfig.sourceConfig,
                effectiveServerConfig: parsedConfig.effectiveConfig,
                securityPolicy: parsedConfig.securityPolicy,
                customUserVars: parsedConfig.customUserVars,
                oauthAuthorityScope: parsedConfig.catalogScope,
                authorityAuthorizationKind: parsedConfig.authorization.kind,
                tokenMethods: {
                  findToken: db.findToken,
                  findTokens: db.findTokens,
                  updateToken: db.updateToken,
                  createToken: db.createToken,
                  deleteTokens: db.deleteTokens,
                },
              });
            }),
          );

          logger.info(
            `[MCP OAuth] Successfully reconnected ${serverName} for user ${flowState.userId}`,
          );

          const oauthReconnectionManager = getOAuthReconnectionManager();
          oauthReconnectionManager.clearReconnection(flowState.userId, serverName);

          const catalogAuthority = await validateStoredOAuthAuthority(user);
          const tools = await runStoredAuthorityFence(async () =>
            getMCPAuthorityResolver().useIssuedResolution(
              catalogAuthority,
              async () => await userConnection.fetchTools(),
            ),
          );
          const discoveryProvenance = userConnection.getDiscoveryProvenance?.() ?? null;
          const currentScope = await resolveCurrentMCPDiscoveryScope({
            user,
            serverName,
            serverConfig: reconnectAuthority.parsedConfig.sourceConfig,
            schemas: tools,
            discoveryProvenance,
            oauthRequiredHint: true,
          });
          if (currentScope) {
            await runStoredAuthorityFence(async () =>
              getMCPAuthorityResolver().useIssuedResolution(currentScope, async (current) => {
                const parsedConfig = current.parsedConfig;
                return await updateMCPServerTools({
                  tenantId: parsedConfig.actor.tenantId,
                  userId: parsedConfig.actor.userId,
                  serverName: parsedConfig.serverName,
                  tools: current.schemas,
                  serverConfig: parsedConfig.sourceConfig,
                  customUserVars: parsedConfig.customUserVars,
                  role: parsedConfig.actor.user.role,
                  authorizationIdentity: parsedConfig.authorization.identity,
                  authorizationKind: parsedConfig.authorization.kind,
                  discoveryProvenance: parsedConfig.discoveryProvenance,
                });
              }),
            );
          } else {
            logger.warn(
              `[MCP OAuth] Skipping stale discovery result for ${serverName} after callback`,
            );
            if (typeof mcpManager.disconnectUserConnection === 'function') {
              await mcpManager.disconnectUserConnection(user.id, serverName, userConnection);
            }
          }
        } else {
          logger.debug(`[MCP OAuth] System-level OAuth completed for ${serverName}`);
        }
      } catch (error) {
        if (error instanceof MCPAuthorityChangedError || error instanceof MCPAuthorityProofError) {
          throw error;
        }
        logger.warn(
          `[MCP OAuth] Failed to reconnect ${serverName} after OAuth, but tokens are saved:`,
          error,
        );
      } finally {
        if (
          callbackUser &&
          userConnection &&
          typeof mcpManager?.releaseDetachedUserConnection === 'function'
        ) {
          try {
            await mcpManager.releaseDetachedUserConnection(
              callbackUser.id,
              serverName,
              userConnection,
            );
          } catch (error) {
            logger.warn(`[MCP OAuth] Failed to release detached ${serverName} connection`, error);
          }
        }
      }

      /** ID of the flow that the tool/connection is waiting for */
      const toolFlowId = flowState.metadata?.toolFlowId;
      if (toolFlowId) {
        let toolFlowAuthority;
        if (callbackUser) {
          toolFlowAuthority = await validateStoredOAuthAuthority(callbackUser, {
            toolFlowId,
            tokens,
          });
        }
        logger.debug('[MCP OAuth] Completing tool flow', { toolFlowId });
        const completed = toolFlowAuthority
          ? await runStoredAuthorityFence(async () =>
              getMCPAuthorityResolver().useIssuedResolution(
                toolFlowAuthority,
                async (current) =>
                  await flowManager.completeFlow(
                    current.schemas.toolFlowId,
                    'mcp_oauth',
                    current.schemas.tokens,
                  ),
              ),
            )
          : false;
        if (!completed) {
          logger.warn(
            '[MCP OAuth] Tool flow state not found during completion — waiter will time out',
            { toolFlowId },
          );
        }
      }
    });

    /** Redirect to success page with flowId and serverName */
    const redirectUrl = `${basePath}/oauth/success?serverName=${encodeURIComponent(serverName)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('[MCP OAuth] OAuth callback error', error);
    res.redirect(`${basePath}/oauth/error?error=callback_failed`);
  }
});

/**
 * Get OAuth tokens for a completed flow
 * This is primarily for user-level OAuth flows
 */
router.get('/oauth/tokens/:flowId', requireJwtAuth, async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  return res.status(403).json({ error: 'Raw MCP OAuth token polling is unavailable' });
});

/**
 * Set CSRF binding cookie for OAuth flows initiated outside of HTTP request/response
 * (e.g. during chat via SSE). The frontend should call this before opening the OAuth URL
 * so the callback can verify the browser matches the flow initiator.
 */
router.post('/:serverName/oauth/bind', requireJwtAuth, setOAuthSession, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const flowId = getOAuthFlowId(user.id, serverName);
    setOAuthCsrfCookie(res, flowId, OAUTH_CSRF_COOKIE_PATH);

    res.json({ success: true });
  } catch (error) {
    logger.error('[MCP OAuth] Failed to set CSRF binding cookie', error);
    res.status(500).json({ error: 'Failed to bind OAuth flow' });
  }
});

/**
 * Check OAuth flow status
 * This endpoint can be used to poll the status of an OAuth flow
 */
router.get('/oauth/status/:flowId', requireJwtAuth, async (req, res) => {
  try {
    const { flowId } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!canAccessOAuthFlow(flowId, user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({
      status: flowState.status,
      completed: flowState.status === 'COMPLETED',
      failed: flowState.status === 'FAILED',
      error: flowState.error,
    });
  } catch (error) {
    logger.error('[MCP OAuth] Failed to get flow status', error);
    res.status(500).json({ error: 'Failed to get flow status' });
  }
});

/**
 * Cancel OAuth flow
 * This endpoint cancels a pending OAuth flow
 */
router.post('/oauth/cancel/:serverName', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP OAuth Cancel] Cancelling OAuth flow for ${serverName} by user ${user.id}`);

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const flowId = getOAuthFlowId(user.id, serverName);
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');

    if (!flowState) {
      logger.debug(`[MCP OAuth Cancel] No active flow found for ${serverName}`);
      return res.json({
        success: true,
        message: 'No active OAuth flow to cancel',
      });
    }

    await flowManager.failFlow(flowId, 'mcp_oauth', 'User cancelled OAuth flow');

    logger.info(`[MCP OAuth Cancel] Successfully cancelled OAuth flow for ${serverName}`);

    res.json({
      success: true,
      message: `OAuth flow for ${serverName} cancelled successfully`,
    });
  } catch (error) {
    logger.error('[MCP OAuth Cancel] Failed to cancel OAuth flow', error);
    res.status(500).json({ error: 'Failed to cancel OAuth flow' });
  }
});

function createMCPStatusRuntimeContext(user, mcpConfig, serverNames) {
  const customUserVarServers = serverNames.filter((serverName) => {
    const customUserVars = mcpConfig[serverName]?.customUserVars;
    return (
      customUserVars && typeof customUserVars === 'object' && Object.keys(customUserVars).length > 0
    );
  });
  let userMCPAuthMapPromise;
  let mcpAllowlistsPromise;
  const loadUserMCPAuthMap = () => {
    if (!customUserVarServers.length) {
      return Promise.resolve(undefined);
    }
    userMCPAuthMapPromise ??= getUserMCPAuthMap({
      userId: user.id,
      servers: customUserVarServers,
      findPluginAuthsByKeys: db.findPluginAuthsByKeys,
    });
    return userMCPAuthMapPromise;
  };
  const loadMCPAllowlists = () => {
    mcpAllowlistsPromise ??= getMCPServersRegistry().resolveAllowlists({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId ?? getTenantId() ?? null,
    });
    return mcpAllowlistsPromise;
  };
  return { user: createSafeUser(user), loadUserMCPAuthMap, loadMCPAllowlists };
}

function getMCPReinitializeOAuthTimeout(oauthExpiresAt) {
  if (typeof oauthExpiresAt !== 'number' || !Number.isFinite(oauthExpiresAt)) {
    return mcpSettings.OAUTH_HANDLING_TIMEOUT;
  }
  return Math.max(0, oauthExpiresAt - Date.now());
}

/**
 * Reinitialize MCP server
 * This endpoint allows reinitializing a specific MCP server
 */
router.post(
  '/:serverName/reinitialize',
  requireJwtAuth,
  checkMCPUsePermissions,
  setOAuthSession,
  async (req, res) => {
    try {
      const { serverName } = req.params;
      const user = createSafeUser(req.user);

      if (!user.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      logger.info(`[MCP Reinitialize] Reinitializing server: ${serverName}`);

      const mcpManager = getMCPManager();
      const authority = await resolveCurrentMCPToolAuthority({
        user,
        serverName,
        requestBody: req.body,
        oauthRequiredHint: true,
        allowMissingAuthorization: true,
      });
      const parsedConfig = authority?.parsedConfig;
      if (
        !parsedConfig?.catalogScope ||
        !(await userCanUseMCPServersFresh(parsedConfig.actor.user))
      ) {
        return res.status(403).json({ error: 'Current MCP server authority is unavailable' });
      }

      await getMCPAuthorityResolver().useIssuedResolution(authority, async (current) => {
        const currentParsedConfig = current.parsedConfig;
        await mcpManager.disconnectUserConnection(
          currentParsedConfig.actor.userId,
          currentParsedConfig.serverName,
        );
      });
      logger.info(
        `[MCP Reinitialize] Disconnected existing user connection for server: ${serverName}`,
      );

      const result = await getMCPAuthorityResolver().useIssuedResolution(
        authority,
        async (current) => {
          const currentParsedConfig = current.parsedConfig;
          return await reinitMCPServer({
            authorityResolution: current,
            user: currentParsedConfig.actor.user,
            serverName: currentParsedConfig.serverName,
            serverConfig: currentParsedConfig.sourceConfig,
            configServers: {
              [currentParsedConfig.serverName]: currentParsedConfig.sourceConfig,
            },
            userMCPAuthMap: currentParsedConfig.customUserVars
              ? {
                  [`${Constants.mcp_prefix}${currentParsedConfig.serverName}`]:
                    currentParsedConfig.customUserVars,
                }
              : {},
            oauthAuthorityScope: currentParsedConfig.catalogScope,
          });
        },
      );

      if (!result) {
        return res.status(500).json({ error: 'Failed to reinitialize MCP server for user' });
      }

      const {
        success,
        message,
        oauthRequired,
        oauthUrl,
        oauthExpiresAt,
        failureReason,
        missingUserVars,
        connectionDeferred,
      } = result;

      let flowId;
      if (oauthRequired) {
        flowId = getOAuthFlowId(user.id, serverName);
        setOAuthCsrfCookie(res, flowId, OAUTH_CSRF_COOKIE_PATH);
      }

      res.json({
        success,
        message,
        oauthUrl,
        flowId,
        oauthTimeout: oauthRequired ? getMCPReinitializeOAuthTimeout(oauthExpiresAt) : undefined,
        serverName,
        oauthRequired,
        failureReason,
        missingUserVars,
        connectionDeferred,
      });
    } catch (error) {
      logger.error('[MCP Reinitialize] Unexpected error', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * Get connection status for all MCP servers
 * This endpoint returns all app level and user-scoped connection statuses from MCPManager without disconnecting idle connections
 */
router.get('/connection/status', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { mcpConfig, appConnections, userConnections, oauthServers } = await getMCPSetupData(
      user.id,
      { role: user.role, tenantId: getTenantId() },
    );
    const runtimeContext = createMCPStatusRuntimeContext(user, mcpConfig, Object.keys(mcpConfig));
    const connectionStatus = Object.fromEntries(
      await Promise.all(
        Object.entries(mcpConfig).map(async ([serverName, config]) => {
          try {
            const status = await getServerConnectionStatus(
              user.id,
              serverName,
              config,
              appConnections,
              userConnections,
              oauthServers,
              runtimeContext,
            );
            return [serverName, status];
          } catch (error) {
            const message = `Failed to get status for server "${serverName}"`;
            logger.error(`[MCP Connection Status] ${message},`, error);
            return [
              serverName,
              {
                connectionState: 'error',
                requiresOAuth: oauthServers.has(serverName),
                authorizationState: oauthServers.has(serverName) ? 'error' : 'not_required',
                error: message,
              },
            ];
          }
        }),
      ),
    );

    res.json({
      success: true,
      connectionStatus,
      oauthTimeout: mcpSettings.OAUTH_HANDLING_TIMEOUT,
    });
  } catch (error) {
    logger.error('[MCP Connection Status] Failed to get connection status', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * Get connection status for a single MCP server
 * This endpoint returns the connection status for a specific server for a given user
 */
router.get('/connection/status/:serverName', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;
    const { serverName } = req.params;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { mcpConfig, appConnections, userConnections, oauthServers } = await getMCPSetupData(
      user.id,
      { role: user.role, tenantId: getTenantId() },
    );

    if (!mcpConfig[serverName]) {
      return res
        .status(404)
        .json({ error: `MCP server '${serverName}' not found in configuration` });
    }

    const runtimeContext = createMCPStatusRuntimeContext(user, mcpConfig, [serverName]);

    const serverStatus = await getServerConnectionStatus(
      user.id,
      serverName,
      mcpConfig[serverName],
      appConnections,
      userConnections,
      oauthServers,
      runtimeContext,
    );

    res.json({
      success: true,
      serverName,
      connectionStatus: serverStatus.connectionState,
      requiresOAuth: serverStatus.requiresOAuth,
      authorizationState: serverStatus.authorizationState,
    });
  } catch (error) {
    logger.error(
      `[MCP Per-Server Status] Failed to get connection status for ${req.params.serverName}`,
      error,
    );
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * Check which authentication values exist for a specific MCP server
 * This endpoint returns only boolean flags indicating if values are set, not the actual values
 */
router.get('/:serverName/auth-values', requireJwtAuth, checkMCPUsePermissions, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const configServers = await resolveConfigServers(req);
    const serverConfig = await getMCPServersRegistry().getServerConfig(
      serverName,
      user.id,
      configServers,
    );
    if (!serverConfig) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const pluginKey = `${Constants.mcp_prefix}${serverName}`;
    const authValueFlags = {};

    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const value = await getUserPluginAuthValue(user.id, varName, false, pluginKey);
          authValueFlags[varName] = !!(value && value.length > 0);
        } catch (err) {
          logger.error(
            `[MCP Auth Value Flags] Error checking ${varName} for user ${user.id}:`,
            err,
          );
          authValueFlags[varName] = false;
        }
      }
    }

    res.json({
      success: true,
      serverName,
      authValueFlags,
    });
  } catch (error) {
    logger.error(
      `[MCP Auth Value Flags] Failed to check auth value flags for ${req.params.serverName}`,
      error,
    );
    res.status(500).json({ error: 'Failed to check auth value flags' });
  }
});

/**
MCP Server CRUD Routes (User-Managed MCP Servers)
*/

/**
 * Get list of accessible MCP servers
 * @route GET /api/mcp/servers
 * @param {Object} req.query - Query parameters for pagination and search
 * @param {number} [req.query.limit] - Number of results per page
 * @param {string} [req.query.after] - Pagination cursor
 * @param {string} [req.query.search] - Search query for title/description
 * @returns {MCPServerListResponse} 200 - Success response - application/json
 */
router.get('/servers', requireJwtAuth, checkMCPUsePermissions, getMCPServersList);

/**
 * Create a new MCP server
 * @route POST /api/mcp/servers
 * @param {MCPServerCreateParams} req.body - The MCP server creation parameters.
 * @returns {MCPServer} 201 - Success response - application/json
 */
router.post('/servers', requireJwtAuth, checkMCPCreate, createMCPServerController);

/**
 * Get single MCP server by ID
 * @route GET /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @returns {MCPServer} 200 - Success response - application/json
 */
router.get(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPUsePermissions,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'serverName',
  }),
  getMCPServerById,
);

/**
 * Update MCP server
 * @route PATCH /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @param {MCPServerUpdateParams} req.body - The MCP server update parameters.
 * @returns {MCPServer} 200 - Success response - application/json
 */
router.patch(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'serverName',
  }),
  updateMCPServerController,
);

/**
 * Delete MCP server
 * @route DELETE /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @returns {Object} 200 - Success response - application/json
 */
router.delete(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'serverName',
  }),
  deleteMCPServerController,
);

module.exports = router;
