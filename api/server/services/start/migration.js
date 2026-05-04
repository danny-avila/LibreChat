const mongoose = require('mongoose');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  logAgentMigrationWarning,
  logPromptMigrationWarning,
  checkAgentPermissionsMigration,
  checkPromptPermissionsMigration,
} = require('@librechat/api');
const { findRoleByIdentifier } = require('~/models');

/**
 * Check if permissions migrations are needed for shared resources
 * This runs at the end to ensure all systems are initialized
 */
async function checkMigrations() {
  try {
    const agentMigrationResult = await runAsSystem(() =>
      checkAgentPermissionsMigration({
        mongoose,
        methods: {
          findRoleByIdentifier,
        },
        AgentModel: mongoose.models.Agent,
      }),
    );
    logAgentMigrationWarning(agentMigrationResult);
  } catch (error) {
    logger.error('Failed to check agent permissions migration:', error);
  }
  try {
    const promptMigrationResult = await runAsSystem(() =>
      checkPromptPermissionsMigration({
        mongoose,
        methods: {
          findRoleByIdentifier,
        },
        PromptGroupModel: mongoose.models.PromptGroup,
      }),
    );
    logPromptMigrationWarning(promptMigrationResult);
  } catch (error) {
    logger.error('Failed to check prompt permissions migration:', error);
  }
}

module.exports = {
  checkMigrations,
};
