const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const {
  BedrockAgentClient,
  ListAgentsCommand,
  ListAgentAliasesCommand,
} = require('@aws-sdk/client-bedrock-agent');

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
 * @param {string} key - The key of the model to set as current.
 * @returns {Promise<boolean>} Whether the model was set.
 */
async function setCurrentModel(label) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  const agentName = cachedModelsConfig?.find((a) => a.agentName === label)?.agentName;
  if (!agentName) {
    return false;
  }
  await cache.set(CacheKeys.CURRENT_AGENT_ID, agentName);
  return true;
}

async function getCurrentModel() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const availableAgents = await cache.get(CacheKeys.MODELS_CONFIG);
  console.log('availableAgents:', availableAgents); // eslint-disable-line no-console
  const currentAgentName = await cache.get(CacheKeys.CURRENT_AGENT_ID);
  console.log('currentAgentName:', currentAgentName); // eslint-disable-line no-console
  let agentId = '';
  let latestAliasId = '';
  let description = '';
  availableAgents.forEach((agent) => {
    if (agent.agentName === currentAgentName) {
      latestAliasId = agent.latestAliasId;
      agentId = agent.agentId;
      description = agent.description;
      return;
    }
  });
  return { agentId, latestAliasId, description };
}

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const client = new BedrockAgentClient({
    region: process.env.AWS_REGION ?? 'eu-central-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  // First request to get agent summaries
  const command = new ListAgentsCommand({});
  const response = await client.send(command);
  const agentSummaries = response.agentSummaries;

  // Second request to get aliases for each agent
  const aliasRequests = agentSummaries.map(async (agent) => {
    const aliasCommand = new ListAgentAliasesCommand({ agentId: agent.agentId });
    const aliasResponse = await client.send(aliasCommand);
    const latestAgent = aliasResponse?.agentAliasSummaries?.reduce((latest, current) =>
      new Date(current.updatedAt) > new Date(latest.updatedAt) ? current : latest,
    );
    return {
      ...agent,
      latestAliasId: latestAgent.agentAliasId,
    };
  });

  // Wait for all alias requests to complete
  const agentsWithAliases = await Promise.all(aliasRequests);
  const agNames = agentsWithAliases.map((a) => a.agentName);
  const defaultModelsConfig = await loadDefaultModels(req);

  const modelConfig = { ...defaultModelsConfig, ...{ bedrock: agNames } };
  await cache.set(CacheKeys.MODELS_CONFIG, agentsWithAliases);
  return modelConfig;
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = { modelController, loadModels, getModelsConfig, setCurrentModel, getCurrentModel };
