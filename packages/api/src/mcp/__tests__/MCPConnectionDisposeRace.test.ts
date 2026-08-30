/**
 * A discovery caller that gives up on a slow `connect()` disposes the connection immediately, so
 * it can dispose while `constructTransport()` is still pending. `dispose()` then finds no
 * transport to close, and without a post-await check the abandoned attempt would go on to connect
 * and leave a live connection nobody owns.
 */

import { MCPConnection } from '~/mcp/connection';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  isOAuthUrlAllowed: jest.fn(() => false),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: {
    TOOLS_LIST_MAX_PAGES: 3,
    TOOLS_LIST_MAX_TOOLS: 1000,
    TOOLS_LIST_MAX_BYTES: 5 * 1024 * 1024,
    TOOLS_LIST_TIMEOUT_MS: 30000,
    CONNECTION_CHECK_TTL: 0,
  },
}));

describe('MCPConnection disposal during connect', () => {
  it('discards a transport constructed after the connection was disposed', async () => {
    const conn = new MCPConnection({
      serverName: 'dispose-race',
      serverConfig: { type: 'streamable-http', url: 'http://localhost/mcp' },
      useSSRFProtection: false,
    });

    let releaseTransport: (() => void) | undefined;
    const transportPending = new Promise<void>((resolve) => {
      releaseTransport = resolve;
    });
    const transport = { close: jest.fn(), send: jest.fn(), start: jest.fn() };
    const constructTransport = jest
      .spyOn(
        conn as unknown as { constructTransport: () => Promise<unknown> },
        'constructTransport',
      )
      .mockImplementation(async () => {
        await transportPending;
        return transport;
      });

    const clientConnect = jest.spyOn(conn.client, 'connect').mockResolvedValue(undefined);
    const clientClose = jest.spyOn(conn.client, 'close').mockResolvedValue(undefined);

    const connecting = conn.connectClient();
    await conn.dispose();
    releaseTransport?.();
    await connecting;

    expect(constructTransport).toHaveBeenCalledTimes(1);
    expect(clientConnect).not.toHaveBeenCalled();
    expect(clientClose).toHaveBeenCalled();
    expect(await conn.isConnected()).toBe(false);
  });
});
