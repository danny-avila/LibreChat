const { ViolationTypes } = require('librechat-data-provider');
const { classifyScheduleOutcome, isBalanceViolationError } = require('./errors');

/**
 * Both agent clients SWALLOW a failed generation into an error content part instead of
 * throwing, so the interactive UX can finalize with the error visible. That left the
 * scheduled bookkeeping recording `success` for runs that produced nothing but an
 * error: the consecutive-failure streak reset every time, `autoDisableAfterFailures`
 * never tripped, and a schedule failing on every provider call retried on its cadence
 * forever.
 */
describe('classifyScheduleOutcome', () => {
  const balanceError = new Error(
    JSON.stringify({ type: ViolationTypes.TOKEN_BALANCE, balance: 0, tokenCost: 10 }),
  );

  it('records success when the run swallowed nothing', () => {
    expect(classifyScheduleOutcome(null, 'fallback')).toEqual({ status: 'success' });
    expect(classifyScheduleOutcome(undefined, 'fallback')).toEqual({ status: 'success' });
  });

  it('routes a balance refusal to the insufficient_balance streak, not the failure streak', () => {
    expect(isBalanceViolationError(balanceError)).toBe(true);
    expect(classifyScheduleOutcome(balanceError, 'fallback')).toEqual({
      status: 'skipped_balance',
    });
  });

  it('records every other swallowed failure as an error, carrying its message', () => {
    expect(classifyScheduleOutcome(new Error('upstream 503'), 'fallback')).toEqual({
      status: 'error',
      error: 'upstream 503',
    });
  });

  it('falls back when the error carries no message', () => {
    expect(classifyScheduleOutcome({}, 'Run ended in error')).toEqual({
      status: 'error',
      error: 'Run ended in error',
    });
  });
});
