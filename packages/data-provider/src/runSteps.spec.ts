import {
  getRunStepDurationMs,
  isReportableRunStepDuration,
  getReportableRunStepDurationMs,
  MIN_REPORTABLE_RUN_STEP_DURATION_MS,
} from './runSteps';

describe('getRunStepDurationMs', () => {
  it('returns the elapsed time between the two stamps', () => {
    expect(getRunStepDurationMs({ created_at: 1000, closed_at: 4500 })).toBe(3500);
  });

  it('returns 0 for a step that opened and closed on the same tick', () => {
    expect(getRunStepDurationMs({ created_at: 1000, closed_at: 1000 })).toBe(0);
  });

  it('returns undefined when the emitter did not report when the step opened', () => {
    expect(getRunStepDurationMs({ closed_at: 4500 })).toBeUndefined();
  });

  it('returns undefined when the closure carries no terminal stamp', () => {
    expect(getRunStepDurationMs({ created_at: 1000 })).toBeUndefined();
  });

  /**
   * Since `@librechat/agents` v3.6.0 a step can be opened in one process and
   * closed in another after a checkpoint resume, so the two stamps can come
   * from clocks that disagree. A negative elapsed time is the observable
   * symptom, and reporting it as a duration would be worse than reporting
   * nothing.
   */
  it('returns undefined when the clocks disagree rather than a negative duration', () => {
    expect(getRunStepDurationMs({ created_at: 4500, closed_at: 1000 })).toBeUndefined();
  });

  it('does not propagate non-finite input', () => {
    expect(getRunStepDurationMs({ created_at: NaN, closed_at: 4500 })).toBeUndefined();
    expect(getRunStepDurationMs({ created_at: 1000, closed_at: Infinity })).toBeUndefined();
  });

  it('ignores values that are not numbers', () => {
    expect(
      getRunStepDurationMs({ created_at: '1000' as unknown as number, closed_at: 4500 }),
    ).toBeUndefined();
  });
});

describe('isReportableRunStepDuration', () => {
  it('accepts a duration at the threshold', () => {
    expect(isReportableRunStepDuration(MIN_REPORTABLE_RUN_STEP_DURATION_MS)).toBe(true);
  });

  it('rejects sub-threshold durations, which are noise rather than information', () => {
    expect(isReportableRunStepDuration(MIN_REPORTABLE_RUN_STEP_DURATION_MS - 1)).toBe(false);
    expect(isReportableRunStepDuration(0)).toBe(false);
  });

  it('rejects an absent duration', () => {
    expect(isReportableRunStepDuration(undefined)).toBe(false);
  });
});

describe('getReportableRunStepDurationMs', () => {
  it('returns the duration when it is both derivable and worth showing', () => {
    expect(getReportableRunStepDurationMs({ created_at: 1000, closed_at: 4500 })).toBe(3500);
  });

  /** The distinction the callers rely on: absent means "not knowable or not
   *  worth reporting", never "instant". */
  it('returns undefined for a step too fast to be worth reporting', () => {
    expect(getReportableRunStepDurationMs({ created_at: 1000, closed_at: 1300 })).toBeUndefined();
  });

  it('returns undefined when the duration is not derivable at all', () => {
    expect(getReportableRunStepDurationMs({ closed_at: 4500 })).toBeUndefined();
  });
});
