const { ChatOpenAI } = require('langchain/chat_models/openai');
const { CallbackManager } = require('langchain/callbacks');

function createLLM({ modelOptions, configOptions, handlers, openAIApiKey, azure = {} }) {
  let credentials = { openAIApiKey };
  let configuration = {
    apiKey: openAIApiKey,
  };

  if (azure) {
    credentials = {};
    configuration = {};
  }

  // console.debug('createLLM: configOptions');
  // console.debug(configOptions);

  return new ChatOpenAI(
    {
      streaming: true,
      credentials,
      configuration,
      ...azure,
      ...modelOptions,
      callbackManager: handlers && CallbackManager.fromHandlers(handlers),
    },
    configOptions,
  );
}

module.exports = createLLM;
