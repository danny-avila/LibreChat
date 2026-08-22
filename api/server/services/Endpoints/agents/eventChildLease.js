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
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Makes an event-driven child generation visible to the durable deletion protocol. */
async function acquireEventChildGenerationLease({
  userId,
  tenantId,
  conversationId,
  streamId,
  jobCreatedAt,
  retentionExpiresAt,
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
  const retentionDeadline =
    retentionExpiresAt == null ? undefined : new Date(retentionExpiresAt).getTime();
  if (
    retentionDeadline != null &&
    (!Number.isFinite(retentionDeadline) || retentionDeadline <= now.getTime())
  ) {
    return null;
  }
  const initialLeaseDeadline = Math.min(
    now.getTime() + EVENT_CHILD_LEASE_TTL_MS,
    retentionDeadline ?? Number.POSITIVE_INFINITY,
  );
  const acquired = await acquireSubagentThreadLease({
    ...input,
    now,
    expiresAt: new Date(initialLeaseDeadline),
  });
  if (!acquired) return null;

  let stopped = false;
  let leaseLost = false;
  let heldUntil = initialLeaseDeadline;
  let renewalInFlight;
  let deadlineAbortInFlight;
  let deadlineTimer;
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
      const renewedUntil = Math.min(
        renewalTime.getTime() + EVENT_CHILD_LEASE_TTL_MS,
        retentionDeadline ?? Number.POSITIVE_INFINITY,
      );
      if (renewedUntil <= renewalTime.getTime()) {
        await abortForLostLease(
          '[EventChildLease] Generation reached its inherited retention deadline',
        );
        return;
      }
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
  const armRetentionDeadline = () => {
    if (retentionDeadline == null || stopped || leaseLost) return;
    const remaining = retentionDeadline - Date.now();
    if (remaining <= 0) {
      deadlineAbortInFlight = abortForLostLease(
        '[EventChildLease] Generation reached its inherited retention deadline',
      );
      return;
    }
    deadlineTimer = setTimeout(armRetentionDeadline, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };
  const heartbeat = setInterval(renew, EVENT_CHILD_LEASE_HEARTBEAT_MS);
  armRetentionDeadline();

  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    clearTimeout(deadlineTimer);
    await renewalInFlight;
    await deadlineAbortInFlight;
    await releaseSubagentThreadLease(input).catch((error) => {
      logger.warn('[EventChildLease] Release failed', error);
    });
  };
}

module.exports = { acquireEventChildGenerationLease };
