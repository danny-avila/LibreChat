import type { SearchCategories } from 'librechat-data-provider';

export type TWebSearchKeys =
  | 'serperApiKey'
  | 'searxngInstanceUrl'
  | 'searxngApiKey'
  | 'firecrawlApiKey'
  | 'firecrawlApiUrl'
  | 'jinaApiKey'
  | 'jinaApiUrl'
  | 'cohereApiKey';

export type TWebSearchCategories =
  | SearchCategories.PROVIDERS
  | SearchCategories.SCRAPERS
  | SearchCategories.RERANKERS;
