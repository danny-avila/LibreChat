require('dotenv').config();
const { KeyvFile } = require('keyv-file');

const askClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
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

  const clientOptions = {
    reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
    azure,
    modelOptions: {
      model: model,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty
    },
    chatGptLabel,
    promptPrefix,
    proxy: process.env.PROXY || null,
    debug: true
  };

  let apiKey = process.env.OPENAI_KEY;

  if (azure) {
    apiKey = process.env.AZURE_OPENAI_API_KEY;
    clientOptions.reverseProxyUrl = `https://${process.env.AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/${process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`;
  }

  console.log('askClient', { clientOptions, apiKey });

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
