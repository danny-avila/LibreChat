import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createHardenedOAuthFetch, resetHardenedOAuthFetchDispatchers } from './hardenedFetch';

type TestServer = {
  port: number;
  requestCount: () => number;
  close: () => Promise<void>;
};

async function createLocalServer(): Promise<TestServer> {
  let requestCount = 0;
  const sockets = new Set<Socket>();
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    requestCount: () => requestCount,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server.close(() => resolve());
      }),
  };
}

describe('createHardenedOAuthFetch request policy', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await createLocalServer();
  });

  afterEach(async () => {
    resetHardenedOAuthFetchDispatchers();
    await server.close();
  });

  it('blocks local OAuth requests unless the endpoint is explicitly trusted', async () => {
    const oauthFetch = createHardenedOAuthFetch();

    await expect(
      oauthFetch(`http://localhost:${server.port}/token`, {
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow();

    expect(server.requestCount()).toBe(0);
  });

  it('allows explicitly trusted local OAuth endpoints', async () => {
    const oauthFetch = createHardenedOAuthFetch({ allowedDomains: ['localhost'] });

    const response = await oauthFetch(`http://localhost:${server.port}/token`, {
      signal: AbortSignal.timeout(1000),
    });

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(server.requestCount()).toBe(1);
  });

  it('does not use address exemptions when domain policy is active but unmatched', async () => {
    const oauthFetch = createHardenedOAuthFetch({
      allowedDomains: ['trusted.example.com'],
      allowedAddresses: [`localhost:${server.port}`],
    });

    await expect(
      oauthFetch(`http://localhost:${server.port}/token`, {
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow();

    expect(server.requestCount()).toBe(0);
  });
});
