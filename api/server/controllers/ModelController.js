const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { BedrockAgentClient, ListAgentsCommand } = require('@aws-sdk/client-bedrock-agent');

/**
 * @param {ServerRequest} req
 */
const getModelsConfig = async (req) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const client = new BedrockAgentClient({
    region: process.env.AWS_REGION ?? 'eu-central-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  // console.log(req);

  const command = new ListAgentsCommand({});
  const response = await client.send(command);
  const agNames = [];
  response.agentSummaries?.forEach((a) => {
    agNames.push(a.description ?? a.agentName);
  });

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);

  const modelConfig = { ...defaultModelsConfig, ...customModelsConfig };

  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  return { bedrock: agNames };
  // return modelConfig;
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = { modelController, loadModels, getModelsConfig };
