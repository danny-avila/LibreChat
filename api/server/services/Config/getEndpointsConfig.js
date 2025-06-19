const { CacheKeys, EModelEndpoint, orderEndpointsConfig } = require('librechat-data-provider');
// const loadDefaultEndpointsConfig = require('./loadDefaultEConfig'); // Deprecated
// const loadConfigEndpoints = require('./loadConfigEndpoints'); // Deprecated
const getLogStores = require('~/cache/getLogStores');
const { Provider, ApiKey } = require('~/db/models'); // Import new models
const { logger } = require('~/config');

/**
 *
 * @param {ServerRequest} req
 * @returns {Promise<TEndpointsConfig>}
 */
async function getEndpointsConfig(req) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
  // TODO: Cache invalidation strategy will be needed if providers/API keys change
  if (cachedEndpointsConfig) {
    return cachedEndpointsConfig;
  }

  /** @type {TEndpointsConfig} */
  const dynamicEndpointsConfig = {};
  try {
    const providers = await Provider.find({}).lean();
    for (const provider of providers) {
      // Try to find a system-level API key for this provider
      // This simplistic check assumes one key per provider for system use.
      // If no key is found, userProvide will be true.
      const apiKey = await ApiKey.findOne({ providerId: provider._id /* TODO: Add criteria for system vs user keys if needed */ }).lean();

      // Construct the endpoint entry
      // The exact fields will depend on TEndpoint definition and what the frontend expects.
      // This is a basic structure.
      dynamicEndpointsConfig[provider.name] = {
        // availableModels: [], // Models will be populated by /api/models endpoint
        // TODO: Determine how to set fields like `type` (e.g. 'openai', 'azure', 'custom')
        // This might need a new field in the Provider schema or derive from provider.name or baseURL.
        // For now, let's assume a generic 'custom' type or try to infer.
        type: provider.name.toLowerCase().includes(EModelEndpoint.azureOpenAI) ? EModelEndpoint.azureOpenAI : EModelEndpoint.custom,
        baseURL: provider.baseURL,
        apiKey: apiKey ? apiKey.value : undefined, // Only set if a system key exists
        userProvide: !apiKey, // If no system key, user must provide
        // Add other relevant fields from the Provider schema if they map to TEndpoint properties
        // e.g., titleModel, iconURL, etc. if added to Provider schema
      };
    }
  } catch (error) {
    logger.error('[getEndpointsConfig] Error fetching providers from DB:', error);
    // Fallback or error handling if DB fetch fails
    // For now, it will proceed with an empty dynamicEndpointsConfig if DB fails
  }

  /** @type {TEndpointsConfig} */
  const mergedConfig = { ...dynamicEndpointsConfig }; // Start with DB configs
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
  const endpointsConfig = await getEndpointsConfig(req);
  const capabilities = endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [];
  return capabilities.includes(capability);
};

module.exports = { getEndpointsConfig, checkCapability };
