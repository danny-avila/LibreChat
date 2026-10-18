import IoRedis from 'ioredis';
import { createClient } from '@keyv/redis';
import type { RedisClientType } from '@redis/client';
import type { Request, Response } from 'express';
import type { RespServer } from '~/cache/__tests__/resp.helper';
import type { RedisReadinessClients } from './readiness';
import { startRespServer, waitFor } from '~/cache/__tests__/resp.helper';
import { createReadinessHandler, isRedisReady } from './readiness';

const clients = (overrides: Partial<RedisReadinessClients> = {}): RedisReadinessClients => ({
  useRedis: true,
  ioredis: { status: 'ready' },
  keyv: { isReady: true },
  ...overrides,
});

describe('isRedisReady', () => {
  it('is ready when Redis is disabled, even without clients', () => {
    expect(isRedisReady({ useRedis: false, ioredis: null, keyv: null })).toBe(true);
  });

  it('is ready when both clients are connected', () => {
    expect(isRedisReady(clients())).toBe(true);
  });

  it.each(['connecting', 'reconnecting', 'close', 'end', 'wait'] as const)(
    'is not ready when ioredis is %s',
    (status) => {
      expect(isRedisReady(clients({ ioredis: { status } }))).toBe(false);
    },
  );

  it('is not ready when the Keyv client is disconnected', () => {
    expect(isRedisReady(clients({ keyv: { isReady: false } }))).toBe(false);
  });

  it('is not ready when a configured client is missing', () => {
    expect(isRedisReady(clients({ ioredis: null }))).toBe(false);
    expect(isRedisReady(clients({ keyv: null }))).toBe(false);
  });

  it('uses isOpen for a Keyv cluster client', () => {
    expect(isRedisReady(clients({ keyv: { isOpen: true } }))).toBe(true);
    expect(isRedisReady(clients({ keyv: { isOpen: false } }))).toBe(false);
  });
});

describe('isRedisReady with live clients', () => {
  let server: RespServer;
  let ioredis: IoRedis;
  let keyv: RedisClientType;

  afterEach(async () => {
    ioredis?.disconnect();
    if (keyv?.isOpen) {
      keyv.destroy();
    }
    await server?.close();
  });

  it('turns not ready when Redis goes away and ready again once it returns', async () => {
    server = await startRespServer();
    const { port, url } = server;
    ioredis = new IoRedis(url, { retryStrategy: () => 20, maxRetriesPerRequest: 0 });
    ioredis.on('error', () => undefined);
    keyv = createClient({ url, socket: { reconnectStrategy: () => 20 } }) as RedisClientType;
    keyv.on('error', () => undefined);
    await keyv.connect();
    await waitFor(() => ioredis.status === 'ready');

    const live = (): RedisReadinessClients => ({ useRedis: true, ioredis, keyv });
    expect(isRedisReady(live())).toBe(true);

    await server.close();
    await waitFor(() => !isRedisReady(live()));
    expect(ioredis.status).not.toBe('ready');

    server = await startRespServer(port);
    await waitFor(() => isRedisReady(live()), 5000);
  });
});

describe('createReadinessHandler', () => {
  const respond = (handler: ReturnType<typeof createReadinessHandler>) => {
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    handler({} as Request, res as unknown as Response);
    return { code: res.status.mock.calls[0][0], body: res.send.mock.calls[0][0] };
  };
  const probe = (serverReady: boolean, redisReady: boolean) =>
    respond(
      createReadinessHandler(
        () => serverReady,
        () => redisReady,
      ),
    );

  it('returns 503 before startup completes', () => {
    expect(probe(false, true)).toEqual({ code: 503, body: 'NOT_READY' });
  });

  it('returns 503 after startup when Redis drops', () => {
    expect(probe(true, false)).toEqual({ code: 503, body: 'NOT_READY' });
  });

  it('returns 200 when started and Redis is connected', () => {
    expect(probe(true, true)).toEqual({ code: 200, body: 'OK' });
  });

  it('re-evaluates readiness on every request', () => {
    let redisUp = true;
    const handler = createReadinessHandler(
      () => true,
      () => redisUp,
    );
    expect(respond(handler).code).toBe(200);
    redisUp = false;
    expect(respond(handler).code).toBe(503);
    redisUp = true;
    expect(respond(handler).code).toBe(200);
  });
});
