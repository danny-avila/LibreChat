const getLogStores = require('./getLogStores');
const { isEnabled } = require('../server/utils');
const { USE_REDIS, LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};
const ttl = 1000 * 60 * 1;

/**
 * Clear or decrement pending requests from the cache.
 * Checks the environmental variable LIMIT_CONCURRENT_MESSAGES;
 * if the rule is enabled ('true'), it either decrements the count of pending requests
 * or deletes the key if the count is less than or equal to 1.
 *
 * @module clearPendingReq
 * @requires ./getLogStores
 * @requires ../server/utils
 * @requires process
 *
 * @async
 * @function
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user ID for which the pending requests are to be cleared or decremented.
 * @param {Object} [params.cache] - An optional cache object to use. If not provided, a default cache will be fetched using getLogStores.
 * @returns {Promise<void>} A promise that either decrements the 'pendingRequests' count, deletes the key from the store, or resolves with no value.
 */
const clearPendingReq = async ({ userId, cache: _cache }) => {
  if (!userId) {
    return;
  } else if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
    return;
  }

  const namespace = 'pending_req';
  const cache = _cache ?? getLogStores(namespace);

  if (!cache) {
    return;
  }

  const key = `${isEnabled(USE_REDIS) ? namespace : ''}:${userId ?? ''}`;
  const currentReq = +((await cache.get(key)) ?? 0);

  if (currentReq && currentReq >= 1) {
    await cache.set(key, currentReq - 1, ttl);
  } else {
    await cache.delete(key);
  }
};

module.exports = clearPendingReq;
