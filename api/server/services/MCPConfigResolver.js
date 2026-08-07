const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  getAppConfigOptionsFromUser,
  getMCPToolCatalogRevision,
  normalizeServerName,
} = require('@librechat/api');
const { getMCPServersRegistry } = require('~/config');
const { getAppConfig } = require('./Config');

async function getAppConfigForUser(userId, user, refresh = false) {
  return await getAppConfig({
    ...getAppConfigOptionsFromUser({ ...user, id: userId }, user?.tenantId ?? getTenantId()),
    refresh,
    failClosed: refresh,
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
  const appConfig = await getAppConfigForUser(userId, user, true);
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
  return {
    configs,
    securityPolicy,
    ...(collisionServerNames && { collisionServerNames }),
  };
}

module.exports = {
  getAppConfigForUser,
  resolveAllMcpConfigs,
  resolveAllMcpConfigsFresh,
  resolveMCPDiscoveryConfigSnapshot,
};
