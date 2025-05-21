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
