const express = require('express');
const {
  createTraceHandlers,
  createTraceReadLimiter,
  createLangfuseTraceReader,
} = require('@librechat/api');
const configMiddleware = require('~/server/middleware/config/app');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const handlers = createTraceHandlers({
  reader: createLangfuseTraceReader({
    getConversationTraceRefs: db.getConversationTraceRefs,
    hasSampledTraceMessage: db.hasSampledTraceMessage,
  }),
  getConvoOwnership: db.getConvoOwnership,
});
const traceReadLimiter = createTraceReadLimiter();

router.use(requireJwtAuth, configMiddleware);
router.get('/:conversationId/availability', handlers.availability);
router.get('/:conversationId/records', traceReadLimiter, handlers.records);
router.get('/:conversationId/records/:recordId', traceReadLimiter, handlers.record);

module.exports = router;
