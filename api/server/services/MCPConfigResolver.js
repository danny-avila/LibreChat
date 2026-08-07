const { logger, getTenantId } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser } = require('@librechat/api');
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

async function resolveMCPDiscoveryConfigSnapshot(userId, user) {
  const registry = getMCPServersRegistry();
  const appConfig = await getAppConfigForUser(userId, user, true);
  const securityPolicy = {
    allowedDomains: appConfig?.mcpSettings?.allowedDomains,
    allowedAddresses: appConfig?.mcpSettings?.allowedAddresses,
  };
  const configServers = await registry.ensureConfigServers(appConfig?.mcpConfig || {}, {
    failClosed: true,
    allowlists: securityPolicy,
  });
  const configs = user?.role
    ? await registry.getAllServerConfigsFresh(userId, configServers, user.role)
    : await registry.getAllServerConfigsFresh(userId, configServers);
  return { configs, securityPolicy };
}

module.exports = {
  getAppConfigForUser,
  resolveAllMcpConfigs,
  resolveAllMcpConfigsFresh,
  resolveMCPDiscoveryConfigSnapshot,
};
