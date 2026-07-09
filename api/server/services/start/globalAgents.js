const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { reconcileGlobalAgents } = require('@librechat/api');
const {
  grantPermission,
  deleteAclEntries,
  findRoleByIdentifier,
  findEntriesByResource,
} = require('~/models');

/**
 * Seed config-defined global agents (`endpoints.agents.globalAgents`) into the database.
 * Idempotent; safe to run on every boot. The reconciler manages its own tenant contexts.
 * @param {import('@librechat/data-schemas').AppConfig} appConfig
 */
async function seedGlobalAgents(appConfig) {
  try {
    await reconcileGlobalAgents({
      globalAgents: appConfig?.endpoints?.agents?.globalAgents,
      methods: { grantPermission, deleteAclEntries, findRoleByIdentifier, findEntriesByResource },
      AgentModel: mongoose.models.Agent,
    });
  } catch (error) {
    logger.error('[seedGlobalAgents] Failed to seed global agents:', error);
  }
}

module.exports = { seedGlobalAgents };
