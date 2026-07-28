const {
  GenerationJobManager,
  createMessageRequestMiddleware,
  isPendingActionStale,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { getConvo } = require('~/models');

module.exports = createMessageRequestMiddleware({
  getConvo,
  getJob: (conversationId) => GenerationJobManager.getJob(conversationId),
  isPendingActionStale,
  logger,
});
