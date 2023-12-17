const KeyvRedis = require('@keyv/redis');
const { logger } = require('~/config');
const { isEnabled } = require('~/server/utils');

const { REDIS_URI, USE_REDIS } = process.env;

let keyvRedis;

if (REDIS_URI && isEnabled(USE_REDIS)) {
  keyvRedis = new KeyvRedis(REDIS_URI, { useRedisSets: false });
  keyvRedis.on('error', (err) => logger.error('KeyvRedis connection error:', err));
  keyvRedis.setMaxListeners(20);
} else {
  logger.info(
    '`REDIS_URI` not provided, or `USE_REDIS` not set. Redis module will not be initialized.',
  );
}

module.exports = keyvRedis;
