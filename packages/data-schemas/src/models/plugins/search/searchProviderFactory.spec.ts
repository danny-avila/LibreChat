/**
 * Tests for the Search Provider Factory and detection logic.
 *
 * These tests verify:
 * - Provider auto-detection from environment variables
 * - Explicit SEARCH_PROVIDER selection
 * - Backward compatibility (MeiliSearch remains default)
 * - Provider instantiation and caching
 * - isSearchEnabled logic
 */

import {
  detectSearchProvider,
  getSearchProvider,
  resetSearchProvider,
  isSearchEnabled,
} from './searchProviderFactory';

// Mock the provider modules to avoid real network calls
jest.mock('./meiliSearchProvider', () => ({
  MeiliSearchProvider: jest.fn().mockImplementation((opts: Record<string, unknown>) => ({
    name: 'meilisearch',
    host: opts.host,
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('./openSearchProvider', () => ({
  OpenSearchProvider: jest.fn().mockImplementation((opts: Record<string, unknown>) => ({
    name: 'opensearch',
    node: opts.node,
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('./typesenseProvider', () => ({
  TypesenseProvider: jest.fn().mockImplementation((opts: Record<string, unknown>) => ({
    name: 'typesense',
    node: opts.node,
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Search Provider Factory', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    // Reset env and cached provider before each test
    process.env = { ...OLD_ENV };
    delete process.env.SEARCH_PROVIDER;
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;
    delete process.env.OPENSEARCH_HOST;
    delete process.env.OPENSEARCH_USERNAME;
    delete process.env.OPENSEARCH_PASSWORD;
    delete process.env.OPENSEARCH_INSECURE;
    delete process.env.TYPESENSE_HOST;
    delete process.env.TYPESENSE_API_KEY;
    delete process.env.SEARCH;
    resetSearchProvider();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('detectSearchProvider', () => {
    test('returns null when no search env vars are set', () => {
      expect(detectSearchProvider()).toBeNull();
    });

    test('returns "meilisearch" when MEILI_HOST and MEILI_MASTER_KEY are set', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      expect(detectSearchProvider()).toBe('meilisearch');
    });

    test('returns null when only MEILI_HOST is set (missing key)', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      expect(detectSearchProvider()).toBeNull();
    });

    test('returns "opensearch" when OPENSEARCH_HOST is set', () => {
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';
      expect(detectSearchProvider()).toBe('opensearch');
    });

    test('returns "typesense" when TYPESENSE_HOST and TYPESENSE_API_KEY are set', () => {
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      process.env.TYPESENSE_API_KEY = 'test-key';
      expect(detectSearchProvider()).toBe('typesense');
    });

    test('returns null when only TYPESENSE_HOST is set (missing key)', () => {
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      expect(detectSearchProvider()).toBeNull();
    });

    test('OPENSEARCH_HOST takes priority over MEILI_HOST in auto-detection', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';
      expect(detectSearchProvider()).toBe('opensearch');
    });

    test('OPENSEARCH_HOST takes priority over TYPESENSE in auto-detection', () => {
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      process.env.TYPESENSE_API_KEY = 'test-key';
      expect(detectSearchProvider()).toBe('opensearch');
    });

    test('TYPESENSE takes priority over MEILI in auto-detection', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      process.env.TYPESENSE_API_KEY = 'test-key';
      expect(detectSearchProvider()).toBe('typesense');
    });

    describe('explicit SEARCH_PROVIDER overrides auto-detection', () => {
      test('SEARCH_PROVIDER=meilisearch overrides OpenSearch env vars', () => {
        process.env.SEARCH_PROVIDER = 'meilisearch';
        process.env.OPENSEARCH_HOST = 'https://localhost:9200';
        expect(detectSearchProvider()).toBe('meilisearch');
      });

      test('SEARCH_PROVIDER=opensearch overrides MeiliSearch env vars', () => {
        process.env.SEARCH_PROVIDER = 'opensearch';
        process.env.MEILI_HOST = 'http://localhost:7700';
        process.env.MEILI_MASTER_KEY = 'test-key';
        expect(detectSearchProvider()).toBe('opensearch');
      });

      test('SEARCH_PROVIDER=typesense overrides other env vars', () => {
        process.env.SEARCH_PROVIDER = 'typesense';
        process.env.MEILI_HOST = 'http://localhost:7700';
        process.env.MEILI_MASTER_KEY = 'test-key';
        process.env.OPENSEARCH_HOST = 'https://localhost:9200';
        expect(detectSearchProvider()).toBe('typesense');
      });

      test('SEARCH_PROVIDER is case-insensitive', () => {
        process.env.SEARCH_PROVIDER = 'OpenSearch';
        expect(detectSearchProvider()).toBe('opensearch');

        process.env.SEARCH_PROVIDER = 'MEILISEARCH';
        expect(detectSearchProvider()).toBe('meilisearch');

        process.env.SEARCH_PROVIDER = 'Typesense';
        expect(detectSearchProvider()).toBe('typesense');
      });

      test('unknown SEARCH_PROVIDER falls through to auto-detection', () => {
        process.env.SEARCH_PROVIDER = 'unknown_provider';
        process.env.MEILI_HOST = 'http://localhost:7700';
        process.env.MEILI_MASTER_KEY = 'test-key';
        expect(detectSearchProvider()).toBe('meilisearch');
      });

      test('unknown SEARCH_PROVIDER with no env vars returns null', () => {
        process.env.SEARCH_PROVIDER = 'unknown_provider';
        expect(detectSearchProvider()).toBeNull();
      });
    });
  });

  describe('getSearchProvider', () => {
    test('returns null when no provider is configured', () => {
      expect(getSearchProvider()).toBeNull();
    });

    test('creates MeiliSearch provider when configured', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';

      const provider = getSearchProvider();
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe('meilisearch');
    });

    test('creates OpenSearch provider when configured', () => {
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';

      const provider = getSearchProvider();
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe('opensearch');
    });

    test('creates Typesense provider when configured', () => {
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      process.env.TYPESENSE_API_KEY = 'test-key';

      const provider = getSearchProvider();
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe('typesense');
    });

    test('caches provider instance (singleton)', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';

      const provider1 = getSearchProvider();
      const provider2 = getSearchProvider();
      expect(provider1).toBe(provider2);
    });

    test('resetSearchProvider clears the cached instance', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';

      const provider1 = getSearchProvider();
      resetSearchProvider();

      // Change config to OpenSearch
      delete process.env.MEILI_HOST;
      delete process.env.MEILI_MASTER_KEY;
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';

      const provider2 = getSearchProvider();
      expect(provider1!.name).toBe('meilisearch');
      expect(provider2!.name).toBe('opensearch');
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('isSearchEnabled', () => {
    test('returns false when SEARCH is not set', () => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(false);
    });

    test('returns false when SEARCH is not "true"', () => {
      process.env.SEARCH = 'false';
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(false);
    });

    test('returns false when SEARCH=true but no provider configured', () => {
      process.env.SEARCH = 'true';
      expect(isSearchEnabled()).toBe(false);
    });

    test('returns true when SEARCH=true and MeiliSearch configured', () => {
      process.env.SEARCH = 'true';
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(true);
    });

    test('returns true when SEARCH=true and OpenSearch configured', () => {
      process.env.SEARCH = 'true';
      process.env.OPENSEARCH_HOST = 'https://localhost:9200';
      expect(isSearchEnabled()).toBe(true);
    });

    test('returns true when SEARCH=true and Typesense configured', () => {
      process.env.SEARCH = 'true';
      process.env.TYPESENSE_HOST = 'http://localhost:8108';
      process.env.TYPESENSE_API_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(true);
    });

    test('SEARCH is case-insensitive', () => {
      process.env.SEARCH = 'TRUE';
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(true);
    });
  });
});
