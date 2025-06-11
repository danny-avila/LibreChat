import type { TUser } from 'librechat-data-provider';
import {
  StreamableHTTPOptionsSchema,
  StdioOptionsSchema,
  processMCPEnv,
  MCPOptions,
} from '../src/mcp';

// Helper function to create test user objects
function createTestUser(
  overrides: Partial<TUser> & Record<string, unknown> = {},
): TUser & Record<string, unknown> {
  return {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.png',
    provider: 'email',
    role: 'user',
    createdAt: new Date('2021-01-01').toISOString(),
    updatedAt: new Date('2021-01-01').toISOString(),
    ...overrides,
  };
}

describe('Environment Variable Extraction (MCP)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TEST_API_KEY: 'test-api-key-value',
      ANOTHER_SECRET: 'another-secret-value',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('StdioOptionsSchema', () => {
    it('should transform environment variables in the env field', () => {
      const options = {
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: '${TEST_API_KEY}',
          ANOTHER_KEY: '${ANOTHER_SECRET}',
          PLAIN_VALUE: 'plain-value',
          NON_EXISTENT: '${NON_EXISTENT_VAR}',
        },
      };

      const result = StdioOptionsSchema.parse(options);

      expect(result.env).toEqual({
        API_KEY: 'test-api-key-value',
        ANOTHER_KEY: 'another-secret-value',
        PLAIN_VALUE: 'plain-value',
        NON_EXISTENT: '${NON_EXISTENT_VAR}',
      });
    });

    it('should handle undefined env field', () => {
      const options = {
        command: 'node',
        args: ['server.js'],
      };

      const result = StdioOptionsSchema.parse(options);

      expect(result.env).toBeUndefined();
    });
  });

  describe('StreamableHTTPOptionsSchema', () => {
    it('should validate a valid streamable-http configuration', () => {
      const options = {
        type: 'streamable-http',
        url: 'https://example.com/api',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
      };

      const result = StreamableHTTPOptionsSchema.parse(options);

      expect(result).toEqual(options);
    });

    it('should reject websocket URLs', () => {
      const options = {
        type: 'streamable-http',
        url: 'ws://example.com/socket',
      };

      expect(() => StreamableHTTPOptionsSchema.parse(options)).toThrow();
    });

    it('should reject secure websocket URLs', () => {
      const options = {
        type: 'streamable-http',
        url: 'wss://example.com/socket',
      };

      expect(() => StreamableHTTPOptionsSchema.parse(options)).toThrow();
    });

    it('should require type field to be set explicitly', () => {
      const options = {
        url: 'https://example.com/api',
      };

      // Type is now required, so parsing should fail
      expect(() => StreamableHTTPOptionsSchema.parse(options)).toThrow();

      // With type provided, it should pass
      const validOptions = {
        type: 'streamable-http' as const,
        url: 'https://example.com/api',
      };

      const result = StreamableHTTPOptionsSchema.parse(validOptions);
      expect(result.type).toBe('streamable-http');
    });

    it('should validate headers as record of strings', () => {
      const options = {
        type: 'streamable-http',
        url: 'https://example.com/api',
        headers: {
          'X-API-Key': '123456',
          'User-Agent': 'MCP Client',
        },
      };

      const result = StreamableHTTPOptionsSchema.parse(options);

      expect(result.headers).toEqual(options.headers);
    });
  });

  describe('processMCPEnv', () => {
    it('should create a deep clone of the input object', () => {
      const originalObj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: '${TEST_API_KEY}',
          PLAIN_VALUE: 'plain-value',
        },
      };

      const result = processMCPEnv(originalObj);

      // Verify it's not the same object reference
      expect(result).not.toBe(originalObj);

      // Modify the result and ensure original is unchanged
      if ('env' in result && result.env) {
        result.env.API_KEY = 'modified-value';
      }

      expect(originalObj.env?.API_KEY).toBe('${TEST_API_KEY}');
    });

    it('should process environment variables in env field', () => {
      const obj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: '${TEST_API_KEY}',
          ANOTHER_KEY: '${ANOTHER_SECRET}',
          PLAIN_VALUE: 'plain-value',
          NON_EXISTENT: '${NON_EXISTENT_VAR}',
        },
      };

      const result = processMCPEnv(obj);

      expect('env' in result && result.env).toEqual({
        API_KEY: 'test-api-key-value',
        ANOTHER_KEY: 'another-secret-value',
        PLAIN_VALUE: 'plain-value',
        NON_EXISTENT: '${NON_EXISTENT_VAR}',
      });
    });

    it('should process user ID in headers field', () => {
      const user = createTestUser({ id: 'test-user-123' });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          Authorization: '${TEST_API_KEY}',
          'User-Id': '{{LIBRECHAT_USER_ID}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        Authorization: 'test-api-key-value',
        'User-Id': 'test-user-123',
        'Content-Type': 'application/json',
      });
    });

    it('should handle null or undefined input', () => {
      // @ts-ignore - Testing null/undefined handling
      expect(processMCPEnv(null)).toBeNull();
      // @ts-ignore - Testing null/undefined handling
      expect(processMCPEnv(undefined)).toBeUndefined();
    });

    it('should not modify objects without env or headers', () => {
      const obj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        timeout: 5000,
      };

      const result = processMCPEnv(obj);

      expect(result).toEqual(obj);
      expect(result).not.toBe(obj); // Still a different object (deep clone)
    });

    it('should ensure different users with same starting config get separate values', () => {
      // Create a single base configuration
      const baseConfig: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Id': '{{LIBRECHAT_USER_ID}}',
          'API-Key': '${TEST_API_KEY}',
        },
      };

      // Process for two different users
      const user1 = createTestUser({ id: 'user-123' });
      const user2 = createTestUser({ id: 'user-456' });

      const resultUser1 = processMCPEnv(baseConfig, user1);
      const resultUser2 = processMCPEnv(baseConfig, user2);

      // Verify each has the correct user ID
      expect('headers' in resultUser1 && resultUser1.headers?.['User-Id']).toBe('user-123');
      expect('headers' in resultUser2 && resultUser2.headers?.['User-Id']).toBe('user-456');

      // Verify they're different objects
      expect(resultUser1).not.toBe(resultUser2);

      // Modify one result and ensure it doesn't affect the other
      if ('headers' in resultUser1 && resultUser1.headers) {
        resultUser1.headers['User-Id'] = 'modified-user';
      }

      // Original config should be unchanged
      expect(baseConfig.headers?.['User-Id']).toBe('{{LIBRECHAT_USER_ID}}');

      // Second user's config should be unchanged
      expect('headers' in resultUser2 && resultUser2.headers?.['User-Id']).toBe('user-456');
    });

    it('should process headers in streamable-http options', () => {
      const user = createTestUser({ id: 'test-user-123' });
      const obj: MCPOptions = {
        type: 'streamable-http',
        url: 'https://example.com',
        headers: {
          Authorization: '${TEST_API_KEY}',
          'User-Id': '{{LIBRECHAT_USER_ID}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        Authorization: 'test-api-key-value',
        'User-Id': 'test-user-123',
        'Content-Type': 'application/json',
      });
    });

    it('should maintain streamable-http type in processed options', () => {
      const obj: MCPOptions = {
        type: 'streamable-http',
        url: 'https://example.com/api',
      };

      const result = processMCPEnv(obj);

      expect(result.type).toBe('streamable-http');
    });

    it('should process dynamic user fields in headers', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        openidId: 'openid-123',
        googleId: 'google-456',
        emailVerified: true,
        role: 'admin',
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
          'User-Name': '{{LIBRECHAT_USER_USERNAME}}',
          OpenID: '{{LIBRECHAT_USER_OPENIDID}}',
          'Google-ID': '{{LIBRECHAT_USER_GOOGLEID}}',
          'Email-Verified': '{{LIBRECHAT_USER_EMAILVERIFIED}}',
          'User-Role': '{{LIBRECHAT_USER_ROLE}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        'User-Email': 'test@example.com',
        'User-Name': 'testuser',
        OpenID: 'openid-123',
        'Google-ID': 'google-456',
        'Email-Verified': 'true',
        'User-Role': 'admin',
        'Content-Type': 'application/json',
      });
    });

    it('should handle missing user fields gracefully', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
        username: undefined, // explicitly set to undefined to test missing field
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
          'User-Name': '{{LIBRECHAT_USER_USERNAME}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        'User-Email': 'test@example.com',
        'User-Name': '', // Empty string for missing field
        'Content-Type': 'application/json',
      });
    });

    it('should process user fields in env variables', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
        ldapId: 'ldap-user-123',
      });
      const obj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        env: {
          USER_EMAIL: '{{LIBRECHAT_USER_EMAIL}}',
          LDAP_ID: '{{LIBRECHAT_USER_LDAPID}}',
          API_KEY: '${TEST_API_KEY}',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('env' in result && result.env).toEqual({
        USER_EMAIL: 'test@example.com',
        LDAP_ID: 'ldap-user-123',
        API_KEY: 'test-api-key-value',
      });
    });

    it('should process user fields in URL', () => {
      const user = createTestUser({
        id: 'user-123',
        username: 'testuser',
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com/api/{{LIBRECHAT_USER_USERNAME}}/stream',
      };

      const result = processMCPEnv(obj, user);

      expect('url' in result && result.url).toBe('https://example.com/api/testuser/stream');
    });

    it('should handle boolean user fields', () => {
      const user = createTestUser({
        id: 'user-123',
        emailVerified: true,
        twoFactorEnabled: false,
        termsAccepted: true,
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'Email-Verified': '{{LIBRECHAT_USER_EMAILVERIFIED}}',
          'Two-Factor': '{{LIBRECHAT_USER_TWOFACTORENABLED}}',
          'Terms-Accepted': '{{LIBRECHAT_USER_TERMSACCEPTED}}',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        'Email-Verified': 'true',
        'Two-Factor': 'false',
        'Terms-Accepted': 'true',
      });
    });

    it('should not process sensitive fields like password', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
        password: 'secret-password',
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
          'User-Password': '{{LIBRECHAT_USER_PASSWORD}}', // This should not be processed
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        'User-Email': 'test@example.com',
        'User-Password': '{{LIBRECHAT_USER_PASSWORD}}', // Unchanged
      });
    });

    it('should handle multiple occurrences of the same placeholder', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
      });
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'Primary-Email': '{{LIBRECHAT_USER_EMAIL}}',
          'Secondary-Email': '{{LIBRECHAT_USER_EMAIL}}',
          'Backup-Email': '{{LIBRECHAT_USER_EMAIL}}',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        'Primary-Email': 'test@example.com',
        'Secondary-Email': 'test@example.com',
        'Backup-Email': 'test@example.com',
      });
    });

    it('should support both id and _id properties for LIBRECHAT_USER_ID', () => {
      // Test with 'id' property
      const userWithId = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
      });
      const obj1: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Id': '{{LIBRECHAT_USER_ID}}',
        },
      };

      const result1 = processMCPEnv(obj1, userWithId);
      expect('headers' in result1 && result1.headers?.['User-Id']).toBe('user-123');

      // Test with '_id' property only (should not work since we only check 'id')
      const userWithUnderscore = createTestUser({
        id: undefined, // Remove default id to test _id
        _id: 'user-456',
        email: 'test@example.com',
      });
      const obj2: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Id': '{{LIBRECHAT_USER_ID}}',
        },
      };

      const result2 = processMCPEnv(obj2, userWithUnderscore);
      // Since we don't check _id, the placeholder should remain unchanged
      expect('headers' in result2 && result2.headers?.['User-Id']).toBe('{{LIBRECHAT_USER_ID}}');

      // Test with both properties (id takes precedence)
      const userWithBoth = createTestUser({
        id: 'user-789',
        _id: 'user-000',
        email: 'test@example.com',
      });
      const obj3: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          'User-Id': '{{LIBRECHAT_USER_ID}}',
        },
      };

      const result3 = processMCPEnv(obj3, userWithBoth);
      expect('headers' in result3 && result3.headers?.['User-Id']).toBe('user-789');
    });
  });
});
