import type { TAzureGroupConfigs } from '../src/config';
import { azureGroupConfigsSchema } from '../src/config';

export function validateAzureGroupConfigs(configs: TAzureGroupConfigs): {
  isValid: boolean;
  modelNames: string[];
} {
  try {
    const result = azureGroupConfigsSchema.safeParse(configs);
    if (!result.success) {
      // Basic structure is wrong, immediately return.
      return { isValid: false, modelNames: [] };
    }

    const modelNames: string[] = [];

    for (const group of result.data) {
      // Check if deploymentName and version are defined at the group level if a model is a boolean.
      for (const modelName in group.models) {
        // Collect model names
        modelNames.push(modelName);

        const model = group.models[modelName];
        if (typeof model === 'boolean') {
          // If model is boolean, check for deploymentName and version at group level.
          if (!group.deploymentName || !group.version) {
            return { isValid: false, modelNames };
          }
        } else {
          // If model is an object and does not define deploymentName or version, check group level.
          if (
            (!model.deploymentName && !group.deploymentName) ||
            (!model.version && !group.version)
          ) {
            return { isValid: false, modelNames };
          }
        }
      }
    }

    // If all checks are passed, the structure is valid.
    return { isValid: true, modelNames };
  } catch (error) {
    console.error(error);
    return { isValid: false, modelNames: [] }; // In case of unexpected error, mark as invalid.
  }
}
