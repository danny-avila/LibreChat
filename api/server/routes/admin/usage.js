const express = require('express');
const { createAdminUsageHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireUsageRead = requireCapability(SystemCapabilities.READ_USAGE);

const handlers = createAdminUsageHandlers({
  getUserUsageSummary: db.getUserUsageSummary,
});

router.use(requireJwtAuth, requireAdminAccess, requireUsageRead);

router.get('/', handlers.getUsageSummary);

module.exports = router;
