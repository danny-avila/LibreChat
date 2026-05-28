const express = require('express');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsage, async (req, res) => {
  try {
    const rows = await db.aggregateMonthlyUsage();
    res.json({ period: 'current-month', rows });
  } catch (error) {
    logger.error('[GET /api/admin/usage] aggregation failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
