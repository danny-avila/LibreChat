import { getRefillEligibilityDate, getNextRefillDate } from '../src/balance';

describe('getRefillEligibilityDate', () => {
  it('adds the interval to the last refill date for each unit', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(getRefillEligibilityDate(base, 30, 'seconds').toISOString()).toBe(
      '2026-01-01T00:00:30.000Z',
    );
    expect(getRefillEligibilityDate(base, 2, 'hours').toISOString()).toBe(
      '2026-01-01T02:00:00.000Z',
    );
    expect(getRefillEligibilityDate(base, 30, 'days').toISOString()).toBe(
      '2026-01-31T00:00:00.000Z',
    );
    expect(getRefillEligibilityDate(base, 2, 'weeks').toISOString()).toBe(
      '2026-01-15T00:00:00.000Z',
    );
  });
});

describe('getNextRefillDate', () => {
  it('returns the eligibility date when it is still in the future', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const lastRefill = new Date('2026-01-01T00:00:00.000Z');
    expect(getNextRefillDate(lastRefill, 30, 'days', now).toISOString()).toBe(
      '2026-01-31T00:00:00.000Z',
    );
  });

  it('clamps to now when the eligibility date has already elapsed', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const lastRefill = new Date('2026-01-01T00:00:00.000Z');
    // eligibility (2026-01-31) is in the past relative to now, so report now
    expect(getNextRefillDate(lastRefill, 30, 'days', now)).toBe(now);
  });

  it('returns now when eligibility exactly equals now', () => {
    const lastRefill = new Date('2026-01-01T00:00:00.000Z');
    const now = getRefillEligibilityDate(lastRefill, 30, 'days');
    expect(getNextRefillDate(lastRefill, 30, 'days', now).getTime()).toBe(now.getTime());
  });
});
