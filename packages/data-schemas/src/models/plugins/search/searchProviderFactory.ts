import type { SearchProvider } from './searchProvider';
import { OpenSearchProvider } from './openSearchProvider';
import { TypesenseProvider } from './typesenseProvider';
import { MeiliSearchProvider } from './meiliSearchProvider';
import logger from '~/config/meiliLogger';

/**
 * Determines which search provider to use based on environment variables.
 *
 * Priority:
 * 1. If SEARCH_PROVIDER is explicitly set, use that.
 * 2. If OPENSEARCH_HOST is set, use OpenSearch.
 * 3. If MEILI_HOST + MEILI_MASTER_KEY are set, use MeiliSearch (backward compatible default).
 * 4. Otherwise, return null (search disabled).
 *
 * This ensures existing deployments using MEILI_HOST/MEILI_MASTER_KEY continue to work
 * without any configuration changes.
 */
export function detectSearchProvider(): 'meilisearch' | 'opensearch' | 'typesense' | null {
  const explicit = process.env.SEARCH_PROVIDER?.toLowerCase();

  if (explicit === 'opensearch') {
    return 'opensearch';
  }
  if (explicit === 'meilisearch') {
    return 'meilisearch';
  }
  if (explicit === 'typesense') {
    return 'typesense';
  }

  // Auto-detect based on available env vars
  if (process.env.OPENSEARCH_HOST) {
    return 'opensearch';
  }
  if (process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY) {
    return 'typesense';
  }
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    return 'meilisearch';
  }

  return null;
}

/**
 * Singleton search provider instance.
 */
let providerInstance: SearchProvider | null = null;

/**
 * Creates and returns a SearchProvider based on environment configuration.
 * Returns null if search is not configured.
 *
 * Uses lazy initialization — the provider is created on first call and cached.
 */
export function getSearchProvider(): SearchProvider | null {
  if (providerInstance) {
    return providerInstance;
  }

  const providerType = detectSearchProvider();
  if (!providerType) {
    return null;
  }

  try {
    if (providerType === 'opensearch') {
      providerInstance = new OpenSearchProvider({
        node: process.env.OPENSEARCH_HOST as string,
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
        insecure: process.env.OPENSEARCH_INSECURE === 'true',
      });
      logger.info('[SearchProviderFactory] Using OpenSearch provider');
    } else if (providerType === 'typesense') {
      providerInstance = new TypesenseProvider({
        node: process.env.TYPESENSE_HOST as string,
        apiKey: process.env.TYPESENSE_API_KEY as string,
      });
      logger.info('[SearchProviderFactory] Using Typesense provider');
    } else {
      providerInstance = new MeiliSearchProvider({
        host: process.env.MEILI_HOST as string,
        apiKey: process.env.MEILI_MASTER_KEY as string,
      });
      logger.info('[SearchProviderFactory] Using MeiliSearch provider');
    }
  } catch (error) {
    logger.error(`[SearchProviderFactory] Failed to create ${providerType} provider:`, error);
    return null;
  }

  return providerInstance;
}

/**
 * Reset the cached provider instance. Useful for testing.
 */
export function resetSearchProvider(): void {
  providerInstance = null;
}

/**
 * Check if search is enabled based on environment variables.
 */
export function isSearchEnabled(): boolean {
  const searchFlag = process.env.SEARCH;
  if (!searchFlag || searchFlag.toLowerCase() !== 'true') {
    return false;
  }
  return detectSearchProvider() !== null;
}
