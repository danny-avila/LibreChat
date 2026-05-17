import { isValidTimezone, resolveDateTriggerMillis } from '../timezone';

describe('isValidTimezone', () => {
  it.each(['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/Paris', 'Australia/Sydney'])(
    'accepts %s',
    (tz) => {
      expect(isValidTimezone(tz)).toBe(true);
    },
  );

  it.each(['', 'Not/A_Zone', 'PST8PDT/whatever', 'random text'])('rejects %s', (tz) => {
    expect(isValidTimezone(tz)).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});

describe('resolveDateTriggerMillis', () => {
  it('respects an explicit timezone offset in the expression', () => {
    const ts = resolveDateTriggerMillis('2026-06-01T12:00:00Z');
    expect(ts).toBe(Date.UTC(2026, 5, 1, 12, 0, 0));
  });

  it('parses a wall-clock string in the supplied timezone (winter, no DST)', () => {
    // 2026-01-15 09:00 in New York = 14:00 UTC (EST, UTC-5).
    const ts = resolveDateTriggerMillis('2026-01-15T09:00:00', 'America/New_York');
    expect(ts).toBe(Date.UTC(2026, 0, 15, 14, 0, 0));
  });

  it('parses a wall-clock string in the supplied timezone (summer, DST)', () => {
    // 2026-07-15 09:00 in New York = 13:00 UTC (EDT, UTC-4).
    const ts = resolveDateTriggerMillis('2026-07-15T09:00:00', 'America/New_York');
    expect(ts).toBe(Date.UTC(2026, 6, 15, 13, 0, 0));
  });

  it('handles half-hour offsets (IST = UTC+5:30)', () => {
    const ts = resolveDateTriggerMillis('2026-03-10T18:30:00', 'Asia/Kolkata');
    expect(ts).toBe(Date.UTC(2026, 2, 10, 13, 0, 0));
  });

  it('falls back to UTC when no timezone is provided and expression is naive', () => {
    const ts = resolveDateTriggerMillis('2026-03-10T18:30:00');
    expect(ts).toBe(Date.UTC(2026, 2, 10, 18, 30, 0));
  });

  it('throws on a malformed expression', () => {
    expect(() => resolveDateTriggerMillis('not-a-date', 'UTC')).toThrow(/Invalid date expression/);
  });
});
