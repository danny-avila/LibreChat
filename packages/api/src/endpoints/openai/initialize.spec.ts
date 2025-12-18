import { EModelEndpoint } from 'librechat-data-provider';
import { initializeOpenAI } from './initialize';
import type { BaseInitializeParams } from '~/types';

// Mock the azure utils module
jest.mock('~/utils/azure', () => {
  const actual = jest.requireActual('~/utils/azure');
  return {
    ...actual,
    getEntraIdAccessToken: jest.fn(),
    shouldUseEntraId: jest.fn(() => actual.shouldUseEntraId()),
  };
});

const { getEntraIdAccessToken, shouldUseEntraId } = require('~/utils/azure');

describe('initializeOpenAI', () => {
  const mockAppConfig = {
    endpoints: {
      openAI: {
        apiKey: 'test-key',
      },
      azureOpenAI: {
        apiKey: 'test-azure-key',
        modelNames: ['gpt-4-vision-preview', 'gpt-3.5-turbo', 'gpt-4'],
        modelGroupMap: {
          'gpt-4-vision-preview': {
            group: 'librechat-westus',
            deploymentName: 'gpt-4-vision-preview',
            version: '2024-02-15-preview',
          },
        },
        groupMap: {
          'librechat-westus': {
            apiKey: 'WESTUS_API_KEY',
            instanceName: 'librechat-westus',
            version: '2023-12-01-preview',
            models: {
              'gpt-4-vision-preview': {
                deploymentName: 'gpt-4-vision-preview',
                version: '2024-02-15-preview',
              },
            },
          },
        },
      },
    },
  };

  const mockDb = {
    getUserKeyValues: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.AZURE_OPENAI_USE_ENTRA_ID;
    delete process.env.AZURE_API_KEY;
    delete process.env.AZURE_OPENAI_API_INSTANCE_NAME;
    delete process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
    delete process.env.AZURE_OPENAI_API_VERSION;
  });

  describe('Entra ID Authentication', () => {
    const createParams = (overrides: Partial<BaseInitializeParams> = {}) => {
      const req = {
        body: {
          key: null,
          endpoint: EModelEndpoint.azureOpenAI,
          model: 'gpt-4-vision-preview',
        },
        user: { id: '123' },
        config: mockAppConfig,
      };

      return {
        req: req as any,
        endpoint: EModelEndpoint.azureOpenAI,
        model_parameters: {
          model: 'gpt-4-vision-preview',
        },
        db: mockDb as any,
        ...overrides,
      } as BaseInitializeParams;
    };

    beforeEach(() => {
      process.env.AZURE_OPENAI_USE_ENTRA_ID = 'true';
      process.env.AZURE_API_KEY = 'test-azure-api-key';
    });

    it('should use Entra ID authentication when AZURE_OPENAI_USE_ENTRA_ID is enabled', async () => {
      const mockToken = 'entra-token-12345';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockResolvedValue(mockToken);

      const params = createParams();
      const result = await initializeOpenAI(params);

      // Verify getEntraIdAccessToken was called
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
      expect(getEntraIdAccessToken).toHaveBeenCalledWith();

      // Verify Authorization header is set with correct format
      expect(result.configOptions?.defaultHeaders).toBeDefined();
      expect(result.configOptions?.defaultHeaders?.['Authorization']).toBe(`Bearer ${mockToken}`);

      // Verify apiKey is set to placeholder for Entra ID
      expect(result.llmConfig.apiKey).toBe('entra-id-placeholder');
      expect(result.llmConfig).toBeTruthy();
    });

    it('should set Authorization header with Bearer prefix for serverless deployments', async () => {
      const mockToken = 'serverless-entra-token';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockResolvedValue(mockToken);

      // Configure for serverless (no instanceName in groupMap means serverless)
      const serverlessConfig = {
        ...mockAppConfig,
        endpoints: {
          ...mockAppConfig.endpoints,
          azureOpenAI: {
            ...mockAppConfig.endpoints.azureOpenAI,
            groupMap: {
              'librechat-westus': {
                ...mockAppConfig.endpoints.azureOpenAI.groupMap['librechat-westus'],
                serverless: true,
                baseURL: 'https://librechat-westus.openai.azure.com',
              },
            },
          },
        },
      };

      const params = createParams({
        req: {
          body: {
            key: null,
            endpoint: EModelEndpoint.azureOpenAI,
            model: 'gpt-4-vision-preview',
          },
          user: { id: '123' },
          config: serverlessConfig,
        } as any,
      });

      const result = await initializeOpenAI(params);

      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
      expect(result.configOptions?.defaultHeaders?.['Authorization']).toBe(`Bearer ${mockToken}`);
      expect(result.configOptions?.defaultHeaders?.['api-key']).toBeUndefined();
    });

    it('should handle token refresh by calling getEntraIdAccessToken on each request', async () => {
      const firstToken = 'token-1';
      const secondToken = 'token-2';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken
        .mockResolvedValueOnce(firstToken)
        .mockResolvedValueOnce(secondToken);

      const params = createParams();

      // First call
      const result1 = await initializeOpenAI(params);
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
      expect(result1.configOptions?.defaultHeaders?.['Authorization']).toBe(`Bearer ${firstToken}`);

      // Second call (simulating token refresh)
      const result2 = await initializeOpenAI(params);
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(2);
      expect(result2.configOptions?.defaultHeaders?.['Authorization']).toBe(`Bearer ${secondToken}`);
    });

    it('should throw error when getEntraIdAccessToken fails', async () => {
      const errorMessage = 'Failed to get Entra ID access token';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockRejectedValue(new Error(errorMessage));

      const params = createParams();

      await expect(initializeOpenAI(params)).rejects.toThrow(errorMessage);
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should throw error when getEntraIdAccessToken returns null', async () => {
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockResolvedValue(null as any);

      const params = createParams();

      // The actual implementation may handle this differently, but we test the error path
      await expect(initializeOpenAI(params)).rejects.toThrow();
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors during token retrieval', async () => {
      const networkError = new Error('Network timeout');
      networkError.name = 'NetworkError';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockRejectedValue(networkError);

      const params = createParams();

      await expect(initializeOpenAI(params)).rejects.toThrow('Network timeout');
      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should set Authorization header for non-serverless Azure deployments', async () => {
      const mockToken = 'non-serverless-token';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockResolvedValue(mockToken);

      const params = createParams();
      const result = await initializeOpenAI(params);

      expect(getEntraIdAccessToken).toHaveBeenCalledTimes(1);
      expect(result.configOptions?.defaultHeaders?.['Authorization']).toBe(`Bearer ${mockToken}`);
      expect(result.llmConfig.apiKey).toBe('entra-id-placeholder');
    });

    it('should not call getEntraIdAccessToken when Entra ID is disabled', async () => {
      shouldUseEntraId.mockReturnValue(false);
      process.env.AZURE_OPENAI_USE_ENTRA_ID = 'false';

      const params = createParams();
      const result = await initializeOpenAI(params);

      expect(getEntraIdAccessToken).not.toHaveBeenCalled();
      expect(result.configOptions?.defaultHeaders?.['Authorization']).toBeUndefined();
      expect(result.llmConfig.apiKey).not.toBe('entra-id-placeholder');
    });

    it('should verify token format matches Bearer token specification', async () => {
      const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
      shouldUseEntraId.mockReturnValue(true);
      getEntraIdAccessToken.mockResolvedValue(mockToken);

      const params = createParams();
      const result = await initializeOpenAI(params);

      const authHeader = result.configOptions?.defaultHeaders?.['Authorization'];
      expect(authHeader).toMatch(/^Bearer\s+.+$/);
      expect(authHeader?.split(' ')[0]).toBe('Bearer');
      expect(authHeader?.split(' ')[1]).toBe(mockToken);
    });
  });
});
