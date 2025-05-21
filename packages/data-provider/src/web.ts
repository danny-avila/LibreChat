import type { TCustomConfig } from './config';
import { extractVariableName } from './utils';

export function loadWebSearchConfig(
  config: TCustomConfig['webSearch'],
): TCustomConfig['webSearch'] {
  const serperApiKey = config?.serperApiKey ?? '${SERPER_API_KEY}';
  const firecrawlApiKey = config?.firecrawlApiKey ?? '${FIRECRAWL_API_KEY}';
  const firecrawlApiUrl = config?.firecrawlApiUrl ?? '${FIRECRAWL_API_URL}';
  const jinaApiKey = config?.jinaApiKey ?? '${JINA_API_KEY}';
  const cohereApiKey = config?.cohereApiKey ?? '${COHERE_API_KEY}';

  return {
    serperApiKey,
    firecrawlApiKey,
    firecrawlApiUrl,
    jinaApiKey,
    cohereApiKey,
  };
}

type TWebSearchKeys =
  | 'serperApiKey'
  | 'firecrawlApiKey'
  | 'firecrawlApiUrl'
  | 'jinaApiKey'
  | 'cohereApiKey';

export const webSearchAuth = {
  engines: {
    serper: {
      serperApiKey: 1 as const,
    },
  },
  scrapers: {
    firecrawl: {
      firecrawlApiKey: 1 as const,
      /** Optional (0) */
      firecrawlApiUrl: 0 as const,
    },
  },
  rerankers: {
    jina: { jinaApiKey: 1 as const },
    cohere: { cohereApiKey: 1 as const },
  },
};

type TSearchComponents = keyof typeof webSearchAuth;

/**
 * Extracts all API keys from the webSearchAuth configuration object
 */
export const webSearchKeys: TWebSearchKeys[] = [];

// Iterate through each category (engines, scrapers, rerankers)
for (const category of Object.keys(webSearchAuth)) {
  const categoryObj = webSearchAuth[category as TSearchComponents];

  // Iterate through each service within the category
  for (const service of Object.keys(categoryObj)) {
    const serviceObj = categoryObj[service as keyof typeof categoryObj];

    // Extract the API keys from the service
    for (const key of Object.keys(serviceObj)) {
      webSearchKeys.push(key as TWebSearchKeys);
    }
  }
}

export function extractWebSearchEnvVars({
  keys,
  config,
}: {
  keys: TWebSearchKeys[];
  config: TCustomConfig['webSearch'] | undefined;
}): string[] {
  if (!config) {
    return [];
  }

  const authFields: string[] = [];
  const relevantKeys = keys.filter((k) => k in config);

  for (const key of relevantKeys) {
    const value = config[key];
    if (typeof value === 'string') {
      const varName = extractVariableName(value);
      if (varName) {
        authFields.push(varName);
      }
    }
  }

  return authFields;
}
