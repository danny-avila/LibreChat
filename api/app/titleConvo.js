const { Configuration, OpenAIApi } = require('openai');
const _ = require('lodash');
const { genAzureEndpoint } = require('../utils/genAzureEndpoints');

const proxyEnvToAxiosProxy = (proxyString) => {
  if (!proxyString) return null;

  const regex = /^([^:]+):\/\/(?:([^:@]*):?([^:@]*)@)?([^:]+)(?::(\d+))?/;
  const [, protocol, username, password, host, port] = proxyString.match(regex);
  const proxyConfig = {
    protocol,
    host,
    port: port ? parseInt(port) : undefined,
    auth: username && password ? { username, password } : undefined
  };

  return proxyConfig;
};

const titleConvo = async ({ endpoint, text, response, oaiApiKey }) => {
  let title = 'New Chat';
  const ChatGPTClient = (await import('@waylaidwanderer/chatgpt-api')).default;

  try {
    const instructionsPayload = {
      role: 'system',
      content: `Detect user language and write in the same language an extremely concise title for this conversation, which you must accurately detect. Write in the detected language. Title in 5 Words or Less. No Punctuation or Quotation. All first letters of every word should be capitalized and complete only the title in User Language only.

    ||>User:
    "${text}"
    ||>Response:
    "${JSON.stringify(response?.text)}"
    
    ||>Title:`
    };

    const azure = process.env.AZURE_OPENAI_API_KEY ? true : false;
    const options = {
      azure,
      reverseProxyUrl: process.env.OPENAI_REVERSE_PROXY || null,
      proxy: process.env.PROXY || null
    };

    const titleGenClientOptions = JSON.parse(JSON.stringify(options));

    titleGenClientOptions.modelOptions = {
      model: 'gpt-3.5-turbo',
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0
    };

    let apiKey = oaiApiKey || process.env.OPENAI_API_KEY;

    if (azure) {
      apiKey = process.env.AZURE_OPENAI_API_KEY;
      titleGenClientOptions.reverseProxyUrl = genAzureEndpoint({
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION
      });
    }

    const titleGenClient = new ChatGPTClient(apiKey, titleGenClientOptions);
    const result = await titleGenClient.getCompletion([instructionsPayload], null);
    title = result.choices[0].message.content.replace(/\s+/g, ' ').replaceAll('"', '').trim();
  } catch (e) {
    console.error(e);
    console.log('There was an issue generating title, see error above');
  }

  console.log('CONVERSATION TITLE', title);
  return title;
};

const throttledTitleConvo = _.throttle(titleConvo, 1000);

module.exports = throttledTitleConvo;
