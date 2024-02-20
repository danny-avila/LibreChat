import type { TAzureGroupConfigs, TAzureGroupMap, TAzureModelMapSchema } from '../src/config';
import { azureGroupConfigsSchema } from '../src/config';

export function validateAzureGroupConfigs(configs: TAzureGroupConfigs): {
  isValid: boolean;
  modelNames: string[];
  modelGroupMap: Record<string, TAzureModelMapSchema>;
  groupMap: Record<string, TAzureGroupMap>;
} {
  let isValid = true;
  const modelNames: string[] = [];
  const modelGroupMap: Record<string, TAzureModelMapSchema> = {};
  const groupMap: Record<string, TAzureGroupMap> = {};

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
            return { isValid: false, modelNames, modelGroupMap, groupMap };
          }
        } else {
          // For object models, check if deploymentName and version are required but missing.
          if (
            (!model.deploymentName && !group.deploymentName) ||
            (!model.version && !group.version)
          ) {
            return { isValid: false, modelNames, modelGroupMap, groupMap };
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

  return { isValid, modelNames, modelGroupMap, groupMap };
}
