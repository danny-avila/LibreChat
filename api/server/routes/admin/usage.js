const express = require('express');
const mongoose = require('mongoose');
const { logger, AdminAuditActions } = require('@librechat/data-schemas');
const {
  requireJwtAuth,
  checkBan,
  checkAdmin,
  adminRateLimiter,
  checkAdminIpAllowlist,
  auditLogger,
} = require('~/server/middleware');
const usageService = require('~/server/services/admin/usage');

const router = express.Router();

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

const VALID_RANGES_USER = new Set(['7d', '30d', '90d']);
const VALID_RANGES_ORG = new Set(['30d', '90d']);
const VALID_GRANULARITIES = new Set(['day', 'week']);

function rejectInvalidUserId(req, res) {
  const { userId } = req.params;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
    return true;
  }
  return false;
}

// GET /api/admin/usage/users/:userId
router.get(
  '/users/:userId',
  auditLogger(AdminAuditActions.USAGE_VIEW, {
    targetType: 'user',
    getTargetId: (req) => req.params.userId,
    getMeta: (req) => ({
      range: req.query?.range || '30d',
      granularity: req.query?.granularity || 'day',
    }),
  }),
  async (req, res) => {
    if (rejectInvalidUserId(req, res)) return;
    const range = req.query?.range || '30d';
    const granularity = req.query?.granularity || 'day';
    if (!VALID_RANGES_USER.has(range)) {
      return res.status(400).json({ message: 'Invalid range', code: 'INVALID_RANGE' });
    }
    if (!VALID_GRANULARITIES.has(granularity)) {
      return res.status(400).json({ message: 'Invalid granularity', code: 'INVALID_GRANULARITY' });
    }

    try {
      const result = await usageService.getUsageForUser(req.params.userId, {
        range,
        granularity,
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin GET /usage/users/:userId] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// GET /api/admin/usage/transactions
router.get(
  '/transactions',
  auditLogger(AdminAuditActions.TRANSACTION_VIEW, {
    targetType: 'transaction',
    getMeta: (req) => ({
      userId: req.query?.userId || null,
      from: req.query?.from || null,
      to: req.query?.to || null,
      tokenType: req.query?.tokenType || null,
      model: req.query?.model || null,
      page: req.query?.page || null,
      limit: req.query?.limit || null,
    }),
  }),
  async (req, res) => {
    const { userId, from, to, tokenType, model, page, limit } = req.query || {};

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
    }

    try {
      const result = await usageService.listTransactions({
        userId: userId || undefined,
        from,
        to,
        tokenType,
        model,
        page,
        limit,
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'INVALID_FROM') {
        return res.status(400).json({ message: 'Invalid from date', code: 'INVALID_FROM' });
      }
      if (err.code === 'INVALID_TO') {
        return res.status(400).json({ message: 'Invalid to date', code: 'INVALID_TO' });
      }
      if (err.code === 'INVALID_TOKEN_TYPE') {
        return res.status(400).json({ message: 'Invalid tokenType', code: 'INVALID_TOKEN_TYPE' });
      }
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      logger.error('[admin GET /usage/transactions] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// GET /api/admin/usage/stats/overview
router.get(
  '/stats/overview',
  auditLogger(AdminAuditActions.USAGE_VIEW, {
    targetType: 'system',
    getMeta: () => ({ scope: 'overview' }),
  }),
  async (_req, res) => {
    try {
      const result = await usageService.getOverviewStats();
      return res.status(200).json(result);
    } catch (err) {
      logger.error('[admin GET /usage/stats/overview] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// GET /api/admin/usage/stats/usage
router.get(
  '/stats/usage',
  auditLogger(AdminAuditActions.USAGE_VIEW, {
    targetType: 'system',
    getMeta: (req) => ({ scope: 'org_usage', range: req.query?.range || '30d' }),
  }),
  async (req, res) => {
    const range = req.query?.range || '30d';
    if (!VALID_RANGES_ORG.has(range)) {
      return res.status(400).json({ message: 'Invalid range', code: 'INVALID_RANGE' });
    }
    try {
      const result = await usageService.getOrgUsage({ range });
      return res.status(200).json(result);
    } catch (err) {
      logger.error('[admin GET /usage/stats/usage] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

module.exports = router;
