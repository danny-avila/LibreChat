const fs = require('fs');
const path = require('path');
const { EModelEndpoint } = require('librechat-data-provider');
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
  const serviceKeyPath =
    process.env.GOOGLE_SERVICE_KEY_FILE_PATH ||
    path.join(__dirname, '../../..', 'data', 'auth.json');

  try {
    if (process.env.GOOGLE_SERVICE_KEY_FILE_PATH) {
      const absolutePath = path.isAbsolute(serviceKeyPath)
        ? serviceKeyPath
        : path.resolve(serviceKeyPath);
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      serviceKey = JSON.parse(fileContent);
    } else {
      serviceKey = require('~/data/auth.json');
    }
  } catch {
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

  const google = serviceKey || googleKey ? { userProvide: googleUserProvides } : false;

  const useAzure = req.app.locals[EModelEndpoint.azureOpenAI]?.plugins;
  const gptPlugins =
    useAzure || openAIApiKey || azureOpenAIApiKey
      ? {
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
