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
 * @param {Object} [client] - The API Client class for optionally setting properties (optional).
 * @returns {string} The complete chat completion endpoint URL for the Azure OpenAI API.
 * @throws {Error} If neither azureOpenAIApiDeploymentName nor modelName is provided.
 */
const genAzureChatCompletion = (
  { azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion },
  modelName,
  client,
) => {
  // Determine the deployment segment of the URL based on provided modelName or azureOpenAIApiDeploymentName
  let deploymentSegment;
  if (isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME) && modelName) {
    const sanitizedModelName = sanitizeModelName(modelName);
    deploymentSegment = `${sanitizedModelName}`;
    client &&
      typeof client === 'object' &&
      (client.azure.azureOpenAIApiDeploymentName = sanitizedModelName);
  } else if (azureOpenAIApiDeploymentName) {
    deploymentSegment = azureOpenAIApiDeploymentName;
  } else if (!process.env.AZURE_OPENAI_BASEURL) {
    throw new Error(
      'Either a model name with the `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` setting or a deployment name must be provided if `AZURE_OPENAI_BASEURL` is omitted.',
    );
  }

  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${deploymentSegment}/chat/completions?api-version=${azureOpenAIApiVersion}`;
};

/**
 * Retrieves the Azure OpenAI API credentials from environment variables.
 * @returns {AzureOptions} An object containing the Azure OpenAI API credentials.
 */
const getAzureCredentials = () => {
  return {
    azureOpenAIApiKey: process.env.AZURE_API_KEY ?? process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  };
};

/**
 * Constructs a URL by replacing placeholders in the baseURL with values from the azure object.
 * It specifically looks for '${INSTANCE_NAME}' and '${DEPLOYMENT_NAME}' within the baseURL and replaces
 * them with 'azureOpenAIApiInstanceName' and 'azureOpenAIApiDeploymentName' from the azure object.
 * If the respective azure property is not provided, the placeholder is replaced with an empty string.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.baseURL - The baseURL to inspect for replacement placeholders.
 * @param {AzureOptions} params.azure - The baseURL to inspect for replacement placeholders.
 * @returns {string} The complete baseURL with credentials injected for the Azure OpenAI API.
 */
function constructAzureURL({ baseURL, azure }) {
  let finalURL = baseURL;

  // Replace INSTANCE_NAME and DEPLOYMENT_NAME placeholders with actual values if available
  if (azure) {
    finalURL = finalURL.replace('${INSTANCE_NAME}', azure.azureOpenAIApiInstanceName ?? '');
    finalURL = finalURL.replace('${DEPLOYMENT_NAME}', azure.azureOpenAIApiDeploymentName ?? '');
  }

  return finalURL;
}

module.exports = {
  sanitizeModelName,
  genAzureEndpoint,
  genAzureChatCompletion,
  getAzureCredentials,
  constructAzureURL,
};
