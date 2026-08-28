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

/** The lifetime a token response actually declares, in seconds, or `undefined` when it declares none usable. */
export function normalizeExpiresIn(expiresIn: unknown): number | undefined {
  if (typeof expiresIn === 'number') {
    return Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined;
  }

  if (typeof expiresIn === 'string') {
    const parsed = Number.parseInt(expiresIn, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

/**
 * Cache TTL in milliseconds for a token response. A provider that omits `expires_in` gets
 * `fallbackSeconds` rather than an entry that outlives the credential it holds.
 */
export function getTokenCacheTtlMs(expiresIn: unknown, fallbackSeconds: number): number {
  return (normalizeExpiresIn(expiresIn) ?? fallbackSeconds) * 1000;
}

/**
 * Absolute expiry for a token response, or `undefined` when its lifetime is unknown. Callers store
 * nothing rather than an Invalid Date, so an unknown expiry stays distinguishable from an elapsed one.
 */
export function getTokenExpiresAt(expiresIn: unknown): Date | undefined {
  const seconds = normalizeExpiresIn(expiresIn);
  return seconds == null ? undefined : new Date(Date.now() + seconds * 1000);
}
