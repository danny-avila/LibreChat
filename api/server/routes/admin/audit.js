const express = require('express');
const { createAdminAuditLogHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAuditLogRead = requireCapability(SystemCapabilities.READ_AUDIT_LOG);

const handlers = createAdminAuditLogHandlers({
  listAuditLogPage: db.listAuditLogPage,
  findAuditLogEntry: db.findAuditLogEntry,
  streamAuditLogEntries: db.streamAuditLogEntries,
});

router.use(requireJwtAuth, requireAuditLogRead);

router.get('/', handlers.listAuditLog);
/** `/export.csv` MUST precede `/:id` so it isn't matched as `{ id: 'export.csv' }`. */
router.get('/export.csv', handlers.exportAuditLogCsv);
router.get('/:id', handlers.getAuditLogEntry);

module.exports = router;
