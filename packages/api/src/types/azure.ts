/**
 * Azure OpenAI configuration interface
 */
export interface AzureOptions {
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  azureOpenAIBasePath?: string;
}

/**
 * Client with azure property for setting deployment name
 */
export interface GenericClient {
  azure: {
    azureOpenAIApiDeploymentName?: string;
  };
}
