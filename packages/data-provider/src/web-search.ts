import type { TCustomConfig } from './config';
import { extractVariableName } from './utils';

export function loadWebSearchConfig(
  config: TCustomConfig['webSearch'],
): TCustomConfig['webSearch'] {
  const serperApiKey = config?.serperApiKey ?? '';
  const firecrawlApiKey = config?.firecrawlApiKey ?? '';
  const firecrawlApiUrl = config?.firecrawlApiUrl ?? '';
  const jinaApiKey = config?.jinaApiKey ?? '';
  const cohereApiKey = config?.cohereApiKey ?? '';

  return {
    serperApiKey,
    firecrawlApiKey,
    firecrawlApiUrl,
    jinaApiKey,
    cohereApiKey,
  };
}

/**
 * Extracts environment variable names from template literals in the web search configuration
 * @param config The web search configuration object
 * @returns An object with the extracted environment variable names
 */
export function extractWebSearchEnvVars(config: TCustomConfig['webSearch']) {
  if (!config) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      const varName = extractVariableName(value);
      if (varName) {
        result[key] = varName;
      }
    }
  }

  return result;
}
