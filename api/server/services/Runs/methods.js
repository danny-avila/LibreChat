const axios = require('axios');
const { logger } = require('~/config');

/**
 * @typedef {Object} RetrieveOptions
 * @property {string} thread_id - The ID of the thread to retrieve.
 * @property {string} run_id - The ID of the run to retrieve.
 * @property {number} [timeout] - Optional timeout for the API call.
 * @property {number} [maxRetries] -  TODO: not yet implemented; Optional maximum number of retries for the API call.
 * @property {OpenAIClient} openai - Configuration and credentials for OpenAI API access.
 */

/**
 * Asynchronously retrieves data from an API endpoint based on provided thread and run IDs.
 *
 * @param {RetrieveOptions} options - The options for the retrieve operation.
 * @returns {Promise<Object>} The data retrieved from the API.
 */
async function retrieveRun({ thread_id, run_id, timeout, openai }) {
  const { apiKey, baseURL, httpAgent, organization } = openai;
  const url = `${baseURL}/threads/${thread_id}/runs/${run_id}`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v1',
  };

  if (organization) {
    headers['OpenAI-Organization'] = organization;
  }

  try {
    const axiosConfig = {
      headers: headers,
      timeout: timeout,
    };

    if (httpAgent) {
      axiosConfig.httpAgent = httpAgent;
      axiosConfig.httpsAgent = httpAgent;
    }

    const response = await axios.get(url, axiosConfig);
    return response.data;
  } catch (error) {
    const logMessage = '[retrieveRun] Failed to retrieve run data:';
    const timedOutMessage = 'Cannot read properties of undefined (reading \'status\')';
    if (error?.response && error?.response?.status) {
      logger.error(
        `${logMessage} The request was made and the server responded with a status code that falls out of the range of 2xx: ${
          error.message ? error.message : ''
        }`,
        {
          headers: error.response.headers,
          status: error.response.status,
          data: error.response.data,
        },
      );
    } else if (error.request) {
      logger.error(
        `${logMessage} The request was made but no response was received: ${
          error.message ? error.message : ''
        }`,
        {
          request: error.request,
        },
      );
    } else if (error?.message && !error?.message?.includes(timedOutMessage)) {
      logger.error(`${logMessage} Something happened in setting up the request`, {
        message: error.message,
      });
    }
    throw error;
  }
}

module.exports = { retrieveRun };
