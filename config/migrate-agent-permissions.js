const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { ensureRequiredCollectionsExist } = require('@librechat/api');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { grantPermission } = require('~/server/services/PermissionService');
const { getProjectByName } = require('~/models/Project');
const { findRoleByIdentifier } = require('~/models');
const { Agent, AclEntry } = require('~/db/models');

async function migrateAgentPermissionsEnhanced({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  logger.info('Starting Enhanced Agent Permissions Migration', { dryRun, batchSize });

  const mongoose = require('mongoose');
  /** @type {import('mongoose').mongo.Db | undefined} */
  const db = mongoose.connection.db;
  if (db) {
    await ensureRequiredCollectionsExist(db);
  }

  // Verify required roles exist
  const ownerRole = await findRoleByIdentifier(AccessRoleIds.AGENT_OWNER);
  const viewerRole = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
  const editorRole = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);

  if (!ownerRole || !viewerRole || !editorRole) {
    throw new Error('Required roles not found. Run role seeding first.');
  }

  // Get global project agent IDs (stores agent.id, not agent._id)
  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['agentIds']);
  const globalAgentIds = new Set(globalProject?.agentIds || []);

  logger.info(`Found ${globalAgentIds.size} agents in global project`);

  const migratedAgentIds = await AclEntry.distinct('resourceId', {
    resourceType: ResourceType.AGENT,
    principalType: PrincipalType.USER,
  });

  const agentsToMigrate = await Agent.find({
    _id: { $nin: migratedAgentIds },
    author: { $exists: true, $ne: null },
  })
    .select('_id id name author isCollaborative')
    .lean();

  const categories = {
    globalEditAccess: [], // Global project + collaborative -> Public EDIT
    globalViewAccess: [], // Global project + not collaborative -> Public VIEW
    privateAgents: [], // Not in global project -> Private (owner only)
  };

  agentsToMigrate.forEach((agent) => {
    const isGlobal = globalAgentIds.has(agent.id);
    const isCollab = agent.isCollaborative;

    if (isGlobal && isCollab) {
      categories.globalEditAccess.push(agent);
    } else if (isGlobal && !isCollab) {
      categories.globalViewAccess.push(agent);
    } else {
      categories.privateAgents.push(agent);

      // Log warning if private agent claims to be collaborative
      if (isCollab) {
        logger.warn(
          `Agent "${agent.name}" (${agent.id}) has isCollaborative=true but is not in global project`,
        );
      }
    }
  });

  logger.info(
    'Agent categorization:\n' +
      JSON.stringify(
        {
          globalEditAccess: categories.globalEditAccess.length,
          globalViewAccess: categories.globalViewAccess.length,
          privateAgents: categories.privateAgents.length,
          total: agentsToMigrate.length,
        },
        null,
        2,
      ),
  );

  if (dryRun) {
    return {
      migrated: 0,
      errors: 0,
      dryRun: true,
      summary: {
        globalEditAccess: categories.globalEditAccess.length,
        globalViewAccess: categories.globalViewAccess.length,
        privateAgents: categories.privateAgents.length,
        total: agentsToMigrate.length,
      },
      details: {
        globalEditAccess: categories.globalEditAccess.map((a) => ({
          name: a.name,
          id: a.id,
          permissions: 'Owner + Public EDIT',
        })),
        globalViewAccess: categories.globalViewAccess.map((a) => ({
          name: a.name,
          id: a.id,
          permissions: 'Owner + Public VIEW',
        })),
        privateAgents: categories.privateAgents.map((a) => ({
          name: a.name,
          id: a.id,
          permissions: 'Owner only',
        })),
      },
    };
  }

  const results = {
    migrated: 0,
    errors: 0,
    publicViewGrants: 0,
    publicEditGrants: 0,
    ownerGrants: 0,
  };

  // Process in batches
  for (let i = 0; i < agentsToMigrate.length; i += batchSize) {
    const batch = agentsToMigrate.slice(i, i + batchSize);

    logger.info(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(agentsToMigrate.length / batchSize)}`,
    );

    for (const agent of batch) {
      try {
        const isGlobal = globalAgentIds.has(agent.id);
        const isCollab = agent.isCollaborative;

        // Always grant owner permission to author
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: agent.author,
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          accessRoleId: AccessRoleIds.AGENT_OWNER,
          grantedBy: agent.author,
        });
        results.ownerGrants++;

        // Determine public permissions for global project agents only
        let publicRoleId = null;
        let description = 'Private';

        if (isGlobal) {
          if (isCollab) {
            // Global project + collaborative = Public EDIT access
            publicRoleId = AccessRoleIds.AGENT_EDITOR;
            description = 'Global Edit';
            results.publicEditGrants++;
          } else {
            // Global project + not collaborative = Public VIEW access
            publicRoleId = AccessRoleIds.AGENT_VIEWER;
            description = 'Global View';
            results.publicViewGrants++;
          }

          // Grant public permission
          await grantPermission({
            principalType: PrincipalType.PUBLIC,
            principalId: null,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            accessRoleId: publicRoleId,
            grantedBy: agent.author,
          });
        }

        results.migrated++;
        logger.debug(`Migrated agent "${agent.name}" [${description}]`, {
          agentId: agent.id,
          author: agent.author,
          isGlobal,
          isCollab,
          publicRole: publicRoleId,
        });
      } catch (error) {
        results.errors++;
        logger.error(`Failed to migrate agent "${agent.name}"`, {
          agentId: agent.id,
          author: agent.author,
          error: error.message,
        });
      }
    }

    // Brief pause between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info('Enhanced migration completed', results);
  return results;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 100;

  migrateAgentPermissionsEnhanced({ dryRun, batchSize })
    .then((result) => {
      if (dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        console.log(`Total agents to migrate: ${result.summary.total}`);
        console.log(`- Global Edit Access: ${result.summary.globalEditAccess} agents`);
        console.log(`- Global View Access: ${result.summary.globalViewAccess} agents`);
        console.log(`- Private Agents: ${result.summary.privateAgents} agents`);

        if (result.details.globalEditAccess.length > 0) {
          console.log('\nGlobal Edit Access agents:');
          result.details.globalEditAccess.forEach((agent, i) => {
            console.log(`  ${i + 1}. "${agent.name}" (${agent.id})`);
          });
        }

        if (result.details.globalViewAccess.length > 0) {
          console.log('\nGlobal View Access agents:');
          result.details.globalViewAccess.forEach((agent, i) => {
            console.log(`  ${i + 1}. "${agent.name}" (${agent.id})`);
          });
        }

        if (result.details.privateAgents.length > 0) {
          console.log('\nPrivate agents:');
          result.details.privateAgents.forEach((agent, i) => {
            console.log(`  ${i + 1}. "${agent.name}" (${agent.id})`);
          });
        }
      } else {
        console.log('\nMigration Results:', JSON.stringify(result, null, 2));
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Enhanced migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAgentPermissionsEnhanced };
