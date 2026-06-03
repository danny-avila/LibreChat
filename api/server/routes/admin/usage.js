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

/** Start of the current UTC month as an ISO string (mirrors data-schemas currentMonthStartUTC). */
const currentMonthStartISO = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

/** Default AnalyticsPeriod: the current month, open-ended (end = null = "until now"). */
const currentMonthPeriod = () => ({
  key: 'current-month',
  label: 'Current month',
  start: currentMonthStartISO(),
  end: null,
});

/** If [start, end[ spans exactly one calendar month (UTC), returns its 'YYYY-MM' key; else null. */
const monthKeyIfMonthWindow = (start, end) => {
  const isMonthStart =
    start.getUTCDate() === 1 &&
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    start.getUTCSeconds() === 0 &&
    start.getUTCMilliseconds() === 0;
  if (!isMonthStart) {
    return null;
  }
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  if (end.getTime() !== nextMonth.getTime()) {
    return null;
  }
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Parses the analytics query (?overall | ?start&end | default) + ?bu from a request.
 * Returns { params, period, error } — params feed the aggregation, period is echoed in the
 * response, error is a 400 message (params/period null) when a date is malformed.
 * Shared by GET /api/admin/usage and GET /api/admin/usage/models so both honour the same contract.
 */
const parseUsageQuery = (req) => {
  const { start, end, bu, overall } = req.query;
  const params = {};
  let period;

  if (overall === 'true') {
    params.start = new Date(0);
    params.end = new Date();
    period = { key: 'overall', label: 'Overall', start: null, end: null };
  } else {
    if (start !== undefined) {
      const parsed = parseDateUTC(start);
      if (!parsed) {
        return { params: null, period: null, error: 'Invalid start date (expected YYYY-MM-DD)' };
      }
      params.start = parsed;
    }
    if (end !== undefined) {
      const parsed = parseDateUTC(end);
      if (!parsed) {
        return { params: null, period: null, error: 'Invalid end date (expected YYYY-MM-DD)' };
      }
      params.end = parsed;
    }

    if (params.start && params.end) {
      const monthKey = monthKeyIfMonthWindow(params.start, params.end);
      period = monthKey
        ? { key: monthKey, label: monthKey, start: params.start.toISOString(), end: params.end.toISOString() }
        : {
            key: 'custom',
            label: 'Custom range',
            start: params.start.toISOString(),
            end: params.end.toISOString(),
          };
    } else if (params.start || params.end) {
      period = {
        key: 'custom',
        label: 'Custom range',
        start: params.start ? params.start.toISOString() : null,
        end: params.end ? params.end.toISOString() : null,
      };
    } else {
      period = currentMonthPeriod();
    }
  }

  if (typeof bu === 'string' && ALLOWED_BU.has(bu)) {
    params.bu = bu;
  }

  return { params, period, error: null };
};

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsage, async (req, res) => {
  const { params, period, error } = parseUsageQuery(req);
  if (error) {
    return res.status(400).json({ message: error });
  }
  try {
    const rows = await db.aggregateMonthlyUsage(params);
    res.json({ period, rows });
  } catch (err) {
    logger.error('[GET /api/admin/usage] aggregation failed:', err);
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
  const { params, period, error } = parseUsageQuery(req);
  if (error) {
    return res.status(400).json({ message: error });
  }
  try {
    const rows = await db.aggregateUsageByModel(params);
    res.json({ period, rows });
  } catch (err) {
    logger.error('[GET /api/admin/usage/models] aggregation failed:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
