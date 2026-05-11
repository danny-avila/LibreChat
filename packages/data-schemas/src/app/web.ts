import { RerankerTypes, SafeSearchTypes } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { TWebSearchKeys, TWebSearchCategories } from '~/types/web';

export const webSearchAuth = {
  providers: {
    serper: {
      serperApiKey: 1 as const,
    },
    searxng: {
      searxngInstanceUrl: 1 as const,
      /** Optional (0) */
      searxngApiKey: 0 as const,
    },
    tavily: {
      tavilyApiKey: 1 as const,
      tavilySearchUrl: 0 as const,
    },
  },
  scrapers: {
    firecrawl: {
      firecrawlApiKey: 1 as const,
      /** Optional (0) */
      firecrawlApiUrl: 0 as const,
      firecrawlVersion: 0 as const,
    },
    serper: {
      serperApiKey: 1 as const,
    },
    tavily: {
      tavilyApiKey: 1 as const,
      tavilyExtractUrl: 0 as const,
    },
  },
  rerankers: {
    jina: {
      jinaApiKey: 1 as const,
      /** Optional (0) */
      jinaApiUrl: 0 as const,
    },
    cohere: { cohereApiKey: 1 as const },
  },
};

/**
 * Extracts all unique API keys from the webSearchAuth configuration object
 */
export function getWebSearchKeys(): TWebSearchKeys[] {
  const keysSet = new Set<TWebSearchKeys>();

  // Iterate through each category (providers, scrapers, rerankers)
  for (const category of Object.keys(webSearchAuth)) {
    const categoryObj = webSearchAuth[category as TWebSearchCategories];

    // Iterate through each service within the category
    for (const service of Object.keys(categoryObj)) {
      const serviceObj = categoryObj[service as keyof typeof categoryObj];

      // Extract the API keys from the service and add to set for deduplication
      for (const key of Object.keys(serviceObj)) {
        keysSet.add(key as TWebSearchKeys);
      }
    }
  }

  return Array.from(keysSet);
}

export const webSearchKeys: TWebSearchKeys[] = getWebSearchKeys();

export function loadWebSearchConfig(
  config: TCustomConfig['webSearch'],
): TCustomConfig['webSearch'] {
  const serperApiKey = config?.serperApiKey ?? '${SERPER_API_KEY}';
  const searxngInstanceUrl = config?.searxngInstanceUrl ?? '${SEARXNG_INSTANCE_URL}';
  const searxngApiKey = config?.searxngApiKey ?? '${SEARXNG_API_KEY}';
  const firecrawlApiKey = config?.firecrawlApiKey ?? '${FIRECRAWL_API_KEY}';
  const firecrawlApiUrl = config?.firecrawlApiUrl ?? '${FIRECRAWL_API_URL}';
  const firecrawlVersion = config?.firecrawlVersion ?? '${FIRECRAWL_VERSION}';
  const tavilyApiKey = config?.tavilyApiKey ?? '${TAVILY_API_KEY}';
  const tavilySearchUrl = config?.tavilySearchUrl ?? '${TAVILY_SEARCH_URL}';
  const tavilyExtractUrl = config?.tavilyExtractUrl ?? '${TAVILY_EXTRACT_URL}';
  const jinaApiKey = config?.jinaApiKey ?? '${JINA_API_KEY}';
  const jinaApiUrl = config?.jinaApiUrl ?? '${JINA_API_URL}';
  const cohereApiKey = config?.cohereApiKey ?? '${COHERE_API_KEY}';
  const safeSearch = config?.safeSearch ?? SafeSearchTypes.MODERATE;
  const rerankerType = config?.rerankerType;

  return {
    ...config, // Preserve provider-specific option blocks such as firecrawlOptions and tavilySearchOptions.
    safeSearch,
    jinaApiKey,
    jinaApiUrl,
    cohereApiKey,
    serperApiKey,
    searxngApiKey,
    tavilyApiKey,
    tavilySearchUrl,
    tavilyExtractUrl,
    firecrawlApiKey,
    firecrawlApiUrl,
    firecrawlVersion,
    searxngInstanceUrl,
    rerankerType,
  };
}
