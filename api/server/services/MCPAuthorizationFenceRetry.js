const mongoose = require('mongoose');
const { getTenantId, runAsSystem, tenantStorage } = require('@librechat/data-schemas');
const { createMCPAuthorizationFenceRetryService } = require('@librechat/api');

const COLLECTION_NAME = 'mcp_authorization_fence_retries';

function collection() {
  return mongoose.connection.collection(COLLECTION_NAME);
}

function retryId({ userId, serverName }, tenantId) {
  return JSON.stringify([tenantId ?? '', String(userId), serverName]);
}

const retryService = createMCPAuthorizationFenceRetryService({
  getTenantId,
  storage: {
    async upsert({ scope, tenantId, version, now }) {
      await collection().updateOne(
        { _id: retryId(scope, tenantId) },
        {
          $set: {
            userId: String(scope.userId),
            serverName: scope.serverName,
            tenantId: tenantId ?? null,
            version,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    },
    async deleteVersion({ scope, tenantId, version }) {
      await collection().deleteOne({ _id: retryId(scope, tenantId), version });
    },
    async list(limit) {
      return runAsSystem(async () =>
        collection().find({}).sort({ updatedAt: 1 }).limit(limit).toArray(),
      );
    },
  },
  runInRetryScope: (retry, operation) =>
    tenantStorage.run(
      {
        ...(typeof retry.tenantId === 'string' && retry.tenantId
          ? { tenantId: retry.tenantId }
          : {}),
        userId: String(retry.userId),
      },
      operation,
    ),
});

module.exports = {
  clearMCPAuthorizationFenceRetry: retryService.clear,
  drainMCPAuthorizationFenceRetries: retryService.drain,
  persistMCPAuthorizationFenceRetry: retryService.persist,
  startMCPAuthorizationFenceRetryWorker: retryService.start,
};
