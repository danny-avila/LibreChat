const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { loadYaml } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  logAgentMigrationWarning,
  logPromptMigrationWarning,
  checkAgentPermissionsMigration,
  checkPromptPermissionsMigration,
} = require('@librechat/api');
const { getProjectByName } = require('~/models/Project');
const { Agent, PromptGroup } = require('~/db/models');
const { findRoleByIdentifier } = require('~/models');

/**
 * Check if legacy YAML config contains OpenRouter endpoint
 * @returns {Object} Migration detection result
 */
function checkOpenRouterYamlConfig() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const configPath = process.env.CONFIG_PATH || path.resolve(projectRoot, 'librechat.yaml');

  const result = {
    yamlConfigExists: false,
    hasLegacyOpenRouter: false,
    hasNativeOpenRouter: false,
    openRouterConfigs: [],
    migrationNeeded: false,
  };

  // Check if YAML config file exists
  if (!fs.existsSync(configPath)) {
    logger.debug('[OpenRouter Migration] No librechat.yaml config file found');
    return result;
  }

  result.yamlConfigExists = true;

  try {
    // Load and parse YAML config
    const yamlConfig = loadYaml(configPath);

    if (!yamlConfig || !yamlConfig.endpoints || !yamlConfig.endpoints.custom) {
      logger.debug('[OpenRouter Migration] No custom endpoints found in YAML config');
      return result;
    }

    // Check for OpenRouter endpoints in custom endpoints
    const customEndpoints = yamlConfig.endpoints.custom || [];
    for (const endpoint of customEndpoints) {
      const isOpenRouter =
        endpoint.name?.toLowerCase().includes('openrouter') ||
        endpoint.baseURL?.includes('openrouter.ai') ||
        endpoint.apiKey?.includes('OPENROUTER');

      if (isOpenRouter) {
        result.hasLegacyOpenRouter = true;
        result.openRouterConfigs.push({
          name: endpoint.name,
          baseURL: endpoint.baseURL,
          apiKey: endpoint.apiKey,
          models: endpoint.models,
        });
      }
    }

    // Check if native OpenRouter provider is configured
    result.hasNativeOpenRouter = !!process.env.OPENROUTER_API_KEY;

    // Determine if migration is needed
    result.migrationNeeded = result.hasLegacyOpenRouter && !result.hasNativeOpenRouter;

    if (result.hasLegacyOpenRouter && result.hasNativeOpenRouter) {
      logger.warn(
        '⚠️  [OpenRouter Migration] Both YAML and native OpenRouter configurations detected. ' +
        'The native provider will take precedence. Consider removing YAML config to avoid confusion.'
      );
    }

  } catch (error) {
    logger.error('[OpenRouter Migration] Error parsing YAML config:', error);
  }

  return result;
}

/**
 * Log migration warnings and instructions for OpenRouter
 * @param {Object} migrationResult - Result from checkOpenRouterYamlConfig
 */
function logOpenRouterMigrationWarning(migrationResult) {
  if (!migrationResult.migrationNeeded && !migrationResult.hasLegacyOpenRouter) {
    return;
  }

  if (migrationResult.migrationNeeded) {
    logger.warn('\n' +
      '════════════════════════════════════════════════════════════════════════════\n' +
      '⚠️  OPENROUTER MIGRATION REQUIRED\n' +
      '════════════════════════════════════════════════════════════════════════════\n' +
      '\n' +
      'Legacy OpenRouter YAML configuration detected!\n' +
      '\n' +
      'The YAML-based OpenRouter configuration is deprecated and incompatible with\n' +
      'the new Agent system. Please migrate to the native OpenRouter provider.\n' +
      '\n' +
      'MIGRATION STEPS:\n' +
      '1. Set the following environment variables:\n' +
      '   - OPENROUTER_API_KEY=your_openrouter_api_key\n' +
      '   - OPENROUTER_SITE_URL=https://localhost:3080 (optional)\n' +
      '   - OPENROUTER_SITE_NAME=LibreChat (optional)\n' +
      '\n' +
      '2. Remove or comment out the OpenRouter section from librechat.yaml\n' +
      '\n' +
      '3. Restart the application\n' +
      '\n' +
      'BENEFITS OF MIGRATION:\n' +
      '✅ Full Agent system compatibility\n' +
      '✅ Model fallback chains\n' +
      '✅ Real-time credits tracking\n' +
      '✅ Auto Router support\n' +
      '✅ Better error handling and caching\n' +
      '\n' +
      'For detailed migration guide, see:\n' +
      'https://www.librechat.ai/docs/configuration/providers/openrouter\n' +
      '\n' +
      '════════════════════════════════════════════════════════════════════════════\n'
    );

    // Log detected configurations for debugging
    if (migrationResult.openRouterConfigs.length > 0) {
      logger.debug('[OpenRouter Migration] Detected configurations:');
      migrationResult.openRouterConfigs.forEach(config => {
        logger.debug(`  - Name: ${config.name}`);
        logger.debug(`    BaseURL: ${config.baseURL}`);
        logger.debug(`    Models: ${config.models?.fetch ? 'Dynamic fetch' : 'Static list'}`);
      });
    }
  }

  if (migrationResult.hasLegacyOpenRouter && migrationResult.hasNativeOpenRouter) {
    logger.info('\n' +
      '╔════════════════════════════════════════════════════════════════════════════╗\n' +
      '║ ℹ️  OPENROUTER CONFIGURATION NOTICE                                         ║\n' +
      '╚════════════════════════════════════════════════════════════════════════════╝\n' +
      '\n' +
      'Both YAML and native OpenRouter configurations are present.\n' +
      'The native provider (via OPENROUTER_API_KEY) is active.\n' +
      '\n' +
      'To complete migration and avoid confusion:\n' +
      '• Remove the OpenRouter section from librechat.yaml\n' +
      '• Or set it as "enabled: false" if you want to keep it for reference\n' +
      '\n'
    );
  }
}

/**
 * Check if permissions migrations are needed for shared resources
 * This runs at the end to ensure all systems are initialized
 */
async function checkMigrations() {
  // Check for OpenRouter migration first (synchronous)
  const openRouterMigrationResult = checkOpenRouterYamlConfig();
  logOpenRouterMigrationWarning(openRouterMigrationResult);
  try {
    const agentMigrationResult = await checkAgentPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
        getProjectByName,
      },
      AgentModel: Agent,
    });
    logAgentMigrationWarning(agentMigrationResult);
  } catch (error) {
    logger.error('Failed to check agent permissions migration:', error);
  }
  try {
    const promptMigrationResult = await checkPromptPermissionsMigration({
      mongoose,
      methods: {
        findRoleByIdentifier,
        getProjectByName,
      },
      PromptGroupModel: PromptGroup,
    });
    logPromptMigrationWarning(promptMigrationResult);
  } catch (error) {
    logger.error('Failed to check prompt permissions migration:', error);
  }
}

module.exports = {
  checkMigrations,
  checkOpenRouterYamlConfig,
  logOpenRouterMigrationWarning,
};
