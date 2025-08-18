import { isEnabled } from './common';
import type { AzureOptions, GenericClient } from '~/types';

/**
 * Sanitizes the model name to be used in the URL by removing or replacing disallowed characters.
 * @param modelName - The model name to be sanitized.
 * @returns The sanitized model name.
 */
export const sanitizeModelName = (modelName: string): string => {
  // Replace periods with empty strings and other disallowed characters as needed.
  return modelName.replace(/\./g, '');
};

/**
 * Generates the Azure OpenAI API endpoint URL.
 * @param params - The parameters object.
 * @param params.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param params.azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name.
 * @returns The complete endpoint URL for the Azure OpenAI API.
 */
export const genAzureEndpoint = ({
  azureOpenAIApiInstanceName,
  azureOpenAIApiDeploymentName,
}: {
  azureOpenAIApiInstanceName: string;
  azureOpenAIApiDeploymentName: string;
}): string => {
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}`;
};

/**
 * Generates the Azure OpenAI API chat completion endpoint URL with the API version.
 * If both deploymentName and modelName are provided, modelName takes precedence.
 * @param azureConfig - The Azure configuration object.
 * @param azureConfig.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param azureConfig.azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name (optional).
 * @param azureConfig.azureOpenAIApiVersion - The Azure OpenAI API version.
 * @param modelName - The model name to be included in the deployment name (optional).
 * @param client - The API Client class for optionally setting properties (optional).
 * @returns The complete chat completion endpoint URL for the Azure OpenAI API.
 * @throws Error if neither azureOpenAIApiDeploymentName nor modelName is provided.
 */
export const genAzureChatCompletion = (
  {
    azureOpenAIApiInstanceName,
    azureOpenAIApiDeploymentName,
    azureOpenAIApiVersion,
  }: {
    azureOpenAIApiInstanceName: string;
    azureOpenAIApiDeploymentName?: string;
    azureOpenAIApiVersion: string;
  },
  modelName?: string,
  client?: GenericClient,
): string => {
  // Determine the deployment segment of the URL based on provided modelName or azureOpenAIApiDeploymentName
  let deploymentSegment: string;
  if (isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME) && modelName) {
    const sanitizedModelName = sanitizeModelName(modelName);
    deploymentSegment = sanitizedModelName;
    if (client && typeof client === 'object') {
      client.azure.azureOpenAIApiDeploymentName = sanitizedModelName;
    }
  } else if (azureOpenAIApiDeploymentName) {
    deploymentSegment = azureOpenAIApiDeploymentName;
  } else if (!process.env.AZURE_OPENAI_BASEURL) {
    throw new Error(
      'Either a model name with the `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` setting or a deployment name must be provided if `AZURE_OPENAI_BASEURL` is omitted.',
    );
  } else {
    deploymentSegment = '';
  }

  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${deploymentSegment}/chat/completions?api-version=${azureOpenAIApiVersion}`;
};

/**
 * Retrieves the Azure OpenAI API credentials from environment variables.
 * @returns An object containing the Azure OpenAI API credentials.
 */
export const getAzureCredentials = (): AzureOptions => {
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
 * @param params - The parameters object.
 * @param params.baseURL - The baseURL to inspect for replacement placeholders.
 * @param params.azureOptions - The azure options object containing the instance and deployment names.
 * @returns The complete baseURL with credentials injected for the Azure OpenAI API.
 */
export function constructAzureURL({
  baseURL,
  azureOptions,
}: {
  baseURL: string;
  azureOptions?: AzureOptions;
}): string {
  let finalURL = baseURL;

  // Replace INSTANCE_NAME and DEPLOYMENT_NAME placeholders with actual values if available
  if (azureOptions) {
    finalURL = finalURL.replace('${INSTANCE_NAME}', azureOptions.azureOpenAIApiInstanceName ?? '');
    finalURL = finalURL.replace(
      '${DEPLOYMENT_NAME}',
      azureOptions.azureOpenAIApiDeploymentName ?? '',
    );
  }

  return finalURL;
}
