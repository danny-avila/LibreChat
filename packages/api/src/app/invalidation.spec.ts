import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { ConfigInvalidationPublisher, ConfigInvalidationSubscriber } from './invalidation';
import { CONFIG_INVALIDATION_CHANNEL, createConfigCacheInvalidation } from './invalidation';

/**
 * An in-process stand-in for Redis pub/sub: every subscribed connection receives every message
 * published on a channel it subscribed to, including the publisher's own instance.
 */
function createBroker() {
  const subscribers = new Set<{ channels: Set<string>; events: EventEmitter }>();
  return {
    publisher(): ConfigInvalidationPublisher & { publish: jest.Mock } {
      return {
        publish: jest.fn(async (channel: string, message: string) => {
          let delivered = 0;
          for (const subscriber of subscribers) {
            if (subscriber.channels.has(channel)) {
              delivered += 1;
              subscriber.events.emit('message', channel, message);
            }
          }
          return delivered;
        }),
      };
    },
    subscriber(): ConfigInvalidationSubscriber {
      const state = { channels: new Set<string>(), events: new EventEmitter() };
      subscribers.add(state);
      return {
        subscribe: async (channel) => state.channels.add(channel),
        unsubscribe: async (channel) => state.channels.delete(channel),
        on: (event, listener) => state.events.on(event, listener),
        off: (event, listener) => state.events.off(event, listener),
      };
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createInstance(broker: ReturnType<typeof createBroker>, instanceId: string) {
  const clearOverrides = jest.fn(async (_tenantId?: string) => undefined);
  const clearMcp = jest.fn(async () => undefined);
  const publisher = broker.publisher();
  const invalidation = createConfigCacheInvalidation({
    clears: [
      { label: 'clearOverrideCache', clear: clearOverrides },
      { label: 'clearMcpConfigCache', clear: clearMcp },
    ],
    pubsub: { publisher, subscriber: broker.subscriber() },
    instanceId,
  });
  return { invalidation, clearOverrides, clearMcp, publisher };
}

describe('createConfigCacheInvalidation', () => {
  it('runs every clear concurrently and passes the tenant through', async () => {
    const events: string[] = [];
    const tracked = (label: string) =>
      jest.fn(async () => {
        events.push(`start:${label}`);
        await flush();
        events.push(`end:${label}`);
      });
    const overrides = tracked('override');
    const mcp = tracked('mcp');
    const invalidation = createConfigCacheInvalidation({
      clears: [
        { label: 'override', clear: overrides },
        { label: 'mcp', clear: mcp },
      ],
    });

    await invalidation.invalidate('tenant-a');

    expect(events.slice(0, 2).sort()).toEqual(['start:mcp', 'start:override']);
    expect(events).toHaveLength(4);
    expect(overrides).toHaveBeenCalledWith('tenant-a');
  });

  it('resolves when a clear fails, logging which one without its message', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(logger);
    const other = jest.fn().mockResolvedValue(undefined);
    const invalidation = createConfigCacheInvalidation({
      clears: [
        {
          label: 'clearOverrideCache',
          clear: jest.fn().mockRejectedValue(new Error('secret-ish')),
        },
        { label: 'clearMcpConfigCache', clear: other },
      ],
    });

    await expect(invalidation.invalidate()).resolves.toBeUndefined();

    expect(other).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      '[invalidateConfigCaches] clearOverrideCache failed:',
      expect.not.objectContaining({ message: 'secret-ish' }),
    );
  });

  it('clears another instance when one invalidates, scoped to the same tenant', async () => {
    const broker = createBroker();
    const first = createInstance(broker, 'first');
    const second = createInstance(broker, 'second');
    await flush();

    await first.invalidation.invalidate('tenant-a');
    await flush();

    expect(first.clearOverrides).toHaveBeenCalledTimes(1);
    expect(second.clearOverrides).toHaveBeenCalledWith('tenant-a');
    expect(second.clearMcp).toHaveBeenCalledTimes(1);
    expect(first.publisher.publish).toHaveBeenCalledWith(
      CONFIG_INVALIDATION_CHANNEL,
      JSON.stringify({ origin: 'first', tenantId: 'tenant-a' }),
    );
  });

  it('broadcasts a clear of every tenant without a tenant id', async () => {
    const broker = createBroker();
    const first = createInstance(broker, 'first');
    const second = createInstance(broker, 'second');
    await flush();

    await first.invalidation.invalidate();
    await flush();

    expect(second.clearOverrides).toHaveBeenCalledWith(undefined);
  });

  it('ignores its own broadcast, malformed messages and other channels', async () => {
    const broker = createBroker();
    const only = createInstance(broker, 'only');
    const listener = broker.subscriber();
    await flush();
    const publisher = broker.publisher();

    await only.invalidation.invalidate();
    await publisher.publish(CONFIG_INVALIDATION_CHANNEL, 'not json');
    await publisher.publish(CONFIG_INVALIDATION_CHANNEL, JSON.stringify({ origin: 1 }));
    await publisher.publish(
      CONFIG_INVALIDATION_CHANNEL,
      JSON.stringify({ origin: 'x', tenantId: { $ne: '' } }),
    );
    await listener.subscribe('another-channel');
    await publisher.publish('another-channel', JSON.stringify({ origin: 'x' }));
    await flush();

    expect(only.clearOverrides).toHaveBeenCalledTimes(1);
  });

  it('stops listening once closed', async () => {
    const broker = createBroker();
    const first = createInstance(broker, 'first');
    const second = createInstance(broker, 'second');
    await flush();

    await second.invalidation.close();
    await first.invalidation.invalidate();
    await flush();

    expect(second.clearOverrides).not.toHaveBeenCalled();
  });

  it('keeps the local clear when publishing fails', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(logger);
    const clear = jest.fn().mockResolvedValue(undefined);
    const broker = createBroker();
    const invalidation = createConfigCacheInvalidation({
      clears: [{ label: 'clearOverrideCache', clear }],
      pubsub: {
        publisher: { publish: jest.fn().mockRejectedValue(new Error('redis down')) },
        subscriber: broker.subscriber(),
      },
    });

    await expect(invalidation.invalidate()).resolves.toBeUndefined();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Publishing to other instances failed'),
      expect.anything(),
    );
  });
});
