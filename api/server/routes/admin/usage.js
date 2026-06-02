const express = require('express');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);

const ALLOWED_BU = new Set(['POP', 'BETC', 'Other']);

/** Parses a YYYY-MM-DD query value into a UTC Date, or null if absent/invalid. */
const parseDateUTC = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsage, async (req, res) => {
  const { start, end, bu } = req.query;
  const params = {};

  if (start !== undefined) {
    const parsed = parseDateUTC(start);
    if (!parsed) {
      return res.status(400).json({ message: 'Invalid start date (expected YYYY-MM-DD)' });
    }
    params.start = parsed;
  }
  if (end !== undefined) {
    const parsed = parseDateUTC(end);
    if (!parsed) {
      return res.status(400).json({ message: 'Invalid end date (expected YYYY-MM-DD)' });
    }
    params.end = parsed;
  }
  if (typeof bu === 'string' && ALLOWED_BU.has(bu)) {
    params.bu = bu;
  }

  try {
    const rows = await db.aggregateMonthlyUsage(params);
    res.json({ period: 'current-month', rows });
  } catch (error) {
    logger.error('[GET /api/admin/usage] aggregation failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/periods', requireReadUsage, async (req, res) => {
  try {
    const periods = await db.listAvailablePeriods();
    res.json({ periods });
  } catch (error) {
    logger.error('[GET /api/admin/usage/periods] listing failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/models', requireReadUsage, async (req, res) => {
  try {
    const rows = await db.aggregateUsageByModel();
    res.json({ period: 'current-month', rows });
  } catch (error) {
    logger.error('[GET /api/admin/usage/models] aggregation failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
