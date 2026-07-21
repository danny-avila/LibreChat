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

/** Approximate minimum minutes between occurrences, for the admin interval floor. */
export function cadenceIntervalMinutes(cadence: TScheduleCadence): number {
  if (cadence.frequency === 'hourly') {
    return 60;
  }
  if (cadence.frequency === 'daily') {
    return 24 * 60;
  }
  if (cadence.frequency === 'weekdays') {
    return 24 * 60;
  }
  const dayCount = cadence.daysOfWeek?.length ?? 1;
  return Math.floor((7 * 24 * 60) / Math.max(1, dayCount));
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
  const cron = new Cron(cadenceToCron(params.cadence), {
    timezone: params.timezone,
    paused: true,
  });
  const base = params.after ?? new Date();
  const next = cron.nextRun(base);
  if (next == null) {
    return null;
  }
  const jitter = params.disableJitter === true ? 0 : scheduleJitterMs(params.scheduleId);
  return new Date(next.getTime() + jitter);
}
