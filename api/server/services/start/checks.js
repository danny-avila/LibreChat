const {
  Constants,
  webSearchKeys,
  deprecatedAzureVariables,
  conflictingAzureVariables,
  extractVariableName,
} = require('librechat-data-provider');
const { isEnabled, checkEmailConfig } = require('~/server/utils');
const { logger } = require('~/config');

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

/**
 * Checks environment variables for default secrets and deprecated variables.
 * Logs warnings for any default secret values being used and for usage of deprecated `GOOGLE_API_KEY`.
 * Advises on replacing default secrets and updating deprecated variables.
 */
function checkVariables() {
  let hasDefaultSecrets = false;
  for (const [key, value] of Object.entries(secretDefaults)) {
    if (process.env[key] === value) {
      logger.warn(`Default value for ${key} is being used.`);
      !hasDefaultSecrets && (hasDefaultSecrets = true);
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
async function checkHealth() {
  try {
    const response = await fetch(`${process.env.RAG_API_URL}/health`);
    if (response?.ok && response?.status === 200) {
      logger.info(`RAG API is running and reachable at ${process.env.RAG_API_URL}.`);
    }
  } catch (error) {
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

/**
 * Performs basic checks on the loaded config object.
 * @param {TCustomConfig} config - The loaded custom configuration.
 */
function checkConfig(config) {
  if (config.version !== Constants.CONFIG_VERSION) {
    logger.info(
      `\nOutdated Config version: ${config.version}
Latest version: ${Constants.CONFIG_VERSION}

      Check out the Config changelogs for the latest options and features added.

      https://www.librechat.ai/changelog\n\n`,
    );
  }
}

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
 * Checks web search configuration values to ensure they are environment variable references.
 * Warns if actual API keys or URLs are used instead of environment variable references.
 * Logs debug information for properly configured environment variable references.
 * @param {Object} webSearchConfig - The loaded web search configuration object.
 */
function checkWebSearchConfig(webSearchConfig) {
  if (!webSearchConfig) {
    return;
  }

  webSearchKeys.forEach((key) => {
    const value = webSearchConfig[key];

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

module.exports = {
  checkHealth,
  checkConfig,
  checkVariables,
  checkAzureVariables,
  checkWebSearchConfig,
};
