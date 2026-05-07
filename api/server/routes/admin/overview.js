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
const { getOverview } = require('~/server/services/admin/overview');

const router = express.Router();

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

router.get(
  '/',
  auditLogger(AdminAuditActions.USAGE_VIEW, { targetType: 'system' }),
  async (_req, res) => {
    try {
      const data = await getOverview();
      return res.status(200).json(data);
    } catch (err) {
      logger.error('[admin /overview] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

module.exports = router;
