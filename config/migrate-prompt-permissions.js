const path = require('path');
const { logger } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const connect = require('./connect');

const { grantPermission } = require('~/server/services/PermissionService');
const { getProjectByName } = require('~/models/Project');
const { findRoleByIdentifier } = require('~/models');
const { PromptGroup } = require('~/db/models');

async function migrateToPromptGroupPermissions({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  logger.info('Starting PromptGroup Permissions Migration', { dryRun, batchSize });

  // Verify required roles exist
  const ownerRole = await findRoleByIdentifier('promptGroup_owner');
  const viewerRole = await findRoleByIdentifier('promptGroup_viewer');
  const editorRole = await findRoleByIdentifier('promptGroup_editor');

  if (!ownerRole || !viewerRole || !editorRole) {
    throw new Error('Required promptGroup roles not found. Run role seeding first.');
  }

  // Get global project prompt group IDs
  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['promptGroupIds']);
  const globalPromptGroupIds = new Set(
    (globalProject?.promptGroupIds || []).map((id) => id.toString()),
  );

  logger.info(`Found ${globalPromptGroupIds.size} prompt groups in global project`);

  // Find promptGroups without ACL entries
  const promptGroupsToMigrate = await PromptGroup.aggregate([
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
        promptGroupAclEntries: {
          $filter: {
            input: '$aclEntries',
            as: 'aclEntry',
            cond: {
              $and: [
                { $eq: ['$$aclEntry.resourceType', 'promptGroup'] },
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
        promptGroupAclEntries: { $size: 0 },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        author: 1,
        authorName: 1,
        category: 1,
      },
    },
  ]);

  const categories = {
    globalViewAccess: [], // PromptGroup in global project -> Public VIEW
    privateGroups: [], // Not in global project -> Private (owner only)
  };

  promptGroupsToMigrate.forEach((group) => {
    const isGlobalGroup = globalPromptGroupIds.has(group._id.toString());

    if (isGlobalGroup) {
      categories.globalViewAccess.push(group);
    } else {
      categories.privateGroups.push(group);
    }
  });

  logger.info('PromptGroup categorization:', {
    globalViewAccess: categories.globalViewAccess.length,
    privateGroups: categories.privateGroups.length,
    total: promptGroupsToMigrate.length,
  });

  if (dryRun) {
    return {
      migrated: 0,
      errors: 0,
      dryRun: true,
      summary: {
        globalViewAccess: categories.globalViewAccess.length,
        privateGroups: categories.privateGroups.length,
        total: promptGroupsToMigrate.length,
      },
      details: {
        globalViewAccess: categories.globalViewAccess.map((g) => ({
          name: g.name,
          _id: g._id,
          category: g.category || 'uncategorized',
          permissions: 'Owner + Public VIEW',
        })),
        privateGroups: categories.privateGroups.map((g) => ({
          name: g.name,
          _id: g._id,
          category: g.category || 'uncategorized',
          permissions: 'Owner only',
        })),
      },
    };
  }

  const results = {
    migrated: 0,
    errors: 0,
    publicViewGrants: 0,
    ownerGrants: 0,
  };

  // Process in batches
  for (let i = 0; i < promptGroupsToMigrate.length; i += batchSize) {
    const batch = promptGroupsToMigrate.slice(i, i + batchSize);

    logger.info(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(promptGroupsToMigrate.length / batchSize)}`,
    );

    for (const group of batch) {
      try {
        const isGlobalGroup = globalPromptGroupIds.has(group._id.toString());

        // Always grant owner permission to author
        await grantPermission({
          principalType: 'user',
          principalId: group.author,
          resourceType: 'promptGroup',
          resourceId: group._id,
          accessRoleId: 'promptGroup_owner',
          grantedBy: group.author,
        });
        results.ownerGrants++;

        // Grant public view permissions for promptGroups in global project
        if (isGlobalGroup) {
          await grantPermission({
            principalType: 'public',
            principalId: null,
            resourceType: 'promptGroup',
            resourceId: group._id,
            accessRoleId: 'promptGroup_viewer',
            grantedBy: group.author,
          });
          results.publicViewGrants++;
        }

        results.migrated++;
        logger.debug(
          `Migrated promptGroup "${group.name}" [${isGlobalGroup ? 'Global View' : 'Private'}]`,
          {
            groupId: group._id,
            author: group.author,
            isGlobalGroup,
          },
        );
      } catch (error) {
        results.errors++;
        logger.error(`Failed to migrate promptGroup "${group.name}"`, {
          groupId: group._id,
          author: group.author,
          error: error.message,
        });
      }
    }

    // Brief pause between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info('PromptGroup migration completed', results);
  return results;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 100;

  migrateToPromptGroupPermissions({ dryRun, batchSize })
    .then((result) => {
      if (dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        console.log(`Total promptGroups to migrate: ${result.summary.total}`);
        console.log(`- Global View Access: ${result.summary.globalViewAccess} promptGroups`);
        console.log(`- Private PromptGroups: ${result.summary.privateGroups} promptGroups`);

        if (result.details.globalViewAccess.length > 0) {
          console.log('\nGlobal View Access promptGroups (first 10):');
          result.details.globalViewAccess.slice(0, 10).forEach((group, i) => {
            console.log(`  ${i + 1}. "${group.name}" [${group.category}] (${group._id})`);
          });
        }

        if (result.details.privateGroups.length > 0) {
          console.log('\nPrivate promptGroups (first 10):');
          result.details.privateGroups.slice(0, 10).forEach((group, i) => {
            console.log(`  ${i + 1}. "${group.name}" [${group.category}] (${group._id})`);
          });
        }

        console.log('\nTo run the actual migration, remove the --dry-run flag');
      } else {
        console.log('\nMigration Results:', JSON.stringify(result, null, 2));
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('PromptGroup migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToPromptGroupPermissions };
