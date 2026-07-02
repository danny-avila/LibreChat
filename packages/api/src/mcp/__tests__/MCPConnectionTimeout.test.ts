/**
 * Verifies how a connection's per-request (tool call) timeout is resolved:
 * an explicit `serverConfig.timeout` wins, otherwise the connection falls back
 * to the admin-configurable default (env `MCP_DEFAULT_TIMEOUT_MS`, else 60000).
 *
 * The default is read at module load, so the env-override case re-imports the
 * module in isolation with the env set.
 *
 * Also guards that this per-request default never leaks into the SSE connect/handshake
 * fallback (resolveSSEConnectTimeout), which must keep using SSE_CONNECT_TIMEOUT (120s).
 */
import { MCPConnection, resolveSSEConnectTimeout } from '~/mcp/connection';

const baseServerConfig = {
  type: 'streamable-http' as const,
  url: 'http://127.0.0.1:1/mcp',
};

describe('MCPConnection timeout resolution', () => {
  it('falls back to the 60s default when no timeout is configured', () => {
    const conn = new MCPConnection({
      serverName: 'no-timeout',
      serverConfig: { ...baseServerConfig },
      useSSRFProtection: false,
    });

    expect(conn.timeout).toBe(60000);
  });

  it('preserves an explicit per-server timeout', () => {
    const conn = new MCPConnection({
      serverName: 'explicit-timeout',
      serverConfig: { ...baseServerConfig, timeout: 12345 },
      useSSRFProtection: false,
    });

    expect(conn.timeout).toBe(12345);
  });

  it('applies MCP_DEFAULT_TIMEOUT_MS to servers without an explicit timeout', async () => {
    process.env.MCP_DEFAULT_TIMEOUT_MS = '300000';
    jest.resetModules();
    try {
      const { MCPConnection: FreshMCPConnection } = await import('~/mcp/connection');

      const conn = new FreshMCPConnection({
        serverName: 'env-default',
        serverConfig: { ...baseServerConfig },
        useSSRFProtection: false,
      });

      expect(conn.timeout).toBe(300000);
    } finally {
      delete process.env.MCP_DEFAULT_TIMEOUT_MS;
      jest.resetModules();
    }
  });
});

describe('resolveSSEConnectTimeout', () => {
  it('falls back to the 120s SSE/proxy handshake timeout when no explicit timeout is set', () => {
    expect(resolveSSEConnectTimeout(undefined)).toBe(120000);
  });

  it('does not let the per-request default shorten the SSE handshake fallback', () => {
    // Regression guard: an unset server timeout must still reach the 120s proxy
    // handshake fallback, not the resolved per-request DEFAULT_TIMEOUT (60s).
    expect(resolveSSEConnectTimeout(undefined)).not.toBe(60000);
  });

  it('honors an explicit per-server timeout', () => {
    expect(resolveSSEConnectTimeout(45000)).toBe(45000);
  });
});
