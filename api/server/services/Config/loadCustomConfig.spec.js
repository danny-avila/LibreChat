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
  beforeEach(() => {
    jest.resetAllMocks();
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
    loadYaml.mockReturnValueOnce(invalidConfig);

    const result = await loadCustomConfig();

    expect(result).toBeNull();
  });

  it('should handle and return null on YAML parse error for a string response from remote', async () => {
    process.env.CONFIG_PATH = 'http://example.com/config.yaml';
    axios.get.mockResolvedValue({ data: 'invalidYAMLContent' });

    const result = await loadCustomConfig();

    expect(result).toBeNull();
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
});
