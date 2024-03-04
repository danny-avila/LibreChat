const { availableTools } = require('~/app/clients/tools');
const { addOpenAPISpecs } = require('~/app/clients/tools/util/addOpenAPISpecs');
const { openAIApiKey, azureOpenAIApiKey, useAzurePlugins, userProvidedOpenAI, googleKey } =
  require('./EndpointService').config;

/**
 * Load async endpoints and return a configuration object
 */
async function loadAsyncEndpoints() {
  let i = 0;
  let serviceKey, googleUserProvides;
  try {
    serviceKey = require('~/data/auth.json');
  } catch (e) {
    if (i === 0) {
      i++;
    }
  }

  if (googleKey === 'user_provided') {
    googleUserProvides = true;
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

  const google = serviceKey || googleKey ? { userProvide: googleUserProvides } : false;

  const gptPlugins =
    openAIApiKey || azureOpenAIApiKey
      ? {
        plugins,
        availableAgents: ['classic', 'functions'],
        userProvide: userProvidedOpenAI,
        azure: useAzurePlugins,
      }
      : false;

  return { google, gptPlugins };
}

module.exports = loadAsyncEndpoints;
