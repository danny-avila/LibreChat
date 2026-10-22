import Redis from 'ioredis';
import { logger } from '@librechat/data-schemas';
import type { ConfigCacheInvalidation, ConfigInvalidationPubSub } from './invalidation';
import type { RespServer } from '~/cache/__tests__/resp.helper';
import { createConfigCacheInvalidation, createRedisConfigInvalidationPubSub } from './invalidation';
import { startRespServer, waitFor } from '~/cache/__tests__/resp.helper';

/**
 * Cross-instance invalidation over real ioredis connections: each instance owns the publisher
 * and subscriber `createRedisConfigInvalidationPubSub` duplicates from its shared client, the
 * way two LibreChat processes would, against a RESP server that fans PUBLISH out.
 */
describe('createRedisConfigInvalidationPubSub', () => {
  let server: RespServer;
  let clients: Redis[];
  let opened: Array<{ invalidation: ConfigCacheInvalidation; pubsub: ConfigInvalidationPubSub }>;

  beforeEach(async () => {
    server = await startRespServer();
    clients = [];
    opened = [];
  });

  afterEach(async () => {
    for (const { invalidation, pubsub } of opened) {
      await invalidation.close().catch(() => undefined);
      (pubsub.publisher as Redis).disconnect();
      (pubsub.subscriber as Redis).disconnect();
    }
    for (const client of clients) {
      client.disconnect();
    }
    await server.close();
  });

  /** Connects eagerly like the production client, so its duplicates connect on creation too. */
  async function connect(): Promise<Redis> {
    const client = new Redis(server.url, { maxRetriesPerRequest: 1 });
    client.on('error', () => undefined);
    clients.push(client);
    await waitFor(() => client.status === 'ready');
    return client;
  }

  async function startInstance(namespace?: string) {
    return startInstanceOn(await connect(), namespace);
  }

  async function startInstanceOn(client: Redis, namespace?: string) {
    const clearOverrides = jest.fn(async (_tenantId?: string) => undefined);
    const pubsub = createRedisConfigInvalidationPubSub({
      useRedis: true,
      client,
      namespace,
    });
    if (!pubsub) {
      throw new Error('expected a Redis pub/sub pair');
    }
    const invalidation = createConfigCacheInvalidation({
      clears: [{ label: 'clearOverrideCache', clear: clearOverrides }],
      pubsub,
    });
    opened.push({ invalidation, pubsub });
    return { invalidation, clearOverrides, pubsub };
  }

  const subscribed = (channel: string, count: number) => () =>
    server.commands.filter(
      (frame) => frame[0]?.toUpperCase() === 'SUBSCRIBE' && frame[1] === channel,
    ).length >= count;

  it('clears the other instances of a deployment, scoped to the tenant, and not other deployments', async () => {
    const first = await startInstance('deploy-a');
    const second = await startInstance('deploy-a');
    const other = await startInstance('deploy-b');
    expect(first.pubsub.channel).toBe('librechat:config:invalidate:deploy-a');
    await waitFor(subscribed('librechat:config:invalidate:deploy-a', 2));
    await waitFor(subscribed('librechat:config:invalidate:deploy-b', 1));

    await first.invalidation.invalidate('tenant-a');

    expect(first.clearOverrides).toHaveBeenCalledTimes(1);
    await waitFor(() => second.clearOverrides.mock.calls.length === 1);
    expect(second.clearOverrides).toHaveBeenCalledWith('tenant-a');
    expect(first.clearOverrides).toHaveBeenCalledTimes(1);
    expect(other.clearOverrides).not.toHaveBeenCalled();
  });

  it('uses the default channel when the deployment has no key prefix', async () => {
    const instance = await startInstance('  ');

    expect(instance.pubsub.channel).toBe('librechat:config:invalidate:default');
  });

  it('fails the broadcast fast while Redis is unreachable instead of holding the write', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(logger);
    const instance = await startInstance('deploy-a');
    await waitFor(() => (instance.pubsub.publisher as Redis).status === 'ready');
    await server.close();
    await waitFor(() => (instance.pubsub.publisher as Redis).status !== 'ready');

    const started = Date.now();
    await expect(instance.invalidation.invalidate()).resolves.toBeUndefined();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(instance.clearOverrides).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Publishing to other instances failed'),
      expect.anything(),
    );
    server = await startRespServer();
  });

  it('subscribes once Redis comes back when the first SUBSCRIBE failed during an outage', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(logger);
    const channel = 'librechat:config:invalidate:deploy-a';
    const client = await connect();
    const { port } = server;
    await server.close();
    await waitFor(() => client.status !== 'ready');

    const late = await startInstanceOn(client, 'deploy-a');
    await waitFor(
      () =>
        error.mock.calls.some(([message]) =>
          String(message).includes('Subscribing to cross-instance invalidations failed'),
        ),
      5000,
    );

    server = await startRespServer(port);
    await waitFor(subscribed(channel, 1), 5000);
    const writer = await startInstance('deploy-a');
    await waitFor(subscribed(channel, 2));

    await writer.invalidation.invalidate('tenant-a');

    await waitFor(() => late.clearOverrides.mock.calls.length === 1);
    expect(late.clearOverrides).toHaveBeenCalledWith('tenant-a');
  });

  it('returns no pub/sub without Redis', async () => {
    const client = await connect();

    expect(createRedisConfigInvalidationPubSub({ useRedis: false, client })).toBeUndefined();
    expect(createRedisConfigInvalidationPubSub({ useRedis: true, client: null })).toBeUndefined();
  });
});
