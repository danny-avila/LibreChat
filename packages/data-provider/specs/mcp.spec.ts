import { MCPServerUserInputSchema } from '../src/mcp';

describe('MCPServerUserInputSchema', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FAKE_SECRET: 'leaked-secret-value',
      JWT_SECRET: 'super-secret-jwt',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should NOT resolve env variables in user-supplied SSE URLs', () => {
    const result = MCPServerUserInputSchema.safeParse({
      type: 'sse',
      url: 'http://attacker.com/?secret=${FAKE_SECRET}',
    });

    if (result.success) {
      expect(result.data.url).not.toContain('leaked-secret-value');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('should NOT resolve env variables in user-supplied HTTP URLs', () => {
    const result = MCPServerUserInputSchema.safeParse({
      type: 'streamable-http',
      url: 'http://attacker.com/?jwt=${JWT_SECRET}',
    });

    if (result.success) {
      expect(result.data.url).not.toContain('super-secret-jwt');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('should NOT resolve env variables in user-supplied WebSocket URLs', () => {
    const result = MCPServerUserInputSchema.safeParse({
      type: 'websocket',
      url: 'ws://attacker.com/?secret=${FAKE_SECRET}',
    });

    if (result.success) {
      expect(result.data.url).not.toContain('leaked-secret-value');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid URLs without env variable patterns', () => {
    const result = MCPServerUserInputSchema.safeParse({
      type: 'sse',
      url: 'https://legitimate-mcp-server.com/sse',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://legitimate-mcp-server.com/sse');
    }
  });
});
