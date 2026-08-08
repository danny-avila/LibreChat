const path = require('path');
const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const {
  createMethods,
  createModels,
  getMCPAuthorityConsistencyModule,
  runAsSystem,
} = require('@librechat/data-schemas');
const { User } = createModels(mongoose);
const { countUsers } = createMethods(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const getLogStores = require('~/cache/getLogStores');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');
const migrateTermsTimestamps = require('./migrate-terms-timestamp-operation');

/**
 * Migration script for Terms Acceptance Timestamp Tracking
 *
 * This script migrates existing users who have termsAccepted: true but no termsAcceptedAt timestamp.
 * For these users, it sets termsAcceptedAt to their account creation date (createdAt) as a fallback.
 *
 * Usage: npm run migrate:terms-timestamp
 */
(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Migrate Terms Acceptance Timestamps');
  console.purple('--------------------------');

  // Count users that need migration. This script spans every tenant, so run
  // it under system context or the tenant isolation plugin throws under
  // TENANT_ISOLATION_STRICT=true and scopes to a non-existent tenant otherwise.
  const usersToMigrate = await runAsSystem(() =>
    countUsers({
      termsAccepted: true,
      $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
    }),
  );

  if (usersToMigrate === 0) {
    console.green(
      'No users need migration. All users with termsAccepted: true already have a termsAcceptedAt timestamp.',
    );
    silentExit(0);
  }

  console.yellow(
    `Found ${usersToMigrate} user(s) with termsAccepted: true but no termsAcceptedAt timestamp.`,
  );
  console.yellow(
    'These users will have their termsAcceptedAt set to their account creation date (createdAt).',
  );

  const confirm = await askQuestion('Are you sure you want to proceed? (y/n): ');

  if (confirm.toLowerCase() !== 'y') {
    console.yellow('Operation cancelled.');
    silentExit(0);
  }

  try {
    // Scan and update across every tenant under system context, matching the
    // other cross-tenant migrations, so the tenant isolation plugin does not
    // throw or scope queries to a non-existent tenant.
    const result = await runAsSystem(async () => {
      const users = User.find({
        termsAccepted: true,
        $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
      }).cursor();
      return await migrateTermsTimestamps({
        users,
        userModel: User,
        authority: getMCPAuthorityConsistencyModule(mongoose),
        authUserCache: getLogStores(CacheKeys.AUTH_USER_DOC),
        onMissingCreatedAt: (userId) =>
          console.yellow(
            `Warning: User ${userId} has no createdAt, using current date for termsAcceptedAt`,
          ),
        onProgress: (migratedCount) => {
          if (migratedCount % 100 === 0) {
            console.yellow(`Migrated ${migratedCount} users...`);
          }
        },
      });
    });

    console.green(`Migration complete!`);
    console.green(`Successfully migrated: ${result.migratedCount} user(s)`);
    if (result.skippedCount > 0) {
      console.yellow(
        `Skipped ${result.skippedCount} user(s) whose terms state changed during migration.`,
      );
    }
    for (const { userId, error } of result.errors) {
      console.red(`Error migrating user ${userId}: ${error.message}`);
    }
    if (result.errors.length > 0) {
      console.red(`Errors encountered: ${result.errors.length}`);
      silentExit(1);
    }
  } catch (error) {
    console.red('Error during migration:', error);
    silentExit(1);
  }

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
