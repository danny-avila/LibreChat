const { logger } = require('@librechat/data-schemas');

/**
 * Patches the global fetch to use node-fetch instead of undici
 * Controlled by ENABLE_NODE_FETCH environment variable
 */
function patchFetchPorts() {
  try {
    const enableNodeFetch = process.env.ENABLE_NODE_FETCH === 'true';

    if (enableNodeFetch) {
      global.fetch = require('node-fetch');
      logger.info('[patchFetch] Successfully set global.fetch to node-fetch');
    }
  } catch (error) {
    logger.error(`[patchFetch] Failed to patch fetch: ${error.message}`);
    return;
  }
}

module.exports = {
  patchFetchPorts,
};
