const { logger } = require('~/config');

/**
 * Logs Axios errors based on the error object and a custom message.
 *
 * @param {Object} options - The options object.
 * @param {string} options.message - The custom message to be logged.
 * @param {Error} options.error - The Axios error object.
 */
const logAxiosError = ({ message, error }) => {
  if (error.response) {
    const { status, headers, data } = error.response;
    logger.error(`${message} The server responded with status ${status}: ${error.message}`, {
      status,
      headers,
      data,
    });
  } else if (error.request) {
    const { method, url } = error.config || {};
    logger.error(
      `${message} No response received for ${method ? method.toUpperCase() : ''} ${url || ''}: ${error.message}`,
      { requestInfo: { method, url } },
    );
  } else if (error?.message?.includes('Cannot read properties of undefined (reading \'status\')')) {
    logger.error(
      `${message} It appears the request timed out or was unsuccessful: ${error.message}`,
    );
  } else {
    logger.error(`${message} An error occurred while setting up the request: ${error.message}`);
  }
};

module.exports = { logAxiosError };
