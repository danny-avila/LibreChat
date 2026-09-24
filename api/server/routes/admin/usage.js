const express = require('express');
const { createAdminUsageHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);

const handlers = createAdminUsageHandlers({
  getMonthlyUsage: db.getMonthlyUsage,
  getUsageTotals: db.getUsageTotals,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsage, handlers.getUsage);

module.exports = router;
