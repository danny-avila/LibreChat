import type { SearchCategories } from 'librechat-data-provider';

export type TWebSearchKeys =
  | 'serperApiKey'
  | 'searxngInstanceUrl'
  | 'searxngApiKey'
  | 'firecrawlApiKey'
  | 'firecrawlApiUrl'
  | 'firecrawlVersion'
  | 'tavilyApiKey'
  | 'tavilySearchUrl'
  | 'tavilyExtractUrl'
  | 'jinaApiKey'
  | 'jinaApiUrl'
  | 'cohereApiKey'
  | 'voyageApiKey'
  | 'voyageApiUrl'
  | 'voyageModel';

export type TWebSearchCategories =
  | SearchCategories.PROVIDERS
  | SearchCategories.SCRAPERS
  | SearchCategories.RERANKERS;
