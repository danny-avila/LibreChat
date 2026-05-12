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
const balanceService = require('~/server/services/admin/balance');

const router = express.Router();

const REASON_MAX_LEN = 500;

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

/**
 * Validate `userId` is an ObjectId. Returns `true` if responded.
 */
function rejectInvalidUserId(req, res) {
  const { userId } = req.params;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
    return true;
  }
  return false;
}

function isValidReason(reason) {
  return typeof reason === 'string' && reason.length >= 1 && reason.length <= REASON_MAX_LEN;
}

// GET /api/admin/balance/users/:userId
router.get(
  '/users/:userId',
  auditLogger(AdminAuditActions.BALANCE_VIEW, {
    targetType: 'balance',
    getTargetId: (req) => req.params.userId,
  }),
  async (req, res) => {
    if (rejectInvalidUserId(req, res)) return;
    try {
      const result = await balanceService.getBalanceForUser(req.params.userId);
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'NO_BALANCE') {
        return res.status(404).json({ message: 'No balance for user', code: 'NO_BALANCE' });
      }
      logger.error('[admin GET /balance/users/:userId] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// POST /api/admin/balance/users/:userId/adjust
router.post(
  '/users/:userId/adjust',
  // Validate userId + body BEFORE the (auth-sensitive) fresh-auth gate so
  // that obvious garbage doesn't reach the auth check.
  (req, res, next) => {
    if (rejectInvalidUserId(req, res)) return;
    const { delta, reason } = req.body || {};
    if (typeof delta !== 'number' || !Number.isFinite(delta) || !Number.isInteger(delta)) {
      return res.status(400).json({ message: 'Invalid delta', code: 'INVALID_DELTA' });
    }
    if (!isValidReason(reason)) {
      return res
        .status(400)
        .json({ message: 'Reason is required (1..500 chars)', code: 'INVALID_REASON' });
    }
    return next();
  },
  auditLogger(AdminAuditActions.BALANCE_ADJUST, {
    targetType: 'balance',
    getTargetId: (req) => req.params.userId,
    getBefore: (_req, res) => {
      const r = res.locals?.balanceResult;
      return r ? { tokenCredits: r.before } : null;
    },
    getAfter: (_req, res) => {
      const r = res.locals?.balanceResult;
      return r ? { tokenCredits: r.after } : null;
    },
    getMeta: (req) => ({ delta: req.body?.delta }),
    getReason: (req) => req.body?.reason || null,
  }),
  async (req, res) => {
    try {
      const result = await balanceService.adjustBalance(req.params.userId, {
        delta: req.body.delta,
        reason: req.body.reason,
        actorId: req.user?.id || req.user?._id?.toString(),
      });
      res.locals.balanceResult = result;
      return res.status(200).json({ tokenCredits: result.after, before: result.before });
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'INVALID_DELTA') {
        return res.status(400).json({ message: 'Invalid delta', code: 'INVALID_DELTA' });
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      if (err.code === 'INSUFFICIENT_BALANCE') {
        return res
          .status(400)
          .json({ message: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' });
      }
      logger.error('[admin POST /balance/users/:userId/adjust] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// POST /api/admin/balance/users/:userId/set
router.post(
  '/users/:userId/set',
  // Validate userId + body BEFORE the (auth-sensitive) fresh-auth gate.
  (req, res, next) => {
    if (rejectInvalidUserId(req, res)) return;
    const { tokenCredits, reason } = req.body || {};
    if (
      typeof tokenCredits !== 'number' ||
      !Number.isFinite(tokenCredits) ||
      !Number.isInteger(tokenCredits) ||
      tokenCredits < 0
    ) {
      return res
        .status(400)
        .json({ message: 'Invalid tokenCredits', code: 'INVALID_TOKEN_CREDITS' });
    }
    if (!isValidReason(reason)) {
      return res
        .status(400)
        .json({ message: 'Reason is required (1..500 chars)', code: 'INVALID_REASON' });
    }
    return next();
  },
  auditLogger(AdminAuditActions.BALANCE_SET, {
    targetType: 'balance',
    getTargetId: (req) => req.params.userId,
    getBefore: (_req, res) => {
      const r = res.locals?.balanceResult;
      return r ? { tokenCredits: r.before } : null;
    },
    getAfter: (_req, res) => {
      const r = res.locals?.balanceResult;
      return r ? { tokenCredits: r.after } : null;
    },
    getMeta: (req) => ({ requested: req.body?.tokenCredits }),
    getReason: (req) => req.body?.reason || null,
  }),
  async (req, res) => {
    try {
      const result = await balanceService.setBalance(req.params.userId, {
        tokenCredits: req.body.tokenCredits,
        reason: req.body.reason,
        actorId: req.user?.id || req.user?._id?.toString(),
      });
      res.locals.balanceResult = result;
      return res.status(200).json({ tokenCredits: result.after, before: result.before });
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'INVALID_TOKEN_CREDITS') {
        return res
          .status(400)
          .json({ message: 'Invalid tokenCredits', code: 'INVALID_TOKEN_CREDITS' });
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin POST /balance/users/:userId/set] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

module.exports = router;
