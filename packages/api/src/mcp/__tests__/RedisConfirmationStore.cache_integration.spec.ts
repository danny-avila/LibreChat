/**
 * Integration tests for RedisConfirmationStore against a live Redis.
 *
 * These exercise the cross-pod scenario that the in-memory ConfirmationStore
 * cannot satisfy and that AIS-510 reported as a production bug:
 *
 *   Pod A subscribes to a Redis pub/sub channel via `register()`.
 *   Pod B handles the user's POST /api/mcp/confirm/:id and calls `resolve()`.
 *   Pod A's awaiter MUST unblock via pub/sub regardless of which pod resolved.
 *
 * Run with:
 *
 *   USE_REDIS=true npx jest --config packages/api/jest.config.js \
 *     RedisConfirmationStore.cache_integration
 *
 * The test creates two RedisConfirmationStore instances backed by separate
 * ioredis client pairs but pointing at the same Redis URL — that's the
 * topology a 2-pod LibreChat deployment has against `librechat-redis-master`.
 */

import { expect } from '@playwright/test';
import IoRedis, { type Redis } from 'ioredis';
import { RedisConfirmationStore } from '../RedisConfirmationStore';

const REDIS_URI = process.env.REDIS_URI ?? 'redis://127.0.0.1:6379';
/** Unique prefix per test run so concurrent runs don't collide. */
const TEST_PREFIX = `RedisConfirmationStore-IntegrationTest-${process.pid}`;

interface PodPair {
  publisher: Redis;
  subscriber: Redis;
  store: RedisConfirmationStore;
}

function makePod(): PodPair {
  const publisher = new IoRedis(REDIS_URI, {
    keyPrefix: `${TEST_PREFIX}:`,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  const subscriber = publisher.duplicate();
  const store = new RedisConfirmationStore(publisher, subscriber);
  return { publisher, subscriber, store };
}

async function teardownPod(pod: PodPair): Promise<void> {
  await pod.store.close();
  pod.publisher.disconnect();
  pod.subscriber.disconnect();
}

describe('RedisConfirmationStore (integration: live Redis)', () => {
  let pods: PodPair[] = [];

  afterEach(async () => {
    await Promise.all(pods.map(teardownPod));
    pods = [];
  });

  it('cross-pod resolve: register on pod A, resolve on pod B, pod A awaiter unblocks', async () => {
    const podA = makePod();
    const podB = makePod();
    pods.push(podA, podB);

    const { confirmationId, waitForDecision } = await podA.store.register('user-1', 5_000);

    // Pod B handles the POST — it has no local knowledge of this cid.
    expect(podA.store.has(confirmationId)).toBe(true);
    expect(podB.store.has(confirmationId)).toBe(false);

    const result = await podB.store.resolve(confirmationId, 'user-1', 'accept');
    expect(result).toEqual({ ok: true });

    const outcome = await waitForDecision;
    expect(outcome).toEqual({ decision: 'accept' });
    expect(podA.store.has(confirmationId)).toBe(false);
  });

  it('cross-pod cancel decision is delivered to the registering pod', async () => {
    const podA = makePod();
    const podB = makePod();
    pods.push(podA, podB);

    const { confirmationId, waitForDecision } = await podA.store.register('user-1', 5_000);

    const result = await podB.store.resolve(confirmationId, 'user-1', 'cancel');
    expect(result).toEqual({ ok: true });

    const outcome = await waitForDecision;
    expect(outcome).toEqual({ decision: 'cancel' });
  });

  it('three parallel confirmations across two pods — reproduces the AIS-510 scenario', async () => {
    // The exact scenario Adam reported on 2026-05-25: LLM emits 3 parallel
    // write tool calls, the user accepts/declines from a queued dialog,
    // each accept POST round-robins to a random pod. Before the fix, ~2/3
    // returned 404 because the in-memory store on the receiving pod had no
    // record of the cid. After the fix, all 3 must resolve correctly
    // regardless of which pod handles each POST.
    const podA = makePod();
    const podB = makePod();
    pods.push(podA, podB);

    // All three registrations land on pod A (simulating the SSE-stream pod).
    const reg1 = await podA.store.register('user-1', 5_000);
    const reg2 = await podA.store.register('user-1', 5_000);
    const reg3 = await podA.store.register('user-1', 5_000);

    expect(reg1.confirmationId).not.toEqual(reg2.confirmationId);
    expect(reg2.confirmationId).not.toEqual(reg3.confirmationId);

    // Three resolves on pod B — none have local state there.
    const [r1, r2, r3] = await Promise.all([
      podB.store.resolve(reg1.confirmationId, 'user-1', 'accept'),
      podB.store.resolve(reg2.confirmationId, 'user-1', 'accept'),
      podB.store.resolve(reg3.confirmationId, 'user-1', 'cancel'),
    ]);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(r3).toEqual({ ok: true });

    const [o1, o2, o3] = await Promise.all([
      reg1.waitForDecision,
      reg2.waitForDecision,
      reg3.waitForDecision,
    ]);
    expect(o1).toEqual({ decision: 'accept' });
    expect(o2).toEqual({ decision: 'accept' });
    expect(o3).toEqual({ decision: 'cancel' });
  });

  it('owner enforcement: a different user calling resolve from another pod returns forbidden', async () => {
    const podA = makePod();
    const podB = makePod();
    pods.push(podA, podB);

    const { confirmationId, waitForDecision } = await podA.store.register('user-1', 5_000);

    const result = await podB.store.resolve(confirmationId, 'attacker', 'accept');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(podA.store.has(confirmationId)).toBe(true);

    // Legitimate owner can still resolve.
    const ok = await podB.store.resolve(confirmationId, 'user-1', 'accept');
    expect(ok).toEqual({ ok: true });
    const outcome = await waitForDecision;
    expect(outcome).toEqual({ decision: 'accept' });
  });

  it('double-resolve across pods is idempotent (atomic Lua)', async () => {
    const podA = makePod();
    const podB = makePod();
    pods.push(podA, podB);

    const { confirmationId, waitForDecision } = await podA.store.register('user-1', 5_000);

    // Two resolve calls race from two pods. Exactly one must win.
    const [r1, r2] = await Promise.all([
      podA.store.resolve(confirmationId, 'user-1', 'accept'),
      podB.store.resolve(confirmationId, 'user-1', 'cancel'),
    ]);
    const ok = [r1, r2].filter((r) => r.ok === true);
    const notFound = [r1, r2].filter((r) => r.ok === false && r.reason === 'not_found');
    expect(ok.length).toBe(1);
    expect(notFound.length).toBe(1);

    // Awaiter sees only the winner's decision; never both.
    const outcome = await waitForDecision;
    expect(['accept', 'cancel']).toContain(outcome.decision);
  });

  it('redis TTL expires the meta key when the agent loop crashes before resolving', async () => {
    // Simulate Pod A registering then crashing (close() before resolve).
    // The Redis meta key should expire on its own — Pod B trying to resolve
    // after TTL must get not_found rather than a stale ok.
    const podA = makePod();
    pods.push(podA);

    const { confirmationId } = await podA.store.register('user-1', 500);
    await podA.store.close();

    // Wait > TTL + a small Redis-side cleanup margin.
    await new Promise((r) => setTimeout(r, 800));

    const podB = makePod();
    pods.push(podB);
    const result = await podB.store.resolve(confirmationId, 'user-1', 'accept');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
