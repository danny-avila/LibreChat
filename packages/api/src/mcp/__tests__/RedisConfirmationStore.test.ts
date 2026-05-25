/**
 * Unit tests for RedisConfirmationStore using an in-process fake of the
 * ioredis client/subscriber pair. These exercise the store's local state
 * transitions (registration, local timeout fallback, pub/sub dispatch,
 * subscription cleanup, idempotency) without requiring a real Redis.
 *
 * The multi-instance race scenario — register on store A, resolve on
 * store B, A's promise resolves via pub/sub — is covered separately by
 * RedisConfirmationStore.cache_integration.spec.ts against a live Redis.
 */

import { EventEmitter } from 'node:events';
import { RedisConfirmationStore } from '../RedisConfirmationStore';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/**
 * Minimal ioredis stand-in shared by publisher + subscriber in a test.
 * Only the surface the store uses is implemented: SET / DEL / EVAL /
 * SUBSCRIBE / UNSUBSCRIBE / on('message'). All operations are
 * synchronous-ish (resolved promises) — Redis ordering guarantees do not
 * apply, but the store's logic does not depend on them.
 */
class FakeRedis extends EventEmitter {
  private store = new Map<string, string>();
  private subscriptions = new Set<string>();
  private channelListeners = new Map<string, Set<FakeRedis>>();
  /** Allow tests to share one underlying "Redis" between multiple clients. */
  private bus: FakeRedisBus;

  constructor(bus?: FakeRedisBus) {
    super();
    this.bus = bus ?? new FakeRedisBus();
    this.bus.register(this);
  }

  get _bus(): FakeRedisBus {
    return this.bus;
  }

  async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
    this.bus.kv.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.bus.kv.delete(key) ? 1 : 0;
  }

  async subscribe(channel: string): Promise<number> {
    this.subscriptions.add(channel);
    this.bus.addSubscriber(channel, this);
    return this.subscriptions.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    const list = channels.length > 0 ? channels : Array.from(this.subscriptions);
    for (const c of list) {
      this.subscriptions.delete(c);
      this.bus.removeSubscriber(c, this);
    }
    return this.subscriptions.size;
  }

  /**
   * Emulates the small Lua script in RedisConfirmationStore — keep in sync
   * with RESOLVE_LUA semantics. The store only calls EVAL with that one
   * script so we hard-code its behaviour here. Argument layout matches the
   * production call site exactly: 1 KEYS (metaKey), 3 ARGV (channel, userId,
   * decision).
   */
  async eval(
    _script: string,
    _numKeys: number,
    metaKey: string,
    channel: string,
    userId: string,
    decision: string,
  ): Promise<string> {
    const raw = this.bus.kv.get(metaKey);
    if (raw == null) return 'not_found';
    let decoded: { userId?: string } = {};
    try {
      decoded = JSON.parse(raw);
    } catch {
      this.bus.kv.delete(metaKey);
      return 'not_found';
    }
    if (decoded.userId !== userId) return 'forbidden';
    this.bus.kv.delete(metaKey);
    this.bus.publish(channel, decision);
    return 'ok';
  }

  /** Used by FakeRedisBus to deliver pub/sub messages. */
  _deliver(channel: string, message: string): void {
    this.emit('message', channel, message);
  }

  // ioredis API surface for unsubscribe-on-close paths.
  duplicate(): FakeRedis {
    return new FakeRedis(this.bus);
  }
}

class FakeRedisBus {
  /** Shared kv backing store across all FakeRedis clients on this bus. */
  kv = new Map<string, string>();
  private clients = new Set<FakeRedis>();
  private channels = new Map<string, Set<FakeRedis>>();

  register(client: FakeRedis): void {
    this.clients.add(client);
  }

  addSubscriber(channel: string, client: FakeRedis): void {
    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(client);
  }

  removeSubscriber(channel: string, client: FakeRedis): void {
    const set = this.channels.get(channel);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.channels.delete(channel);
  }

  publish(channel: string, message: string): void {
    const subs = this.channels.get(channel);
    if (!subs) return;
    // Synchronous dispatch — Node's ioredis dispatches via 'message' too,
    // and the store's handler is sync, so this matches production behaviour
    // closely enough for the assertions we make.
    for (const sub of subs) {
      sub._deliver(channel, message);
    }
  }
}

function makePair(): {
  publisher: FakeRedis;
  subscriber: FakeRedis;
  bus: FakeRedisBus;
} {
  const publisher = new FakeRedis();
  // Subscriber shares the bus with publisher so commands on one are visible
  // to the other — same single-Redis topology a real ioredis pair has.
  const subscriber = publisher.duplicate();
  return { publisher, subscriber, bus: publisher._bus };
}

describe('RedisConfirmationStore', () => {
  describe('register / resolve happy path (same instance)', () => {
    it('register + resolve returns ok and the awaiter sees the decision', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);
      expect(store.has(confirmationId)).toBe(true);
      expect(store.size()).toBe(1);

      const result = await store.resolve(confirmationId, 'user-1', 'accept');
      expect(result).toEqual({ ok: true });

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });
      expect(store.has(confirmationId)).toBe(false);
      expect(store.size()).toBe(0);

      await store.close();
    });

    it('cancel decisions reach the awaiter', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);
      await store.resolve(confirmationId, 'user-1', 'cancel');
      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'cancel' });
      await store.close();
    });
  });

  describe('cross-instance resolve (the original bug)', () => {
    it('resolves the awaiter even when the resolve call lands on another store instance', async () => {
      // Two RedisConfirmationStore instances sharing one underlying Redis
      // bus — emulates two LibreChat pods talking to the same redis-master.
      const bus = new FakeRedisBus();
      const podA_pub = new FakeRedis(bus);
      const podA_sub = podA_pub.duplicate();
      const podB_pub = new FakeRedis(bus);
      const podB_sub = podB_pub.duplicate();

      const storeA = new RedisConfirmationStore(
        podA_pub as unknown as never,
        podA_sub as unknown as never,
      );
      const storeB = new RedisConfirmationStore(
        podB_pub as unknown as never,
        podB_sub as unknown as never,
      );

      // Pod A registers — emulates the SSE-stream pod
      const { confirmationId, waitForDecision } = await storeA.register('user-1', 5_000);
      expect(storeA.has(confirmationId)).toBe(true);
      expect(storeB.has(confirmationId)).toBe(false); // Pod B has no local copy

      // Pod B resolves — emulates the POST /api/mcp/confirm hitting the
      // wrong pod through a round-robin load balancer. Before AIS-510 this
      // was a 404; with Redis backing it must succeed.
      const result = await storeB.resolve(confirmationId, 'user-1', 'accept');
      expect(result).toEqual({ ok: true });

      // Pod A's awaiter unblocks via pub/sub.
      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });
      expect(storeA.has(confirmationId)).toBe(false);

      await storeA.close();
      await storeB.close();
    });
  });

  describe('local timeout fallback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('local awaiter resolves with timeout when ttl elapses without a decision', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 1_000);
      expect(store.has(confirmationId)).toBe(true);

      jest.advanceTimersByTime(1_000);
      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'timeout' });
      expect(store.has(confirmationId)).toBe(false);

      await store.close();
    });

    it('subsequent resolve after local timeout returns not_found (no second wire decision)', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 1_000);
      jest.advanceTimersByTime(1_000);
      await waitForDecision;

      // Local timeout did not clear the Redis key — but a real Redis would
      // have PX-expired it. The fake doesn't model PX so simulate by deleting.
      await publisher.del(`mcp:confirm:{${confirmationId}}:meta`);

      const result = await store.resolve(confirmationId, 'user-1', 'accept');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
      await store.close();
    });
  });

  describe('owner enforcement', () => {
    it("rejects a different user's resolve attempt with 'forbidden' and leaves the entry intact", async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      const result = await store.resolve(confirmationId, 'attacker', 'accept');
      expect(result).toEqual({ ok: false, reason: 'forbidden' });

      // Awaiter must remain pending — race a setImmediate to confirm.
      let settled = false;
      void waitForDecision.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      // Owner can still resolve normally.
      const owner = await store.resolve(confirmationId, 'user-1', 'accept');
      expect(owner).toEqual({ ok: true });
      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });

      await store.close();
    });
  });

  describe('idempotency', () => {
    it('double-resolve returns not_found on the second call and awaiter sees only the first decision', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const { confirmationId, waitForDecision } = await store.register('user-1', 5_000);

      const first = await store.resolve(confirmationId, 'user-1', 'accept');
      const second = await store.resolve(confirmationId, 'user-1', 'cancel');
      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: 'not_found' });

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'accept' });

      await store.close();
    });

    it('resolve for unknown cid returns not_found', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const result = await store.resolve('does-not-exist', 'user-1', 'accept');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
      await store.close();
    });
  });

  describe('input validation', () => {
    it('register rejects empty userId', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      await expect(store.register('', 1_000)).rejects.toThrow(/userId/);
      await store.close();
    });

    it('register rejects non-positive ttlMs', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      await expect(store.register('u', 0)).rejects.toThrow(/ttlMs/);
      await expect(store.register('u', -1)).rejects.toThrow(/ttlMs/);
      await store.close();
    });

    it('produces unique cids across calls', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      const a = await store.register('user-1', 5_000);
      const b = await store.register('user-1', 5_000);
      expect(a.confirmationId).not.toEqual(b.confirmationId);
      await store.close();
    });
  });

  describe('defensive: unknown wire decision', () => {
    it('treats a non-accept/cancel pub/sub message as timeout so the awaiter unblocks safely', async () => {
      const bus = new FakeRedisBus();
      const podA_pub = new FakeRedis(bus);
      const podA_sub = podA_pub.duplicate();
      const storeA = new RedisConfirmationStore(
        podA_pub as unknown as never,
        podA_sub as unknown as never,
      );

      const { confirmationId, waitForDecision } = await storeA.register('user-1', 5_000);

      // Simulate a corrupted pub/sub message arriving directly on the bus
      // (bypasses the Lua script which would never produce this in
      // production — exercises the dispatcher's safety net).
      bus.publish(`mcp:confirm:{${confirmationId}}:chan`, 'bogus-decision');

      const outcome = await waitForDecision;
      expect(outcome).toEqual({ decision: 'timeout' });
      await storeA.close();
    });
  });

  describe('close()', () => {
    it('clears local pending and unsubscribes', async () => {
      const { publisher, subscriber } = makePair();
      const store = new RedisConfirmationStore(
        publisher as unknown as never,
        subscriber as unknown as never,
      );

      await store.register('user-1', 5_000);
      expect(store.size()).toBe(1);

      await store.close();
      expect(store.size()).toBe(0);
    });
  });
});
