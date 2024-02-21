import type { ZodError } from 'zod';
import type { TAzureGroups, TAzureGroupMap, TAzureModelGroupMap } from '../src/config';
import { azureGroupConfigsSchema } from '../src/config';
import { errorsToString } from '../src/parsers';

export function validateAzureGroups(configs: TAzureGroups): {
  isValid: boolean;
  modelNames: string[];
  modelGroupMap: TAzureModelGroupMap;
  groupMap: TAzureGroupMap;
  errors: (ZodError | string)[];
} {
  let isValid = true;
  const modelNames: string[] = [];
  const modelGroupMap: TAzureModelGroupMap = {};
  const groupMap: TAzureGroupMap = {};
  const errors: (ZodError | string)[] = [];

  const result = azureGroupConfigsSchema.safeParse(configs);
  if (!result.success) {
    isValid = false;
    errors.push(errorsToString(result.error.errors));
  } else {
    for (const group of result.data) {
      const {
        group: groupName,
        apiKey,
        instanceName,
        deploymentName,
        version,
        baseURL,
        additionalHeaders,
        models,
      } = group;
      groupMap[groupName] = {
        apiKey,
        instanceName,
        deploymentName,
        version,
        baseURL,
        additionalHeaders,
        models,
      };

      for (const modelName in group.models) {
        modelNames.push(modelName);
        const model = group.models[modelName];

        if (typeof model === 'boolean') {
          // For boolean models, check if group-level deploymentName and version are present.
          if (!group.deploymentName || !group.version) {
            errors.push(
              `Model "${modelName}" in group "${groupName}" is missing a deploymentName or version.`,
            );
            return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
          }

          modelGroupMap[modelName] = {
            group: groupName,
          };
        } else {
          // For object models, check if deploymentName and version are required but missing.
          if (
            (!model.deploymentName && !group.deploymentName) ||
            (!model.version && !group.version)
          ) {
            errors.push(
              `Model "${modelName}" in group "${groupName}" is missing a required deploymentName or version.`,
            );
            return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
          }

          modelGroupMap[modelName] = {
            group: groupName,
            // deploymentName: model.deploymentName || group.deploymentName,
            // version: model.version || group.version,
          };
        }
      }
    }
  }

  return { isValid, modelNames, modelGroupMap, groupMap, errors };
}

export type AzureOptions = {
  azureOpenAIApiKey: string;
  azureOpenAIApiInstanceName: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
};

export function mapModelToAzureConfig({
  modelName,
  modelGroupMap,
  groupMap,
}: {
  modelName: string;
  modelGroupMap: TAzureModelGroupMap;
  groupMap: TAzureGroupMap;
}): AzureOptions {
  const modelConfig = modelGroupMap[modelName];
  if (!modelConfig) {
    throw new Error(`Model named "${modelName}" not found in configuration.`);
  }

  const groupConfig = groupMap[modelConfig.group];
  if (!groupConfig) {
    throw new Error(
      `Group "${modelConfig.group}" for model "${modelName}" not found in configuration.`,
    );
  }

  const modelDetails = groupConfig.models[modelName];
  const deploymentName =
    typeof modelDetails === 'object'
      ? modelDetails.deploymentName || groupConfig.deploymentName
      : groupConfig.deploymentName;
  const version =
    typeof modelDetails === 'object'
      ? modelDetails.version || groupConfig.version
      : groupConfig.version;

  const clientOptions: AzureOptions = {
    azureOpenAIApiKey: groupConfig.apiKey,
    azureOpenAIApiInstanceName: groupConfig.instanceName,
    azureOpenAIApiDeploymentName: deploymentName,
    azureOpenAIApiVersion: version,
  };

  return clientOptions;
}
