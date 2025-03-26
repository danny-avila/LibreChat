const axios = require('axios');
const { EModelEndpoint } = require('librechat-data-provider');
const { logAxiosError } = require('~/utils');

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
  let url = `${baseURL}/threads/${thread_id}/runs/${run_id}`;

  let headers = {
    Authorization: `Bearer ${apiKey}`,
    'OpenAI-Beta': 'assistants=v1',
  };

  if (organization) {
    headers['OpenAI-Organization'] = organization;
  }

  /** @type {TAzureConfig | undefined} */
  const azureConfig = openai.req.app.locals[EModelEndpoint.azureOpenAI];

  if (azureConfig && azureConfig.assistants) {
    delete headers.Authorization;
    headers = { ...headers, ...openai._options.defaultHeaders };
    const queryParams = new URLSearchParams(openai._options.defaultQuery).toString();
    url = `${url}?${queryParams}`;
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
    const message = '[retrieveRun] Failed to retrieve run data:';
    throw new Error(logAxiosError({ message, error }));
  }
}

module.exports = { retrieveRun };
