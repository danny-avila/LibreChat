const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  generateCheckAccess,
  preAuthTenantMiddleware,
  createRequireApiKeyAuth,
  createRemoteAgentAuth,
  createAgentManagementAuth,
  createConversationManagementAuth,
  createCheckAgentTriggerAccess,
  createCheckRemoteAgentAccess,
} = require('@librechat/api');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const apiKeyMiddleware = createRequireApiKeyAuth({
  validateAgentApiKey: db.validateAgentApiKey,
  findUser: db.findUser,
  isPrincipalActive: db.isAgentTriggerPrincipalActive,
});

const remoteAuth = (getConfig) =>
  createRemoteAgentAuth({
    apiKeyMiddleware,
    findUser: db.findUser,
    getRolesByNames: db.findRolesByNames,
    updateUser: db.updateUser,
    isPrincipalActive: db.isAgentTriggerPrincipalActive,
    getAppConfig: getConfig,
  });

const managementAuth = (getConfig) =>
  createAgentManagementAuth({
    findUser: db.findUser,
    isPrincipalActive: db.isAgentTriggerPrincipalActive,
    getAppConfig: getConfig,
  });

const requireRemoteAgentAuth = remoteAuth(getAppConfig);
const requireAgentManagementAuth = managementAuth(getAppConfig);

const checkRemoteAgentsFeature = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const requireConversationManagementAuth = createConversationManagementAuth({
  getAppConfig,
  remoteAuth,
  remoteAccess: checkRemoteAgentsFeature,
  managementAuth,
});

const agentAccessDependencies = {
  getAgent: db.getAgent,
  getEffectivePermissions,
};

const checkAgentPermission = createCheckRemoteAgentAccess(agentAccessDependencies);
const checkAgentTriggerPermission = createCheckAgentTriggerAccess(agentAccessDependencies);

module.exports = {
  checkAgentPermission,
  checkAgentTriggerPermission,
  preAuthTenantMiddleware,
  requireRemoteAgentAuth,
  requireAgentManagementAuth,
  requireConversationManagementAuth,
  checkRemoteAgentsFeature,
};
