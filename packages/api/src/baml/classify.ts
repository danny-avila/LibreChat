/**
 * Pure error classification for the BAML worker boundary.
 *
 * Native-free by construction: no `@boundaryml/baml-bridge`, no
 * `node:worker_threads`. `worker.mts` is the only production caller, and it runs
 * inside a single-use worker thread behind a `parentPort` guard — this module
 * exists so the classification rules themselves stay reachable and testable
 * outside that thread.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return isRecord(error) && typeof error.message === 'string' ? error.message : String(error);
};

export const classNameOf = (error: unknown): string =>
  isRecord(error) && typeof error.className === 'string' ? error.className : '';

/**
 * `baml.errors.LlmClient` straddles the line: it covers both a genuinely failed
 * request AND a request that succeeded but whose body did not match the return
 * type. The second is the model writing something unparseable — a per-turn
 * failure, not a transport fault — and rejecting for it would take down a turn
 * the contract says should surface as a value. The class name alone cannot
 * separate them, so the coercion shape is matched.
 */
const TRANSPORT_CLASSES = new Set([
  'baml.errors.Io',
  'baml.errors.LlmClient',
  'baml.errors.Timeout',
]);

/**
 * Retry exhaustion arrives as `baml.errors.DevOther` — the orchestrator's own
 * catch-all — rather than as the underlying `LlmClient` error, so the class name
 * alone would misfile a provider outage as a model failure. The orchestrator's
 * message is the discriminator, matched as a literal substring: no `RegExp` is
 * ever constructed from runtime text here.
 */
const ORCHESTRATION_EXHAUSTED = 'All orchestration steps failed';

/**
 * A literal, fixed test, never a constructed one: building a `RegExp` from a
 * client name or error message would let adversarial content (for example a
 * client name of `[`) make the classifier itself throw. `RegExp#test` only
 * matches DATA against this fixed pattern, so no input can affect what pattern
 * is evaluated.
 */
const COERCION_FAILURE = /Expected .+, got /;

export const isAbort = (error: unknown, contextAborted: boolean): boolean => {
  if (contextAborted) {
    return true;
  }
  const name = error instanceof Error ? error.name : '';
  return name === 'AbortError' || classNameOf(error).includes('Cancelled');
};

export const isParseFailure = (error: unknown): boolean => COERCION_FAILURE.test(messageOf(error));

export const isTransport = (error: unknown): boolean => {
  if (isParseFailure(error)) {
    return false;
  }
  return (
    TRANSPORT_CLASSES.has(classNameOf(error)) || messageOf(error).includes(ORCHESTRATION_EXHAUSTED)
  );
};
