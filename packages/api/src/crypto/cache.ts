interface CachedToken {
  token: string;
  expiresAt: number;
  cachedUntil: number;
}

export interface TokenMintCache {
  /** A cached token for `key`, or `null` when nothing reusable is held. */
  get(key: string, now: number): string | null;
  /**
   * Records `token`, reusable until `cacheSeconds` elapse or the safety margin
   * before its expiry begins, whichever comes first. The window is passed per
   * call because a deployment may reconfigure it without restarting.
   */
  set(key: string, token: string, expiresAt: number, now: number, cacheSeconds: number): void;
  /** Drops every entry. Call whenever the signing material changes. */
  clear(): void;
}

/**
 * Reuse window for a minted token, and the margin kept clear of its expiry.
 * A token is only ever served while it has more than the margin left, so a
 * consumer that receives it always has time to spend it before it expires.
 */
export const TOKEN_MINT_CACHE_SECONDS = 30;
export const TOKEN_REUSE_SAFETY_WINDOW_SECONDS = 30;
const PRUNE_INTERVAL_SECONDS = 30;

/**
 * Caches short-lived service tokens keyed on the exact claim set they carry.
 *
 * Asymmetric signing is expensive enough to matter on request paths that mint
 * per file, so a token is reused for a bounded window rather than re-signed for
 * every call. Reuse means the `jti` is shared across that window too: it stays
 * a replay handle for the receiving service, but it does not make each call
 * individually identifiable.
 *
 * Entries are pruned lazily, at most once per interval, so a cache that is hit
 * steadily never walks itself on the hot path.
 */
export const createTokenMintCache = (): TokenMintCache => {
  const entries = new Map<string, CachedToken>();
  let lastPrunedAt = 0;

  const prune = (now: number): void => {
    if (entries.size === 0 || now - lastPrunedAt < PRUNE_INTERVAL_SECONDS) {
      return;
    }
    lastPrunedAt = now;
    for (const [key, cached] of entries) {
      if (
        cached.cachedUntil <= now ||
        cached.expiresAt <= now + TOKEN_REUSE_SAFETY_WINDOW_SECONDS
      ) {
        entries.delete(key);
      }
    }
  };

  return {
    get(key, now) {
      prune(now);
      const cached = entries.get(key);
      if (!cached) {
        return null;
      }
      if (
        cached.cachedUntil <= now ||
        cached.expiresAt <= now + TOKEN_REUSE_SAFETY_WINDOW_SECONDS
      ) {
        return null;
      }
      return cached.token;
    },
    set(key, token, expiresAt, now, cacheSeconds) {
      entries.set(key, {
        token,
        expiresAt,
        cachedUntil: Math.min(now + cacheSeconds, expiresAt - TOKEN_REUSE_SAFETY_WINDOW_SECONDS),
      });
    },
    clear() {
      entries.clear();
      lastPrunedAt = 0;
    },
  };
};
