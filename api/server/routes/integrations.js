const express = require('express');
const {
  createIntegrationHandlers,
  createNangoService,
  getNangoClient,
  isNangoConfigured,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const nangoService = createNangoService({
  getClient: getNangoClient,
  findNangoConnectionByUserAndProvider: db.findNangoConnectionByUserAndProvider,
  listNangoConnectionsByUserId: db.listNangoConnectionsByUserId,
  listNangoConnectionsByTenantId: db.listNangoConnectionsByTenantId,
  upsertNangoConnection: db.upsertNangoConnection,
  deleteNangoConnectionByUserAndProvider: db.deleteNangoConnectionByUserAndProvider,
});

const handlers = createIntegrationHandlers({
  nangoService,
  isNangoConfigured,
});

router.use(requireJwtAuth);

router.get('/', handlers.listIntegrations);
router.get('/:providerKey/files', handlers.searchProviderFiles);
router.post('/:providerKey/files/download', handlers.downloadProviderFiles);
router.get('/:providerKey/messages', handlers.searchProviderMessages);
router.post('/:providerKey/messages/attach', handlers.attachProviderMessages);
router.get('/:providerKey/events', handlers.listProviderEvents);
router.post('/:providerKey/events/attach', handlers.attachProviderEvents);
router.get('/:providerKey/status', handlers.getProviderStatus);
router.get('/:providerKey/token', handlers.getProviderToken);
router.post('/:providerKey/connect-session', handlers.createConnectSession);
router.post('/:providerKey/sync', handlers.syncConnection);
router.delete('/:providerKey', handlers.disconnectProvider);

module.exports = router;
