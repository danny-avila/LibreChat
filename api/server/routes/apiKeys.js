const express = require('express');
const { generateCheckAccess, createApiKeyHandlers } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
});

const checkApiKeyAccess = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.post('/', requireJwtAuth, checkApiKeyAccess, handlers.createApiKey);

router.get('/', requireJwtAuth, checkApiKeyAccess, handlers.listApiKeys);

router.get('/:id', requireJwtAuth, checkApiKeyAccess, handlers.getApiKey);

router.delete('/:id', requireJwtAuth, checkApiKeyAccess, handlers.deleteApiKey);

module.exports = router;
