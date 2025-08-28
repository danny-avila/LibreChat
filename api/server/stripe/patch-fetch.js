const { logger } = require('@librechat/data-schemas');
const nodeFetch = require('node-fetch');
const secureRequestContext = require('./secure-request-context');
const { ProxyAgent } = require('proxy-agent');

/**
 * Patches the global fetch to use node-fetch instead of undici
 * Controlled by ENABLE_NODE_FETCH environment variable
 */
function patchFetch() {
  try {
    if (process.env.ENABLE_NODE_FETCH === 'true') {
      global.fetch = fetchLike;
      logger.info(
        '[Stripe:patchFetch] Successfully set global.fetch to node-fetch (ENABLE_NODE_FETCH == true)',
      );
    } else {
      logger.warn('[Stripe:patchFetch] Not patching fetch (ENABLE_NODE_FETCH != true)');
    }
  } catch (error) {
    logger.error(`[Stripe:patchFetch] Failed to patch fetch: ${error.message}`);
    return;
  }
}

/**
 * A wrapper around node-fetch that attaches the secure request context
 *
 * NOTE: Librechat uses several different fetch implementations (e.g. axios, node-fetch, etc.)
 * So we may need to patch each one separately. This will work for anything that
 * uses @librechat/agents (e.g. tools)
 *
 * @param {string} url
 * @param {import("node-fetch").RequestInit} [options]
 * @returns {Promise<Response>}
 */
function fetchLike(url, options = {}) {
  // If HTTP_PROXY is set, use ProxyAgent to handle the request
  if (process.env.HTTP_PROXY) {
    logger.info(`[Stripe:patchFetch] Using HTTP_PROXY: ${process.env.HTTP_PROXY}`);
    options = { ...options, agent: new ProxyAgent() };
  }

  // Attach the secure request context to the options
  options = secureRequestContext.attach(options);

  // Log the request
  logger.info(
    `[Stripe:patchFetch] fetch('${formatUrl(url)}', ${JSON.stringify(formatOptions(options))})`,
  );

  // Use node-fetch to perform the request
  return nodeFetch(url, options);
}

module.exports = patchFetch;

function maskValue(value) {
  if (!value) return '';
  if (value.length <= 10) {
    return '*'.repeat(value.length);
  } else {
    const remaining = value.length - 10;
    return '*'.repeat(10) + `...(${remaining} more)`;
  }
}

function formatUrl(url) {
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    urlObj.searchParams.set(key, maskValue(value));
  });
  return urlObj.toString();
}

function formatOptions(options) {
  const obj = {};
  obj.method = options.method || 'GET';
  const headers = options.headers || new Headers();
  obj.headers = {};
  for (const [key, value] of headers) {
    obj.headers[key] = maskValue(value);
  }
  obj.body = options.body ? maskValue(options.body) : undefined;
  return obj;
}
