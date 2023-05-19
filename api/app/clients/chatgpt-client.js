require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const { genAzureChatCompletion } = require('../../utils/genAzureEndpoints');
const tiktoken = require('@dqbd/tiktoken');
const encoding_for_model = tiktoken.encoding_for_model;

const askClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  oaiApiKey,
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
  let promptText;
  if (promptPrefix == null) {
    promptText = 'You are ChatGPT, a large language model trained by OpenAI.';
  } else {
    promptText = promptPrefix;
  }
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
    proxy: process.env.PROXY || null
    // debug: true
  };

  let apiKey = oaiApiKey ? oaiApiKey : process.env.OPENAI_KEY || null;

  if (azure) {
    apiKey = oaiApiKey ? oaiApiKey : process.env.AZURE_OPENAI_API_KEY || null;
    clientOptions.reverseProxyUrl = genAzureChatCompletion({
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

  const enc = encoding_for_model(model);
  const text_tokens = enc.encode(text);
  const prompt_tokens = enc.encode(promptText);
  // console.log("Prompt tokens = ", prompt_tokens.length);
  // console.log("Message Tokens = ", text_tokens.length);

  const res = await client.sendMessage(text, { ...options, userId });
  // return res;
  // create a new response object that includes the token counts
  const newRes = {
    ...res,
    usage: {
      prompt_tokens: prompt_tokens.length,
      completion_tokens: text_tokens.length,
      total_tokens: prompt_tokens.length + text_tokens.length
    }
  };

  return newRes;
};

module.exports = { askClient };
