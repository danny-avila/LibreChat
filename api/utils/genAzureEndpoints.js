function genAzureEndpoint({ azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion }) {
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`;
}

module.exports = { genAzureEndpoint };