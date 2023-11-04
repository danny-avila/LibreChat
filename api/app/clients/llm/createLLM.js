const { ChatOpenAI } = require('langchain/chat_models/openai');
const { sanitizeModelName } = require('../../../utils');

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

  let azureOptions = {};
  if (azure) {
    credentials = {};
    configuration = {};
    azureOptions = azure;
    azureOptions.azureOpenAIApiDeploymentName = sanitizeModelName(modelOptions.modelName);
  }

  // console.debug('createLLM: configOptions');
  // console.debug(configOptions);

  return new ChatOpenAI(
    {
      streaming,
      verbose: true,
      credentials,
      configuration,
      ...azureOptions,
      ...modelOptions,
      callbacks,
    },
    configOptions,
  );
}

module.exports = createLLM;
