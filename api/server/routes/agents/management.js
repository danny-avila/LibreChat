const express = require('express');
const { createAgentManagementReadHandlers, mapAgentManagementError } = require('@librechat/api');
const { checkBan } = require('~/server/middleware');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { checkPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const db = require('~/models');
const { requireAgentManagementAuth } = require('./middleware');

const router = express.Router();
const handlers = createAgentManagementReadHandlers({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  getAgentManagementListByAccess: db.getAgentManagementListByAccess,
  findAccessibleResources,
  checkPermission,
  hasCapability,
});

router.use(requireAgentManagementAuth);
router.use(checkBan);

router.get('/', handlers.list);
router.get('/:id', handlers.get);

router.use((_req, res) => {
  const { status, body } = mapAgentManagementError('not_found');
  return res.status(status).json(body);
});

module.exports = router;
