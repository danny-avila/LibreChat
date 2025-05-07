import { StdioOptionsSchema, processMCPEnv, MCPOptions } from '../src/mcp';

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
      const userId = 'test-user-123';
      const obj: MCPOptions = {
        type: 'sse',
        url: 'https://example.com',
        headers: {
          Authorization: '${TEST_API_KEY}',
          'User-Id': '{{LIBRECHAT_USER_ID}}',
          'Content-Type': 'application/json',
        },
      };

      const result = processMCPEnv(obj, userId);

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
      const user1Id = 'user-123';
      const user2Id = 'user-456';

      const resultUser1 = processMCPEnv(baseConfig, user1Id);
      const resultUser2 = processMCPEnv(baseConfig, user2Id);

      // Verify each has the correct user ID
      expect('headers' in resultUser1 && resultUser1.headers?.['User-Id']).toBe(user1Id);
      expect('headers' in resultUser2 && resultUser2.headers?.['User-Id']).toBe(user2Id);

      // Verify they're different objects
      expect(resultUser1).not.toBe(resultUser2);

      // Modify one result and ensure it doesn't affect the other
      if ('headers' in resultUser1 && resultUser1.headers) {
        resultUser1.headers['User-Id'] = 'modified-user';
      }

      // Original config should be unchanged
      expect(baseConfig.headers?.['User-Id']).toBe('{{LIBRECHAT_USER_ID}}');

      // Second user's config should be unchanged
      expect('headers' in resultUser2 && resultUser2.headers?.['User-Id']).toBe(user2Id);
    });
  });
});
