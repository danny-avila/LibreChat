const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  generateCheckAccess,
  preAuthTenantMiddleware,
  createRequireApiKeyAuth,
  createRemoteAgentAuth,
  createRemoteAgentM2MAuth,
  createCheckRemoteAgentAccess,
} = require('@librechat/api');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const apiKeyMiddleware = createRequireApiKeyAuth({
  validateAgentApiKey: db.validateAgentApiKey,
  findUser: db.findUser,
});

const requireRemoteAgentAuth = createRemoteAgentAuth({
  apiKeyMiddleware,
  findUser: db.findUser,
  getRolesByNames: db.findRolesByNames,
  updateUser: db.updateUser,
  getAppConfig,
});

const requireRemoteAgentM2MAuth = createRemoteAgentM2MAuth({
  findUser: db.findUser,
  getAppConfig,
});

const checkRemoteAgentsFeature = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const checkAgentPermission = createCheckRemoteAgentAccess({
  getAgent: db.getAgent,
  getEffectivePermissions,
});

module.exports = {
  checkAgentPermission,
  preAuthTenantMiddleware,
  requireRemoteAgentAuth,
  requireRemoteAgentM2MAuth,
  checkRemoteAgentsFeature,
};
