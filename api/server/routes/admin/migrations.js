const express = require('express');
const { createAdminMigrationsHandlers } = require('@librechat/api');
const { SystemCapabilities, getTransactionSupport } = require('@librechat/data-schemas');
const {
  requireCapability,
  superAdminContextMiddleware,
  requirePlatformAdmin,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminMigrationsHandlers({
  findUser: db.findUser,
  countUserData: db.countUserData,
  reassignUserData: db.reassignUserData,
  createAuditEntry: db.createAuditEntry,
  getTransactionSupport,
});

router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);
router.use(requirePlatformAdmin());

router.post('/preview', handlers.previewMigration);
router.post('/', handlers.migrateUser);

module.exports = router;
