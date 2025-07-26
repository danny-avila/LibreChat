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
const { Prompt } = require('~/db/models');

async function migratePromptPermissions({ dryRun = true, batchSize = 100 } = {}) {
  await connect();

  logger.info('Starting Prompt Permissions Migration', { dryRun, batchSize });

  // Verify required roles exist
  const ownerRole = await findRoleByIdentifier('prompt_owner');
  const viewerRole = await findRoleByIdentifier('prompt_viewer');
  const editorRole = await findRoleByIdentifier('prompt_editor');

  if (!ownerRole || !viewerRole || !editorRole) {
    throw new Error('Required prompt roles not found. Run role seeding first.');
  }

  // Get global project prompt group IDs
  const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, ['promptGroupIds']);
  const globalPromptGroupIds = new Set(
    (globalProject?.promptGroupIds || []).map((id) => id.toString()),
  );

  logger.info(`Found ${globalPromptGroupIds.size} prompt groups in global project`);

  // Find prompts without ACL entries using DocumentDB-compatible approach
  const promptsToMigrate = await Prompt.aggregate([
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
                { $eq: ['$$aclEntry.resourceType', 'prompt'] },
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
      $lookup: {
        from: 'promptgroups',
        localField: 'groupId',
        foreignField: '_id',
        as: 'promptGroup',
      },
    },
    {
      $unwind: {
        path: '$promptGroup',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        prompt: 1,
        author: 1,
        groupId: 1,
        'promptGroup._id': 1,
        'promptGroup.projectIds': 1,
      },
    },
  ]);

  const categories = {
    globalViewAccess: [], // Prompt in global project group -> Public VIEW
    privatePrompts: [], // Not in global project -> Private (owner only)
  };

  promptsToMigrate.forEach((prompt) => {
    const isGlobalGroup =
      prompt.promptGroup && globalPromptGroupIds.has(prompt.promptGroup._id.toString());

    if (isGlobalGroup) {
      categories.globalViewAccess.push(prompt);
    } else {
      categories.privatePrompts.push(prompt);
    }
  });

  logger.info('Prompt categorization:', {
    globalViewAccess: categories.globalViewAccess.length,
    privatePrompts: categories.privatePrompts.length,
    total: promptsToMigrate.length,
  });

  if (dryRun) {
    return {
      migrated: 0,
      errors: 0,
      dryRun: true,
      summary: {
        globalViewAccess: categories.globalViewAccess.length,
        privatePrompts: categories.privatePrompts.length,
        total: promptsToMigrate.length,
      },
      details: {
        globalViewAccess: categories.globalViewAccess.map((p) => ({
          prompt: p.prompt?.substring(0, 50) + '...',
          _id: p._id,
          permissions: 'Owner + Public VIEW',
        })),
        privatePrompts: categories.privatePrompts.map((p) => ({
          prompt: p.prompt?.substring(0, 50) + '...',
          _id: p._id,
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
  for (let i = 0; i < promptsToMigrate.length; i += batchSize) {
    const batch = promptsToMigrate.slice(i, i + batchSize);

    logger.info(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(promptsToMigrate.length / batchSize)}`,
    );

    for (const prompt of batch) {
      try {
        const isGlobalGroup =
          prompt.promptGroup && globalPromptGroupIds.has(prompt.promptGroup._id.toString());

        // Always grant owner permission to author
        await grantPermission({
          principalType: 'user',
          principalId: prompt.author,
          resourceType: 'prompt',
          resourceId: prompt._id,
          accessRoleId: 'prompt_owner',
          grantedBy: prompt.author,
        });
        results.ownerGrants++;

        // Grant public view permissions for prompts in global project groups
        if (isGlobalGroup) {
          await grantPermission({
            principalType: 'public',
            principalId: null,
            resourceType: 'prompt',
            resourceId: prompt._id,
            accessRoleId: 'prompt_viewer',
            grantedBy: prompt.author,
          });
          results.publicViewGrants++;
        }

        results.migrated++;
        logger.debug(
          `Migrated prompt "${prompt.prompt?.substring(0, 30)}..." [${isGlobalGroup ? 'Global View' : 'Private'}]`,
          {
            promptId: prompt._id,
            author: prompt.author,
            isGlobalGroup,
          },
        );
      } catch (error) {
        results.errors++;
        logger.error(`Failed to migrate prompt "${prompt.prompt?.substring(0, 30)}..."`, {
          promptId: prompt._id,
          author: prompt.author,
          error: error.message,
        });
      }
    }

    // Brief pause between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info('Prompt migration completed', results);
  return results;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize =
    parseInt(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]) || 100;

  migratePromptPermissions({ dryRun, batchSize })
    .then((result) => {
      if (dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        console.log(`Total prompts to migrate: ${result.summary.total}`);
        console.log(`- Global View Access: ${result.summary.globalViewAccess} prompts`);
        console.log(`- Private Prompts: ${result.summary.privatePrompts} prompts`);

        if (result.details.globalViewAccess.length > 0) {
          console.log('\nGlobal View Access prompts (first 10):');
          result.details.globalViewAccess.slice(0, 10).forEach((prompt, i) => {
            console.log(`  ${i + 1}. "${prompt.prompt}" (${prompt._id})`);
          });
        }

        if (result.details.privatePrompts.length > 0) {
          console.log('\nPrivate prompts (first 10):');
          result.details.privatePrompts.slice(0, 10).forEach((prompt, i) => {
            console.log(`  ${i + 1}. "${prompt.prompt}" (${prompt._id})`);
          });
        }
      } else {
        console.log('\nMigration Results:', JSON.stringify(result, null, 2));
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Prompt migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migratePromptPermissions };
