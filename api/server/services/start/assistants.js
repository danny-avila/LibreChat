const {
  Capabilities,
  EModelEndpoint,
  assistantEndpointSchema,
} = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Sets up the Assistants configuration from the config (`librechat.yaml`) file.
 * @param {TCustomConfig} config - The loaded custom configuration.
 * @returns {Partial<TAssistantEndpoint>} The Assistants endpoint configuration.
 */
function assistantsConfigSetup(config) {
  const assistantsConfig = config.endpoints[EModelEndpoint.assistants];
  const parsedConfig = assistantEndpointSchema.parse(assistantsConfig);
  if (assistantsConfig.supportedIds?.length && assistantsConfig.excludedIds?.length) {
    logger.warn(
      `Both \`supportedIds\` and \`excludedIds\` are defined for the ${EModelEndpoint.assistants} endpoint; \`excludedIds\` field will be ignored.`,
    );
  }

  const prevConfig = config.endpoints[EModelEndpoint.azureOpenAI]?.assistants
    ? {
      capabilities: [Capabilities.tools, Capabilities.actions, Capabilities.code_interpreter],
    }
    : {};

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

module.exports = { assistantsConfigSetup };
