const express = require('express');
const { generateCheckAccess, tenantContextMiddleware } = require('@librechat/api');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const { configMiddleware, canAccessAgentResource } = require('~/server/middleware');
const v1 = require('~/server/controllers/agents/v1');
const { getRoleByName } = require('~/models');
const {
  preAuthTenantMiddleware,
  requireRemoteAgentM2MAuth,
  checkRemoteAgentsFeature,
} = require('./middleware');

const router = express.Router();

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

const checkAgentCreate = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

const m2mAuth = (action) => [
  preAuthTenantMiddleware,
  requireRemoteAgentM2MAuth({ action }),
  tenantContextMiddleware,
  configMiddleware,
  checkRemoteAgentsFeature,
];

router.get('/', m2mAuth('read'), checkAgentAccess, v1.getListAgents);

router.post('/', m2mAuth('create'), checkAgentCreate, v1.createAgent);

router.get(
  '/:id/expanded',
  m2mAuth('read'),
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  (req, res) => v1.getAgent(req, res, true),
);

router.get(
  '/:id',
  m2mAuth('read'),
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'id',
  }),
  v1.getAgent,
);

router.patch(
  '/:id',
  m2mAuth('update'),
  checkAgentCreate,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  v1.updateAgent,
);

router.delete(
  '/:id',
  m2mAuth('delete'),
  checkAgentCreate,
  canAccessAgentResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'id',
  }),
  v1.deleteAgent,
);

module.exports = router;
