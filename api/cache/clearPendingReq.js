const Keyv = require('keyv');
const { pendingReqFile } = require('./keyvFiles');
const { LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

const keyv = new Keyv({ store: pendingReqFile, namespace: 'pendingRequests' });

/**
 * Clear pending requests from the cache.
 * Checks the environmental variable LIMIT_CONCURRENT_MESSAGES;
 * if the rule is enabled ('true'), pending requests in the cache are cleared.
 *
 * @module clearPendingReq
 * @requires keyv
 * @requires keyvFiles
 * @requires process
 *
 * @async
 * @function
 * @returns {Promise<void>} A promise that either clears 'pendingRequests' from store or resolves with no value.
 */
const clearPendingReq = async () => {
  if (LIMIT_CONCURRENT_MESSAGES?.toLowerCase() !== 'true') {
    return;
  }

  await keyv.clear();
};

module.exports = clearPendingReq;
