import { Cron } from 'croner';
import type { TScheduleCadence } from 'librechat-data-provider';

export const SCHEDULE_JITTER_WINDOW_MS = 120_000;

const WEEKLY_DEFAULT_DAY = 1;

/**
 * Compiles a structured cadence to a 5-field cron expression. The cadence
 * object stays canonical (UI-native, no cron round-tripping); cron exists only
 * as croner's input.
 */
export function cadenceToCron(cadence: TScheduleCadence): string {
  const { frequency, hour, minute } = cadence;
  if (frequency === 'hourly') {
    return `${minute} * * * *`;
  }
  if (frequency === 'daily') {
    return `${minute} ${hour} * * *`;
  }
  if (frequency === 'weekdays') {
    return `${minute} ${hour} * * 1-5`;
  }
  const days = cadence.daysOfWeek?.length ? cadence.daysOfWeek : [WEEKLY_DEFAULT_DAY];
  return `${minute} ${hour} * * ${[...days].sort((a, b) => a - b).join(',')}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Minimum minutes between occurrences, for the admin interval floor. */
export function cadenceIntervalMinutes(cadence: TScheduleCadence): number {
  if (cadence.frequency === 'hourly') {
    return 60;
  }
  if (cadence.frequency === 'daily' || cadence.frequency === 'weekdays') {
    return 24 * 60;
  }
  const days = cadence.daysOfWeek?.length ? [...cadence.daysOfWeek] : [WEEKLY_DEFAULT_DAY];
  if (days.length <= 1) {
    return 7 * 24 * 60;
  }
  // The interval floor must reflect the SHORTEST gap between selected days
  // (incl. the week wrap-around), not the average — e.g. [Mon, Tue] fires 24h
  // apart, so it must be rejected against a >1440-minute floor.
  const sorted = [...days].sort((a, b) => a - b);
  let minGapDays = 7;
  for (let i = 0; i < sorted.length; i++) {
    const gap = i + 1 < sorted.length ? sorted[i + 1] - sorted[i] : 7 - sorted[i] + sorted[0];
    minGapDays = Math.min(minGapDays, gap);
  }
  return minGapDays * 24 * 60;
}

/**
 * Deterministic per-schedule jitter so fleet-wide fire spikes (everyone at
 * 9:00) spread across a window while each schedule's displayed next-run time
 * stays stable across recomputations.
 */
export function scheduleJitterMs(
  scheduleId: string,
  windowMs: number = SCHEDULE_JITTER_WINDOW_MS,
): number {
  let hash = 5381;
  for (let i = 0; i < scheduleId.length; i++) {
    hash = ((hash << 5) + hash + scheduleId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % windowMs;
}

export interface ComputeNextRunParams {
  cadence: TScheduleCadence;
  timezone: string;
  scheduleId: string;
  /** Occurrences at or before this instant are skipped (misfire skip-forward). */
  after?: Date;
  disableJitter?: boolean;
}

/**
 * Next fire instant strictly after `after` (default now), jitter applied.
 * DST semantics are croner's behavior (locked by cadence.spec.ts): a
 * spring-forward gap occurrence fires shifted to the first valid instant
 * (02:30 → 03:30); fall-back ambiguity fires the first occurrence only.
 */
export function computeNextRunAt(params: ComputeNextRunParams): Date | null {
  // A malformed stored schedule (e.g. an invalid timezone inserted before
  // validation or by an admin script) makes croner throw at construction. Treat
  // an uncomputable next run as null — the same signal as "no future occurrence"
  // — so the engine disables it (`invalid_schedule`) rather than throwing out of
  // a tick every time the lease expires and starving other due schedules.
  try {
    const cron = new Cron(cadenceToCron(params.cadence), {
      timezone: params.timezone,
      paused: true,
    });
    const base = params.after ?? new Date();
    const jitter = params.disableJitter === true ? 0 : scheduleJitterMs(params.scheduleId);
    // The jittered instant is `cronOccurrence + jitter`. To return the first one
    // strictly after `base`, find the first cron occurrence after `base - jitter`
    // (occurrence O > base - jitter ⇒ O + jitter > base). Querying from `base`
    // directly would skip an occurrence whose jittered time is still in the future
    // but whose unjittered time already passed (e.g. an hourly :00 created at
    // 12:00:30 with 90s jitter must fire at 12:01:30, not 13:01:30).
    const next = cron.nextRun(new Date(base.getTime() - jitter));
    if (next == null) {
      return null;
    }
    return new Date(next.getTime() + jitter);
  } catch {
    return null;
  }
}
