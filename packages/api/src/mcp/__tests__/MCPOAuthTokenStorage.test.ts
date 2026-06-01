/**
 * Integration tests for MCPTokenStorage.storeTokens() and MCPTokenStorage.getTokens().
 *
 * Uses InMemoryTokenStore to exercise encrypt/decrypt round-trips, expiry calculation,
 * refresh callback wiring, and ReauthenticationRequiredError paths.
 */

import { MCPTokenStorage, ReauthenticationRequiredError } from '~/mcp/oauth';
import { InMemoryTokenStore } from './helpers/oauthTestServer';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  encryptV2: jest.fn(async (val: string) => `enc:${val}`),
  decryptV2: jest.fn(async (val: string) => val.replace(/^enc:/, '')),
}));

describe('MCPTokenStorage', () => {
  let store: InMemoryTokenStore;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    jest.clearAllMocks();
  });

  describe('storeTokens', () => {
    it('should create new access token with expires_in', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      expect(saved!.token).toBe('enc:at1');
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(3500 * 1000);
      expect(expiresInMs).toBeLessThanOrEqual(3600 * 1000);
    });

    it('should create new access token with expires_at (MCPOAuthTokens format)', async () => {
      const expiresAt = Date.now() + 7200 * 1000;
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_at: expiresAt,
          obtained_at: Date.now(),
        },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      const diff = Math.abs(saved!.expiresAt.getTime() - expiresAt);
      expect(diff).toBeLessThan(2000);
    });

    it('should default to 1-year expiry when none provided', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer' },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(oneYearMs - 5000);
    });

    it('should update existing access token', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:old-token',
        expiresIn: 3600,
      });

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'new-token', token_type: 'Bearer', expires_in: 7200 },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved!.token).toBe('enc:new-token');
    });

    it('should store refresh token alongside access token', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'rt1',
        },
        createToken: store.createToken,
      });

      const refreshSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshSaved).not.toBeNull();
      expect(refreshSaved!.token).toBe('enc:rt1');
    });

    it('should skip refresh token when not in response', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
      });

      const refreshSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshSaved).toBeNull();
    });

    it('should store client info when provided', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
        clientInfo: { client_id: 'cid', client_secret: 'csec' },
      });

      const clientSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
      });
      expect(clientSaved).not.toBeNull();
      expect(clientSaved!.token).toContain('enc:');
      expect(clientSaved!.token).toContain('cid');
    });

    it('should use existingTokens to skip DB lookups', async () => {
      const findSpy = jest.fn();

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: findSpy,
        existingTokens: {
          accessToken: null,
          refreshToken: null,
          clientInfoToken: null,
        },
      });

      expect(findSpy).not.toHaveBeenCalled();
    });

    it('should handle invalid NaN expiry date', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_at: NaN,
          obtained_at: Date.now(),
        },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(oneYearMs - 5000);
    });
  });

  describe('getTokens', () => {
    it('should return valid non-expired tokens', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:valid-token',
        expiresIn: 3600,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('valid-token');
      expect(result!.token_type).toBe('Bearer');
    });

    it('should return tokens with refresh token when available', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:at',
        expiresIn: 3600,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.refresh_token).toBe('rt');
    });

    it('should return tokens without refresh token field when none stored', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:at',
        expiresIn: 3600,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.refresh_token).toBeUndefined();
    });

    it('should throw ReauthenticationRequiredError when expired and no refresh', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should throw ReauthenticationRequiredError when missing and no refresh', async () => {
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should refresh expired access token when refresh token and callback are available', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockResolvedValue({
        access_token: 'refreshed-at',
        token_type: 'Bearer',
        expires_in: 3600,
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600000,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('refreshed-at');
      expect(refreshTokens).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({ userId: 'u1', serverName: 'srv1' }),
      );
    });

    it('should return null when refresh fails', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('refresh failed'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(result).toBeNull();
    });

    it('should return null when no refreshTokens callback provided', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result).toBeNull();
    });

    it('should return null when no createToken callback provided', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        refreshTokens: jest.fn(),
      });

      expect(result).toBeNull();
    });

    it('should pass client info to refreshTokens metadata', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid","client_secret":"csec"}',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockResolvedValue({
        access_token: 'new-at',
        token_type: 'Bearer',
        expires_in: 3600,
      });

      await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(refreshTokens).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({
          clientInfo: expect.objectContaining({ client_id: 'cid' }),
        }),
      );
    });

    it('should handle unauthorized_client refresh error', async () => {
      const { logger } = await import('@librechat/data-schemas');

      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('unauthorized_client'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('does not support refresh tokens'),
      );
    });

    it('should delete client registration and refresh token on invalid_client when deleteTokens provided', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'ReauthenticationRequiredError',
          message: expect.stringContaining('stored client registration is no longer valid'),
        }),
      );

      const clientReg = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
      });
      expect(clientReg).toBeNull();

      const refreshToken = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshToken).toBeNull();
    });

    it('should return null and log warning on invalid_client when deleteTokens not provided', async () => {
      const { logger } = await import('@librechat/data-schemas');

      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('deleteTokens not available'),
      );
    });

    it('should handle client_not_found and other vendor-specific rejection patterns', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('client not found'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(
        await store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_client',
          identifier: 'mcp:srv1:client',
        }),
      ).toBeNull();
      expect(
        await store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_refresh',
          identifier: 'mcp:srv1:refresh',
        }),
      ).toBeNull();
    });

    it('should handle case-insensitive error messages for client rejection', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('INVALID_CLIENT'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should still throw ReauthenticationRequiredError when deleteClientRegistration fails', async () => {
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await store.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));
      const failingDeleteTokens = jest.fn().mockRejectedValue(new Error('DB connection lost'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: failingDeleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });
  });

  describe('storeTokens + getTokens round-trip', () => {
    it('should store and retrieve tokens with full encrypt/decrypt cycle', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'my-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'my-refresh-token',
        },
        createToken: store.createToken,
        clientInfo: { client_id: 'cid', client_secret: 'sec' },
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.access_token).toBe('my-access-token');
      expect(result!.refresh_token).toBe('my-refresh-token');
      expect(result!.token_type).toBe('Bearer');
      expect(result!.obtained_at).toBeDefined();
      expect(result!.expires_at).toBeDefined();
    });
  });
});
