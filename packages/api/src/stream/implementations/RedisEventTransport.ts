import { logger } from '@librechat/data-schemas';
import type { Redis, Cluster } from 'ioredis';
import type { IEventTransport } from '~/stream/interfaces/IJobStore';
import { instrumentIORedisClient, RedisUseCases } from '~/cache/redisTelemetry';

/**
 * Redis key prefixes for pub/sub channels
 */
const CHANNELS = {
  /** Main event channel: stream:{streamId}:events (hash tag for cluster compatibility) */
  events: (streamId: string) => `stream:{${streamId}}:events`,
};

/**
 * Redis keys for shared state (hash-tagged for cluster slot compatibility)
 */
const KEYS = {
  /** Atomic sequence counter: shared across all replicas for a given stream */
  sequence: (streamId: string) => `stream:{${streamId}}:seq`,
  /** Job metadata, used to keep the sequence counter alive for the full job lifetime */
  job: (streamId: string) => `stream:{${streamId}}:job`,
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
  /** Hold sequenced delivery until first-subscriber replay establishes its frontier. */
  deliveryDeferred: boolean;
}

/**
 * Allocate a sequence number and publish the event in a single round trip.
 *
 * The payload is spliced server-side rather than round-tripped through `cjson`: decoding and
 * re-encoding arbitrary event data would coerce empty arrays to objects and alter float
 * precision. The caller pre-serializes everything around the seq, so this only concatenates.
 *
 * The sequence TTL is extend-only. Once it falls below half the safety window, it is refreshed
 * to the longer of that window and the live job TTL. Checking the job TTL only at that threshold
 * keeps it off the per-delta hot path. Because stream IDs are conversation IDs, keeping this
 * counter monotonic across normal cleanup lets a lingering subscriber order later turns.
 *
 * The channel is passed as ARGV, not KEYS: ioredis applies `keyPrefix` to EVAL keys but never
 * to a pub/sub channel, so keying it here would publish to a prefixed channel that no
 * subscriber listens on. PUBLISH is broadcast cluster-wide rather than slot-routed, so it does
 * not need to be a key for Cluster correctness.
 *
 *   KEYS: [sequence, job]
 *   ARGV: [channel, payloadPrefix, payloadSuffix, sequenceTtlSeconds]
 *   RETURNS: the 0-indexed seq assigned to this event
 */
const PUBLISH_SEQ_LUA =
  'local val = redis.call("INCR", KEYS[1]) ' +
  'local ttl = tonumber(ARGV[4]) ' +
  'local seqTtl = redis.call("TTL", KEYS[1]) ' +
  'if seqTtl < math.floor(ttl / 2) then ' +
  'local jobTtl = redis.call("TTL", KEYS[2]) ' +
  'if jobTtl > ttl then ttl = jobTtl end ' +
  'redis.call("EXPIRE", KEYS[1], ttl) ' +
  'end ' +
  'local seq = val - 1 ' +
  'redis.call("PUBLISH", ARGV[1], ARGV[2] .. string.format("%d", seq) .. ARGV[3]) ' +
  'return seq';

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
  /** Track channel subscription state: resolved promise = active, pending = in-flight */
  private channelSubscriptions = new Map<string, Promise<void>>();
  /** Counter for generating unique subscriber IDs */
  private subscriberIdCounter = 0;

  /**
   * Create a new Redis event transport.
   *
   * @param publisher - Redis client for publishing (can be shared)
   * @param subscriber - Redis client for subscribing (must be dedicated)
   */
  constructor(publisher: Redis | Cluster, subscriber: Redis | Cluster) {
    this.publisher = instrumentIORedisClient(publisher, RedisUseCases.GENERATION_STREAM);
    this.subscriber = instrumentIORedisClient(subscriber, RedisUseCases.GENERATION_STREAM);

    // Set up message handler for all subscriptions
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });
  }

  /** Minimum safety-net TTL in seconds; publishing and pause transitions may only extend it. */
  private static readonly SEQUENCE_TTL_SECONDS = 86400;

  /**
   * Split a seq-less message into the JSON fragments surrounding its `seq`, so the sequence
   * can be spliced in by {@link PUBLISH_SEQ_LUA} without re-encoding the payload.
   *
   * Omitting a field (e.g. `data: undefined`) yields an empty tail, matching what
   * `JSON.stringify` would have dropped from the whole-object encoding.
   */
  private static buildPayloadParts(message: Omit<PubSubMessage, 'seq'>): [string, string] {
    const { type, ...rest } = message;
    const encodedRest = JSON.stringify(rest);
    const inner = encodedRest.slice(1, -1);
    return [`{"type":${JSON.stringify(type)},"seq":`, inner.length > 0 ? `,${inner}}` : '}'];
  }

  /**
   * Allocate a sequence number and publish, in one Redis round trip.
   *
   * The shared counter survives local cleanup and expires after its sliding TTL once no
   * generation is publishing. This bounds storage without resetting another replica's
   * subscriber frontier between turns.
   */
  private async publishWithSequence(
    streamId: string,
    message: Omit<PubSubMessage, 'seq'>,
  ): Promise<number> {
    const [prefix, suffix] = RedisEventTransport.buildPayloadParts(message);
    const seq = await this.publisher.eval(
      PUBLISH_SEQ_LUA,
      2,
      KEYS.sequence(streamId),
      KEYS.job(streamId),
      CHANNELS.events(streamId),
      prefix,
      suffix,
      String(RedisEventTransport.SEQUENCE_TTL_SECONDS),
    );
    return seq as number;
  }

  /** Reset subscriber reorder buffer state to initial values */
  private resetReorderBuffer(streamId: string): void {
    const state = this.streams.get(streamId);
    if (state) {
      if (state.reorderBuffer.flushTimeout) {
        clearTimeout(state.reorderBuffer.flushTimeout);
        state.reorderBuffer.flushTimeout = null;
      }
      state.reorderBuffer.nextSeq = 0;
      state.reorderBuffer.pending.clear();
      state.reorderBuffer.deliveryDeferred = false;
    }
  }

  /**
   * Advance subscriber reorder buffer to the authoritative Redis sequence counter (cross-replica safe).
   *
   * @param replayedNextSeq - Absolute Redis sequence immediately after the last event replayed
   *   from earlyEventBuffer. Pending entries below it were already delivered; entries at or
   *   above it are live chunks from the ongoing generation. Using the exact replay frontier
   *   (not the Redis counter) is critical: INCR can advance the counter past a live chunk's
   *   sequence during the GET window. Undefined means no local replay, so currentSeq is trusted.
   */
  async syncReorderBuffer(streamId: string, replayedNextSeq?: number): Promise<void> {
    const initialState = this.streams.get(streamId);
    try {
      const key = KEYS.sequence(streamId);
      const rawStr = await this.publisher.get(key);
      const parsed = rawStr != null ? parseInt(rawStr, 10) : 0;
      const currentSeq = Number.isNaN(parsed) ? 0 : parsed;
      const state = this.streams.get(streamId);
      // cleanup() may replace this stream's local state while the Redis GET is in
      // flight. An obsolete snapshot must never move the replacement's frontier.
      if (state !== initialState) {
        return;
      }
      if (!state) {
        return;
      }

      const buffer = state.reorderBuffer;
      if (buffer.flushTimeout) {
        clearTimeout(buffer.flushTimeout);
        buffer.flushTimeout = null;
      }

      // Prune true duplicates already delivered via earlyEventBuffer. Entries at or above
      // the absolute replay frontier are live (possibly from an ongoing generation).
      if (replayedNextSeq != null) {
        for (const seq of buffer.pending.keys()) {
          if (seq < replayedNextSeq) {
            buffer.pending.delete(seq);
          }
        }
      }

      // Set nextSeq from remaining state. Never regress — handleOrderedChunk may have
      // already advanced it during the async GET window.
      if (buffer.pending.size === 0) {
        // Same-replica replay: INCR precedes PUBLISH, so currentSeq may reflect
        // allocated-but-not-yet-delivered events. Cap at the exact replay frontier to
        // avoid skipping in-flight chunks. With no local replay, trust the Redis counter.
        const ceiling = replayedNextSeq ?? currentSeq;
        buffer.nextSeq = Math.max(buffer.nextSeq, ceiling);
      } else {
        let minPending = Infinity;
        for (const seq of buffer.pending.keys()) {
          if (seq < minPending) {
            minPending = seq;
          }
        }
        buffer.nextSeq = Math.max(buffer.nextSeq, Math.min(currentSeq, minPending));
      }

      buffer.deliveryDeferred = false;
      this.flushPendingMessages(streamId, state);

      // Re-arm flush timeout if gaps remain after sync — without this,
      // buffered messages could sit indefinitely if no new messages arrive.
      if (buffer.pending.size > 0) {
        this.scheduleFlushTimeout(streamId, state);
      }
    } catch (err) {
      const state = this.streams.get(streamId);
      // A failed Redis GET must not leave a live subscription permanently paused.
      // Fall back to normal reorder/timeout behavior and let the caller log the sync error.
      if (state === initialState && state?.reorderBuffer.deliveryDeferred) {
        state.reorderBuffer.deliveryDeferred = false;
        this.flushPendingMessages(streamId, state);
        if (state.reorderBuffer.pending.size > 0) {
          this.scheduleFlushTimeout(streamId, state);
        }
      }
      throw err;
    }
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

    if (buffer.deliveryDeferred) {
      buffer.pending.set(seq, message);
      return;
    }

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

    if (buffer.deliveryDeferred) {
      buffer.pending.set(seq, message);
      return;
    }

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
    options?: { deferSequenceDelivery?: boolean },
  ): { unsubscribe: () => void; ready?: Promise<void> } {
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
          deliveryDeferred: false,
        },
      });
    }

    const streamState = this.streams.get(streamId)!;
    // Internal listeners (for example cross-replica abort) can leave ordering
    // state behind with no real SSE subscribers. A new subscriber is a fresh
    // attachment and must not inherit that prior generation's expected seq.
    if (streamState.count === 0) {
      this.resetReorderBuffer(streamId);
      streamState.reorderBuffer.deliveryDeferred = options?.deferSequenceDelivery === true;
    }
    streamState.count++;
    streamState.handlers.set(subscriberId, handlers);

    let readyPromise = this.channelSubscriptions.get(channel);

    if (!readyPromise) {
      readyPromise = this.subscriber
        .subscribe(channel)
        .then(() => {
          logger.debug(`[RedisEventTransport] Subscription active for channel ${channel}`);
        })
        .catch((err) => {
          this.channelSubscriptions.delete(channel);
          logger.error(`[RedisEventTransport] Failed to subscribe to ${channel}:`, err);
        });
      this.channelSubscriptions.set(channel, readyPromise);
    }

    return {
      ready: readyPromise,
      unsubscribe: () => {
        // An unsubscribe closure belongs to the exact state and handler created
        // above. After cleanup + stream reuse, it must not decrement or detach
        // the replacement subscription that happens to share the same stream ID.
        if (
          this.streams.get(streamId) !== streamState ||
          !streamState.handlers.delete(subscriberId)
        ) {
          return;
        }

        streamState.count--;

        // If last subscriber left, unsubscribe from Redis and notify
        if (streamState.count === 0) {
          /**
           * Preserve callbacks for reconnect, but drop ordering state from the
           * previous attachment. Reconnects always call syncReorderBuffer(), so
           * keeping a detached subscriber's pending gaps or frontier here can
           * only delay the next attachment before that authoritative sync.
           */
          this.resetReorderBuffer(streamId);

          this.subscriber.unsubscribe(channel).catch((err) => {
            logger.error(`[RedisEventTransport] Failed to unsubscribe from ${channel}:`, err);
          });
          this.channelSubscriptions.delete(channel);

          // Call all-subscribers-left callbacks
          for (const callback of streamState.allSubscribersLeftCallbacks) {
            try {
              callback();
            } catch (err) {
              logger.error(`[RedisEventTransport] Error in allSubscribersLeft callback:`, err);
            }
          }
          /**
           *  Preserve stream state (callbacks, abort handlers) for reconnection.
           *  Previously this deleted the entire state, which lost the
           *  allSubscribersLeftCallbacks and abortCallbacks registered by
           *  GenerationJobManager.createJob(). On the next subscribe() call,
           *  fresh state was created without those callbacks, causing
           *  hasSubscriber to never reset and syncReorderBuffer to be skipped.
           *  State is fully cleaned up by cleanup() when the job completes.
           */
        }
      },
    };
  }

  /**
   * Publish a chunk event to all subscribers across all instances.
   * Includes sequence number for ordered delivery in Redis Cluster mode.
   *
   * Performance: sequence allocation and publish share one round trip. This runs per streamed
   * delta, so the saved round trip is multiplied by the token count of every response.
   */
  async emitChunk(streamId: string, event: unknown): Promise<number | undefined> {
    try {
      return await this.publishWithSequence(streamId, { type: EventTypes.CHUNK, data: event });
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish chunk:`, err);
      return undefined;
    }
  }

  /**
   * Publish a done event to all subscribers.
   * Includes sequence number to ensure delivery after all chunks.
   */
  async emitDone(streamId: string, event: unknown): Promise<void> {
    try {
      await this.publishWithSequence(streamId, { type: EventTypes.DONE, data: event });
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish done:`, err);
      throw err;
    }
  }

  /**
   * Publish an error event to all subscribers.
   * Includes sequence number to ensure delivery after all chunks.
   */
  async emitError(streamId: string, error: string): Promise<void> {
    try {
      await this.publishWithSequence(streamId, { type: EventTypes.ERROR, error });
    } catch (err) {
      logger.error(`[RedisEventTransport] Failed to publish error:`, err);
      throw err;
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
          deliveryDeferred: false,
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
          deliveryDeferred: false,
        },
      };
      this.streams.set(streamId, state);
    }

    state.abortCallbacks.push(callback);

    if (!this.channelSubscriptions.has(channel)) {
      const ready = this.subscriber
        .subscribe(channel)
        .then(() => {})
        .catch((err) => {
          this.channelSubscriptions.delete(channel);
          logger.error(`[RedisEventTransport] Failed to subscribe to ${channel}:`, err);
        });
      this.channelSubscriptions.set(channel, ready);
    }
  }

  /**
   * Get all tracked stream IDs (for orphan cleanup)
   */
  getTrackedStreamIds(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Cleanup local resources for a specific stream.
   *
   * The sequence counter is deliberately left in Redis. A stream ID is currently the
   * conversation ID, so later turns reuse the same ordering namespace. Another replica
   * may also still have a subscriber whose reorder buffer is positioned at this counter.
   * Deleting it here would restart the next producer at zero and make that subscriber
   * discard the entire next turn as duplicate traffic. The counter's sliding TTL bounds
   * orphan lifetime.
   */
  cleanup(streamId: string): void {
    const channel = CHANNELS.events(streamId);
    const state = this.streams.get(streamId);

    if (state) {
      state.handlers.clear();
      state.allSubscribersLeftCallbacks = [];
      state.abortCallbacks = [];
    }

    this.resetReorderBuffer(streamId);

    if (this.channelSubscriptions.has(channel)) {
      this.subscriber.unsubscribe(channel).catch((err) => {
        logger.error(`[RedisEventTransport] Failed to cleanup ${channel}:`, err);
      });
      this.channelSubscriptions.delete(channel);
    }

    this.streams.delete(streamId);
  }

  /**
   * Destroy all resources.
   */
  destroy(): void {
    // Clear all flush timeouts and buffered messages.
    // Sequence keys are NOT deleted here — they are shared across replicas.
    // A shutting-down replica must not nuke the counter for active publishers.
    // A sliding 24h safety-net TTL caps orphan lifetime after the last publish.
    for (const [, state] of this.streams) {
      if (state.reorderBuffer.flushTimeout) {
        clearTimeout(state.reorderBuffer.flushTimeout);
        state.reorderBuffer.flushTimeout = null;
      }
      state.reorderBuffer.pending.clear();
    }

    for (const channel of this.channelSubscriptions.keys()) {
      this.subscriber.unsubscribe(channel).catch(() => {});
    }

    this.channelSubscriptions.clear();
    this.streams.clear();

    try {
      this.subscriber.disconnect();
    } catch {
      /* ignore */
    }

    logger.info('[RedisEventTransport] Destroyed');
  }
}
