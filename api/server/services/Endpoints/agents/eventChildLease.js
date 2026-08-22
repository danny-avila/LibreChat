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
  let renewalInFlight;
  const renew = () => {
    if (stopped || renewalInFlight != null) return;
    renewalInFlight = (async () => {
      const renewalTime = new Date();
      const held = await renewSubagentThreadLease({
        ...input,
        now: renewalTime,
        expiresAt: new Date(renewalTime.getTime() + EVENT_CHILD_LEASE_TTL_MS),
      });
      if (!held) {
        await GenerationJobManager.abortJob(streamId, {
          expectedCreatedAt: jobCreatedAt,
          awaitProviderDrain: true,
        });
      }
    })()
      .catch((error) => logger.warn('[EventChildLease] Renewal failed', error))
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
