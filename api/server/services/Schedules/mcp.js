const { createScheduleMCPPreflight } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { getMCPManager, getMCPServersRegistry, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config/app');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { exchangeOboToken } = require('~/server/services/OboTokenService');
const { createOboTrustChecker } = require('~/server/services/OboPolicyService');
const { resolveUpstreamTokenProvider: defaultResolveUpstreamTokenProvider } = require('./upstream');
const { getLogStores } = require('~/cache');
const methods = require('~/models');

/**
 * Builds the schedule MCP preflight. The default application installs a host
 * resolver that redeems a durable OpenID refresh token when
 * `interface.schedules.unattendedOpenIDTokens` is enabled.
 *
 * @param {object} [options]
 * @param {import('@librechat/api').HostUpstreamTokenProviderResolver} [options.resolveUpstreamTokenProvider]
 */
function createMCPPreflight(options = {}) {
  return createScheduleMCPPreflight({
    getRoleByName: methods.getRoleByName,
    resolveAgentGraphAccess: methods.resolveAgentGraphAccess,
    getAgentGraphNodes: methods.getAgentGraphNodes,
    getModelsConfig: (user) => getModelsConfig({ user }),
    getUser: (id) => methods.findUser({ _id: id }),
    getAppConfig,
    ensureConfigServers: (config, limit) =>
      getMCPServersRegistry().ensureConfigServers(config, limit),
    getServerConfigs: (userId, config, role) =>
      getMCPServersRegistry().getAllServerConfigs(userId, config, role),
    findPluginAuthsByKeys: methods.findPluginAuthsByKeys,
    resolveUpstreamTokenProvider:
      options.resolveUpstreamTokenProvider ?? defaultResolveUpstreamTokenProvider,
    connect: (connectionOptions) =>
      getMCPManager().getConnection({
        ...connectionOptions,
        flowManager: getFlowStateManager(getLogStores(CacheKeys.FLOWS)),
        tokenMethods: {
          findToken: methods.findToken,
          updateToken: methods.updateToken,
          createToken: methods.createToken,
          deleteTokens: methods.deleteTokens,
        },
        graphTokenResolver: getGraphApiToken,
        oboTokenResolver: exchangeOboToken,
        oboTrustChecker: createOboTrustChecker(),
      }),
  });
}

module.exports = createMCPPreflight();
module.exports.createMCPPreflight = createMCPPreflight;
