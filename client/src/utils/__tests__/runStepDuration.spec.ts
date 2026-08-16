import { getRunStepDurationLabels } from '../runStepDuration';

describe('getRunStepDurationLabels', () => {
  describe('under ten seconds', () => {
    it('keeps one decimal, where the tenth still distinguishes two durations', () => {
      expect(getRunStepDurationLabels(1400)).toMatchObject({
        key: 'com_ui_duration_seconds',
        values: { 0: 1.4 },
      });
    });

    it('drops a trailing zero rather than rendering "1.0s"', () => {
      expect(getRunStepDurationLabels(1000).values).toEqual({ 0: 1 });
    });

    it('announces the singular form only for exactly one second', () => {
      expect(getRunStepDurationLabels(1000).announcedKey).toBe(
        'com_ui_duration_announced_seconds_one',
      );
      expect(getRunStepDurationLabels(1400).announcedKey).toBe('com_ui_duration_announced_seconds');
    });
  });

  describe('ten seconds to a minute', () => {
    it('rounds to whole seconds, where the tenth is only jitter', () => {
      expect(getRunStepDurationLabels(12_400)).toMatchObject({
        key: 'com_ui_duration_seconds',
        values: { 0: 12 },
      });
      expect(getRunStepDurationLabels(12_600).values).toEqual({ 0: 13 });
    });
  });

  describe('a minute and over', () => {
    it('splits into minutes and seconds', () => {
      expect(getRunStepDurationLabels(65_000)).toMatchObject({
        key: 'com_ui_duration_minutes',
        values: { 0: 1, 1: 5 },
      });
      expect(getRunStepDurationLabels(723_000).values).toEqual({ 0: 12, 1: 3 });
    });

    it('renders an exact minute without a stray remainder', () => {
      expect(getRunStepDurationLabels(60_000).values).toEqual({ 0: 1, 1: 0 });
    });

    /** Branching on the raw seconds would render the nonsensical `60s`. */
    it('promotes a value that rounds up to a full minute', () => {
      expect(getRunStepDurationLabels(59_600)).toMatchObject({
        key: 'com_ui_duration_minutes',
        values: { 0: 1, 1: 0 },
      });
    });

    it('announces whole minutes, leaving the precise value on the button', () => {
      expect(getRunStepDurationLabels(65_000)).toMatchObject({
        announcedKey: 'com_ui_duration_announced_minutes_one',
        announcedValues: { count: 1 },
      });
      expect(getRunStepDurationLabels(150_000)).toMatchObject({
        announcedKey: 'com_ui_duration_announced_minutes',
        announcedValues: { count: 3 },
      });
    });
  });
});
