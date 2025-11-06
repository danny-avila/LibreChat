const {
  SearchProviders,
  ScraperProviders,
  RerankerTypes,
  SafeSearchTypes,
} = require('librechat-data-provider');

const DEFAULT_MAX_URLS = Number.parseInt(process.env.WEB_SEARCH_MAX_URLS ?? '10', 10);
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.WEB_SEARCH_TIMEOUT_MS ?? '30000', 10);
const DEFAULT_WS_LOCAL_BASE_URL = process.env.WS_LOCAL_BASE_URL ?? 'http://ws-local:7001';

const normalizeEnum = (value, enumObject) => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const lowerValue = value.toLowerCase();
  return Object.values(enumObject).find((item) => item.toLowerCase() === lowerValue);
};

const resolveProvider = ({ envValue, authValue, fallback, enumObject }) => {
  return (
    normalizeEnum(envValue, enumObject) ??
    normalizeEnum(authValue, enumObject) ??
    fallback
  );
};

const buildRuntimeConfig = ({ authResult = {}, webSearchConfig = {} }) => {
  const searchProvider = resolveProvider({
    envValue: process.env.WEB_SEARCH_PROVIDER,
    authValue: authResult.searchProvider ?? webSearchConfig.searchProvider,
    fallback: SearchProviders.LOCAL,
    enumObject: SearchProviders,
  });

  const scraperProvider = resolveProvider({
    envValue: process.env.WEB_SCRAPER,
    authValue: authResult.scraperProvider ?? webSearchConfig.scraperProvider,
    fallback: ScraperProviders.LOCAL,
    enumObject: ScraperProviders,
  });

  const rerankerType = resolveProvider({
    envValue: process.env.WEB_RERANK,
    authValue: authResult.rerankerType ?? webSearchConfig.rerankerType,
    fallback: RerankerTypes.NONE,
    enumObject: RerankerTypes,
  });

  const safeSearch = authResult.safeSearch ?? webSearchConfig.safeSearch ?? SafeSearchTypes.MODERATE;
  const timeoutMs = Number.isFinite(webSearchConfig.scraperTimeout)
    ? Number(webSearchConfig.scraperTimeout)
    : DEFAULT_TIMEOUT_MS;
  const envMaxUrls = Number.parseInt(process.env.WEB_SEARCH_MAX_URLS ?? '', 10);
  const maxUrls =
    Number.isFinite(envMaxUrls) && envMaxUrls > 0 ? envMaxUrls : DEFAULT_MAX_URLS;
  const allowAuto = (process.env.WEB_SEARCH_AUTO ?? '').toLowerCase() === 'true';

  const wsLocalBaseUrl =
    authResult.wsLocalBaseUrl ?? webSearchConfig.wsLocalBaseUrl ?? DEFAULT_WS_LOCAL_BASE_URL;

  return {
    maxUrls,
    timeoutMs,
    allowAuto,
    safeSearch,
    search: {
      kind: searchProvider,
      baseURL:
        searchProvider === SearchProviders.LOCAL
          ? wsLocalBaseUrl
          : authResult.searxngInstanceUrl ?? webSearchConfig.searxngInstanceUrl,
      apiKey: authResult.serperApiKey ?? webSearchConfig.serperApiKey,
    },
    scraper: {
      kind: scraperProvider,
      baseURL: scraperProvider === ScraperProviders.LOCAL ? wsLocalBaseUrl : webSearchConfig.firecrawlApiUrl,
      apiKey: authResult.firecrawlApiKey ?? webSearchConfig.firecrawlApiKey,
      version: webSearchConfig.firecrawlVersion,
      options: webSearchConfig.firecrawlOptions,
    },
    rerank: {
      kind: rerankerType,
      baseURL: wsLocalBaseUrl,
      apiKey: authResult.jinaApiKey ?? webSearchConfig.jinaApiKey,
      apiUrl: authResult.jinaApiUrl ?? webSearchConfig.jinaApiUrl,
      cohereApiKey: authResult.cohereApiKey ?? webSearchConfig.cohereApiKey,
    },
  };
};

module.exports = {
  buildRuntimeConfig,
  DEFAULT_MAX_URLS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WS_LOCAL_BASE_URL,
};
