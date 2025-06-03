const fs = require('fs').promises;
const { getImporter } = require('./importers');
const { logger } = require('~/config');

/**
 * Job definition for importing a conversation.
 * @param {{ filepath, requestUserId }} job - The job object.
 */
const importConversations = async (job) => {
  const { filepath, requestUserId } = job;
  try {
    logger.debug(`user: ${requestUserId} | Importing conversation(s) from file...`);
    const fileData = await fs.readFile(filepath, 'utf8');
    const jsonData = JSON.parse(fileData);
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId);
    logger.debug(`user: ${requestUserId} | Finished importing conversations`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Failed to import conversation: `, error);
  } finally {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      logger.error(`user: ${requestUserId} | Failed to delete file: ${filepath}`, error);
    }
  }
};

module.exports = importConversations;
