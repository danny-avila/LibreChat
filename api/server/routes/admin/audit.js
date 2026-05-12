const express = require('express');
const { createAdminAuditLogHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminAuditLogHandlers({
  recordAuditEntry: db.recordAuditEntry,
  listAuditLogPage: db.listAuditLogPage,
  findAuditLogEntry: db.findAuditLogEntry,
  streamAuditLogEntries: db.streamAuditLogEntries,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.listAuditLog);
router.get('/export.csv', handlers.exportAuditLogCsv);
router.get('/:id', handlers.getAuditLogEntry);

module.exports = router;
