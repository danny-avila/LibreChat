import { webSearchAuth } from '@librechat/data-schemas';
import { SafeSearchTypes, AuthType } from 'librechat-data-provider';
import type {
  ScraperProviders,
  TWebSearchConfig,
  SearchProviders,
  TCustomConfig,
  RerankerTypes,
} from 'librechat-data-provider';
import { loadWebSearchAuth, extractWebSearchEnvVars } from './web';

// Mock the extractVariableName function
jest.mock('../utils', () => ({
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
        safeSearch: SafeSearchTypes.MODERATE,
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
        safeSearch: SafeSearchTypes.MODERATE,
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
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      };
    });

    it('should return authenticated=true when all required categories are authenticated', async () => {
      // Mock successful authentication for all services
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult).toHaveProperty('scraperProvider', 'firecrawl');
      expect(['jina', 'cohere']).toContain(result.authResult.rerankerType as string);
    });

    it('should return authenticated=false when a required category is not authenticated', async () => {
      // Mock authentication failure for the providers category
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          // Only provide values for scrapers and rerankers, not for providers
          if (field !== 'SERPER_API_KEY' && field !== 'SEARXNG_INSTANCE_URL') {
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
        authFields.forEach((field: string) => {
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
        authFields.forEach((field: string) => {
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
        authFields.forEach((field: string) => {
          result[field] = 'test-api-key';
        });
        return Promise.resolve(result);
      });

      // Test with safeSearch: OFF
      const configWithSafeSearchOff = {
        ...webSearchConfig,
        safeSearch: SafeSearchTypes.OFF,
      } as TWebSearchConfig;

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig: configWithSafeSearchOff,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authResult).toHaveProperty('safeSearch', SafeSearchTypes.OFF);
    });

    it('should set the correct service types in authResult', async () => {
      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperProvider).toBe('firecrawl' as ScraperProviders);
      // One of the rerankers should be set
      expect(['jina', 'cohere']).toContain(result.authResult.rerankerType as string);
    });

    it('should check all services if none are specified', async () => {
      // Initialize a webSearchConfig without specific services
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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

      // Should have checked all categories
      expect(result.authTypes).toHaveLength(3);

      // Should have set values for all categories
      expect(result.authResult.searchProvider).toBeDefined();
      expect(result.authResult.scraperProvider).toBeDefined();
      expect(result.authResult.rerankerType).toBeDefined();
    });

    it('should correctly identify authTypes based on specific configurations', async () => {
      // Set up environment variables for system-defined auth
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERPER_API_KEY: 'system-serper-key',
        FIRECRAWL_API_KEY: 'system-firecrawl-key',
        FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
        JINA_API_KEY: 'system-jina-key',
        COHERE_API_KEY: 'system-cohere-key',
      };

      // Initialize webSearchConfig with environment variable references
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        // Specify which services to use
        searchProvider: 'serper' as SearchProviders,
        scraperProvider: 'firecrawl' as ScraperProviders,
        rerankerType: 'jina' as RerankerTypes,
      };

      // Mock loadAuthValues to return the actual values
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          if (field === 'SERPER_API_KEY') {
            result[field] = 'system-serper-key';
          } else if (field === 'FIRECRAWL_API_KEY') {
            result[field] = 'system-firecrawl-key';
          } else if (field === 'FIRECRAWL_API_URL') {
            result[field] = 'https://api.firecrawl.dev';
          } else if (field === 'JINA_API_KEY') {
            result[field] = 'system-jina-key';
          } else if (field === 'COHERE_API_KEY') {
            result[field] = 'system-cohere-key';
          }
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      // Verify that all required fields are present in the authResult
      expect(result.authResult).toHaveProperty('serperApiKey');
      expect(result.authResult).toHaveProperty('firecrawlApiKey');
      expect(result.authResult).toHaveProperty('firecrawlApiUrl');
      expect(result.authResult).toHaveProperty('jinaApiKey');
      expect(result.authResult).toHaveProperty('searchProvider');
      expect(result.authResult).toHaveProperty('scraperProvider');
      expect(result.authResult).toHaveProperty('rerankerType');

      expect(result.authenticated).toBe(true);

      // Verify authTypes for each category
      const providersAuthType = result.authTypes.find(
        ([category]) => category === 'providers',
      )?.[1];
      const scrapersAuthType = result.authTypes.find(([category]) => category === 'scrapers')?.[1];
      const rerankersAuthType = result.authTypes.find(
        ([category]) => category === 'rerankers',
      )?.[1];

      // All should be system-defined since we're using environment variables
      expect(providersAuthType).toBe(AuthType.SYSTEM_DEFINED);
      expect(scrapersAuthType).toBe(AuthType.SYSTEM_DEFINED);
      expect(rerankersAuthType).toBe(AuthType.SYSTEM_DEFINED);

      // Verify the authResult contains the correct values
      expect(result.authResult).toHaveProperty('serperApiKey', 'system-serper-key');
      expect(result.authResult).toHaveProperty('firecrawlApiKey', 'system-firecrawl-key');
      expect(result.authResult).toHaveProperty('firecrawlApiUrl', 'https://api.firecrawl.dev');
      expect(result.authResult).toHaveProperty('jinaApiKey', 'system-jina-key');
      expect(result.authResult).toHaveProperty('searchProvider', 'serper');
      expect(result.authResult).toHaveProperty('scraperProvider', 'firecrawl');
      expect(result.authResult).toHaveProperty('rerankerType', 'jina');

      // Restore original env
      process.env = originalEnv;
    });

    it('should handle custom variable names in environment variables', async () => {
      // Set up environment variables with custom names
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        CUSTOM_SERPER_KEY: 'custom-serper-key',
        CUSTOM_FIRECRAWL_KEY: 'custom-firecrawl-key',
        CUSTOM_FIRECRAWL_URL: 'https://custom.firecrawl.dev',
        CUSTOM_JINA_KEY: 'custom-jina-key',
        CUSTOM_COHERE_KEY: 'custom-cohere-key',
        CUSTOM_JINA_URL: 'https://custom.jina.ai',
      };

      // Initialize webSearchConfig with custom variable names
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${CUSTOM_SERPER_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${CUSTOM_FIRECRAWL_KEY}',
        firecrawlApiUrl: '${CUSTOM_FIRECRAWL_URL}',
        jinaApiKey: '${CUSTOM_JINA_KEY}',
        jinaApiUrl: '${CUSTOM_JINA_URL}',
        cohereApiKey: '${CUSTOM_COHERE_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        // Specify which services to use
        searchProvider: 'serper' as SearchProviders,
        scraperProvider: 'firecrawl' as ScraperProviders,
        rerankerType: 'jina' as RerankerTypes, // Only Jina will be checked
      };

      // Mock loadAuthValues to return the actual values
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          if (field === 'CUSTOM_SERPER_KEY') {
            result[field] = 'custom-serper-key';
          } else if (field === 'CUSTOM_FIRECRAWL_KEY') {
            result[field] = 'custom-firecrawl-key';
          } else if (field === 'CUSTOM_FIRECRAWL_URL') {
            result[field] = 'https://custom.firecrawl.dev';
          } else if (field === 'CUSTOM_JINA_KEY') {
            result[field] = 'custom-jina-key';
          }
          // Note: CUSTOM_COHERE_KEY is not checked because we specified jina as rerankerType
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.authenticated).toBe(true);

      // Verify the authResult contains the correct values from custom variables
      expect(result.authResult).toHaveProperty('serperApiKey', 'custom-serper-key');
      expect(result.authResult).toHaveProperty('firecrawlApiKey', 'custom-firecrawl-key');
      expect(result.authResult).toHaveProperty('firecrawlApiUrl', 'https://custom.firecrawl.dev');
      expect(result.authResult).toHaveProperty('jinaApiKey', 'custom-jina-key');
      // cohereApiKey should not be in the result since we specified jina as rerankerType
      expect(result.authResult).not.toHaveProperty('cohereApiKey');

      // Verify the service types are set correctly
      expect(result.authResult).toHaveProperty('searchProvider', 'serper');
      expect(result.authResult).toHaveProperty('scraperProvider', 'firecrawl');
      expect(result.authResult).toHaveProperty('rerankerType', 'jina');

      // Restore original env
      process.env = originalEnv;
    });

    it('should always return authTypes array with exactly 3 categories', async () => {
      // Set up environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERPER_API_KEY: 'test-key',
        FIRECRAWL_API_KEY: 'test-key',
        FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
        JINA_API_KEY: 'test-key',
      };

      // Initialize webSearchConfig with environment variable references
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      };

      // Mock loadAuthValues to return values
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          result[field] = field === 'FIRECRAWL_API_URL' ? 'https://api.firecrawl.dev' : 'test-key';
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      // Get the number of categories from webSearchAuth
      const expectedCategoryCount = Object.keys(webSearchAuth).length;

      // Verify authTypes array structure
      expect(result.authTypes).toHaveLength(expectedCategoryCount);

      // Verify each category exists exactly once
      const categories = result.authTypes.map(([category]) => category);
      Object.keys(webSearchAuth).forEach((category) => {
        expect(categories).toContain(category);
      });

      // Verify no duplicate categories
      expect(new Set(categories).size).toBe(expectedCategoryCount);

      // Verify each entry has the correct format [category, AuthType]
      result.authTypes.forEach(([category, authType]) => {
        expect(typeof category).toBe('string');
        expect([AuthType.SYSTEM_DEFINED, AuthType.USER_PROVIDED]).toContain(authType);
      });

      // Restore original env
      process.env = originalEnv;
    });

    it('should maintain authTypes array structure even when authentication fails', async () => {
      // Set up environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERPER_API_KEY: 'test-key',
        // Missing other keys to force authentication failure
      };

      // Initialize webSearchConfig with environment variable references
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      };

      // Mock loadAuthValues to return partial values
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          if (field === 'SERPER_API_KEY') {
            result[field] = 'test-key';
          }
          // Other fields are intentionally missing
        });
        return Promise.resolve(result);
      });

      const result = await loadWebSearchAuth({
        userId,
        webSearchConfig,
        loadAuthValues: mockLoadAuthValues,
      });

      // Get the number of categories from webSearchAuth
      const expectedCategoryCount = Object.keys(webSearchAuth).length;

      // Verify authentication failed
      expect(result.authenticated).toBe(false);

      // Verify authTypes array structure is maintained
      expect(result.authTypes).toHaveLength(expectedCategoryCount);

      // Verify each category exists exactly once
      const categories = result.authTypes.map(([category]) => category);
      Object.keys(webSearchAuth).forEach((category) => {
        expect(categories).toContain(category);
      });

      // Verify no duplicate categories
      expect(new Set(categories).size).toBe(expectedCategoryCount);

      // Verify each entry has the correct format [category, AuthType]
      result.authTypes.forEach(([category, authType]) => {
        expect(typeof category).toBe('string');
        expect([AuthType.SYSTEM_DEFINED, AuthType.USER_PROVIDED]).toContain(authType);
      });

      // Restore original env
      process.env = originalEnv;
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
  describe('loadWebSearchAuth with specific services', () => {
    // Common test variables
    const userId = 'test-user-id';
    let mockLoadAuthValues: jest.Mock;

    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();

      // Initialize the mock function
      mockLoadAuthValues = jest.fn();
    });

    it('should only check the specified searchProvider', async () => {
      // Initialize a webSearchConfig with a specific searchProvider
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        searchProvider: 'serper' as SearchProviders,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.searchProvider).toBe('serper');

      // Verify that only SERPER_API_KEY was requested for the providers category
      const providerCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('SERPER_API_KEY'),
      );
      expect(providerCalls.length).toBe(1);
    });

    it('should only check the specified scraperProvider', async () => {
      // Initialize a webSearchConfig with a specific scraperProvider
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        scraperProvider: 'firecrawl' as ScraperProviders,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperProvider).toBe('firecrawl');

      // Verify that only FIRECRAWL_API_KEY and FIRECRAWL_API_URL were requested for the scrapers category
      const scraperCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('FIRECRAWL_API_KEY'),
      );
      expect(scraperCalls.length).toBe(1);
    });

    it('should only check the specified rerankerType', async () => {
      // Initialize a webSearchConfig with a specific rerankerType
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        rerankerType: 'jina' as RerankerTypes,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.rerankerType).toBe('jina');

      // Verify that only JINA_API_KEY was requested for the rerankers category
      const rerankerCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('JINA_API_KEY'),
      );
      expect(rerankerCalls.length).toBe(1);

      // Verify that COHERE_API_KEY was not requested
      const cohereCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('COHERE_API_KEY'),
      );
      expect(cohereCalls.length).toBe(0);
    });

    it('should handle invalid specified service gracefully', async () => {
      // Initialize a webSearchConfig with an invalid searchProvider
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        searchProvider: 'invalid-provider' as SearchProviders,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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

      // Should fail because the specified provider doesn't exist
      expect(result.authenticated).toBe(false);
    });

    it('should fail authentication when specified service is not authenticated but others are', async () => {
      // Initialize a webSearchConfig with a specific rerankerType (jina)
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        rerankerType: 'jina' as RerankerTypes,
      };

      // Mock authentication where cohere is authenticated but jina is not
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
          // Authenticate all fields except JINA_API_KEY
          if (field !== 'JINA_API_KEY') {
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

      // Should fail because the specified reranker (jina) is not authenticated
      // even though another reranker (cohere) might be authenticated
      expect(result.authenticated).toBe(false);

      // Verify that JINA_API_KEY was requested
      const jinaApiKeyCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('JINA_API_KEY'),
      );
      expect(jinaApiKeyCalls.length).toBe(1);

      // Verify that COHERE_API_KEY was not requested since we specified jina
      const cohereApiKeyCalls = mockLoadAuthValues.mock.calls.filter((call) =>
        call[0].authFields.includes('COHERE_API_KEY'),
      );
      expect(cohereApiKeyCalls.length).toBe(0);
    });

    it('should check all services if none are specified', async () => {
      // Initialize a webSearchConfig without specific services
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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

      // Should have checked all categories
      expect(result.authTypes).toHaveLength(3);

      // Should have set values for all categories
      expect(result.authResult.searchProvider).toBeDefined();
      expect(result.authResult.scraperProvider).toBeDefined();
      expect(result.authResult.rerankerType).toBeDefined();
    });

    it('should handle firecrawlOptions properties', async () => {
      // Initialize a webSearchConfig with comprehensive firecrawlOptions
      const webSearchConfig: TCustomConfig['webSearch'] = {
        serperApiKey: '${SERPER_API_KEY}',
        searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}',
        searxngApiKey: '${SEARXNG_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        cohereApiKey: '${COHERE_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        firecrawlOptions: {
          formats: ['markdown', 'html'],
          includeTags: ['img', 'p', 'h1'],
          excludeTags: ['script', 'style'],
          headers: { 'User-Agent': 'TestBot' },
          waitFor: 2000,
          timeout: 15000,
          maxAge: 3600,
          mobile: true,
          skipTlsVerification: false,
          blockAds: true,
          removeBase64Images: false,
          parsePDF: true,
          storeInCache: false,
          zeroDataRetention: true,
          location: {
            country: 'US',
            languages: ['en'],
          },
          onlyMainContent: true,
          changeTrackingOptions: {
            modes: ['diff'],
            schema: { title: 'string' },
            prompt: 'Track changes',
            tag: 'test-tag',
          },
        },
      };

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.firecrawlOptions).toEqual(webSearchConfig.firecrawlOptions);
      expect(result.authResult.scraperTimeout).toBe(15000); // Should use firecrawlOptions.timeout
    });

    it('should use scraperTimeout when both scraperTimeout and firecrawlOptions.timeout are provided', async () => {
      // Initialize a webSearchConfig with both scraperTimeout and firecrawlOptions.timeout
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        safeSearch: SafeSearchTypes.MODERATE,
        scraperTimeout: 15000, // This should take priority
        firecrawlOptions: {
          timeout: 10000, // This should be ignored
          includeTags: ['p'],
          formats: ['markdown'],
        },
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(15000); // Should use explicit scraperTimeout
      expect(result.authResult.firecrawlOptions).toEqual({
        timeout: 10000,
        includeTags: ['p'],
        formats: ['markdown'],
      });
    });

    it('should fallback to default timeout when neither scraperTimeout nor firecrawlOptions.timeout are provided', async () => {
      // Initialize a webSearchConfig without timeout values
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        safeSearch: SafeSearchTypes.MODERATE,
        firecrawlOptions: {
          includeTags: ['p'],
          formats: ['markdown'],
        },
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(7500); // Should use default timeout
      expect(result.authResult.firecrawlOptions).toEqual({
        includeTags: ['p'],
        formats: ['markdown'],
      });
    });

    it('should use firecrawlOptions.timeout when only firecrawlOptions.timeout is provided', async () => {
      // Initialize a webSearchConfig with only firecrawlOptions.timeout
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        safeSearch: SafeSearchTypes.MODERATE,
        firecrawlOptions: {
          timeout: 12000, // Only timeout provided
        },
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(12000); // Should use firecrawlOptions.timeout
      expect(result.authResult.firecrawlOptions).toEqual({
        timeout: 12000,
      });
    });

    it('should handle firecrawlOptions.formats when only formats is provided', async () => {
      // Initialize a webSearchConfig with only firecrawlOptions.formats
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        safeSearch: SafeSearchTypes.MODERATE,
        firecrawlOptions: {
          formats: ['html', 'markdown'], // Only formats provided
        },
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(7500); // Should use default timeout
      expect(result.authResult.firecrawlOptions).toEqual({
        formats: ['html', 'markdown'],
      });
    });

    it('should handle firecrawlOptions without formats property', async () => {
      // Initialize a webSearchConfig with firecrawlOptions but no formats
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        jinaApiUrl: '${JINA_API_URL}',
        safeSearch: SafeSearchTypes.MODERATE,
        firecrawlOptions: {
          timeout: 8000,
          includeTags: ['p', 'h1'],
          // formats is intentionally missing
        },
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(8000); // Should use firecrawlOptions.timeout
      expect(result.authResult.firecrawlOptions).toEqual({
        timeout: 8000,
        includeTags: ['p', 'h1'],
        // formats should be undefined/missing
      });
    });

    it('should handle webSearchConfig without firecrawlOptions at all', async () => {
      // Initialize a webSearchConfig without any firecrawlOptions
      const webSearchConfig = {
        serperApiKey: '${SERPER_API_KEY}',
        firecrawlApiKey: '${FIRECRAWL_API_KEY}',
        firecrawlApiUrl: '${FIRECRAWL_API_URL}',
        jinaApiKey: '${JINA_API_KEY}',
        safeSearch: SafeSearchTypes.MODERATE,
        // firecrawlOptions is intentionally missing
      } as TCustomConfig['webSearch'];

      // Mock successful authentication
      mockLoadAuthValues.mockImplementation(({ authFields }) => {
        const result: Record<string, string> = {};
        authFields.forEach((field: string) => {
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
      expect(result.authResult.scraperTimeout).toBe(7500); // Should use default timeout
      expect(result.authResult.firecrawlOptions).toBeUndefined(); // Should be undefined
    });
  });
});
