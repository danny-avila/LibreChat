const express = require('express');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);
const requireManageUsage = requireCapability(SystemCapabilities.MANAGE_USAGE);

router.use(requireJwtAuth, requireAdminAccess);

const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

router.get('/', requireReadUsage, async (req, res) => {
  try {
    const rows = await db.getAllBudgets();
    res.json({ period: 'current-month', rows });
  } catch (error) {
    logger.error('[GET /api/admin/usage/budgets] aggregation failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.patch('/:userId', requireManageUsage, async (req, res) => {
  const { userId } = req.params;
  const { monthlyBudget, monthlyBudgetBaseline } = req.body ?? {};

  const fields = {};
  if (monthlyBudget !== undefined) {
    if (!isPositiveNumber(monthlyBudget)) {
      return res.status(400).json({ message: 'monthlyBudget must be a positive number' });
    }
    fields.monthlyBudget = monthlyBudget;
  }
  if (monthlyBudgetBaseline !== undefined) {
    if (!isPositiveNumber(monthlyBudgetBaseline)) {
      return res.status(400).json({ message: 'monthlyBudgetBaseline must be a positive number' });
    }
    fields.monthlyBudgetBaseline = monthlyBudgetBaseline;
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ message: 'No valid budget field provided' });
  }

  try {
    const balance = await db.updateBudget(userId, fields);
    res.json(balance);
  } catch (error) {
    logger.error('[PATCH /api/admin/usage/budgets/:userId] update failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/reset-month', requireManageUsage, async (req, res) => {
  try {
    const modifiedCount = await db.resetMonthBudgets();
    res.json({ modifiedCount });
  } catch (error) {
    logger.error('[POST /api/admin/usage/budgets/reset-month] reset failed:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
