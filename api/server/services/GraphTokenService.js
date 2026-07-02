const { logger } = require('@librechat/data-schemas');
const { exchangeOboToken } = require('./OboTokenService');

function parseResponseBody(body) {
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      logger.debug('[GraphTokenService] Failed to parse error response body as JSON', {
        parseError: error.message,
      });
      return body;
    }
  }

  return body;
}

/**
 * Get Microsoft Graph API token using the On-Behalf-Of flow.
 * Thin wrapper around the generic OBO exchange for Graph-specific error context.
 *
 * @param {Object} user - User object with OpenID information
 * @param {string} accessToken - Federated access token used as OBO assertion
 * @param {string} scopes - Graph API scopes for the token
 * @param {boolean} [fromCache=true] - Whether to try getting token from cache first
 * @returns {Promise<Object>} Graph API token response with access_token and expires_in
 */
async function getGraphApiToken(user, accessToken, scopes, fromCache = true) {
  try {
    return await exchangeOboToken(user, accessToken, scopes, fromCache);
  } catch (error) {
    const statusCode = error?.response?.status ?? error?.statusCode;
    const parsedBody = parseResponseBody(error?.response?.body);
    const errorDescription =
      parsedBody?.error_description ||
      parsedBody?.error ||
      error?.error_description ||
      error?.error ||
      error?.message;

    const errorDetails = {
      statusCode,
      error: parsedBody?.error || error?.error,
      error_description: errorDescription,
      responseBody: parsedBody,
    };

    logger.error(
      `[GraphTokenService] Failed to acquire Graph API token for user ${user.openidId}:`,
      errorDetails,
    );

    const graphError = new Error(`Graph token acquisition failed: ${errorDescription}`);
    graphError.originalError = error;
    graphError.details = errorDetails;
    throw graphError;
  }
}

module.exports = {
  getGraphApiToken,
};
