const { getImporter } = require('./importers');
const { logger } = require('~/config');
const jobScheduler = require('~/server/utils/jobScheduler');
const { indexSync } = require('~/lib/db');

const IMPORT_CONVERSATION_JOB_NAME = 'import conversation';

/**
 * Job definition for importing a conversation.
 */
const importConversationJob = async (job, done) => {
  const { data, requestUserId } = job.attrs.data;
  try {
    logger.info('Importing conversation...');
    const jsonData = JSON.parse(data);
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId);
    //sync meilisearch index
    await indexSync();
    logger.info('Finished importing conversations');
    done();
  } catch (error) {
    logger.error('Failed to import conversation: ', error);
    done(error);
  }
};

// Call the jobScheduler.define function at startup
jobScheduler.define(IMPORT_CONVERSATION_JOB_NAME, importConversationJob);

module.exports = { IMPORT_CONVERSATION_JOB_NAME };
