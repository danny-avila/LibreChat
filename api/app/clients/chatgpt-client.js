require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const { genAzureChatCompletion } = require('../../utils/genAzureEndpoints');
const tiktoken = require('@dqbd/tiktoken');
const tiktokenModels = require('../../utils/tiktokenModels');
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
  let promptText = 'You are ChatGPT, a large language model trained by OpenAI.';
  if (promptPrefix) {
    promptText = promptPrefix;
  }

  const maxTokensMap = {
    'gpt-4': 8191,
    'gpt-4-0613': 8191,
    'gpt-4-32k': 32767,
    'gpt-4-32k-0613': 32767,
    'gpt-3.5-turbo': 4095,
    'gpt-3.5-turbo-0613': 4095,
    'gpt-3.5-turbo-0301': 4095,
    'gpt-3.5-turbo-16k': 15999,
  };

  const maxContextTokens = maxTokensMap[model] ?? 4095; // 1 less than maximum
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

  let apiKey = oaiApiKey ? oaiApiKey : process.env.OPENAI_API_KEY || null;

  if (azure) {
    apiKey = oaiApiKey ? oaiApiKey : process.env.AZURE_OPENAI_API_KEY || null;
    clientOptions.reverseProxyUrl = genAzureChatCompletion({
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
    });
  }

  let client = null;
  try {
    client = new ChatGPTClient(apiKey, clientOptions, store);
  } catch (e) {
    // We can try again with more context?
    // TODO: allow user to disable this
    if (model === 'gpt-3.5-turbo' && e.message.contains('maxContextTokens')) {
      model = 'gpt-3.5-turbo-16k';
      clientOptions.maxContextTokens = maxTokensMap[model] ?? 4095;
      clientOptions.modelOptions.model = model;
      client = new ChatGPTClient(apiKey, clientOptions, store);
    } else {
      throw e;
    }
  }

  const options = {
    onProgress,
    abortController,
    ...(parentMessageId && conversationId ? { parentMessageId, conversationId } : {})
  };

  let usage = {};
  let enc = null;
  try {
    enc = encoding_for_model(tiktokenModels.has(model) ? model : 'gpt-3.5-turbo');
    usage.prompt_tokens = (enc.encode(promptText)).length + (enc.encode(text)).length;
  } catch (e) {
    console.log('Error encoding prompt text', e);
  }
  
  const res = await client.sendMessage(text, { ...options, userId });

  try {
    usage.completion_tokens = (enc.encode(res.response)).length;
    enc.free();
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    res.usage = usage;
  } catch (e) {
    console.log('Error encoding response text', e);
  }
  
  return res;
};

module.exports = { askClient };
