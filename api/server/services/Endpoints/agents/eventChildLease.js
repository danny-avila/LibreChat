const crypto = require('node:crypto');
const { logger } = require('@librechat/data-schemas');
const { GenerationJobManager } = require('@librechat/api');
const {
  acquireSubagentThreadLease,
  renewSubagentThreadLease,
  releaseSubagentThreadLease,
} = require('~/models');

const EVENT_CHILD_LEASE_TTL_MS = 30_000;
const EVENT_CHILD_LEASE_HEARTBEAT_MS = 10_000;

/** Makes an event-driven child generation visible to the durable deletion protocol. */
async function acquireEventChildGenerationLease({
  userId,
  tenantId,
  conversationId,
  streamId,
  jobCreatedAt,
}) {
  const token = crypto.randomUUID();
  const input = {
    user: userId,
    conversationId,
    token,
    taskId: streamId,
    ...(tenantId == null ? {} : { tenantId }),
  };
  const now = new Date();
  const acquired = await acquireSubagentThreadLease({
    ...input,
    now,
    expiresAt: new Date(now.getTime() + EVENT_CHILD_LEASE_TTL_MS),
  });
  if (!acquired) return null;

  let stopped = false;
  let leaseLost = false;
  let heldUntil = now.getTime() + EVENT_CHILD_LEASE_TTL_MS;
  let renewalInFlight;
  const abortForLostLease = async (message, error) => {
    if (leaseLost || stopped) return;
    leaseLost = true;
    logger.warn(message, error);
    await GenerationJobManager.abortJob(streamId, {
      expectedCreatedAt: jobCreatedAt,
      awaitProviderDrain: true,
    }).catch((abortError) => {
      logger.warn('[EventChildLease] Failed to stop generation after lease loss', abortError);
    });
  };
  const renew = () => {
    if (stopped || leaseLost || renewalInFlight != null) return;
    renewalInFlight = (async () => {
      const previousDeadline = heldUntil;
      const renewalTime = new Date();
      const renewedUntil = renewalTime.getTime() + EVENT_CHILD_LEASE_TTL_MS;
      const held = await renewSubagentThreadLease({
        ...input,
        now: renewalTime,
        expiresAt: new Date(renewedUntil),
      });
      if (!held || Date.now() >= previousDeadline) {
        await abortForLostLease(
          '[EventChildLease] Generation lost continuous ownership of its lease',
        );
        return;
      }
      heldUntil = renewedUntil;
    })()
      .catch((error) =>
        abortForLostLease('[EventChildLease] Renewal failed; stopping generation', error),
      )
      .finally(() => {
        renewalInFlight = undefined;
      });
  };
  const heartbeat = setInterval(renew, EVENT_CHILD_LEASE_HEARTBEAT_MS);

  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    await renewalInFlight;
    await releaseSubagentThreadLease(input).catch((error) => {
      logger.warn('[EventChildLease] Release failed', error);
    });
  };
}

module.exports = { acquireEventChildGenerationLease };
