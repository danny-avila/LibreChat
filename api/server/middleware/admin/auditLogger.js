const { logger } = require('@librechat/data-schemas');
const { AdminAuditLog } = require('~/db/models');

/**
 * Returns Express middleware that records an AdminAuditLog row after the
 * response is sent. The audit write is best-effort: failures are logged but
 * never propagated to the client.
 *
 * @param {string} action - The action identifier (see AdminAuditActions).
 * @param {object} opts
 * @param {string} opts.targetType - One of the AdminAuditTargetType values.
 * @param {(req) => string|null} [opts.getTargetId]
 * @param {(req, res) => unknown} [opts.getBefore]
 * @param {(req, res) => unknown} [opts.getAfter]
 * @param {(req, res) => unknown} [opts.getMeta]
 * @param {(req) => string|null} [opts.getReason]
 */
function auditLogger(action, opts = {}) {
  const { targetType, getTargetId, getBefore, getAfter, getMeta, getReason } = opts;

  if (!targetType) {
    throw new Error('auditLogger requires opts.targetType');
  }

  return function auditLoggerMiddleware(req, res, next) {
    const startedAt = process.hrtime.bigint();
    let capturedBody = null;

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      capturedBody = body;
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (capturedBody === null) {
        capturedBody = body;
      }
      return originalSend(body);
    };

    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      const targetId = safeCall(getTargetId, [req]) ?? null;
      const status = res.statusCode < 400 ? 'success' : 'failure';
      const logFields = {
        admin: true,
        adminAction: action,
        adminActorId: req.user?.id || req.user?._id?.toString() || null,
        adminActorEmail: req.user?.email || null,
        adminTargetType: targetType,
        adminTargetId: targetId,
        adminStatus: status,
        adminStatusCode: res.statusCode,
        adminDurationMs: durationMs,
        adminMethod: req.method,
        adminPath: req.originalUrl || req.url,
      };
      try {
        if (status === 'success') {
          logger.info('[admin] request', logFields);
        } else {
          logger.warn('[admin] request failed', logFields);
        }
      } catch (_e) {
        /* swallow */
      }

      writeAuditRow({
        req,
        res,
        action,
        targetType,
        getTargetId,
        getBefore,
        getAfter,
        getMeta,
        getReason,
        capturedBody,
      }).catch((err) => {
        try {
          logger.error('[admin auditLogger] failed to write audit row', err);
        } catch (_e) {
          /* swallow */
        }
      });
    });

    next();
  };
}

async function writeAuditRow({
  req,
  res,
  action,
  targetType,
  getTargetId,
  getBefore,
  getAfter,
  getMeta,
  getReason,
  capturedBody,
}) {
  try {
    const status = res.statusCode < 400 ? 'success' : 'failure';
    let errorMessage = null;
    if (status === 'failure') {
      if (capturedBody && typeof capturedBody === 'object') {
        if (typeof capturedBody.message === 'string') {
          errorMessage = capturedBody.message;
        } else if (typeof capturedBody.error === 'string') {
          errorMessage = capturedBody.error;
        }
      } else if (typeof capturedBody === 'string') {
        errorMessage = capturedBody.slice(0, 500);
      }
    }

    const actorId = req.user?._id || req.user?.id || null;
    if (!actorId) {
      // No actor → likely an upstream auth failure caught before the
      // user was attached. Skip writing.
      return;
    }

    const doc = {
      actorId,
      actorEmail: req.user?.email || '',
      actorIp: req.ip || null,
      userAgent: req.headers?.['user-agent'] || null,
      action,
      targetType,
      targetId: safeCall(getTargetId, [req]) ?? null,
      before: safeCall(getBefore, [req, res]) ?? null,
      after: safeCall(getAfter, [req, res]) ?? null,
      meta: safeCall(getMeta, [req, res]) ?? null,
      reason: safeCall(getReason, [req]) ?? null,
      status,
      errorMessage,
    };

    await AdminAuditLog.create(doc);
  } catch (err) {
    try {
      logger.error('[admin auditLogger] write failed', err);
    } catch (_e) {
      /* swallow */
    }
  }
}

function safeCall(fn, args) {
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(...args);
  } catch (err) {
    try {
      logger.warn('[admin auditLogger] getter threw; ignoring', err);
    } catch (_e) {
      /* swallow */
    }
    return undefined;
  }
}

module.exports = auditLogger;
