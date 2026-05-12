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
const usersService = require('~/server/services/admin/users');
const impersonateService = require('~/server/services/admin/impersonate');

const router = express.Router();

// Standard admin chain applied to every route on this subrouter.
router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

/**
 * Translate a typed service error to an HTTP response.
 */
function sendServiceError(res, err) {
  const status = err && err.status ? err.status : 500;
  const code = err && err.code ? err.code : 'INTERNAL_ERROR';
  const message = err && err.message ? err.message : 'Internal Server Error';
  return res.status(status).json({ message, code });
}

/**
 * GET /api/admin/users
 */
router.get(
  '/',
  auditLogger(AdminAuditActions.USER_LIST, {
    targetType: 'system',
    getMeta: (req) => ({
      query: {
        q: req.query.q || null,
        role: req.query.role || null,
        provider: req.query.provider || null,
        banned: req.query.banned || null,
        sort: req.query.sort || null,
        page: req.query.page || null,
        limit: req.query.limit || null,
      },
    }),
  }),
  async (req, res) => {
    try {
      const { q, role, provider, banned, createdAfter, createdBefore, sort, page, limit } =
        req.query;

      const result = await usersService.listUsers({
        q,
        role,
        provider,
        banned,
        createdAfter,
        createdBefore,
        sort,
        page,
        limit,
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users] list failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * GET /api/admin/users/:id
 */
router.get(
  '/:id',
  auditLogger(AdminAuditActions.USER_VIEW, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
  }),
  async (req, res) => {
    try {
      const detail = await usersService.getUserDetail(req.params.id);
      return res.status(200).json(detail);
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id] view failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * POST /api/admin/users/:id/ban
 */
router.post(
  '/:id/ban',
  auditLogger(AdminAuditActions.USER_BAN, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) => (typeof req.body?.reason === 'string' ? req.body.reason.trim() : null),
    getBefore: (req, res) => res.locals?.audit?.before ?? null,
    getAfter: (req, res) => res.locals?.audit?.after ?? null,
  }),
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = await usersService.banUser(req.params.id, {
        reason,
        actorId: req.user?.id || req.user?._id,
      });
      res.locals.audit = { before: result.before, after: result.after };
      return res.status(200).json({ user: result.user });
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id/ban] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * POST /api/admin/users/:id/unban
 */
router.post(
  '/:id/unban',
  auditLogger(AdminAuditActions.USER_UNBAN, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) =>
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : null,
    getBefore: (req, res) => res.locals?.audit?.before ?? null,
    getAfter: (req, res) => res.locals?.audit?.after ?? null,
  }),
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = await usersService.unbanUser(req.params.id, {
        reason,
        actorId: req.user?.id || req.user?._id,
      });
      res.locals.audit = { before: result.before, after: result.after };
      return res.status(200).json({ user: result.user });
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id/unban] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * PATCH /api/admin/users/:id/role
 */
router.patch(
  '/:id/role',
  auditLogger(AdminAuditActions.USER_ROLE_CHANGE, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) => (typeof req.body?.reason === 'string' ? req.body.reason.trim() : null),
    getBefore: (req, res) => res.locals?.audit?.before ?? null,
    getAfter: (req, res) => res.locals?.audit?.after ?? null,
  }),
  async (req, res) => {
    try {
      const { role, reason } = req.body || {};
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'reason is required', code: 'REASON_REQUIRED' });
      }
      const result = await usersService.changeUserRole(req.params.id, {
        role,
        actorId: req.user?.id || req.user?._id,
      });
      res.locals.audit = { before: result.before, after: result.after };
      return res.status(200).json({ user: result.user });
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id/role] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * POST /api/admin/users/:id/reset-password
 */
router.post(
  '/:id/reset-password',
  auditLogger(AdminAuditActions.USER_RESET_PASSWORD, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) =>
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : null,
  }),
  async (req, res) => {
    try {
      await usersService.requestPasswordReset(req.params.id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id/reset-password] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * POST /api/admin/users/invite
 */
router.post(
  '/invite',
  auditLogger(AdminAuditActions.USER_INVITE, {
    targetType: 'system',
    getMeta: (req) => ({ email: req.body?.email || null, name: req.body?.name || null }),
    getReason: (req) =>
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : null,
  }),
  async (req, res) => {
    try {
      const { email, name } = req.body || {};
      const result = await usersService.inviteUser({ email, name });
      return res.status(200).json(result);
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/invite] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * DELETE /api/admin/users/:id
 */
router.delete(
  '/:id',
  auditLogger(AdminAuditActions.USER_DELETE, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) => (typeof req.body?.reason === 'string' ? req.body.reason.trim() : null),
    getBefore: (req, res) => res.locals?.audit?.before ?? null,
  }),
  async (req, res) => {
    try {
      const { confirmEmail, reason } = req.body || {};
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ message: 'reason is required', code: 'REASON_REQUIRED' });
      }
      // Pre-fetch a small "before" snapshot for audit, even on success/failure paths.
      res.locals.audit = { before: { id: req.params.id } };
      const result = await usersService.deleteUser(req.params.id, {
        confirmEmail,
        actorId: req.user?.id || req.user?._id,
      });
      res.locals.audit = {
        before: { id: req.params.id, email: result.email },
      };
      return res.status(200).json(result);
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id] delete failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

/**
 * POST /api/admin/users/:id/impersonate
 * Issues a one-shot impersonation URL for the target user. Returns the URL
 * the admin should open in a new tab; the token in that URL is consumed
 * exactly once at /api/auth/impersonate.
 */
router.post(
  '/:id/impersonate',
  auditLogger(AdminAuditActions.USER_IMPERSONATE_ISSUED, {
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getReason: (req) => (typeof req.body?.reason === 'string' ? req.body.reason.trim() : null),
    getMeta: (req, res) => {
      const audit = res.locals?.audit;
      return audit?.meta ?? null;
    },
  }),
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = await impersonateService.issueImpersonationToken({
        targetUserId: req.params.id,
        actor: req.user,
        reason,
      });
      res.locals.audit = {
        meta: {
          jti: extractJtiFromToken(result.token),
          targetEmail: result.targetEmail,
          ttlSec: Math.round((result.expiresAt - Date.now()) / 1000),
        },
      };
      return res.status(200).json({
        url: result.url,
        expiresAt: result.expiresAt,
        targetEmail: result.targetEmail,
      });
    } catch (err) {
      if (err && err.code) {
        return sendServiceError(res, err);
      }
      logger.error('[admin /users/:id/impersonate] failed', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

function extractJtiFromToken(token) {
  // Best-effort decode for the audit meta — token is admin-trusted output we just signed.
  try {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const payload = JSON.parse(Buffer.from(token.slice(0, dot), 'base64url').toString('utf8'));
    return payload?.jti ?? null;
  } catch (_e) {
    return null;
  }
}

module.exports = router;
