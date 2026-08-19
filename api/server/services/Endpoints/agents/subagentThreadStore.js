const {
  cacheConfig,
  ioredisClient,
  isEnabled,
  registerShutdownTask,
  duplicateIoRedisClient,
  createSubagentThreadTaskStore,
  createSubagentCompletionWakeupHandler,
  RedisSubagentTaskControlTransport,
} = require('@librechat/api');
const db = require('~/models');
const { enqueueAgentTrigger } = require('../../Agents/triggers');

/** Keep producers off for the first rollout so older trigger workers cannot
 * permanently reject the new `continue` envelope. Enable only after every API
 * replica runs a release that understands completion wakeups. */
const completionWakeupsEnabled = isEnabled(process.env.ENABLE_SUBAGENT_COMPLETION_WAKEUPS);

/** Durable logical threads use normal LibreChat conversations/messages. Mongo
 * fences continuation; optional Redis routing reaches the live owning process. */
const subagentThreadTaskStore = createSubagentThreadTaskStore(
  {
    acquireSubagentThreadLease: db.acquireSubagentThreadLease,
    claimSubagentTaskResult: db.claimSubagentTaskResult,
    releaseSubagentTaskResultClaim: db.releaseSubagentTaskResultClaim,
    countActiveSubagentThreadLeases: db.countActiveSubagentThreadLeases,
    deleteConvos: db.deleteConvos,
    deleteMessages: db.deleteMessages,
    getConvo: db.getConvo,
    getMessages: db.getMessages,
    listActiveSubagentThreadLeases: db.listActiveSubagentThreadLeases,
    releaseSubagentThreadLease: db.releaseSubagentThreadLease,
    reserveSubagentThread: db.reserveSubagentThread,
    renewSubagentThreadLease: db.renewSubagentThreadLease,
    saveConvo: db.saveConvo,
    saveMessage: db.saveMessage,
  },
  {
    isOwnerActive: db.isSubagentOwnerAdmissible,
    fenceOwnerAdmission: db.fenceSubagentAdmission,
    renewOwnerAdmission: db.renewSubagentAdmission,
    releaseOwnerAdmission: db.releaseSubagentAdmission,
    ...(completionWakeupsEnabled && {
      onTaskPrepared: createSubagentCompletionWakeupHandler(enqueueAgentTrigger),
    }),
  },
);

let taskRoutingConfigured = false;

/** Starts the optional Redis owner directory before HTTP admission opens. */
async function configureSubagentTaskRouting() {
  if (taskRoutingConfigured || !cacheConfig.USE_REDIS) {
    return;
  }
  if (ioredisClient == null || typeof ioredisClient.duplicate !== 'function') {
    throw new Error('Redis subagent task routing requires a dedicated subscriber connection.');
  }
  const subscriber = ioredisClient.duplicate();
  /** A dedicated publisher without the offline queue: the shared client would hold a
   * command issued during a disconnect and deliver it after the caller gave up, so a
   * steer the caller was told had failed could still reach the child. Failing fast
   * turns that into the honest `unavailable` the caller already handles. */
  const publisher = duplicateIoRedisClient(ioredisClient, { enableOfflineQueue: false });
  const transport = new RedisSubagentTaskControlTransport(publisher, subscriber, {
    namespace: cacheConfig.REDIS_KEY_PREFIX,
  });
  try {
    await subagentThreadTaskStore.configureTaskControlTransport(transport);
  } catch (error) {
    subscriber.disconnect();
    publisher.disconnect();
    throw error;
  }
  taskRoutingConfigured = true;
  registerShutdownTask(
    'subagent task control transport',
    async () => {
      await subagentThreadTaskStore.destroyTaskControlTransport();
      publisher.disconnect();
    },
    { priority: 90 },
  );
}

module.exports = subagentThreadTaskStore;
module.exports.configureSubagentTaskRouting = configureSubagentTaskRouting;
