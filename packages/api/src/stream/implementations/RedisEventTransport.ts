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
  /** Sequence number for ordering (critical for Redis Cluster) */
  seq?: number;
  data?: unknown;
  error?: string;
}

/**
 * Reorder buffer state for a stream subscription.
 * Handles out-of-order message delivery in Redis Cluster mode.
 */
interface ReorderBuffer {
  /** Next expected sequence number */
  nextSeq: number;
  /** Buffered messages waiting for earlier sequences */
  pending: Map<number, PubSubMessage>;
  /** Timeout handle for flushing stale messages */
  flushTimeout: ReturnType<typeof setTimeout> | null;
}

/** Max time (ms) to wait for out-of-order messages before force-flushing */
const REORDER_TIMEOUT_MS = 500;
/** Max messages to buffer before force-flushing (prevents memory issues) */
const MAX_BUFFER_SIZE = 100;

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
  /** Reorder buffer for handling out-of-order delivery in Redis Cluster */
  reorderBuffer: ReorderBuffer;
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
  /** Sequence counters per stream for publishing (ensures ordered delivery in cluster mode) */
  private sequenceCounters = new Map<string, number>();

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

  /** Get next sequence number for a stream (0-indexed) */
  private getNextSequence(streamId: string): number {
    const current = this.sequenceCounters.get(streamId) ?? 0;
    this.sequenceCounters.set(streamId, current + 1);
    return current;
  }

  /** Reset sequence counter for a stream */
  private resetSequence(streamId: string): void {
    this.sequenceCounters.delete(streamId);
  }

  /**
   * Handle incoming pub/sub message with reordering support for Redis Cluster
   */
  private handleMessage(channel: string, message: string): void {
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

      if (parsed.type === EventTypes.CHUNK && parsed.seq != null) {
        this.handleOrderedChunk(streamId, streamState, parsed);
      } else if (
        (parsed.type === EventTypes.DONE || parsed.type === EventTypes.ERROR) &&
        parsed.seq != null
      ) {
        this.handleTerminalEvent(streamId, streamState, parsed);
      } else {
        this.deliverMessage(streamState, parsed);
      }
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to parse message:`, err);
    }
  }

  /**
   * Handle terminal events (done/error) with sequence-based ordering.
   * Buffers the terminal event and delivers after all preceding chunks arrive.
   */
  private handleTerminalEvent(
    streamId: string,
    streamState: StreamSubscribers,
    message: PubSubMessage,
  ): void {
    const buffer = streamState.reorderBuffer;
    const seq = message.seq!;

    if (seq < buffer.nextSeq) {
      logger.debug(
        `[RedisEventTransport] Dropping duplicate terminal event for stream ${streamId}: seq=${seq}, expected=${buffer.nextSeq}`,
      );
      return;
    }

    if (seq === buffer.nextSeq) {
      this.deliverMessage(streamState, message);
      buffer.nextSeq++;
      this.flushPendingMessages(streamId, streamState);
    } else {
      buffer.pending.set(seq, message);
      this.scheduleFlushTimeout(streamId, streamState);
    }
  }

  /**
   * Handle chunk messages with sequence-based reordering.
   * Buffers out-of-order messages and delivers them in sequence.
   */
  private handleOrderedChunk(
    streamId: string,
    streamState: StreamSubscribers,
    message: PubSubMessage,
  ): void {
    const buffer = streamState.reorderBuffer;
    const seq = message.seq!;

    if (seq === buffer.nextSeq) {
      this.deliverMessage(streamState, message);
      buffer.nextSeq++;

      this.flushPendingMessages(streamId, streamState);
    } else if (seq > buffer.nextSeq) {
      buffer.pending.set(seq, message);

      if (buffer.pending.size >= MAX_BUFFER_SIZE) {
        logger.warn(`[RedisEventTransport] Buffer overflow for stream ${streamId}, force-flushing`);
        this.forceFlushBuffer(streamId, streamState);
      } else {
        this.scheduleFlushTimeout(streamId, streamState);
      }
    } else {
      logger.debug(
        `[RedisEventTransport] Dropping duplicate/old message for stream ${streamId}: seq=${seq}, expected=${buffer.nextSeq}`,
      );
    }
  }

  /** Deliver consecutive pending messages */
  private flushPendingMessages(streamId: string, streamState: StreamSubscribers): void {
    const buffer = streamState.reorderBuffer;

    while (buffer.pending.has(buffer.nextSeq)) {
      const message = buffer.pending.get(buffer.nextSeq)!;
      buffer.pending.delete(buffer.nextSeq);
      this.deliverMessage(streamState, message);
      buffer.nextSeq++;
    }

    if (buffer.pending.size === 0 && buffer.flushTimeout) {
      clearTimeout(buffer.flushTimeout);
      buffer.flushTimeout = null;
    }
  }

  /** Force-flush all pending messages in order (used on timeout or overflow) */
  private forceFlushBuffer(streamId: string, streamState: StreamSubscribers): void {
    const buffer = streamState.reorderBuffer;

    if (buffer.flushTimeout) {
      clearTimeout(buffer.flushTimeout);
      buffer.flushTimeout = null;
    }

    if (buffer.pending.size === 0) {
      return;
    }

    const sortedSeqs = [...buffer.pending.keys()].sort((a, b) => a - b);
    const skipped = sortedSeqs[0] - buffer.nextSeq;

    if (skipped > 0) {
      logger.warn(
        `[RedisEventTransport] Stream ${streamId}: skipping ${skipped} missing messages (seq ${buffer.nextSeq}-${sortedSeqs[0] - 1})`,
      );
    }

    for (const seq of sortedSeqs) {
      const message = buffer.pending.get(seq)!;
      buffer.pending.delete(seq);
      this.deliverMessage(streamState, message);
    }

    buffer.nextSeq = sortedSeqs[sortedSeqs.length - 1] + 1;
  }

  /** Schedule a timeout to force-flush if gaps aren't filled */
  private scheduleFlushTimeout(streamId: string, streamState: StreamSubscribers): void {
    const buffer = streamState.reorderBuffer;

    if (buffer.flushTimeout) {
      return;
    }

    buffer.flushTimeout = setTimeout(() => {
      buffer.flushTimeout = null;
      if (buffer.pending.size > 0) {
        logger.warn(
          `[RedisEventTransport] Stream ${streamId}: timeout waiting for seq ${buffer.nextSeq}, force-flushing ${buffer.pending.size} messages`,
        );
        this.forceFlushBuffer(streamId, streamState);
      }
    }, REORDER_TIMEOUT_MS);
  }

  /** Deliver a message to all handlers */
  private deliverMessage(streamState: StreamSubscribers, message: PubSubMessage): void {
    for (const [, handlers] of streamState.handlers) {
      switch (message.type) {
        case EventTypes.CHUNK:
          handlers.onChunk(message.data);
          break;
        case EventTypes.DONE:
          handlers.onDone?.(message.data);
          break;
        case EventTypes.ERROR:
          handlers.onError?.(message.error ?? 'Unknown error');
          break;
        case EventTypes.ABORT:
          break;
      }
    }

    if (message.type === EventTypes.ABORT) {
      for (const callback of streamState.abortCallbacks) {
        try {
          callback();
        } catch (err) {
          logger.error(`[RedisEventTransport] Error in abort callback:`, err);
        }
      }
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
        reorderBuffer: {
          nextSeq: 0,
          pending: new Map(),
          flushTimeout: null,
        },
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
          // Clear any pending flush timeout and buffered messages
          if (state.reorderBuffer.flushTimeout) {
            clearTimeout(state.reorderBuffer.flushTimeout);
            state.reorderBuffer.flushTimeout = null;
          }
          state.reorderBuffer.pending.clear();

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
   * Includes sequence number for ordered delivery in Redis Cluster mode.
   */
  async emitChunk(streamId: string, event: unknown): Promise<void> {
    const channel = CHANNELS.events(streamId);
    const seq = this.getNextSequence(streamId);
    const message: PubSubMessage = { type: EventTypes.CHUNK, seq, data: event };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish chunk:`, err);
    }
  }

  /**
   * Publish a done event to all subscribers.
   * Includes sequence number to ensure delivery after all chunks.
   */
  async emitDone(streamId: string, event: unknown): Promise<void> {
    const channel = CHANNELS.events(streamId);
    const seq = this.getNextSequence(streamId);
    const message: PubSubMessage = { type: EventTypes.DONE, seq, data: event };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish done:`, err);
    }
  }

  /**
   * Publish an error event to all subscribers.
   * Includes sequence number to ensure delivery after all chunks.
   */
  async emitError(streamId: string, error: string): Promise<void> {
    const channel = CHANNELS.events(streamId);
    const seq = this.getNextSequence(streamId);
    const message: PubSubMessage = { type: EventTypes.ERROR, seq, error };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish error:`, err);
    }
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
        reorderBuffer: {
          nextSeq: 0,
          pending: new Map(),
          flushTimeout: null,
        },
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
        reorderBuffer: {
          nextSeq: 0,
          pending: new Map(),
          flushTimeout: null,
        },
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
      // Clear flush timeout
      if (state.reorderBuffer.flushTimeout) {
        clearTimeout(state.reorderBuffer.flushTimeout);
        state.reorderBuffer.flushTimeout = null;
      }
      // Clear all handlers and callbacks
      state.handlers.clear();
      state.allSubscribersLeftCallbacks = [];
      state.abortCallbacks = [];
      state.reorderBuffer.pending.clear();
    }

    // Reset sequence counter for this stream
    this.resetSequence(streamId);

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
    // Clear all flush timeouts and buffered messages
    for (const [, state] of this.streams) {
      if (state.reorderBuffer.flushTimeout) {
        clearTimeout(state.reorderBuffer.flushTimeout);
        state.reorderBuffer.flushTimeout = null;
      }
      state.reorderBuffer.pending.clear();
    }

    // Unsubscribe from all channels
    for (const channel of this.subscribedChannels) {
      this.subscriber.unsubscribe(channel).catch(() => {
        // Ignore errors during shutdown
      });
    }

    this.subscribedChannels.clear();
    this.streams.clear();
    this.sequenceCounters.clear();

    // Note: Don't close Redis connections - they may be shared
    logger.info('[RedisEventTransport] Destroyed');
  }
}
