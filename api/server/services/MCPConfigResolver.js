const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  getAppConfigOptionsFromUser,
  getMCPToolCatalogRevision,
  normalizeServerName,
} = require('@librechat/api');
const { getMCPServersRegistry } = require('~/config');
const { getAppConfig, getMCPAppConfigSnapshot } = require('./Config');

async function getAppConfigForUser(userId, user, refreshOverrides = false) {
  return await getAppConfig({
    ...getAppConfigOptionsFromUser({ ...user, id: userId }, user?.tenantId ?? getTenantId()),
    refreshOverrides,
    failClosed: refreshOverrides,
    mcpOnly: refreshOverrides,
  });
}

async function resolveAllMcpConfigs(userId, user) {
  const registry = getMCPServersRegistry();
  const appConfig = await getAppConfigForUser(userId, user);
  let configServers = {};
  try {
    configServers = await registry.ensureConfigServers(appConfig?.mcpConfig || {});
  } catch (error) {
    logger.warn(
      '[resolveAllMcpConfigs] Config server resolution failed, continuing without:',
      error,
    );
  }
  if (user?.role) {
    return await registry.getAllServerConfigs(userId, configServers, user.role);
  }
  return await registry.getAllServerConfigs(userId, configServers);
}

async function resolveAllMcpConfigsFresh(userId, user) {
  return (await resolveMCPDiscoveryConfigSnapshot(userId, user)).configs;
}

async function resolveMCPDiscoveryConfigSnapshot(userId, user, options = {}) {
  const registry = getMCPServersRegistry();
  const appConfigOptions = {
    ...getAppConfigOptionsFromUser({ ...user, id: userId }, user?.tenantId ?? getTenantId()),
    failClosed: true,
  };
  const { config: appConfig, sourceDocuments } = await getMCPAppConfigSnapshot(appConfigOptions);
  const securityPolicy = {
    allowedDomains: appConfig?.mcpSettings?.allowedDomains,
    allowedAddresses: appConfig?.mcpSettings?.allowedAddresses,
  };
  const selectedServerNames = options.serverNames ? new Set(options.serverNames) : null;
  const includesServer = (serverName) =>
    selectedServerNames == null ||
    selectedServerNames.has(serverName) ||
    selectedServerNames.has(normalizeServerName(serverName));
  const currentMcpConfig = Object.fromEntries(
    Object.entries(appConfig?.mcpConfig || {}).filter(([serverName]) => includesServer(serverName)),
  );
  if (options.bounded === true && selectedServerNames) {
    const selectedNames = [...selectedServerNames];
    const configs = {};
    const collisionServerNames = new Set(Object.keys(appConfig?.mcpConfig || {}));
    for (const selectedName of selectedNames) {
      const rawNames = Object.keys(currentMcpConfig).filter(
        (name) => name === selectedName || normalizeServerName(name) === selectedName,
      );
      if (rawNames.length > 1) {
        rawNames.forEach((name) => collisionServerNames.add(name));
        continue;
      }
      const lookupName = rawNames[0] ?? selectedName;
      if (normalizeServerName(lookupName) !== lookupName) {
        const accessibleNames = await registry.getAccessibleUserServerNamesFresh(
          userId,
          user?.role,
        );
        accessibleNames.forEach((name) => collisionServerNames.add(name));
      }
      const dbConfig = await registry.getUserServerConfigFresh(lookupName, userId, user?.role);
      const expectedConfig =
        options.expectedServerConfigs?.[lookupName] ??
        options.expectedServerConfigs?.[selectedName];
      const rawConfig = currentMcpConfig[lookupName];
      if (dbConfig?.source === 'user') {
        configs[lookupName] = dbConfig;
        continue;
      }
      if (!expectedConfig || !rawConfig) {
        continue;
      }
      try {
        if (getMCPToolCatalogRevision(expectedConfig) === getMCPToolCatalogRevision(rawConfig)) {
          configs[lookupName] = expectedConfig;
        }
      } catch {
        /** A changed or unverifiable raw authority proof fails closed. */
      }
    }
    return {
      configs,
      sourceDocuments,
      securityPolicy,
      collisionServerNames: [...collisionServerNames],
      missingConfigServerNames: Object.keys(currentMcpConfig).filter(
        (serverName) => !configs[serverName],
      ),
    };
  }
  const configServers = await registry.ensureConfigServers(currentMcpConfig, {
    failClosed: true,
    ...(options.initializeMissing === false && { initializeMissing: false }),
    allowlists: securityPolicy,
  });
  const allConfigs = user?.role
    ? await registry.getAllServerConfigsFresh(userId, configServers, user.role)
    : await registry.getAllServerConfigsFresh(userId, configServers);
  if (options.initializeMissing === false) {
    for (const [serverName, rawConfig] of Object.entries(currentMcpConfig)) {
      if (configServers[serverName] || allConfigs[serverName]?.source === 'user') {
        continue;
      }
      try {
        if (
          allConfigs[serverName] &&
          getMCPToolCatalogRevision(allConfigs[serverName]) === getMCPToolCatalogRevision(rawConfig)
        ) {
          continue;
        }
      } catch {
        /** An unverifiable Config override is cold for authority reads. */
      }
      delete allConfigs[serverName];
    }
  }
  const configs = selectedServerNames
    ? Object.fromEntries(
        Object.entries(allConfigs).filter(([serverName]) => includesServer(serverName)),
      )
    : allConfigs;
  const collisionServerNames = selectedServerNames
    ? [...new Set([...Object.keys(allConfigs), ...Object.keys(appConfig?.mcpConfig || {})])]
    : undefined;
  const missingConfigServerNames = Object.keys(currentMcpConfig).filter(
    (serverName) => !configServers[serverName] && !allConfigs[serverName],
  );
  const pendingConfigs =
    options.initializeMissing === false
      ? Object.fromEntries(
          missingConfigServerNames.map((serverName) => [serverName, currentMcpConfig[serverName]]),
        )
      : {};
  return {
    configs,
    ...(options.initializeMissing === false && { pendingConfigs }),
    sourceDocuments,
    securityPolicy,
    collisionServerNames: collisionServerNames ?? [
      ...new Set([...Object.keys(allConfigs), ...Object.keys(appConfig?.mcpConfig || {})]),
    ],
    missingConfigServerNames,
  };
}

module.exports = {
  getAppConfigForUser,
  resolveAllMcpConfigs,
  resolveAllMcpConfigsFresh,
  resolveMCPDiscoveryConfigSnapshot,
};
