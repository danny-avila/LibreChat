import { SafeSearchTypes, SearchProviders, ScraperProviders } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import { loadWebSearchConfig } from './web';

describe('loadWebSearchConfig', () => {
  describe('firecrawlVersion', () => {
    it('should use provided firecrawlVersion when specified', () => {
      const config: TCustomConfig['webSearch'] = {
        firecrawlVersion: 'v2',
      };

      const result = loadWebSearchConfig(config);

      expect(result?.firecrawlVersion).toBe('v2');
    });

    it('should default to ${FIRECRAWL_VERSION} when not provided', () => {
      const config: TCustomConfig['webSearch'] = {};

      const result = loadWebSearchConfig(config);

      expect(result?.firecrawlVersion).toBe('${FIRECRAWL_VERSION}');
    });

    it('should default to ${FIRECRAWL_VERSION} when config is undefined', () => {
      const result = loadWebSearchConfig(undefined);

      expect(result?.firecrawlVersion).toBe('${FIRECRAWL_VERSION}');
    });

    it('should preserve custom firecrawlVersion value', () => {
      const config: TCustomConfig['webSearch'] = {
        firecrawlVersion: 'v1',
      };

      const result = loadWebSearchConfig(config);

      expect(result?.firecrawlVersion).toBe('v1');
    });
  });

  describe('all config fields', () => {
    it('should apply defaults for all fields when config is empty', () => {
      const config: TCustomConfig['webSearch'] = {};

      const result = loadWebSearchConfig(config);

      expect(result).toEqual({
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        firecrawlVersion: '${FIRECRAWL_VERSION}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      });
    });

    it('should preserve provided config values and merge with defaults', () => {
      const config: TCustomConfig['webSearch'] = {
        serperApiKey: 'custom-serper-key',
        firecrawlApiKey: 'custom-firecrawl-key',
        firecrawlVersion: 'v2',
        safeSearch: SafeSearchTypes.STRICT,
      };

      const result = loadWebSearchConfig(config);

      expect(result?.serperApiKey).toBe('custom-serper-key');
      expect(result?.firecrawlApiKey).toBe('custom-firecrawl-key');
      expect(result?.firecrawlVersion).toBe('v2');
      expect(result?.safeSearch).toBe(SafeSearchTypes.STRICT);
      expect(result?.jinaApiKey).toBe('${JINA_API_KEY}');
    });

    it('should preserve additional fields from input config', () => {
      const config: TCustomConfig['webSearch'] = {
        serperApiKey: 'test-key',
        scraperProvider: ScraperProviders.SERPER,
        searchProvider: SearchProviders.SERPER,
      };

      const result = loadWebSearchConfig(config);

      expect(result?.scraperProvider).toBe('serper');
      expect(result?.searchProvider).toBe('serper');
      expect(result?.serperApiKey).toBe('test-key');
    });
  });

  describe('safeSearch', () => {
    it('should default to MODERATE when not provided', () => {
      const config: TCustomConfig['webSearch'] = {};

      const result = loadWebSearchConfig(config);

      expect(result?.safeSearch).toBe(SafeSearchTypes.MODERATE);
    });

    it('should preserve OFF value', () => {
      const config: TCustomConfig['webSearch'] = {
        safeSearch: SafeSearchTypes.OFF,
      };

      const result = loadWebSearchConfig(config);

      expect(result?.safeSearch).toBe(SafeSearchTypes.OFF);
    });

    it('should preserve STRICT value', () => {
      const config: TCustomConfig['webSearch'] = {
        safeSearch: SafeSearchTypes.STRICT,
      };

      const result = loadWebSearchConfig(config);

      expect(result?.safeSearch).toBe(SafeSearchTypes.STRICT);
    });
  });

  describe('API keys', () => {
    it('should apply default placeholders for all API keys', () => {
      const result = loadWebSearchConfig({});

      expect(result?.serperApiKey).toBe('${SERPER_API_KEY}');
      expect(result?.searxngApiKey).toBe('${SEARXNG_API_KEY}');
      expect(result?.firecrawlApiKey).toBe('${FIRECRAWL_API_KEY}');
      expect(result?.jinaApiKey).toBe('${JINA_API_KEY}');
      expect(result?.cohereApiKey).toBe('${COHERE_API_KEY}');
    });

    it('should preserve custom API keys', () => {
      const config: TCustomConfig['webSearch'] = {
        serperApiKey: 'actual-serper-key',
        jinaApiKey: 'actual-jina-key',
        cohereApiKey: 'actual-cohere-key',
      };

      const result = loadWebSearchConfig(config);

      expect(result?.serperApiKey).toBe('actual-serper-key');
      expect(result?.jinaApiKey).toBe('actual-jina-key');
      expect(result?.cohereApiKey).toBe('actual-cohere-key');
    });
  });

  describe('URLs', () => {
    it('should apply default placeholders for URLs', () => {
      const result = loadWebSearchConfig({});

      expect(result?.searxngInstanceUrl).toBe('${SEARXNG_INSTANCE_URL}');
      expect(result?.firecrawlApiUrl).toBe('${FIRECRAWL_API_URL}');
      expect(result?.jinaApiUrl).toBe('${JINA_API_URL}');
    });

    it('should preserve custom URLs', () => {
      const config: TCustomConfig['webSearch'] = {
        searxngInstanceUrl: 'https://custom-searxng.com',
        firecrawlApiUrl: 'https://custom-firecrawl.com',
        jinaApiUrl: 'https://custom-jina.com',
      };

      const result = loadWebSearchConfig(config);

      expect(result?.searxngInstanceUrl).toBe('https://custom-searxng.com');
      expect(result?.firecrawlApiUrl).toBe('https://custom-firecrawl.com');
      expect(result?.jinaApiUrl).toBe('https://custom-jina.com');
    });
  });
});
