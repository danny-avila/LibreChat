require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const { genAzureEndpoint } = require('../../utils/genAzureEndpoints');

const askClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  apiKey,
  chatGptLabel,
  promptPrefix,
  temperature,
  top_p,
  presence_penalty,
  frequency_penalty,
  onProgress,
  abortController,
  userId
}) => {
  const { ChatGPTClient } = await import('@waylaidwanderer/chatgpt-api');
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' })
  };

  const azure = process.env.AZURE_OPENAI_API_KEY ? true : false;
  const maxContextTokens = model === 'gpt-4' ? 8191 : model === 'gpt-4-32k' ? 32767 : 4095; // 1 less than maximum
  const clientOptions = {
    reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
    azure,
    maxContextTokens,
    modelOptions: {
      model,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty
    },
    chatGptLabel,
    promptPrefix,
    proxy: process.env.PROXY || null,
    // debug: true
  };

  let apiKey = apiKey ? apiKey : process.env.OPENAI_KEY || null;

  if (azure) {
    apiKey = apiKey ? apiKey : process.env.AZURE_OPENAI_API_KEY || null;
    clientOptions.reverseProxyUrl = genAzureEndpoint({
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
    });
  }

  const client = new ChatGPTClient(apiKey, clientOptions, store);

  const options = {
    onProgress,
    abortController,
    ...(parentMessageId && conversationId ? { parentMessageId, conversationId } : {})
  };

  const res = await client.sendMessage(text, { ...options, userId });
  return res;
};

module.exports = { askClient };
