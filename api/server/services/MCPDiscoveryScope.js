const {
  logger,
  getTenantId,
  createMCPAuthorityConfigSourceRevision,
  createMCPAuthorityCredentialRevision,
  createMCPAuthorityDatabaseSourceRevision,
} = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
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
  mcpOptionsContainGraphTokenPlaceholder,
  matchesMCPConnectionProvenance,
  preProcessGraphTokens,
  processMCPEnv,
  isUserSourced,
  isOAuthServer,
  shouldDetectRuntimeOAuth,
} = require('@librechat/api');
const db = require('~/models');
const { findUser, findToken, findTokens, findPluginAuthsByKeys } = db;
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { resolveMCPDiscoveryConfigSnapshot } = require('~/server/services/MCPConfigResolver');
const {
  calculateMCPAuthorityArtifactRevision,
  getMCPAuthorityResolver,
} = require('~/server/services/MCPAuthority');

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
  allowMissingAuthorization,
}) {
  if (serverConfig.obo != null) {
    return {
      authorizationIdentity: MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
      authorizationKind: 'obo',
      provenanceServerConfig: serverConfig,
    };
  }

  const runtimeOAuthDetected =
    discoveryProvenance?.authorizationKind === 'oauth' ||
    (discoveryProvenance == null &&
      oauthRequiredHint === true &&
      shouldDetectRuntimeOAuth(serverConfig));
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
    authorizationIdentity:
      authorizationIdentity ?? (allowMissingAuthorization === true ? 'oauth-pending' : null),
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
  if (
    Object.prototype.hasOwnProperty.call(user, 'role') &&
    (user.role ?? null) !== (storedUser.role ?? null)
  ) {
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
    ...(user.federatedTokens && { federatedTokens: { ...user.federatedTokens } }),
  };
  return currentUser;
}

async function resolveCurrentMCPAuthoritySnapshot(user, label, options = {}) {
  const currentUser = await resolveCurrentMCPPrincipal(user, label);
  if (!currentUser) {
    return null;
  }

  try {
    const {
      configs,
      pendingConfigs,
      sourceDocuments,
      securityPolicy,
      collisionServerNames,
      missingConfigServerNames,
    } = await resolveMCPDiscoveryConfigSnapshot(currentUser.id, currentUser, {
      initializeMissing: options.initializeMissing === true,
      bounded: options.bounded === true,
      ...(options.expectedServerConfigs && {
        expectedServerConfigs: options.expectedServerConfigs,
      }),
      ...(options.serverNames && { serverNames: options.serverNames }),
    });
    const resolvedSecurityPolicy = {
      ...securityPolicy,
      useSSRFProtection:
        !Array.isArray(securityPolicy.allowedDomains) || securityPolicy.allowedDomains.length === 0,
    };
    const securityPolicyIdentity = isMCPToolCatalogFingerprintAvailable()
      ? createMCPToolCatalogSecurityPolicyIdentity(resolvedSecurityPolicy)
      : null;
    if (!securityPolicyIdentity) {
      logger.warn('[MCP Authority] Catalog fingerprint key is unavailable');
      return null;
    }
    return {
      configs,
      pendingConfigs,
      sourceDocuments,
      collisionServerNames,
      missingConfigServerNames,
      securityPolicy: resolvedSecurityPolicy,
      securityPolicyIdentity,
      tenantId: currentUser.tenantId ?? null,
      user: currentUser,
    };
  } catch (error) {
    logger.warn(`[MCP Authority] Current authority snapshot failed for ${label}`, error);
    return null;
  }
}

function tokenGeneration(token) {
  const metadata =
    token?.metadata instanceof Map ? Object.fromEntries(token.metadata) : token?.metadata;
  const generation = metadata?.credential_set_id;
  return typeof generation === 'string' && generation.length > 0 ? generation : null;
}

async function resolveOAuthGrantGeneration(userId, serverName, authorizationKind) {
  if (authorizationKind !== 'oauth') {
    return null;
  }
  const identifier = `mcp:${serverName}`;
  const identities = new Set([
    JSON.stringify(['mcp_oauth', identifier]),
    JSON.stringify(['mcp_oauth_refresh', `${identifier}:refresh`]),
    JSON.stringify(['mcp_oauth_client', `${identifier}:client`]),
  ]);
  const tokens = await findTokens({
    userId,
    type: { $in: ['mcp_oauth', 'mcp_oauth_refresh', 'mcp_oauth_client'] },
    identifier: { $in: [identifier, `${identifier}:refresh`, `${identifier}:client`] },
  });
  const seen = new Set();
  const generations = new Set();
  for (const token of tokens) {
    const key = JSON.stringify([token.type, token.identifier]);
    const generation = tokenGeneration(token);
    if (!identities.has(key) || seen.has(key) || !generation) {
      throw new Error(`MCP OAuth authority is malformed for ${serverName}`);
    }
    seen.add(key);
    generations.add(generation);
  }
  if (generations.size > 1) {
    throw new Error(`MCP OAuth authority generations disagree for ${serverName}`);
  }
  return generations.values().next().value ?? null;
}

async function createMCPAuthorityTarget({
  snapshot,
  serverName,
  serverConfig,
  provenanceServerConfig,
  authorizationKind,
  credentialFields,
  credentials,
  oauthGrantGeneration,
}) {
  const resolver = getMCPAuthorityResolver();
  let source;
  let sourceRevision;
  let databaseId;
  if (isUserSourced(serverConfig)) {
    databaseId = serverConfig.dbId;
    if (!databaseId) {
      throw new Error(`MCP database identity is unavailable for ${serverName}`);
    }
    const document = await db.findMCPServerByObjectId(databaseId);
    if (!document || document.serverName !== serverName) {
      throw new Error(`MCP database source changed for ${serverName}`);
    }
    source = 'database';
    sourceRevision = createMCPAuthorityDatabaseSourceRevision({
      databaseId,
      serverName: document.serverName,
      author: document.author.toString(),
      config: document.config,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  } else {
    source = 'config';
    sourceRevision = createMCPAuthorityConfigSourceRevision(
      resolver.bootRevision.digest,
      snapshot.sourceDocuments,
    );
  }
  return {
    serverName,
    source,
    ...(databaseId && { databaseId }),
    sourceRevision,
    expectedCredentialRevision: createMCPAuthorityCredentialRevision(credentialFields, credentials),
    expectedOAuthGrantGeneration: oauthGrantGeneration,
    resolvedConfig: provenanceServerConfig,
    credentialFields,
    requiresOAuth: authorizationKind === 'oauth',
  };
}

async function resolveCurrentMCPToolAuthority({
  user,
  serverName,
  requestBody,
  schemas = null,
  discoveryProvenance,
  oauthRequiredHint,
  snapshot,
  bounded,
  allowMissingAuthorization,
  allowMissingCredentials,
  expectedServerConfig,
  materializedEffectiveConfig,
}) {
  const currentSnapshot =
    snapshot ??
    (await resolveCurrentMCPAuthoritySnapshot(user, serverName, {
      serverNames: [serverName],
      bounded: bounded === true,
      ...(expectedServerConfig && {
        expectedServerConfigs: { [serverName]: expectedServerConfig },
      }),
    }));
  if (!currentSnapshot) {
    logger.warn(`[MCP Authority] Current snapshot is unavailable for ${serverName}`);
    return null;
  }
  if (
    findShadowedServerNames(
      currentSnapshot.collisionServerNames ?? Object.keys(currentSnapshot.configs),
    ).has(serverName)
  ) {
    logger.warn(`[MCP Authority] Server name is shadowed for ${serverName}`);
    return null;
  }

  const serverConfig = currentSnapshot.configs[serverName];
  if (!serverConfig) {
    logger.warn(`[MCP Authority] Current server config is unavailable for ${serverName}`);
    return null;
  }

  try {
    let customUserVars;
    const credentialFields = Object.keys(serverConfig.customUserVars ?? {}).sort();
    const credentialFieldSet = new Set(credentialFields);
    const credentials = credentialFields.length
      ? (
          await findPluginAuthsByKeys({
            userId: currentSnapshot.user.id,
            pluginKeys: [`${Constants.mcp_prefix}${serverName}`],
          })
        ).filter(({ authField }) => credentialFieldSet.has(authField))
      : [];
    if (credentialFields.length > 0) {
      const currentAuthMap = await getUserMCPAuthMap({
        userId: currentSnapshot.user.id,
        servers: [serverName],
        findPluginAuthsByKeys: async () => credentials,
      });
      customUserVars = getServerCustomUserVars(currentAuthMap, serverName);
      if (
        allowMissingCredentials !== true &&
        getMissingCustomUserVars(serverConfig, customUserVars).length > 0
      ) {
        return null;
      }
    }

    const authorizationScope = await resolveDiscoveryAuthorizationScope({
      userId: currentSnapshot.user.id,
      serverName,
      serverConfig,
      discoveryProvenance,
      oauthRequiredHint,
      allowMissingAuthorization,
    });
    if (authorizationScope.authorizationIdentity == null) {
      logger.warn(`[MCP Authority] Current authorization is unavailable for ${serverName}`);
      return null;
    }

    const dbSourced = isUserSourced(authorizationScope.provenanceServerConfig);
    const effectiveServerConfig =
      materializedEffectiveConfig ??
      processMCPEnv({
        user: currentSnapshot.user,
        body: requestBody,
        dbSourced,
        options: authorizationScope.provenanceServerConfig,
        customUserVars,
      });
    const oauthGrantGeneration = await resolveOAuthGrantGeneration(
      currentSnapshot.user.id,
      serverName,
      authorizationScope.authorizationKind,
    );
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
    if (discoveryProvenance && !matchesMCPConnectionProvenance(discoveryProvenance, scopeInput)) {
      logger.warn(`[MCP Authority] Connection provenance changed for ${serverName}`);
      return null;
    }
    const parsedConfig = {
      actor: {
        userId: currentSnapshot.user.id,
        tenantId: currentSnapshot.tenantId,
        user: currentSnapshot.user,
      },
      serverName,
      sourceConfig: serverConfig,
      effectiveConfig: effectiveServerConfig,
      securityPolicy: currentSnapshot.securityPolicy,
      securityPolicyIdentity: currentSnapshot.securityPolicyIdentity,
      customUserVars,
      authorization: {
        kind: authorizationScope.authorizationKind,
        identity: authorizationScope.authorizationIdentity,
        credentialSetId:
          authorizationScope.authorizationKind === 'oauth' &&
          !['none', 'oauth-pending'].includes(authorizationScope.authorizationIdentity)
            ? authorizationScope.authorizationIdentity
            : null,
        generation: oauthGrantGeneration,
      },
      catalogScope: createMCPToolCatalogScope(scopeInput),
      discoveryProvenance: discoveryProvenance ?? null,
    };
    const target = await createMCPAuthorityTarget({
      snapshot: currentSnapshot,
      serverName,
      serverConfig,
      provenanceServerConfig: authorizationScope.provenanceServerConfig,
      authorizationKind: authorizationScope.authorizationKind,
      credentialFields,
      credentials,
      oauthGrantGeneration,
    });
    const resolver = getMCPAuthorityResolver();
    const resolution = await resolver.resolve({
      userId: currentSnapshot.user.id,
      ...(currentSnapshot.tenantId != null && { tenantId: currentSnapshot.tenantId }),
      targets: [target],
      parsedConfig,
      schemas,
      calculateArtifactRevision: calculateMCPAuthorityArtifactRevision,
    });
    if (!mcpOptionsContainGraphTokenPlaceholder(effectiveServerConfig)) {
      return resolution;
    }
    if (materializedEffectiveConfig || dbSourced) {
      throw new Error(`MCP Graph authority could not be materialized for ${serverName}`);
    }
    const graphEffectiveConfig = await resolver.useIssuedResolution(resolution, async (current) => {
      const currentConfig = current.parsedConfig;
      const graphProcessedConfig = await preProcessGraphTokens(currentConfig.effectiveConfig, {
        user: currentConfig.actor.user,
        graphTokenResolver: getGraphApiToken,
        scopes: process.env.GRAPH_API_SCOPES,
      });
      const effectiveConfig = processMCPEnv({
        user: currentConfig.actor.user,
        body: requestBody,
        dbSourced: false,
        options: graphProcessedConfig,
        customUserVars: currentConfig.customUserVars,
      });
      if (mcpOptionsContainGraphTokenPlaceholder(effectiveConfig)) {
        throw new Error(`MCP Graph token is unavailable for ${serverName}`);
      }
      return effectiveConfig;
    });
    return await resolveCurrentMCPToolAuthority({
      user: resolution.parsedConfig.actor.user,
      serverName,
      requestBody,
      schemas,
      discoveryProvenance,
      oauthRequiredHint,
      bounded: true,
      allowMissingAuthorization,
      allowMissingCredentials,
      expectedServerConfig: resolution.parsedConfig.sourceConfig,
      materializedEffectiveConfig: graphEffectiveConfig,
    });
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
  requestBody,
  schemas,
  discoveryProvenance,
  oauthRequiredHint,
}) {
  if (!discoveryProvenance) {
    return null;
  }
  return await resolveCurrentMCPToolAuthority({
    user,
    serverName,
    requestBody,
    schemas,
    discoveryProvenance,
    oauthRequiredHint,
    bounded: true,
    expectedServerConfig: serverConfig,
  });
}

module.exports = {
  matchesMCPToolAuthorityScope,
  resolveCurrentMCPAuthoritySnapshot,
  resolveCurrentMCPDiscoveryScope,
  resolveCurrentMCPPrincipal,
  resolveCurrentMCPToolAuthority,
};
