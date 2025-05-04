jest.mock('axios');
jest.mock('~/cache/getLogStores');
jest.mock('~/utils/loadYaml');
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    agentSettings: {
      custom: [],
      google: [
        {
          key: 'maxContextTokens',
          type: 'number',
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
        {
          key: 'topP',
          type: 'number',
          component: 'slider',
          default: 1,
          range: {
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      ],
    },
  };
});

const axios = require('axios');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const loadYaml = require('~/utils/loadYaml');
const { logger } = require('~/config');

describe('loadCustomConfig', () => {
  const mockSet = jest.fn();
  const mockCache = { set: mockSet };

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.CONFIG_PATH;
    getLogStores.mockReturnValue(mockCache);
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
    expect(mockSet).toHaveBeenCalledWith(expect.anything(), mockConfig);
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
    expect(mockSet).toHaveBeenCalledWith(expect.anything(), mockConfig);
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
    expect(mockSet).not.toHaveBeenCalled();
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

    async function loadCustomParams (customParams) {
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
        paramDefinitions: [{
          key: 'temperature',
          default: 0.5,
        }],
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
        'paramDefinitions of "Google" endpoint contains invalid key(s). Valid parameter keys are maxContextTokens, temperature, topP',
      );
    });

    it('throws an error when paramDefinitions is malformed', async () => {
      const malformedCustomParams = {
        defaultParamsEndpoint: 'google',
        paramDefinitions: [{
          key: 'temperature',
          type: 'noomba',
          component: 'inpoot',
          optionType: 'custom',
        }],
      };
      await expect(loadCustomParams(malformedCustomParams)).rejects.toThrow(
        /Custom parameter definitions for "Google" endpoint is malformed:/,
      );
    });

    it('throws an error when defaultParamsEndpoint is of the wrong type', async () => {
      const malformedCustomParams = { defaultParamsEndpoint: 'foo' };
      await expect(loadCustomParams(malformedCustomParams)).rejects.toThrow(
        'defaultParamsEndpoint of "Google" endpoint is invalid. Valid options are custom, google',
      );
    });

    it('fills the paraDefinitions with overridden values', async () => {
      const customParams = {
        defaultParamsEndpoint: 'google',
        paramDefinitions: [
          { key: 'temperature', default: 0.7, range: { min: 0.1, max: 0.9, step: 0.1 } },
          { key: 'maxContextTokens', default: 100 },
        ],
      };

      const parsedConfig = await loadCustomParams(customParams);
      const paramDefinitions = parsedConfig.endpoints.custom[0].customParams.paramDefinitions;
      expect (paramDefinitions).toEqual([
        {
          'key': 'maxContextTokens',
          'columnSpan': 1,
          'component': 'input',
          'default': 100, // added
          'label': 'maxContextTokens',
          'optionType': 'custom',
          'placeholder': '',
          'type': 'number',
        },
        {
          'key': 'temperature',
          'columnSpan': 1,
          'component': 'slider',
          'default': 0.7, // overridden
          'includeInput': true,
          'label': 'temperature',
          'optionType': 'custom',
          'range': { // overridden
            'max': 0.9,
            'min': 0.1,
            'step': 0.1,
          },
          'type': 'number',
        },
        {
          'key': 'topP',
          'columnSpan': 1,
          'component': 'slider',
          'default': 1,
          'includeInput': true,
          'label': 'topP',
          'optionType': 'custom',
          'range': {
            'max': 1,
            'min': 0,
            'step': 0.01,
          },
          'type': 'number',
        },
      ]);
    });
  });
});
