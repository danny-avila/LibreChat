import {
  DEFAULT_OAUTH_TOKEN_TTL_SECONDS,
  getTokenCacheTtlMs,
  getTokenExpiresAt,
  normalizeExpiresIn,
} from './expiry';

describe('normalizeExpiresIn', () => {
  it('accepts a positive finite number of seconds', () => {
    expect(normalizeExpiresIn(3599)).toBe(3599);
    expect(normalizeExpiresIn(1)).toBe(1);
  });

  it('accepts a numeric string, as some providers send', () => {
    expect(normalizeExpiresIn('3599')).toBe(3599);
  });

  it('rejects an omitted lifetime', () => {
    expect(normalizeExpiresIn(undefined)).toBeUndefined();
    expect(normalizeExpiresIn(null)).toBeUndefined();
  });

  it('rejects NaN, which `undefined * 1000` produces and every naive guard admits', () => {
    expect(normalizeExpiresIn(NaN)).toBeUndefined();
    expect(normalizeExpiresIn('not-a-number')).toBeUndefined();
  });

  it('rejects a non-finite lifetime', () => {
    expect(normalizeExpiresIn(Infinity)).toBeUndefined();
    expect(normalizeExpiresIn(-Infinity)).toBeUndefined();
  });

  /**
   * Parsing the complete string is what makes this reachable — `parseInt('1e13', 10)` was `1` and
   * masked it. `1e13` seconds overruns the ECMAScript time range, so every derived timestamp would
   * be an Invalid Date whose `toISOString()` throws: the very failure this module removes.
   */
  it('rejects a lifetime that would overflow the Date range', () => {
    expect(normalizeExpiresIn('1e13')).toBeUndefined();
    expect(normalizeExpiresIn(1e13)).toBeUndefined();
    expect(normalizeExpiresIn(-1e13)).toBeUndefined();
    expect(normalizeExpiresIn(Number.MAX_SAFE_INTEGER)).toBeUndefined();
  });

  it('still accepts lifetimes far longer than any real credential', () => {
    const oneYear = 365 * 24 * 60 * 60;
    expect(normalizeExpiresIn(oneYear)).toBe(oneYear);
    expect(normalizeExpiresIn(oneYear * 100)).toBe(oneYear * 100);
  });

  /** An explicit non-positive value is the provider saying the credential is already dead, which is
   *  information — collapsing it into "unknown" would hand it the fallback lifetime and revive it. */
  it('preserves an explicitly elapsed lifetime rather than calling it unknown', () => {
    expect(normalizeExpiresIn(0)).toBe(0);
    expect(normalizeExpiresIn(-60)).toBe(-60);
    expect(normalizeExpiresIn('0')).toBe(0);
  });

  it('parses a complete numeric string, which parseInt would truncate', () => {
    expect(normalizeExpiresIn('3.6e3')).toBe(3600);
    expect(normalizeExpiresIn(' 3600 ')).toBe(3600);
  });

  it('rejects an empty or blank string rather than reading it as zero', () => {
    expect(normalizeExpiresIn('')).toBeUndefined();
    expect(normalizeExpiresIn('   ')).toBeUndefined();
  });

  it('rejects shapes that are neither number nor string', () => {
    expect(normalizeExpiresIn({})).toBeUndefined();
    expect(normalizeExpiresIn([3600])).toBeUndefined();
    expect(normalizeExpiresIn(true)).toBeUndefined();
  });
});

describe('getTokenCacheTtlMs', () => {
  it('converts a declared lifetime to milliseconds', () => {
    expect(getTokenCacheTtlMs(1800, DEFAULT_OAUTH_TOKEN_TTL_SECONDS)).toBe(1_800_000);
  });

  it('falls back rather than returning NaN when the provider omits `expires_in`', () => {
    expect(getTokenCacheTtlMs(undefined, DEFAULT_OAUTH_TOKEN_TTL_SECONDS)).toBe(3_600_000);
    expect(getTokenCacheTtlMs(NaN, 60)).toBe(60_000);
  });

  /** Keyv reads a TTL of exactly 0 as "no expiry", so an elapsed lifetime must not pass through raw */
  it('floors an elapsed lifetime to the shortest positive TTL, never 0', () => {
    expect(getTokenCacheTtlMs(0, DEFAULT_OAUTH_TOKEN_TTL_SECONDS)).toBe(1);
    expect(getTokenCacheTtlMs(-60, DEFAULT_OAUTH_TOKEN_TTL_SECONDS)).toBe(1);
  });

  it('does not hand an elapsed lifetime the fallback, which would revive a dead credential', () => {
    expect(getTokenCacheTtlMs(0, DEFAULT_OAUTH_TOKEN_TTL_SECONDS)).not.toBe(3_600_000);
  });

  it('never returns 0, which Keyv would store as no expiry', () => {
    for (const value of [undefined, null, NaN, Infinity, 0, -1, '0', 'abc', {}, '1e13', 1e300]) {
      const ttl = getTokenCacheTtlMs(value, DEFAULT_OAUTH_TOKEN_TTL_SECONDS);
      expect(ttl).toBeGreaterThan(0);
      expect(Number.isFinite(ttl)).toBe(true);
    }
  });

  /**
   * A NaN TTL is not a short TTL: `@keyv/redis` skips its `PX` branch because NaN is falsy, and
   * Keyv's own expiry checks compare with `>`, always false against NaN. The result is an entry
   * that outlives the credential it holds.
   */
  it('never returns NaN, whatever the provider sent', () => {
    for (const value of [undefined, null, NaN, Infinity, 0, -1, 'abc', {}]) {
      expect(Number.isFinite(getTokenCacheTtlMs(value, DEFAULT_OAUTH_TOKEN_TTL_SECONDS))).toBe(
        true,
      );
    }
  });
});

describe('getTokenExpiresAt', () => {
  it('returns an absolute expiry for a declared lifetime', () => {
    const before = Date.now();
    const expiresAt = getTokenExpiresAt(600);

    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 600_000);
    expect(expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 600_000);
  });

  it('returns undefined rather than an Invalid Date when the lifetime is unknown', () => {
    for (const value of [undefined, null, NaN, Infinity, 'abc', '']) {
      expect(getTokenExpiresAt(value)).toBeUndefined();
    }
  });

  /** An elapsed lifetime must stay elapsed, so callers refresh instead of treating it as unknown */
  it('returns a past timestamp for an explicitly elapsed lifetime', () => {
    const expiresAt = getTokenExpiresAt(0);

    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(getTokenExpiresAt(-60)!.getTime()).toBeLessThan(Date.now());
  });

  /** `new Date(NaN).toISOString()` throws `RangeError: Invalid time value`, which is the ActionService failure */
  it('never yields a value whose toISOString throws', () => {
    for (const value of [undefined, null, NaN, Infinity, 'abc', '', 0, -60, 3600, '1e13', 1e300]) {
      expect(() => getTokenExpiresAt(value)?.toISOString()).not.toThrow();
    }
  });
});
