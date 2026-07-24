import {
  getOboTokenExpiresAtMs,
  getSkewedOboTokenCacheTtlMs,
  getSkewedOboTokenExpiresAtMs,
  hasUsableOboTokenExpiry,
  normalizeOboExpiresInSeconds,
} from './expiry';

describe('OBO expiry helpers', () => {
  const now = 1_700_000_000_000;

  describe('normalizeOboExpiresInSeconds', () => {
    it('defaults missing and non-finite expires_in values', () => {
      expect(normalizeOboExpiresInSeconds(null)).toBe(3600);
      expect(normalizeOboExpiresInSeconds(undefined)).toBe(3600);
      expect(normalizeOboExpiresInSeconds(Number.NaN)).toBe(3600);
      expect(normalizeOboExpiresInSeconds(Number.POSITIVE_INFINITY)).toBe(3600);
    });

    it('normalizes string, fractional, zero, and negative expires_in values', () => {
      expect(normalizeOboExpiresInSeconds('300')).toBe(300);
      expect(normalizeOboExpiresInSeconds(10.9)).toBe(10);
      expect(normalizeOboExpiresInSeconds(0)).toBe(1);
      expect(normalizeOboExpiresInSeconds(-30)).toBe(1);
    });
  });

  describe('getOboTokenExpiresAtMs', () => {
    it('prefers absolute expires_at over relative expires_in', () => {
      expect(
        getOboTokenExpiresAtMs({
          expiresAt: now + 120_000,
          expiresIn: 3600,
          now,
        }),
      ).toBe(now + 120_000);
    });

    it('falls back to normalized expires_in when expires_at is missing or invalid', () => {
      expect(
        getOboTokenExpiresAtMs({
          expiresAt: undefined,
          expiresIn: 300,
          now,
        }),
      ).toBe(now + 300_000);
      expect(
        getOboTokenExpiresAtMs({
          expiresAt: Number.NaN,
          expiresIn: '120',
          now,
        }),
      ).toBe(now + 120_000);
    });
  });

  describe('skew helpers', () => {
    it('subtracts the OBO buffer from expiry values', () => {
      const expiresAt = now + 120_000;

      expect(getSkewedOboTokenExpiresAtMs(expiresAt, now)).toBe(now + 90_000);
      expect(getSkewedOboTokenCacheTtlMs(expiresAt, now)).toBe(90_000);
    });

    it('keeps a one-second floor for very short lifetimes', () => {
      const expiresAt = now + 10_000;

      expect(getSkewedOboTokenExpiresAtMs(expiresAt, now)).toBe(now + 1000);
      expect(getSkewedOboTokenCacheTtlMs(expiresAt, now)).toBe(1000);
    });
  });

  describe('hasUsableOboTokenExpiry', () => {
    it('requires expiry to be strictly beyond the skew buffer', () => {
      expect(hasUsableOboTokenExpiry(now + 30_001, now)).toBe(true);
      expect(hasUsableOboTokenExpiry(now + 30_000, now)).toBe(false);
      expect(hasUsableOboTokenExpiry(now + 29_999, now)).toBe(false);
    });

    it('rejects missing and non-finite expiry values', () => {
      expect(hasUsableOboTokenExpiry(null, now)).toBe(false);
      expect(hasUsableOboTokenExpiry(undefined, now)).toBe(false);
      expect(hasUsableOboTokenExpiry(Number.NaN, now)).toBe(false);
    });
  });
});
