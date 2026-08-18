const { createSubagentThreadTaskStore } = require('@librechat/api');
const db = require('~/models');

/** Durable logical threads use normal LibreChat conversations/messages, while
 * live execution and ordinary-turn leases remain bounded to this API process. */
const subagentThreadTaskStore = createSubagentThreadTaskStore({
  deleteConvos: db.deleteConvos,
  deleteMessages: db.deleteMessages,
  getConvo: db.getConvo,
  getMessages: db.getMessages,
  saveConvo: db.saveConvo,
  saveMessage: db.saveMessage,
});

module.exports = subagentThreadTaskStore;
