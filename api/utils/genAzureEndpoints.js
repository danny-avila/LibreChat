function genAzureEndpoint({
  azureOpenAIApiInstanceName,
  azureOpenAIApiDeploymentName }) {
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}`;
}

function genAzureChatCompletion({ azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName,
  azureOpenAIApiVersion
}) {
  return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`;
}

module.exports = { genAzureEndpoint, genAzureChatCompletion };
