import crypto from 'node:crypto';
import type { Redis, Cluster } from 'ioredis';
import { logger } from '@librechat/data-schemas';
import type {
  ConfirmationDecision,
  ConfirmationOutcome,
  IConfirmationStore,
} from './ConfirmationStore';

/**
 * Redis-backed implementation of {@link IConfirmationStore} for multi-replica
 * LibreChat deployments.
 *
 * # Why this exists
 *
 * The in-memory {@link ./ConfirmationStore.ConfirmationStore} keeps pending
 * confirmations in a per-process `Map`. When LibreChat runs with more than
 * one replica behind a Service / Ingress that does not pin SSE traffic, the
 * SSE stream that calls `register()` (Pod A) and the
 * `POST /api/mcp/confirm/:id` that calls `resolve()` (Pod B) routinely land
 * on different pods. The resolve call then returns 404 even though the user
 * clicked Accept well within the TTL, and the tool eventually times out with
 * `User did not confirm in time`. Tracked as AIS-510; original incident
 * captured in the gateway audit log + a client-side HTTP trace on 2026-05-25.
 *
 * # How this fixes it
 *
 * Per-confirmation state is held in Redis under
 * `mcp:confirm:{<cid>}:meta` with a server-managed TTL. Resolve is an atomic
 * Lua script that combines `GETDEL` (so accept and timeout cannot both fire
 * for the same entry) with `PUBLISH` on `mcp:confirm:{<cid>}:chan`. The pod
 * that called `register()` subscribed to that channel and resolves its local
 * `waitForDecision` promise on receipt — regardless of which pod handled the
 * resolve POST.
 *
 * Local `setTimeout` is kept as a defense-in-depth fallback: if a pub/sub
 * message is lost (Redis reconnect mid-flight, subscriber miss between
 * unsubscribe and re-subscribe), the awaiter still receives a `timeout`
 * outcome and the agent loop unblocks. The Redis TTL on the meta key
 * guarantees the entry is eventually reaped regardless of pod state.
 *
 * # Design notes
 *
 * - The cid is generated with `crypto.randomUUID()` (122 bits of entropy),
 *   so a client cannot enumerate other users' confirmations.
 * - The owner-userId check is enforced inside the Lua script, not in the
 *   resolve route, so a Pod B handling another user's POST cannot release
 *   Pod A's confirmation.
 * - Lua KEYS share a `{<cid>}` hash tag so meta-key and pub/sub channel land
 *   on the same Redis Cluster slot (matches the convention used by
 *   {@link ../stream/implementations/RedisEventTransport.RedisEventTransport}).
 * - `register()` is async to guarantee `SUBSCRIBE` is in place before the
 *   subscriber's pod has any way to receive a publish for that cid.
 *   Without the await a fast client could trigger a publish before the
 *   subscription registered and the awaiter would only resolve on TTL.
 *
 * # Cluster-mode caveat
 *
 * Standard Redis pub/sub broadcasts to all nodes in a cluster, so this works
 * on Cluster too. Sharded pub/sub (`SSUBSCRIBE` / `SPUBLISH`) would be more
 * efficient at scale; not adopted here to keep the wire compatible with the
 * single-node deployment that ships in `librechat-chart` today. Migrating
 * later is a 1-line change in {@link RedisConfirmationStore.subscribe} and
 * the Lua script (`PUBLISH` → `SPUBLISH`).
 */

/**
 * Lua script: atomic owner-check + GETDEL meta + PUBLISH decision.
 *
 * Channel is passed as ARGV (not KEYS) on purpose: ioredis only applies
 * `keyPrefix` to KEYS[] inside EVAL, but does NOT apply it to channel names
 * in SUBSCRIBE/PUBLISH. Putting the channel in KEYS would make the Lua
 * `PUBLISH` use a prefixed name while the subscriber subscribed to the
 * unprefixed name — message never arrives, awaiter hangs until local TTL.
 * Putting it in ARGV keeps the wire format identical on both sides.
 */
const RESOLVE_LUA = `
local meta_key = KEYS[1]
local channel  = ARGV[1]
local user_id  = ARGV[2]
local decision = ARGV[3]

local raw = redis.call('GET', meta_key)
if not raw then
  return 'not_found'
end

local ok, decoded = pcall(cjson.decode, raw)
if not ok or type(decoded) ~= 'table' then
  -- Defensive cleanup: corrupted entry, treat as gone.
  redis.call('DEL', meta_key)
  return 'not_found'
end

if decoded.userId ~= user_id then
  return 'forbidden'
end

redis.call('DEL', meta_key)
redis.call('PUBLISH', channel, decision)
return 'ok'
`.trim();

const KEY_PREFIX = 'mcp:confirm';
const META_KEY = (cid: string): string => `${KEY_PREFIX}:{${cid}}:meta`;
const CHANNEL = (cid: string): string => `${KEY_PREFIX}:{${cid}}:chan`;
/** Matches CHANNEL(cid) so the on-message handler can recover the cid. */
const CHANNEL_REGEX = new RegExp(`^${KEY_PREFIX}:\\{([^}]+)\\}:chan$`);

/** Local-only state the awaiter pod needs to resolve a Promise on pub/sub. */
interface LocalPending {
  userId: string;
  resolve: (outcome: ConfirmationOutcome) => void;
  /** Timeout that fires `decision: 'timeout'` if pub/sub message is missed. */
  timer: NodeJS.Timeout;
}

interface MetaPayload {
  userId: string;
  /** Wall-clock epoch ms at which Redis will expire the entry. */
  expiresAt: number;
}

/** Decisions actually carried over the wire by the resolve path. */
type WireDecision = 'accept' | 'cancel';
const isWireDecision = (s: string): s is WireDecision => s === 'accept' || s === 'cancel';

export class RedisConfirmationStore implements IConfirmationStore {
  /** Client used for all non-subscribe commands (SET, EVAL, etc.). */
  private readonly publisher: Redis | Cluster;
  /**
   * Dedicated subscriber connection. Must be different from publisher because
   * a Redis client in subscribe mode cannot run other commands. Created by
   * the caller via `publisher.duplicate()` so all retry/TLS/auth options are
   * inherited.
   */
  private readonly subscriber: Redis | Cluster;
  /**
   * Per-cid promise-resolver state. Only contains cids this pod called
   * `register()` for — `resolve()` calls from other pods reach this pod via
   * pub/sub.
   */
  private readonly localPending = new Map<string, LocalPending>();
  /** Track in-flight unsubscribe so we don't double-issue from the handler. */
  private readonly subscriberRefs = new Set<string>();
  /** Disable handler dispatch after `close()` is called. */
  private closed = false;

  constructor(publisher: Redis | Cluster, subscriber: Redis | Cluster) {
    this.publisher = publisher;
    this.subscriber = subscriber;

    this.subscriber.on('message', (channel: string, message: string) => {
      if (this.closed) return;
      this.onMessage(channel, message);
    });
  }

  /**
   * Register a new pending confirmation and return both the cid (for
   * inclusion in the SSE event) and the promise the wrapper will await.
   *
   * Implementation order is important:
   * 1. SUBSCRIBE first, awaited — guarantees the subscription is in place
   *    before any other pod can publish a resolve message.
   * 2. SET the meta key second — the moment this lands, another pod's
   *    resolve POST will find the entry and publish; that publish reaches us
   *    via the already-active subscription from step 1.
   * 3. Start the local fallback timer last; arming it earlier would let it
   *    fire before subscribe completed.
   *
   * On error during init, the local entry is cleared and the awaiter
   * receives a `timeout` outcome immediately so the agent loop unblocks
   * instead of hanging on a half-registered confirmation.
   */
  async register(
    userId: string,
    ttlMs: number,
  ): Promise<{
    confirmationId: string;
    waitForDecision: Promise<ConfirmationOutcome>;
  }> {
    if (!userId) {
      throw new Error('RedisConfirmationStore.register requires a userId');
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('RedisConfirmationStore.register requires a positive ttlMs');
    }

    const confirmationId = crypto.randomUUID();
    const channel = CHANNEL(confirmationId);
    const metaKey = META_KEY(confirmationId);

    let resolveOutcome!: (outcome: ConfirmationOutcome) => void;
    const waitForDecision = new Promise<ConfirmationOutcome>((resolve) => {
      resolveOutcome = resolve;
    });

    try {
      await this.subscriber.subscribe(channel);
      this.subscriberRefs.add(confirmationId);

      const meta: MetaPayload = {
        userId,
        expiresAt: Date.now() + ttlMs,
      };
      // PX = TTL in milliseconds. Redis evicts the key on expiry so a crashed
      // pod cannot leak entries; the local timer below is only a Promise-side
      // fallback for the awaiter.
      await this.publisher.set(metaKey, JSON.stringify(meta), 'PX', Math.max(1, Math.floor(ttlMs)));

      const timer = setTimeout(() => {
        const local = this.localPending.get(confirmationId);
        if (!local) return;
        this.localPending.delete(confirmationId);
        this.releaseSubscription(confirmationId);
        logger.debug(
          `[RedisConfirmationStore] Confirmation ${confirmationId} timed out for user ${userId}`,
        );
        local.resolve({ decision: 'timeout' });
      }, ttlMs);
      if (typeof timer.unref === 'function') timer.unref();

      this.localPending.set(confirmationId, {
        userId,
        resolve: resolveOutcome,
        timer,
      });
    } catch (err) {
      // Best-effort cleanup; if any of these throw the awaiter still gets
      // 'timeout' below so the agent loop unblocks.
      this.releaseSubscription(confirmationId);
      try {
        await this.publisher.del(metaKey);
      } catch {
        /* tolerate */
      }
      logger.error(`[RedisConfirmationStore] register failed for ${confirmationId}`, err);
      // Resolve the awaiter so the agent loop does not hang on a failed
      // registration. Synthesize as 'timeout' (matches the in-memory store's
      // failure modes — caller treats both timeout and cancel as "do not
      // forward upstream").
      resolveOutcome({ decision: 'timeout' });
    }

    return { confirmationId, waitForDecision };
  }

  /**
   * Resolve a pending confirmation. Safe to call from any pod — the Lua
   * script enforces atomicity and the owner-userId check.
   */
  async resolve(
    confirmationId: string,
    userId: string,
    decision: WireDecision,
  ): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }> {
    if (!isWireDecision(decision)) {
      // Defensive — the IConfirmationStore type already narrows this, but
      // the route handler validates user input separately.
      return { ok: false, reason: 'not_found' };
    }
    try {
      const result = (await this.publisher.eval(
        RESOLVE_LUA,
        1,
        META_KEY(confirmationId),
        CHANNEL(confirmationId),
        userId,
        decision,
      )) as string;

      if (result === 'ok') {
        return { ok: true };
      }
      if (result === 'forbidden') {
        logger.warn(
          `[RedisConfirmationStore] User ${userId} attempted to resolve confirmation ${confirmationId} owned by another user`,
        );
        return { ok: false, reason: 'forbidden' };
      }
      return { ok: false, reason: 'not_found' };
    } catch (err) {
      // Connection lost mid-call — surface as not_found so the route returns
      // 404 and the awaiter eventually times out. This preserves the
      // invariant that a successful response to the client means the call
      // was atomically committed.
      logger.error(`[RedisConfirmationStore] resolve failed for ${confirmationId}`, err);
      return { ok: false, reason: 'not_found' };
    }
  }

  /**
   * Synchronous local-presence check. Only ever returns `true` for cids this
   * pod registered AND has not yet seen a resolution for; cids registered on
   * other pods return `false` here. The route handler does not use this —
   * it's exposed for tests + introspection only.
   */
  has(confirmationId: string): boolean {
    return this.localPending.has(confirmationId);
  }

  /** Number of cids this pod is currently awaiting. */
  size(): number {
    return this.localPending.size;
  }

  /**
   * Tear down subscriptions and dispatcher. Tests use this between cases;
   * production code never calls it.
   */
  async close(): Promise<void> {
    this.closed = true;
    for (const local of this.localPending.values()) {
      clearTimeout(local.timer);
    }
    this.localPending.clear();
    const refs = Array.from(this.subscriberRefs);
    this.subscriberRefs.clear();
    if (refs.length > 0) {
      try {
        await this.subscriber.unsubscribe(...refs.map(CHANNEL));
      } catch {
        /* tolerate */
      }
    }
  }

  private onMessage(channel: string, message: string): void {
    const match = channel.match(CHANNEL_REGEX);
    if (!match) return;
    const confirmationId = match[1];
    const local = this.localPending.get(confirmationId);
    if (!local) {
      // Either we never registered this cid (message for another pod —
      // ignored), or we already resolved it locally (idempotent no-op).
      return;
    }
    this.localPending.delete(confirmationId);
    clearTimeout(local.timer);
    this.releaseSubscription(confirmationId);

    const decision: ConfirmationDecision = isWireDecision(message)
      ? message
      : // Defensive: an unknown wire string is treated as timeout so the
        // awaiter unblocks rather than handing the LLM an unverified result.
        'timeout';
    local.resolve({ decision });
  }

  /**
   * Best-effort unsubscribe. Failures are non-fatal: Redis will clean up the
   * subscription when the connection drops, and stale subscriptions on a
   * still-alive connection only cost a hash-map entry inside ioredis.
   */
  private releaseSubscription(confirmationId: string): void {
    this.subscriberRefs.delete(confirmationId);
    this.subscriber.unsubscribe(CHANNEL(confirmationId)).catch(() => {
      /* tolerate */
    });
  }
}
