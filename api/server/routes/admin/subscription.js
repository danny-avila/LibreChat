const express = require('express');
const { logger, AdminAuditActions } = require('@librechat/data-schemas');
const {
  requireJwtAuth,
  checkBan,
  checkAdmin,
  adminRateLimiter,
  checkAdminIpAllowlist,
  auditLogger,
} = require('~/server/middleware');
const subscriptionService = require('~/server/services/admin/subscription');

const router = express.Router();

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

/**
 * Validate the userId path parameter as a Mongo ObjectId. If invalid, respond
 * with 400 immediately so audit + downstream calls never see a bad value.
 */
function validateUserIdParam(req, res, next) {
  const { userId } = req.params;
  if (!subscriptionService.isValidObjectId(userId)) {
    return res.status(400).json({ message: 'Invalid userId', code: 'INVALID_USER_ID' });
  }
  return next();
}

// State carrier so audit getBefore/getAfter can read snapshots written during
// the route handler. Stored on req to avoid module-level state.
function attachSnapshotCarrier(req, _res, next) {
  req._auditSnapshots = { before: null, after: null };
  next();
}

const getReason = (req) =>
  req.body && typeof req.body.reason === 'string' ? req.body.reason : null;
const getTargetIdFromParam = (req) => req.params.userId || null;
const getBeforeSnap = (req) =>
  req._auditSnapshots?.before
    ? subscriptionService.snapshotProfile(req._auditSnapshots.before)
    : null;
const getAfterSnap = (req) =>
  req._auditSnapshots?.after
    ? subscriptionService.snapshotProfile(req._auditSnapshots.after)
    : null;

/**
 * GET /
 * List active Pro user subscriptions, paginated.
 */
router.get(
  '/',
  auditLogger(AdminAuditActions.SUBSCRIPTION_VIEW, {
    targetType: 'subscription',
    getTargetId: () => null,
  }),
  async (req, res) => {
    try {
      const { q, plan, store, manuallyOverridden, sort, page, limit } = req.query || {};
      const result = await subscriptionService.listSubscriptions({
        q,
        plan,
        store,
        manuallyOverridden,
        sort,
        page,
        limit,
      });
      return res.status(200).json(result);
    } catch (err) {
      logger.error('[admin /subscription GET /] error', err);
      return res.status(500).json({ message: 'Failed to list subscriptions' });
    }
  },
);

/**
 * GET /users/:userId
 * Detail for one user's subscription.
 */
router.get(
  '/users/:userId',
  validateUserIdParam,
  auditLogger(AdminAuditActions.SUBSCRIPTION_VIEW, {
    targetType: 'subscription',
    getTargetId: getTargetIdFromParam,
  }),
  async (req, res) => {
    try {
      const profile = await subscriptionService.getSubscriptionForUser(req.params.userId);
      return res.status(200).json(profile);
    } catch (err) {
      if (err && err.code === 'NO_SUBSCRIPTION') {
        return res
          .status(404)
          .json({ message: 'No subscription for user', code: 'NO_SUBSCRIPTION' });
      }
      logger.error('[admin /subscription GET /users/:userId] error', err);
      return res.status(500).json({ message: 'Failed to load subscription' });
    }
  },
);

/**
 * POST /users/:userId/grant
 * Manually grant Pro to a user. Requires fresh auth.
 */
router.post(
  '/users/:userId/grant',
  validateUserIdParam,
  attachSnapshotCarrier,
  auditLogger(AdminAuditActions.SUBSCRIPTION_GRANT, {
    targetType: 'subscription',
    getTargetId: getTargetIdFromParam,
    getBefore: getBeforeSnap,
    getAfter: getAfterSnap,
    getReason,
  }),
  async (req, res) => {
    try {
      const reason = getReason(req);
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: 'reason is required', code: 'REASON_REQUIRED' });
      }

      const { plan } = req.body || {};
      if (plan !== undefined && (typeof plan !== 'string' || plan.length === 0)) {
        return res.status(400).json({ message: 'plan must be a non-empty string' });
      }

      const actorId = req.user?.id || req.user?._id?.toString();
      const actorEmail = req.user?.email;

      const { before, after } = await subscriptionService.grantPro(req.params.userId, {
        reason,
        plan,
        actorId,
        actorEmail,
      });

      req._auditSnapshots.before = before;
      req._auditSnapshots.after = after;

      return res.status(200).json(after);
    } catch (err) {
      if (err && err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin /subscription grant] error', err);
      return res.status(500).json({ message: 'Failed to grant subscription' });
    }
  },
);

/**
 * POST /users/:userId/revoke
 * Manually revoke Pro for a user. Requires fresh auth.
 */
router.post(
  '/users/:userId/revoke',
  validateUserIdParam,
  attachSnapshotCarrier,
  auditLogger(AdminAuditActions.SUBSCRIPTION_REVOKE, {
    targetType: 'subscription',
    getTargetId: getTargetIdFromParam,
    getBefore: getBeforeSnap,
    getAfter: getAfterSnap,
    getReason,
  }),
  async (req, res) => {
    try {
      const reason = getReason(req);
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: 'reason is required', code: 'REASON_REQUIRED' });
      }

      const actorId = req.user?.id || req.user?._id?.toString();
      const actorEmail = req.user?.email;

      const { before, after } = await subscriptionService.revokePro(req.params.userId, {
        reason,
        actorId,
        actorEmail,
      });

      req._auditSnapshots.before = before;
      req._auditSnapshots.after = after;

      return res.status(200).json(after);
    } catch (err) {
      if (err && err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin /subscription revoke] error', err);
      return res.status(500).json({ message: 'Failed to revoke subscription' });
    }
  },
);

/**
 * POST /users/:userId/clear-override
 * Clear the manual override flag. Does NOT change isPro. Allows the natural
 * RevenueCat sync to take over again on subsequent refresh.
 *
 * Note: regular admin only — does NOT require fresh auth.
 */
router.post(
  '/users/:userId/clear-override',
  validateUserIdParam,
  attachSnapshotCarrier,
  auditLogger(AdminAuditActions.SUBSCRIPTION_CLEAR_OVERRIDE, {
    targetType: 'subscription',
    getTargetId: getTargetIdFromParam,
    getBefore: getBeforeSnap,
    getAfter: getAfterSnap,
    getReason,
  }),
  async (req, res) => {
    try {
      const actorId = req.user?.id || req.user?._id?.toString();
      const reason = getReason(req);

      const { before, after } = await subscriptionService.clearOverride(req.params.userId, {
        reason,
        actorId,
      });

      req._auditSnapshots.before = before;
      req._auditSnapshots.after = after;

      return res.status(200).json(after);
    } catch (err) {
      if (err && err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      if (err && err.code === 'NO_SUBSCRIPTION') {
        return res
          .status(404)
          .json({ message: 'No subscription for user', code: 'NO_SUBSCRIPTION' });
      }
      logger.error('[admin /subscription clear-override] error', err);
      return res.status(500).json({ message: 'Failed to clear override' });
    }
  },
);

/**
 * POST /users/:userId/refresh
 * Force-refresh the user's subscription from RevenueCat.
 */
router.post(
  '/users/:userId/refresh',
  validateUserIdParam,
  attachSnapshotCarrier,
  auditLogger(AdminAuditActions.SUBSCRIPTION_REFRESH, {
    targetType: 'subscription',
    getTargetId: getTargetIdFromParam,
    getBefore: getBeforeSnap,
    getAfter: getAfterSnap,
    getReason,
  }),
  async (req, res) => {
    try {
      const { before, after, profile } = await subscriptionService.refreshFromRevenueCat(
        req.params.userId,
      );

      req._auditSnapshots.before = before;
      req._auditSnapshots.after = after;

      return res.status(200).json(profile);
    } catch (err) {
      if (err && err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin /subscription refresh] error', err);
      return res.status(500).json({ message: 'Failed to refresh subscription' });
    }
  },
);

module.exports = router;
