const { logger } = require('@librechat/data-schemas');

/**
 * Best-effort writer for "admin request denied" audit rows. Used by the
 * rate-limit handler and the IP-allowlist guard, both of which short-circuit
 * the request BEFORE the per-route auditLogger middleware can attach. Without
 * this helper, denials would leave no durable audit trail.
 *
 * Lazy-loads the AdminAuditLog model so that requiring this middleware does
 * not pull in the full data-schemas bundle at module-load time (which would
 * crash test environments that don't mock `~/db/models`).
 *
 * Never throws. If the row can't be written, logs and returns.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} reason - one of 'rate_limit' | 'ip_blocked' | 'banned' | string
 */
async function writeDenialAudit(req, res, reason) {
  try {
    const actorId = req.user?._id || req.user?.id || null;
    if (!actorId) {
      // No authenticated user (e.g. anonymous probe) — skip; the auth layer
      // already short-circuits and the request is uninteresting.
      return;
    }
    // Lazy-require so test environments that don't mount `~/db/models` are
    // unaffected when this middleware is required for unrelated reasons.
    const { AdminAuditLog } = require('~/db/models');
    await AdminAuditLog.create({
      actorId,
      actorEmail: req.user?.email || '',
      actorIp: req.ip || null,
      userAgent: req.headers?.['user-agent'] || null,
      action: 'ADMIN_DENIED',
      targetType: 'system',
      targetId: null,
      meta: {
        reason,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
      },
      status: 'failure',
      errorMessage: reason,
    });
  } catch (err) {
    try {
      logger.error('[admin writeDenialAudit] failed to write denial row', err);
    } catch (_e) {
      /* swallow */
    }
  }
}

module.exports = writeDenialAudit;
