const {
  Capabilities,
  EModelEndpoint,
  assistantEndpointSchema,
} = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Sets up the minimum, default Assistants configuration if Azure OpenAI Assistants option is enabled.
 * @returns {Partial<TAssistantEndpoint>} The Assistants endpoint configuration.
 */
function azureAssistantsDefaults() {
  return {
    capabilities: [Capabilities.tools, Capabilities.actions, Capabilities.code_interpreter],
  };
}

/**
 * Sets up the Assistants configuration from the config (`librechat.yaml`) file.
 * @param {TCustomConfig} config - The loaded custom configuration.
 * @param {Partial<TAssistantEndpoint>} [prevConfig]
 * - The previously loaded assistants configuration from Azure OpenAI Assistants option.
 * @returns {Partial<TAssistantEndpoint>} The Assistants endpoint configuration.
 */
function assistantsConfigSetup(config, prevConfig = {}) {
  const assistantsConfig = config.endpoints[EModelEndpoint.assistants];
  const parsedConfig = assistantEndpointSchema.parse(assistantsConfig);
  if (assistantsConfig.supportedIds?.length && assistantsConfig.excludedIds?.length) {
    logger.warn(
      `Both \`supportedIds\` and \`excludedIds\` are defined for the ${EModelEndpoint.assistants} endpoint; \`excludedIds\` field will be ignored.`,
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
