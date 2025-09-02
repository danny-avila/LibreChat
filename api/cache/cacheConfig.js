const fs = require('fs');
const { math, isEnabled } = require('@librechat/api');

// To ensure that different deployments do not interfere with each other's cache, we use a prefix for the Redis keys.
// This prefix is usually the deployment ID, which is often passed to the container or pod as an env var.
// Set REDIS_KEY_PREFIX_VAR to the env var that contains the deployment ID.
const REDIS_KEY_PREFIX_VAR = process.env.REDIS_KEY_PREFIX_VAR;
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX;
if (REDIS_KEY_PREFIX_VAR && REDIS_KEY_PREFIX) {
  throw new Error('Only either REDIS_KEY_PREFIX_VAR or REDIS_KEY_PREFIX can be set.');
}

const USE_REDIS = isEnabled(process.env.USE_REDIS);
if (USE_REDIS && !process.env.REDIS_URI) {
  throw new Error('USE_REDIS is enabled but REDIS_URI is not set.');
}

const cacheConfig = {
  USE_REDIS,
  REDIS_URI: process.env.REDIS_URI,
  REDIS_USERNAME: process.env.REDIS_USERNAME,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_CA: process.env.REDIS_CA ? fs.readFileSync(process.env.REDIS_CA, 'utf8') : null,
  REDIS_KEY_PREFIX: process.env[REDIS_KEY_PREFIX_VAR] || REDIS_KEY_PREFIX || '',
  REDIS_MAX_LISTENERS: math(process.env.REDIS_MAX_LISTENERS, 40),

  CI: isEnabled(process.env.CI),
  DEBUG_MEMORY_CACHE: isEnabled(process.env.DEBUG_MEMORY_CACHE),

  BAN_DURATION: math(process.env.BAN_DURATION, 7200000), // 2 hours
};

module.exports = { cacheConfig };
