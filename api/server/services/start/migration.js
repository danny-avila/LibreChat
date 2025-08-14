const { logger } = require('@librechat/data-schemas');
const { logAgentMigrationWarning, checkAgentPermissionsMigration } = require('@librechat/api');
const { getProjectByName } = require('~/models/Project');
const { findRoleByIdentifier } = require('~/models');
const { Agent } = require('~/db/models');

/**
 * Check if agent permissions migration is needed
 * This runs at the end to ensure all systems are initialized
 */
async function checkMigrations() {
  try {
    const migrationResult = await checkAgentPermissionsMigration({
      db: {
        findRoleByIdentifier,
        getProjectByName,
      },
      AgentModel: Agent,
    });
    logAgentMigrationWarning(migrationResult);
  } catch (error) {
    logger.error('Failed to check agent permissions migration:', error);
  }
}

module.exports = {
  checkMigrations,
};
