import { logger, webSearchKeys } from '@librechat/data-schemas';
import { Constants, extractVariableName } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { isEnabled, checkEmailConfig } from '~/utils';
import { handleRateLimits } from './limits';

const secretDefaults = {
  CREDS_KEY: 'f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0',
  CREDS_IV: 'e2341419ec3dd3d19b13a1a87fafcbfb',
  JWT_SECRET: '16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef',
  JWT_REFRESH_SECRET: 'eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418',
};

const deprecatedVariables = [
  {
    key: 'CHECK_BALANCE',
    description:
      'Please use the `balance` field in the `librechat.yaml` config file instead.\nMore info: https://librechat.ai/docs/configuration/librechat_yaml/object_structure/balance#overview',
  },
  {
    key: 'START_BALANCE',
    description:
      'Please use the `balance` field in the `librechat.yaml` config file instead.\nMore info: https://librechat.ai/docs/configuration/librechat_yaml/object_structure/balance#overview',
  },
  {
    key: 'GOOGLE_API_KEY',
    description:
      'Please use the `GOOGLE_SEARCH_API_KEY` environment variable for the Google Search Tool instead.',
  },
];

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

/**
 * Checks the password reset configuration for security issues.
 */
function checkPasswordReset() {
  const emailEnabled = checkEmailConfig();
  const passwordResetAllowed = isEnabled(process.env.ALLOW_PASSWORD_RESET);

  if (!emailEnabled && passwordResetAllowed) {
    logger.warn(
      `❗❗❗

      Password reset is enabled with \`ALLOW_PASSWORD_RESET\` but email service is not configured.
      
      This setup is insecure as password reset links will be issued with a recognized email.
      
      Please configure email service for secure password reset functionality.
      
      https://www.librechat.ai/docs/configuration/authentication/email

      ❗❗❗`,
    );
  }
}

/**
 * Checks environment variables for default secrets and deprecated variables.
 * Logs warnings for any default secret values being used and for usage of deprecated variables.
 * Advises on replacing default secrets and updating deprecated variables.
 * @param {Object} options
 * @param {Function} options.isEnabled - Function to check if a feature is enabled
 * @param {Function} options.checkEmailConfig - Function to check email configuration
 */
export function checkVariables() {
  let hasDefaultSecrets = false;
  for (const [key, value] of Object.entries(secretDefaults)) {
    if (process.env[key] === value) {
      logger.warn(`Default value for ${key} is being used.`);
      if (!hasDefaultSecrets) {
        hasDefaultSecrets = true;
      }
    }
  }

  if (hasDefaultSecrets) {
    logger.info('Please replace any default secret values.');
    logger.info(`\u200B

    For your convenience, use this tool to generate your own secret values:
    https://www.librechat.ai/toolkit/creds_generator

    \u200B`);
  }

  deprecatedVariables.forEach(({ key, description }) => {
    if (process.env[key]) {
      logger.warn(`The \`${key}\` environment variable is deprecated. ${description}`);
    }
  });

  checkPasswordReset();
}

/**
 * Checks the health of auxiliary API's by attempting a fetch request to their respective `/health` endpoints.
 * Logs information or warning based on the API's availability and response.
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${process.env.RAG_API_URL}/health`);
    if (response?.ok && response?.status === 200) {
      logger.info(`RAG API is running and reachable at ${process.env.RAG_API_URL}.`);
    }
  } catch {
    logger.warn(
      `RAG API is either not running or not reachable at ${process.env.RAG_API_URL}, you may experience errors with file uploads.`,
    );
  }
}

/**
 * Checks for the usage of deprecated and conflicting Azure variables.
 * Logs warnings for any deprecated or conflicting environment variables found, indicating potential issues with `azureOpenAI` endpoint configuration.
 */
function checkAzureVariables() {
  deprecatedAzureVariables.forEach(({ key, description }) => {
    if (process.env[key]) {
      logger.warn(
        `The \`${key}\` environment variable (related to ${description}) should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you will experience conflicts and errors.`,
      );
    }
  });

  conflictingAzureVariables.forEach(({ key }) => {
    if (process.env[key]) {
      logger.warn(
        `The \`${key}\` environment variable should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you may experience with the defined placeholders for mapping to the current model grouping using the same name.`,
      );
    }
  });
}

export function checkInterfaceConfig(appConfig: AppConfig) {
  const interfaceConfig = appConfig.interfaceConfig;
  let i = 0;
  const logSettings = () => {
    // log interface object and model specs object (without list) for reference
    logger.warn(`\`interface\` settings:\n${JSON.stringify(interfaceConfig, null, 2)}`);
    logger.warn(
      `\`modelSpecs\` settings:\n${JSON.stringify(
        { ...(appConfig?.modelSpecs ?? {}), list: undefined },
        null,
        2,
      )}`,
    );
  };

  // warn about config.modelSpecs.prioritize if true and presets are enabled, that default presets will conflict with prioritizing model specs.
  if (appConfig?.modelSpecs?.prioritize && interfaceConfig?.presets) {
    logger.warn(
      "Note: Prioritizing model specs can conflict with default presets if a default preset is set. It's recommended to disable presets from the interface or disable use of a default preset.",
    );
    if (i === 0) i++;
  }

  // warn about config.modelSpecs.enforce if true and if any of these, endpointsMenu, modelSelect, presets, or parameters are enabled, that enforcing model specs can conflict with these options.
  if (
    appConfig?.modelSpecs?.enforce &&
    (interfaceConfig?.endpointsMenu ||
      interfaceConfig?.modelSelect ||
      interfaceConfig?.presets ||
      interfaceConfig?.parameters)
  ) {
    logger.warn(
      "Note: Enforcing model specs can conflict with the interface options: endpointsMenu, modelSelect, presets, and parameters. It's recommended to disable these options from the interface or disable enforcing model specs.",
    );
    if (i === 0) i++;
  }
  // warn if enforce is true and prioritize is not, that enforcing model specs without prioritizing them can lead to unexpected behavior.
  if (appConfig?.modelSpecs?.enforce && !appConfig?.modelSpecs?.prioritize) {
    logger.warn(
      "Note: Enforcing model specs without prioritizing them can lead to unexpected behavior. It's recommended to enable prioritizing model specs if enforcing them.",
    );
    if (i === 0) i++;
  }

  if (i > 0) {
    logSettings();
  }
}

/**
 * Performs startup checks including environment variable validation and health checks.
 * This should be called during application startup before initializing services.
 * @param [appConfig] - The application configuration object.
 */
export async function performStartupChecks(appConfig?: AppConfig) {
  checkVariables();
  if (appConfig?.endpoints?.azureOpenAI) {
    checkAzureVariables();
  }
  if (appConfig) {
    checkInterfaceConfig(appConfig);
  }
  if (appConfig?.config) {
    checkConfig(appConfig.config);
  }
  if (appConfig?.config?.webSearch) {
    checkWebSearchConfig(appConfig.config.webSearch);
  }
  if (appConfig?.config?.rateLimits) {
    handleRateLimits(appConfig.config.rateLimits);
  }
  await checkHealth();
}

/**
 * Performs basic checks on the loaded config object.
 * @param config - The loaded custom configuration.
 */
export function checkConfig(config: Partial<TCustomConfig>) {
  if (config.version !== Constants.CONFIG_VERSION) {
    logger.info(
      `\nOutdated Config version: ${config.version}
Latest version: ${Constants.CONFIG_VERSION}

      Check out the Config changelogs for the latest options and features added.

      https://www.librechat.ai/changelog\n\n`,
    );
  }
}

/**
 * Checks web search configuration values to ensure they are environment variable references.
 * Warns if actual API keys or URLs are used instead of environment variable references.
 * Logs debug information for properly configured environment variable references.
 * @param webSearchConfig - The loaded web search configuration object.
 */
export function checkWebSearchConfig(webSearchConfig?: Partial<TCustomConfig['webSearch']> | null) {
  if (!webSearchConfig) {
    return;
  }

  webSearchKeys.forEach((key) => {
    const value = webSearchConfig[key as keyof typeof webSearchConfig];

    if (typeof value === 'string') {
      const varName = extractVariableName(value);

      if (varName) {
        // This is a proper environment variable reference
        const actualValue = process.env[varName];
        if (actualValue) {
          logger.debug(`Web search ${key}: Using environment variable ${varName} with value set`);
        } else {
          logger.debug(
            `Web search ${key}: Using environment variable ${varName} (not set in environment, user provided value)`,
          );
        }
      } else {
        // This is not an environment variable reference - warn user
        logger.warn(
          `❗ Web search configuration error: ${key} contains an actual value instead of an environment variable reference.
          
          Current value: "${value.substring(0, 10)}..."
          
          This is incorrect! You should use environment variable references in your librechat.yaml file, such as:
          ${key}: "\${YOUR_ENV_VAR_NAME}"
          
          Then set the actual API key in your .env file or environment variables.
          
          More info: https://www.librechat.ai/docs/configuration/librechat_yaml/web_search`,
        );
      }
    }
  });
}
