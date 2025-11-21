import logger from '~/config/winston';
import {
  EModelEndpoint,
  validateAzureGroups,
  mapModelToAzureConfig,
} from 'librechat-data-provider';
import type { TCustomConfig, TAzureConfig } from 'librechat-data-provider';

/**
 * Sets up the Azure OpenAI configuration from the config (`librechat.yaml`) file.
 * @param config - The loaded custom configuration.
 * @returns The Azure OpenAI configuration.
 */
export function azureConfigSetup(config: Partial<TCustomConfig>): TAzureConfig {
  const azureConfig = config.endpoints?.[EModelEndpoint.azureOpenAI];
  if (!azureConfig) {
    throw new Error('Azure OpenAI configuration is missing.');
  }
  const { groups, ...azureConfiguration } = azureConfig;
  const { isValid, modelNames, modelGroupMap, groupMap, errors } = validateAzureGroups(groups);

  if (!isValid) {
    const errorString = errors.join('\n');
    const errorMessage = 'Invalid Azure OpenAI configuration:\n' + errorString;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  const assistantModels: string[] = [];
  const assistantGroups = new Set<string>();
  for (const modelName of modelNames) {
    mapModelToAzureConfig({ modelName, modelGroupMap, groupMap });
    const groupName = modelGroupMap?.[modelName]?.group;
    const modelGroup = groupMap?.[groupName];
    const supportsAssistants = modelGroup?.assistants || modelGroup?.[modelName]?.assistants;
    if (supportsAssistants) {
      assistantModels.push(modelName);
      if (!assistantGroups.has(groupName)) {
        assistantGroups.add(groupName);
      }
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
    errors,
    isValid,
    groupMap,
    modelNames,
    modelGroupMap,
    assistantModels,
    assistantGroups: Array.from(assistantGroups),
    ...azureConfiguration,
  };
}
