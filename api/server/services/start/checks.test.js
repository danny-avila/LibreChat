const {
  checkVariables,
  checkHealth,
  checkConfig,
  checkAzureVariables,
} = require('./checks');
const { deprecatedAzureVariables, conflictingAzureVariables, Constants } = require('librechat-data-provider');
const { logger } = require('~/config');
const { isEnabled, checkEmailConfig } = require('~/server/utils');

jest.mock('~/server/utils', () => ({
  isEnabled: jest.fn(),
  checkEmailConfig: jest.fn(),
}));

describe('Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env for each test
    process.env = {};
  });

  describe('checkVariables', () => {
    it('should log warnings for default secret values and deprecated variables', () => {
      // Set default secret values
      process.env.CREDS_KEY = 'f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0';
      process.env.CREDS_IV = 'e2341419ec3dd3d19b13a1a87fafcbfb';
      process.env.JWT_SECRET = '16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef';
      process.env.JWT_REFRESH_SECRET = 'eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418';

      // Set deprecated variables
      process.env.GOOGLE_API_KEY = 'some-google-key';
      process.env.OPENROUTER_API_KEY = 'some-openrouter-key';

      // For password reset check: simulate email not configured and password reset enabled.
      process.env.ALLOW_PASSWORD_RESET = 'true';
      checkEmailConfig.mockReturnValue(false);
      isEnabled.mockReturnValue(true);

      checkVariables();

      // Verify warnings for each default secret
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Default value for CREDS_KEY'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Default value for CREDS_IV'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Default value for JWT_SECRET'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Default value for JWT_REFRESH_SECRET'));

      // Verify info message to replace defaults is logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Please replace any default secret values'));

      // Verify warnings for deprecated variables
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('The `GOOGLE_API_KEY` environment variable is deprecated.'),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('The `OPENROUTER_API_KEY` environment variable is deprecated'),
      );

      // Verify password reset warning is logged
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Password reset is enabled'));
    });

    it('should not warn for password reset if email service is configured', () => {
      process.env.ALLOW_PASSWORD_RESET = 'true';
      checkEmailConfig.mockReturnValue(true);
      isEnabled.mockReturnValue(true);

      checkVariables();

      // No warning should be logged about password reset
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('Password reset is enabled'));
    });
  });

  describe('checkConfig', () => {
    it('should log info when config version is outdated', () => {
      const outdatedConfig = { version: '0.9.0' };
      checkConfig(outdatedConfig);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Outdated Config version'));
    });

    it('should not log info when config version is up-to-date', () => {
      const upToDateConfig = { version: Constants.CONFIG_VERSION };
      checkConfig(upToDateConfig);

      // When the config is current, no info message should be logged.
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('checkAzureVariables', () => {
    it('should warn for each deprecated Azure variable if set', () => {
      deprecatedAzureVariables.forEach(({ key, description }) => {
        process.env[key] = 'test';
      });

      checkAzureVariables();

      deprecatedAzureVariables.forEach(({ key, description }) => {
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `The \`${key}\` environment variable (related to ${description}) should not be used`,
          ),
        );
      });
    });

    it('should warn for each conflicting Azure variable if set', () => {
      conflictingAzureVariables.forEach(({ key }) => {
        process.env[key] = 'test';
      });

      checkAzureVariables();

      conflictingAzureVariables.forEach(({ key }) => {
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining(`The \`${key}\` environment variable should not be used in combination`),
        );
      });
    });
  });

  describe('checkHealth', () => {
    it('should log info if RAG API is healthy', async () => {
      process.env.RAG_API_URL = 'http://fakeurl.com';
      const fakeResponse = { ok: true, status: 200 };
      global.fetch = jest.fn().mockResolvedValue(fakeResponse);

      await checkHealth();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`RAG API is running and reachable at ${process.env.RAG_API_URL}.`),
      );
    });

    it('should log warning if RAG API is not healthy', async () => {
      process.env.RAG_API_URL = 'http://fakeurl.com';
      global.fetch = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      await checkHealth();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`RAG API is either not running or not reachable at ${process.env.RAG_API_URL}`),
      );
    });
  });
});