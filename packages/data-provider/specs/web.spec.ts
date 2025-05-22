import type { TCustomConfig, SearchProviders, ScraperTypes, TWebSearchConfig } from '../src/config';
import { webSearchAuth, loadWebSearchAuth, extractWebSearchEnvVars } from '../src/web';
import { AuthType } from '../src/schemas';

// Mock the extractVariableName function
jest.mock('../src/utils', () => ({
  extractVariableName: (value: string) => {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^\${(.+)}$/);
    return match ? match[1] : null;
  },
}));

describe('web.ts', () => {
  describe('extractWebSearchEnvVars', () => {
    it('should return empty array if config is undefined', () => {
      const result = extractWebSearchEnvVars({
        keys: ['serperApiKey', 'jinaApiKey'],
        config: undefined,
      });

      expect(result).toEqual([]);
    });

    it('should extract environment variable names from config values', () => {
      const config: Partial<TWebSearchConfig> = {
        serperApiKey: '${SERPER_API_KEY}',
        jinaApiKey: '${JINA_API_KEY}',
        cohereApiKey: 'actual-api-key', // Not in env var format
        safeSearch: true,
      };

      const result = extractWebSearchEnvVars({
        keys: ['serperApiKey', 'jinaApiKey', 'cohereApiKey'],
        config: config as TWebSearchConfig,
      });

      expect(result).toEqual(['SERPER_API_KEY', 'JINA_API_KEY']);
    });

    it('should only extract variables for keys that exist in the config', () => {
      const config: Partial<TWebSearchConfig> = {
        serperApiKey: '${SERPER_API_KEY}',
        // firecrawlApiKey is missing
        safeSearch: true,
      };

      const result = extractWebSearchEnvVars({
        keys: ['serperApiKey', 'firecrawlApiKey'],
        config: config as TWebSearchConfig,
      });

      expect(result).toEqual(['SERPER_API_KEY']);
    });
  });

  describe('loadWebSearchAuth', () => {
    // Common test variables
    const userId = 'test-user-id';
    let mockLoadAuthValues: jest.Mock;
    let webSearchConfig: TCustomConfig['webSearch'];

    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();

      // Initialize the mock function
      mockLoadAuthValues = jest.fn();

      // Initialize a basic webSearchConfig
      webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: true,
      };
    });

    it('should return authenticated=true when all required categories are authenticated', async () => {
      // Mock successful authentication for all services
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          result[field] =
            field === 'FIRECRAWL_API_URL' ? 'https://api.firecrawl.dev' : 'test-api-key';
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authenticated).toBe(true);
      expect(result.authTypes).toHaveLength(3); // providers, scrapers, rerankers
      expect(result.authResult).toHaveProperty('serperApiKey', 'test-api-key');
      expect(result.authResult).toHaveProperty('firecrawlApiKey', 'test-api-key');

      // The implementation only includes one reranker in the result
      // It will be either jina or cohere, but not both
      if (result.authResult.rerankerType === 'jina') {
        expect(result.authResult).toHaveProperty('jinaApiKey', 'test-api-key');
      } else {
        expect(result.authResult).toHaveProperty('cohereApiKey', 'test-api-key');
      }

      expect(result.authResult).toHaveProperty('searchProvider', 'serper');
      expect(result.authResult).toHaveProperty('scraperType', 'firecrawl');
      expect(['jina', 'cohere']).toContain(result.authResult.rerankerType as string);
    });

    it('should return authenticated=false when a required category is not authenticated', async () => {
      // Mock authentication failure for the providers category
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          // Only provide values for scrapers and rerankers, not for providers
          if (field !== 'SERPER_API_KEY') {
            result[field] =
              field === 'FIRECRAWL_API_URL' ? 'https://api.firecrawl.dev' : 'test-api-key';
          }
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authenticated).toBe(false);
      // We should still have authTypes for the categories we checked
      expect(result.authTypes.some(([category]) => category === 'providers')).toBe(true);
    });

    it('should handle exceptions from loadAuthValues', async () => {
      // Mock loadAuthValues to throw an error
      mockLoadAuthValues.mockImplementation(() => {
        throw new Error('Authentication failed');
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
        throwError: false, // Don't throw errors
      });

      expect(result.authenticated).toBe(false);
    });

    it('should correctly identify user-provided vs system-defined auth', async () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERPER_API_KEY: 'system-api-key',
        FIRECRAWL_API_KEY: 'system-api-key',
        JINA_API_KEY: 'system-api-key',
      };

      // Mock loadAuthValues to return different values for some keys
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          if (field === 'SERPER_API_KEY') {
            // This matches the system env var
            result[field] = 'system-api-key';
          } else if (field === 'FIRECRAWL_API_KEY') {
            // This is different from the system env var (user provided)
            result[field] = 'user-api-key';
          } else if (field === 'FIRECRAWL_API_URL') {
            result[field] = 'https://api.firecrawl.dev';
          } else if (field === 'JINA_API_KEY') {
            // This matches the system env var
            result[field] = 'system-api-key';
          } else {
            result[field] = 'test-api-key';
          }
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authenticated).toBe(true);
      // Check for providers (system-defined) and scrapers (user-provided)
      const providersAuthType = result.authTypes.find(
        ([category]) => category === 'providers',
      )?.[1];
      const scrapersAuthType = result.authTypes.find(([category]) => category === 'scrapers')?.[1];

      expect(providersAuthType).toBe(AuthType.SYSTEM_DEFINED);
      expect(scrapersAuthType).toBe(AuthType.USER_PROVIDED);

      // Restore original env
      process.env = originalEnv;
    });

    it('should handle optional fields correctly', async () => {
      // Create a config without the optional firecrawlApiUrl
      const configWithoutOptional = { ...webSearchConfig } as Partial<TWebSearchConfig>;
      delete configWithoutOptional.firecrawlApiUrl;

      mockLoadAuthValues.mockImplementation(({ authFields, optional }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          // Don't provide values for optional fields
          if (!optional?.has(field)) {
            result[field] = 'test-api-key';
          }
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig: configWithoutOptional as TWebSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authenticated).toBe(true);
      expect(result.authResult).toHaveProperty('firecrawlApiKey', 'test-api-key');
      // Optional URL should not be in the result
      expect(result.authResult.firecrawlApiUrl).toBeUndefined();
    });

    it('should preserve safeSearch setting from webSearchConfig', async () => {
      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          result[field] = 'test-api-key';
        });
        return Promise.resolve(result);
      });

      // Test with safeSearch: false
      const configWithSafeSearchOff = { ...webSearchConfig, safeSearch: false } as TWebSearchConfig;

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig: configWithSafeSearchOff,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authResult).toHaveProperty('safeSearch', false);
    });

    it('should set the correct service types in authResult', async () => {
      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field) => {
          result[field] =
            field === 'FIRECRAWL_API_URL' ? 'https://api.firecrawl.dev' : 'test-api-key';
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      // Check that the correct service types are set
      expect(result.authResult.searchProvider).toBe('serper' as SearchProviders);
      expect(result.authResult.scraperType).toBe('firecrawl' as ScraperTypes);
      // One of the rerankers should be set
      expect(['jina', 'cohere']).toContain(result.authResult.rerankerType as string);
    });
  });

  describe('webSearchAuth', () => {
    it('should have the expected structure', () => {
      // Check that all expected categories exist
      expect(webSearchAuth).toHaveProperty('providers');
      expect(webSearchAuth).toHaveProperty('scrapers');
      expect(webSearchAuth).toHaveProperty('rerankers');

      // Check providers
      expect(webSearchAuth.providers).toHaveProperty('serper');
      expect(webSearchAuth.providers.serper).toHaveProperty('serperApiKey', 1);

      // Check scrapers
      expect(webSearchAuth.scrapers).toHaveProperty('firecrawl');
      expect(webSearchAuth.scrapers.firecrawl).toHaveProperty('firecrawlApiKey', 1);
      expect(webSearchAuth.scrapers.firecrawl).toHaveProperty('firecrawlApiUrl', 0);

      // Check rerankers
      expect(webSearchAuth.rerankers).toHaveProperty('jina');
      expect(webSearchAuth.rerankers.jina).toHaveProperty('jinaApiKey', 1);
      expect(webSearchAuth.rerankers).toHaveProperty('cohere');
      expect(webSearchAuth.rerankers.cohere).toHaveProperty('cohereApiKey', 1);
    });

    it('should mark required keys with value 1', () => {
      // All keys with value 1 are required
      expect(webSearchAuth.providers.serper.serperApiKey).toBe(1);
      expect(webSearchAuth.scrapers.firecrawl.firecrawlApiKey).toBe(1);
      expect(webSearchAuth.rerankers.jina.jinaApiKey).toBe(1);
      expect(webSearchAuth.rerankers.cohere.cohereApiKey).toBe(1);
    });

    it('should mark optional keys with value 0', () => {
      // Keys with value 0 are optional
      expect(webSearchAuth.scrapers.firecrawl.firecrawlApiUrl).toBe(0);
    });
  });
});
