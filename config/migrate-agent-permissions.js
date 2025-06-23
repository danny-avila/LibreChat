//TODO: needs testing and validation before running in production
console.log('needs testing and validation before running in production...');
const path = require('path');
const { logger } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const connect = require('./connect');

const { grantPermission } = require('~/server/services/PermissionService');
const { getProjectByName } = require('~/models/Project');
const { findRoleByIdentifier } = require('~/models');
const { Agent } = require('~/db/models');

async function migrateAgentPermissionsEnhanced({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  logger.info('Starting Enhanced Agent Permissions Migration', { dryRun, batchSize });

  // Verify required roles exist
  const ownerRole = await findRoleByIdentifier('agent_owner');
  const viewerRole = await findRoleByIdentifier('agent_viewer');
  const editorRole = await findRoleByIdentifier('agent_editor');

  if (!ownerRole || !viewerRole || !editorRole) {
    throw new Error('Required roles not found. Run role seeding first.');
  }

  // Get global project agent IDs (stores agent.id, not agent._id)
  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['agentIds']);
  const globalAgentIds = new Set(globalProject?.agentIds || []);

  logger.info(`Found ${globalAgentIds.size} agents in global project`);

  // Find agents without ACL entries using DocumentDB-compatible approach
  const agentsToMigrate = await Agent.aggregate([
    {
      $lookup: {
        from: 'aclentries',
        localField: '_id',
        foreignField: 'resourceId',
        as: 'aclEntries',
      },
    },
    {
      $addFields: {
        userAclEntries: {
          $filter: {
            input: '$aclEntries',
            as: 'aclEntry',
            cond: {
              $and: [
                { $eq: ['$$aclEntry.resourceType', 'agent'] },
                { $eq: ['$$aclEntry.principalType', 'user'] },
              ],
            },
          },
        },
      },
    },
    {
      $match: {
        author: { $exists: true, $ne: null },
        userAclEntries: { $size: 0 },
      },
    },
    {
      $project: {
        _id: 1,
        id: 1,
        name: 1,
        author: 1,
        isCollaborative: 1,
      },
    },
  ]);

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

  logger.info('Agent categorization:', {
    globalEditAccess: categories.globalEditAccess.length,
    globalViewAccess: categories.globalViewAccess.length,
    privateAgents: categories.privateAgents.length,
    total: agentsToMigrate.length,
  });

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
          principalType: 'user',
          principalId: agent.author,
          resourceType: 'agent',
          resourceId: agent._id,
          accessRoleId: 'agent_owner',
          grantedBy: agent.author,
        });
        results.ownerGrants++;

        // Determine public permissions for global project agents only
        let publicRoleId = null;
        let description = 'Private';

        if (isGlobal) {
          if (isCollab) {
            // Global project + collaborative = Public EDIT access
            publicRoleId = 'agent_editor';
            description = 'Global Edit';
            results.publicEditGrants++;
          } else {
            // Global project + not collaborative = Public VIEW access
            publicRoleId = 'agent_viewer';
            description = 'Global View';
            results.publicViewGrants++;
          }

          // Grant public permission
          await grantPermission({
            principalType: 'public',
            principalId: null,
            resourceType: 'agent',
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
