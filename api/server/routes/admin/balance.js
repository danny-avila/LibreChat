const express = require('express');
const { createAdminBalanceHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);

const handlers = createAdminBalanceHandlers({
  findBalanceByUser: db.findBalanceByUser,
  updateBalance: db.updateBalance,
  listBalances: db.listBalances,
  findUser: db.findUser,
  recordAuditEntry: db.recordAuditEntry,
  /** Opt-in: fail the request if its audit entry can't be persisted. */
  auditFailClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsage, handlers.listBalances);

module.exports = router;
