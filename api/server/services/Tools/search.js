const { nanoid } = require('nanoid');
const { Tools } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');

/**
 * Creates a function to handle search results and stream them as attachments
 * @param {import('http').ServerResponse} res - The HTTP server response object
 * @returns {{ onSearchResults: function(SearchResult, GraphRunnableConfig): void; onGetHighlights: function(string): void}} - Function that takes search results and returns or streams an attachment
 */
function createOnSearchResults(res) {
  const context = {
    sourceMap: new Map(),
    searchResultData: undefined,
    toolCallId: undefined,
    attachmentName: undefined,
    messageId: undefined,
    conversationId: undefined,
  };

  /**
   * @param {SearchResult} results
   * @param {GraphRunnableConfig} runnableConfig
   */
  function onSearchResults(results, runnableConfig) {
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

    const turn = runnableConfig.toolCall?.turn ?? 0;
    const data = { turn, ...structuredClone(results.data ?? {}) };
    context.searchResultData = data;

    // Map sources to links
    for (let i = 0; i < data.organic.length; i++) {
      const source = data.organic[i];
      if (source.link) {
        context.sourceMap.set(source.link, {
          type: 'organic',
          index: i,
          turn,
        });
      }
    }
    for (let i = 0; i < data.topStories.length; i++) {
      const source = data.topStories[i];
      if (source.link) {
        context.sourceMap.set(source.link, {
          type: 'topStories',
          index: i,
          turn,
        });
      }
    }

    context.toolCallId = runnableConfig.toolCall.id;
    context.messageId = runnableConfig.metadata.run_id;
    context.conversationId = runnableConfig.metadata.thread_id;
    context.attachmentName = `${runnableConfig.toolCall.name}_${context.toolCallId}_${nanoid()}`;

    const attachment = buildAttachment(context);

    if (!res.headersSent) {
      return attachment;
    }
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }

  /**
   * @param {string} link
   * @returns {void}
   */
  function onGetHighlights(link) {
    const source = context.sourceMap.get(link);
    if (!source) {
      return;
    }
    const { type, index } = source;
    const data = context.searchResultData;
    if (!data) {
      return;
    }
    if (data[type][index] != null) {
      data[type][index].processed = true;
    }

    const attachment = buildAttachment(context);
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }

  return {
    onSearchResults,
    onGetHighlights,
  };
}

/**
 * Helper function to build an attachment object
 * @param {object} context - The context containing attachment data
 * @returns {object} - The attachment object
 */
function buildAttachment(context) {
  return {
    messageId: context.messageId,
    toolCallId: context.toolCallId,
    conversationId: context.conversationId,
    name: context.attachmentName,
    type: Tools.web_search,
    [Tools.web_search]: context.searchResultData,
  };
}

module.exports = {
  createOnSearchResults,
};
