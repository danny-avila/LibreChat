const { logger } = require('@librechat/data-schemas');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Batch update documents in chunks to avoid timeouts on weak instances
 * @param {mongoose.Collection} collection - MongoDB collection
 * @param {Object} [options] - Optional configuration
 * @param {Function} [options.onProgress] - Progress callback (totalModified, collectionName) => void
 * @param {string} [options.collectionName] - Name for progress reporting
 * @returns {Promise<number>} - Total modified count
 * @throws {Error} - Throws if database operations fail (e.g., network issues, connection loss, permission problems)
 */
async function batchResetMeiliFlags(collection, options = {}) {
  const { onProgress, collectionName } = options;
  const BATCH_SIZE = parseEnvInt('MEILI_SYNC_BATCH_SIZE', 1000);
  const BATCH_DELAY_MS = parseEnvInt('MEILI_SYNC_DELAY_MS', 100);
  let totalModified = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const docs = await collection
        .find({ expiredAt: null, _meiliIndex: true }, { projection: { _id: 1 } })
        .limit(BATCH_SIZE)
        .toArray();

      if (docs.length === 0) {
        break;
      }

      const ids = docs.map((doc) => doc._id);
      const result = await collection.updateMany(
        { _id: { $in: ids } },
        { $set: { _meiliIndex: false } },
      );

      totalModified += result.modifiedCount;

      if (onProgress) {
        onProgress(totalModified, collectionName);
      }

      if (docs.length < BATCH_SIZE) {
        hasMore = false;
      }

      if (hasMore && BATCH_DELAY_MS > 0) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return totalModified;
  } catch (error) {
    throw new Error(
      `Failed to batch reset Meili flags for collection '${collectionName}' after processing ${totalModified} documents: ${error.message}`,
    );
  }
}

/**
 * Parse and validate an environment variable as a positive integer
 * @param {string} varName - Environment variable name
 * @param {number} defaultValue - Default value to use if invalid or missing
 * @returns {number} - Parsed value or default
 */
function parseEnvInt(varName, defaultValue) {
  const value = process.env[varName];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    logger.warn(
      `[batchResetMeiliFlags] Invalid value for ${varName}="${value}". Expected a positive integer. Using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  return parsed;
}

module.exports = {
  batchResetMeiliFlags,
};
