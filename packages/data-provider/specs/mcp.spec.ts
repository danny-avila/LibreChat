import { StdioOptionsSchema } from '../src/mcp';

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
});
