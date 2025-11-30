const path = require('path');
const { logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { initializeRoles } = require('~/models');

/**
 * Migrate existing database to include BASIC and PRO tier roles
 * This will add the new roles if they don't exist or update their permissions if they do
 */
async function migrateTierRoles({ dryRun = true } = {}) {
  await connect();

  logger.info('Starting Tier Roles Migration (BASIC and PRO)', { dryRun });

  if (dryRun) {
    logger.info('DRY RUN: Would initialize/update BASIC and PRO roles');
    logger.info('The following roles will be ensured to exist with correct permissions:');
    logger.info('  - USER (existing, may be updated)');
    logger.info('  - ADMIN (existing, may be updated)');
    logger.info('  - BASIC (new tier role)');
    logger.info('  - PRO (new tier role)');

    return {
      dryRun: true,
      message: 'Dry run completed. Run without --dry-run to apply changes.',
    };
  }

  try {
    // This will create/update all system roles including BASIC and PRO
    await initializeRoles();

    logger.info('Tier roles migration completed successfully');
    logger.info('Roles initialized:');
    logger.info('  - USER role: ✓');
    logger.info('  - BASIC role: ✓');
    logger.info('  - PRO role: ✓');
    logger.info('  - ADMIN role: ✓');

    return {
      success: true,
      message: 'All tier roles have been initialized/updated successfully',
    };
  } catch (error) {
    logger.error('Tier roles migration failed', { error: error.message });
    throw error;
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  migrateTierRoles({ dryRun })
    .then((result) => {
      if (dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        console.log(result.message);
        console.log('\nTo run the actual migration, remove the --dry-run flag:');
        console.log('  npm run migrate:tier-roles');
      } else {
        console.log('\n=== MIGRATION COMPLETED ===');
        console.log(result.message);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Tier roles migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateTierRoles };
