const { createScheduleMCPPreflight } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { getMCPManager, getMCPServersRegistry, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config/app');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { exchangeOboToken } = require('~/server/services/OboTokenService');
const { createOboTrustChecker } = require('~/server/services/OboPolicyService');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const { getLogStores } = require('~/cache');
const methods = require('~/models');

module.exports = createScheduleMCPPreflight({
  getRoleByName: methods.getRoleByName,
  getAgents: (ids) =>
    methods.getAgents({ id: { $in: ids } }, '_id id tools agent_ids edges subagents'),
  findAccessibleResources,
  getUser: (id) => methods.findUser({ _id: id }),
  getAppConfig,
  ensureConfigServers: (config) => getMCPServersRegistry().ensureConfigServers(config),
  getServerConfigs: (userId, config, role) =>
    getMCPServersRegistry().getAllServerConfigs(userId, config, role),
  findPluginAuthsByKeys: methods.findPluginAuthsByKeys,
  connect: (options) =>
    getMCPManager().getConnection({
      ...options,
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
