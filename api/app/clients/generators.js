const fetch = require('node-fetch');
const { GraphEvents } = require('@librechat/agents');
const { logger, sendEvent } = require('~/config');

/**
 * Makes a function to make HTTP request and logs the process.
 * @param {Object} params
 * @param {boolean} [params.directEndpoint] - Whether to use a direct endpoint.
 * @param {string} [params.reverseProxyUrl] - The reverse proxy URL to use for the request.
 * @returns {Promise<Response>} - A promise that resolves to the response of the fetch request.
 */
function createFetch({ directEndpoint = false, reverseProxyUrl = '' }) {
  /**
   * Makes an HTTP request and logs the process.
   * @param {RequestInfo} url - The URL to make the request to. Can be a string or a Request object.
   * @param {RequestInit} [init] - Optional init options for the request.
   * @returns {Promise<Response>} - A promise that resolves to the response of the fetch request.
   */
  return async (_url, init) => {
    let url = _url;
    if (directEndpoint) {
      url = reverseProxyUrl;
    }
    logger.debug(`Making request to ${url}`);
    if (typeof Bun !== 'undefined') {
      return await fetch(url, init);
    }
    return await fetch(url, init);
  };
}

// Add this at the module level outside the class
/**
 * Creates event handlers for stream events that don't capture client references
 * @param {Object} res - The response object to send events to
 * @returns {Object} Object containing handler functions
 */
function createStreamEventHandlers(res) {
  return {
    [GraphEvents.ON_RUN_STEP]: (event) => {
      if (res) {
        sendEvent(res, event);
      }
    },
    [GraphEvents.ON_MESSAGE_DELTA]: (event) => {
      if (res) {
        sendEvent(res, event);
      }
    },
    [GraphEvents.ON_REASONING_DELTA]: (event) => {
      if (res) {
        sendEvent(res, event);
      }
    },
  };
}

module.exports = {
  createFetch,
  createStreamEventHandlers,
};
