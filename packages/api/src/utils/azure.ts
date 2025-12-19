import { isEnabled } from './common';
import type { AzureOptions, GenericClient } from '~/types';
import { DefaultAzureCredential, AccessToken } from '@azure/identity';
import { logger } from '@librechat/data-schemas';

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
  // Support both old (.openai.azure.com) and new (.cognitiveservices.azure.com) endpoint formats
  // If instanceName already includes a full domain, use it as-is
  if (azureOpenAIApiInstanceName.includes('.azure.com')) {
    return `https://${azureOpenAIApiInstanceName}/openai/deployments/${azureOpenAIApiDeploymentName}`;
  }
  // Legacy format for backward compatibility
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

/**
 * Checks if Entra ID authentication should be used based on environment variables.
 * @returns {boolean} True if Entra ID authentication should be used
 */
export const shouldUseEntraId = (): boolean => {
  return isEnabled(process.env.AZURE_OPENAI_USE_ENTRA_ID);
};

/**
 * Creates and caches an Azure credential for Entra ID authentication.
 * Uses DefaultAzureCredential which supports multiple authentication methods:
 * - Managed Identity (when running in Azure)
 * - Service Principal (when environment variables are set)
 * - Azure CLI (for local development)
 * - Visual Studio Code (for local development)
 *
 * @returns DefaultAzureCredential instance
 */
let entraIdCredential: DefaultAzureCredential | undefined;
export const createEntraIdCredential = (): DefaultAzureCredential => {
  if (!entraIdCredential) {
    entraIdCredential = new DefaultAzureCredential();
  }
  return entraIdCredential;
};

let cachedToken: AccessToken | null = null;
let cachedTokenPromise: Promise<AccessToken | null> | null = null;


// Refresh cached token a bit early to avoid edge cases (clock skew, retries, etc.)
const ENTRA_ID_EARLY_REFRESH_MS = 2 * 60 * 1000; // 2 minutes
const ENTRA_ID_SCOPE = 'https://cognitiveservices.azure.com/.default';

const isTokenFresh = (token: AccessToken, nowMs: number): boolean =>
  nowMs < token.expiresOnTimestamp - ENTRA_ID_EARLY_REFRESH_MS;

/**
 * Gets the access token for Entra ID authentication from azure/identity.
 * @returns The access token string
 */
export const getEntraIdAccessToken = async (): Promise<string> => {
  const nowMs = Date.now();

  if (cachedToken && isTokenFresh(cachedToken, nowMs)) {
    return cachedToken.token;
  }

  // Dedupe concurrent refreshes to avoid token "stampedes"
  if (!cachedTokenPromise) {
    const credential = createEntraIdCredential();
    cachedTokenPromise = credential.getToken(ENTRA_ID_SCOPE);
  }

  try {
    const token = await cachedTokenPromise;
    if (!token) {
      throw new Error('Failed to get Entra ID access token (credential returned null token)');
    }

    cachedToken = token;
    return token.token;
  } catch (error) {
    const safeError =
      error instanceof Error
        ? { message: error.message, ...((error as any).code && { code: (error as any).code }) }
        : { message: String(error) };
    logger.error('[ENTRA_ID_DEBUG] Failed to get Entra ID access token:', safeError);
    throw error;
  } finally {
    cachedTokenPromise = null;
  }
};
