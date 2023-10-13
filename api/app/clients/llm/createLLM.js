const { ChatOpenAI } = require('langchain/chat_models/openai');

function createLLM({
  modelOptions,
  configOptions,
  callbacks,
  streaming = false,
  openAIApiKey,
  azure = {},
}) {
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
      streaming,
      verbose: true,
      credentials,
      configuration,
      ...azure,
      ...modelOptions,
      callbacks,
    },
    configOptions,
  );
}

module.exports = createLLM;
