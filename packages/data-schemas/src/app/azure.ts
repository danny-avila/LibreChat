import {
  EModelEndpoint,
  validateAzureGroups,
  mapModelToAzureConfig,
} from 'librechat-data-provider';
import type {
  TAzureConfig,
  TCustomConfig,
  TAzureConfigValidationResult,
} from 'librechat-data-provider';
import logger from '~/config/winston';

/** What Azure `groups` resolve to: the fields the Azure clients read instead of the groups. */
export type ResolvedAzureGroups = TAzureConfigValidationResult & {
  assistantModels: string[];
  assistantGroups: string[];
};

/** A field of the resolved Azure config that its `groups` decide. */
export type AzureResolvedGroupField =
  | 'groupMap'
  | 'modelGroupMap'
  | 'modelNames'
  | 'assistantModels'
  | 'assistantGroups';

/**
 * The fields of the resolved Azure config that its `groups` decide, which the Azure clients,
 * model lists and assistants read. A config override's `groups` resolve to them as
 * librechat.yaml's do ({@link resolveAzureGroups}).
 */
export const AZURE_RESOLVED_GROUP_FIELDS: readonly AzureResolvedGroupField[] = [
  'groupMap',
  'modelGroupMap',
  'modelNames',
  'assistantModels',
  'assistantGroups',
];

/**
 * Resolves Azure `groups` into the maps the Azure clients read (`groupMap`, `modelGroupMap`), the
 * models they serve and the assistants among them. The groups are validated here, so any value
 * is accepted: a malformed list, or a structural problem (a duplicate group or model, a group
 * without an instance, a serverless one without a base URL), is reported in `errors` with
 * `isValid: false`. The per-model settings each request resolves are not checked.
 */
export function resolveAzureGroups(groups: unknown): ResolvedAzureGroups {
  const validation = validateAzureGroups(groups);
  const { isValid, modelNames, modelGroupMap, groupMap } = validation;
  const assistantModels: string[] = [];
  const assistantGroups = new Set<string>();
  for (const modelName of isValid ? modelNames : []) {
    const groupName = modelGroupMap?.[modelName]?.group;
    const modelGroup = groupMap?.[groupName];
    const supportsAssistants = modelGroup?.assistants || modelGroup?.[modelName]?.assistants;
    if (supportsAssistants) {
      assistantModels.push(modelName);
      assistantGroups.add(groupName);
    }
  }
  return { ...validation, assistantModels, assistantGroups: Array.from(assistantGroups) };
}

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
  const resolved = resolveAzureGroups(groups);
  const { isValid, modelNames, modelGroupMap, groupMap, errors } = resolved;

  if (!isValid) {
    const errorString = errors.join('\n');
    const errorMessage = 'Invalid Azure OpenAI configuration:\n' + errorString;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  for (const modelName of modelNames) {
    mapModelToAzureConfig({ modelName, modelGroupMap, groupMap });
  }

  if (azureConfiguration.assistants && resolved.assistantModels.length === 0) {
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
    assistantModels: resolved.assistantModels,
    assistantGroups: resolved.assistantGroups,
    ...azureConfiguration,
  };
}
