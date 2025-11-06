const { z } = require('zod');
const { Tools } = require('librechat-data-provider');
const { tool } = require('@langchain/core/tools');
const { executeWebSearch } = require('~/server/services/WebSearch/handler');

const buildSummaryText = (query, docs = []) => {
  if (!docs.length) {
    return `Web search for "${query}" did not return any useful results. Consider asking the user to refine their query or provide more context.`;
  }

  const lines = docs.slice(0, 4).map((doc, index) => {
    const title = doc.title || doc.url;
    const snippet = (doc.snippet || doc.text || '').replace(/\s+/g, ' ').trim();
    const shortened = snippet.length > 300 ? `${snippet.slice(0, 297)}…` : snippet;
    return `[${index + 1}] ${title}\n${doc.url}\n${shortened}`;
  });

  return [
    `Web search results for "${query}":`,
    lines.join('\n\n'),
    'In your final response, reference these sources using bracketed numbers (e.g., [1]) and include the key findings.',
  ]
    .filter(Boolean)
    .join('\n\n');
};

const baseSearchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  k: z.number().int().min(1).max(10).optional(),
  max_chars_per_doc: z.number().int().min(1000).max(200000).optional(),
  allow_rerank: z.boolean().optional(),
});

const baseReadSchema = z.object({
  urls: z.array(z.string().url()).min(1, 'At least one URL is required'),
  max_chars_per_doc: z.number().int().min(1000).max(200000).optional(),
  allow_rerank: z.boolean().optional(),
});

const searchWithOperationSchema = baseSearchSchema.extend({
  operation: z.literal('search_and_read'),
});

const readWithOperationSchema = baseReadSchema.extend({
  operation: z.literal('read'),
});

const webSearchInputSchema = z.union([
  searchWithOperationSchema,
  readWithOperationSchema,
  baseSearchSchema,
  baseReadSchema,
  z
    .string()
    .min(1, 'Query is required')
    .transform((value) => value.trim()),
]);

const normalizeInput = (rawInput) => {
  const parsed = webSearchInputSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        'The web_search tool needs either a query string or a JSON object with `operation` + `query`/`urls`. Example: {"operation":"search_and_read","query":"best used cars"}',
    };
  }

  const value = parsed.data;
  const cleanedValue = typeof value === 'string' ? value.trim() : value;

  if (typeof cleanedValue === 'string') {
    if (!cleanedValue) {
      return {
        ok: false,
        message:
          'The web_search tool requires a non-empty query string. Example: {"operation":"search_and_read","query":"schedule of the 2024 olympics"}.',
      };
    }

    return {
      ok: true,
      value: {
        operation: 'search_and_read',
        query: cleanedValue,
      },
    };
  }

  if (cleanedValue.operation === 'search_and_read') {
    return {
      ok: true,
      value: cleanedValue,
    };
  }

  if (cleanedValue.operation === 'read') {
    return {
      ok: true,
      value: cleanedValue,
    };
  }

  if (cleanedValue.query) {
    const trimmedQuery = cleanedValue.query.trim();
    if (!trimmedQuery) {
      return {
        ok: false,
        message:
          'The web_search tool requires a non-empty query string. Example: {"operation":"search_and_read","query":"schedule of the 2024 olympics"}.',
      };
    }

    return {
      ok: true,
      value: {
        operation: 'search_and_read',
        query: trimmedQuery,
        k: cleanedValue.k,
        max_chars_per_doc: cleanedValue.max_chars_per_doc,
        allow_rerank: cleanedValue.allow_rerank,
      },
    };
  }

  if (Array.isArray(cleanedValue.urls)) {
    return {
      ok: true,
      value: {
        operation: 'read',
        urls: [...cleanedValue.urls],
        max_chars_per_doc: cleanedValue.max_chars_per_doc,
        allow_rerank: cleanedValue.allow_rerank,
      },
    };
  }

  return {
    ok: false,
    message:
      'Unable to determine the intent of the web_search call. Provide either {"operation":"search_and_read","query":"..."} or {"operation":"read","urls":["https://..."]}.',
  };
};

const createWebSearchTool = ({
  authResult,
  webSearchConfig,
  onSearchResults,
  onGetHighlights,
  onStatus,
  logger,
}) =>
  tool(
    async (input, runManager) => {
      const normalized = normalizeInput(input);
      if (!normalized.ok) {
        const warningText = `${normalized.message} No search was run.`;
        const artifactPayload = {
          turn: runManager?.config?.metadata?.turn ?? 0,
          organic: [],
          topStories: [],
          images: [],
          references: [],
          blocked: [],
          meta: {
            tookMs: 0,
            operation: 'invalid',
            totalDocs: 0,
            error: normalized.message,
            skipped: true,
          },
        };

        return [
          warningText,
          {
            [Tools.web_search]: artifactPayload,
          },
        ];
      }

      const result = await executeWebSearch({
        input: normalized.value,
        authResult,
        webSearchConfig,
        onSearchResults,
        onGetHighlights,
        onStatus,
        runManager,
        logger,
      });

      const docs = Array.isArray(result?.docs) ? result.docs : [];
      const query =
        normalized.value.operation === 'search_and_read'
          ? normalized.value.query ?? ''
          : Array.isArray(normalized.value.urls) && normalized.value.urls.length > 0
            ? normalized.value.urls[0]
            : '';
      const summaryText = result.error
        ? `Web search could not be completed: ${result.error}.`
        : buildSummaryText(query, docs);

      const organic = docs.map((doc, index) => ({
        title: doc.title || doc.url,
        link: doc.url,
        snippet: doc.snippet ?? '',
        text: doc.text ?? '',
        score: doc.score ?? null,
        processed: Boolean(doc.processed),
        rank: index + 1,
        lang: doc.lang ?? null,
      }));

      const artifactPayload = {
        turn: runManager?.config?.metadata?.turn ?? 0,
        organic,
        topStories: [],
        images: [],
        references: [],
        blocked: result?.blocked ?? [],
        meta: { ...(result?.meta ?? {}), error: result?.error ?? null },
      };

      return [
        summaryText,
        {
          [Tools.web_search]: artifactPayload,
        },
      ];
    },
    {
      name: Tools.web_search,
      description:
        'Use this tool to search the web or read provided URLs. The tool can perform `search_and_read` to search and gather information, or `read` to fetch and summarize the content of specific URLs.',
      schema: webSearchInputSchema,
      responseFormat: 'content_and_artifact',
    },
  );

module.exports = {
  createWebSearchTool,
};
