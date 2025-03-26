const { logger } = require('~/config');

/**
 * Logs Axios errors based on the error object and a custom message.
 *
 * @param {Object} options - The options object.
 * @param {string} options.message - The custom message to be logged.
 * @param {import('axios').AxiosError} options.error - The Axios error object.
 * @returns {string} The log message.
 */
const logAxiosError = ({ message, error }) => {
  let logMessage = message;
  try {
    if (error.response?.status) {
      logMessage = `${message} The server responded with status ${status}: ${error.message}`;
      const { status, headers, data } = error.response;
      logger.error(logMessage, {
        status,
        headers,
        data,
      });
    } else if (error.request) {
      const { method, url } = error.config || {};
      logMessage = `${message} No response received for ${method ? method.toUpperCase() : ''} ${url || ''}: ${error.message}`;
      logger.error(logMessage, { requestInfo: { method, url } });
    } else if (error?.message?.includes('Cannot read properties of undefined (reading \'status\')')) {
      logMessage = `${message} It appears the request timed out or was unsuccessful: ${error.message}`;
      logger.error(logMessage);
    } else {
      logMessage = `${message} An error occurred while setting up the request: ${error.message}`;
      logger.error(logMessage);
    }
  } catch (err) {
    logMessage = `Error in logAxiosError: ${err.message}`;
    logger.error(logMessage);
  }
  return logMessage;
};

module.exports = { logAxiosError };
