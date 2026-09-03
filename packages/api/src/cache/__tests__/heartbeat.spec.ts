import Redis from 'ioredis';
import type { RespServer } from './resp.helper';
import { startRedisHeartbeat, forceRedisReconnect } from '~/cache/heartbeat';
import { startRespServer, waitFor } from './resp.helper';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const countCommands = (server: RespServer, name: string): number =>
  server.commands.filter((frame) => frame[0]?.toUpperCase() === name).length;

describe('startRedisHeartbeat', () => {
  let server: RespServer;
  let client: Redis;
  let stop: () => void = () => undefined;

  beforeEach(async () => {
    server = await startRespServer();
    client = new Redis(server.url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: () => 10,
    });
    client.on('error', () => undefined);
    await client.connect();
  });

  afterEach(async () => {
    stop();
    client.disconnect();
    await server.close();
  });

  it('leaves an answering connection alone', async () => {
    stop = startRedisHeartbeat({ client, intervalMs: 20, timeoutMs: 200, label: 'test' });
    await waitFor(() => countCommands(server, 'PING') >= 3);
    expect(server.connections).toBe(1);
    expect(client.status).toBe('ready');
  });

  it('tears down a socket whose peer stops answering so ioredis reconnects and replays', async () => {
    stop = startRedisHeartbeat({ client, intervalMs: 20, timeoutMs: 60, label: 'test' });
    server.silent = true;
    const pending = client.get('key');

    await waitFor(() => client.status !== 'ready');
    server.silent = false;

    await expect(pending).resolves.toBeNull();
    await waitFor(() => client.status === 'ready');
    expect(server.connections).toBe(2);
  });

  it('sends one probe at a time while a reply is outstanding', async () => {
    stop = startRedisHeartbeat({ client, intervalMs: 20, timeoutMs: 300, label: 'test' });
    server.silent = true;
    await sleep(150);
    expect(countCommands(server, 'PING')).toBe(1);
    expect(server.connections).toBe(1);
  });

  it('re-subscribes a subscriber connection after forcing it to reconnect', async () => {
    await client.subscribe('events');
    stop = startRedisHeartbeat({ client, intervalMs: 20, timeoutMs: 60, label: 'test' });
    await waitFor(() => countCommands(server, 'PING') >= 2);
    expect(server.connections).toBe(1);

    server.silent = true;
    await waitFor(() => client.status !== 'ready');
    server.silent = false;

    await waitFor(() => countCommands(server, 'SUBSCRIBE') >= 2);
    await waitFor(() => client.status === 'ready');
    expect(server.connections).toBe(2);
  });

  it('stops probing once the client has ended', async () => {
    stop = startRedisHeartbeat({ client, intervalMs: 20, timeoutMs: 200, label: 'test' });
    await waitFor(() => countCommands(server, 'PING') >= 1);
    client.disconnect();
    await waitFor(() => client.status === 'end');
    const sent = countCommands(server, 'PING');
    await sleep(100);
    expect(countCommands(server, 'PING')).toBe(sent);
  });

  it('does nothing when the interval is not positive', () => {
    stop = startRedisHeartbeat({ client, intervalMs: 0, timeoutMs: 200, label: 'test' });
    expect(client.listenerCount('end')).toBe(0);
  });
});

describe('forceRedisReconnect', () => {
  it('falls back to a regular reconnect when the client exposes no socket', () => {
    const disconnect = jest.fn();
    forceRedisReconnect(
      {
        status: 'ready',
        ping: () => Promise.resolve(),
        on: () => undefined,
        off: () => undefined,
        disconnect,
      },
      'test',
    );
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('destroys the live socket with the reason instead of ending it', () => {
    const destroy = jest.fn();
    const disconnect = jest.fn();
    forceRedisReconnect(
      {
        status: 'ready',
        ping: () => Promise.resolve(),
        on: () => undefined,
        off: () => undefined,
        disconnect,
        stream: { destroyed: false, destroy },
      },
      'peer vanished',
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect((destroy.mock.calls[0][0] as Error).message).toBe('peer vanished');
    expect(disconnect).not.toHaveBeenCalled();
  });
});
