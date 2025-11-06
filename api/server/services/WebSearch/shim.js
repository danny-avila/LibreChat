const { nanoid } = require('nanoid');
const { Tools } = require('librechat-data-provider');
const { executeWebSearch } = require('./handler');
const { buildAttachmentPayload } = require('./utils');

const WEB_QUERY_PATTERN = /\[\[\s*WEB\s*:\s*(.+?)\s*\]\]/i;
const MAX_DEFAULT_RESULTS = 6;
const MAX_SHIM_INVOCATIONS = Number.parseInt(process.env.WEB_SHIM_MAX_INVOCATIONS ?? '2', 10);

const buildSummaryText = (query, docs = []) => {
  if (!docs.length) {
    return `Web search for "${query}" did not return any usable results.`;
  }

  const lines = docs.slice(0, 4).map((doc, index) => {
    const title = doc.title || doc.url;
    const snippet = (doc.snippet || doc.text || '').replace(/\s+/g, ' ').trim();
    const displaySnippet = snippet.length > 320 ? `${snippet.slice(0, 317)}…` : snippet;
    return `${index + 1}. ${title}\n${doc.url}\n${displaySnippet}`;
  });

  return [
    `Web search results for "${query}":`,
    lines.join('\n\n'),
    'Use these sources to ground your next response. Cite them using [number](url) format.',
  ]
    .filter(Boolean)
    .join('\n\n');
};

class WebSearchShim {
  constructor({ req, res, authResult, webSearchConfig, onSearchResults, onGetHighlights, logger }) {
    this.req = req;
    this.res = res;
    this.authResult = authResult;
    this.webSearchConfig = webSearchConfig;
    this.onSearchResults = onSearchResults;
    this.onGetHighlights = onGetHighlights;
    this.logger = logger;

    this.abortController = null;
    this.pendingQueries = [];
    this.invocationCount = 0;
    this.buffer = '';
    this.lastPayload = null;
  }

  setAbortController(abortController) {
    this.abortController = abortController;
  }

  resetBuffer() {
    this.buffer = '';
  }

  handleProgress({ accumulatedText, chunk, basePayload }) {
    this.buffer = accumulatedText;

    if (this.pendingQueries.length > 0) {
      return { skip: false, text: accumulatedText };
    }

    const match = accumulatedText.match(WEB_QUERY_PATTERN);
    if (!match) {
      return { skip: false, text: accumulatedText };
    }

    const query = match[1].trim();
    if (!query) {
      return { skip: false, text: accumulatedText };
    }

    const sanitizedText = accumulatedText.slice(0, match.index).trimEnd();
    this.buffer = sanitizedText;
    basePayload.text = sanitizedText;
    this.pendingQueries.push(query);
    this.lastPayload = basePayload;

    if (this.abortController && !this.abortController.signal.aborted) {
      const reason = { type: 'web_search_shim', query };
      try {
        this.abortController.abort(reason);
      } catch (error) {
        this.logger?.error?.('[WebSearchShim] Failed to abort controller', error);
      }
    }

    return { skip: true, text: sanitizedText };
  }

  shouldResume(error) {
    if (!this.abortController) {
      return false;
    }

    if (!error || error.name !== 'AbortError') {
      return false;
    }

    const reason = this.abortController.signal?.reason;
    return reason && reason.type === 'web_search_shim' && this.pendingQueries.length > 0;
  }

  async prepareNextRun({ client, userMessage, parentMessageId, opts }) {
    if (this.pendingQueries.length === 0) {
      return null;
    }

    if (this.invocationCount >= MAX_SHIM_INVOCATIONS) {
      this.logger?.warn?.('[WebSearchShim] Maximum shim invocations reached, skipping search.');
      this.pendingQueries = [];
      return null;
    }

    const query = this.pendingQueries.shift();
    this.invocationCount += 1;
    this.resetBuffer();

    try {
      const runnableConfig = {
        metadata: {
          user_id: this.req.user.id,
          thread_id: userMessage.conversationId,
          run_id: nanoid(),
        },
        toolCall: {
          id: `web_search_shim_${Date.now()}`,
          name: Tools.web_search,
          turn: 0,
        },
      };

      const searchResult = await executeWebSearch({
        input: {
          operation: 'search_and_read',
          query,
          k: this.webSearchConfig?.maxUrls ?? MAX_DEFAULT_RESULTS,
          max_chars_per_doc: this.webSearchConfig?.maxCharsPerDoc,
          allow_rerank: true,
        },
        authResult: this.authResult,
        webSearchConfig: this.webSearchConfig,
        onSearchResults: this.onSearchResults
          ? async (results) => this.onSearchResults(results, runnableConfig)
          : undefined,
        onGetHighlights: this.onGetHighlights,
        logger: this.logger,
      });

      const docs = searchResult?.docs ?? [];
      const summaryText = buildSummaryText(query, docs);

      const searchMessageId = nanoid();
      const summaryMessage = {
        messageId: searchMessageId,
        conversationId: userMessage.conversationId,
        parentMessageId: userMessage.messageId,
        sender: client.sender,
        text: summaryText,
        isCreatedByUser: false,
        endpoint: client.options.endpoint,
        model: client.getResponseModel(),
        metadata: {
          webSearch: {
            query,
            docs: docs.slice(0, 6).map(({ url, title, snippet, text, score }) => ({
              url,
              title,
              snippet,
              text,
              score,
            })),
          },
        },
      };

      client.currentMessages.push(summaryMessage);

      if (this.res && !this.res.headersSent) {
        const attachment = buildAttachmentPayload({
          results: docs,
          conversationId: summaryMessage.conversationId,
          messageId: searchMessageId,
          toolCallId: runnableConfig.toolCall.id,
          turn: runnableConfig.toolCall.turn ?? 0,
        });

        if (attachment) {
          this.res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
        }

        this.res.write(
          `event: message\ndata: ${JSON.stringify({
            message: summaryMessage,
            created: true,
          })}\n\n`,
        );
      }

      const databasePromise = client.saveMessageToDatabase(
        summaryMessage,
        opts.saveOptions,
        client.user,
      );
      client.savedMessageIds.add(summaryMessage.messageId);
      summaryMessage.databasePromise = databasePromise;

      const buildResult = await client.buildMessages(
        client.currentMessages,
        parentMessageId,
        client.getBuildMessagesOptions(opts),
        opts,
      );

      return {
        payload: buildResult.prompt,
        tokenCountMap: buildResult.tokenCountMap,
        promptTokens: buildResult.promptTokens,
      };
    } catch (error) {
      this.logger?.error?.('[WebSearchShim] Failed to execute shim search', error);
      this.pendingQueries = [];
      return null;
    }
  }

  reset() {
    this.pendingQueries = [];
    this.invocationCount = 0;
    this.resetBuffer();
    this.lastPayload = null;
  }
}

module.exports = {
  WebSearchShim,
};
