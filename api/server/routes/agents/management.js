const express = require('express');
const {
  createAgentManagementCreateHandler,
  createAgentManagementDeleteHandler,
  createAgentManagementReadHandlers,
  createAgentManagementUpdateHandler,
  mapAgentManagementError,
} = require('@librechat/api');
const { checkBan, configMiddleware } = require('~/server/middleware');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { checkPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const v1 = require('~/server/controllers/agents/v1');
const db = require('~/models');
const { requireAgentManagementAuth } = require('./middleware');

const router = express.Router();
const readHandlers = createAgentManagementReadHandlers({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  getAgentManagementListByAccess: db.getAgentManagementListByAccess,
  findAccessibleResources,
  checkPermission,
  hasCapability,
});
const createHandler = createAgentManagementCreateHandler({
  getRoleByName: db.getRoleByName,
  createAgent: v1.createAgent,
});
const updateHandler = createAgentManagementUpdateHandler({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  checkPermission,
  hasCapability,
  updateAgent: v1.updateAgent,
});
const deleteHandler = createAgentManagementDeleteHandler({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  checkPermission,
  hasCapability,
  deleteAgent: db.deleteAgent,
});

router.use(requireAgentManagementAuth);
router.use(checkBan);

router.post('/', configMiddleware, createHandler);
router.get('/', readHandlers.list);
router.get('/:id', readHandlers.get);
router.patch('/:id', configMiddleware, updateHandler);
router.delete('/:id', deleteHandler);

router.use((_req, res) => {
  const { status, body } = mapAgentManagementError('not_found');
  return res.status(status).json(body);
});

module.exports = router;
