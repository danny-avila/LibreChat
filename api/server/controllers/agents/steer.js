const { randomUUID } = require('crypto');
const { logger } = require('@librechat/data-schemas');
const {
  GenerationJobManager,
  isSteeringSupported,
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_ENQUEUE_QUEUE_FULL,
} = require('@librechat/api');

/** Character cap for a single steer message (env-overridable). */
const STEER_MAX_LENGTH = parseInt(process.env.STEER_MAX_LENGTH ?? '', 10) || 16000;

/** Untenanted jobs (pre-multi-tenancy) remain accessible if the userId check passes. */
function hasTenantMismatch(job, user) {
  return job.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

/**
 * POST /api/agents/chat/steer
 *
 * Queue a mid-run user message against the conversation's active generation
 * job. The steer is injected into the running graph at the next tool-batch
 * boundary by the owning process's drain hook; this route only enqueues, so
 * it is safe to hit from any instance (the queue lives in the shared job
 * store). Rejection codes tell the client how to degrade:
 * - 404 NO_ACTIVE_RUN → send as a normal message
 * - 409 RUN_PAUSED    → run awaits human review; queue client-side instead
 * - 429 STEER_QUEUE_FULL → too many undrained steers
 * - 501 STEER_UNSUPPORTED → SDK cannot inject; queue client-side
 */
const SteerController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.body ?? {};
    if (typeof conversationId !== 'string' || !conversationId || conversationId === 'new') {
      return res.status(400).json({ code: 'INVALID_CONVERSATION' });
    }

    const rawText = req.body?.text;
    if (typeof rawText !== 'string') {
      return res.status(400).json({ code: 'EMPTY_TEXT' });
    }
    const text = rawText.replace(/\0/g, '').trim();
    if (text.length === 0) {
      return res.status(400).json({ code: 'EMPTY_TEXT' });
    }
    if (text.length > STEER_MAX_LENGTH) {
      return res.status(413).json({ code: 'STEER_TOO_LONG', maxLength: STEER_MAX_LENGTH });
    }

    if (!isSteeringSupported()) {
      return res.status(501).json({ code: 'STEER_UNSUPPORTED' });
    }

    /** streamId === conversationId for resumable agent jobs */
    const streamId = conversationId;
    const job = await GenerationJobManager.getJob(streamId);
    if (!job || job.status === 'complete' || job.status === 'error' || job.status === 'aborted') {
      return res.status(404).json({ code: 'NO_ACTIVE_RUN' });
    }
    if (job.metadata?.userId && job.metadata.userId !== userId) {
      logger.warn(`[SteerController] Unauthorized steer attempt for ${streamId} by ${userId}`);
      return res.status(403).json({ code: 'UNAUTHORIZED' });
    }
    if (hasTenantMismatch(job, req.user)) {
      return res.status(403).json({ code: 'UNAUTHORIZED' });
    }
    if (job.status === 'requires_action') {
      return res.status(409).json({ code: 'RUN_PAUSED' });
    }

    const item = { steerId: randomUUID(), text, userId, createdAt: Date.now() };
    const depth = await GenerationJobManager.steering.enqueue(streamId, item);
    if (depth === STEER_ENQUEUE_NOT_RUNNING) {
      return res.status(404).json({ code: 'NO_ACTIVE_RUN' });
    }
    if (depth === STEER_ENQUEUE_QUEUE_FULL) {
      return res.status(429).json({ code: 'STEER_QUEUE_FULL' });
    }

    return res.status(202).json({
      status: 'queued',
      steerId: item.steerId,
      position: depth,
      conversationId,
    });
  } catch (error) {
    logger.error('[SteerController] Failed to queue steer', error);
    return res.status(500).json({ code: 'STEER_FAILED' });
  }
};

module.exports = SteerController;
