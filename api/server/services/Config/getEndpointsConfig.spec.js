jest.mock('~/cache/getLogStores');
jest.mock('./app');
jest.mock('./loadDefaultEConfig');

const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { getAppConfig } = require('./app');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const { getEndpointsConfig } = require('./getEndpointsConfig');

describe('getEndpointsConfig', () => {
  let mockCache;
  let mockRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    getLogStores.mockReturnValue(mockCache);

    mockRequest = {
      user: { id: 'test-user', role: 'user' },
      config: null,
    };
  });

  describe('Bedrock models with region', () => {
    it('should merge availableRegions into bedrock endpoint config', async () => {
      const defaultConfig = {
        [EModelEndpoint.bedrock]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.bedrock]: {
            availableRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          },
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.bedrock]).toHaveProperty('availableRegions');
      expect(result[EModelEndpoint.bedrock].availableRegions).toEqual([
        'us-east-1',
        'us-west-2',
        'eu-west-1',
      ]);
    });

    it('should handle bedrock endpoint when availableRegions is not defined', async () => {
      const defaultConfig = {
        [EModelEndpoint.bedrock]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.bedrock]: {},
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.bedrock]).toBeDefined();
      expect(result[EModelEndpoint.bedrock].availableRegions).toBeUndefined();
    });

    it('should not process bedrock config if endpoint config does not exist', async () => {
      const defaultConfig = {
        [EModelEndpoint.bedrock]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {},
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.bedrock]).toBeDefined();
      expect(result[EModelEndpoint.bedrock].availableRegions).toBeUndefined();
    });
  });

  describe('Google models with region', () => {
    it('should merge availableRegions into google endpoint config', async () => {
      const defaultConfig = {
        [EModelEndpoint.google]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.google]: {
            availableRegions: ['us-central1', 'europe-west1', 'asia-southeast1'],
          },
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.google]).toHaveProperty('availableRegions');
      expect(result[EModelEndpoint.google].availableRegions).toEqual([
        'us-central1',
        'europe-west1',
        'asia-southeast1',
      ]);
    });

    it('should handle google endpoint when availableRegions is not defined', async () => {
      const defaultConfig = {
        [EModelEndpoint.google]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.google]: {},
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.google]).toBeDefined();
      expect(result[EModelEndpoint.google].availableRegions).toBeUndefined();
    });

    it('should not process google config if endpoint config does not exist', async () => {
      const defaultConfig = {
        [EModelEndpoint.google]: {
          userProvide: false,
          order: 1,
        },
      };

      const appConfig = {
        endpoints: {},
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.google]).toBeDefined();
      expect(result[EModelEndpoint.google].availableRegions).toBeUndefined();
    });
  });

  describe('Both Bedrock and Google models with regions', () => {
    it('should merge availableRegions for both bedrock and google endpoints', async () => {
      const defaultConfig = {
        [EModelEndpoint.bedrock]: {
          userProvide: false,
          order: 1,
        },
        [EModelEndpoint.google]: {
          userProvide: false,
          order: 2,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.bedrock]: {
            availableRegions: ['us-east-1', 'eu-west-1'],
          },
          [EModelEndpoint.google]: {
            availableRegions: ['us-central1', 'europe-west1'],
          },
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.bedrock].availableRegions).toEqual(['us-east-1', 'eu-west-1']);
      expect(result[EModelEndpoint.google].availableRegions).toEqual([
        'us-central1',
        'europe-west1',
      ]);
    });
  });

  describe('Cache behavior', () => {
    it('should return cached config if available', async () => {
      const cachedConfig = {
        [EModelEndpoint.google]: {
          availableRegions: ['us-central1'],
        },
      };

      mockCache.get.mockResolvedValue(cachedConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result).toEqual(cachedConfig);
      expect(loadDefaultEndpointsConfig).not.toHaveBeenCalled();
    });

    it('should cache the generated config', async () => {
      const defaultConfig = {
        [EModelEndpoint.google]: {
          userProvide: false,
        },
      };

      const appConfig = {
        endpoints: {
          [EModelEndpoint.google]: {
            availableRegions: ['us-central1'],
          },
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);
      getAppConfig.mockResolvedValue(appConfig);

      await getEndpointsConfig(mockRequest);

      expect(mockCache.set).toHaveBeenCalledWith(CacheKeys.ENDPOINT_CONFIG, expect.any(Object));
    });
  });

  describe('Request config preference', () => {
    it('should use request config if available instead of fetching app config', async () => {
      const requestConfig = {
        endpoints: {
          [EModelEndpoint.google]: {
            availableRegions: ['request-region'],
          },
        },
      };

      mockRequest.config = requestConfig;

      const defaultConfig = {
        [EModelEndpoint.google]: {
          userProvide: false,
        },
      };

      loadDefaultEndpointsConfig.mockResolvedValue(defaultConfig);

      const result = await getEndpointsConfig(mockRequest);

      expect(result[EModelEndpoint.google].availableRegions).toEqual(['request-region']);
      expect(getAppConfig).not.toHaveBeenCalled();
    });
  });
});
