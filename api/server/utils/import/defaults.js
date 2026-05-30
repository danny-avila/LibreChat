const { logger, getTenantId } = require('@librechat/data-schemas');
const { EModelEndpoint, openAISettings, anthropicSettings } = require('librechat-data-provider');
const { getModelsConfig } = require('~/server/controllers/ModelController');

/**
 * Last-resort hardcoded defaults used only when the runtime models config is
 * unavailable or returns no models for the endpoint.
 */
const FALLBACK_MODEL_BY_ENDPOINT = {
  [EModelEndpoint.openAI]: openAISettings.model.default,
  [EModelEndpoint.anthropic]: anthropicSettings.model.default,
};

/**
 * Picks the first available model for an endpoint from a runtime models config.
 *
 * @param {string} endpoint - The endpoint key (e.g. EModelEndpoint.anthropic).
 * @param {TModelsConfig} [modelsConfig] - Map of endpoint -> available model list.
 * @returns {string | undefined} The first model for the endpoint, or undefined.
 */
function pickFirstConfiguredModel(endpoint, modelsConfig) {
  const models = modelsConfig?.[endpoint];
  if (!Array.isArray(models)) {
    return undefined;
  }
  for (const model of models) {
    if (typeof model === 'string' && model.length > 0) {
      return model;
    }
  }
  return undefined;
}

/**
 * Resolves the default model that imported conversations should be saved with
 * for a given endpoint. Prefers the first model exposed by the runtime models
 * config (admin-configured / provider-discovered), and only falls back to the
 * hardcoded per-endpoint default if the runtime config is empty or fails.
 *
 * @param {object} args
 * @param {string} args.endpoint - The endpoint key the import is targeting.
 * @param {string} args.requestUserId - The id of the importing user.
 * @param {string} [args.userRole] - The role of the importing user.
 * @returns {Promise<string>} The default model name to persist on the conversation.
 */
async function resolveImportDefaultModel({ endpoint, requestUserId, userRole }) {
  try {
    const modelsConfig = await getModelsConfig({
      user: { id: requestUserId, role: userRole, tenantId: getTenantId() },
    });
    const configured = pickFirstConfiguredModel(endpoint, modelsConfig);
    if (configured) {
      return configured;
    }
  } catch (error) {
    logger.warn(
      `[import] Failed to resolve default model from modelsConfig for ${endpoint}: ${error.message}`,
    );
  }
  return FALLBACK_MODEL_BY_ENDPOINT[endpoint] ?? openAISettings.model.default;
}

module.exports = {
  FALLBACK_MODEL_BY_ENDPOINT,
  pickFirstConfiguredModel,
  resolveImportDefaultModel,
};
