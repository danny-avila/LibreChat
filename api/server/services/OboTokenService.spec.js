jest.mock('~/strategies/openidStrategy');
jest.mock('~/cache/getLogStores');
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const client = require('openid-client');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const getLogStores = require('~/cache/getLogStores');
const { exchangeOboToken } = require('./OboTokenService');

describe('OboTokenService', () => {
  let mockTokensCache;
  let mockOpenIdConfig;

  const mockUser = {
    openidId: 'oidc-sub-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokensCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    getLogStores.mockReturnValue(mockTokensCache);

    mockOpenIdConfig = {
      client_id: 'test-client-id',
      issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
    };
    getOpenIdConfig.mockReturnValue(mockOpenIdConfig);

    client.genericGrantRequest.mockResolvedValue({
      access_token: 'exchanged-obo-token',
      expires_in: 3600,
    });
  });

  describe('input validation', () => {
    it('should throw when user has no openidId', async () => {
      await expect(
        exchangeOboToken({ email: 'test@example.com' }, 'access-token', 'api://scope'),
      ).rejects.toThrow('User must be authenticated via OpenID to perform OBO token exchange');
    });

    it('should throw when accessToken is missing', async () => {
      await expect(exchangeOboToken(mockUser, '', 'api://scope')).rejects.toThrow(
        'Access token is required for OBO exchange',
      );
    });

    it('should throw when scopes are missing', async () => {
      await expect(exchangeOboToken(mockUser, 'access-token', '')).rejects.toThrow(
        'Scopes are required for OBO exchange',
      );
    });

    it('should throw when OpenID config is not available', async () => {
      getOpenIdConfig.mockReturnValue(null);

      await expect(exchangeOboToken(mockUser, 'access-token', 'api://scope')).rejects.toThrow(
        'OpenID configuration not available',
      );
    });
  });

  describe('cache behavior', () => {
    it('should return cached token when fromCache is true and cache hit', async () => {
      const cachedToken = {
        access_token: 'cached-obo-token',
        token_type: 'Bearer',
        expires_in: 1800,
        scope: 'api://mcp-server/Scope.Read',
      };
      mockTokensCache.get.mockResolvedValue(cachedToken);

      const result = await exchangeOboToken(
        mockUser,
        'access-token',
        'api://mcp-server/Scope.Read',
        true,
      );

      expect(result).toBe(cachedToken);
      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-123:api://mcp-server/Scope.Read');
      expect(client.genericGrantRequest).not.toHaveBeenCalled();
    });

    it('should skip cache when fromCache is false', async () => {
      const cachedToken = { access_token: 'cached-obo-token' };
      mockTokensCache.get.mockResolvedValue(cachedToken);

      const result = await exchangeOboToken(
        mockUser,
        'access-token',
        'api://mcp-server/Scope.Read',
        false,
      );

      expect(mockTokensCache.get).not.toHaveBeenCalled();
      expect(client.genericGrantRequest).toHaveBeenCalled();
      expect(result.access_token).toBe('exchanged-obo-token');
    });

    it('should default fromCache to true', async () => {
      mockTokensCache.get.mockResolvedValue(null);

      await exchangeOboToken(mockUser, 'access-token', 'api://scope');

      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-123:api://scope');
    });
  });

  describe('OBO token exchange', () => {
    it('should call genericGrantRequest with jwt-bearer grant type', async () => {
      await exchangeOboToken(mockUser, 'user-access-token', 'api://mcp-server/Tools.ReadWrite');

      expect(client.genericGrantRequest).toHaveBeenCalledWith(
        mockOpenIdConfig,
        'urn:ietf:params:oauth:grant-type:jwt-bearer',
        {
          scope: 'api://mcp-server/Tools.ReadWrite',
          assertion: 'user-access-token',
          requested_token_use: 'on_behalf_of',
        },
      );
    });

    it('should return token response with correct structure', async () => {
      const result = await exchangeOboToken(
        mockUser,
        'access-token',
        'api://mcp-server/Tools.ReadWrite',
      );

      expect(result).toEqual({
        access_token: 'exchanged-obo-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'api://mcp-server/Tools.ReadWrite',
      });
    });

    it('should cache the exchanged token with correct TTL', async () => {
      client.genericGrantRequest.mockResolvedValue({
        access_token: 'new-obo-token',
        expires_in: 1800,
      });

      await exchangeOboToken(mockUser, 'access-token', 'api://scope');

      expect(mockTokensCache.set).toHaveBeenCalledWith(
        'oidc-sub-123:api://scope',
        {
          access_token: 'new-obo-token',
          token_type: 'Bearer',
          expires_in: 1800,
          scope: 'api://scope',
        },
        1800 * 1000,
      );
    });

    it('should default expires_in to 3600 when not in response', async () => {
      client.genericGrantRequest.mockResolvedValue({
        access_token: 'no-expiry-token',
      });

      const result = await exchangeOboToken(mockUser, 'access-token', 'api://scope');

      expect(result.expires_in).toBe(3600);
      expect(mockTokensCache.set).toHaveBeenCalledWith(
        'oidc-sub-123:api://scope',
        expect.objectContaining({ expires_in: 3600 }),
        3600 * 1000,
      );
    });

    it('should propagate errors from genericGrantRequest', async () => {
      client.genericGrantRequest.mockRejectedValue(
        new Error('invalid_grant: AADSTS50013: Assertion failed signature validation'),
      );

      await expect(exchangeOboToken(mockUser, 'bad-token', 'api://scope')).rejects.toThrow(
        'invalid_grant: AADSTS50013: Assertion failed signature validation',
      );
    });
  });

  describe('cache key isolation', () => {
    it('should use different cache keys for different scopes', async () => {
      await exchangeOboToken(mockUser, 'access-token', 'api://server-a/Scope.A');
      await exchangeOboToken(mockUser, 'access-token', 'api://server-b/Scope.B');

      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-123:api://server-a/Scope.A');
      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-123:api://server-b/Scope.B');
    });

    it('should use different cache keys for different users', async () => {
      const otherUser = { openidId: 'oidc-sub-456', email: 'other@example.com' };

      await exchangeOboToken(mockUser, 'access-token', 'api://scope');
      await exchangeOboToken(otherUser, 'access-token', 'api://scope');

      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-123:api://scope');
      expect(mockTokensCache.get).toHaveBeenCalledWith('oidc-sub-456:api://scope');
    });
  });
});
