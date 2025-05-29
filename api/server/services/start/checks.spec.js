// Mock librechat-data-provider
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  extractVariableName: jest.fn(),
}));

// Mock the config logger
jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const { checkWebSearchConfig } = require('./checks');
const { logger } = require('~/config');
const { extractVariableName } = require('librechat-data-provider');

describe('checkWebSearchConfig', () => {
  let originalEnv;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Store original environment
    originalEnv = process.env;

    // Reset process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('when webSearchConfig is undefined or null', () => {
    it('should return early without logging when config is undefined', () => {
      checkWebSearchConfig(undefined);

      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return early without logging when config is null', () => {
      checkWebSearchConfig(null);

      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when config values are proper environment variable references', () => {
    it('should log debug message for each valid environment variable with value set', () => {
      const config = {
        serperApiKey: '${SERPER_API_KEY}',
        jinaApiKey: '${JINA_API_KEY}',
      };

      extractVariableName.mockReturnValueOnce('SERPER_API_KEY').mockReturnValueOnce('JINA_API_KEY');

      process.env.SERPER_API_KEY = 'test-serper-key';
      process.env.JINA_API_KEY = 'test-jina-key';

      checkWebSearchConfig(config);

      expect(extractVariableName).toHaveBeenCalledWith('${SERPER_API_KEY}');
      expect(extractVariableName).toHaveBeenCalledWith('${JINA_API_KEY}');
      expect(logger.debug).toHaveBeenCalledWith(
        'Web search serperApiKey: Using environment variable SERPER_API_KEY with value set',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Web search jinaApiKey: Using environment variable JINA_API_KEY with value set',
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log debug message for environment variables not set in environment', () => {
      const config = {
        cohereApiKey: '${COHERE_API_KEY}',
      };

      extractVariableName.mockReturnValue('COHERE_API_KEY');

      delete process.env.COHERE_API_KEY;

      checkWebSearchConfig(config);

      expect(logger.debug).toHaveBeenCalledWith(
        'Web search cohereApiKey: Using environment variable COHERE_API_KEY (not set in environment, user provided value)',
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when config values are actual values instead of environment variable references', () => {
    it('should warn when serperApiKey contains actual API key', () => {
      const config = {
        serperApiKey: 'sk-1234567890abcdef',
      };

      extractVariableName.mockReturnValue(null);

      checkWebSearchConfig(config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '❗ Web search configuration error: serperApiKey contains an actual value',
        ),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Current value: "sk-1234567..."'),
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should warn when firecrawlApiUrl contains actual URL', () => {
      const config = {
        firecrawlApiUrl: 'https://api.firecrawl.dev',
      };

      extractVariableName.mockReturnValue(null);

      checkWebSearchConfig(config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '❗ Web search configuration error: firecrawlApiUrl contains an actual value',
        ),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Current value: "https://ap..."'),
      );
    });

    it('should include documentation link in warning message', () => {
      const config = {
        firecrawlApiKey: 'fc-actual-key',
      };

      extractVariableName.mockReturnValue(null);

      checkWebSearchConfig(config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'More info: https://www.librechat.ai/docs/configuration/librechat_yaml/web_search',
        ),
      );
    });
  });

  describe('when config contains mixed value types', () => {
    it('should only process string values and ignore non-string values', () => {
      const config = {
        serperApiKey: '${SERPER_API_KEY}',
        safeSearch: 1,
        scraperTimeout: 7500,
        jinaApiKey: 'actual-key',
      };

      extractVariableName.mockReturnValueOnce('SERPER_API_KEY').mockReturnValueOnce(null);

      process.env.SERPER_API_KEY = 'test-key';

      checkWebSearchConfig(config);

      expect(extractVariableName).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle config with no web search keys', () => {
      const config = {
        someOtherKey: 'value',
        anotherKey: '${SOME_VAR}',
      };

      checkWebSearchConfig(config);

      expect(extractVariableName).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should truncate long values in warning messages', () => {
      const config = {
        serperApiKey: 'this-is-a-very-long-api-key-that-should-be-truncated-in-the-warning-message',
      };

      extractVariableName.mockReturnValue(null);

      checkWebSearchConfig(config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Current value: "this-is-a-..."'),
      );
    });
  });
});
