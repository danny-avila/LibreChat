/**
 * RFC 6749 §5.1 makes `expires_in` only RECOMMENDED, so a token response may legally omit it, and
 * providers have been observed sending it as a string. Deriving a lifetime from the raw field is
 * therefore unsafe: `undefined * 1000` is `NaN`, and `NaN` is neither an error nor a default.
 *
 * A `NaN` cache TTL means an entry that never expires. `@keyv/redis` writes the key without `PX`
 * because `NaN` is falsy, and Keyv's own expiry checks compare with `>`, which is always false
 * against `NaN`. The namespace default does not stand in either, since Keyv applies it with `??=`
 * and `NaN` is neither `null` nor `undefined`. A `NaN` timestamp is just as sharp: `new Date(NaN)`
 * is an Invalid Date and `toISOString()` on it throws `RangeError`.
 *
 * Every lifetime derived from a token response goes through here so the rule has one home.
 */

/**
 * Fallback lifetime for a token response that declares none. One hour matches every hand-written
 * default this helper replaces, and is short enough that a wrongly-guessed lifetime self-corrects.
 */
export const DEFAULT_OAUTH_TOKEN_TTL_SECONDS = 3600;

/**
 * Floor for a cache TTL derived from an already-elapsed lifetime. Keyv reads a TTL of exactly `0`
 * as "no expiry" (`data.ttl === 0` becomes `undefined`), so a credential the provider declared
 * expired must never be written as `0` — that is the very failure this module exists to prevent.
 */
const EXPIRED_CACHE_TTL_MS = 1;

/**
 * Longest lifetime that can still produce a valid `Date`. The ECMAScript time value range ends at
 * ±8.64e15 ms, and every derived timestamp adds `Date.now()`, so the bound is halved to leave room
 * for it. A provider sending something beyond this — `"1e13"` seconds is roughly 317,000 years — is
 * not describing a credential lifetime, and accepting it would yield the Invalid Date this module
 * exists to prevent. Such a value is reported as unusable so callers take their fallback.
 */
const MAX_EXPIRES_IN_SECONDS = 4_320_000_000_000;

function parseExpiresIn(expiresIn: unknown): number | undefined {
  if (typeof expiresIn === 'number') {
    return expiresIn;
  }

  if (typeof expiresIn !== 'string') {
    return undefined;
  }

  /** `Number` over `parseInt`, which truncates a complete numeric string such as `"3.6e3"` to `3` */
  const trimmed = expiresIn.trim();
  return trimmed.length === 0 ? undefined : Number(trimmed);
}

/**
 * The lifetime a token response declares, in seconds, or `undefined` when it declares none usable.
 *
 * A non-positive value is preserved rather than discarded: the provider is stating the credential
 * is already expired, which is information, and collapsing it into "unknown" would hand it the
 * fallback lifetime and keep a dead credential alive.
 */
export function normalizeExpiresIn(expiresIn: unknown): number | undefined {
  const parsed = parseExpiresIn(expiresIn);
  if (parsed == null || !Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.abs(parsed) <= MAX_EXPIRES_IN_SECONDS ? parsed : undefined;
}

/**
 * Cache TTL in milliseconds for a token response. A provider that omits `expires_in` gets
 * `fallbackSeconds` rather than an entry that outlives the credential it holds; one that declares
 * an elapsed lifetime gets the shortest positive TTL rather than `0`, which Keyv reads as no expiry.
 */
export function getTokenCacheTtlMs(expiresIn: unknown, fallbackSeconds: number): number {
  const seconds = normalizeExpiresIn(expiresIn);
  if (seconds == null) {
    return fallbackSeconds * 1000;
  }
  return Math.max(seconds * 1000, EXPIRED_CACHE_TTL_MS);
}

/**
 * Absolute expiry for a token response, or `undefined` when its lifetime is unknown. Callers store
 * nothing rather than an Invalid Date, so an unknown expiry stays distinguishable from an elapsed
 * one — an elapsed lifetime still yields a past timestamp, so callers refresh instead of guessing.
 */
export function getTokenExpiresAt(expiresIn: unknown): Date | undefined {
  const seconds = normalizeExpiresIn(expiresIn);
  return seconds == null ? undefined : new Date(Date.now() + seconds * 1000);
}
