const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
  createMCPToolCatalogScope,
  createSafeUser,
  getMCPAuthorizationIdentity,
  getServerCustomUserVars,
  getUserMCPAuthMap,
  getMissingCustomUserVars,
  findShadowedServerNames,
  createMCPToolCatalogSecurityPolicyIdentity,
  isMCPToolCatalogFingerprintAvailable,
  matchesMCPConnectionProvenance,
  preProcessGraphTokens,
  processMCPEnv,
  isUserSourced,
  isOAuthServer,
  shouldDetectRuntimeOAuth,
} = require('@librechat/api');
const { findUser, findToken, findTokens, findPluginAuthsByKeys } = require('~/models');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { resolveMCPDiscoveryConfigSnapshot } = require('~/server/services/MCPConfigResolver');

const MCP_DISCOVERY_USER_FIELDS = [
  '_id',
  'name',
  'username',
  'email',
  'provider',
  'role',
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
  'emailVerified',
  'twoFactorEnabled',
  'termsAccepted',
  'termsAcceptedAt',
  'tenantId',
  'idOnTheSource',
  'federatedTokens',
].join(' ');

async function resolveDiscoveryAuthorizationScope({
  userId,
  serverName,
  serverConfig,
  discoveryProvenance,
  oauthRequiredHint,
}) {
  if (serverConfig.obo != null) {
    return {
      authorizationIdentity: MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
      authorizationKind: 'obo',
      provenanceServerConfig: serverConfig,
    };
  }

  const runtimeOAuthDetected =
    shouldDetectRuntimeOAuth(serverConfig) &&
    (discoveryProvenance?.authorizationKind === 'oauth' ||
      (discoveryProvenance == null && oauthRequiredHint === true));
  const oauthConnection =
    isOAuthServer(serverConfig) ||
    runtimeOAuthDetected ||
    (discoveryProvenance == null && oauthRequiredHint === true);
  if (!oauthConnection) {
    return {
      authorizationIdentity: 'none',
      authorizationKind: 'none',
      provenanceServerConfig: serverConfig,
    };
  }

  const authorizationIdentity = await getMCPAuthorizationIdentity({
    userId,
    serverName,
    findToken,
    findTokens,
  });
  return {
    authorizationIdentity,
    authorizationKind: 'oauth',
    provenanceServerConfig: runtimeOAuthDetected
      ? { ...serverConfig, requiresOAuth: true }
      : serverConfig,
  };
}

async function resolveCurrentMCPPrincipal(user, serverName) {
  const expectedTenantId = user.tenantId ?? getTenantId() ?? null;
  let storedUser;
  try {
    storedUser = await findUser({ _id: user.id }, MCP_DISCOVERY_USER_FIELDS);
  } catch (error) {
    logger.warn(`[MCP Discovery] Current user lookup failed for ${serverName}`, error);
    return null;
  }
  if (!storedUser) {
    return null;
  }
  const tenantId = storedUser.tenantId == null ? null : String(storedUser.tenantId);
  if ((expectedTenantId == null ? null : String(expectedTenantId)) !== tenantId) {
    return null;
  }
  if ((user.role ?? null) !== (storedUser.role ?? null)) {
    return null;
  }
  if (
    Object.prototype.hasOwnProperty.call(user, 'idOnTheSource') &&
    (user.idOnTheSource == null ? null : String(user.idOnTheSource)) !==
      (storedUser.idOnTheSource == null ? null : String(storedUser.idOnTheSource))
  ) {
    return null;
  }
  const currentUser = {
    ...createSafeUser(storedUser),
    id: user.id,
    tenantId: tenantId ?? undefined,
    idOnTheSource: storedUser.idOnTheSource == null ? null : String(storedUser.idOnTheSource),
  };
  return currentUser;
}

async function resolveCurrentMCPAuthoritySnapshot(user, label, options = {}) {
  const currentUser = await resolveCurrentMCPPrincipal(user, label);
  if (!currentUser) {
    return null;
  }

  try {
    const { configs, securityPolicy, collisionServerNames } =
      await resolveMCPDiscoveryConfigSnapshot(currentUser.id, currentUser, {
        initializeMissing: options.initializeMissing === true,
        ...(options.serverNames && { serverNames: options.serverNames }),
      });
    const securityPolicyIdentity = isMCPToolCatalogFingerprintAvailable()
      ? createMCPToolCatalogSecurityPolicyIdentity(securityPolicy)
      : null;
    if (!securityPolicyIdentity) {
      logger.warn('[MCP Authority] Catalog fingerprint key is unavailable');
      return null;
    }
    return {
      configs,
      collisionServerNames,
      securityPolicy,
      securityPolicyIdentity,
      tenantId: currentUser.tenantId ?? null,
      user: currentUser,
    };
  } catch (error) {
    logger.warn(`[MCP Authority] Current authority snapshot failed for ${label}`, error);
    return null;
  }
}

async function resolveCurrentMCPToolAuthority({
  user,
  serverName,
  requestBody,
  oauthRequiredHint,
  snapshot,
}) {
  const currentSnapshot =
    snapshot ??
    (await resolveCurrentMCPAuthoritySnapshot(user, serverName, { serverNames: [serverName] }));
  if (!currentSnapshot) {
    return null;
  }
  if (
    findShadowedServerNames(
      currentSnapshot.collisionServerNames ?? Object.keys(currentSnapshot.configs),
    ).has(serverName)
  ) {
    return null;
  }

  const serverConfig = currentSnapshot.configs[serverName];
  if (!serverConfig) {
    return null;
  }

  try {
    let customUserVars;
    if (Object.keys(serverConfig.customUserVars ?? {}).length > 0) {
      const currentAuthMap = await getUserMCPAuthMap({
        userId: currentSnapshot.user.id,
        servers: [serverName],
        findPluginAuthsByKeys,
      });
      customUserVars = getServerCustomUserVars(currentAuthMap, serverName);
      if (getMissingCustomUserVars(serverConfig, customUserVars).length > 0) {
        return null;
      }
    }

    const authorizationScope = await resolveDiscoveryAuthorizationScope({
      userId: currentSnapshot.user.id,
      serverName,
      serverConfig,
      oauthRequiredHint,
    });
    if (authorizationScope.authorizationIdentity == null) {
      return null;
    }

    const effectiveServerConfig = processMCPEnv({
      user: currentSnapshot.user,
      body: requestBody,
      dbSourced: isUserSourced(authorizationScope.provenanceServerConfig),
      options: authorizationScope.provenanceServerConfig,
      customUserVars,
    });
    const scopeInput = {
      tenantId: currentSnapshot.tenantId,
      userId: currentSnapshot.user.id,
      serverName,
      serverConfig: authorizationScope.provenanceServerConfig,
      effectiveServerConfig,
      securityPolicyIdentity: currentSnapshot.securityPolicyIdentity,
      customUserVars,
      authorizationIdentity: authorizationScope.authorizationIdentity,
      authorizationKind: authorizationScope.authorizationKind,
    };

    return {
      ...currentSnapshot,
      serverName,
      serverConfig,
      provenanceServerConfig: authorizationScope.provenanceServerConfig,
      effectiveServerConfig,
      customUserVars,
      authorizationIdentity: authorizationScope.authorizationIdentity,
      authorizationKind: authorizationScope.authorizationKind,
      catalogScope: createMCPToolCatalogScope(scopeInput),
      scopeInput,
    };
  } catch (error) {
    logger.warn(`[MCP Authority] Current server authority failed for ${serverName}`, error);
    return null;
  }
}

function matchesMCPToolAuthorityScope(left, right) {
  if (!left || !right) {
    return false;
  }
  return (
    left.tenant === right.tenant &&
    left.principal === right.principal &&
    left.server === right.server &&
    left.policy === right.policy &&
    left.config === right.config &&
    left.credentials === right.credentials
  );
}

async function resolveCurrentMCPDiscoveryScope({
  user,
  serverName,
  serverConfig,
  customUserVars,
  requestBody,
  discoveryProvenance,
  oauthRequiredHint,
}) {
  const currentUser = await resolveCurrentMCPPrincipal(user, serverName);
  if (!currentUser) {
    return null;
  }
  const tenantId = currentUser.tenantId ?? null;
  if (!isMCPToolCatalogFingerprintAvailable()) {
    const authorizationScope = await resolveDiscoveryAuthorizationScope({
      userId: user.id,
      serverName,
      serverConfig,
      discoveryProvenance,
      oauthRequiredHint,
    });
    return { tenantId, user: currentUser, serverConfig, customUserVars, ...authorizationScope };
  }
  if (!discoveryProvenance) {
    return null;
  }

  try {
    const { configs, securityPolicy } = await resolveMCPDiscoveryConfigSnapshot(
      user.id,
      currentUser,
    );
    const currentServerConfig = configs[serverName];
    if (!currentServerConfig) {
      return null;
    }
    const authorizationScope = await resolveDiscoveryAuthorizationScope({
      userId: user.id,
      serverName,
      serverConfig: currentServerConfig,
      discoveryProvenance,
      oauthRequiredHint,
    });
    if (authorizationScope.authorizationIdentity == null) {
      return null;
    }

    let currentCustomUserVars = customUserVars;
    if (Object.keys(currentServerConfig.customUserVars ?? {}).length > 0) {
      const currentAuthMap = await getUserMCPAuthMap({
        userId: user.id,
        servers: [serverName],
        findPluginAuthsByKeys,
      });
      currentCustomUserVars = getServerCustomUserVars(currentAuthMap, serverName);
      if (getMissingCustomUserVars(currentServerConfig, currentCustomUserVars).length > 0) {
        return null;
      }
    }

    const { allowedDomains, allowedAddresses } = securityPolicy;
    const dbSourced = isUserSourced(authorizationScope.provenanceServerConfig);
    const graphProcessedConfig = dbSourced
      ? authorizationScope.provenanceServerConfig
      : await preProcessGraphTokens(authorizationScope.provenanceServerConfig, {
          user: currentUser,
          graphTokenResolver: getGraphApiToken,
          scopes: process.env.GRAPH_API_SCOPES,
        });
    const effectiveServerConfig = processMCPEnv({
      user: currentUser,
      body: requestBody,
      dbSourced,
      options: graphProcessedConfig,
      customUserVars: currentCustomUserVars,
    });
    const securityPolicyIdentity = createMCPToolCatalogSecurityPolicyIdentity({
      allowedDomains,
      allowedAddresses,
    });
    const scopeInput = {
      tenantId,
      userId: user.id,
      serverName,
      serverConfig: authorizationScope.provenanceServerConfig,
      effectiveServerConfig,
      securityPolicyIdentity,
      customUserVars: currentCustomUserVars,
      authorizationIdentity: authorizationScope.authorizationIdentity,
    };
    const current = matchesMCPConnectionProvenance(discoveryProvenance, scopeInput);
    const localEffectiveServerConfig = processMCPEnv({
      user: currentUser,
      body: requestBody,
      dbSourced,
      options: authorizationScope.provenanceServerConfig,
      customUserVars: currentCustomUserVars,
    });
    const authorityScope = createMCPToolCatalogScope({
      ...scopeInput,
      effectiveServerConfig: localEffectiveServerConfig,
    });
    return current
      ? {
          tenantId,
          user: currentUser,
          serverConfig: currentServerConfig,
          provenanceServerConfig: authorizationScope.provenanceServerConfig,
          effectiveServerConfig,
          securityPolicyIdentity,
          customUserVars: currentCustomUserVars,
          authorizationIdentity: authorizationScope.authorizationIdentity,
          authorizationKind: authorizationScope.authorizationKind,
          catalogScope: authorityScope,
        }
      : null;
  } catch (error) {
    logger.warn(`[MCP Discovery] Current scope validation failed for ${serverName}`, error);
    return null;
  }
}

module.exports = {
  matchesMCPToolAuthorityScope,
  resolveCurrentMCPAuthoritySnapshot,
  resolveCurrentMCPDiscoveryScope,
  resolveCurrentMCPPrincipal,
  resolveCurrentMCPToolAuthority,
};
