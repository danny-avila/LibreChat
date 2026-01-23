const express = require('express');
const { checkAccess, createApiKeyHandlers } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
});

router.post(
  '/',
  requireJwtAuth,
  checkAccess([PermissionTypes.AGENTS, Permissions.SHARE_PUBLIC]),
  handlers.createApiKey,
);

router.get(
  '/',
  requireJwtAuth,
  checkAccess([PermissionTypes.AGENTS, Permissions.SHARE_PUBLIC]),
  handlers.listApiKeys,
);

router.get(
  '/:id',
  requireJwtAuth,
  checkAccess([PermissionTypes.AGENTS, Permissions.SHARE_PUBLIC]),
  handlers.getApiKey,
);

router.delete(
  '/:id',
  requireJwtAuth,
  checkAccess([PermissionTypes.AGENTS, Permissions.SHARE_PUBLIC]),
  handlers.deleteApiKey,
);

module.exports = router;
