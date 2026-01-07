import type { Redis, Cluster } from 'ioredis';
import { logger } from '@librechat/data-schemas';
import type { IEventTransport } from '~/stream/interfaces/IJobStore';

/**
 * Redis key prefixes for pub/sub channels
 */
const CHANNELS = {
  /** Main event channel: stream:{streamId}:events (hash tag for cluster compatibility) */
  events: (streamId: string) => `stream:{${streamId}}:events`,
};

/**
 * Event types for pub/sub messages
 */
const EventTypes = {
  CHUNK: 'chunk',
  DONE: 'done',
  ERROR: 'error',
  ABORT: 'abort',
} as const;

interface PubSubMessage {
  type: (typeof EventTypes)[keyof typeof EventTypes];
  data?: unknown;
  error?: string;
}

/**
 * Subscriber state for a stream
 */
interface StreamSubscribers {
  count: number;
  handlers: Map<
    string,
    {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    }
  >;
  allSubscribersLeftCallbacks: Array<() => void>;
  /** Abort callbacks - called when abort signal is received from any replica */
  abortCallbacks: Array<() => void>;
}

/**
 * Redis Pub/Sub implementation of IEventTransport.
 * Enables real-time event delivery across multiple instances.
 *
 * Architecture (inspired by https://upstash.com/blog/resumable-llm-streams):
 * - Publisher: Emits events to Redis channel when chunks arrive
 * - Subscriber: Listens to Redis channel and forwards to SSE clients
 * - Decoupled: Generator and consumer don't need direct connection
 *
 * Note: Requires TWO Redis connections - one for publishing, one for subscribing.
 * This is a Redis limitation: a client in subscribe mode can't publish.
 *
 * @example
 * ```ts
 * const transport = new RedisEventTransport(publisherClient, subscriberClient);
 * transport.subscribe(streamId, { onChunk: (e) => res.write(e) });
 * transport.emitChunk(streamId, { text: 'Hello' });
 * ```
 */
export class RedisEventTransport implements IEventTransport {
  /** Redis client for publishing events */
  private publisher: Redis | Cluster;
  /** Redis client for subscribing to events (separate connection required) */
  private subscriber: Redis | Cluster;
  /** Track subscribers per stream */
  private streams = new Map<string, StreamSubscribers>();
  /** Track which channels we're subscribed to */
  private subscribedChannels = new Set<string>();
  /** Counter for generating unique subscriber IDs */
  private subscriberIdCounter = 0;

  /**
   * Create a new Redis event transport.
   *
   * @param publisher - Redis client for publishing (can be shared)
   * @param subscriber - Redis client for subscribing (must be dedicated)
   */
  constructor(publisher: Redis | Cluster, subscriber: Redis | Cluster) {
    this.publisher = publisher;
    this.subscriber = subscriber;

    // Set up message handler for all subscriptions
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });
  }

  /**
   * Handle incoming pub/sub message
   */
  private handleMessage(channel: string, message: string): void {
    // Extract streamId from channel name: stream:{streamId}:events
    // Use regex to extract the hash tag content
    const match = channel.match(/^stream:\{([^}]+)\}:events$/);
    if (!match) {
      return;
    }
    const streamId = match[1];

    const streamState = this.streams.get(streamId);
    if (!streamState) {
      return;
    }

    try {
      const parsed = JSON.parse(message) as PubSubMessage;

      for (const [, handlers] of streamState.handlers) {
        switch (parsed.type) {
          case EventTypes.CHUNK:
            handlers.onChunk(parsed.data);
            break;
          case EventTypes.DONE:
            handlers.onDone?.(parsed.data);
            break;
          case EventTypes.ERROR:
            handlers.onError?.(parsed.error ?? 'Unknown error');
            break;
          case EventTypes.ABORT:
            // Abort is handled at stream level, not per-handler
            break;
        }
      }

      // Handle abort signals at stream level (not per-handler)
      if (parsed.type === EventTypes.ABORT) {
        for (const callback of streamState.abortCallbacks) {
          try {
            callback();
          } catch (err) {
            logger.error(`[RedisEventTransport] Error in abort callback:`, err);
          }
        }
      }
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to parse message:`, err);
    }
  }

  /**
   * Subscribe to events for a stream.
   *
   * On first subscriber for a stream, subscribes to the Redis channel.
   * Returns unsubscribe function that cleans up when last subscriber leaves.
   */
  subscribe(
    streamId: string,
    handlers: {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    },
  ): { unsubscribe: () => void } {
    const channel = CHANNELS.events(streamId);
    const subscriberId = `sub_${++this.subscriberIdCounter}`;

    // Initialize stream state if needed
    if (!this.streams.has(streamId)) {
      this.streams.set(streamId, {
        count: 0,
        handlers: new Map(),
        allSubscribersLeftCallbacks: [],
        abortCallbacks: [],
      });
    }

    const streamState = this.streams.get(streamId)!;
    streamState.count++;
    streamState.handlers.set(subscriberId, handlers);

    // Subscribe to Redis channel if this is first subscriber
    if (!this.subscribedChannels.has(channel)) {
      this.subscribedChannels.add(channel);
      this.subscriber.subscribe(channel).catch((err) => {
        logger.error(`[RedisEventTransport] Failed to subscribe to ${channel}:`, err);
      });
    }

    // Return unsubscribe function
    return {
      unsubscribe: () => {
        const state = this.streams.get(streamId);
        if (!state) {
          return;
        }

        state.handlers.delete(subscriberId);
        state.count--;

        // If last subscriber left, unsubscribe from Redis and notify
        if (state.count === 0) {
          this.subscriber.unsubscribe(channel).catch((err) => {
            logger.error(`[RedisEventTransport] Failed to unsubscribe from ${channel}:`, err);
          });
          this.subscribedChannels.delete(channel);

          // Call all-subscribers-left callbacks
          for (const callback of state.allSubscribersLeftCallbacks) {
            try {
              callback();
            } catch (err) {
              logger.error(`[RedisEventTransport] Error in allSubscribersLeft callback:`, err);
            }
          }

          this.streams.delete(streamId);
        }
      },
    };
  }

  /**
   * Publish a chunk event to all subscribers across all instances.
   */
  emitChunk(streamId: string, event: unknown): void {
    const channel = CHANNELS.events(streamId);
    const message: PubSubMessage = { type: EventTypes.CHUNK, data: event };

    this.publisher.publish(channel, JSON.stringify(message)).catch((err) => {
      logger.error(`[RedisEventTransport] Failed to publish chunk:`, err);
    });
  }

  /**
   * Publish a done event to all subscribers.
   */
  emitDone(streamId: string, event: unknown): void {
    const channel = CHANNELS.events(streamId);
    const message: PubSubMessage = { type: EventTypes.DONE, data: event };

    this.publisher.publish(channel, JSON.stringify(message)).catch((err) => {
      logger.error(`[RedisEventTransport] Failed to publish done:`, err);
    });
  }

  /**
   * Publish an error event to all subscribers.
   */
  emitError(streamId: string, error: string): void {
    const channel = CHANNELS.events(streamId);
    const message: PubSubMessage = { type: EventTypes.ERROR, error };

    this.publisher.publish(channel, JSON.stringify(message)).catch((err) => {
      logger.error(`[RedisEventTransport] Failed to publish error:`, err);
    });
  }

  /**
   * Get subscriber count for a stream (local instance only).
   *
   * Note: In a multi-instance setup, this only returns local subscriber count.
   * For global count, would need to track in Redis (e.g., with a counter key).
   */
  getSubscriberCount(streamId: string): number {
    return this.streams.get(streamId)?.count ?? 0;
  }

  /**
   * Check if this is the first subscriber (local instance only).
   */
  isFirstSubscriber(streamId: string): boolean {
    return this.getSubscriberCount(streamId) === 1;
  }

  /**
   * Register callback for when all subscribers leave.
   */
  onAllSubscribersLeft(streamId: string, callback: () => void): void {
    const state = this.streams.get(streamId);
    if (state) {
      state.allSubscribersLeftCallbacks.push(callback);
    } else {
      // Create state just for the callback
      this.streams.set(streamId, {
        count: 0,
        handlers: new Map(),
        allSubscribersLeftCallbacks: [callback],
        abortCallbacks: [],
      });
    }
  }

  /**
   * Publish an abort signal to all replicas.
   * This enables cross-replica abort: when a user aborts on Replica B,
   * the generating Replica A receives the signal and stops.
   */
  emitAbort(streamId: string): void {
    const channel = CHANNELS.events(streamId);
    const message: PubSubMessage = { type: EventTypes.ABORT };

    this.publisher.publish(channel, JSON.stringify(message)).catch((err) => {
      logger.error(`[RedisEventTransport] Failed to publish abort:`, err);
    });
  }

  /**
   * Register callback for abort signals from any replica.
   * Called when abort is triggered on any replica (including this one).
   *
   * @param streamId - The stream identifier
   * @param callback - Called when abort signal is received
   */
  onAbort(streamId: string, callback: () => void): void {
    const channel = CHANNELS.events(streamId);
    let state = this.streams.get(streamId);

    if (!state) {
      state = {
        count: 0,
        handlers: new Map(),
        allSubscribersLeftCallbacks: [],
        abortCallbacks: [],
      };
      this.streams.set(streamId, state);
    }

    state.abortCallbacks.push(callback);

    // Subscribe to Redis channel if not already subscribed
    if (!this.subscribedChannels.has(channel)) {
      this.subscribedChannels.add(channel);
      this.subscriber.subscribe(channel).catch((err) => {
        logger.error(`[RedisEventTransport] Failed to subscribe to ${channel}:`, err);
      });
    }
  }

  /**
   * Get all tracked stream IDs (for orphan cleanup)
   */
  getTrackedStreamIds(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Cleanup resources for a specific stream.
   */
  cleanup(streamId: string): void {
    const channel = CHANNELS.events(streamId);
    const state = this.streams.get(streamId);

    if (state) {
      // Clear all handlers and callbacks
      state.handlers.clear();
      state.allSubscribersLeftCallbacks = [];
      state.abortCallbacks = [];
    }

    // Unsubscribe from Redis channel
    if (this.subscribedChannels.has(channel)) {
      this.subscriber.unsubscribe(channel).catch((err) => {
        logger.error(`[RedisEventTransport] Failed to cleanup ${channel}:`, err);
      });
      this.subscribedChannels.delete(channel);
    }

    this.streams.delete(streamId);
  }

  /**
   * Destroy all resources.
   */
  destroy(): void {
    // Unsubscribe from all channels
    for (const channel of this.subscribedChannels) {
      this.subscriber.unsubscribe(channel).catch(() => {
        // Ignore errors during shutdown
      });
    }

    this.subscribedChannels.clear();
    this.streams.clear();

    // Note: Don't close Redis connections - they may be shared
    logger.info('[RedisEventTransport] Destroyed');
  }
}
