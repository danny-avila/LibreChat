const { EModelEndpoint } = require('../routes/endpoints/schemas');
const { availableTools } = require('../../app/clients/tools');
const { addOpenAPISpecs } = require('../../app/clients/tools/util/addOpenAPISpecs');
const {
  openAIApiKey,
  azureOpenAIApiKey,
  useAzurePlugins,
  userProvidedOpenAI,
  palmKey,
  openAI,
  assistant,
  azureOpenAI,
  bingAI,
  chatGPTBrowser,
  anthropic,
} = require('../services/EndpointService').config;

let i = 0;
async function endpointController(req, res) {
  let key, palmUser;
  try {
    key = require('../../data/auth.json');
  } catch (e) {
    if (i === 0) {
      i++;
    }
  }

  if (palmKey === 'user_provided') {
    palmUser = true;
    if (i <= 1) {
      i++;
    }
  }

  const tools = await addOpenAPISpecs(availableTools);
  function transformToolsToMap(tools) {
    return tools.reduce((map, obj) => {
      map[obj.pluginKey] = obj.name;
      return map;
    }, {});
  }
  const plugins = transformToolsToMap(tools);

  const google = key || palmUser ? { userProvide: palmUser } : false;

  const gptPlugins =
    openAIApiKey || azureOpenAIApiKey
      ? {
        plugins,
        availableAgents: ['classic', 'functions'],
        userProvide: userProvidedOpenAI,
        azure: useAzurePlugins,
      }
      : false;

  res.send(
    JSON.stringify({
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.assistant]: assistant,
      [EModelEndpoint.azureOpenAI]: azureOpenAI,
      [EModelEndpoint.google]: google,
      [EModelEndpoint.bingAI]: bingAI,
      [EModelEndpoint.chatGPTBrowser]: chatGPTBrowser,
      [EModelEndpoint.gptPlugins]: gptPlugins,
      [EModelEndpoint.anthropic]: anthropic,
    }),
  );
}

module.exports = endpointController;
