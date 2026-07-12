const { logger } = require('@librechat/data-schemas');
const { handleSteerRequest } = require('@librechat/api');

/**
 * POST /api/agents/chat/steer
 *
 * Thin wrapper: the full guard ladder (validation, file sanitization,
 * capability gate, ownership/tenant checks, status-guarded enqueue) lives in
 * `@librechat/api` (`handleSteerRequest`), which returns the HTTP status +
 * JSON body to serialize verbatim.
 */
const SteerController = async (req, res) => {
  try {
    const { status, body } = await handleSteerRequest(req.user ?? {}, req.body ?? {});
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[SteerController] Failed to queue steer', error);
    return res.status(500).json({ code: 'STEER_FAILED' });
  }
};

module.exports = SteerController;
