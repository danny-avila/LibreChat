const express = require('express');
const {
  createAdminIntegrationHandlers,
  createNangoService,
  getNangoClient,
  isNangoConfigured,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  requireCapability,
  superAdminContextMiddleware,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadIntegrations = requireCapability(SystemCapabilities.READ_INTEGRATIONS);
const requireManageIntegrations = requireCapability(SystemCapabilities.MANAGE_INTEGRATIONS);

const nangoService = createNangoService({
  getClient: getNangoClient,
  findNangoConnectionByUserAndProvider: db.findNangoConnectionByUserAndProvider,
  listNangoConnectionsByUserId: db.listNangoConnectionsByUserId,
  listNangoConnectionsByTenantId: db.listNangoConnectionsByTenantId,
  upsertNangoConnection: db.upsertNangoConnection,
  deleteNangoConnectionByUserAndProvider: db.deleteNangoConnectionByUserAndProvider,
});

const handlers = createAdminIntegrationHandlers({
  nangoService,
  isNangoConfigured,
  findUsers: db.findUsers,
});

router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);

router.get('/', requireReadIntegrations, handlers.listMyIntegrations);
router.get('/tenant', requireReadIntegrations, handlers.listTenantIntegrations);
router.get('/users/:userId', requireReadIntegrations, handlers.listUserIntegrations);
router.delete('/:providerKey', requireManageIntegrations, handlers.disconnectProvider);

module.exports = router;
