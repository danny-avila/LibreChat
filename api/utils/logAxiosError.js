const { logger } = require('~/config');

/**
 * Logs Axios errors based on the error object and a custom message.
 *
 * @param {Object} options - The options object.
 * @param {string} options.message - The custom message to be logged.
 * @param {Error} options.error - The Axios error object.
 */
const logAxiosError = ({ message, error }) => {
  const timedOutMessage = 'Cannot read properties of undefined (reading \'status\')';
  if (error.response) {
    logger.error(
      `${message} The request was made and the server responded with a status code that falls out of the range of 2xx: ${
        error.message ? error.message : ''
      }. Error response data:\n`,
      {
        headers: error.response?.headers,
        status: error.response?.status,
        data: error.response?.data,
      },
    );
  } else if (error.request) {
    logger.error(
      `${message} The request was made but no response was received: ${
        error.message ? error.message : ''
      }. Error Request:\n`,
      {
        request: error.request,
      },
    );
  } else if (error?.message?.includes(timedOutMessage)) {
    logger.error(
      `${message}\nThe request either timed out or was unsuccessful. Error message:\n`,
      error,
    );
  } else {
    logger.error(
      `${message}\nSomething happened in setting up the request. Error message:\n`,
      error,
    );
  }
};

module.exports = logAxiosError;
