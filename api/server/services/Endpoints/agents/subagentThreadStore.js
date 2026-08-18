const {
  cacheConfig,
  ioredisClient,
  registerShutdownTask,
  createSubagentThreadTaskStore,
  RedisSubagentTaskControlTransport,
} = require('@librechat/api');
const db = require('~/models');

/** Durable logical threads use normal LibreChat conversations/messages. Mongo
 * fences continuation; optional Redis routing reaches the live owning process. */
const subagentThreadTaskStore = createSubagentThreadTaskStore(
  {
    acquireSubagentThreadLease: db.acquireSubagentThreadLease,
    countActiveSubagentThreadLeases: db.countActiveSubagentThreadLeases,
    deleteConvos: db.deleteConvos,
    deleteMessages: db.deleteMessages,
    getConvo: db.getConvo,
    getMessages: db.getMessages,
    releaseSubagentThreadLease: db.releaseSubagentThreadLease,
    reserveSubagentThread: db.reserveSubagentThread,
    renewSubagentThreadLease: db.renewSubagentThreadLease,
    saveConvo: db.saveConvo,
    saveMessage: db.saveMessage,
  },
  {
    isOwnerActive: db.isAgentTriggerPrincipalActive,
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
  const transport = new RedisSubagentTaskControlTransport(ioredisClient, subscriber, {
    namespace: cacheConfig.REDIS_KEY_PREFIX,
  });
  try {
    await subagentThreadTaskStore.configureTaskControlTransport(transport);
  } catch (error) {
    subscriber.disconnect();
    throw error;
  }
  taskRoutingConfigured = true;
  registerShutdownTask(
    'subagent task control transport',
    () => subagentThreadTaskStore.destroyTaskControlTransport(),
    { priority: 90 },
  );
}

module.exports = subagentThreadTaskStore;
module.exports.configureSubagentTaskRouting = configureSubagentTaskRouting;
