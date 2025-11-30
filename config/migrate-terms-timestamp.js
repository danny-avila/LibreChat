const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

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

  // Count users that need migration
  const usersToMigrate = await User.countDocuments({
    termsAccepted: true,
    $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
  });

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
    // Find all users that need migration and update them
    const cursor = User.find({
      termsAccepted: true,
      $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
    }).cursor();

    let migratedCount = 0;
    let errorCount = 0;

    for await (const user of cursor) {
      try {
        // Use createdAt as fallback for termsAcceptedAt
        const termsAcceptedAt = user.createdAt || new Date();
        await User.updateOne({ _id: user._id }, { $set: { termsAcceptedAt } });
        migratedCount++;

        if (migratedCount % 100 === 0) {
          console.yellow(`Migrated ${migratedCount} users...`);
        }
      } catch (error) {
        console.red(`Error migrating user ${user._id}: ${error.message}`);
        errorCount++;
      }
    }

    console.green(`Migration complete!`);
    console.green(`Successfully migrated: ${migratedCount} user(s)`);
    if (errorCount > 0) {
      console.red(`Errors encountered: ${errorCount}`);
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
