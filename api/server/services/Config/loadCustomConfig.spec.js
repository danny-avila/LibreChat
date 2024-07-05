jest.mock('axios');
jest.mock('~/cache/getLogStores');
jest.mock('~/utils/loadYaml');

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
});
