import { CRON_PRESETS, describeCronExpression } from '../cronPresets';

describe('describeCronExpression', () => {
  it.each(CRON_PRESETS.map((p) => [p.value, p.label] as const))(
    'returns the canonical label for preset %s',
    (value, label) => {
      expect(describeCronExpression(value)).toBe(label);
    },
  );

  it('describes "every minute" patterns', () => {
    expect(describeCronExpression('*/30 * * * *')).toBe('Every 30 minutes');
  });

  it('describes daily-at-time patterns', () => {
    expect(describeCronExpression('15 14 * * *')).toBe('Daily at 14:15');
  });

  it('returns null for an unrecognized 5-field pattern', () => {
    expect(describeCronExpression('0 9 * * 1-3')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(describeCronExpression('not-a-cron')).toBeNull();
    expect(describeCronExpression('0 9 *')).toBeNull();
  });
});
