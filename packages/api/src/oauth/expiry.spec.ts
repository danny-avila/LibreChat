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

  it('rejects a non-finite or non-positive lifetime', () => {
    expect(normalizeExpiresIn(Infinity)).toBeUndefined();
    expect(normalizeExpiresIn(-Infinity)).toBeUndefined();
    expect(normalizeExpiresIn(0)).toBeUndefined();
    expect(normalizeExpiresIn(-60)).toBeUndefined();
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
    for (const value of [undefined, null, NaN, 'abc', 0]) {
      expect(getTokenExpiresAt(value)).toBeUndefined();
    }
  });

  /** `new Date(NaN).toISOString()` throws `RangeError: Invalid time value`, which is the ActionService failure */
  it('never yields a value whose toISOString throws', () => {
    for (const value of [undefined, null, NaN, Infinity, 'abc', 3600]) {
      expect(() => getTokenExpiresAt(value)?.toISOString()).not.toThrow();
    }
  });
});
