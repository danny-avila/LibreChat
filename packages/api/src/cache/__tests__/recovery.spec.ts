import { createClient } from '@keyv/redis';
import type { RedisClientType } from '@redis/client';
import type { RespServer } from './resp.helper';
import { createReadonlyRecovery, isReadonlyReplicaError } from '~/cache/recovery';
import { closeRedisClients } from './redisClients.helper';
import { startRespServer, waitFor } from './resp.helper';

const READONLY_MESSAGE = "READONLY You can't write against a read only replica.";

async function readonlyWriteError(client: RedisClientType): Promise<unknown> {
  try {
    await client.set('key', 'value');
  } catch (error) {
    return error;
  }
  throw new Error('Expected the write to be rejected');
}

describe('isReadonlyReplicaError', () => {
  it('recognizes READONLY replies and nothing else', () => {
    expect(isReadonlyReplicaError(new Error(READONLY_MESSAGE))).toBe(true);
    expect(isReadonlyReplicaError(READONLY_MESSAGE)).toBe(true);
    expect(isReadonlyReplicaError(new Error('ECONNRESET'))).toBe(false);
    expect(isReadonlyReplicaError(undefined)).toBe(false);
  });
});

describe('createReadonlyRecovery', () => {
  let server: RespServer;
  let client: RedisClientType;

  beforeEach(async () => {
    server = await startRespServer();
    client = createClient({ url: server.url }) as RedisClientType;
    client.on('error', () => undefined);
    await client.connect();
  });

  afterEach(async () => {
    if (client.isOpen) {
      client.destroy();
    }
    await server.close();
  });

  it('reconnects once per interval and keeps retrying while writes stay READONLY', async () => {
    let clock = 0;
    const recover = createReadonlyRecovery({ client, minIntervalMs: 200, now: () => clock });
    server.readonly = true;
    const error = await readonlyWriteError(client);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(READONLY_MESSAGE);

    expect(recover(error)).toBe(true);
    for (let i = 0; i < 50; i++) {
      expect(recover(error)).toBe(false);
    }
    await waitFor(() => server.connections === 2 && client.isReady);

    expect(recover(await readonlyWriteError(client))).toBe(false);
    clock = 200;
    expect(recover(await readonlyWriteError(client))).toBe(true);
    await waitFor(() => server.connections === 3 && client.isReady);

    server.readonly = false;
    await expect(client.set('key', 'value')).resolves.toBe('OK');
    await expect(client.get('key')).resolves.toBe('value');
  });

  it('ignores errors that are not READONLY replies', async () => {
    const recover = createReadonlyRecovery({ client, minIntervalMs: 0 });
    expect(recover(new Error('ECONNRESET'))).toBe(false);
    expect(recover(undefined)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.connections).toBe(1);
  });

  it('reconnects a client whose socket is already closed', async () => {
    const recover = createReadonlyRecovery({ client, minIntervalMs: 0 });
    client.destroy();
    expect(client.isOpen).toBe(false);
    expect(recover(new Error(READONLY_MESSAGE))).toBe(true);
    await waitFor(() => server.connections === 2 && client.isReady);
  });

  it('retries on the next error of any kind after a failed reconnect', async () => {
    client.destroy();
    client = createClient({
      url: server.url,
      socket: { reconnectStrategy: false },
    }) as RedisClientType;
    client.on('error', () => undefined);
    await client.connect();
    const recover = createReadonlyRecovery({ client, minIntervalMs: 0 });
    const { port } = server;
    await server.close();

    expect(recover(new Error(READONLY_MESSAGE))).toBe(true);
    await waitFor(() => !client.isOpen);
    expect(recover(new Error('ECONNRESET'))).toBe(true);
    await waitFor(() => !client.isOpen);

    server = await startRespServer(port);
    expect(recover(new Error('The client is closed'))).toBe(true);
    await waitFor(() => server.connections === 1 && client.isReady);
    await expect(client.set('key', 'value')).resolves.toBe('OK');
  });
});

describe('standalone Keyv Redis client READONLY recovery', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let server: RespServer;
  let clients: typeof import('~/cache/redisClients');
  let cacheFactory: typeof import('~/cache/cacheFactory');
  const keyvClientReady = (): boolean => (clients.keyvRedisClient as RedisClientType).isReady;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    server = await startRespServer();
    process.env.USE_REDIS = 'true';
    process.env.USE_REDIS_CLUSTER = 'false';
    process.env.REDIS_URI = server.url;
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'readonly-recovery';
    process.env.REDIS_READONLY_RECOVERY_INTERVAL = '100';
    jest.resetModules();
    clients = await import('~/cache/redisClients');
    cacheFactory = await import('~/cache/cacheFactory');
    await clients.keyvRedisClientReady;
  });

  afterAll(async () => {
    await closeRedisClients(clients);
    await server.close();
    process.env = originalEnv;
  });

  it('reconnects when a Keyv write is rejected with READONLY', async () => {
    const connectionsBefore = server.connections;
    const cache = cacheFactory.standardCache('readonly-recovery-test');
    server.readonly = true;

    await cache.set('key', 'value');
    await waitFor(() => server.connections === connectionsBefore + 1 && keyvClientReady());

    server.readonly = false;
    await expect(cache.set('key', 'value')).resolves.toBe(true);
    await expect(cache.get('key')).resolves.toBe('value');
  });

  it('reconnects when a Lua script is rejected with READONLY', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connectionsBefore = server.connections;
    server.readonly = true;

    await expect(
      clients.evalKeyvRedisScript('return 1', { keys: ['lock'], arguments: [] }),
    ).rejects.toThrow(READONLY_MESSAGE);
    await waitFor(() => server.connections === connectionsBefore + 1 && keyvClientReady());

    server.readonly = false;
    await expect(
      clients.evalKeyvRedisScript('return 1', { keys: ['lock'], arguments: [] }),
    ).resolves.toBe(1);
  });

  it('routes client error events through the same recovery', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connectionsBefore = server.connections;
    expect(clients.handleKeyvRedisError(new Error(READONLY_MESSAGE))).toBe(true);
    await waitFor(() => server.connections === connectionsBefore + 1 && keyvClientReady());
  });
});
