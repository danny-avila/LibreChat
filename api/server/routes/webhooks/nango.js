const express = require('express');
const { createNangoWebhookHandler, createNangoService, getNangoClient } = require('@librechat/api');
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

const handler = createNangoWebhookHandler({ nangoService });

router.post('/', handler);

module.exports = router;
