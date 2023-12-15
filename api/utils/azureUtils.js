/**
 * @typedef {Object} AzureCredentials
 * @property {string} azureOpenAIApiKey - The Azure OpenAI API key.
 * @property {string} azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @property {string} azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name.
 * @property {string} azureOpenAIApiVersion - The Azure OpenAI API version.
 */

const { isEnabled } = require('~/server/utils');

/**
 * Sanitizes the model name to be used in the URL by removing or replacing disallowed characters.
 * @param {string} modelName - The model name to be sanitized.
 * @returns {string} The sanitized model name.
 */
const sanitizeModelName = (modelName) => {
  // Replace periods with empty strings and other disallowed characters as needed
  return modelName.replace(/\./g, '');
};

/**
 * Generates the Azure OpenAI API endpoint URL.
 * @param {Object} params - The parameters object.
 * @param {string} params.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param {string} params.azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name.
 * @returns {string} The complete endpoint URL for the Azure OpenAI API.
 */
const genAzureEndpoint = ({ azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName }) => {
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}`;
};

/**
 * Generates the Azure OpenAI API chat completion endpoint URL with the API version.
 * If both deploymentName and modelName are provided, modelName takes precedence.
 * @param {Object} AzureConfig - The Azure configuration object.
 * @param {string} AzureConfig.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param {string} [AzureConfig.azureOpenAIApiDeploymentName] - The Azure OpenAI API deployment name (optional).
 * @param {string} AzureConfig.azureOpenAIApiVersion - The Azure OpenAI API version.
 * @param {string} [modelName] - The model name to be included in the deployment name (optional).
 * @returns {string} The complete chat completion endpoint URL for the Azure OpenAI API.
 * @throws {Error} If neither azureOpenAIApiDeploymentName nor modelName is provided.
 */
const genAzureChatCompletion = (
  { azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion },
  modelName,
) => {
  // Determine the deployment segment of the URL based on provided modelName or azureOpenAIApiDeploymentName
  let deploymentSegment;
  if (isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME) && modelName) {
    const sanitizedModelName = sanitizeModelName(modelName);
    deploymentSegment = `${sanitizedModelName}`;
  } else if (azureOpenAIApiDeploymentName) {
    deploymentSegment = azureOpenAIApiDeploymentName;
  } else {
    throw new Error('Either a model name or a deployment name must be provided.');
  }

  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${deploymentSegment}/chat/completions?api-version=${azureOpenAIApiVersion}`;
};

/**
 * Retrieves the Azure OpenAI API credentials from environment variables.
 * @returns {AzureCredentials} An object containing the Azure OpenAI API credentials.
 */
const getAzureCredentials = () => {
  return {
    azureOpenAIApiKey: process.env.AZURE_API_KEY ?? process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  };
};

module.exports = {
  sanitizeModelName,
  genAzureEndpoint,
  genAzureChatCompletion,
  getAzureCredentials,
};
