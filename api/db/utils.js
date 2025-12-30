const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Batch update documents in chunks to avoid timeouts on weak instances
 * @param {mongoose.Collection} collection - MongoDB collection
 * @param {Object} [options] - Optional configuration
 * @param {Function} [options.onProgress] - Progress callback (totalModified, collectionName) => void
 * @param {string} [options.collectionName] - Name for progress reporting
 * @returns {Promise<number>} - Total modified count
 */
async function batchResetMeiliFlags(collection, options = {}) {
  const { onProgress, collectionName } = options;
  const BATCH_SIZE = parseInt(process.env.MEILI_SYNC_BATCH_SIZE) || 1000;
  const BATCH_DELAY_MS = parseInt(process.env.MEILI_SYNC_DELAY_MS) || 100;
  let totalModified = 0;
  let hasMore = true;

  while (hasMore) {
    const docs = await collection
      .find({ expiredAt: null, _meiliIndex: true }, { projection: { _id: 1 } })
      .limit(BATCH_SIZE)
      .toArray();

    if (docs.length === 0) {
      hasMore = false;
      break;
    }

    const ids = docs.map((doc) => doc._id);

    const result = await collection.updateMany(
      { _id: { $in: ids } },
      { $set: { _meiliIndex: false } },
    );

    totalModified += parseInt(result.modifiedCount);

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
}

module.exports = {
  batchResetMeiliFlags,
};
