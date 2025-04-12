const { logger } = require('~/config');

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

module.exports = {
  createFetch,
};
