const { createSubagentThreadTurnGuard } = require('@librechat/api');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const db = require('~/models');

module.exports = createSubagentThreadTurnGuard({
  getConvo: db.getConvo,
  store: subagentThreadTaskStore,
});
