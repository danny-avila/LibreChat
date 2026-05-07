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
const { listAudit, getAudit, listRecentActions } = require('~/server/services/admin/audit');

const router = express.Router();

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

const META_KEYS = [
  'actorId',
  'action',
  'targetType',
  'targetId',
  'status',
  'from',
  'to',
  'q',
  'page',
  'limit',
  'sort',
];
const META_VALUE_MAX = 200;

function buildMeta(req) {
  const meta = {};
  for (const key of META_KEYS) {
    const v = req.query?.[key];
    if (v === undefined || v === null || v === '') continue;
    const s = String(v);
    meta[key] = s.length > META_VALUE_MAX ? s.slice(0, META_VALUE_MAX) : s;
  }
  return meta;
}

function mapServiceError(err, res) {
  switch (err && err.code) {
    case 'INVALID_ACTOR_ID':
    case 'INVALID_ACTION':
    case 'INVALID_TARGET_TYPE':
    case 'INVALID_STATUS':
    case 'INVALID_DATE':
    case 'INVALID_ID':
      return res.status(400).json({ message: err.message });
    case 'NOT_FOUND':
      return res.status(404).json({ message: 'Not found' });
    default:
      logger.error('[admin /audit] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
  }
}

router.get(
  '/',
  auditLogger(AdminAuditActions.AUDIT_VIEW, {
    targetType: 'audit',
    getTargetId: () => null,
    getMeta: buildMeta,
  }),
  async (req, res) => {
    try {
      const result = await listAudit({
        actorId: req.query.actorId,
        action: req.query.action,
        targetType: req.query.targetType,
        targetId: req.query.targetId,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        q: req.query.q,
        sort: req.query.sort,
        page: req.query.page,
        limit: req.query.limit,
      });
      return res.status(200).json(result);
    } catch (err) {
      return mapServiceError(err, res);
    }
  },
);

router.get(
  '/actions',
  auditLogger(AdminAuditActions.AUDIT_VIEW, {
    targetType: 'audit',
    getTargetId: () => null,
    getMeta: () => ({ scope: 'recent-actions' }),
  }),
  async (_req, res) => {
    try {
      const rows = await listRecentActions();
      return res.status(200).json(rows);
    } catch (err) {
      logger.error('[admin /audit/actions] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

router.get(
  '/:id',
  auditLogger(AdminAuditActions.AUDIT_VIEW, {
    targetType: 'audit',
    getTargetId: (req) => req.params.id || null,
  }),
  async (req, res) => {
    try {
      const row = await getAudit(req.params.id);
      return res.status(200).json(row);
    } catch (err) {
      return mapServiceError(err, res);
    }
  },
);

module.exports = router;
