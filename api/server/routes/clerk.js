const mongoose = require('mongoose');
const { createClerkWebhookRouteHandler } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const methods = require('~/models');

module.exports = createClerkWebhookRouteHandler({
  startSession: () => mongoose.startSession(),
  methods,
  runAsSystem,
  logError: (message) => logger.error(message),
});
