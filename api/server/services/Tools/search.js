const { nanoid } = require('nanoid');
const { Tools } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Creates a function to handle search results and stream them as attachments
 * @param {import('http').ServerResponse} res - The HTTP server response object
 * @returns {{ onSearchResults: function(SearchResult, GraphRunnableConfig): void; onGetHighlights: function(string): void}} - Function that takes search results and returns or streams an attachment
 */
function createOnSearchResults(res) {
  /** @type {Map<string, { type: 'organic' | 'topStories'; index: number; turn: number }>} */
  const sourceMap = new Map();

  /** @type {SearchResultData | undefined} */
  let searchResultData;
  /** @type {string} */
  let toolCallId;
  /** @type {string} */
  let attachmentName;
  /** @type {string} */
  let messageId;
  /** @type {string} */
  let conversationId;
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
    searchResultData = data;
    for (let i = 0; i < data.organic.length; i++) {
      const source = data.organic[i];
      if (source.link) {
        sourceMap.set(source.link, {
          type: 'organic',
          index: i,
          turn,
        });
      }
    }
    for (let i = 0; i < data.topStories.length; i++) {
      const source = data.topStories[i];
      if (source.link) {
        sourceMap.set(source.link, {
          type: 'topStories',
          index: i,
          turn,
        });
      }
    }

    toolCallId = runnableConfig.toolCall.id;
    messageId = runnableConfig.metadata.run_id;
    conversationId = runnableConfig.metadata.thread_id;
    attachmentName = `${runnableConfig.toolCall.name}_${toolCallId}_${nanoid()}`;
    const attachment = {
      messageId,
      toolCallId,
      conversationId,
      name: attachmentName,
      type: Tools.web_search,
      [Tools.web_search]: data,
    };
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
    const source = sourceMap.get(link);
    if (!source) {
      return;
    }
    const { type, index } = source;
    const data = searchResultData;
    if (!data) {
      return;
    }
    if (data[type][index] != null) {
      data[type][index].processed = true;
    }
    const attachment = {
      messageId,
      toolCallId,
      conversationId,
      name: attachmentName,
      type: Tools.web_search,
      [Tools.web_search]: data,
    };
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }

  return {
    onSearchResults,
    onGetHighlights,
  };
}

module.exports = {
  createOnSearchResults,
};
