const { getNextCronRun, assertValidCron } = require('./cron');

describe('getNextCronRun', () => {
  it('returns the next daily occurrence in UTC', () => {
    const from = new Date('2026-06-24T08:00:00Z');
    expect(getNextCronRun('0 9 * * *', from, 'UTC').toISOString()).toBe('2026-06-24T09:00:00.000Z');
  });

  it('rolls to the next day when the time has passed', () => {
    const from = new Date('2026-06-24T10:00:00Z');
    expect(getNextCronRun('0 9 * * *', from, 'UTC').toISOString()).toBe('2026-06-25T09:00:00.000Z');
  });

  it('honors a timezone with DST (8:30 weekdays in New York)', () => {
    const from = new Date('2026-06-26T20:00:00Z'); // Friday
    // Next weekday is Monday 2026-06-29; 08:30 EDT = 12:30Z
    expect(getNextCronRun('30 8 * * 1-5', from, 'America/New_York').toISOString()).toBe(
      '2026-06-29T12:30:00.000Z',
    );
  });

  it('supports step values', () => {
    const from = new Date('2026-06-24T08:07:00Z');
    expect(getNextCronRun('*/15 * * * *', from, 'UTC').toISOString()).toBe(
      '2026-06-24T08:15:00.000Z',
    );
  });

  it('ORs day-of-month and day-of-week when both are restricted', () => {
    // 1st of the month OR any Monday, at 00:00
    const from = new Date('2026-06-24T00:00:00Z'); // Wed
    // Next match is Monday 2026-06-29
    expect(getNextCronRun('0 0 1 * 1', from, 'UTC').toISOString()).toBe('2026-06-29T00:00:00.000Z');
  });

  it('throws on malformed expressions', () => {
    expect(() => assertValidCron('bad')).toThrow();
    expect(() => assertValidCron('0 9 * *')).toThrow();
  });
});
