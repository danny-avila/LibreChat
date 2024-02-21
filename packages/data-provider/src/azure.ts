import type { ZodError } from 'zod';
import type { TAzureGroups, TAzureGroupMap, TAzureModelMapSchema } from '../src/config';
import { azureGroupConfigsSchema } from '../src/config';
import { errorsToString } from '../src/parsers';

export function validateAzureGroups(configs: TAzureGroups): {
  isValid: boolean;
  modelNames: string[];
  modelGroupMap: Record<string, TAzureModelMapSchema>;
  groupMap: Record<string, TAzureGroupMap>;
  errors: (ZodError | string)[];
} {
  let isValid = true;
  const modelNames: string[] = [];
  const modelGroupMap: Record<string, TAzureModelMapSchema> = {};
  const groupMap: Record<string, TAzureGroupMap> = {};
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
