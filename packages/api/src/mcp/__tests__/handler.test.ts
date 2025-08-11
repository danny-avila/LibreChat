import type { MCPOptions } from 'librechat-data-provider';
import { MCPOAuthHandler } from '~/mcp/oauth';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  startAuthorization: jest.fn(),
}));

import { startAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';

const mockStartAuthorization = startAuthorization as jest.MockedFunction<typeof startAuthorization>;

describe('MCPOAuthHandler - Configurable OAuth Metadata', () => {
  const mockServerName = 'test-server';
  const mockServerUrl = 'https://example.com/mcp';
  const mockUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DOMAIN_SERVER = 'http://localhost:3080';

    // Mock startAuthorization to return a successful response
    mockStartAuthorization.mockResolvedValue({
      authorizationUrl: new URL('https://auth.example.com/oauth/authorize?client_id=test'),
      codeVerifier: 'test-code-verifier',
    });
  });

  afterEach(() => {
    delete process.env.DOMAIN_SERVER;
  });

  describe('Pre-configured OAuth Metadata Fields', () => {
    const baseConfig: MCPOptions['oauth'] = {
      authorization_url: 'https://auth.example.com/oauth/authorize',
      token_url: 'https://auth.example.com/oauth/token',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
    };

    it('should use default values when OAuth metadata fields are not configured', async () => {
      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        baseConfig,
      );

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            response_types_supported: ['code'],
            code_challenge_methods_supported: ['S256', 'plain'],
          }),
        }),
      );
    });

    it('should use custom grant_types_supported when provided', async () => {
      const config = {
        ...baseConfig,
        grant_types_supported: ['authorization_code'],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            grant_types_supported: ['authorization_code'],
          }),
        }),
      );
    });

    it('should use custom token_endpoint_auth_methods_supported when provided', async () => {
      const config = {
        ...baseConfig,
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          }),
        }),
      );
    });

    it('should use custom response_types_supported when provided', async () => {
      const config = {
        ...baseConfig,
        response_types_supported: ['code', 'token'],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            response_types_supported: ['code', 'token'],
          }),
        }),
      );
    });

    it('should use custom code_challenge_methods_supported when provided', async () => {
      const config = {
        ...baseConfig,
        code_challenge_methods_supported: ['S256'],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            code_challenge_methods_supported: ['S256'],
          }),
        }),
      );
    });

    it('should use all custom OAuth metadata fields when provided together', async () => {
      const config = {
        ...baseConfig,
        grant_types_supported: ['authorization_code', 'client_credentials'],
        token_endpoint_auth_methods_supported: ['none'],
        response_types_supported: ['code', 'token', 'id_token'],
        code_challenge_methods_supported: ['S256'],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            grant_types_supported: ['authorization_code', 'client_credentials'],
            token_endpoint_auth_methods_supported: ['none'],
            response_types_supported: ['code', 'token', 'id_token'],
            code_challenge_methods_supported: ['S256'],
          }),
        }),
      );
    });

    it('should handle empty arrays as valid custom values', async () => {
      const config = {
        ...baseConfig,
        grant_types_supported: [],
        token_endpoint_auth_methods_supported: [],
        response_types_supported: [],
        code_challenge_methods_supported: [],
      };

      await MCPOAuthHandler.initiateOAuthFlow(mockServerName, mockServerUrl, mockUserId, config);

      expect(mockStartAuthorization).toHaveBeenCalledWith(
        mockServerUrl,
        expect.objectContaining({
          metadata: expect.objectContaining({
            grant_types_supported: [],
            token_endpoint_auth_methods_supported: [],
            response_types_supported: [],
            code_challenge_methods_supported: [],
          }),
        }),
      );
    });
  });
});
