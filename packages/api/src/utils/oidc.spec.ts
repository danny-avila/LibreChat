import { extractOpenIDTokenInfo, isOpenIDTokenValid, processOpenIDPlaceholders } from './oidc';
import type { TUser } from 'librechat-data-provider';

describe('OpenID Token Utilities', () => {
  describe('extractOpenIDTokenInfo', () => {
    it('should extract token info from user with federatedTokens', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        email: 'test@example.com',
        name: 'Test User',
        federatedTokens: {
          access_token: 'access-token-value',
          id_token: 'id-token-value',
          refresh_token: 'refresh-token-value',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = extractOpenIDTokenInfo(user);

      expect(result).toMatchObject({
        accessToken: 'access-token-value',
        idToken: 'id-token-value',
        userId: expect.any(String),
        userEmail: 'test@example.com',
        userName: 'Test User',
      });
      expect(result?.expiresAt).toBeDefined();
    });

    it('should return null when user is undefined', () => {
      const result = extractOpenIDTokenInfo(undefined);
      expect(result).toBeNull();
    });

    it('should return null when user is not OpenID provider', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'email',
      };

      const result = extractOpenIDTokenInfo(user);
      expect(result).toBeNull();
    });

    it('should return token info when user has no federatedTokens but is OpenID provider', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        email: 'test@example.com',
        name: 'Test User',
      };

      const result = extractOpenIDTokenInfo(user);

      expect(result).toMatchObject({
        userId: 'oidc-sub-456',
        userEmail: 'test@example.com',
        userName: 'Test User',
      });
      expect(result?.accessToken).toBeUndefined();
      expect(result?.idToken).toBeUndefined();
    });

    it('should extract partial token info when some tokens are missing', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        email: 'test@example.com',
        federatedTokens: {
          access_token: 'access-token-value',
          id_token: undefined,
          refresh_token: undefined,
          expires_at: undefined,
        },
      };

      const result = extractOpenIDTokenInfo(user);

      expect(result).toMatchObject({
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
        userEmail: 'test@example.com',
      });
    });

    it('should prioritize openidId over regular id', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        federatedTokens: {
          access_token: 'access-token-value',
        },
      };

      const result = extractOpenIDTokenInfo(user);

      expect(result?.userId).toBe('oidc-sub-456');
    });

    it('should fall back to regular id when openidId is not available', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        federatedTokens: {
          access_token: 'access-token-value',
        },
      };

      const result = extractOpenIDTokenInfo(user);

      expect(result?.userId).toBe('user-123');
    });
  });

  describe('isOpenIDTokenValid', () => {
    it('should return false when tokenInfo is null', () => {
      expect(isOpenIDTokenValid(null)).toBe(false);
    });

    it('should return false when tokenInfo has no accessToken', () => {
      const tokenInfo = {
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(false);
    });

    it('should return true when token has access token and no expiresAt', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(true);
    });

    it('should return true when token has not expired', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const tokenInfo = {
        accessToken: 'access-token-value',
        expiresAt: futureTimestamp,
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(true);
    });

    it('should return false when token has expired', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const tokenInfo = {
        accessToken: 'access-token-value',
        expiresAt: pastTimestamp,
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(false);
    });

    it('should return false when token expires exactly now', () => {
      const nowTimestamp = Math.floor(Date.now() / 1000);
      const tokenInfo = {
        accessToken: 'access-token-value',
        expiresAt: nowTimestamp,
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(false);
    });

    it('should return true when token is just about to expire (within 1 second)', () => {
      const almostExpiredTimestamp = Math.floor(Date.now() / 1000) + 1;
      const tokenInfo = {
        accessToken: 'access-token-value',
        expiresAt: almostExpiredTimestamp,
        userId: 'oidc-sub-456',
      };

      expect(isOpenIDTokenValid(tokenInfo)).toBe(true);
    });
  });

  describe('processOpenIDPlaceholders', () => {
    it('should replace LIBRECHAT_OPENID_TOKEN with access token', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        idToken: 'id-token-value',
        userId: 'oidc-sub-456',
      };

      const input = 'Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Authorization: Bearer access-token-value');
    });

    it('should replace LIBRECHAT_OPENID_ACCESS_TOKEN with access token', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      const input = 'Token: {{LIBRECHAT_OPENID_ACCESS_TOKEN}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Token: access-token-value');
    });

    it('should replace LIBRECHAT_OPENID_ID_TOKEN with id token', () => {
      const tokenInfo = {
        idToken: 'id-token-value',
        userId: 'oidc-sub-456',
      };

      const input = 'ID Token: {{LIBRECHAT_OPENID_ID_TOKEN}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('ID Token: id-token-value');
    });

    it('should replace LIBRECHAT_OPENID_USER_ID with user id', () => {
      const tokenInfo = {
        userId: 'oidc-sub-456',
      };

      const input = 'User: {{LIBRECHAT_OPENID_USER_ID}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('User: oidc-sub-456');
    });

    it('should replace LIBRECHAT_OPENID_USER_EMAIL with user email', () => {
      const tokenInfo = {
        userEmail: 'test@example.com',
        userId: 'oidc-sub-456',
      };

      const input = 'Email: {{LIBRECHAT_OPENID_USER_EMAIL}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Email: test@example.com');
    });

    it('should replace LIBRECHAT_OPENID_USER_NAME with user name', () => {
      const tokenInfo = {
        userName: 'Test User',
        userId: 'oidc-sub-456',
      };

      const input = 'Name: {{LIBRECHAT_OPENID_USER_NAME}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Name: Test User');
    });

    it('should replace multiple placeholders in a single string', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        idToken: 'id-token-value',
        userId: 'oidc-sub-456',
        userEmail: 'test@example.com',
      };

      const input =
        'Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}, ID: {{LIBRECHAT_OPENID_ID_TOKEN}}, User: {{LIBRECHAT_OPENID_USER_ID}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe(
        'Authorization: Bearer access-token-value, ID: id-token-value, User: oidc-sub-456',
      );
    });

    it('should replace empty string when token field is undefined', () => {
      const tokenInfo = {
        accessToken: undefined,
        idToken: undefined,
        userId: 'oidc-sub-456',
      };

      const input =
        'Access: {{LIBRECHAT_OPENID_TOKEN}}, ID: {{LIBRECHAT_OPENID_ID_TOKEN}}, User: {{LIBRECHAT_OPENID_USER_ID}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Access: , ID: , User: oidc-sub-456');
    });

    it('should handle all placeholder types in one value', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        idToken: 'id-token-value',
        userId: 'oidc-sub-456',
        userEmail: 'test@example.com',
        userName: 'Test User',
        expiresAt: 1234567890,
      };

      const input = `
        Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}
        ID Token: {{LIBRECHAT_OPENID_ID_TOKEN}}
        Access Token (alt): {{LIBRECHAT_OPENID_ACCESS_TOKEN}}
        User ID: {{LIBRECHAT_OPENID_USER_ID}}
        User Email: {{LIBRECHAT_OPENID_USER_EMAIL}}
        User Name: {{LIBRECHAT_OPENID_USER_NAME}}
        Expires: {{LIBRECHAT_OPENID_EXPIRES_AT}}
      `;

      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toContain('Bearer access-token-value');
      expect(result).toContain('ID Token: id-token-value');
      expect(result).toContain('Access Token (alt): access-token-value');
      expect(result).toContain('User ID: oidc-sub-456');
      expect(result).toContain('User Email: test@example.com');
      expect(result).toContain('User Name: Test User');
      expect(result).toContain('Expires: 1234567890');
    });

    it('should not modify string when no placeholders are present', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      const input = 'Authorization: Bearer static-token';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Authorization: Bearer static-token');
    });

    it('should handle case-sensitive placeholders', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      // Wrong case should NOT be replaced
      const input = 'Token: {{librechat_openid_token}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Token: {{librechat_openid_token}}');
    });

    it('should handle multiple occurrences of the same placeholder', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      const input =
        'Primary: {{LIBRECHAT_OPENID_TOKEN}}, Secondary: {{LIBRECHAT_OPENID_TOKEN}}, Backup: {{LIBRECHAT_OPENID_TOKEN}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe(
        'Primary: access-token-value, Secondary: access-token-value, Backup: access-token-value',
      );
    });

    it('should handle token info with all fields undefined except userId', () => {
      const tokenInfo = {
        accessToken: undefined,
        idToken: undefined,
        userId: 'oidc-sub-456',
        userEmail: undefined,
        userName: undefined,
      };

      const input =
        'Access: {{LIBRECHAT_OPENID_TOKEN}}, ID: {{LIBRECHAT_OPENID_ID_TOKEN}}, User: {{LIBRECHAT_OPENID_USER_ID}}';
      const result = processOpenIDPlaceholders(input, tokenInfo);

      expect(result).toBe('Access: , ID: , User: oidc-sub-456');
    });

    it('should return original value when tokenInfo is null', () => {
      const input = 'Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}';
      const result = processOpenIDPlaceholders(input, null);

      expect(result).toBe('Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}');
    });

    it('should return original value when value is not a string', () => {
      const tokenInfo = {
        accessToken: 'access-token-value',
        userId: 'oidc-sub-456',
      };

      const result = processOpenIDPlaceholders(123 as unknown as string, tokenInfo);

      expect(result).toBe(123);
    });
  });

  describe('Integration: Full OpenID Token Flow', () => {
    it('should extract, validate, and process tokens correctly', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        email: 'test@example.com',
        name: 'Test User',
        federatedTokens: {
          access_token: 'access-token-value',
          id_token: 'id-token-value',
          refresh_token: 'refresh-token-value',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      // Step 1: Extract token info
      const tokenInfo = extractOpenIDTokenInfo(user);
      expect(tokenInfo).not.toBeNull();

      // Step 2: Validate token
      const isValid = isOpenIDTokenValid(tokenInfo!);
      expect(isValid).toBe(true);

      // Step 3: Process placeholders
      const input =
        'Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}, User: {{LIBRECHAT_OPENID_USER_ID}}';
      const result = processOpenIDPlaceholders(input, tokenInfo!);
      expect(result).toContain('Authorization: Bearer access-token-value');
      expect(result).toContain('User:');
    });

    it('should handle expired tokens correctly', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
        federatedTokens: {
          access_token: 'access-token-value',
          expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
      };

      const tokenInfo = extractOpenIDTokenInfo(user);
      expect(tokenInfo).not.toBeNull();

      const isValid = isOpenIDTokenValid(tokenInfo!);
      expect(isValid).toBe(false); // Token is expired

      // Even if expired, processOpenIDPlaceholders should still work
      // (validation is checked separately by the caller)
      const input = 'Authorization: Bearer {{LIBRECHAT_OPENID_TOKEN}}';
      const result = processOpenIDPlaceholders(input, tokenInfo!);
      expect(result).toBe('Authorization: Bearer access-token-value');
    });

    it('should handle user with no federatedTokens but still has OpenID provider', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'openid',
        openidId: 'oidc-sub-456',
      };

      const tokenInfo = extractOpenIDTokenInfo(user);
      expect(tokenInfo).not.toBeNull();
      expect(tokenInfo?.userId).toBe('oidc-sub-456');
      expect(tokenInfo?.accessToken).toBeUndefined();
    });

    it('should handle missing user', () => {
      const tokenInfo = extractOpenIDTokenInfo(undefined);
      expect(tokenInfo).toBeNull();
    });

    it('should handle non-OpenID users', () => {
      const user: Partial<TUser> = {
        id: 'user-123',
        provider: 'email',
      };

      const tokenInfo = extractOpenIDTokenInfo(user);
      expect(tokenInfo).toBeNull();
    });
  });
});
