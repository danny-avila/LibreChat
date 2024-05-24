const Redis = require('ioredis');
const { logger } = require('~/config');
const { REDIS_URI } = process.env ?? {};
const redis = new Redis(REDIS_URI);
redis
  .on('error', (err) => logger.error('ioredis error:', err))
  .on('ready', () => logger.info('ioredis successfully initialized.'))
  .on('reconnecting', () => logger.info('ioredis reconnecting...'));
module.exports = redis;
