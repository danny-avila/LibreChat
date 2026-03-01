const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  try {
    ({ logger } = require('@librechat/data-schemas'));
  } catch (_) {
    logger = console;
  }
}

const HISTORY_SOURCES = [
  {
    role: 'product',
    envKeys: [
      'AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX',
      'AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX_NAME',
      'AZURE_AI_SEARCH_HISTORY_INDEX',
    ],
    interestingFields: [
      'supersedes',
      'superseded_by',
      'replacement_sku',
      'replacementSku',
      'replaces',
      'replaced_by',
      'special_run',
      'specialRun',
      'status',
      'notes',
      'note',
      'summary',
    ],
  },
  {
    role: 'engine',
    envKeys: ['AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX', 'AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX_NAME'],
    interestingFields: ['engine', 'hp', 'horsepower', 'notes', 'summary', 'changes'],
  },
];

const SERVICE_ENDPOINT_ENV = 'AZURE_AI_SEARCH_SERVICE_ENDPOINT';
const API_KEY_ENV = 'AZURE_AI_SEARCH_API_KEY';

const clientCache = new Map();
const historyCache = new Map();

const toIterableResults = async (resultSet) => {
  if (!resultSet) {
    return [];
  }

  const iterable = resultSet.results ?? resultSet;

  if (iterable && typeof iterable[Symbol.asyncIterator] === 'function') {
    const collected = [];
    for await (const entry of iterable) {
      collected.push(entry);
    }
    return collected;
  }

  if (Array.isArray(iterable)) {
    return iterable;
  }

  if (iterable && typeof iterable[Symbol.iterator] === 'function') {
    return Array.from(iterable);
  }

  return [];
};

const stringValue = (value) => {
  if (value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (entry == null ? null : String(entry).trim()))
      .filter((entry) => entry)
      .join(', ')
      .trim();
  }
  return String(value).trim();
};

const resolveIndexName = (source) => {
  for (const key of source.envKeys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return undefined;
};

const getSearchClient = (source) => {
  const indexName = resolveIndexName(source);
  if (!indexName) {
    return null;
  }

  if (clientCache.has(indexName)) {
    return clientCache.get(indexName);
  }

  const endpoint = process.env[SERVICE_ENDPOINT_ENV];
  const apiKey = process.env[API_KEY_ENV];

  if (!endpoint || !apiKey) {
    return null;
  }

  try {
    const client = new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey));
    clientCache.set(indexName, client);
    return client;
  } catch (error) {
    const reason = error?.message || String(error);
    logger?.warn?.(
      `[woodland-sku-history] Failed to create search client for ${indexName}: ${reason}`,
    );
    return null;
  }
};

const buildHistoryMessage = (source, doc) => {
  if (!doc || typeof doc !== 'object') {
    return undefined;
  }

  const title = stringValue(doc.title || doc.product_name || doc.name);
  const interesting = [];

  source.interestingFields.forEach((field) => {
    const value = doc[field];
    const rendered = stringValue(value);
    if (rendered) {
      interesting.push(`${field}: ${rendered}`);
    }
  });

  if (interesting.length === 0 && !title) {
    return undefined;
  }

  if (interesting.length === 0) {
    return `${source.role} history reference: ${title}`;
  }

  const summary = interesting.slice(0, 3).join('; ');
  if (title) {
    return `${source.role} history — ${title}: ${summary}`;
  }
  return `${source.role} history: ${summary}`;
};

const searchHistory = async (source, sku) => {
  const client = getSearchClient(source);
  if (!client) {
    return undefined;
  }

  try {
    const rawResults = await client.search(String(sku), {
      top: 3,
      queryType: 'simple',
      searchMode: 'all',
    });

    const messages = [];
    const results = await toIterableResults(rawResults);

    for (const result of results) {
      const doc = result?.document ?? result;
      if (!doc) {
        continue;
      }
      const message = buildHistoryMessage(source, doc);
      if (message) {
        messages.push(message);
      }
    }

    if (messages.length > 0) {
      return messages.join(' | ');
    }
  } catch (error) {
    const details = error?.message || String(error);
    const status = error?.statusCode ? ` (status ${error.statusCode})` : '';
    logger?.warn?.(`[woodland-sku-history] Search failed for ${source.role}${status}: ${details}`);
  }

  return undefined;
};

const resolveSkuHistory = async (sku) => {
  if (!sku) {
    return undefined;
  }

  const key = String(sku).trim();
  const start = Date.now();
  const cached = historyCache.get(key);
  if (cached !== undefined) {
    logger?.debug?.(`[woodland-sku-history] Cache hit for ${key} after ${Date.now() - start}ms`);
    return cached;
  }

  if (historyCache.has(key)) {
    return historyCache.get(key);
  }

  const messages = [];

  for (const source of HISTORY_SOURCES) {
    const message = await searchHistory(source, key);
    if (message) {
      messages.push(message);
    }
  }

  const merged = messages.length > 0 ? messages.join(' || ') : undefined;
  historyCache.set(key, merged);
  logger?.debug?.(
    `[woodland-sku-history] Lookup complete for ${key}; hits=${messages.length}; durationMs=${
      Date.now() - start
    }`,
  );
  return merged;
};

module.exports = {
  resolveSkuHistory,
};
