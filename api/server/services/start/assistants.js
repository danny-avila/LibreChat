const {
  Capabilities,
  EModelEndpoint,
  assistantEndpointSchema,
  defaultAssistantsVersion,
} = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Sets up the minimum, default Assistants configuration if Azure OpenAI Assistants option is enabled.
 * @returns {Partial<TAssistantEndpoint>} The Assistants endpoint configuration.
 */
function azureAssistantsDefaults() {
  return {
    capabilities: [Capabilities.tools, Capabilities.actions, Capabilities.code_interpreter],
    version: defaultAssistantsVersion.azureAssistants,
  };
}

/**
 * Sets up the Assistants configuration from the config (`librechat.yaml`) file.
 * @param {TCustomConfig} config - The loaded custom configuration.
 * @param {EModelEndpoint.assistants|EModelEndpoint.azureAssistants} assistantsEndpoint - The Assistants endpoint name.
 * - The previously loaded assistants configuration from Azure OpenAI Assistants option.
 * @param {Partial<TAssistantEndpoint>} [prevConfig]
 * @returns {Partial<TAssistantEndpoint>} The Assistants endpoint configuration.
 */
function assistantsConfigSetup(config, assistantsEndpoint, prevConfig = {}) {
  const assistantsConfig = config.endpoints[assistantsEndpoint];
  const parsedConfig = assistantEndpointSchema.parse(assistantsConfig);
  if (assistantsConfig.supportedIds?.length && assistantsConfig.excludedIds?.length) {
    logger.warn(
      `Both \`supportedIds\` and \`excludedIds\` are defined for the ${assistantsEndpoint} endpoint; \`excludedIds\` field will be ignored.`,
    );
  }

  return {
    ...prevConfig,
    retrievalModels: parsedConfig.retrievalModels,
    disableBuilder: parsedConfig.disableBuilder,
    pollIntervalMs: parsedConfig.pollIntervalMs,
    supportedIds: parsedConfig.supportedIds,
    capabilities: parsedConfig.capabilities,
    excludedIds: parsedConfig.excludedIds,
    timeoutMs: parsedConfig.timeoutMs,
  };
}

module.exports = { azureAssistantsDefaults, assistantsConfigSetup };
