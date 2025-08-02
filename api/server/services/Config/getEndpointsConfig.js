const {
  CacheKeys,
  EModelEndpoint,
  isAgentsEndpoint,
  orderEndpointsConfig,
  defaultAgentCapabilities,
} = require('librechat-data-provider');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const loadConfigEndpoints = require('./loadConfigEndpoints');
const getLogStores = require('~/cache/getLogStores');

/**
 *
 * @param {ServerRequest} req
 * @returns {Promise<TEndpointsConfig>}
 */
async function getEndpointsConfig(req) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
  if (cachedEndpointsConfig) {
    return cachedEndpointsConfig;
  }

  const defaultEndpointsConfig = await loadDefaultEndpointsConfig(req);
  const customConfigEndpoints = await loadConfigEndpoints(req);

  /** @type {TEndpointsConfig} */
  const mergedConfig = { ...defaultEndpointsConfig, ...customConfigEndpoints };
  if (mergedConfig[EModelEndpoint.assistants] && req.app.locals?.[EModelEndpoint.assistants]) {
    const { disableBuilder, retrievalModels, capabilities, version, ..._rest } =
      req.app.locals[EModelEndpoint.assistants];

    mergedConfig[EModelEndpoint.assistants] = {
      ...mergedConfig[EModelEndpoint.assistants],
      version,
      retrievalModels,
      disableBuilder,
      capabilities,
    };
  }
  if (mergedConfig[EModelEndpoint.agents] && req.app.locals?.[EModelEndpoint.agents]) {
    const { disableBuilder, capabilities, allowedProviders, ..._rest } =
      req.app.locals[EModelEndpoint.agents];

    mergedConfig[EModelEndpoint.agents] = {
      ...mergedConfig[EModelEndpoint.agents],
      allowedProviders,
      disableBuilder,
      capabilities,
    };
  }

  if (
    mergedConfig[EModelEndpoint.azureAssistants] &&
    req.app.locals?.[EModelEndpoint.azureAssistants]
  ) {
    const { disableBuilder, retrievalModels, capabilities, version, ..._rest } =
      req.app.locals[EModelEndpoint.azureAssistants];

    mergedConfig[EModelEndpoint.azureAssistants] = {
      ...mergedConfig[EModelEndpoint.azureAssistants],
      version,
      retrievalModels,
      disableBuilder,
      capabilities,
    };
  }

  if (mergedConfig[EModelEndpoint.bedrock] && req.app.locals?.[EModelEndpoint.bedrock]) {
    const { availableRegions } = req.app.locals[EModelEndpoint.bedrock];
    mergedConfig[EModelEndpoint.bedrock] = {
      ...mergedConfig[EModelEndpoint.bedrock],
      availableRegions,
    };
  }

  // Add individual credential flags for Bedrock
  if (mergedConfig[EModelEndpoint.bedrock]) {
    const userProvideAccessKeyId = process.env.BEDROCK_AWS_ACCESS_KEY_ID === 'user_provided';
    const userProvideSecretAccessKey =
      process.env.BEDROCK_AWS_SECRET_ACCESS_KEY === 'user_provided';
    const userProvideSessionToken = process.env.BEDROCK_AWS_SESSION_TOKEN === 'user_provided';
    const userProvideBearerToken = process.env.BEDROCK_AWS_BEARER_TOKEN === 'user_provided';

    mergedConfig[EModelEndpoint.bedrock] = {
      ...mergedConfig[EModelEndpoint.bedrock],
      userProvideAccessKeyId,
      userProvideSecretAccessKey,
      userProvideSessionToken,
      userProvideBearerToken,
    };
  }

  const endpointsConfig = orderEndpointsConfig(mergedConfig);

  await cache.set(CacheKeys.ENDPOINT_CONFIG, endpointsConfig);
  return endpointsConfig;
}

/**
 * @param {ServerRequest} req
 * @param {import('librechat-data-provider').AgentCapabilities} capability
 * @returns {Promise<boolean>}
 */
const checkCapability = async (req, capability) => {
  const isAgents = isAgentsEndpoint(req.body?.original_endpoint || req.body?.endpoint);
  const endpointsConfig = await getEndpointsConfig(req);
  const capabilities =
    isAgents || endpointsConfig?.[EModelEndpoint.agents]?.capabilities != null
      ? (endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [])
      : defaultAgentCapabilities;
  return capabilities.includes(capability);
};

module.exports = { getEndpointsConfig, checkCapability };
