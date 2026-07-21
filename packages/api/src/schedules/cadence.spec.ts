import type { TScheduleCadence } from 'librechat-data-provider';
import {
  cadenceToCron,
  computeNextRunAt,
  isValidTimezone,
  scheduleJitterMs,
  cadenceIntervalMinutes,
  SCHEDULE_JITTER_WINDOW_MS,
} from './cadence';

const NEW_YORK = 'America/New_York';

function cadence(overrides: Partial<TScheduleCadence>): TScheduleCadence {
  return { frequency: 'daily', hour: 0, minute: 0, ...overrides };
}

function wallClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')} ${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function nextRun(params: {
  cadence: TScheduleCadence;
  timezone: string;
  after: Date;
  scheduleId?: string;
}): Date {
  const result = computeNextRunAt({
    cadence: params.cadence,
    timezone: params.timezone,
    scheduleId: params.scheduleId ?? 'sched-test',
    after: params.after,
    disableJitter: true,
  });
  if (result == null) {
    throw new Error('expected computeNextRunAt to return a Date');
  }
  return result;
}

describe('cadenceToCron', () => {
  it('maps hourly to a minute-only pattern', () => {
    expect(cadenceToCron(cadence({ frequency: 'hourly', minute: 15 }))).toBe('15 * * * *');
  });

  it('maps daily to minute + hour', () => {
    expect(cadenceToCron(cadence({ frequency: 'daily', hour: 8, minute: 0 }))).toBe('0 8 * * *');
  });

  it('maps weekdays to Monday through Friday', () => {
    expect(cadenceToCron(cadence({ frequency: 'weekdays', hour: 9, minute: 30 }))).toBe(
      '30 9 * * 1-5',
    );
  });

  it('maps weekly multi-day with days sorted ascending', () => {
    expect(
      cadenceToCron(cadence({ frequency: 'weekly', hour: 7, minute: 45, daysOfWeek: [5, 1, 3] })),
    ).toBe('45 7 * * 1,3,5');
  });

  it('defaults weekly to Monday when daysOfWeek is missing or empty', () => {
    expect(cadenceToCron(cadence({ frequency: 'weekly', hour: 7, minute: 45 }))).toBe('45 7 * * 1');
    expect(
      cadenceToCron(cadence({ frequency: 'weekly', hour: 7, minute: 45, daysOfWeek: [] })),
    ).toBe('45 7 * * 1');
  });
});

describe('computeNextRunAt', () => {
  const daily8amNewYork = {
    cadence: cadence({ frequency: 'daily', hour: 8, minute: 0 }),
    timezone: NEW_YORK,
  };

  it('fires later the same day when the occurrence is still ahead', () => {
    const next = nextRun({ ...daily8amNewYork, after: new Date('2026-07-15T09:00:00Z') });
    expect(wallClock(next, NEW_YORK)).toBe('Wed 2026-07-15 08:00');
    expect(next.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('rolls to the next day once the occurrence has passed', () => {
    const next = nextRun({ ...daily8amNewYork, after: new Date('2026-07-15T13:00:00Z') });
    expect(wallClock(next, NEW_YORK)).toBe('Thu 2026-07-16 08:00');
    expect(next.toISOString()).toBe('2026-07-16T12:00:00.000Z');
  });

  it('skips an occurrence exactly at `after` (strictly-after semantics)', () => {
    const next = nextRun({ ...daily8amNewYork, after: new Date('2026-07-15T12:00:00Z') });
    expect(wallClock(next, NEW_YORK)).toBe('Thu 2026-07-16 08:00');
  });

  describe('DST spring-forward (US 2026-03-08)', () => {
    const daily230amNewYork = {
      cadence: cadence({ frequency: 'daily', hour: 2, minute: 30 }),
      timezone: NEW_YORK,
    };

    it('fires the gap occurrence shifted to 03:30 EDT rather than dropping March 8', () => {
      const next = nextRun({ ...daily230amNewYork, after: new Date('2026-03-07T17:00:00Z') });
      expect(next.toISOString()).toBe('2026-03-08T07:30:00.000Z');
      expect(wallClock(next, NEW_YORK)).toBe('Sun 2026-03-08 03:30');
    });

    it('resumes at 02:30 EDT on March 9 after the gap occurrence', () => {
      const march8 = nextRun({ ...daily230amNewYork, after: new Date('2026-03-07T17:00:00Z') });
      const next = nextRun({ ...daily230amNewYork, after: march8 });
      expect(next.toISOString()).toBe('2026-03-09T06:30:00.000Z');
      expect(wallClock(next, NEW_YORK)).toBe('Mon 2026-03-09 02:30');
    });
  });

  describe('DST fall-back (US 2026-11-01)', () => {
    it('fires the repeated 01:30 exactly once, at the first (EDT) occurrence', () => {
      const daily130amNewYork = {
        cadence: cadence({ frequency: 'daily', hour: 1, minute: 30 }),
        timezone: NEW_YORK,
      };
      const runs: Date[] = [];
      let after = new Date('2026-10-31T16:00:00Z');
      for (let i = 0; i < 3; i++) {
        const next = nextRun({ ...daily130amNewYork, after });
        runs.push(next);
        after = next;
      }
      expect(runs.map((run) => run.toISOString())).toEqual([
        '2026-11-01T05:30:00.000Z',
        '2026-11-02T06:30:00.000Z',
        '2026-11-03T06:30:00.000Z',
      ]);
      expect(runs.map((run) => wallClock(run, NEW_YORK))).toEqual([
        'Sun 2026-11-01 01:30',
        'Mon 2026-11-02 01:30',
        'Tue 2026-11-03 01:30',
      ]);
    });
  });

  it('weekdays cadence skips weekends', () => {
    const weekdays9amNewYork = {
      cadence: cadence({ frequency: 'weekdays', hour: 9, minute: 0 }),
      timezone: NEW_YORK,
    };
    const fromFriday = nextRun({ ...weekdays9amNewYork, after: new Date('2026-07-17T15:00:00Z') });
    expect(wallClock(fromFriday, NEW_YORK)).toBe('Mon 2026-07-20 09:00');
    const fromSaturday = nextRun({
      ...weekdays9amNewYork,
      after: new Date('2026-07-18T12:00:00Z'),
    });
    expect(wallClock(fromSaturday, NEW_YORK)).toBe('Mon 2026-07-20 09:00');
  });

  it('hourly cadence fires at the next :MM', () => {
    const hourly45 = { cadence: cadence({ frequency: 'hourly', minute: 45 }), timezone: 'UTC' };
    expect(nextRun({ ...hourly45, after: new Date('2026-07-15T10:30:00Z') }).toISOString()).toBe(
      '2026-07-15T10:45:00.000Z',
    );
    expect(nextRun({ ...hourly45, after: new Date('2026-07-15T10:50:00Z') }).toISOString()).toBe(
      '2026-07-15T11:45:00.000Z',
    );
    expect(nextRun({ ...hourly45, after: new Date('2026-07-15T10:45:00Z') }).toISOString()).toBe(
      '2026-07-15T11:45:00.000Z',
    );
  });

  it('weekly multi-day cadence fires only on the configured days', () => {
    const weekly = {
      cadence: cadence({ frequency: 'weekly', hour: 10, minute: 0, daysOfWeek: [3, 6] }),
      timezone: 'UTC',
    };
    const first = nextRun({ ...weekly, after: new Date('2026-07-16T00:00:00Z') });
    const second = nextRun({ ...weekly, after: first });
    const third = nextRun({ ...weekly, after: second });
    expect([first, second, third].map((run) => run.toISOString())).toEqual([
      '2026-07-18T10:00:00.000Z',
      '2026-07-22T10:00:00.000Z',
      '2026-07-25T10:00:00.000Z',
    ]);
    expect([first, second, third].map((run) => wallClock(run, 'UTC').slice(0, 3))).toEqual([
      'Sat',
      'Wed',
      'Sat',
    ]);
  });
});

describe('jitter', () => {
  it('is deterministic for the same schedule id', () => {
    expect(scheduleJitterMs('sched-abc')).toBe(scheduleJitterMs('sched-abc'));
  });

  it('stays within the jitter window', () => {
    for (let i = 0; i < 100; i++) {
      const value = scheduleJitterMs(`schedule-${i}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(SCHEDULE_JITTER_WINDOW_MS);
    }
  });

  it('respects a custom window', () => {
    for (let i = 0; i < 20; i++) {
      const value = scheduleJitterMs(`schedule-${i}`, 1000);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1000);
    }
  });

  it('spreads different ids across the window', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => scheduleJitterMs(`schedule-${i}`)));
    expect(values.size).toBeGreaterThan(40);
  });

  it('computeNextRunAt offsets the cron instant by the schedule jitter', () => {
    const params = {
      cadence: cadence({ frequency: 'daily', hour: 8, minute: 0 }),
      timezone: NEW_YORK,
      scheduleId: 'sched-jitter',
      after: new Date('2026-07-15T09:00:00Z'),
    };
    const jittered = computeNextRunAt(params);
    const bare = computeNextRunAt({ ...params, disableJitter: true });
    expect(jittered).not.toBeNull();
    expect(bare).not.toBeNull();
    expect((jittered?.getTime() ?? 0) - (bare?.getTime() ?? 0)).toBe(
      scheduleJitterMs('sched-jitter'),
    );
  });
});

describe('isValidTimezone', () => {
  it('accepts IANA zone names', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Europe/Stockholm')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects invalid zones', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('EST5EDT-Bogus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('cadenceIntervalMinutes', () => {
  it('returns the minimum minutes between occurrences per frequency', () => {
    expect(cadenceIntervalMinutes(cadence({ frequency: 'hourly' }))).toBe(60);
    expect(cadenceIntervalMinutes(cadence({ frequency: 'daily' }))).toBe(24 * 60);
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekdays' }))).toBe(24 * 60);
  });

  it('uses the shortest gap between weekly days, incl. the week wrap-around', () => {
    // single day → full week
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekly' }))).toBe(7 * 24 * 60);
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekly', daysOfWeek: [3] }))).toBe(
      7 * 24 * 60,
    );
    // adjacent days fire 24h apart — the floor must reflect that, not the average
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekly', daysOfWeek: [1, 2] }))).toBe(
      24 * 60,
    );
    // evenly spaced Mon/Wed/Fri → 2-day min gap
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekly', daysOfWeek: [1, 3, 5] }))).toBe(
      2 * 24 * 60,
    );
    // wrap-around: Sun + Sat are 1 day apart across the week boundary
    expect(cadenceIntervalMinutes(cadence({ frequency: 'weekly', daysOfWeek: [0, 6] }))).toBe(
      24 * 60,
    );
  });
});
