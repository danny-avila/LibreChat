import { logger } from '@librechat/data-schemas';
import { isEnabled, checkEmailConfig } from '~/utils';

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
 * Performs startup checks including environment variable validation and health checks.
 * This should be called during application startup before initializing services.
 * @param {Object} options
 * @param {Function} options.isEnabled - Function to check if a feature is enabled
 * @param {Function} options.checkEmailConfig - Function to check email configuration
 */
export async function performStartupChecks() {
  checkVariables();
  await checkHealth();
}
