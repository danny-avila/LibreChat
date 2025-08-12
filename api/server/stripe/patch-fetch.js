const { logger } = require('@librechat/data-schemas');
const nodeFetch = require('node-fetch');
const secureRequestContext = require('./secure-request-context');

/**
 * Patches the global fetch to use node-fetch instead of undici
 * Controlled by ENABLE_NODE_FETCH environment variable
 */
function patchFetch() {
  try {
    const enableNodeFetch = process.env.ENABLE_NODE_FETCH === 'true';

    if (enableNodeFetch) {
      global.fetch = fetchLike;
      logger.info('[patchFetch] Successfully set global.fetch to node-fetch');
    }
  } catch (error) {
    logger.error(`[patchFetch] Failed to patch fetch: ${error.message}`);
    return;
  }
}

/**
 * A wrapper around node-fetch that attaches the secure request context
 *
 * NOTE: Librechat uses several different fetch implementations (e.g. axios, node-fetch, etc.)
 * So we may need to patch each one separately.
 *
 * @param {string} url
 * @param {import("node-fetch").RequestInit} [options]
 * @returns {Promise<Response>}
 */
function fetchLike(url, options) {
  return nodeFetch(url, secureRequestContext.attach(options));
}

module.exports = patchFetch;
