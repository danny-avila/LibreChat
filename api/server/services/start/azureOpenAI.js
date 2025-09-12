const { logger } = require('@librechat/data-schemas');
const {
  EModelEndpoint,
  validateAzureGroups,
  mapModelToAzureConfig,
} = require('librechat-data-provider');

/**
 * Sets up the Azure OpenAI configuration from the config (`librechat.yaml`) file.
 * @param {TCustomConfig} config - The loaded custom configuration.
 * @returns {TAzureConfig} The Azure OpenAI configuration.
 */
function azureConfigSetup(config) {
  const { groups, ...azureConfiguration } = config.endpoints[EModelEndpoint.azureOpenAI];
  /** @type {TAzureConfigValidationResult} */
  const { isValid, modelNames, modelGroupMap, groupMap, errors } = validateAzureGroups(groups);

  if (!isValid) {
    const errorString = errors.join('\n');
    const errorMessage = 'Invalid Azure OpenAI configuration:\n' + errorString;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  const assistantModels = [];
  const assistantGroups = new Set();
  for (const modelName of modelNames) {
    mapModelToAzureConfig({ modelName, modelGroupMap, groupMap });
    const groupName = modelGroupMap?.[modelName]?.group;
    const modelGroup = groupMap?.[groupName];
    let supportsAssistants = modelGroup?.assistants || modelGroup?.[modelName]?.assistants;
    if (supportsAssistants) {
      assistantModels.push(modelName);
      !assistantGroups.has(groupName) && assistantGroups.add(groupName);
    }
  }

  if (azureConfiguration.assistants && assistantModels.length === 0) {
    throw new Error(
      'No Azure models are configured to support assistants. Please remove the `assistants` field or configure at least one model to support assistants.',
    );
  }

  if (
    azureConfiguration.assistants &&
    process.env.ENDPOINTS &&
    !process.env.ENDPOINTS.includes(EModelEndpoint.azureAssistants)
  ) {
    logger.warn(
      `Azure Assistants are configured, but the endpoint will not be accessible as it's not included in the ENDPOINTS environment variable.
      Please add the value "${EModelEndpoint.azureAssistants}" to the ENDPOINTS list if expected.`,
    );
  }

  return {
    modelNames,
    modelGroupMap,
    groupMap,
    assistantModels,
    assistantGroups: Array.from(assistantGroups),
    ...azureConfiguration,
  };
}

module.exports = { azureConfigSetup };
