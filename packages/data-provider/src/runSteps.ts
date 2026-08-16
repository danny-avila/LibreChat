/**
 * The timestamp pair these helpers derive from.
 *
 * Both stamps are optional here even though `closed_at` is required on
 * `Agents.RunStepClosedEvent`, because not every caller holds a well-typed
 * event: the Redis replay branch reconstructs closures from persisted JSON and
 * legitimately has nothing stronger than "might be a number". Widening the
 * parameter rather than making callers assert keeps the guards below as the
 * single place that decides what is trustworthy — an assertion at a call site
 * would move that decision somewhere it cannot be enforced.
 */
export interface RunStepTimestamps {
  created_at?: number;
  closed_at?: number;
}

/**
 * Below this, a duration is noise rather than information: sub-second tool
 * calls are the common case, and labelling every one of them `· 0.3s` adds a
 * moving number to the end of most cards without telling the reader anything
 * they could act on. Callers use {@link isReportableRunStepDuration} rather
 * than comparing against this directly.
 */
export const MIN_REPORTABLE_RUN_STEP_DURATION_MS = 1000;

/**
 * Wall-clock duration of a run step, derived from the terminal
 * `on_run_step_closed` event.
 *
 * Returns `undefined` rather than a fallback whenever the value would be a
 * guess, because a wrong duration is worse than an absent one — an absent one
 * renders nothing, a wrong one is indistinguishable from a real measurement:
 *
 * - `created_at` is optional on the event; emitters that do not know when the
 *   step opened cannot have their duration inferred from anything else.
 * - A negative result means the two timestamps came from clocks that disagree.
 *   That is not hypothetical: since `@librechat/agents` v3.6.0 a step can be
 *   opened in one process and closed in another after a checkpoint resume, so
 *   the two stamps can legitimately originate on different machines.
 * - Non-finite input is treated as absent instead of propagating `NaN` into
 *   rendering.
 */
export function getRunStepDurationMs(closed: RunStepTimestamps): number | undefined {
  const { created_at: createdAt, closed_at: closedAt } = closed;
  if (typeof createdAt !== 'number' || typeof closedAt !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(createdAt) || !Number.isFinite(closedAt)) {
    return undefined;
  }
  const durationMs = closedAt - createdAt;
  return durationMs >= 0 ? durationMs : undefined;
}

/** Whether a derived duration is worth showing to the reader. */
export function isReportableRunStepDuration(durationMs?: number): durationMs is number {
  return typeof durationMs === 'number' && durationMs >= MIN_REPORTABLE_RUN_STEP_DURATION_MS;
}

/**
 * Convenience for the three sites that stamp a closure onto a content part
 * (live SSE, server-side aggregation, and Redis replay reconstruction): the
 * value to persist, or `undefined` when nothing should be written.
 */
export function getReportableRunStepDurationMs(closed: RunStepTimestamps): number | undefined {
  const durationMs = getRunStepDurationMs(closed);
  return isReportableRunStepDuration(durationMs) ? durationMs : undefined;
}
