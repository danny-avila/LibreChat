const fs = require('fs').promises;
const jobScheduler = require('~/server/utils/jobScheduler');
const { getImporter } = require('./importers');
const { indexSync } = require('~/lib/db');
const { logger } = require('~/config');
const { getAllConvos } = require('~/models/Conversation');
const { getMessages } = require('~/models');
const os = require('os');
const path = require('path');

const IMPORT_CONVERSATION_JOB_NAME = 'import conversation';
const EXPORT_CONVERSATION_JOB_NAME = 'export conversation';

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

/**
 * Create a temporary file and delete it after a delay.
 * @param {object} content - The content to write to the file.
 * @param {number} delay - The delay in milliseconds to delete the file.
 * @param {string} job - The job object.
 * @returns {Promise<string>} The temporary file path.
 */
async function createAndDeleteTempFile(content, delay, job) {
  const { requestUserId } = job.attrs.data;
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `export-${job.attrs._id}`);
  try {
    await fs.writeFile(tempFilePath, JSON.stringify(content));
    logger.debug(`user: ${requestUserId} | Created temporary file at: ${tempFilePath}`);
    setTimeout(async () => {
      try {
        await fs.unlink(tempFilePath);
        logger.debug(
          `user: ${requestUserId} | Automatically deleted temporary file at: ${tempFilePath}`,
        );
      } catch (error) {
        logger.error(
          `user: ${requestUserId} | Failed to automatically delete temporary file at: ${tempFilePath}`,
          error,
        );
      }
    }, delay);
    return tempFilePath;
  } catch (error) {
    logger.error(
      `user: ${requestUserId} | Error handling the temporary file: ${tempFilePath}`,
      error,
    );
  }
}

/**
 * Job definition for exporting all conversations.
 * @param {import('agenda').Job} job - The job object.
 * @param {Function} done - The done function.
 */
const exportConversationJob = async (job, done) => {
  const { requestUserId } = job.attrs.data;
  try {
    const convos = await getAllConvos(requestUserId);

    for (let i = 0; i < convos.conversations.length; i++) {
      const conversationId = convos.conversations[i].conversationId;
      convos.conversations[i].messages = await getMessages({ conversationId });
    }
    // Temporary file will be deleted from server after 5 minutes
    createAndDeleteTempFile(convos, 5 * 60 * 1000, job);
    done();
  } catch (error) {
    logger.error('Failed to export conversation: ', error);
    done(error);
  }
};

// Call the jobScheduler.define functions at startup
jobScheduler.define(IMPORT_CONVERSATION_JOB_NAME, importConversationJob);
jobScheduler.define(EXPORT_CONVERSATION_JOB_NAME, exportConversationJob);

module.exports = { IMPORT_CONVERSATION_JOB_NAME, EXPORT_CONVERSATION_JOB_NAME };
