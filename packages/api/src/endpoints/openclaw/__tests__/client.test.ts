import { OpenClawGatewayClient } from '../client';

describe('OpenClawGatewayClient — constructor defaults', () => {
  it('sets connectTimeoutMs to 10 000 by default', () => {
    const client = new OpenClawGatewayClient({ url: 'ws://localhost', apiKey: 'k' });
    // Access private via type assertion for unit test
    expect((client as unknown as { connectTimeoutMs: number }).connectTimeoutMs).toBe(10_000);
  });

  it('sets rpcTimeoutMs to 30 000 by default', () => {
    const client = new OpenClawGatewayClient({ url: 'ws://localhost', apiKey: 'k' });
    expect((client as unknown as { rpcTimeoutMs: number }).rpcTimeoutMs).toBe(30_000);
  });

  it('respects custom timeouts', () => {
    const client = new OpenClawGatewayClient({
      url: 'ws://localhost',
      apiKey: 'k',
      connectTimeoutMs: 5_000,
      rpcTimeoutMs: 15_000,
    });
    expect((client as unknown as { connectTimeoutMs: number }).connectTimeoutMs).toBe(5_000);
    expect((client as unknown as { rpcTimeoutMs: number }).rpcTimeoutMs).toBe(15_000);
  });

  it('is not connected before connect() is called', () => {
    const client = new OpenClawGatewayClient({ url: 'ws://localhost', apiKey: 'k' });
    expect(client.connected).toBe(false);
  });
});
