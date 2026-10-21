require('dotenv/config');
const { runChannelGateway } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

runChannelGateway(process.env, logger.warn.bind(logger)).catch(logger.error.bind(logger));
