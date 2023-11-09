const axios = require('axios').default;

/**
 * @typedef {Object} AzureCredentials
 * @property {string} azureOpenAIApiKey - The Azure OpenAI API key.
 * @property {string} azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @property {string} azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name.
 * @property {string} azureOpenAIApiVersion - The Azure OpenAI API version.
 */

/**
 * Generates the Azure OpenAI API chat completion endpoint URL.
 * @param {AzureCredentials} credentials - The Azure credentials.
 * @returns {string} The complete chat completion endpoint URL for the Azure OpenAI API.
 */

const genAzureChatCompletion = (credentials) => {
  const { azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion } = credentials;
  if (!azureOpenAIApiDeploymentName) {
    throw new Error('Deployment name must be provided.');
  }

  // Generate the endpoint URL for the Azure OpenAI API chat completion
  const endpoint = `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`;
  console.log(`Generated Endpoint: ${endpoint}`); // Log the generated endpoint for debugging
  return endpoint;
};

/**
 * Retrieves the Azure OpenAI API credentials from environment variables.
 * Ensures that all required environment variables are set.
 * @returns {AzureCredentials} An object containing the Azure OpenAI API credentials.
 */

const getAzureCredentials = () => {
  const credentials = {
    azureOpenAIApiKey: process.env.AZURE_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  };

  // Check for missing environment variables and log an error if any are missing
  if (!credentials.azureOpenAIApiKey || !credentials.azureOpenAIApiInstanceName || !credentials.azureOpenAIApiDeploymentName || !credentials.azureOpenAIApiVersion) {
    console.error('One or more environment variables are missing or invalid:', credentials);
    throw new Error('Invalid environment configuration.');
  }

  return credentials;
};

/**
 * Sends a chat message to the Azure OpenAI API using the provided credentials and message payload.
 * @param {Object} message - The message payload for the chat API.
 * @returns {Promise<Object>} The response from the Azure OpenAI API.
 */

const sendChatMessage = async (message) => {
  const credentials = getAzureCredentials(); // Retrieve the API credentials
  const endpoint = genAzureChatCompletion(credentials); // Generate the API endpoint URL

  try {
    // Make the HTTP POST request to the Azure OpenAI API
    const response = await axios.post(endpoint, message, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': credentials.azureOpenAIApiKey
      }
    });

    console.log('Response:', response.data); // Log the response data for debugging
    return response.data;
  } catch (error) {
    // Log the error details if the request fails
    console.error('Error sending chat message:', error.message);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(error.response.data);
      console.error(error.response.status);
      console.error(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error', error.message);
    }
    throw error;
  }
};

/**
 * Sanitizes the model name to be used in the URL by removing or replacing disallowed characters.
 * @param {string} modelName - The model name to be sanitized.
 * @returns {string} The sanitized model name.
 */
const sanitizeModelName = (modelName) => {
  // Replace periods with empty strings and other disallowed characters as needed
  return modelName.replace(/\./g, '');
};

module.exports = {
  sanitizeModelName,
  genAzureChatCompletion,
  getAzureCredentials,
  sendChatMessage,
};
