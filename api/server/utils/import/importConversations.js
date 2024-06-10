const fs = require('fs').promises;
const { getImporter } = require('./importers');
const { indexSync } = require('~/lib/db');
const { logger } = require('~/config');

/**
 * Job definition for importing a conversation.
 * @param {{ filepath, requestUserId }} job - The job object.
 * @param {Function} callback - The callback function.
 */
const importConversations = async (job, callback) => {
  const { filepath, requestUserId } = job.attrs.data;
  try {
    logger.debug(`user: ${requestUserId} | Importing conversation(s) from file...`);
    const fileData = await fs.readFile(filepath, 'utf8');
    const jsonData = JSON.parse(fileData);
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId);
    // Sync Meilisearch index
    await indexSync();
    logger.debug(`user: ${requestUserId} | Finished importing conversations`);
    callback();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Failed to import conversation: `, error);
    callback(error);
  } finally {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      logger.error(`user: ${requestUserId} | Failed to delete file: ${filepath}`, error);
    }
  }
};

module.exports = importConversations;
