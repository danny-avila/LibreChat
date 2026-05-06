import { getNextRefillDate } from '../utils';

describe('getNextRefillDate', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T17:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the eligibility date after the last refill without skipping elapsed intervals', () => {
    const lastRefill = new Date('2026-05-05T16:00:00.000Z');

    expect(getNextRefillDate(lastRefill, 1, 'days')).toEqual(
      new Date('2026-05-06T16:00:00.000Z'),
    );
  });

  it('supports month-based refill intervals', () => {
    const lastRefill = new Date('2026-01-15T12:30:00.000Z');

    expect(getNextRefillDate(lastRefill, 2, 'months')).toEqual(
      new Date('2026-03-15T12:30:00.000Z'),
    );
  });
});
