const { nanoid } = require('nanoid');
const { Tools } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Creates a function to handle search results and stream them as attachments
 * @param {import('http').ServerResponse} res - The HTTP server response object
 * @returns {function(SearchResult, GraphRunnableConfig): void} - Function that takes search results and returns or streams an attachment
 */
function createOnSearchResults(res) {
  /**
   * @param {SearchResult} results
   * @param {GraphRunnableConfig} runnableConfig
   */
  return function onSearchResults(results, runnableConfig) {
    logger.info(
      `[onSearchResults] user: ${runnableConfig.metadata.user_id} | thread_id: ${runnableConfig.metadata.thread_id} | run_id: ${runnableConfig.metadata.run_id}`,
      results,
    );

    if (!results.success) {
      logger.error(
        `[onSearchResults] user: ${runnableConfig.metadata.user_id} | thread_id: ${runnableConfig.metadata.thread_id} | run_id: ${runnableConfig.metadata.run_id} | error: ${results.error}`,
      );
      return;
    }

    const toolCallId = runnableConfig.toolCall.id;
    const turn = runnableConfig.toolCall?.turn ?? 0;
    const name = `${runnableConfig.toolCall.name}_${toolCallId}_${nanoid()}`;
    const attachment = {
      name,
      type: Tools.web_search,
      messageId: runnableConfig.metadata.run_id,
      toolCallId,
      conversationId: runnableConfig.metadata.thread_id,
      [Tools.web_search]: { turn, ...results.data },
    };
    if (!res.headersSent) {
      return attachment;
    }
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  };
}

module.exports = {
  createOnSearchResults,
};
