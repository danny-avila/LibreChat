/**
 * Migration script to update existing banners to support the new multi-banner system.
 * This script:
 * 1. Finds all existing banners without audienceMode
 * 2. Sets default values for new fields
 * 3. Maintains backward compatibility
 *
 * Usage: node migrate-banners.js
 */

const mongoose = require('mongoose');
const connect = require('./connect');
const { Banner } = require('@librechat/data-schemas').createModels(mongoose);
const logger = require('./helpers').logger;

async function migrateBanners() {
  await connect();
  logger.info('[migrate-banners] Starting banner migration...');

  try {
    // Find all banners without audienceMode
    const existingBanners = await Banner.find({
      $or: [
        { audienceMode: { $exists: false } },
        { priority: { $exists: false } },
        { isActive: { $exists: false } },
      ],
    });

    logger.info(`[migrate-banners] Found ${existingBanners.length} banners to migrate`);

    let migratedCount = 0;

    for (const banner of existingBanners) {
      const updates = {};

      // Set audienceMode to 'global' if not set (backward compatibility)
      if (!banner.audienceMode) {
        updates.audienceMode = 'global';
      }

      // Set default priority if not set
      if (banner.priority === undefined) {
        updates.priority = 50;
      }

      // Set isActive to true if not set
      if (banner.isActive === undefined) {
        updates.isActive = true;
      }

      // Set order to 0 if not set
      if (banner.order === undefined) {
        updates.order = 0;
      }

      // Initialize counters to 0 if not set
      if (banner.viewCount === undefined) {
        updates.viewCount = 0;
      }

      if (banner.dismissCount === undefined) {
        updates.dismissCount = 0;
      }

      // Update the banner
      if (Object.keys(updates).length > 0) {
        await Banner.updateOne({ _id: banner._id }, { $set: updates });
        migratedCount++;
        logger.info(`[migrate-banners] Migrated banner ${banner.bannerId || banner._id}`);
      }
    }

    logger.info(`[migrate-banners] Successfully migrated ${migratedCount} banners`);
    logger.info('[migrate-banners] Migration completed successfully');

    return {
      success: true,
      total: existingBanners.length,
      migrated: migratedCount,
    };
  } catch (error) {
    logger.error('[migrate-banners] Migration failed:', error);
    throw error;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateBanners()
    .then((result) => {
      logger.info(`[migrate-banners] Result:`, result);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('[migrate-banners] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = migrateBanners;
