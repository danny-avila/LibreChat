jest.mock('axios');
jest.mock('~/cache/getLogStores');
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  loadYaml: jest.fn(),
}));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    paramSettings: { foo: {}, bar: {}, custom: {} },
    agentParamSettings: {
      custom: [],
      google: [
        {
          key: 'pressure',
          type: 'string',
          component: 'input',
        },
        {
          key: 'temperature',
          type: 'number',
          component: 'slider',
          default: 0.5,
          range: {
            min: 0,
            max: 2,
            step: 0.01,
          },
        },
      ],
    },
  };
});

jest.mock('@librechat/data-schemas', () => {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
  };
});

const axios = require('axios');
const { loadYaml } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const loadCustomConfig = require('./loadCustomConfig');

describe('loadCustomConfig', () => {
  const originalExit = process.exit;
  const mockExit = jest.fn((code) => {
    throw new Error(`process.exit called with "${code}"`);
  });

  beforeAll(() => {
    process.exit = mockExit;
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // Re-apply the exit mock implementation after resetAllMocks
    mockExit.mockImplementation((code) => {
      throw new Error(`process.exit called with "${code}"`);
    });
    delete process.env.CONFIG_PATH;
  });

  it('should return null and log error if remote config fetch fails', async () => {
    process.env.CONFIG_PATH = 'http://example.com/config.yaml';
    axios.get.mockRejectedValue(new Error('Network error'));
    const result = await loadCustomConfig();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should return null for an invalid local config file', async () => {
    process.env.CONFIG_PATH = 'localConfig.yaml';
    loadYaml.mockReturnValueOnce(null);
    const result = await loadCustomConfig();
    expect(result).toBeNull();
  });

  it('should parse, validate, and cache a valid local configuration', async () => {
    const mockConfig = {
      version: '1.0',
      cache: true,
      endpoints: {
        custom: [
          {
            name: 'mistral',
            apiKey: 'user_provided',
            baseURL: 'https://api.mistral.ai/v1',
          },
        ],
      },
    };
    process.env.CONFIG_PATH = 'validConfig.yaml';
    loadYaml.mockReturnValueOnce(mockConfig);
    const result = await loadCustomConfig();

    expect(result).toEqual(mockConfig);
  });

  it('should return null and log if config schema validation fails', async () => {
    const invalidConfig = { invalidField: true };
    process.env.CONFIG_PATH = 'invalidConfig.yaml';
    process.env.CONFIG_BYPASS_VALIDATION = 'true';
    loadYaml.mockReturnValueOnce(invalidConfig);

    const result = await loadCustomConfig();

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'CONFIG_BYPASS_VALIDATION is enabled. Continuing with default configuration despite validation errors.',
    );
    delete process.env.CONFIG_BYPASS_VALIDATION;
  });

  it('should call process.exit(1) when config validation fails without bypass', async () => {
    const invalidConfig = { invalidField: true };
    process.env.CONFIG_PATH = 'invalidConfig.yaml';
    loadYaml.mockReturnValueOnce(invalidConfig);

    await expect(loadCustomConfig()).rejects.toThrow('process.exit called with "1"');
    expect(logger.error).toHaveBeenCalledWith(
      'Exiting due to invalid configuration. Set CONFIG_BYPASS_VALIDATION=true to bypass this check.',
    );
  });

  it('should handle and return null on YAML parse error for a string response from remote', async () => {
    process.env.CONFIG_PATH = 'http://example.com/config.yaml';
    process.env.CONFIG_BYPASS_VALIDATION = 'true';
    axios.get.mockResolvedValue({ data: 'invalidYAMLContent' });

    const result = await loadCustomConfig();

    expect(result).toBeNull();
    delete process.env.CONFIG_BYPASS_VALIDATION;
  });

  it('should return the custom config object for a valid remote config file', async () => {
    const mockConfig = {
      version: '1.0',
      cache: true,
      endpoints: {
        custom: [
          {
            name: 'mistral',
            apiKey: 'user_provided',
            baseURL: 'https://api.mistral.ai/v1',
          },
        ],
      },
    };
    process.env.CONFIG_PATH = 'http://example.com/config.yaml';
    axios.get.mockResolvedValue({ data: mockConfig });
    const result = await loadCustomConfig();
    expect(result).toEqual(mockConfig);
  });

  it('should return null if the remote config file is not found', async () => {
    process.env.CONFIG_PATH = 'http://example.com/config.yaml';
    axios.get.mockRejectedValue({ response: { status: 404 } });
    const result = await loadCustomConfig();
    expect(result).toBeNull();
  });

  it('should return null if the local config file is not found', async () => {
    process.env.CONFIG_PATH = 'nonExistentConfig.yaml';
    loadYaml.mockReturnValueOnce(null);
    const result = await loadCustomConfig();
    expect(result).toBeNull();
  });

  it('should not cache the config if cache is set to false', async () => {
    const mockConfig = {
      version: '1.0',
      cache: false,
      endpoints: {
        custom: [
          {
            name: 'mistral',
            apiKey: 'user_provided',
            baseURL: 'https://api.mistral.ai/v1',
          },
        ],
      },
    };
    process.env.CONFIG_PATH = 'validConfig.yaml';
    loadYaml.mockReturnValueOnce(mockConfig);
    await loadCustomConfig();
  });

  it('should log the loaded custom config', async () => {
    const mockConfig = {
      version: '1.0',
      cache: true,
      endpoints: {
        custom: [
          {
            name: 'mistral',
            apiKey: 'user_provided',
            baseURL: 'https://api.mistral.ai/v1',
          },
        ],
      },
    };
    process.env.CONFIG_PATH = 'validConfig.yaml';
    loadYaml.mockReturnValueOnce(mockConfig);
    await loadCustomConfig();
    expect(logger.info).toHaveBeenCalledWith('Custom config file loaded:');
    expect(logger.info).toHaveBeenCalledWith(JSON.stringify(mockConfig, null, 2));
    expect(logger.debug).toHaveBeenCalledWith('Custom config:', mockConfig);
  });

  describe('parseCustomParams', () => {
    const mockConfig = {
      version: '1.0',
      cache: false,
      endpoints: {
        custom: [
          {
            name: 'Google',
            apiKey: 'user_provided',
            customParams: {},
          },
        ],
      },
    };

    async function loadCustomParams(customParams) {
      mockConfig.endpoints.custom[0].customParams = customParams;
      loadYaml.mockReturnValue(mockConfig);
      return await loadCustomConfig();
    }

    beforeEach(() => {
      jest.resetAllMocks();
      process.env.CONFIG_PATH = 'validConfig.yaml';
    });

    it('returns no error when customParams is undefined', async () => {
      const result = await loadCustomParams(undefined);
      expect(result).toEqual(mockConfig);
    });

    it('returns no error when customParams is valid', async () => {
      const result = await loadCustomParams({
        defaultParamsEndpoint: 'google',
        paramDefinitions: [
          {
            key: 'temperature',
            default: 0.5,
          },
        ],
      });
      expect(result).toEqual(mockConfig);
    });

    it('throws an error when paramDefinitions contain unsupported keys', async () => {
      const malformedCustomParams = {
        defaultParamsEndpoint: 'google',
        paramDefinitions: [
          { key: 'temperature', default: 0.5 },
          { key: 'unsupportedKey', range: 0.5 },
        ],
      };
      await expect(loadCustomParams(malformedCustomParams)).rejects.toThrow(
        'paramDefinitions of "Google" endpoint contains invalid key(s). Valid parameter keys are pressure, temperature',
      );
    });

    it('throws an error when paramDefinitions is malformed', async () => {
      const malformedCustomParams = {
        defaultParamsEndpoint: 'google',
        paramDefinitions: [
          {
            key: 'temperature',
            type: 'noomba',
            component: 'inpoot',
            optionType: 'custom',
          },
        ],
      };
      await expect(loadCustomParams(malformedCustomParams)).rejects.toThrow(
        /Custom parameter definitions for "Google" endpoint is malformed:/,
      );
    });

    it('throws an error when defaultParamsEndpoint is not provided', async () => {
      const malformedCustomParams = { defaultParamsEndpoint: undefined };
      await expect(loadCustomParams(malformedCustomParams)).rejects.toThrow(
        'defaultParamsEndpoint of "Google" endpoint is invalid. Valid options are foo, bar, custom, google',
      );
    });

    it('fills the paramDefinitions with missing values', async () => {
      const customParams = {
        defaultParamsEndpoint: 'google',
        paramDefinitions: [
          { key: 'temperature', default: 0.7, range: { min: 0.1, max: 0.9, step: 0.1 } },
          { key: 'pressure', component: 'textarea' },
        ],
      };

      const parsedConfig = await loadCustomParams(customParams);
      const paramDefinitions = parsedConfig.endpoints.custom[0].customParams.paramDefinitions;
      expect(paramDefinitions).toEqual([
        {
          columnSpan: 1,
          component: 'slider',
          default: 0.7, // overridden
          includeInput: true,
          key: 'temperature',
          label: 'temperature',
          optionType: 'custom',
          range: {
            // overridden
            max: 0.9,
            min: 0.1,
            step: 0.1,
          },
          type: 'number',
        },
        {
          columnSpan: 1,
          component: 'textarea', // overridden
          key: 'pressure',
          label: 'pressure',
          optionType: 'custom',
          placeholder: '',
          type: 'string',
        },
      ]);
    });
  });

  describe('CONFIG_OVERRIDE_PATH', () => {
    const fs = require('fs');

    beforeEach(() => {
      jest.resetAllMocks();
      delete process.env.CONFIG_PATH;
      delete process.env.CONFIG_OVERRIDE_PATH;
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should merge override config when CONFIG_OVERRIDE_PATH is set and file exists', async () => {
      const baseConfig = {
        version: '1.0',
        cache: true,
        endpoints: {
          custom: [
            {
              name: 'mistral',
              apiKey: 'user_provided',
              baseURL: 'https://api.mistral.ai/v1',
            },
          ],
        },
      };

      const overrideConfig = {
        endpoints: {
          custom: [
            {
              name: 'mistral',
              apiKey: 'my_custom_key',
            },
          ],
        },
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(overrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(fs.existsSync).toHaveBeenCalled();
      expect(loadYaml).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Custom config merged from overrides.yaml');
      expect(result.endpoints.custom).toEqual([
        {
          name: 'mistral',
          apiKey: 'my_custom_key',
        },
      ]);
    });

    it('should handle absolute path for CONFIG_OVERRIDE_PATH', async () => {
      const baseConfig = {
        version: '1.0',
        cache: false,
      };

      const overrideConfig = {
        cache: true,
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = '/absolute/path/to/overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(overrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(result.cache).toBe(true);
    });

    it('should handle relative path for CONFIG_OVERRIDE_PATH', async () => {
      const baseConfig = {
        version: '1.0',
        cache: false,
      };

      const overrideConfig = {
        cache: true,
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'custom/overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(overrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(result.cache).toBe(true);
    });

    it('should not merge when CONFIG_OVERRIDE_PATH file does not exist', async () => {
      const baseConfig = {
        version: '1.0',
        cache: true,
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'nonexistent.yaml';

      loadYaml.mockReturnValueOnce(baseConfig);
      fs.existsSync.mockReturnValue(false);

      const result = await loadCustomConfig();

      expect(loadYaml).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Custom config merged from'),
      );
      expect(result).toEqual(baseConfig);
    });

    it('should not merge when override config is invalid (has reason field)', async () => {
      const baseConfig = {
        version: '1.0',
        cache: true,
      };

      const invalidOverrideConfig = {
        reason: 'Parse error',
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'invalid-overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(invalidOverrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Custom config merged from'),
      );
      expect(result).toEqual(baseConfig);
    });

    it('should not merge when override config is invalid (has stack field)', async () => {
      const baseConfig = {
        version: '1.0',
        cache: true,
      };

      const invalidOverrideConfig = {
        stack: 'Error stack trace',
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'invalid-overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(invalidOverrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Custom config merged from'),
      );
      expect(result).toEqual(baseConfig);
    });

    it('should work without CONFIG_OVERRIDE_PATH set', async () => {
      const baseConfig = {
        version: '1.0',
        cache: true,
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      // CONFIG_OVERRIDE_PATH not set

      loadYaml.mockReturnValueOnce(baseConfig);

      const result = await loadCustomConfig();

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(loadYaml).toHaveBeenCalledTimes(1);
      expect(result).toEqual(baseConfig);
    });

    it('should merge deep nested configurations', async () => {
      const baseConfig = {
        version: '1.0',
        endpoints: {
          openAI: {
            apiKey: 'user_provided',
            models: {
              default: ['gpt-3.5-turbo', 'gpt-4'],
            },
            titleConvo: true,
            summarize: false,
          },
        },
      };

      const overrideConfig = {
        endpoints: {
          openAI: {
            models: {
              default: ['gpt-4-turbo'],
            },
            summarize: true,
          },
        },
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(overrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(result.endpoints.openAI).toEqual({
        apiKey: 'user_provided',
        models: {
          default: ['gpt-4-turbo'],
        },
        titleConvo: true,
        summarize: true,
      });
    });

    it('should support $replace directive in override config', async () => {
      const baseConfig = {
        version: '1.0',
        endpoints: {
          openAI: {
            apiKey: 'user_provided',
            models: {
              default: ['gpt-3.5-turbo', 'gpt-4'],
            },
            titleConvo: true,
            summarize: false,
          },
        },
      };

      const overrideConfig = {
        endpoints: {
          openAI: {
            $replace: true,
            apiKey: 'my_key',
            baseURL: 'https://custom.openai.com/v1',
          },
        },
      };

      process.env.CONFIG_PATH = 'validConfig.yaml';
      process.env.CONFIG_OVERRIDE_PATH = 'overrides.yaml';

      loadYaml.mockReturnValueOnce(baseConfig).mockReturnValueOnce(overrideConfig);
      fs.existsSync.mockReturnValue(true);

      const result = await loadCustomConfig();

      expect(result.endpoints.openAI).toEqual({
        apiKey: 'my_key',
        baseURL: 'https://custom.openai.com/v1',
      });
      expect(result.endpoints.openAI).not.toHaveProperty('$replace');
    });
  });
});
