const KeyvRedis = require('@keyv/redis');
const { logger } = require('~/config');

const { REDIS_URI } = process.env;

let keyvRedis;

if (REDIS_URI) {
  keyvRedis = new KeyvRedis(REDIS_URI, { useRedisSets: false });
  keyvRedis.on('error', (err) => logger.error('KeyvRedis connection error:', err));
} else {
  logger.info('REDIS_URI not provided. Redis module will not be initialized.');
}

module.exports = keyvRedis;
