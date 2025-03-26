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
    const stack = error.stack || 'No stack trace available';

    if (error.response?.status) {
      const { status, headers, data } = error.response;
      logMessage = `${message} The server responded with status ${status}: ${error.message}`;
      logger.error(logMessage, {
        status,
        headers,
        data,
        stack,
      });
    } else if (error.request) {
      const { method, url } = error.config || {};
      logMessage = `${message} No response received for ${method ? method.toUpperCase() : ''} ${url || ''}: ${error.message}`;
      logger.error(logMessage, {
        requestInfo: { method, url },
        stack,
      });
    } else if (error?.message?.includes('Cannot read properties of undefined (reading \'status\')')) {
      logMessage = `${message} It appears the request timed out or was unsuccessful: ${error.message}`;
      logger.error(logMessage, { stack });
    } else {
      logMessage = `${message} An error occurred while setting up the request: ${error.message}`;
      logger.error(logMessage, { stack });
    }
  } catch (err) {
    logMessage = `Error in logAxiosError: ${err.message}`;
    logger.error(logMessage, { stack: err.stack || 'No stack trace available' });
  }
  return logMessage;
};

module.exports = { logAxiosError };
