const { EModelEndpoint } = require('librechat-data-provider');
const { addOpenAPISpecs } = require('~/app/clients/tools/util/addOpenAPISpecs');
const { availableTools } = require('~/app/clients/tools');
const { isUserProvided } = require('~/server/utils');
const { config } = require('./EndpointService');

const { openAIApiKey, azureOpenAIApiKey, useAzurePlugins, userProvidedOpenAI, googleKey } = config;

/**
 * Load async endpoints and return a configuration object
 * @param {Express.Request} req - The request object
 */
async function loadAsyncEndpoints(req) {
  let i = 0;
  let serviceKey, googleUserProvides;
  try {
    serviceKey = require('~/data/auth.json');
  } catch (e) {
    if (i === 0) {
      i++;
    }
  }

  if (isUserProvided(googleKey)) {
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

  const useAzure = req.app.locals[EModelEndpoint.azureOpenAI]?.plugins;
  const gptPlugins =
    useAzure || openAIApiKey || azureOpenAIApiKey
      ? {
        plugins,
        availableAgents: ['classic', 'functions'],
        userProvide: useAzure ? false : userProvidedOpenAI,
        userProvideURL: useAzure
          ? false
          : config[EModelEndpoint.openAI]?.userProvideURL ||
              config[EModelEndpoint.azureOpenAI]?.userProvideURL,
        azure: useAzurePlugins || useAzure,
      }
      : false;

  return { google, gptPlugins };
}

module.exports = loadAsyncEndpoints;
