const { Tools, SearchProviders, ScraperProviders, RerankerTypes } = require('librechat-data-provider');
const { logger: defaultLogger } = require('@librechat/data-schemas');
const { buildRuntimeConfig } = require('./config');
const { createLocalClient, searchLocal, fetchLocal, rerankLocal } = require('./local');
const { dedupeByPath, filterUnsafeUrls, normalizeUrl } = require('./filters');
const { truncateText, estimateTokens } = require('./utils');

const DEFAULT_MAX_CHARS = 20000;

const createRunnableMetadata = ({ runManager, toolCallId }) => {
  if (!runManager) {
    return undefined;
  }

  const config = runManager?.config ?? {};
  const metadata = config.metadata ?? {};

  return {
    metadata,
    toolCall: {
      id: toolCallId ?? runManager.runId ?? Tools.web_search,
      name: Tools.web_search,
      turn: metadata.turn ?? 0,
    },
  };
};

const buildDocsFromFetch = ({ fetchDocs, searchIndex, maxChars, rerankScores }) => {
  const docs = [];

  for (const item of fetchDocs) {
    const parsed = normalizeUrl(item.url);
    if (!parsed) {
      continue;
    }

    const normalizedUrl = parsed.toString();
    const metadata = searchIndex.get(normalizedUrl) ?? {};
    const snippet = metadata.snippet ?? item.snippet ?? '';
    const title = item.title ?? metadata.title ?? normalizedUrl;
    const truncatedText = truncateText(item.text, maxChars);

    docs.push({
      url: item.canonicalUrl ?? normalizedUrl,
      title,
      snippet,
      text: truncatedText,
      lang: item.lang ?? null,
      tokens: estimateTokens(truncatedText),
      score: rerankScores?.get(normalizedUrl) ?? item.score ?? null,
      fetchedAt: item.fetchedAt ?? new Date().toISOString(),
    });
  }

  return docs;
};

const mapSearchResults = (results = []) => {
  const searchIndex = new Map();
  const normalized = [];

  for (const result of results) {
    const parsed = normalizeUrl(result.url);
    if (!parsed) {
      continue;
    }
    const normalizedUrl = parsed.toString();
    if (searchIndex.has(normalizedUrl)) {
      continue;
    }

    const mapped = {
      url: normalizedUrl,
      title: result.title ?? normalizedUrl,
      snippet: result.snippet ?? '',
      rank: result.rank ?? normalized.length + 1,
      source: result.source ?? null,
      processed: false,
    };

    searchIndex.set(normalizedUrl, mapped);
    normalized.push(mapped);
  }

  return { searchIndex, normalized };
};

const runLocalSearchPipeline = async ({
  query,
  operation,
  urls = [],
  k,
  maxChars,
  allowRerank,
  runtimeConfig,
  onSearchResults,
  onGetHighlights,
  onStatus,
  runManager,
  log,
}) => {
  const client = createLocalClient({
    baseURL: runtimeConfig.search.baseURL,
    timeoutMs: runtimeConfig.timeoutMs,
  });

  let searchResults = [];
  let searchIndex = new Map();

  onStatus?.({
    phase: operation === 'search_and_read' ? 'search:init' : 'read:init',
    message:
      operation === 'search_and_read'
        ? `SearxNG: searching for "${query}"`
        : 'ws-local: fetching provided URLs',
    query,
    total: operation === 'search_and_read' ? undefined : urls.length,
    current: 0,
  });

  let errorMessage = null;

  onStatus?.({
    phase: operation === 'search_and_read' ? 'search:init' : 'read:init',
    message:
      operation === 'search_and_read'
        ? `SearxNG: searching for "${query}"`
        : 'ws-local: fetching provided URLs',
    query,
    total: operation === 'read' ? urls.length : undefined,
    current: 0,
  });

  if (operation === 'search_and_read') {
    try {
      const searchResponse = await searchLocal({
        client,
        query,
        maxResults: k,
        safeSearch: runtimeConfig.safeSearch,
      });

      const { searchIndex: mappedIndex, normalized } = mapSearchResults(searchResponse?.results);
      const deduped = dedupeByPath(normalized).slice(0, k);
      searchResults = deduped;
      searchIndex = mappedIndex;

      onStatus?.({
        phase: 'search:complete',
        message: `SearxNG: retrieved ${deduped.length} result${deduped.length === 1 ? '' : 's'}`,
        query,
        total: deduped.length,
        current: deduped.length,
      });

      if (typeof onSearchResults === 'function' && deduped.length > 0) {
        const runnableConfig = createRunnableMetadata({
          runManager,
          toolCallId: runManager?.runId,
        });
        try {
          await onSearchResults(
            {
              success: true,
              data: {
                organic: deduped,
                topStories: [],
              },
            },
            runnableConfig,
          );
        } catch (err) {
          log.error('[WebSearch.local] onSearchResults handler failed', err);
        }
      }

      urls = deduped.map((item) => item.url);
    } catch (error) {
      errorMessage = error?.message ?? 'Search service unavailable';
      onStatus?.({
        phase: 'error',
        message: `Search error: ${errorMessage}`,
        query,
        done: true,
      });
      return {
        docs: [],
        blocked: [],
        searchResults,
        error: errorMessage,
      };
    }
  } else {
    searchResults = urls.map((url, index) => ({
      url,
      rank: index + 1,
      title: url,
      snippet: '',
      processed: false,
    }));
    searchIndex = new Map(
      searchResults.map((item) => [
        item.url,
        {
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          rank: item.rank,
          processed: false,
        },
      ]),
    );
  }

  const { allowed, blocked } = filterUnsafeUrls(urls);
  if (blocked.length > 0) {
    onStatus?.({
      phase: 'fetch:blocked',
      message: `ws-local: blocked ${blocked.length} URL${blocked.length === 1 ? '' : 's'} by safety rules`,
      blocked: blocked.length,
      query,
    });
  }

  onStatus?.({
    phase: 'fetch:init',
    message:
      allowed.length > 0
        ? `ws-local: fetching ${allowed.length} page${allowed.length === 1 ? '' : 's'}`
        : 'ws-local: no URLs to fetch after filtering',
    total: allowed.length,
    current: 0,
    query,
  });

  let fetchResponse = { docs: [] };
  if (allowed.length > 0) {
    try {
      fetchResponse = await fetchLocal({
        client,
        urls: allowed,
        maxBytes: maxChars * 2,
      });
    } catch (error) {
      errorMessage = error?.message ?? 'Fetch service unavailable';
      onStatus?.({
        phase: 'error',
        message: `Fetch error: ${errorMessage}`,
        query,
        total: allowed.length,
        current: 0,
        done: true,
      });
      return {
        docs: [],
        blocked,
        searchResults,
        error: errorMessage,
      };
    }
  }

  const fetchDocs = Array.isArray(fetchResponse?.docs) ? fetchResponse.docs : [];
  const rerankScores = new Map();

  if (fetchDocs.length > 0) {
    fetchDocs.forEach((doc, index) => {
      onStatus?.({
        phase: 'fetch:progress',
        message: `ws-local: extracted ${doc.title || doc.url}`,
        url: doc.url,
        total: fetchDocs.length,
        current: Math.min(index + 1, fetchDocs.length),
        query,
      });
    });
  } else {
    onStatus?.({
      phase: 'fetch:progress',
      message: 'ws-local: no readable content retrieved',
      total: 0,
      current: 0,
      query,
    });
  }

  if (
    allowRerank &&
    runtimeConfig.rerank.kind === RerankerTypes.LOCAL &&
    fetchDocs.length > 0 &&
    operation === 'search_and_read'
  ) {
    onStatus?.({
      phase: 'rerank:init',
      message: 'Reranking documents locally',
      total: fetchDocs.length,
      current: 0,
      query,
    });
    try {
      const rerankResponse = await rerankLocal({
        client,
        query,
        docs: fetchDocs.map((doc) => ({
          url: doc.url,
          title: doc.title,
          text: doc.text,
          snippet: doc.snippet,
        })),
      });

      const rerankedDocs = Array.isArray(rerankResponse?.docs) ? rerankResponse.docs : [];
      for (const doc of rerankedDocs) {
        const parsed = normalizeUrl(doc.url);
        if (!parsed) {
          continue;
        }
        rerankScores.set(parsed.toString(), doc.score ?? null);
      }
      onStatus?.({
        phase: 'rerank:complete',
        message: 'Reranking complete',
        total: fetchDocs.length,
        current: fetchDocs.length,
        query,
      });
    } catch (err) {
      log.warn('[WebSearch.local] Rerank failed, continuing without scores', err);
      onStatus?.({
        phase: 'error',
        message: `Rerank error: ${err?.message ?? 'unknown error'}`,
        total: fetchDocs.length,
        current: fetchDocs.length,
        query,
      });
    }
  }

  onStatus?.({
    phase: 'fetch:complete',
    message: `ws-local: processed ${fetchDocs.length} document${fetchDocs.length === 1 ? '' : 's'}`,
    total: fetchDocs.length,
    current: fetchDocs.length,
    blocked: blocked.length,
    query,
  });

  if (typeof onGetHighlights === 'function') {
    for (const doc of fetchDocs) {
      if (!doc?.url) {
        continue;
      }
      try {
        await onGetHighlights(doc.url);
      } catch (err) {
        log.warn('[WebSearch.local] onGetHighlights handler failed', err);
      }
    }
  }

  const docs = buildDocsFromFetch({
    fetchDocs,
    searchIndex,
    maxChars,
    rerankScores,
  });

  if (allowRerank && rerankScores.size > 0) {
    docs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  return {
    docs,
    blocked,
    searchResults,
    error: errorMessage,
  };
};

const normalizeInputParams = (input) => {
  const operation = input.operation ?? 'search_and_read';
  const maxChars = Number.isFinite(input.max_chars_per_doc)
    ? Math.min(Math.max(input.max_chars_per_doc, 2000), 200000)
    : DEFAULT_MAX_CHARS;
  const k = Number.isFinite(input.k) ? Math.max(1, input.k) : 6;
  const allowRerank = input.allow_rerank !== false;

  return {
    ...input,
    operation,
    maxChars,
    k,
    allowRerank,
  };
};

const executeWebSearch = async ({
  input,
  authResult,
  webSearchConfig,
  onSearchResults,
  onGetHighlights,
  onStatus,
  runManager,
  logger = defaultLogger,
}) => {
  const runtimeConfig = buildRuntimeConfig({ authResult, webSearchConfig });
  const log = logger.child ? logger.child({ module: 'WebSearchTool' }) : logger;
  const params = normalizeInputParams(input);
  const metadata = runManager?.config?.metadata ?? {};
  const baseStatus = {
    conversationId: metadata.thread_id ?? null,
    messageId: metadata.run_id ?? null,
    toolCallId: runManager?.config?.toolCall?.id ?? runManager?.runId ?? Tools.web_search,
  };
  const emitStatus =
    typeof onStatus === 'function'
      ? (status) => {
          try {
            onStatus({
              ...baseStatus,
              timestamp: status?.timestamp ?? Date.now(),
              ...status,
            });
          } catch (error) {
            log.warn('[WebSearch] Failed to emit status update', error);
          }
        }
      : null;

  if (
    runtimeConfig.search.kind !== SearchProviders.LOCAL ||
    runtimeConfig.scraper.kind !== ScraperProviders.LOCAL
  ) {
    throw new Error('Local WebSearch configuration required for this handler');
  }

  if (!runtimeConfig.search.baseURL) {
    throw new Error('Local WebSearch base URL is not configured');
  }

  const k = Math.min(params.k, runtimeConfig.maxUrls);

  if (params.operation === 'search_and_read') {
    if (!params.query || typeof params.query !== 'string') {
      throw new Error('Query is required for search_and_read');
    }
  } else if (params.operation === 'read') {
    if (!Array.isArray(params.urls) || params.urls.length === 0) {
      throw new Error('At least one URL is required for read');
    }
  } else {
    throw new Error(`Unsupported operation: ${params.operation}`);
  }

  const start = Date.now();
  emitStatus?.({
    phase: 'start',
    message:
      params.operation === 'search_and_read'
        ? `Preparing to search the web for "${params.query}"`
        : 'Preparing to fetch provided URLs',
    query: params.query,
    total: params.operation === 'read' ? params.urls?.length : undefined,
    current: 0,
  });

  const result = await runLocalSearchPipeline({
    query: params.query,
    operation: params.operation,
    urls: params.urls,
    k,
    maxChars: params.maxChars,
    allowRerank: params.allowRerank,
    runtimeConfig,
    onSearchResults,
    onGetHighlights,
    onStatus: emitStatus,
    runManager,
    log,
  });

  const elapsed = Date.now() - start;

  if (result.error) {
    emitStatus?.({
      phase: 'error',
      message: `Web search failed: ${result.error}`,
      query: params.query,
      total: result.docs.length,
      current: result.docs.length,
      blocked: result.blocked?.length ?? 0,
      done: true,
    });
  } else {
    emitStatus?.({
      phase: 'complete',
      message: 'Web search complete',
      query: params.query,
      total: result.docs.length,
      current: result.docs.length,
      blocked: result.blocked?.length ?? 0,
      done: true,
    });
  }

  return {
    docs: result.docs,
    blocked: result.blocked,
    meta: {
      tookMs: elapsed,
      operation: params.operation,
      totalDocs: result.docs.length,
      error: result.error ?? null,
    },
    error: result.error ?? null,
  };
};

module.exports = {
  executeWebSearch,
};
