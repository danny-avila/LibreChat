const {
  Constants,
  deprecatedAzureVariables,
  conflictingAzureVariables,
} = require('librechat-data-provider');
const { logger } = require('~/config');

const secretDefaults = {
  CREDS_KEY: 'f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0',
  CREDS_IV: 'e2341419ec3dd3d19b13a1a87fafcbfb',
  JWT_SECRET: '16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef',
  JWT_REFRESH_SECRET: 'eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418',
};

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

  if (process.env.GOOGLE_API_KEY) {
    logger.warn(
      'The `GOOGLE_API_KEY` environment variable is deprecated.\nPlease use the `GOOGLE_SEARCH_API_KEY` environment variable instead.',
    );
  }

  if (process.env.OPENROUTER_API_KEY) {
    logger.warn(
      `The \`OPENROUTER_API_KEY\` environment variable is deprecated and its functionality will be removed soon.
      Use of this environment variable is highly discouraged as it can lead to unexpected errors when using custom endpoints.
      Please use the config (\`librechat.yaml\`) file for setting up OpenRouter, and use \`OPENROUTER_KEY\` or another environment variable instead.`,
    );
  }
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

module.exports = { checkVariables, checkHealth, checkConfig, checkAzureVariables };
