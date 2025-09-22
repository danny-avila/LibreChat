import type { ZodError } from 'zod';
import type {
  TAzureGroups,
  TAzureGroupMap,
  TAzureModelGroupMap,
  TValidatedAzureConfig,
  TAzureConfigValidationResult,
} from '../src/config';
import { extractEnvVariable, envVarRegex } from '../src/utils';
import { azureGroupConfigsSchema } from '../src/config';
import { errorsToString } from '../src/parsers';

export const deprecatedAzureVariables = [
  /* "related to" precedes description text */
  { key: 'AZURE_OPENAI_DEFAULT_MODEL', description: 'setting a default model' },
  { key: 'AZURE_OPENAI_MODELS', description: 'setting models' },
  {
    key: 'AZURE_USE_MODEL_AS_DEPLOYMENT_NAME',
    description: 'using model names as deployment names',
  },
  { key: 'AZURE_API_KEY', description: 'setting a single Azure API key' },
  { key: 'AZURE_OPENAI_API_INSTANCE_NAME', description: 'setting a single Azure instance name' },
  {
    key: 'AZURE_OPENAI_API_DEPLOYMENT_NAME',
    description: 'setting a single Azure deployment name',
  },
  { key: 'AZURE_OPENAI_API_VERSION', description: 'setting a single Azure API version' },
  {
    key: 'AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME',
    description: 'setting a single Azure completions deployment name',
  },
  {
    key: 'AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME',
    description: 'setting a single Azure embeddings deployment name',
  },
  {
    key: 'PLUGINS_USE_AZURE',
    description: 'using Azure for Plugins',
  },
];

export const conflictingAzureVariables = [
  {
    key: 'INSTANCE_NAME',
  },
  {
    key: 'DEPLOYMENT_NAME',
  },
];

export function validateAzureGroups(configs: TAzureGroups): TAzureConfigValidationResult {
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
        instanceName = '',
        deploymentName = '',
        version = '',
        baseURL = '',
        additionalHeaders,
        models,
        serverless = false,
        ...rest
      } = group;

      if (groupMap[groupName]) {
        errors.push(`Duplicate group name detected: "${groupName}". Group names must be unique.`);
        return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
      }

      if (serverless && !baseURL) {
        errors.push(`Group "${groupName}" is serverless but missing mandatory "baseURL."`);
        return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
      }

      if (!instanceName && !serverless) {
        errors.push(
          `Group "${groupName}" is missing an "instanceName" for non-serverless configuration.`,
        );
        return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
      }

      groupMap[groupName] = {
        apiKey,
        instanceName,
        deploymentName,
        version,
        baseURL,
        additionalHeaders,
        models,
        serverless,
        ...rest,
      };

      for (const modelName in group.models) {
        modelNames.push(modelName);
        const model = group.models[modelName];

        if (modelGroupMap[modelName]) {
          errors.push(
            `Duplicate model name detected: "${modelName}". Model names must be unique across groups.`,
          );
          return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
        }

        if (serverless) {
          modelGroupMap[modelName] = {
            group: groupName,
          };
          continue;
        }

        const groupDeploymentName = group.deploymentName ?? '';
        const groupVersion = group.version ?? '';
        if (typeof model === 'boolean') {
          // For boolean models, check if group-level deploymentName and version are present.
          if (!groupDeploymentName || !groupVersion) {
            errors.push(
              `Model "${modelName}" in group "${groupName}" is missing a deploymentName or version.`,
            );
            return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
          }

          modelGroupMap[modelName] = {
            group: groupName,
          };
        } else {
          const modelDeploymentName = model.deploymentName ?? '';
          const modelVersion = model.version ?? '';
          // For object models, check if deploymentName and version are required but missing.
          if ((!modelDeploymentName && !groupDeploymentName) || (!modelVersion && !groupVersion)) {
            errors.push(
              `Model "${modelName}" in group "${groupName}" is missing a required deploymentName or version.`,
            );
            return { isValid: false, modelNames, modelGroupMap, groupMap, errors };
          }

          modelGroupMap[modelName] = {
            group: groupName,
            // deploymentName: modelDeploymentName || groupDeploymentName,
            // version: modelVersion || groupVersion,
          };
        }
      }
    }
  }

  return { isValid, modelNames, modelGroupMap, groupMap, errors };
}

type AzureOptions = {
  azureOpenAIApiKey: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
};

type MappedAzureConfig = {
  azureOptions: AzureOptions;
  baseURL?: string;
  headers?: Record<string, string>;
  serverless?: boolean;
};

export function mapModelToAzureConfig({
  modelName,
  modelGroupMap,
  groupMap,
}: Omit<TValidatedAzureConfig, 'modelNames'> & {
  modelName: string;
}): MappedAzureConfig {
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

  const instanceName = groupConfig.instanceName ?? '';

  if (!instanceName && groupConfig.serverless !== true) {
    throw new Error(
      `Group "${modelConfig.group}" is missing an instanceName for non-serverless configuration.`,
    );
  }

  const baseURL = groupConfig.baseURL ?? '';
  if (groupConfig.serverless === true && !baseURL) {
    throw new Error(
      `Group "${modelConfig.group}" is missing the required base URL for serverless configuration.`,
    );
  }

  if (groupConfig.serverless === true) {
    const result: MappedAzureConfig = {
      azureOptions: {
        azureOpenAIApiVersion: extractEnvVariable(groupConfig.version ?? ''),
        azureOpenAIApiKey: extractEnvVariable(groupConfig.apiKey),
      },
      baseURL: extractEnvVariable(baseURL),
      serverless: true,
    };

    const apiKeyValue = result.azureOptions.azureOpenAIApiKey;
    if (typeof apiKeyValue === 'string' && envVarRegex.test(apiKeyValue)) {
      throw new Error(`Azure configuration environment variable "${apiKeyValue}" was not found.`);
    }

    if (groupConfig.additionalHeaders) {
      result.headers = groupConfig.additionalHeaders;
    }

    return result;
  }

  if (!instanceName) {
    throw new Error(
      `Group "${modelConfig.group}" is missing an instanceName for non-serverless configuration.`,
    );
  }

  const modelDetails = groupConfig.models[modelName];
  const { deploymentName = '', version = '' } =
    typeof modelDetails === 'object'
      ? {
          deploymentName: modelDetails.deploymentName ?? groupConfig.deploymentName,
          version: modelDetails.version ?? groupConfig.version,
        }
      : {
          deploymentName: groupConfig.deploymentName,
          version: groupConfig.version,
        };

  if (!deploymentName || !version) {
    throw new Error(
      `Model "${modelName}" in group "${modelConfig.group}" is missing a deploymentName ("${deploymentName}") or version ("${version}").`,
    );
  }

  const azureOptions: AzureOptions = {
    azureOpenAIApiKey: extractEnvVariable(groupConfig.apiKey),
    azureOpenAIApiInstanceName: extractEnvVariable(instanceName),
    azureOpenAIApiDeploymentName: extractEnvVariable(deploymentName),
    azureOpenAIApiVersion: extractEnvVariable(version),
  };

  for (const value of Object.values(azureOptions)) {
    if (typeof value === 'string' && envVarRegex.test(value)) {
      throw new Error(`Azure configuration environment variable "${value}" was not found.`);
    }
  }

  const result: MappedAzureConfig = { azureOptions };

  if (baseURL) {
    result.baseURL = extractEnvVariable(baseURL);
  }

  if (groupConfig.additionalHeaders) {
    result.headers = groupConfig.additionalHeaders;
  }

  return result;
}

export function mapGroupToAzureConfig({
  groupName,
  groupMap,
}: {
  groupName: string;
  groupMap: TAzureGroupMap;
}): MappedAzureConfig {
  const groupConfig = groupMap[groupName];
  if (!groupConfig) {
    throw new Error(`Group named "${groupName}" not found in configuration.`);
  }

  const instanceName = groupConfig.instanceName ?? '';
  const serverless = groupConfig.serverless ?? false;
  const baseURL = groupConfig.baseURL ?? '';

  if (!instanceName && !serverless) {
    throw new Error(
      `Group "${groupName}" is missing an instanceName for non-serverless configuration.`,
    );
  }

  if (serverless && !baseURL) {
    throw new Error(
      `Group "${groupName}" is missing the required base URL for serverless configuration.`,
    );
  }

  const models = Object.keys(groupConfig.models);
  if (models.length === 0) {
    throw new Error(`Group "${groupName}" does not have any models configured.`);
  }

  // Use the first available model in the group
  const firstModelName = models[0];
  const modelDetails = groupConfig.models[firstModelName];

  const azureOptions: AzureOptions = {
    azureOpenAIApiVersion: extractEnvVariable(groupConfig.version ?? ''),
    azureOpenAIApiKey: extractEnvVariable(groupConfig.apiKey),
    azureOpenAIApiInstanceName: extractEnvVariable(instanceName),
    // DeploymentName and Version set below
  };

  if (serverless) {
    return {
      azureOptions,
      baseURL: extractEnvVariable(baseURL),
      serverless: true,
      ...(groupConfig.additionalHeaders && { headers: groupConfig.additionalHeaders }),
    };
  }

  const { deploymentName = '', version = '' } =
    typeof modelDetails === 'object'
      ? {
          deploymentName: modelDetails.deploymentName ?? groupConfig.deploymentName,
          version: modelDetails.version ?? groupConfig.version,
        }
      : {
          deploymentName: groupConfig.deploymentName,
          version: groupConfig.version,
        };

  if (!deploymentName || !version) {
    throw new Error(
      `Model "${firstModelName}" in group "${groupName}" or the group itself is missing a deploymentName ("${deploymentName}") or version ("${version}").`,
    );
  }

  azureOptions.azureOpenAIApiDeploymentName = extractEnvVariable(deploymentName);
  azureOptions.azureOpenAIApiVersion = extractEnvVariable(version);

  const result: MappedAzureConfig = { azureOptions };

  if (baseURL) {
    result.baseURL = extractEnvVariable(baseURL);
  }

  if (groupConfig.additionalHeaders) {
    result.headers = groupConfig.additionalHeaders;
  }

  return result;
}
