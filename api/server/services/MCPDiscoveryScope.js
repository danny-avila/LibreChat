const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
  createSafeUser,
  getMCPAuthorizationIdentity,
  getServerCustomUserVars,
  getUserMCPAuthMap,
  getMissingCustomUserVars,
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
      provenanceServerConfig: serverConfig,
    };
  }

  const runtimeOAuthDetected =
    discoveryProvenance?.authorizationKind === 'oauth' && shouldDetectRuntimeOAuth(serverConfig);
  const oauthConnection =
    isOAuthServer(serverConfig) ||
    runtimeOAuthDetected ||
    (discoveryProvenance == null && oauthRequiredHint === true);
  if (!oauthConnection) {
    return { authorizationIdentity: 'none', provenanceServerConfig: serverConfig };
  }

  const authorizationIdentity = await getMCPAuthorizationIdentity({
    userId,
    serverName,
    findToken,
    findTokens,
  });
  return {
    authorizationIdentity,
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
    const current = matchesMCPConnectionProvenance(discoveryProvenance, {
      tenantId,
      userId: user.id,
      serverName,
      serverConfig: authorizationScope.provenanceServerConfig,
      effectiveServerConfig,
      securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
        allowedDomains,
        allowedAddresses,
      }),
      customUserVars: currentCustomUserVars,
      authorizationIdentity: authorizationScope.authorizationIdentity,
    });
    return current
      ? {
          tenantId,
          user: currentUser,
          serverConfig: currentServerConfig,
          customUserVars: currentCustomUserVars,
          authorizationIdentity: authorizationScope.authorizationIdentity,
        }
      : null;
  } catch (error) {
    logger.warn(`[MCP Discovery] Current scope validation failed for ${serverName}`, error);
    return null;
  }
}

module.exports = { resolveCurrentMCPDiscoveryScope, resolveCurrentMCPPrincipal };
