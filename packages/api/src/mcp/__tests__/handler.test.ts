import type { MCPOptions } from 'librechat-data-provider';
import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { MCPOAuthFlowMetadata, MCPOAuthHandler, MCPOAuthTokens } from '~/mcp/oauth';

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
  discoverAuthorizationServerMetadata: jest.fn(),
  discoverOAuthProtectedResourceMetadata: jest.fn(),
  registerClient: jest.fn(),
  exchangeAuthorization: jest.fn(),
}));

import {
  startAuthorization,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerClient,
  exchangeAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { FlowStateManager } from '../../flow/manager';

const mockStartAuthorization = startAuthorization as jest.MockedFunction<typeof startAuthorization>;
const mockDiscoverAuthorizationServerMetadata =
  discoverAuthorizationServerMetadata as jest.MockedFunction<
    typeof discoverAuthorizationServerMetadata
  >;
const mockDiscoverOAuthProtectedResourceMetadata =
  discoverOAuthProtectedResourceMetadata as jest.MockedFunction<
    typeof discoverOAuthProtectedResourceMetadata
  >;
const mockRegisterClient = registerClient as jest.MockedFunction<typeof registerClient>;
const mockExchangeAuthorization = exchangeAuthorization as jest.MockedFunction<
  typeof exchangeAuthorization
>;

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
        {},
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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

      await MCPOAuthHandler.initiateOAuthFlow(
        mockServerName,
        mockServerUrl,
        mockUserId,
        {},
        config,
      );

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

  describe('refreshOAuthTokens', () => {
    const mockRefreshToken = 'refresh-token-12345';
    const originalFetch = global.fetch;
    const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      mockFetch.mockClear();
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    describe('with stored metadata', () => {
      it('should use client_secret_post when server only supports that method', async () => {
        const metadata = {
          serverName: 'test-server',
          userId: 'user-123',
          serverUrl: 'https://auth.example.com',
          state: 'state-123',
          clientInfo: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            grant_types: ['authorization_code', 'refresh_token'],
            scope: 'read write',
          },
        };

        // Mock OAuth metadata discovery
        mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          response_types_supported: ['code'],
          jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        } as AuthorizationServerMetadata);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        const result = await MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {});

        // Verify the call was made without Authorization header
        expect(mockFetch).toHaveBeenCalledWith(
          'https://auth.example.com/oauth/token',
          expect.objectContaining({
            method: 'POST',
            headers: expect.not.objectContaining({
              Authorization: expect.any(String),
            }),
          }),
        );

        // Verify the body contains client_id and client_secret
        const callArgs = mockFetch.mock.calls[0];
        const body = callArgs[1]?.body as URLSearchParams;
        expect(body.toString()).toContain('client_id=test-client-id');
        expect(body.toString()).toContain('client_secret=test-client-secret');

        expect(result).toEqual({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          obtained_at: expect.any(Number),
          expires_at: expect.any(Number),
        });
      });

      it('should use client_secret_basic when server only supports that method', async () => {
        const metadata = {
          serverName: 'test-server',
          userId: 'user-123',
          serverUrl: 'https://auth.example.com',
          state: 'state-123',
          clientInfo: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            grant_types: ['authorization_code', 'refresh_token'],
            scope: 'read write',
          },
        };

        // Mock OAuth metadata discovery
        mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
          response_types_supported: ['code'],
          jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        } as AuthorizationServerMetadata);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {});

        const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;
        expect(mockFetch).toHaveBeenCalledWith(
          'https://auth.example.com/oauth/token',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
            body: expect.not.stringContaining('client_id='),
          }),
        );
      });

      it('should prefer client_secret_basic when both methods are supported', async () => {
        const metadata = {
          serverName: 'test-server',
          userId: 'user-123',
          serverUrl: 'https://auth.example.com',
          state: 'state-123',
          clientInfo: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            grant_types: ['authorization_code', 'refresh_token'],
          },
        };

        // Mock OAuth metadata discovery
        mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          response_types_supported: ['code'],
          jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        } as AuthorizationServerMetadata);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {});

        const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;
        expect(mockFetch).toHaveBeenCalledWith(
          'https://auth.example.com/oauth/token',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
          }),
        );
      });

      it('should default to client_secret_basic when no methods are advertised', async () => {
        const metadata = {
          serverName: 'test-server',
          userId: 'user-123',
          serverUrl: 'https://auth.example.com',
          state: 'state-123',
          clientInfo: {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            grant_types: ['authorization_code', 'refresh_token'],
          },
        };

        // Mock OAuth metadata discovery with no auth methods specified
        mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          // No token_endpoint_auth_methods_supported field
          response_types_supported: ['code'],
          jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        } as AuthorizationServerMetadata);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {});

        const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;
        expect(mockFetch).toHaveBeenCalledWith(
          'https://auth.example.com/oauth/token',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
          }),
        );
      });

      it('should include client_id in body for public clients (no secret)', async () => {
        const metadata = {
          serverName: 'test-server',
          userId: 'user-123',
          serverUrl: 'https://auth.example.com',
          state: 'state-123',
          clientInfo: {
            client_id: 'test-client-id',
            // No client_secret - public client
            grant_types: ['authorization_code', 'refresh_token'],
          },
        };

        // Mock OAuth metadata discovery
        mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oauth/authorize',
          token_endpoint: 'https://auth.example.com/oauth/token',
          token_endpoint_auth_methods_supported: ['none'],
          response_types_supported: ['code'],
          jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        } as AuthorizationServerMetadata);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {});

        // Verify the call was made without Authorization header
        expect(mockFetch).toHaveBeenCalledWith(
          'https://auth.example.com/oauth/token',
          expect.objectContaining({
            method: 'POST',
            headers: expect.not.objectContaining({
              Authorization: expect.any(String),
            }),
          }),
        );

        // Verify the body contains client_id (public client)
        const callArgs = mockFetch.mock.calls[0];
        const body = callArgs[1]?.body as URLSearchParams;
        expect(body.toString()).toContain('client_id=test-client-id');
      });
    });

    describe('with pre-configured OAuth settings', () => {
      it('should use client_secret_post when configured to only support that method', async () => {
        const config = {
          token_url: 'https://auth.example.com/oauth/token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          token_endpoint_auth_methods_supported: ['client_secret_post'],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(
          mockRefreshToken,
          { serverName: 'test-server' },
          {},
          config,
        );

        // Verify the call was made without Authorization header
        expect(mockFetch).toHaveBeenCalledWith(
          new URL('https://auth.example.com/oauth/token'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.not.objectContaining({
              Authorization: expect.any(String),
            }),
          }),
        );

        // Verify the body contains client_id and client_secret
        const callArgs = mockFetch.mock.calls[0];
        const body = callArgs[1]?.body as URLSearchParams;
        expect(body.toString()).toContain('client_id=test-client-id');
        expect(body.toString()).toContain('client_secret=test-client-secret');
      });

      it('should use client_secret_basic when configured to support that method', async () => {
        const config = {
          token_url: 'https://auth.example.com/oauth/token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(
          mockRefreshToken,
          { serverName: 'test-server' },
          {},
          config,
        );

        const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;
        expect(mockFetch).toHaveBeenCalledWith(
          new URL('https://auth.example.com/oauth/token'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
            body: expect.not.stringContaining('client_id='),
          }),
        );
      });

      it('should default to client_secret_basic when no auth methods configured', async () => {
        const config = {
          token_url: 'https://auth.example.com/oauth/token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          // No token_endpoint_auth_methods_supported field
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        } as Response);

        await MCPOAuthHandler.refreshOAuthTokens(
          mockRefreshToken,
          { serverName: 'test-server' },
          {},
          config,
        );

        const expectedAuth = `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`;
        expect(mockFetch).toHaveBeenCalledWith(
          new URL('https://auth.example.com/oauth/token'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
          }),
        );
      });
    });

    it('should throw error when refresh fails', async () => {
      const metadata = {
        serverName: 'test-server',
        userId: 'user-123',
        serverUrl: 'https://auth.example.com',
        state: 'state-123',
        clientInfo: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          grant_types: ['authorization_code', 'refresh_token'],
        },
      };

      // Mock OAuth metadata discovery
      mockDiscoverAuthorizationServerMetadata.mockResolvedValueOnce({
        token_endpoint: 'https://auth.example.com/oauth/token',
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      } as AuthorizationServerMetadata);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          '{"error":"invalid_request","error_description":"refresh_token.client_id: Field required"}',
      } as Response);

      await expect(
        MCPOAuthHandler.refreshOAuthTokens(mockRefreshToken, metadata, {}, {}),
      ).rejects.toThrow(
        'Token refresh failed: 400 Bad Request - {"error":"invalid_request","error_description":"refresh_token.client_id: Field required"}',
      );
    });
  });

  describe('revokeOAuthToken', () => {
    const mockServerName = 'test-server';
    const mockToken = 'test-token-12345';

    const originalFetch = global.fetch;
    const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      mockFetch.mockClear();
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('should successfully revoke an access token with client_secret_basic auth', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
        revocationEndpointAuthMethodsSupported: ['client_secret_basic'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'access', metadata);

      expect(mockFetch).toHaveBeenCalledWith(new URL('https://auth.example.com/oauth/revoke'), {
        method: 'POST',
        body: 'token=test-token-12345&token_type_hint=access_token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`,
        },
      });
    });

    it('should successfully revoke a refresh token with client_secret_basic auth', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
        revocationEndpointAuthMethodsSupported: ['client_secret_basic'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'refresh', metadata);

      expect(mockFetch).toHaveBeenCalledWith(new URL('https://auth.example.com/oauth/revoke'), {
        method: 'POST',
        body: 'token=test-token-12345&token_type_hint=refresh_token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`,
        },
      });
    });

    it('should successfully revoke an access token with client_secret_post auth', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
        revocationEndpointAuthMethodsSupported: ['client_secret_post'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'access', metadata);

      expect(mockFetch).toHaveBeenCalledWith(new URL('https://auth.example.com/oauth/revoke'), {
        method: 'POST',
        body: 'token=test-token-12345&token_type_hint=access_token&client_secret=test-client-secret&client_id=test-client-id',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });

    it('should fallback to /revoke endpoint when revocationEndpoint is not provided', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'refresh', metadata);

      expect(mockFetch).toHaveBeenCalledWith(
        new URL('https://auth.example.com/revoke'),
        expect.any(Object),
      );
    });

    it('should default to client_secret_basic auth when revocationEndpointAuthMethodsSupported is not provided', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'refresh', metadata);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
    });

    it('should throw an error when the revocation request fails', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 418,
      } as Response);

      await expect(
        MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'refresh', metadata),
      ).rejects.toThrow('Token revocation failed: HTTP 418');
    });

    it('should prioritize client_secret_basic over other auth methods', async () => {
      const metadata = {
        serverUrl: 'https://auth.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        revocationEndpoint: 'https://auth.example.com/oauth/revoke',
        revocationEndpointAuthMethodsSupported: [
          'client_secret_post',
          'client_secret_basic',
          'some_other_method',
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await MCPOAuthHandler.revokeOAuthToken(mockServerName, mockToken, 'refresh', metadata);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
    });
  });

  describe('Custom OAuth Headers', () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = mockFetch as unknown as typeof fetch;
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
      mockDiscoverAuthorizationServerMetadata.mockResolvedValue({
        issuer: 'http://example.com',
        authorization_endpoint: 'http://example.com/auth',
        token_endpoint: 'http://example.com/token',
        response_types_supported: ['code'],
      } as AuthorizationServerMetadata);
      mockStartAuthorization.mockResolvedValue({
        authorizationUrl: new URL('http://example.com/auth'),
        codeVerifier: 'test-verifier',
      });
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('passes headers to client registration', async () => {
      mockRegisterClient.mockImplementation(async (_, options) => {
        await options.fetchFn?.('http://example.com/register', {});
        return { client_id: 'test', redirect_uris: [] };
      });

      await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        'http://example.com',
        'user-123',
        { foo: 'bar' },
        {},
      );

      const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
      expect(headers.get('foo')).toBe('bar');
    });

    it('passes headers to discovery operations', async () => {
      mockDiscoverOAuthProtectedResourceMetadata.mockImplementation(async (_, __, fetchFn) => {
        await fetchFn?.('http://example.com/.well-known/oauth-protected-resource', {});
        return {
          resource: 'http://example.com',
          authorization_servers: ['http://auth.example.com'],
        };
      });

      await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        'http://example.com',
        'user-123',
        { foo: 'bar' },
        {},
      );

      const allHaveHeader = mockFetch.mock.calls.every((call) => {
        const headers = call[1]?.headers as Headers;
        return headers?.get('foo') === 'bar';
      });
      expect(allHaveHeader).toBe(true);
    });

    it('passes headers to token exchange', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          status: 'PENDING',
          metadata: {
            serverName: 'test-server',
            codeVerifier: 'test-verifier',
            clientInfo: {},
            metadata: {},
          } as MCPOAuthFlowMetadata,
        }),
        completeFlow: jest.fn(),
      } as unknown as FlowStateManager<MCPOAuthTokens>;

      mockExchangeAuthorization.mockImplementation(async (_, options) => {
        await options.fetchFn?.('http://example.com/token', {});
        return { access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 };
      });

      await MCPOAuthHandler.completeOAuthFlow('test-flow-id', 'test-auth-code', mockFlowManager, {
        foo: 'bar',
      });

      const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
      expect(headers.get('foo')).toBe('bar');
    });

    it('passes headers to token refresh', async () => {
      mockDiscoverAuthorizationServerMetadata.mockImplementation(async (_, options) => {
        await options?.fetchFn?.('http://example.com/.well-known/oauth-authorization-server', {});
        return {
          issuer: 'http://example.com',
          token_endpoint: 'http://example.com/token',
        } as AuthorizationServerMetadata;
      });

      await MCPOAuthHandler.refreshOAuthTokens(
        'test-refresh-token',
        {
          serverName: 'test-server',
          serverUrl: 'http://example.com',
          clientInfo: { client_id: 'test-client', client_secret: 'test-secret' },
        },
        { foo: 'bar' },
        {},
      );

      const discoveryCall = mockFetch.mock.calls.find((call) =>
        call[0].toString().includes('.well-known'),
      );
      expect(discoveryCall).toBeDefined();
      const headers = discoveryCall![1]?.headers as Headers;
      expect(headers.get('foo')).toBe('bar');
    });
  });
});
