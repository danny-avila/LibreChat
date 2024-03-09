const KeyvRedis = require('@keyv/redis');
const { logger } = require('~/config');
const { isEnabled } = require('~/server/utils');

const { REDIS_URI, USE_REDIS } = process.env;

let keyvRedis;

if (REDIS_URI && isEnabled(USE_REDIS)) {
  keyvRedis = new KeyvRedis(REDIS_URI, { useRedisSets: false });
  keyvRedis.on('error', (err) => logger.error('KeyvRedis connection error:', err));
  keyvRedis.setMaxListeners(20);
  logger.info(
    '[Optional] Redis initialized. Note: Redis support is experimental. If you have issues, disable it. Cache needs to be flushed for values to refresh.',
  );
} else {
  logger.info('[Optional] Redis not initialized. Note: Redis support is experimental.');
}

module.exports = keyvRedis;
