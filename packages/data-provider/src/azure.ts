import type { TAzureGroupConfigs, TAzureBaseSchema, TModelMapSchema } from '../src/config';
import { azureGroupConfigsSchema } from '../src/config';

export function validateAzureGroupConfigs(configs: TAzureGroupConfigs): {
  isValid: boolean;
  modelNames: string[];
  modelConfigMap: Record<string, TModelMapSchema>;
  groupMap: Record<string, TAzureBaseSchema>;
} {
  let isValid = true;
  const modelNames: string[] = [];
  const modelConfigMap: Record<string, TModelMapSchema> = {};
  const groupMap: Record<string, TAzureBaseSchema> = {};

  const result = azureGroupConfigsSchema.safeParse(configs);
  if (!result.success) {
    isValid = false;
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
      } = group;
      groupMap[groupName] = {
        apiKey,
        instanceName,
        deploymentName,
        version,
        baseURL,
        additionalHeaders,
      };

      for (const modelName in group.models) {
        modelNames.push(modelName);
        const model = group.models[modelName];

        if (typeof model === 'boolean') {
          // For boolean models, check if group-level deploymentName and version are present.
          if (!group.deploymentName || !group.version) {
            return { isValid: false, modelNames, modelConfigMap, groupMap };
          }
        } else {
          // For object models, check if deploymentName and version are required but missing.
          if (
            (!model.deploymentName && !group.deploymentName) ||
            (!model.version && !group.version)
          ) {
            return { isValid: false, modelNames, modelConfigMap, groupMap };
          }

          modelConfigMap[modelName] = {
            group: groupName,
            deploymentName: model.deploymentName || group.deploymentName,
            version: model.version || group.version,
          };
        }
      }
    }
  }

  return { isValid, modelNames, modelConfigMap, groupMap };
}
