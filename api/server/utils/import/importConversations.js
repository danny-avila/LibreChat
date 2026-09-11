const fs = require('fs').promises;
const { createConversationImportOperation, resolveImportMaxFileSize } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { getImporter } = require('./importers');
const { createImportBatchBuilder } = require('./importBatchBuilder');

const maxFileSize = resolveImportMaxFileSize();

const runConversationImport = createConversationImportOperation({
  statFile: (filepath) => fs.stat(filepath),
  readFile: (filepath, encoding) => fs.readFile(filepath, encoding),
  unlinkFile: (filepath) => fs.unlink(filepath),
  getImporter,
  createBuilder: (userId, interfaceConfig, filters, legacyPii) =>
    legacyPii == null
      ? createImportBatchBuilder(userId, interfaceConfig, filters)
      : createImportBatchBuilder(userId, interfaceConfig, filters, legacyPii),
  maxFileSize,
  onCleanupError: (error, filepath, requestUserId) => {
    logger.error(`user: ${requestUserId} | Failed to delete file: ${filepath}`, error);
  },
});

/** @param {import('@librechat/api').ConversationImportJob} job */
const importConversations = async (job) => {
  const { requestUserId } = job;
  try {
    logger.debug(`user: ${requestUserId} | Importing conversation(s) from file...`);
    await runConversationImport(job);
    logger.debug(`user: ${requestUserId} | Finished importing conversations`);
  } catch (error) {
    logger.error(`user: ${requestUserId} | Failed to import conversation: `, error);
    throw error;
  }
};

module.exports = importConversations;
