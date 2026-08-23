import type { TScheduleCadence } from 'librechat-data-provider';
import { describeCadence, formatRunInstant } from '../cadence';

const localize = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key;

describe('describeCadence', () => {
  it('shows a cron cadence as the expression the user typed', () => {
    // Deliberately not translated into prose: a five-field expression can say things
    // no sentence template covers, and a wrong summary of a cadence the user wrote
    // themselves is worse than the expression they already understand.
    const cadence: TScheduleCadence = { frequency: 'cron', expression: '0 9,17 * * 1-5' };
    expect(describeCadence(cadence, localize, 'en-US')).toBe(
      'com_ui_schedule_runs_cron {"expression":"0 9,17 * * 1-5"}',
    );
  });

  it('still describes the structured cadences in prose', () => {
    expect(
      describeCadence({ frequency: 'daily', hour: 9, minute: 0 }, localize, 'en-US'),
    ).toContain('com_ui_schedule_runs_daily');
    expect(
      describeCadence({ frequency: 'hourly', hour: 0, minute: 5 }, localize, 'en-US'),
    ).toContain('"minute":"05"');
  });
});

describe('formatRunInstant', () => {
  it('renders a previewed occurrence in the schedule timezone, not the browser one', () => {
    const instant = new Date('2026-01-15T21:05:00Z');
    expect(formatRunInstant(instant, 'UTC', 'en-US')).toMatch(/9:05\s*PM/i);
    // Five hours behind UTC in January, so the same instant is a different clock time.
    expect(formatRunInstant(instant, 'America/New_York', 'en-US')).toMatch(/4:05\s*PM/i);
  });
});
