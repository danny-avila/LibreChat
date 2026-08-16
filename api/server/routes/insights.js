const express = require('express');
const { createInsightsAccessHandler, createInsightsHandler } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireInsightsAccess = requireCapability(SystemCapabilities.READ_INSIGHTS);

router.use(requireJwtAuth, requireAdminAccess, requireInsightsAccess);
router.get('/access', createInsightsAccessHandler({ getAppConfig }));
router.get('/', createInsightsHandler({ getAppConfig, getInsights: db.getInsights }));

module.exports = router;
