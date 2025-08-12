const { logger } = require('@librechat/data-schemas');
const nodeFetch = require('node-fetch');
const  {ProxyAgent} = require('proxy-agent');


/**
 * Patches the global fetch to use node-fetch instead of undici
 * Controlled by ENABLE_NODE_FETCH environment variable
 */
function patchFetchPorts() {
  try {
    const enableNodeFetch = process.env.ENABLE_NODE_FETCH === 'true';

    if (enableNodeFetch) {
      global.fetch = fetchLike;
      logger.info(
        `[patchFetch] Successfully set global.fetch to fetchLike`,
      );
    }
    else {
      logger.info('[patchFetch] Not patching fetch');
    }
  } catch (error) {
    logger.error(`[patchFetch] Failed to patch fetch: ${error.message}`);
    return;
  }
}

function fetchLike(url, options = {}) {
  if (process.env.HTTP_PROXY) {
    logger.info(`[patchFetch] Using HTTP_PROXY: ${process.env.HTTP_PROXY}`);
    return nodeFetch(url, {...options, agent: new ProxyAgent() });
  }
  return nodeFetch(url, options);
  
}

module.exports = {
  patchFetchPorts,
};
