import {
  MCPOptions,
  StdioOptionsSchema,
  StreamableHTTPOptionsSchema,
  SSEOptionsSchema,
  WebSocketOptionsSchema,
} from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import { processMCPEnv } from '~/utils/env';

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

    it('should accept "http" as an alias for "streamable-http"', () => {
      const options = {
        type: 'http',
        url: 'https://example.com/api',
        headers: {
          Authorization: 'Bearer token',
        },
      };

      const result = StreamableHTTPOptionsSchema.parse(options);

      expect(result.type).toBe('http');
      expect(result.url).toBe('https://example.com/api');
      expect(result.headers).toEqual(options.headers);
    });

    it('should reject websocket URLs with "http" type', () => {
      const options = {
        type: 'http',
        url: 'ws://example.com/socket',
      };

      expect(() => StreamableHTTPOptionsSchema.parse(options)).toThrow();
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

    it('should maintain http type in processed options', () => {
      const obj = {
        type: 'http' as const,
        url: 'https://example.com/api',
      };

      const result = processMCPEnv(obj as unknown as MCPOptions);

      expect(result.type).toBe('http');
    });

    it('should process headers in http options', () => {
      const user = createTestUser({ id: 'test-user-123' });
      const obj = {
        type: 'http' as const,
        url: 'https://example.com',
        headers: {
          Authorization: '${TEST_API_KEY}',
          'User-Id': '{{LIBRECHAT_USER_ID}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj as unknown as MCPOptions, user);

      expect('headers' in result && result.headers).toEqual({
        Authorization: 'test-api-key-value',
        'User-Id': 'test-user-123',
        'Content-Type': 'application/json',
      });
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

    it('should process customUserVars in env field', () => {
      const user = createTestUser();
      const customUserVars = {
        CUSTOM_VAR_1: 'custom-value-1',
        CUSTOM_VAR_2: 'custom-value-2',
      };
      const obj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        env: {
          VAR_A: '{{CUSTOM_VAR_1}}',
          VAR_B: 'Value with {{CUSTOM_VAR_2}}',
          VAR_C: '${TEST_API_KEY}',
          VAR_D: '{{LIBRECHAT_USER_EMAIL}}',
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);

      expect('env' in result && result.env).toEqual({
        VAR_A: 'custom-value-1',
        VAR_B: 'Value with custom-value-2',
        VAR_C: 'test-api-key-value',
        VAR_D: 'test@example.com',
      });
    });

    it('should process customUserVars in headers field', () => {
      const user = createTestUser();
      const customUserVars = {
        USER_TOKEN: 'user-specific-token',
        REGION: 'us-west-1',
      };
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com/api',
        headers: {
          Authorization: 'Bearer {{USER_TOKEN}}',
          'X-Region': '{{REGION}}',
          'X-System-Key': '${TEST_API_KEY}',
          'X-User-Id': '{{LIBRECHAT_USER_ID}}',
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);

      expect('headers' in result && result.headers).toEqual({
        Authorization: 'Bearer user-specific-token',
        'X-Region': 'us-west-1',
        'X-System-Key': 'test-api-key-value',
        'X-User-Id': 'test-user-id',
      });
    });

    it('should process customUserVars in URL field', () => {
      const user = createTestUser();
      const customUserVars = {
        API_VERSION: 'v2',
        TENANT_ID: 'tenant123',
      };
      const obj: MCPOptions = {
        type: 'websocket',
        url: 'wss://example.com/{{TENANT_ID}}/api/{{API_VERSION}}?user={{LIBRECHAT_USER_ID}}&key=${TEST_API_KEY}',
      };

      const result = processMCPEnv(obj, user, customUserVars);

      expect('url' in result && result.url).toBe(
        'wss://example.com/tenant123/api/v2?user=test-user-id&key=test-api-key-value',
      );
    });

    it('should process customUserVars in args field', () => {
      const user = createTestUser({
        id: 'user-123',
        email: 'test@example.com',
      });
      const customUserVars = {
        MY_API_KEY: 'user-provided-api-key-12345',
        PROFILE_NAME: 'production-profile',
      };
      const obj: MCPOptions = {
        command: 'npx',
        args: [
          '-y',
          '@smithery/cli@latest',
          'run',
          '@upstash/context7-mcp',
          '--key',
          '{{MY_API_KEY}}',
          '--profile',
          '{{PROFILE_NAME}}',
          '--user',
          '{{LIBRECHAT_USER_EMAIL}}',
        ],
      };

      const result = processMCPEnv(obj, user, customUserVars);

      expect('args' in result && result.args).toEqual([
        '-y',
        '@smithery/cli@latest',
        'run',
        '@upstash/context7-mcp',
        '--key',
        'user-provided-api-key-12345',
        '--profile',
        'production-profile',
        '--user',
        'test@example.com',
      ]);
    });

    it('should prioritize customUserVars over user fields and system env vars if placeholders are the same (though not recommended)', () => {
      // This tests the order of operations: customUserVars -> userFields -> systemEnv
      // BUt it's generally not recommended to have overlapping placeholder names.
      process.env.LIBRECHAT_USER_EMAIL = 'system-email-should-be-overridden';
      const user = createTestUser({ email: 'user-email-should-be-overridden' });
      const customUserVars = {
        LIBRECHAT_USER_EMAIL: 'custom-email-wins',
      };
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com/api',
        headers: {
          'Test-Email': '{{LIBRECHAT_USER_EMAIL}}', // Placeholder that could match custom, user, or system
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);
      expect('headers' in result && result.headers?.['Test-Email']).toBe('custom-email-wins');

      // Clean up env var
      delete process.env.LIBRECHAT_USER_EMAIL;
    });

    it('should handle customUserVars with no matching placeholders', () => {
      const user = createTestUser();
      const customUserVars = {
        UNUSED_VAR: 'unused-value',
      };
      const obj: MCPOptions = {
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: '${TEST_API_KEY}',
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);
      expect('env' in result && result.env).toEqual({
        API_KEY: 'test-api-key-value',
      });
    });

    it('should handle placeholders with no matching customUserVars (falling back to user/system vars)', () => {
      const user = createTestUser({ email: 'user-provided-email@example.com' });
      // No customUserVars provided or customUserVars is empty
      const customUserVars = {};
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com/api',
        headers: {
          'User-Email-Header': '{{LIBRECHAT_USER_EMAIL}}', // Should use user.email
          'System-Key-Header': '${TEST_API_KEY}', // Should use process.env.TEST_API_KEY
          'Non-Existent-Custom': '{{NON_EXISTENT_CUSTOM_VAR}}', // Should remain as placeholder
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);
      expect('headers' in result && result.headers).toEqual({
        'User-Email-Header': 'user-provided-email@example.com',
        'System-Key-Header': 'test-api-key-value',
        'Non-Existent-Custom': '{{NON_EXISTENT_CUSTOM_VAR}}',
      });
    });

    it('should correctly process a mix of all variable types', () => {
      const user = createTestUser({ id: 'userXYZ', username: 'john.doe' });
      const customUserVars = {
        CUSTOM_ENDPOINT_ID: 'ep123',
        ANOTHER_CUSTOM: 'another_val',
      };

      const obj = {
        type: 'streamable-http' as const,
        url: 'https://{{CUSTOM_ENDPOINT_ID}}.example.com/users/{{LIBRECHAT_USER_USERNAME}}',
        headers: {
          'X-Auth-Token': '{{CUSTOM_TOKEN_FROM_USER_SETTINGS}}', // Assuming this would be a custom var
          'X-User-ID': '{{LIBRECHAT_USER_ID}}',
          'X-System-Test-Key': '${TEST_API_KEY}', // Using existing env var from beforeEach
        },
        env: {
          PROCESS_MODE: '{{PROCESS_MODE_CUSTOM}}', // Another custom var
          USER_HOME_DIR: '/home/{{LIBRECHAT_USER_USERNAME}}',
          SYSTEM_PATH: '${PATH}', // Example of a system env var
        },
      };

      // Simulate customUserVars that would be passed, including those for headers and env
      const allCustomVarsForCall = {
        ...customUserVars,
        CUSTOM_TOKEN_FROM_USER_SETTINGS: 'secretToken123!',
        PROCESS_MODE_CUSTOM: 'production',
      };

      // Cast obj to MCPOptions when calling processMCPEnv.
      // This acknowledges the object might not strictly conform to one schema in the union,
      // but we are testing the function's ability to handle these properties if present.
      const result = processMCPEnv(obj as MCPOptions, user, allCustomVarsForCall);

      expect('url' in result && result.url).toBe('https://ep123.example.com/users/john.doe');
      expect('headers' in result && result.headers).toEqual({
        'X-Auth-Token': 'secretToken123!',
        'X-User-ID': 'userXYZ',
        'X-System-Test-Key': 'test-api-key-value', // Expecting value of TEST_API_KEY
      });
      expect('env' in result && result.env).toEqual({
        PROCESS_MODE: 'production',
        USER_HOME_DIR: '/home/john.doe',
        SYSTEM_PATH: process.env.PATH, // Actual value of PATH from the test environment
      });
    });

    it('should process GitHub MCP server configuration with PAT_TOKEN placeholder', () => {
      const user = createTestUser({ id: 'github-user-123', email: 'user@example.com' });
      const customUserVars = {
        PAT_TOKEN: 'ghp_1234567890abcdef1234567890abcdef12345678', // GitHub Personal Access Token
      };

      // Simulate the GitHub MCP server configuration from librechat.yaml
      const obj: MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: '{{PAT_TOKEN}}',
          'Content-Type': 'application/json',
          'User-Agent': 'LibreChat-MCP-Client',
        },
      };

      const result = processMCPEnv(obj, user, customUserVars);

      expect('headers' in result && result.headers).toEqual({
        Authorization: 'ghp_1234567890abcdef1234567890abcdef12345678',
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat-MCP-Client',
      });
      expect('url' in result && result.url).toBe('https://api.githubcopilot.com/mcp/');
      expect(result.type).toBe('streamable-http');
    });

    it('should handle GitHub MCP server configuration without PAT_TOKEN (placeholder remains)', () => {
      const user = createTestUser({ id: 'github-user-123' });
      // No customUserVars provided - PAT_TOKEN should remain as placeholder
      const obj: MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: '{{PAT_TOKEN}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, user);

      expect('headers' in result && result.headers).toEqual({
        Authorization: '{{PAT_TOKEN}}', // Should remain unchanged since no customUserVars provided
        'Content-Type': 'application/json',
      });
    });
  });

  describe('MCP Retry Configuration', () => {
    describe('MCPOptions retry parameters validation', () => {
      it('should validate retry parameters in MCPOptions schema', () => {
        // Test valid retry configurations
        const validConfigs = [
          {
            command: 'node',
            args: ['server.js'],
            maxReconnectAttempts: 5,
            maxBackoffMs: 60000,
            reconnectBackoffMs: 2000,
          },
          {
            type: 'sse' as const,
            url: 'https://example.com/sse',
            maxReconnectAttempts: -1, // infinite retries
            maxBackoffMs: 120000,
            reconnectBackoffMs: 500,
          },
          {
            type: 'streamable-http' as const,
            url: 'https://example.com/api',
            maxReconnectAttempts: 0, // no retries
          },
          {
            type: 'websocket' as const,
            url: 'wss://example.com/ws',
            // Test with only some retry params set
            maxReconnectAttempts: 3,
          },
        ];

        validConfigs.forEach((config, index) => {
          expect(() => {
            const result = StdioOptionsSchema.or(
              StreamableHTTPOptionsSchema.or(SSEOptionsSchema.or(WebSocketOptionsSchema)),
            ).parse(config);

            // Verify retry parameters are preserved
            if (config.maxReconnectAttempts !== undefined) {
              expect(result.maxReconnectAttempts).toBe(config.maxReconnectAttempts);
            }
            if (config.maxBackoffMs !== undefined) {
              expect(result.maxBackoffMs).toBe(config.maxBackoffMs);
            }
            if (config.reconnectBackoffMs !== undefined) {
              expect(result.reconnectBackoffMs).toBe(config.reconnectBackoffMs);
            }
          }).not.toThrow(`Valid config ${index} should not throw`);
        });
      });

      it('should reject invalid retry parameter values', () => {
        const invalidConfigs = [
          {
            command: 'node',
            args: ['server.js'],
            maxReconnectAttempts: -2, // Invalid: must be >= -1
          },
          {
            type: 'sse' as const,
            url: 'https://example.com/sse',
            maxBackoffMs: -1000, // Invalid: must be >= 0
          },
          {
            type: 'streamable-http' as const,
            url: 'https://example.com/api',
            reconnectBackoffMs: -500, // Invalid: must be >= 0
          },
          {
            command: 'node',
            args: ['server.js'],
            maxReconnectAttempts: 1.5, // Invalid: must be integer
          },
        ];

        invalidConfigs.forEach((config) => {
          expect(() => {
            StdioOptionsSchema.or(
              StreamableHTTPOptionsSchema.or(SSEOptionsSchema.or(WebSocketOptionsSchema)),
            ).parse(config);
          }).toThrow();
        });
      });

      it('should handle retry parameters in processMCPEnv function', () => {
        const user = createTestUser({ id: 'test-user-123' });
        const obj: MCPOptions = {
          type: 'sse',
          url: 'https://example.com/api',
          headers: {
            'User-Id': '{{LIBRECHAT_USER_ID}}',
            'API-Key': '${TEST_API_KEY}',
          },
          maxReconnectAttempts: 5,
          maxBackoffMs: 45000,
          reconnectBackoffMs: 1500,
        };

        const result = processMCPEnv(obj, user);

        // Verify retry parameters are preserved during environment processing
        expect(result.maxReconnectAttempts).toBe(5);
        expect(result.maxBackoffMs).toBe(45000);
        expect(result.reconnectBackoffMs).toBe(1500);

        // Verify other processing still works
        expect('headers' in result && result.headers).toEqual({
          'User-Id': 'test-user-123',
          'API-Key': 'test-api-key-value',
        });
      });
    });

    describe('Retry configuration integration with different transport types', () => {
      it('should support retry parameters across all MCP transport types', () => {
        const retryConfig = {
          maxReconnectAttempts: 7,
          maxBackoffMs: 90000,
          reconnectBackoffMs: 2500,
        };

        // Test stdio transport
        const stdioConfig = {
          command: 'node',
          args: ['server.js'],
          env: { API_KEY: '${TEST_API_KEY}' },
          ...retryConfig,
        };
        const stdioResult = StdioOptionsSchema.parse(stdioConfig);
        expect(stdioResult.maxReconnectAttempts).toBe(7);
        expect(stdioResult.maxBackoffMs).toBe(90000);
        expect(stdioResult.reconnectBackoffMs).toBe(2500);

        // Test SSE transport
        const sseConfig = {
          type: 'sse' as const,
          url: 'https://example.com/sse',
          headers: { Authorization: 'Bearer token' },
          ...retryConfig,
        };
        const sseResult = SSEOptionsSchema.parse(sseConfig);
        expect(sseResult.maxReconnectAttempts).toBe(7);
        expect(sseResult.maxBackoffMs).toBe(90000);
        expect(sseResult.reconnectBackoffMs).toBe(2500);

        // Test WebSocket transport
        const wsConfig = {
          type: 'websocket' as const,
          url: 'wss://example.com/ws',
          ...retryConfig,
        };
        const wsResult = WebSocketOptionsSchema.parse(wsConfig);
        expect(wsResult.maxReconnectAttempts).toBe(7);
        expect(wsResult.maxBackoffMs).toBe(90000);
        expect(wsResult.reconnectBackoffMs).toBe(2500);

        // Test Streamable HTTP transport
        const httpConfig = {
          type: 'streamable-http' as const,
          url: 'https://example.com/api',
          headers: { 'Content-Type': 'application/json' },
          ...retryConfig,
        };
        const httpResult = StreamableHTTPOptionsSchema.parse(httpConfig);
        expect(httpResult.maxReconnectAttempts).toBe(7);
        expect(httpResult.maxBackoffMs).toBe(90000);
        expect(httpResult.reconnectBackoffMs).toBe(2500);
      });

      it('should handle edge cases and boundary values for retry parameters', () => {
        // Test minimum values
        const minConfig = {
          type: 'sse' as const,
          url: 'https://example.com/sse',
          maxReconnectAttempts: -1, // infinite retries
          maxBackoffMs: 0, // no backoff
          reconnectBackoffMs: 0, // no initial backoff
        };
        const minResult = SSEOptionsSchema.parse(minConfig);
        expect(minResult.maxReconnectAttempts).toBe(-1);
        expect(minResult.maxBackoffMs).toBe(0);
        expect(minResult.reconnectBackoffMs).toBe(0);

        // Test large values
        const maxConfig = {
          command: 'node',
          args: ['server.js'],
          maxReconnectAttempts: 999999,
          maxBackoffMs: 3600000, // 1 hour
          reconnectBackoffMs: 60000, // 1 minute
        };
        const maxResult = StdioOptionsSchema.parse(maxConfig);
        expect(maxResult.maxReconnectAttempts).toBe(999999);
        expect(maxResult.maxBackoffMs).toBe(3600000);
        expect(maxResult.reconnectBackoffMs).toBe(60000);

        // Test with only some parameters set (others should be undefined)
        const partialConfig = {
          type: 'streamable-http' as const,
          url: 'https://example.com/api',
          maxReconnectAttempts: 3,
          // maxBackoffMs and reconnectBackoffMs intentionally omitted
        };
        const partialResult = StreamableHTTPOptionsSchema.parse(partialConfig);
        expect(partialResult.maxReconnectAttempts).toBe(3);
        expect(partialResult.maxBackoffMs).toBeUndefined();
        expect(partialResult.reconnectBackoffMs).toBeUndefined();
      });

      it('should preserve retry parameters when combined with environment variable processing', () => {
        const user = createTestUser({
          id: 'retry-test-user',
          email: 'retry@example.com',
        });
        const customUserVars = {
          RETRY_ATTEMPTS: '10',
          BACKOFF_TIME: '5000',
        };

        // Test configuration with environment variables and retry parameters
        const complexConfig: MCPOptions = {
          type: 'streamable-http',
          url: 'https://{{CUSTOM_ENDPOINT}}.example.com/api',
          headers: {
            Authorization: 'Bearer ${API_TOKEN}',
            'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
            'X-Retry-Config': 'attempts={{RETRY_ATTEMPTS}},backoff={{BACKOFF_TIME}}',
          },
          maxReconnectAttempts: 15,
          maxBackoffMs: 120000,
          reconnectBackoffMs: 3000,
        };

        // Add the custom vars that would be used in headers
        const allCustomVars = {
          ...customUserVars,
          CUSTOM_ENDPOINT: 'api-v2',
        };

        // Set up environment variable for the test
        process.env.API_TOKEN = 'test-bearer-token';

        const result = processMCPEnv(complexConfig, user, allCustomVars);

        // Verify retry parameters are preserved
        expect(result.maxReconnectAttempts).toBe(15);
        expect(result.maxBackoffMs).toBe(120000);
        expect(result.reconnectBackoffMs).toBe(3000);

        // Verify environment processing still works correctly
        expect('url' in result && result.url).toBe('https://api-v2.example.com/api');
        expect('headers' in result && result.headers).toEqual({
          Authorization: 'Bearer test-bearer-token',
          'User-Email': 'retry@example.com',
          'X-Retry-Config': 'attempts=10,backoff=5000',
        });

        // Clean up
        delete process.env.API_TOKEN;
      });
    });
  });
});
