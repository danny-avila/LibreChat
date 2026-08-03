const { ViolationTypes } = require('librechat-data-provider');

/**
 * Whether an error is the balance middleware's structured refusal
 * (`checkBalance` throws `JSON.stringify({ type: 'token_balance', ... })`). A
 * scheduled run failing on the OWNER's credits is not the schedule's fault: it
 * must settle as `skipped_balance` (walking the insufficient_balance streak)
 * rather than `error` (walking too_many_failures).
 */
function isBalanceViolationError(error) {
  const message = error?.message;
  if (typeof message !== 'string' || !message.startsWith('{')) {
    return false;
  }
  try {
    return JSON.parse(message)?.type === ViolationTypes.TOKEN_BALANCE;
  } catch {
    return false;
  }
}

/**
 * Maps an error the client SWALLOWED into an error content part (`completionError` on a
 * fresh run, `resumeError` on a continuation) to the schedule outcome that fire must
 * settle as. Both paths deliberately finalize instead of throwing so the interactive UX
 * shows the error in the message — which left the scheduled bookkeeping recording
 * `success` for a run that produced nothing but an error, resetting the
 * consecutive-failure streak so `autoDisableAfterFailures` never tripped and the
 * schedule retried on its cadence forever.
 */
function classifyScheduleOutcome(error, fallbackMessage) {
  if (error == null) {
    return { status: 'success' };
  }
  if (isBalanceViolationError(error)) {
    return { status: 'skipped_balance' };
  }
  return { status: 'error', error: error.message ?? fallbackMessage };
}

module.exports = { isBalanceViolationError, classifyScheduleOutcome };
