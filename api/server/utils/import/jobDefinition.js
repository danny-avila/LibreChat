const fs = require('fs').promises;
const jobScheduler = require('~/server/utils/jobScheduler');
const { getImporter } = require('./importers');
const { indexSync } = require('~/lib/db');
const { logger } = require('~/config');

const IMPORT_CONVERSATION_JOB_NAME = 'import conversation';

/**
 * Job definition for importing a conversation.
 * @param {import('agenda').Job} job - The job object.
 * @param {Function} done - The done function.
 */
const importConversationJob = async (job, done) => {
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
    done();
  } catch (error) {
    logger.error(`user: ${requestUserId} | Failed to import conversation: `, error);
    done(error);
  } finally {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      logger.error(`user: ${requestUserId} | Failed to delete file: ${filepath}`, error);
    }
  }
};

// Call the jobScheduler.define function at startup
jobScheduler.define(IMPORT_CONVERSATION_JOB_NAME, importConversationJob);

module.exports = { IMPORT_CONVERSATION_JOB_NAME };
