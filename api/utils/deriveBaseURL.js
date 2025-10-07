const { logger } = require('@librechat/data-schemas');

/**
 * Extracts the base URL from the provided URL.
 * @param {string} fullURL - The full URL.
 * @returns {string} The base URL.
 */
function deriveBaseURL(fullURL) {
  try {
    const parsedUrl = new URL(fullURL);
    const protocol = parsedUrl.protocol;
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port;

    // Check if the parsed URL components are meaningful
    if (!protocol || !hostname) {
      return fullURL;
    }

    // Reconstruct the base URL
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  } catch (error) {
    logger.error('Failed to derive base URL', error);
    return fullURL; // Return the original URL in case of any exception
  }
}

module.exports = deriveBaseURL;
