jest.mock('~/server/services/Endpoints/custom/initialize', () => jest.fn(), { virtual: true });
jest.mock('~/server/services/Endpoints/anthropic/initialize', () => jest.fn(), { virtual: true });
jest.mock('~/server/services/Endpoints/bedrock/options', () => jest.fn(), { virtual: true });
jest.mock('~/server/services/Endpoints/openAI/initialize', () => jest.fn(), { virtual: true });
jest.mock('~/server/services/Endpoints/google/initialize', () => jest.fn(), { virtual: true });
jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      openAI: 'openAI',
      google: 'google',
      azureOpenAI: 'azureOpenAI',
      anthropic: 'anthropic',
      bedrock: 'bedrock',
    },
    KnownEndpoints: {
      poe: 'poe',
    },
  }),
  { virtual: true },
);
jest.mock(
  '@librechat/api',
  () => ({
    getCustomEndpointConfig: jest.fn(),
  }),
  { virtual: true },
);

const initCustom = require('~/server/services/Endpoints/custom/initialize');
const { getCustomEndpointConfig } = require('@librechat/api');
const { getProviderConfig } = require('./index');

describe('getProviderConfig', () => {
  const appConfig = { endpoints: { custom: [] } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats Poe as a known custom provider and returns custom initializer', () => {
    const customConfig = { name: 'Poe' };
    getCustomEndpointConfig.mockReturnValue(customConfig);

    const result = getProviderConfig({ provider: 'Poe', appConfig });

    expect(result.overrideProvider).toBe('poe');
    expect(result.getOptions).toBe(initCustom);
    expect(result.customEndpointConfig).toBe(customConfig);
    expect(getCustomEndpointConfig).toHaveBeenCalledWith({ endpoint: 'Poe', appConfig });
  });

  it('throws when Poe is configured but missing from app configuration', () => {
    getCustomEndpointConfig.mockReturnValue(undefined);

    expect(() => getProviderConfig({ provider: 'Poe', appConfig })).toThrow(
      'Provider Poe not supported',
    );
    expect(getCustomEndpointConfig).toHaveBeenCalledWith({ endpoint: 'Poe', appConfig });
  });
});
