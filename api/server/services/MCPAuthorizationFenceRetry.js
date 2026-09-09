const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const { logger, getTenantId, runAsSystem, tenantStorage } = require('@librechat/data-schemas');
const { registerShutdownTask } = require('@librechat/api');

const COLLECTION_NAME = 'mcp_authorization_fence_retries';
const RETRY_INTERVAL_MS = 30_000;
const RETRY_BATCH_SIZE = 100;

let retryTimer;
let drainPromise;
let invalidateRecoveryGeneration;

function collection() {
  return mongoose.connection.collection(COLLECTION_NAME);
}

function retryId({ userId, serverName }, tenantId = getTenantId()) {
  return JSON.stringify([tenantId ?? '', String(userId), serverName]);
}

/** Stores one latest-wins retry marker in MongoDB before a shared-cache fence is attempted. */
async function persistMCPAuthorizationFenceRetry(scope) {
  const tenantId = getTenantId();
  const now = new Date();
  await collection().updateOne(
    { _id: retryId(scope, tenantId) },
    {
      $set: {
        userId: String(scope.userId),
        serverName: scope.serverName,
        tenantId: tenantId ?? null,
        version: randomUUID(),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

async function clearMCPAuthorizationFenceRetry(scope) {
  await collection().deleteOne({ _id: retryId(scope) });
}

async function listRetryBatch() {
  return runAsSystem(async () =>
    collection().find({}).sort({ updatedAt: 1 }).limit(RETRY_BATCH_SIZE).toArray(),
  );
}

async function deleteProcessedRetry(retry) {
  await runAsSystem(async () => collection().deleteOne({ _id: retry._id, version: retry.version }));
}

async function drainMCPAuthorizationFenceRetries() {
  if (drainPromise != null || invalidateRecoveryGeneration == null) {
    return drainPromise;
  }
  drainPromise = (async () => {
    const retries = await listRetryBatch();
    for (const retry of retries) {
      try {
        await tenantStorage.run(
          {
            ...(typeof retry.tenantId === 'string' && retry.tenantId
              ? { tenantId: retry.tenantId }
              : {}),
            userId: String(retry.userId),
          },
          async () =>
            invalidateRecoveryGeneration({
              userId: String(retry.userId),
              serverName: retry.serverName,
            }),
        );
        /** The version predicate preserves a newer mutation queued while this one published. */
        await deleteProcessedRetry(retry);
      } catch (error) {
        logger.warn(
          `[MCP authorization] Durable generation retry failed for ${retry.serverName}`,
          error,
        );
      }
    }
  })().finally(() => {
    drainPromise = undefined;
  });
  return drainPromise;
}

function scheduleMCPAuthorizationFenceRetryDrain() {
  void drainMCPAuthorizationFenceRetries().catch((error) =>
    logger.warn('[MCP authorization] Could not read durable generation retries', error),
  );
}

function startMCPAuthorizationFenceRetryWorker(invalidator) {
  invalidateRecoveryGeneration = invalidator;
  if (retryTimer != null) {
    return;
  }
  retryTimer = setInterval(() => {
    scheduleMCPAuthorizationFenceRetryDrain();
  }, RETRY_INTERVAL_MS);
  retryTimer.unref?.();
  registerShutdownTask('MCP authorization fence retry worker', async () => {
    clearInterval(retryTimer);
    retryTimer = undefined;
    await drainPromise?.catch(() => undefined);
  });
  scheduleMCPAuthorizationFenceRetryDrain();
}

module.exports = {
  clearMCPAuthorizationFenceRetry,
  drainMCPAuthorizationFenceRetries,
  persistMCPAuthorizationFenceRetry,
  startMCPAuthorizationFenceRetryWorker,
};
