const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { GenerationJobManager } = require('@librechat/api');

const JOB_RECORD_WAIT_ATTEMPTS = 5;
const JOB_RECORD_WAIT_DELAY_MS = 60;
const IDEMPOTENCY_STARTUP_GRACE_MS = 5000;

/**
 * Poll briefly for the winner's job record to appear.
 */
async function waitForJobRecord(streamId) {
  for (let attempt = 0; attempt < JOB_RECORD_WAIT_ATTEMPTS; attempt++) {
    if (await GenerationJobManager.hasJob(streamId)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_RECORD_WAIT_DELAY_MS));
  }
  return GenerationJobManager.hasJob(streamId);
}

/**
 * Runs the start-generation idempotency claim BEFORE the message rate limiters
 * so a retried POST is deduped instead of counting against the user's quota.
 *
 * Called by the chatRouter after auth and config middleware, before
 * `messageIpLimiter` / `messageUserLimiter`.
 */
async function idempotencyCheck(req, res, next) {
  const clientRequestId = req.body?.clientRequestId;
  if (!clientRequestId) {
    return next();
  }

  const userId = req.user.id;
  const reqConversationId = req.body?.conversationId;
  const isNewConvo = !reqConversationId || reqConversationId === 'new';
  const conversationId = isNewConvo ? crypto.randomUUID() : reqConversationId;
  const streamId = conversationId;

  req.body.conversationId = conversationId;

  let claim = null;
  try {
    claim = await GenerationJobManager.claimGeneration(
      userId,
      clientRequestId,
      streamId,
      conversationId,
    );
  } catch (err) {
    logger.error(
      '[IdempotencyMiddleware] Idempotency claim failed; proceeding without dedup',
      err,
    );
    return next();
  }

  if (claim?.claimed) {
    req._ownsIdempotencyClaim = true;
    // If a downstream middleware (rate limiter, moderation, access check) ends
    // the response before the controller creates the job, release the claim so
    // the client can retry without waiting for the TTL. The controller sets
    // `req._resumableStreamId` right before createJob — if it's absent when
    // the response closes, the job was never started.
    res.on('close', () => {
      if (!req._resumableStreamId) {
        GenerationJobManager.releaseGeneration(userId, clientRequestId).catch(() => {});
      }
    });
    return next();
  }

  if (claim?.existing) {
    const existingStreamId = claim.existing.streamId;
    let jobExists = false;
    try {
      jobExists = await waitForJobRecord(existingStreamId);
    } catch (err) {
      logger.error(
        '[IdempotencyMiddleware] Job lookup failed for an existing claim; asking the client to retry',
        err,
      );
      res.set('Retry-After', '1');
      return res.status(503).json({
        code: 'SERVER_NOT_READY',
        error: 'Generation is still starting. Please retry shortly.',
      });
    }

    const claimAgeMs = Date.now() - (claim.existing.claimedAt ?? 0);
    if (!jobExists && claimAgeMs < IDEMPOTENCY_STARTUP_GRACE_MS) {
      res.set('Retry-After', '1');
      return res.status(503).json({
        code: 'SERVER_NOT_READY',
        error: 'Generation is still starting. Please retry shortly.',
      });
    }

    logger.debug('[IdempotencyMiddleware] Deduped retried start-generation request', {
      userId,
      clientRequestId,
      streamId: existingStreamId,
    });
    return res.json({
      streamId: existingStreamId,
      conversationId: claim.existing.conversationId,
      status: 'resumed',
    });
  }

  next();
}

module.exports = idempotencyCheck;
