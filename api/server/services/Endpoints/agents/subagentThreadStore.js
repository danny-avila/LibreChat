const { createSubagentThreadTaskStore } = require('@librechat/api');
const db = require('~/models');

/** Durable logical threads use normal LibreChat conversations/messages. Live
 * controls stay process-local; Mongo fences continuation across API replicas. */
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

module.exports = subagentThreadTaskStore;
